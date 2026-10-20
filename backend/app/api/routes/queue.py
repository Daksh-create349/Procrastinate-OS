from datetime import datetime, timezone
from typing import List, Optional
from fastapi import APIRouter, HTTPException, Query, status

from app.models.schemas import (
    GenerateProcrastinationQueueRequest,
    ProcrastinationQueueResponse,
    QueueTask,
    QueueTaskStatus,
    UpdateTaskStatusRequest,
)
from app.services.path_validator import validate_workspace_path
from app.services.queue_service import queue_service
from app.services.task_store import task_store

router = APIRouter(prefix="/queue", tags=["Procrastination Queue"])


@router.post("/generate", response_model=ProcrastinationQueueResponse)
async def generate_procrastination_queue(
    payload: GenerateProcrastinationQueueRequest,
) -> ProcrastinationQueueResponse:
    """
    Generate or retrieve a budget-bounded Procrastination Queue for a workspace.
    Select between 5, 15, or 30 minute time budgets.
    All tasks are grounded in deterministic scanner findings and verified local AI insights.
    """
    try:
        validate_workspace_path(payload.folder_path)
    except Exception as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e))

    if payload.force_regenerate:
        # Clear existing proposed tasks before fresh synthesis
        task_store.clear_workspace_tasks(payload.folder_path, only_proposed=True)

    try:
        return await queue_service.generate_queue(payload)
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to generate procrastination queue: {str(e)}",
        )


@router.get("", response_model=List[QueueTask])
async def list_workspace_tasks(
    folder_path: str = Query(..., description="Workspace directory path"),
    task_status: Optional[QueueTaskStatus] = Query(default=None, alias="status"),
) -> List[QueueTask]:
    """Retrieve persisted tasks for a workspace, optionally filtered by status."""
    try:
        resolved = validate_workspace_path(folder_path)
    except Exception as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e))

    return task_store.list_tasks_for_workspace(str(resolved), status=task_status)


@router.patch("/{task_id}/status", response_model=QueueTask)
async def update_task_status(
    task_id: str,
    payload: UpdateTaskStatusRequest,
) -> QueueTask:
    """Update task status (proposed, approved, completed, dismissed, blocked)."""
    updated = task_store.update_task_status(task_id, payload.status)
    if not updated:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Task with ID '{task_id}' not found.",
        )
    return updated


@router.post("/{task_id}/dismiss", response_model=QueueTask)
async def dismiss_task(task_id: str) -> QueueTask:
    """Convenience endpoint to dismiss a task so it won't be re-proposed."""
    updated = task_store.update_task_status(task_id, QueueTaskStatus.DISMISSED)
    if not updated:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Task with ID '{task_id}' not found.",
        )
    return updated


@router.delete("/{task_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_task(task_id: str):
    """Delete a task permanently from the store."""
    deleted = task_store.delete_task(task_id)
    if not deleted:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Task with ID '{task_id}' not found.",
        )
    return None


@router.post("/clear")
async def clear_workspace_tasks(
    folder_path: str = Query(..., description="Workspace directory path"),
    only_proposed: bool = Query(default=True, description="Only delete proposed tasks"),
):
    """Reset or clear tasks for a workspace."""
    try:
        resolved = validate_workspace_path(folder_path)
    except Exception as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e))

    cleared = task_store.clear_workspace_tasks(str(resolved), only_proposed=only_proposed)
    return {"message": f"Cleared {cleared} task(s).", "count": cleared}
