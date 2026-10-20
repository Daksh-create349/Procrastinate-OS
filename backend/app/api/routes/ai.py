from datetime import datetime, timezone
from pathlib import Path
from typing import Optional
from fastapi import APIRouter, HTTPException, Query, status

from app.config import get_settings
from app.models.schemas import (
    ActionRecommendationsRequest,
    ActionRecommendationsResponse,
    AIChatRequest,
    AIChatResponse,
    AIHealthStatus,
    ForgottenWorkRecoveryRequest,
    ForgottenWorkRecoveryResponse,
    GenerateQueueRequest,
    GenerateQueueResponse,
    SemanticGroupingRequest,
    SemanticGroupingResponse,
)
from app.services.duplicate_service import duplicate_service
from app.services.local_ai_service import local_ai_service
from app.services.ollama_service import ollama_service
from app.services.path_validator import validate_workspace_path
from app.services.scanner_service import scanner_service

router = APIRouter(prefix="/ai", tags=["Local AI"])


@router.get("/health", response_model=AIHealthStatus)
async def check_ai_health(model: Optional[str] = Query(default=None)) -> AIHealthStatus:
    """
    Check Ollama connection and verify configured model exists.
    Returns clear instructions to fix Ollama or pull missing model if unavailable.
    """
    return await local_ai_service.check_health(requested_model=model)


@router.post("/semantic-groups", response_model=SemanticGroupingResponse)
async def get_semantic_project_groups(payload: SemanticGroupingRequest) -> SemanticGroupingResponse:
    """
    Semantic Project Grouping:
    Analyze bounded document excerpts and suggest which files belong to the same project,
    even when filenames differ. Cites real file IDs and validates all paths on backend.
    """
    try:
        resolved_root = validate_workspace_path(payload.folder_path)
    except Exception as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e))

    # Scan folder and extract document contents safely
    scan_result = scanner_service.scan_folder(
        str(resolved_root),
        compute_hashes=True,
        extract_documents=True,
    )

    response = await local_ai_service.group_semantic_projects(
        files=scan_result.files,
        extracted_docs=scan_result.extracted_documents,
        model=payload.model,
        max_files=payload.max_files,
    )
    return response


@router.post("/forgotten-work", response_model=ForgottenWorkRecoveryResponse)
async def recover_forgotten_work(payload: ForgottenWorkRecoveryRequest) -> ForgottenWorkRecoveryResponse:
    """
    Forgotten-Work Recovery:
    Identify explicit unfinished tasks, author TODOs, unresolved questions, incomplete drafts,
    and stated next steps with supporting evidence excerpts.
    Never infers work is abandoned merely because it is old.
    """
    try:
        resolved_root = validate_workspace_path(payload.folder_path)
    except Exception as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e))

    scan_result = scanner_service.scan_folder(
        str(resolved_root),
        compute_hashes=True,
        extract_documents=True,
    )

    response = await local_ai_service.recover_forgotten_work(
        files=scan_result.files,
        extracted_docs=scan_result.extracted_documents,
        model=payload.model,
        max_documents=payload.max_documents,
    )
    return response


@router.post("/recommendations", response_model=ActionRecommendationsResponse)
async def get_action_recommendations(payload: ActionRecommendationsRequest) -> ActionRecommendationsResponse:
    """
    Action Recommendations:
    Generate a small list of actionable suggestions grounded in real workspace state
    (unfinished documents, duplicate files, large files, and clustered projects).
    """
    try:
        resolved_root = validate_workspace_path(payload.folder_path)
    except Exception as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e))

    scan_result = scanner_service.scan_folder(
        str(resolved_root),
        compute_hashes=True,
        extract_documents=True,
    )

    categories_list = [
        {"category": c.category, "count": c.count, "size": c.total_size_formatted}
        for c in scan_result.categories
    ]

    unfinished_count = len([
        f for f in scan_result.deterministic_findings
        if f.category.value == "unfinished_work"
    ])

    response = await local_ai_service.generate_action_recommendations(
        folder_path=str(resolved_root),
        files=scan_result.files,
        findings_count=len(scan_result.deterministic_findings),
        duplicate_bytes=scan_result.total_wasted_bytes,
        duplicate_formatted=scan_result.total_wasted_formatted,
        unfinished_items_count=unfinished_count,
        categories_summary=categories_list,
        model=payload.model,
        custom_focus=payload.custom_focus,
    )
    return response


@router.post("/action-queue", response_model=GenerateQueueResponse)
async def generate_action_queue(payload: GenerateQueueRequest) -> GenerateQueueResponse:
    """Generate intelligent decluttering and project recovery action queue via local Ollama."""
    scan_result = payload.scan_result
    if not scan_result:
        try:
            scan_result = scanner_service.scan_folder(payload.folder_path)
        except Exception as e:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Unable to scan folder for AI analysis: {str(e)}",
            )

    duplicates_summary = {}
    try:
        dup_result = duplicate_service.find_duplicates(payload.folder_path)
        duplicates_summary = {
            "groups_count": dup_result.groups_count,
            "total_duplicate_files": dup_result.total_duplicate_files,
            "total_wasted_bytes": dup_result.total_wasted_bytes,
            "total_wasted_formatted": dup_result.total_wasted_formatted,
        }
    except Exception:
        pass

    categories_list = [
        {"category": c.category, "count": c.count, "size": c.total_size_formatted}
        for c in scan_result.categories
    ]
    abandoned_samples = [
        {
            "name": f.name,
            "path": f.path,
            "days_inactive": f.days_inactive,
            "category": f.category,
        }
        for f in scan_result.abandoned_files[:5]
    ]

    result = await ollama_service.generate_action_queue(
        folder_path=scan_result.root_path,
        total_files=scan_result.total_files,
        total_size=scan_result.total_size_formatted,
        categories=categories_list,
        abandoned_samples=abandoned_samples,
        duplicates_summary=duplicates_summary,
    )

    return GenerateQueueResponse(
        summary=result["summary"],
        actions=result["actions"],
        model_used=result["model_used"],
        generated_at=datetime.now(timezone.utc),
    )


@router.post("/chat", response_model=AIChatResponse)
async def chat_with_procrastinate_os(payload: AIChatRequest) -> AIChatResponse:
    """Chat with the local assistant to organize files and plan cleanup."""
    settings = get_settings()
    if not payload.messages:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Messages list cannot be empty.",
        )

    system_instruction = (
        payload.system_prompt
        or "You are ProcrastinateOS, a helpful local AI assistant that organizes messy files, "
        "recovers forgotten drafts and projects, identifies duplicates, and eliminates digital procrastination. "
        "Be encouraging, concise, direct, and actionable."
    )

    conversation_history = "\n".join(
        [f"{m.role.capitalize()}: {m.content}" for m in payload.messages]
    )
    prompt = f"{conversation_history}\nAssistant:"

    try:
        reply = await ollama_service.generate_completion(
            prompt=prompt,
            system_prompt=system_instruction,
        )
        return AIChatResponse(response=reply, model=settings.OLLAMA_MODEL)
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail=f"Local inference failed: {str(e)}",
        )
