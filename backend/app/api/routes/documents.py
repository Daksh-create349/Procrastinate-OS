import os
from pathlib import Path
import time
from typing import List
from fastapi import APIRouter, HTTPException, status

from app.models.schemas import (
    BatchExtractRequest,
    BatchExtractResponse,
    DocumentExtractRequest,
    DocumentExtractionResult,
    ExtractionStatusEnum,
)
from app.services.document_extractor import (
    DEFAULT_MAX_FILE_SIZE_BYTES,
    DEFAULT_MAX_TOTAL_CHARS,
    SUPPORTED_EXTENSIONS,
    document_extractor,
)
from app.services.path_validator import validate_workspace_path

router = APIRouter(prefix="/documents", tags=["Documents"])


@router.get("/supported")
async def get_supported_formats():
    """Return supported document extraction formats, limits, and security guarantees."""
    return {
        "supported_extensions": sorted(list(SUPPORTED_EXTENSIONS)),
        "max_file_size_bytes": DEFAULT_MAX_FILE_SIZE_BYTES,
        "max_chars_per_doc": DEFAULT_MAX_TOTAL_CHARS,
        "features": {
            "pdf_text_extraction": True,
            "docx_section_extraction": True,
            "markdown_header_chunking": True,
            "csv_row_batching": True,
            "json_key_chunking": True,
            "ocr_enabled": False,
            "macro_execution_disabled": True,
            "cloud_transfer_disabled": True,
            "untrusted_prompt_injection_sanitization": True,
        },
    }


@router.post("/extract", response_model=DocumentExtractionResult)
async def extract_single_document(payload: DocumentExtractRequest) -> DocumentExtractionResult:
    """Extract bounded text chunks with references from a single workspace document."""
    try:
        resolved_root = validate_workspace_path(payload.folder_path)
    except Exception as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e))

    # Resolve target file safely inside workspace
    target_path = (resolved_root / payload.relative_path).resolve()
    try:
        target_path.relative_to(resolved_root)
    except ValueError:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Access denied: Target document path is outside workspace root.",
        )

    return document_extractor.extract_document(
        filepath=str(target_path),
        relative_path=payload.relative_path,
        max_total_chars=payload.max_chars,
    )


@router.post("/batch-extract", response_model=BatchExtractResponse)
async def batch_extract_documents(payload: BatchExtractRequest) -> BatchExtractResponse:
    """Batch extract bounded text chunks across multiple workspace documents."""
    start_time = time.monotonic()
    try:
        resolved_root = validate_workspace_path(payload.folder_path)
    except Exception as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e))

    paths_to_extract = payload.relative_paths or []

    # If no explicit paths provided, find all supported documents up to max_files
    if not paths_to_extract:
        for root, dirs, files in os.walk(resolved_root):
            dirs[:] = [d for d in dirs if not d.startswith(".")]
            for file_name in files:
                if file_name.startswith("."):
                    continue
                ext = Path(file_name).suffix.lower()
                if ext in SUPPORTED_EXTENSIONS:
                    full_p = Path(root) / file_name
                    try:
                        rel = str(full_p.relative_to(resolved_root))
                        paths_to_extract.append(rel)
                        if len(paths_to_extract) >= payload.max_files:
                            break
                    except Exception:
                        continue
            if len(paths_to_extract) >= payload.max_files:
                break

    results: List[DocumentExtractionResult] = []
    total_extracted = 0
    total_skipped = 0
    total_failed = 0

    for rel_p in paths_to_extract[: payload.max_files]:
        full_p = (resolved_root / rel_p).resolve()
        try:
            full_p.relative_to(resolved_root)
        except ValueError:
            continue

        res = document_extractor.extract_document(
            filepath=str(full_p),
            relative_path=rel_p,
            max_total_chars=payload.max_chars_per_file,
        )
        results.append(res)
        if res.status == ExtractionStatusEnum.SUCCESS:
            total_extracted += 1
        elif res.status in [
            ExtractionStatusEnum.EMPTY,
            ExtractionStatusEnum.SKIPPED_SIZE,
            ExtractionStatusEnum.PASSWORD_PROTECTED,
            ExtractionStatusEnum.IMAGE_ONLY_OR_EMPTY,
        ]:
            total_skipped += 1
        else:
            total_failed += 1

    duration = round(time.monotonic() - start_time, 3)

    return BatchExtractResponse(
        total_requested=len(paths_to_extract),
        total_extracted=total_extracted,
        total_skipped=total_skipped,
        total_failed=total_failed,
        documents=results,
        duration_seconds=duration,
    )
