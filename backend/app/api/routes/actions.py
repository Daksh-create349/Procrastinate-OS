from typing import Optional
from fastapi import APIRouter, HTTPException, Query, status

from app.models.schemas import (
    ActionAuditRecord,
    ApplyActionsRequest,
    ApplyActionsResponse,
    AuditLogResponse,
    PreviewActionsResponse,
    ProposeActionsRequest,
    UndoActionRequest,
    UndoActionResponse,
)
from app.services.action_service import ActionService
from app.services.action_store import ActionStore

router = APIRouter(prefix="/actions", tags=["Filesystem Actions"])

# Global singleton action service
_action_store = ActionStore()
_action_service = ActionService(action_store=_action_store)


def get_action_service() -> ActionService:
    return _action_service


@router.post(
    "/preview",
    response_model=PreviewActionsResponse,
    summary="Propose and preview filesystem actions with strict validation",
)
async def preview_actions(request: ProposeActionsRequest):
    """
    Validate proposed actions against workspace security constraints.
    Checks source files, computes SHA-256 hashes, precomputes destinations,
    and flags any collisions without modifying the filesystem.
    """
    try:
        service = get_action_service()
        return service.preview_actions_batch(request)
    except (ValueError, FileNotFoundError, PermissionError) as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc))
    except Exception as exc:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Preview generation failed: {str(exc)}",
        )


@router.post(
    "/apply",
    response_model=ApplyActionsResponse,
    summary="Explicitly approve and execute previewed actions with immediate revalidation",
)
async def apply_actions(request: ApplyActionsRequest):
    """
    Applies approved filesystem actions with immediate pre-execution revalidation.
    Guarantees:
    - Never overwrites existing files.
    - Revalidates file state and SHA-256 immediately before applying.
    - Verifies destination exists and matches hash post-apply.
    - Accurately tracks partial failures.
    """
    try:
        service = get_action_service()
        return service.apply_actions(request)
    except (ValueError, FileNotFoundError, PermissionError) as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc))
    except Exception as exc:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Apply failed: {str(exc)}",
        )


@router.post(
    "/undo",
    response_model=UndoActionResponse,
    summary="Safely revert an applied action if filesystem state is still valid",
)
async def undo_action(request: UndoActionRequest):
    """
    Reverts an applied move or rename operation safely.
    Refuses undo if destination was modified or if original path is occupied.
    """
    try:
        service = get_action_service()
        response = service.undo_action(request)
        if not response.success:
            raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=response.message)
        return response
    except HTTPException:
        raise
    except (ValueError, FileNotFoundError, PermissionError) as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc))
    except Exception as exc:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Undo failed: {str(exc)}",
        )


@router.get(
    "/audit",
    response_model=AuditLogResponse,
    summary="Retrieve persistent audit log for the workspace",
)
@router.get(
    "/audit-log",
    response_model=AuditLogResponse,
    include_in_schema=False,
)
async def get_audit_log(
    workspace_path: str = Query(..., description="Root workspace folder path"),
    limit: int = Query(default=100, ge=1, le=500),
):
    """
    Fetch the persistent audit manifest for the current workspace.
    Recovers any interrupted actions if the server was restarted mid-operation.
    """
    try:
        service = get_action_service()
        try:
            from app.services.path_validator import validate_workspace_path
            resolved_root = str(validate_workspace_path(workspace_path))
        except Exception:
            resolved_root = workspace_path
        service.recover_interrupted_actions(resolved_root)
        records = service.action_store.get_workspace_audit_log(resolved_root, limit=limit)
        return AuditLogResponse(
            workspace_path=resolved_root,
            records=records,
            total_count=len(records),
        )
    except (ValueError, FileNotFoundError, PermissionError) as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc))
    except Exception as exc:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Audit fetch failed: {str(exc)}",
        )
