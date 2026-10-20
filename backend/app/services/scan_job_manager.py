import asyncio
import logging
import threading
import time
import uuid
from typing import Dict, Optional

from app.models.schemas import ScanProgress, ScanRequest, ScanResult, ScanStatusEnum
from app.services.scanner_service import format_bytes, scanner_service

logger = logging.getLogger(__name__)


class ScanJob:
    def __init__(self, job_id: str, request: ScanRequest):
        self.job_id = job_id
        self.request = request
        self.progress = ScanProgress(
            job_id=job_id,
            status=ScanStatusEnum.QUEUED,
            folder_path=request.folder_path,
        )
        self.result: Optional[ScanResult] = None
        self.cancel_requested = False
        self.start_time = 0.0


class ScanJobManager:
    def __init__(self):
        self._jobs: Dict[str, ScanJob] = {}
        self._lock = threading.Lock()

    def create_job(self, request: ScanRequest) -> str:
        job_id = f"scan-{uuid.uuid4().hex[:10]}"
        with self._lock:
            job = ScanJob(job_id, request)
            self._jobs[job_id] = job

        # Launch background execution task
        asyncio.create_task(self._run_job(job_id))
        return job_id

    async def _run_job(self, job_id: str):
        job = self._jobs.get(job_id)
        if not job:
            return

        job.progress.status = ScanStatusEnum.RUNNING
        job.start_time = time.monotonic()

        def progress_callback(files_count: int, bytes_count: int, current_dir: str, docs_count: int = 0):
            with self._lock:
                job.progress.files_scanned = files_count
                job.progress.bytes_scanned = bytes_count
                job.progress.bytes_scanned_formatted = format_bytes(bytes_count)
                job.progress.current_directory = current_dir
                job.progress.documents_extracted = docs_count
                job.progress.elapsed_seconds = round(time.monotonic() - job.start_time, 2)

        def cancel_check() -> bool:
            return job.cancel_requested

        try:
            req = job.request
            result = await asyncio.to_thread(
                scanner_service.scan_folder,
                folder_path=req.folder_path,
                max_depth=req.max_depth,
                include_hidden=req.include_hidden,
                min_size_bytes=req.min_size_bytes,
                compute_hashes=req.compute_hashes,
                extract_documents=req.extract_documents,
                max_files=req.max_files,
                max_duration_seconds=req.max_duration_seconds,
                progress_callback=progress_callback,
                cancel_check=cancel_check,
            )

            with self._lock:
                job.result = result
                job.progress.files_scanned = result.total_files
                job.progress.bytes_scanned = result.total_size_bytes
                job.progress.bytes_scanned_formatted = result.total_size_formatted
                job.progress.errors_count = len(result.skipped_files)
                job.progress.documents_extracted = len(result.extracted_documents)
                job.progress.elapsed_seconds = result.duration_seconds
                job.progress.is_complete = True
                job.progress.status = (
                    ScanStatusEnum.CANCELLED
                    if job.cancel_requested
                    else ScanStatusEnum.COMPLETED
                )

        except Exception as e:
            logger.exception(f"Scan job {job_id} encountered fatal error: {e}")
            with self._lock:
                job.progress.status = ScanStatusEnum.FAILED
                job.progress.error_message = str(e)
                job.progress.is_complete = True

    def get_progress(self, job_id: str) -> Optional[ScanProgress]:
        with self._lock:
            job = self._jobs.get(job_id)
            if not job:
                return None
            if job.progress.status == ScanStatusEnum.RUNNING:
                job.progress.elapsed_seconds = round(time.monotonic() - job.start_time, 2)
            return job.progress

    def get_result(self, job_id: str) -> Optional[ScanResult]:
        with self._lock:
            job = self._jobs.get(job_id)
            if not job:
                return None
            return job.result

    def cancel_job(self, job_id: str) -> bool:
        with self._lock:
            job = self._jobs.get(job_id)
            if not job:
                return False
            job.cancel_requested = True
            if job.progress.status in [ScanStatusEnum.QUEUED, ScanStatusEnum.RUNNING]:
                job.progress.status = ScanStatusEnum.CANCELLED
            return True


scan_job_manager = ScanJobManager()
