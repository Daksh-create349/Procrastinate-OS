from collections import defaultdict
from datetime import datetime, timezone
import hashlib
import logging
import mimetypes
import os
from pathlib import Path
import time
from typing import Callable, Dict, List, Optional, Set, Tuple

logger = logging.getLogger(__name__)

from app.models.schemas import (
    CategorySummary,
    DocumentExtractionResult,
    DuplicateGroup,
    ExtractionStatusEnum,
    FileInfo,
    ScanResult,
    SkippedFile,
)
from app.services.analysis_engine import analysis_engine
from app.services.document_extractor import (
    SUPPORTED_EXTENSIONS as EXTRACTABLE_EXTENSIONS,
    document_extractor,
    generate_stable_file_id,
)
from app.services.path_validator import validate_workspace_path

# Comprehensive Extension to Category & Format Mapping
EXTENSION_MAP: Dict[str, Tuple[str, str, bool]] = {
    # ext: (Category, ContentFormat, is_previewable)
    # Documents
    ".txt": ("Documents", "text", True),
    ".md": ("Documents", "text", True),
    ".markdown": ("Documents", "text", True),
    ".rst": ("Documents", "text", True),
    ".pdf": ("Documents", "document", True),
    ".docx": ("Documents", "document", True),
    ".doc": ("Documents", "document", False),
    ".xlsx": ("Documents", "document", False),
    ".xls": ("Documents", "document", False),
    ".pptx": ("Documents", "document", False),
    ".ppt": ("Documents", "document", False),
    ".csv": ("Documents", "text", True),
    ".tsv": ("Documents", "text", True),
    ".pages": ("Documents", "document", False),
    ".numbers": ("Documents", "document", False),
    ".key": ("Documents", "document", False),
    ".odt": ("Documents", "document", False),
    ".rtf": ("Documents", "text", True),

    # Code / Development
    ".py": ("Code", "code", True),
    ".js": ("Code", "code", True),
    ".ts": ("Code", "code", True),
    ".tsx": ("Code", "code", True),
    ".jsx": ("Code", "code", True),
    ".html": ("Code", "code", True),
    ".htm": ("Code", "code", True),
    ".css": ("Code", "code", True),
    ".scss": ("Code", "code", True),
    ".sass": ("Code", "code", True),
    ".less": ("Code", "code", True),
    ".json": ("Code", "code", True),
    ".yaml": ("Code", "code", True),
    ".yml": ("Code", "code", True),
    ".toml": ("Code", "code", True),
    ".xml": ("Code", "code", True),
    ".sh": ("Code", "code", True),
    ".bash": ("Code", "code", True),
    ".zsh": ("Code", "code", True),
    ".rs": ("Code", "code", True),
    ".go": ("Code", "code", True),
    ".c": ("Code", "code", True),
    ".cpp": ("Code", "code", True),
    ".cc": ("Code", "code", True),
    ".h": ("Code", "code", True),
    ".hpp": ("Code", "code", True),
    ".java": ("Code", "code", True),
    ".kt": ("Code", "code", True),
    ".swift": ("Code", "code", True),
    ".rb": ("Code", "code", True),
    ".php": ("Code", "code", True),
    ".sql": ("Code", "code", True),
    ".env": ("Code", "text", True),
    ".gitignore": ("Code", "text", True),

    # Images
    ".png": ("Images", "image", False),
    ".jpg": ("Images", "image", False),
    ".jpeg": ("Images", "image", False),
    ".gif": ("Images", "image", False),
    ".svg": ("Images", "code", True),
    ".webp": ("Images", "image", False),
    ".bmp": ("Images", "image", False),
    ".tiff": ("Images", "image", False),
    ".ico": ("Images", "image", False),
    ".psd": ("Images", "image", False),
    ".ai": ("Images", "image", False),
    ".sketch": ("Images", "image", False),
    ".fig": ("Images", "image", False),

    # Archives
    ".zip": ("Archives", "archive", False),
    ".tar": ("Archives", "archive", False),
    ".gz": ("Archives", "archive", False),
    ".tgz": ("Archives", "archive", False),
    ".bz2": ("Archives", "archive", False),
    ".rar": ("Archives", "archive", False),
    ".7z": ("Archives", "archive", False),
    ".dmg": ("Archives", "archive", False),
    ".iso": ("Archives", "archive", False),
    ".pkg": ("Archives", "archive", False),

    # Media (Audio & Video)
    ".mp3": ("Media", "media", False),
    ".wav": ("Media", "media", False),
    ".m4a": ("Media", "media", False),
    ".flac": ("Media", "media", False),
    ".aac": ("Media", "media", False),
    ".mp4": ("Media", "media", False),
    ".mov": ("Media", "media", False),
    ".mkv": ("Media", "media", False),
    ".webm": ("Media", "media", False),
    ".avi": ("Media", "media", False),
}

ABANDONED_CANDIDATE_EXTENSIONS = {
    ".docx", ".doc", ".md", ".txt", ".pages", ".key", ".pptx", ".py", ".ts",
    ".psd", ".fig", ".sketch", ".blend", ".draft", ".ai"
}


def format_bytes(size: int) -> str:
    """Format bytes into readable human format."""
    if size < 1024:
        return f"{size} B"
    size_f = float(size)
    for unit in ["KB", "MB", "GB", "TB"]:
        size_f /= 1024.0
        if size_f < 1024.0:
            return f"{size_f:.1f} {unit}"
    return f"{size_f:.1f} PB"


def compute_file_sha256(filepath: str, max_size_bytes: int, chunk_size: int = 65536) -> Optional[str]:
    """Read-only SHA-256 hashing in streaming chunks."""
    try:
        size = os.path.getsize(filepath)
        if size > max_size_bytes:
            return None
        hasher = hashlib.sha256()
        with open(filepath, "rb") as f:
            while chunk := f.read(chunk_size):
                hasher.update(chunk)
        return hasher.hexdigest()
    except (PermissionError, FileNotFoundError, OSError):
        return None


class ScannerService:
    @staticmethod
    def scan_folder(
        folder_path: str,
        max_depth: int = 15,
        include_hidden: bool = False,
        min_size_bytes: int = 0,
        compute_hashes: bool = True,
        extract_documents: bool = True,
        max_files: int = 50000,
        max_file_size_bytes: int = 2 * 1024 * 1024 * 1024,  # 2 GB
        max_duration_seconds: float = 60.0,
        progress_callback: Optional[Callable[[int, int, str, int], None]] = None,
        cancel_check: Optional[Callable[[], bool]] = None,
    ) -> ScanResult:
        # Step 1: Strict Security Validation
        resolved_root = validate_workspace_path(folder_path)
        start_time = time.monotonic()
        now = datetime.now(timezone.utc)

        file_infos: List[FileInfo] = []
        skipped_files: List[SkippedFile] = []
        category_stats: Dict[str, Tuple[int, int]] = {}
        extracted_documents: List[DocumentExtractionResult] = []
        extraction_summary: Dict[str, int] = defaultdict(int)

        total_files = 0
        total_size_bytes = 0

        # Visited directory tracking to prevent loops / circular symlinks
        visited_inodes: Set[Tuple[int, int]] = set()

        # Queue for breadth/depth traversal: (current_dir_path, depth)
        queue: List[Tuple[Path, int]] = [(resolved_root, 0)]

        # Hash dictionary for duplicates: hash -> list of FileInfo
        hash_map: Dict[str, List[FileInfo]] = defaultdict(list)

        while queue:
            # Check cancellation
            if cancel_check and cancel_check():
                skipped_files.append(
                    SkippedFile(
                        path=str(resolved_root),
                        relative_path="",
                        reason="Scan was cancelled by user.",
                        error_type="cancelled",
                    )
                )
                break

            # Check time limit
            elapsed = time.monotonic() - start_time
            if elapsed > max_duration_seconds:
                skipped_files.append(
                    SkippedFile(
                        path=str(resolved_root),
                        relative_path="",
                        reason=f"Scan exceeded timeout limit of {max_duration_seconds}s.",
                        error_type="timeout",
                    )
                )
                break

            current_dir, depth = queue.pop(0)

            # Check max depth
            if depth > max_depth:
                continue

            # Inode cycle check for directory
            try:
                dir_stat = current_dir.stat()
                inode_key = (dir_stat.st_dev, dir_stat.st_ino)
                if inode_key in visited_inodes:
                    continue
                visited_inodes.add(inode_key)
            except (PermissionError, FileNotFoundError, OSError) as e:
                try:
                    rel = str(current_dir.relative_to(resolved_root))
                except Exception:
                    rel = current_dir.name
                skipped_files.append(
                    SkippedFile(
                        path=str(current_dir),
                        relative_path=rel,
                        reason=f"Cannot access directory: {str(e)}",
                        error_type="permission_denied" if isinstance(e, PermissionError) else "os_error",
                    )
                )
                continue

            # Update progress callback
            if progress_callback:
                progress_callback(
                    total_files, total_size_bytes, str(current_dir), len(extracted_documents)
                )

            # Read entries using os.scandir for high performance & safety
            try:
                with os.scandir(current_dir) as it:
                    for entry in it:
                        # Cancellation & limit check within directory
                        if cancel_check and cancel_check():
                            break
                        if total_files >= max_files:
                            skipped_files.append(
                                SkippedFile(
                                    path=str(resolved_root),
                                    relative_path="",
                                    reason=f"Reached maximum file limit of {max_files} files.",
                                    error_type="size_limit",
                                )
                            )
                            queue.clear()
                            break

                        entry_name = entry.name

                        # Filter hidden files/directories unless explicitly requested
                        if not include_hidden and entry_name.startswith("."):
                            continue

                        entry_path = Path(entry.path)

                        # Symlink safety validation
                        is_symlink = entry.is_symlink()
                        if is_symlink:
                            try:
                                real_target = entry_path.resolve(strict=True)
                                # Check if link points outside workspace
                                try:
                                    real_target.relative_to(resolved_root)
                                except ValueError:
                                    # Link points outside workspace! Reject traversal
                                    try:
                                        rel_symlink = str(entry_path.relative_to(resolved_root))
                                    except Exception:
                                        rel_symlink = entry_name

                                    skipped_files.append(
                                        SkippedFile(
                                            path=str(entry_path),
                                            relative_path=rel_symlink,
                                            reason=f"Symbolic link points outside workspace to '{real_target}'.",
                                            error_type="symlink_external",
                                        )
                                    )
                                    continue
                            except (FileNotFoundError, OSError) as e:
                                skipped_files.append(
                                    SkippedFile(
                                        path=str(entry_path),
                                        relative_path=entry_name,
                                        reason=f"Broken symbolic link: {str(e)}",
                                        error_type="file_not_found",
                                    )
                                )
                                continue

                        # Directory handling
                        if entry.is_dir(follow_symlinks=False):
                            queue.append((entry_path, depth + 1))
                            continue

                        # File handling
                        if entry.is_file(follow_symlinks=False):
                            try:
                                stat = entry.stat(follow_symlinks=False)
                            except (PermissionError, FileNotFoundError, OSError) as e:
                                try:
                                    rel_err = str(entry_path.relative_to(resolved_root))
                                except Exception:
                                    rel_err = entry_name
                                skipped_files.append(
                                    SkippedFile(
                                        path=str(entry_path),
                                        relative_path=rel_err,
                                        reason=f"Cannot read file stat: {str(e)}",
                                        error_type="permission_denied" if isinstance(e, PermissionError) else "os_error",
                                    )
                                )
                                continue

                            size = stat.st_size
                            if size < min_size_bytes:
                                continue

                            ext = entry_path.suffix.lower()
                            cat_info = EXTENSION_MAP.get(ext)
                            if cat_info:
                                category, content_format, is_previewable = cat_info
                            else:
                                category = "Other"
                                content_format = "binary"
                                is_previewable = False

                            # Guess MIME type
                            mime_guess, _ = mimetypes.guess_type(entry_name)
                            mime_type = mime_guess or "application/octet-stream"

                            # Timestamps
                            mtime = datetime.fromtimestamp(stat.st_mtime, tz=timezone.utc)
                            atime = datetime.fromtimestamp(stat.st_atime, tz=timezone.utc)
                            created_ts = getattr(stat, "st_birthtime", stat.st_ctime)
                            ctime = datetime.fromtimestamp(created_ts, tz=timezone.utc)

                            days_inactive = max(0, (now - mtime).days)

                            # Determine if likely abandoned work
                            is_abandoned = (days_inactive >= 30 and ext in ABANDONED_CANDIDATE_EXTENSIONS) or (
                                days_inactive >= 60 and category in ["Documents", "Code", "Images"]
                            )

                            # Workspace-relative path
                            try:
                                rel_path = str(entry_path.relative_to(resolved_root))
                            except Exception:
                                rel_path = entry_name

                            # SHA-256 calculation
                            file_sha = None
                            if compute_hashes:
                                if size <= max_file_size_bytes:
                                    file_sha = compute_file_sha256(str(entry_path), max_file_size_bytes)
                                else:
                                    skipped_files.append(
                                        SkippedFile(
                                            path=str(entry_path),
                                            relative_path=rel_path,
                                            reason=f"File size {format_bytes(size)} exceeds maximum hash limit of {format_bytes(max_file_size_bytes)}.",
                                            error_type="size_limit",
                                        )
                                    )

                            # Document Text Extraction
                            extraction_status = None
                            extracted_chars = 0
                            extracted_chunks_count = 0

                            if extract_documents and ext in EXTRACTABLE_EXTENSIONS:
                                try:
                                    doc_result = document_extractor.extract_document(
                                        filepath=str(entry_path),
                                        relative_path=rel_path,
                                        sha256=file_sha,
                                    )
                                    extraction_status = doc_result.status
                                    extracted_chars = doc_result.total_chars
                                    extracted_chunks_count = doc_result.total_chunks
                                    extracted_documents.append(doc_result)
                                    extraction_summary[doc_result.status.value] += 1
                                except Exception as extract_err:
                                    logger.warning(
                                        f"Safe document extractor caught error for {rel_path}: {extract_err}"
                                    )
                                    extraction_status = ExtractionStatusEnum.ERROR
                                    extraction_summary["error"] += 1

                            file_id = generate_stable_file_id(rel_path, size, file_sha)
                            f_info = FileInfo(
                                file_id=file_id,
                                path=str(entry_path),
                                relative_path=rel_path,
                                name=entry_name,
                                extension=ext,
                                size_bytes=size,
                                size_formatted=format_bytes(size),
                                category=category,
                                mime_type=mime_type,
                                content_format=content_format,
                                is_previewable=is_previewable,
                                created_at=ctime,
                                modified_at=mtime,
                                accessed_at=atime,
                                sha256=file_sha,
                                days_inactive=days_inactive,
                                is_likely_abandoned=is_abandoned,
                                extraction_status=extraction_status,
                                extracted_chars=extracted_chars,
                                extracted_chunks_count=extracted_chunks_count,
                            )
                            file_infos.append(f_info)

                            if file_sha:
                                hash_map[file_sha].append(f_info)

                            total_files += 1
                            total_size_bytes += size

                            cnt, bts = category_stats.get(category, (0, 0))
                            category_stats[category] = (cnt + 1, bts + size)

            except (PermissionError, FileNotFoundError, OSError) as e:
                try:
                    rel_dir = str(current_dir.relative_to(resolved_root))
                except Exception:
                    rel_dir = current_dir.name
                skipped_files.append(
                    SkippedFile(
                        path=str(current_dir),
                        relative_path=rel_dir,
                        reason=f"Error reading directory contents: {str(e)}",
                        error_type="permission_denied" if isinstance(e, PermissionError) else "os_error",
                    )
                )

        # Step 3: Compute Duplicate Groups
        duplicate_groups: List[DuplicateGroup] = []
        total_wasted_bytes = 0

        for chk, dup_files in hash_map.items():
            if len(dup_files) > 1:
                single_size = dup_files[0].size_bytes
                wasted = single_size * (len(dup_files) - 1)
                total_wasted_bytes += wasted

                duplicate_groups.append(
                    DuplicateGroup(
                        checksum=chk,
                        file_size_bytes=single_size,
                        file_size_formatted=format_bytes(single_size),
                        wasted_bytes=wasted,
                        wasted_formatted=format_bytes(wasted),
                        files=[f.path for f in dup_files],
                        relative_files=[f.relative_path for f in dup_files],
                    )
                )

        duplicate_groups.sort(key=lambda g: g.wasted_bytes, reverse=True)

        # Categories list
        categories: List[CategorySummary] = [
            CategorySummary(
                category=cat,
                count=count,
                total_size_bytes=bts,
                total_size_formatted=format_bytes(bts),
            )
            for cat, (count, bts) in sorted(category_stats.items(), key=lambda x: x[1][1], reverse=True)
        ]

        # Abandoned files (top 25)
        abandoned_files = sorted(
            [f for f in file_infos if f.is_likely_abandoned],
            key=lambda x: x.days_inactive,
            reverse=True,
        )[:25]

        # Largest files (top 20)
        largest_files = sorted(file_infos, key=lambda x: x.size_bytes, reverse=True)[:20]

        # Most recent files (top 20)
        recent_files = sorted(file_infos, key=lambda x: x.modified_at, reverse=True)[:20]

        # Step 4: Run Deterministic File Analysis Engine
        analysis_res = analysis_engine.analyze(
            root_path=str(resolved_root),
            files=file_infos,
            extracted_docs=extracted_documents,
        )

        duration = round(time.monotonic() - start_time, 3)

        return ScanResult(
            root_path=str(resolved_root),
            scanned_at=now,
            duration_seconds=duration,
            total_files=total_files,
            total_size_bytes=total_size_bytes,
            total_size_formatted=format_bytes(total_size_bytes),
            categories=categories,
            abandoned_files=abandoned_files,
            largest_files=largest_files,
            recent_files=recent_files,
            duplicate_groups=duplicate_groups,
            skipped_files=skipped_files,
            total_wasted_bytes=total_wasted_bytes,
            total_wasted_formatted=format_bytes(total_wasted_bytes),
            files=file_infos,
            extracted_documents=extracted_documents,
            extraction_summary=dict(extraction_summary),
            deterministic_findings=analysis_res.findings,
            findings_summary=analysis_res.findings_summary,
            inventory_summary=analysis_res.inventory,
        )


scanner_service = ScannerService()
