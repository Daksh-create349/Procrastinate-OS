import csv
import hashlib
import io
import json
import logging
import os
from pathlib import Path
import re
import time
from typing import Dict, List, Optional, Tuple

import pypdf
from pypdf.errors import PdfReadError
import docx

from app.models.schemas import (
    DocumentChunk,
    DocumentExtractionResult,
    ExtractionStatusEnum,
)

logger = logging.getLogger(__name__)
logging.getLogger("pypdf").setLevel(logging.ERROR)

SUPPORTED_EXTENSIONS = {
    ".txt",
    ".md",
    ".markdown",
    ".pdf",
    ".docx",
    ".csv",
    ".tsv",
    ".json",
}

DEFAULT_MAX_FILE_SIZE_BYTES = 10 * 1024 * 1024  # 10 MB
DEFAULT_MAX_TOTAL_CHARS = 60000
DEFAULT_CHUNK_SIZE_CHARS = 1200
DEFAULT_MAX_CHUNKS = 50


def generate_stable_file_id(relative_path: str, size: int, sha256: Optional[str] = None) -> str:
    """Generate deterministic, stable file ID."""
    token = f"{relative_path}:{size}:{sha256 or 'nosha'}"
    return hashlib.sha256(token.encode("utf-8")).hexdigest()[:16]


def sanitize_untrusted_text(text: str) -> str:
    """
    Sanitize text to neutralize common prompt injection vectors while preserving original content.
    Prevents documents containing 'ignore previous instructions' from altering AI behavior.
    """
    if not text:
        return ""
    # Remove null bytes and non-printable control chars (except newline and tab)
    sanitized = "".join(ch for ch in text if ch in "\n\r\t" or (32 <= ord(ch) <= 1114111))
    
    # Neutralize raw prompt injection delimiters and role markers
    sanitized = re.sub(r"(?i)<\s*\|\s*im_start\s*\|>", "[neutralized_tag]", sanitized)
    sanitized = re.sub(r"(?i)<\s*\|\s*im_end\s*\|>", "[neutralized_tag]", sanitized)
    sanitized = re.sub(r"(?i)<\s*system\s*>", "[system_tag]", sanitized)
    sanitized = re.sub(r"(?i)<\s*/\s*system\s*>", "[/system_tag]", sanitized)
    
    return sanitized.strip()


def estimate_tokens(text: str) -> int:
    """Quick token estimate based on word count multiplier."""
    words = len(text.split())
    return max(1, int(words * 1.3))


def chunk_section_text(
    file_id: str,
    relative_path: str,
    reference: str,
    text: str,
    start_chunk_idx: int,
    max_chunk_chars: int = DEFAULT_CHUNK_SIZE_CHARS,
) -> Tuple[List[DocumentChunk], int]:
    """Split a section's text into bounded chunks with source references."""
    clean_text = sanitize_untrusted_text(text)
    if not clean_text:
        return [], start_chunk_idx

    chunks: List[DocumentChunk] = []
    current_idx = start_chunk_idx

    # If within chunk limit, create single chunk
    if len(clean_text) <= max_chunk_chars:
        chunk = DocumentChunk(
            chunk_id=f"{file_id}-chk-{current_idx}",
            file_id=file_id,
            relative_path=relative_path,
            reference=reference,
            text=clean_text,
            token_estimate=estimate_tokens(clean_text),
            char_count=len(clean_text),
        )
        return [chunk], current_idx + 1

    # Split into paragraphs or line blocks
    paragraphs = clean_text.split("\n\n")
    buffer = ""

    for p in paragraphs:
        p_clean = p.strip()
        if not p_clean:
            continue

        if len(buffer) + len(p_clean) + 2 > max_chunk_chars:
            if buffer:
                chunks.append(
                    DocumentChunk(
                        chunk_id=f"{file_id}-chk-{current_idx}",
                        file_id=file_id,
                        relative_path=relative_path,
                        reference=reference,
                        text=buffer.strip(),
                        token_estimate=estimate_tokens(buffer),
                        char_count=len(buffer.strip()),
                    )
                )
                current_idx += 1
                buffer = ""

            # If single paragraph is longer than max_chunk_chars, split by slices
            while len(p_clean) > max_chunk_chars:
                slice_text = p_clean[:max_chunk_chars]
                chunks.append(
                    DocumentChunk(
                        chunk_id=f"{file_id}-chk-{current_idx}",
                        file_id=file_id,
                        relative_path=relative_path,
                        reference=reference,
                        text=slice_text,
                        token_estimate=estimate_tokens(slice_text),
                        char_count=len(slice_text),
                    )
                )
                current_idx += 1
                p_clean = p_clean[max_chunk_chars:].strip()

            buffer = p_clean
        else:
            buffer = f"{buffer}\n\n{p_clean}" if buffer else p_clean

    if buffer:
        chunks.append(
            DocumentChunk(
                chunk_id=f"{file_id}-chk-{current_idx}",
                file_id=file_id,
                relative_path=relative_path,
                reference=reference,
                text=buffer.strip(),
                token_estimate=estimate_tokens(buffer),
                char_count=len(buffer.strip()),
            )
        )
        current_idx += 1

    return chunks, current_idx


class DocumentExtractor:
    @staticmethod
    def extract_document(
        filepath: str,
        relative_path: str,
        sha256: Optional[str] = None,
        max_file_size_bytes: int = DEFAULT_MAX_FILE_SIZE_BYTES,
        max_total_chars: int = DEFAULT_MAX_TOTAL_CHARS,
    ) -> DocumentExtractionResult:
        start_time = time.monotonic()
        path = Path(filepath)
        ext = path.suffix.lower()

        # Check existence
        if not path.exists():
            return DocumentExtractionResult(
                file_id=generate_stable_file_id(relative_path, 0, sha256),
                path=filepath,
                relative_path=relative_path,
                extension=ext,
                status=ExtractionStatusEnum.ERROR,
                error_message="File does not exist.",
                duration_seconds=round(time.monotonic() - start_time, 3),
            )

        # Check permissions
        if not os.access(path, os.R_OK):
            return DocumentExtractionResult(
                file_id=generate_stable_file_id(relative_path, 0, sha256),
                path=filepath,
                relative_path=relative_path,
                extension=ext,
                status=ExtractionStatusEnum.PERMISSION_DENIED,
                error_message="Permission denied reading file.",
                duration_seconds=round(time.monotonic() - start_time, 3),
            )

        file_size = path.stat().st_size
        file_id = generate_stable_file_id(relative_path, file_size, sha256)

        # 1. Empty file check
        if file_size == 0:
            return DocumentExtractionResult(
                file_id=file_id,
                path=filepath,
                relative_path=relative_path,
                extension=ext,
                status=ExtractionStatusEnum.EMPTY,
                error_message="File is empty (0 bytes).",
                duration_seconds=round(time.monotonic() - start_time, 3),
            )

        # 2. File size limit
        if file_size > max_file_size_bytes:
            return DocumentExtractionResult(
                file_id=file_id,
                path=filepath,
                relative_path=relative_path,
                extension=ext,
                status=ExtractionStatusEnum.SKIPPED_SIZE,
                error_message=f"File size {file_size} bytes exceeds limit of {max_file_size_bytes} bytes.",
                duration_seconds=round(time.monotonic() - start_time, 3),
            )

        # 3. Format Dispatch
        if ext not in SUPPORTED_EXTENSIONS:
            return DocumentExtractionResult(
                file_id=file_id,
                path=filepath,
                relative_path=relative_path,
                extension=ext,
                status=ExtractionStatusEnum.UNSUPPORTED,
                error_message=f"Extension '{ext}' is not supported for text extraction.",
                duration_seconds=round(time.monotonic() - start_time, 3),
            )

        try:
            if ext in [".txt"]:
                return DocumentExtractor._extract_txt(path, file_id, relative_path, max_total_chars, start_time)
            elif ext in [".md", ".markdown"]:
                return DocumentExtractor._extract_markdown(path, file_id, relative_path, max_total_chars, start_time)
            elif ext in [".pdf"]:
                return DocumentExtractor._extract_pdf(path, file_id, relative_path, max_total_chars, start_time)
            elif ext in [".docx"]:
                return DocumentExtractor._extract_docx(path, file_id, relative_path, max_total_chars, start_time)
            elif ext in [".csv", ".tsv"]:
                return DocumentExtractor._extract_csv(path, file_id, relative_path, ext, max_total_chars, start_time)
            elif ext in [".json"]:
                return DocumentExtractor._extract_json(path, file_id, relative_path, max_total_chars, start_time)
        except Exception as e:
            logger.warning(f"Unexpected extraction failure for {relative_path}: {e}")
            return DocumentExtractionResult(
                file_id=file_id,
                path=filepath,
                relative_path=relative_path,
                extension=ext,
                status=ExtractionStatusEnum.MALFORMED,
                error_message=f"Extraction error: {str(e)}",
                duration_seconds=round(time.monotonic() - start_time, 3),
            )

        return DocumentExtractionResult(
            file_id=file_id,
            path=filepath,
            relative_path=relative_path,
            extension=ext,
            status=ExtractionStatusEnum.UNSUPPORTED,
            error_message="Unsupported format.",
            duration_seconds=round(time.monotonic() - start_time, 3),
        )

    # --- TXT Extraction ---
    @staticmethod
    def _extract_txt(
        path: Path, file_id: str, relative_path: str, max_chars: int, start_time: float
    ) -> DocumentExtractionResult:
        encodings = ["utf-8", "latin-1", "cp1252", "ascii"]
        raw_text = None
        for enc in encodings:
            try:
                with open(path, "r", encoding=enc, errors="replace") as f:
                    raw_text = f.read(max_chars + 500)
                break
            except Exception:
                continue

        if not raw_text or not raw_text.strip():
            return DocumentExtractionResult(
                file_id=file_id,
                path=str(path),
                relative_path=relative_path,
                extension=path.suffix.lower(),
                status=ExtractionStatusEnum.EMPTY,
                error_message="Text file contains no printable content.",
                duration_seconds=round(time.monotonic() - start_time, 3),
            )

        bounded_text = raw_text[:max_chars]
        chunks, _ = chunk_section_text(file_id, relative_path, "Content", bounded_text, 1)

        return DocumentExtractionResult(
            file_id=file_id,
            path=str(path),
            relative_path=relative_path,
            extension=path.suffix.lower(),
            status=ExtractionStatusEnum.SUCCESS,
            total_chars=len(bounded_text),
            total_chunks=len(chunks),
            sections_count=1,
            chunks=chunks,
            duration_seconds=round(time.monotonic() - start_time, 3),
        )

    # --- Markdown Extraction ---
    @staticmethod
    def _extract_markdown(
        path: Path, file_id: str, relative_path: str, max_chars: int, start_time: float
    ) -> DocumentExtractionResult:
        try:
            with open(path, "r", encoding="utf-8", errors="replace") as f:
                content = f.read(max_chars + 500)
        except Exception as e:
            return DocumentExtractionResult(
                file_id=file_id,
                path=str(path),
                relative_path=relative_path,
                extension=path.suffix.lower(),
                status=ExtractionStatusEnum.MALFORMED,
                error_message=f"Cannot read markdown: {str(e)}",
                duration_seconds=round(time.monotonic() - start_time, 3),
            )

        if not content.strip():
            return DocumentExtractionResult(
                file_id=file_id,
                path=str(path),
                relative_path=relative_path,
                extension=path.suffix.lower(),
                status=ExtractionStatusEnum.EMPTY,
                error_message="Markdown file is empty.",
                duration_seconds=round(time.monotonic() - start_time, 3),
            )

        # Section parsing by markdown headers (# Header)
        lines = content[:max_chars].splitlines()
        sections: List[Tuple[str, List[str]]] = []
        current_header = "Preamble"
        current_lines: List[str] = []

        for line in lines:
            header_match = re.match(r"^(#{1,6})\s+(.*)$", line)
            if header_match:
                if current_lines:
                    sections.append((current_header, current_lines))
                    current_lines = []
                current_header = header_match.group(2).strip() or "Section"
            else:
                current_lines.append(line)

        if current_lines:
            sections.append((current_header, current_lines))

        all_chunks: List[DocumentChunk] = []
        chunk_idx = 1
        total_extracted_chars = 0

        for header, sec_lines in sections:
            sec_text = "\n".join(sec_lines).strip()
            if not sec_text:
                continue
            ref = f"Section: {header}"
            sec_chunks, chunk_idx = chunk_section_text(file_id, relative_path, ref, sec_text, chunk_idx)
            all_chunks.extend(sec_chunks)
            total_extracted_chars += sum(c.char_count for c in sec_chunks)
            if len(all_chunks) >= DEFAULT_MAX_CHUNKS:
                break

        return DocumentExtractionResult(
            file_id=file_id,
            path=str(path),
            relative_path=relative_path,
            extension=path.suffix.lower(),
            status=ExtractionStatusEnum.SUCCESS,
            total_chars=total_extracted_chars,
            total_chunks=len(all_chunks),
            sections_count=len(sections),
            chunks=all_chunks,
            duration_seconds=round(time.monotonic() - start_time, 3),
        )

    # --- PDF Extraction ---
    @staticmethod
    def _extract_pdf(
        path: Path, file_id: str, relative_path: str, max_chars: int, start_time: float
    ) -> DocumentExtractionResult:
        try:
            reader = pypdf.PdfReader(str(path))
        except PdfReadError as e:
            return DocumentExtractionResult(
                file_id=file_id,
                path=str(path),
                relative_path=relative_path,
                extension=path.suffix.lower(),
                status=ExtractionStatusEnum.MALFORMED,
                error_message=f"Malformed PDF document: {str(e)}",
                duration_seconds=round(time.monotonic() - start_time, 3),
            )
        except Exception as e:
            return DocumentExtractionResult(
                file_id=file_id,
                path=str(path),
                relative_path=relative_path,
                extension=path.suffix.lower(),
                status=ExtractionStatusEnum.MALFORMED,
                error_message=f"PDF parsing error: {str(e)}",
                duration_seconds=round(time.monotonic() - start_time, 3),
            )

        # Check encryption / password protection
        if reader.is_encrypted:
            return DocumentExtractionResult(
                file_id=file_id,
                path=str(path),
                relative_path=relative_path,
                extension=path.suffix.lower(),
                status=ExtractionStatusEnum.PASSWORD_PROTECTED,
                error_message="PDF is password-protected or encrypted.",
                duration_seconds=round(time.monotonic() - start_time, 3),
            )

        total_pages = len(reader.pages)
        if total_pages == 0:
            return DocumentExtractionResult(
                file_id=file_id,
                path=str(path),
                relative_path=relative_path,
                extension=path.suffix.lower(),
                status=ExtractionStatusEnum.EMPTY,
                error_message="PDF contains 0 pages.",
                duration_seconds=round(time.monotonic() - start_time, 3),
            )

        all_chunks: List[DocumentChunk] = []
        chunk_idx = 1
        total_extracted_chars = 0
        pages_with_text = 0

        for page_num in range(total_pages):
            try:
                page = reader.pages[page_num]
                page_text = page.extract_text() or ""
            except Exception as e:
                logger.warning(f"Failed to extract page {page_num + 1} of {relative_path}: {e}")
                continue

            clean_page = page_text.strip()
            if clean_page:
                pages_with_text += 1
                ref = f"Page {page_num + 1}"
                page_chunks, chunk_idx = chunk_section_text(
                    file_id, relative_path, ref, clean_page, chunk_idx
                )
                all_chunks.extend(page_chunks)
                total_extracted_chars += sum(c.char_count for c in page_chunks)

            if total_extracted_chars >= max_chars or len(all_chunks) >= DEFAULT_MAX_CHUNKS:
                break

        # Check image-only PDF (no extractable text on any page)
        if pages_with_text == 0:
            return DocumentExtractionResult(
                file_id=file_id,
                path=str(path),
                relative_path=relative_path,
                extension=path.suffix.lower(),
                status=ExtractionStatusEnum.IMAGE_ONLY_OR_EMPTY,
                error_message="PDF contains no extractable text (image-only or blank document).",
                duration_seconds=round(time.monotonic() - start_time, 3),
            )

        return DocumentExtractionResult(
            file_id=file_id,
            path=str(path),
            relative_path=relative_path,
            extension=path.suffix.lower(),
            status=ExtractionStatusEnum.SUCCESS,
            total_chars=total_extracted_chars,
            total_chunks=len(all_chunks),
            sections_count=pages_with_text,
            chunks=all_chunks,
            duration_seconds=round(time.monotonic() - start_time, 3),
        )

    # --- DOCX Extraction ---
    @staticmethod
    def _extract_docx(
        path: Path, file_id: str, relative_path: str, max_chars: int, start_time: float
    ) -> DocumentExtractionResult:
        try:
            doc = docx.Document(str(path))
        except Exception as e:
            return DocumentExtractionResult(
                file_id=file_id,
                path=str(path),
                relative_path=relative_path,
                extension=path.suffix.lower(),
                status=ExtractionStatusEnum.MALFORMED,
                error_message=f"Cannot parse DOCX file: {str(e)}",
                duration_seconds=round(time.monotonic() - start_time, 3),
            )

        sections: List[Tuple[str, List[str]]] = []
        current_heading = "Document Content"
        current_paragraphs: List[str] = []

        for p in doc.paragraphs:
            text = p.text.strip()
            if not text:
                continue

            style_name = getattr(p.style, "name", "") if p.style else ""
            if "heading" in style_name.lower():
                if current_paragraphs:
                    sections.append((current_heading, current_paragraphs))
                    current_paragraphs = []
                current_heading = f"Section: {text}"
            else:
                current_paragraphs.append(text)

        if current_paragraphs:
            sections.append((current_heading, current_paragraphs))

        all_chunks: List[DocumentChunk] = []
        chunk_idx = 1
        total_extracted_chars = 0

        for heading, paras in sections:
            sec_text = "\n\n".join(paras).strip()
            if not sec_text:
                continue
            sec_chunks, chunk_idx = chunk_section_text(file_id, relative_path, heading, sec_text, chunk_idx)
            all_chunks.extend(sec_chunks)
            total_extracted_chars += sum(c.char_count for c in sec_chunks)
            if total_extracted_chars >= max_chars or len(all_chunks) >= DEFAULT_MAX_CHUNKS:
                break

        if not all_chunks:
            return DocumentExtractionResult(
                file_id=file_id,
                path=str(path),
                relative_path=relative_path,
                extension=path.suffix.lower(),
                status=ExtractionStatusEnum.EMPTY,
                error_message="DOCX document contains no text paragraphs.",
                duration_seconds=round(time.monotonic() - start_time, 3),
            )

        return DocumentExtractionResult(
            file_id=file_id,
            path=str(path),
            relative_path=relative_path,
            extension=path.suffix.lower(),
            status=ExtractionStatusEnum.SUCCESS,
            total_chars=total_extracted_chars,
            total_chunks=len(all_chunks),
            sections_count=len(sections),
            chunks=all_chunks,
            duration_seconds=round(time.monotonic() - start_time, 3),
        )

    # --- CSV Extraction ---
    @staticmethod
    def _extract_csv(
        path: Path, file_id: str, relative_path: str, ext: str, max_chars: int, start_time: float
    ) -> DocumentExtractionResult:
        delimiter = "\t" if ext == ".tsv" else ","
        try:
            with open(path, "r", encoding="utf-8", errors="replace") as f:
                reader = csv.reader(f, delimiter=delimiter)
                rows = []
                for idx, row in enumerate(reader):
                    rows.append(row)
                    if idx >= 2000:  # Bound rows
                        break
        except Exception as e:
            return DocumentExtractionResult(
                file_id=file_id,
                path=str(path),
                relative_path=relative_path,
                extension=ext,
                status=ExtractionStatusEnum.MALFORMED,
                error_message=f"Cannot parse CSV: {str(e)}",
                duration_seconds=round(time.monotonic() - start_time, 3),
            )

        if not rows:
            return DocumentExtractionResult(
                file_id=file_id,
                path=str(path),
                relative_path=relative_path,
                extension=ext,
                status=ExtractionStatusEnum.EMPTY,
                error_message="CSV file contains 0 rows.",
                duration_seconds=round(time.monotonic() - start_time, 3),
            )

        headers = rows[0] if rows else []
        header_line = "Columns: " + ", ".join(headers[:20])

        all_chunks: List[DocumentChunk] = []
        chunk_idx = 1
        total_extracted_chars = 0
        batch_size = 35

        for i in range(1, len(rows), batch_size):
            batch = rows[i : i + batch_size]
            formatted_lines = [header_line]
            for r in batch:
                formatted_lines.append(" | ".join(r[:20]))

            batch_text = "\n".join(formatted_lines)
            ref = f"Rows {i} to {min(i + batch_size - 1, len(rows) - 1)}"

            sec_chunks, chunk_idx = chunk_section_text(file_id, relative_path, ref, batch_text, chunk_idx)
            all_chunks.extend(sec_chunks)
            total_extracted_chars += sum(c.char_count for c in sec_chunks)

            if total_extracted_chars >= max_chars or len(all_chunks) >= DEFAULT_MAX_CHUNKS:
                break

        return DocumentExtractionResult(
            file_id=file_id,
            path=str(path),
            relative_path=relative_path,
            extension=ext,
            status=ExtractionStatusEnum.SUCCESS,
            total_chars=total_extracted_chars,
            total_chunks=len(all_chunks),
            sections_count=len(all_chunks),
            chunks=all_chunks,
            duration_seconds=round(time.monotonic() - start_time, 3),
        )

    # --- JSON Extraction ---
    @staticmethod
    def _extract_json(
        path: Path, file_id: str, relative_path: str, max_chars: int, start_time: float
    ) -> DocumentExtractionResult:
        try:
            with open(path, "r", encoding="utf-8", errors="replace") as f:
                data = json.load(f)
        except json.JSONDecodeError as e:
            return DocumentExtractionResult(
                file_id=file_id,
                path=str(path),
                relative_path=relative_path,
                extension=".json",
                status=ExtractionStatusEnum.MALFORMED,
                error_message=f"Invalid JSON syntax: {str(e)}",
                duration_seconds=round(time.monotonic() - start_time, 3),
            )
        except Exception as e:
            return DocumentExtractionResult(
                file_id=file_id,
                path=str(path),
                relative_path=relative_path,
                extension=".json",
                status=ExtractionStatusEnum.MALFORMED,
                error_message=f"Cannot read JSON: {str(e)}",
                duration_seconds=round(time.monotonic() - start_time, 3),
            )

        all_chunks: List[DocumentChunk] = []
        chunk_idx = 1
        total_extracted_chars = 0

        if isinstance(data, dict):
            for key, val in data.items():
                val_snippet = json.dumps(val, indent=2, ensure_ascii=False)[:2500]
                ref = f"Key: {key}"
                sec_chunks, chunk_idx = chunk_section_text(file_id, relative_path, ref, val_snippet, chunk_idx)
                all_chunks.extend(sec_chunks)
                total_extracted_chars += sum(c.char_count for c in sec_chunks)
                if total_extracted_chars >= max_chars or len(all_chunks) >= DEFAULT_MAX_CHUNKS:
                    break
        elif isinstance(data, list):
            batch_size = 20
            for i in range(0, len(data), batch_size):
                sub = data[i : i + batch_size]
                snippet = json.dumps(sub, indent=2, ensure_ascii=False)[:2500]
                ref = f"Items {i} to {min(i + batch_size - 1, len(data) - 1)}"
                sec_chunks, chunk_idx = chunk_section_text(file_id, relative_path, ref, snippet, chunk_idx)
                all_chunks.extend(sec_chunks)
                total_extracted_chars += sum(c.char_count for c in sec_chunks)
                if total_extracted_chars >= max_chars or len(all_chunks) >= DEFAULT_MAX_CHUNKS:
                    break
        else:
            simple_text = str(data)
            sec_chunks, _ = chunk_section_text(file_id, relative_path, "Root", simple_text, 1)
            all_chunks.extend(sec_chunks)
            total_extracted_chars += sum(c.char_count for c in sec_chunks)

        if not all_chunks:
            return DocumentExtractionResult(
                file_id=file_id,
                path=str(path),
                relative_path=relative_path,
                extension=".json",
                status=ExtractionStatusEnum.EMPTY,
                error_message="JSON document contains no extractable data elements.",
                duration_seconds=round(time.monotonic() - start_time, 3),
            )

        return DocumentExtractionResult(
            file_id=file_id,
            path=str(path),
            relative_path=relative_path,
            extension=".json",
            status=ExtractionStatusEnum.SUCCESS,
            total_chars=total_extracted_chars,
            total_chunks=len(all_chunks),
            sections_count=len(all_chunks),
            chunks=all_chunks,
            duration_seconds=round(time.monotonic() - start_time, 3),
        )


document_extractor = DocumentExtractor()
