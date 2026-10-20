from fastapi import APIRouter, HTTPException, status
from app.models.schemas import DuplicateRequest, DuplicateResult
from app.services.duplicate_service import duplicate_service

router = APIRouter(prefix="/scan", tags=["Duplicates"])


@router.post("/duplicates", response_model=DuplicateResult)
async def scan_duplicates(payload: DuplicateRequest) -> DuplicateResult:
    """Find identical files by size and SHA-256 hash to reveal wasted space."""
    try:
        return duplicate_service.find_duplicates(
            folder_path=payload.folder_path,
            min_size_bytes=payload.min_size_bytes,
            include_hidden=payload.include_hidden,
        )
    except FileNotFoundError as e:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=str(e),
        )
    except NotADirectoryError as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(e),
        )
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Duplicate search failed: {str(e)}",
        )
