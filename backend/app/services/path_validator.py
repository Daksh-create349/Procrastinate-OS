import os
from pathlib import Path
from typing import Set

FORBIDDEN_ROOTS_UNIX: Set[str] = {
    "/",
    "/System",
    "/private",
    "/etc",
    "/var",
    "/usr",
    "/bin",
    "/sbin",
    "/dev",
    "/Applications",
    "/Library",
    "/Volumes",
}

FORBIDDEN_ROOTS_WINDOWS: Set[str] = {
    "C:\\",
    "C:/",
    "D:\\",
    "D:/",
    "C:\\Windows",
    "C:\\Program Files",
    "C:\\Program Files (x86)",
}


def validate_workspace_path(folder_path: str) -> Path:
    """
    Validate requested workspace directory against security constraints:
    - Path must not be empty.
    - Path must exist and be a directory.
    - Path must not be an entire system root or protected operating system directory.
    - Path must be accessible for reading.
    """
    if not folder_path or not folder_path.strip():
        raise ValueError("Workspace folder path cannot be empty.")

    cleaned = folder_path.strip()
    expanded = os.path.expanduser(cleaned)
    raw_path = Path(expanded)

    # Resolve symbolic links and normalize
    try:
        resolved = raw_path.resolve(strict=True)
    except FileNotFoundError:
        raise FileNotFoundError(f"Folder not found: {cleaned}")
    except PermissionError:
        raise PermissionError(f"Permission denied accessing folder: {cleaned}")
    except Exception as e:
        raise ValueError(f"Invalid path '{cleaned}': {str(e)}")

    if not resolved.is_dir():
        raise NotADirectoryError(f"Specified path is not a directory: {cleaned}")

    # Check root restrictions
    resolved_str = str(resolved).rstrip("/\\") or "/"

    if resolved_str == "/" or len(resolved.parts) <= 1:
        raise ValueError(
            "Scanning entire system root is forbidden for privacy, safety, and performance."
        )

    for forbidden in FORBIDDEN_ROOTS_UNIX:
        forbidden_clean = forbidden.rstrip("/")
        if resolved_str == forbidden_clean:
            raise ValueError(
                f"Scanning critical system path '{forbidden}' is forbidden for security."
            )

    for forbidden in FORBIDDEN_ROOTS_WINDOWS:
        if resolved_str.lower() == forbidden.lower().rstrip("/\\"):
            raise ValueError(
                f"Scanning critical system path '{forbidden}' is forbidden for security."
            )

    # Verify read access
    if not os.access(resolved, os.R_OK):
        raise PermissionError(f"Folder is not readable: {cleaned}")

    return resolved
