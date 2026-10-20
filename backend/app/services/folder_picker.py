import asyncio
import logging
import sys
from typing import Optional, Tuple

logger = logging.getLogger(__name__)


async def pick_native_folder() -> Tuple[Optional[str], bool, Optional[str]]:
    """
    Open native OS directory picker dialog on macOS using osascript.
    Returns: (selected_path, is_supported, message)
    """
    if sys.platform != "darwin":
        return None, False, "Native folder dialog is only supported on macOS. Use manual path entry."

    script = 'POSIX path of (choose folder with prompt "Select a folder for ProcrastinateOS to organize:")'
    
    try:
        proc = await asyncio.create_subprocess_exec(
            "osascript",
            "-e",
            script,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE,
        )

        try:
            stdout, stderr = await asyncio.wait_for(proc.communicate(), timeout=45.0)
        except asyncio.TimeoutError:
            try:
                proc.kill()
            except Exception:
                pass
            return None, True, "Folder selection timed out."

        if proc.returncode == 0:
            chosen = stdout.decode("utf-8").strip()
            # osascript trailing slash normalization
            chosen = chosen.rstrip("/")
            if chosen:
                return chosen, True, "Folder selected successfully."

        err_text = stderr.decode("utf-8", errors="ignore").strip()
        if "User canceled" in err_text or proc.returncode == 1:
            return None, True, "Folder selection was canceled by user."

        return None, True, f"Native picker failed: {err_text}"

    except Exception as e:
        logger.warning(f"Native folder picker execution error: {e}")
        return None, False, f"Could not launch native folder picker: {str(e)}"
