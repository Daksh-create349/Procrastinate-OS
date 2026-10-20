from datetime import datetime, timezone
from fastapi import APIRouter
from app.config import get_settings
from app.models.schemas import HealthResponse
from app.services.ollama_service import ollama_service

router = APIRouter(prefix="/health", tags=["Health"])


@router.get("", response_model=HealthResponse)
async def check_health() -> HealthResponse:
    """Return backend status, version, and local Ollama connection details."""
    settings = get_settings()
    ollama_status = await ollama_service.check_health()
    
    is_ok = ollama_status["connected"]
    overall_status = "ok" if is_ok else "degraded"

    return HealthResponse(
        status=overall_status,
        app_name=settings.APP_NAME,
        version=settings.VERSION,
        ollama_connected=ollama_status["connected"],
        ollama_url=ollama_status["url"],
        ollama_model=ollama_status["model"],
        ollama_model_present=ollama_status["model_present"],
        available_models=ollama_status["available_models"],
        timestamp=datetime.now(timezone.utc),
    )
