from collections import defaultdict
from datetime import datetime, timezone
import hashlib
import os
from pathlib import Path
from typing import Dict, List

from app.models.schemas import DuplicateGroup, DuplicateResult
from app.services.scanner_service import format_bytes


def compute_file_hash(filepath: str, chunk_size: int = 65536) -> str:
    """Compute SHA-256 hash of a file efficiently."""
    hasher = hashlib.sha256()
    with open(filepath, "rb") as f:
        while chunk := f.read(chunk_size):
            hasher.update(chunk)
    return hasher.hexdigest()


class DuplicateService:
    @staticmethod
    def find_duplicates(
        folder_path: str,
        min_size_bytes: int = 1024,
        include_hidden: bool = False,
    ) -> DuplicateResult:
        path = Path(folder_path).resolve()
        if not path.exists():
            raise FileNotFoundError(f"Directory not found: {folder_path}")
        if not path.is_dir():
            raise NotADirectoryError(f"Path is not a directory: {folder_path}")

        now = datetime.now(timezone.utc)
        # Step 1: Group files by byte size
        size_groups: Dict[int, List[str]] = defaultdict(list)

        for root, dirs, files in os.walk(path):
            if not include_hidden:
                dirs[:] = [d for d in dirs if not d.startswith(".")]

            for file_name in files:
                if not include_hidden and file_name.startswith("."):
                    continue

                full_path = os.path.join(root, file_name)
                try:
                    size = os.path.getsize(full_path)
                    if size >= min_size_bytes:
                        size_groups[size].append(full_path)
                except (PermissionError, FileNotFoundError, OSError):
                    continue

        # Step 2: For sizes with > 1 file, compute checksum
        hash_groups: Dict[str, List[str]] = defaultdict(list)
        file_sizes: Dict[str, int] = {}

        for size, file_paths in size_groups.items():
            if len(file_paths) < 2:
                continue

            for fp in file_paths:
                try:
                    file_hash = compute_file_hash(fp)
                    hash_groups[file_hash].append(fp)
                    file_sizes[file_hash] = size
                except (PermissionError, FileNotFoundError, OSError):
                    continue

        # Step 3: Filter true duplicates
        duplicate_groups: List[DuplicateGroup] = []
        total_duplicates = 0
        total_wasted_bytes = 0

        for chk, file_paths in hash_groups.items():
            if len(file_paths) > 1:
                size = file_sizes.get(chk, 0)
                # Wasted bytes is size * (count - 1)
                wasted = size * (len(file_paths) - 1)
                total_wasted_bytes += wasted
                total_duplicates += (len(file_paths) - 1)

                duplicate_groups.append(
                    DuplicateGroup(
                        checksum=chk,
                        file_size_bytes=size,
                        file_size_formatted=format_bytes(size),
                        wasted_bytes=wasted,
                        wasted_formatted=format_bytes(wasted),
                        files=file_paths,
                    )
                )

        duplicate_groups.sort(key=lambda g: g.wasted_bytes, reverse=True)

        return DuplicateResult(
            scanned_path=str(path),
            scanned_at=now,
            groups_count=len(duplicate_groups),
            total_duplicate_files=total_duplicates,
            total_wasted_bytes=total_wasted_bytes,
            total_wasted_formatted=format_bytes(total_wasted_bytes),
            groups=duplicate_groups,
        )


duplicate_service = DuplicateService()
