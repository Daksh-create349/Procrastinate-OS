from fastapi import APIRouter, HTTPException, status
from app.models.schemas import (
    FolderPickerResponse,
    ScanJobCreated,
    ScanProgress,
    ScanRequest,
    ScanResult,
    ScanStatusEnum,
)
from app.services.folder_picker import pick_native_folder
from app.services.scan_job_manager import scan_job_manager
from app.services.scanner_service import scanner_service

router = APIRouter(prefix="/scan", tags=["Scanner"])


@router.post("/folder", response_model=ScanResult)
async def scan_folder_direct(payload: ScanRequest) -> ScanResult:
    """Direct synchronous scan of local directory with strict validation."""
    try:
        return scanner_service.scan_folder(
            folder_path=payload.folder_path,
            max_depth=payload.max_depth,
            include_hidden=payload.include_hidden,
            min_size_bytes=payload.min_size_bytes,
            compute_hashes=payload.compute_hashes,
            max_files=payload.max_files,
            max_duration_seconds=payload.max_duration_seconds,
        )
    except FileNotFoundError as e:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(e))
    except NotADirectoryError as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e))
    except PermissionError as e:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail=str(e))
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e))
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Scanning failed: {str(e)}",
        )


@router.post("/jobs", response_model=ScanJobCreated)
async def create_scan_job(payload: ScanRequest) -> ScanJobCreated:
    """Start an asynchronous background scan job."""
    try:
        # Pre-validate folder path synchronously before creating job
        from app.services.path_validator import validate_workspace_path
        validate_workspace_path(payload.folder_path)

        job_id = scan_job_manager.create_job(payload)
        prog = scan_job_manager.get_progress(job_id)
        return ScanJobCreated(
            job_id=job_id,
            status=prog.status if prog else ScanStatusEnum.QUEUED,
            folder_path=payload.folder_path,
        )
    except FileNotFoundError as e:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(e))
    except NotADirectoryError as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e))
    except PermissionError as e:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail=str(e))
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e))


@router.get("/jobs/{job_id}/progress", response_model=ScanProgress)
async def get_scan_progress(job_id: str) -> ScanProgress:
    """Get real-time scan job progress."""
    progress = scan_job_manager.get_progress(job_id)
    if not progress:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Scan job not found.")
    return progress


@router.get("/jobs/{job_id}/result", response_model=ScanResult)
async def get_scan_result(job_id: str) -> ScanResult:
    """Get final scan job result."""
    progress = scan_job_manager.get_progress(job_id)
    if not progress:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Scan job not found.")
    if not progress.is_complete:
        raise HTTPException(
            status_code=status.HTTP_202_ACCEPTED,
            detail="Scan job is still in progress.",
        )
    if progress.status == "failed":
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=progress.error_message or "Scan job failed.",
        )
    result = scan_job_manager.get_result(job_id)
    if not result:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Scan result not found.")
    return result


@router.post("/jobs/{job_id}/cancel")
async def cancel_scan_job(job_id: str):
    """Cancel a running scan job."""
    success = scan_job_manager.cancel_job(job_id)
    if not success:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Scan job not found.")
    return {"status": "cancelled", "job_id": job_id}


@router.post("/pick-folder", response_model=FolderPickerResponse)
async def pick_folder_dialog() -> FolderPickerResponse:
    """Trigger native macOS folder selection dialog."""
    path, supported, message = await pick_native_folder()
    return FolderPickerResponse(
        selected_path=path,
        supported=supported,
        message=message,
    )
