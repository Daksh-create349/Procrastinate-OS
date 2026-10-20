from datetime import datetime, timezone
import time
from fastapi import APIRouter, HTTPException, status

from app.models.schemas import (
    AnalyzeWorkspaceRequest,
    DeterministicAnalysisResult,
    FindingCategoryEnum,
    FindingSeverityEnum,
)
from app.services.analysis_engine import analysis_engine
from app.services.path_validator import validate_workspace_path
from app.services.scanner_service import scanner_service

router = APIRouter(prefix="/analysis", tags=["Deterministic Analysis"])


@router.get("/rules")
async def get_analysis_rules():
    """
    Return documented rules and factual guarantees for deterministic analysis.
    Transparently explains how every finding is categorized and calculated.
    """
    return {
        "engine": "Deterministic File Analysis Engine",
        "offline_ready": True,
        "ai_dependency": False,
        "rules": [
            {
                "category": FindingCategoryEnum.EXACT_DUPLICATE.value,
                "title": "Exact SHA-256 Duplicate Detection",
                "severity_default": FindingSeverityEnum.HIGH.value,
                "rule_logic": "Groups files sharing identical SHA-256 checksums (size > 0 bytes). "
                              "Similar filenames or stems are strictly never used as proof of duplication.",
                "measured_facts": ["SHA-256 hash", "Byte-identical file size", "Wasted disk space", "File paths"],
                "inferred_possibilities": ["Secondary copies are likely redundant backups, repeated downloads, or copies."],
            },
            {
                "category": FindingCategoryEnum.LARGE_FILE.value,
                "title": "Large File Identification",
                "severity_default": FindingSeverityEnum.MEDIUM.value,
                "rule_logic": "Identifies files with size >= configurable threshold (default: 50 MB).",
                "measured_facts": ["File size in bytes", "Configured threshold", "Extension", "Last modified timestamp"],
                "inferred_possibilities": ["May be an uncompressed video, database dump, virtual image, or weight file."],
            },
            {
                "category": FindingCategoryEnum.EMPTY_FILE.value,
                "title": "Empty File Detection",
                "severity_default": FindingSeverityEnum.LOW.value,
                "rule_logic": "Flags files with 0 bytes on disk or extractable documents with 0 text characters. "
                              "Distinguishes directory sentinel markers (.gitkeep, __init__.py) with INFO severity.",
                "measured_facts": ["0 physical bytes or 0 extracted text chars", "Sentinel marker boolean"],
                "inferred_possibilities": ["Abandoned placeholder, failed download, or deliberate directory keeper."],
            },
            {
                "category": FindingCategoryEnum.REDUNDANT_EXPORT.value,
                "title": "Potentially Redundant Export Detection",
                "severity_default": FindingSeverityEnum.MEDIUM.value,
                "rule_logic": "Matches master editable source files (.docx, .md, .tex) with export formats (.pdf, .html), "
                              "or identifies files located in build/export directories (dist/, build/, export/). "
                              "Checks modification time to note if export is older than source (stale).",
                "measured_facts": ["Master source path", "Derived export path", "File sizes", "Relative modification age"],
                "inferred_possibilities": ["Export may be reproducible on demand from source; stale exports may reflect outdated drafts."],
            },
            {
                "category": FindingCategoryEnum.OLD_FILE_REVIEW.value,
                "title": "Old File Review Candidates",
                "severity_default": FindingSeverityEnum.LOW.value,
                "rule_logic": "Identifies files inactive beyond threshold (default: 180 days). "
                              "Strictly non-pejorative: old files are never treated as automatically useless or abandoned.",
                "measured_facts": ["Last modified timestamp", "Exact days inactive", "File category and size"],
                "inferred_possibilities": ["Could be finished reference work, stable frozen asset, or forgotten draft."],
            },
            {
                "category": FindingCategoryEnum.UNFINISHED_WORK.value,
                "title": "Explicit Unfinished Work Marker Detection",
                "severity_default": FindingSeverityEnum.MEDIUM.value,
                "rule_logic": "Scans extracted document text and code for explicit author markers: "
                              "TODO, FIXME, WIP, DRAFT, STUB, TBD, HOLD, UNFINISHED, XXX, and unchecked markdown checkboxes.",
                "measured_facts": ["Marker keyword", "Location/Section reference", "Bounded source excerpt snippet"],
                "inferred_possibilities": ["Author left explicit note for pending implementation, blocker, or draft section."],
            },
        ],
    }


@router.post("/deterministic", response_model=DeterministicAnalysisResult)
async def run_deterministic_analysis(payload: AnalyzeWorkspaceRequest) -> DeterministicAnalysisResult:
    """
    Run deterministic file analysis on a local workspace folder.
    Operates 100% offline without Ollama or external models.
    """
    try:
        resolved_root = validate_workspace_path(payload.folder_path)
    except Exception as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e))

    # Perform folder scan to collect files and extracted docs
    scan_result = scanner_service.scan_folder(
        folder_path=str(resolved_root),
        compute_hashes=True,
        extract_documents=True,
    )

    # Run analysis engine with options
    result = analysis_engine.analyze(
        root_path=str(resolved_root),
        files=scan_result.files,
        extracted_docs=scan_result.extracted_documents,
        options=payload.options,
    )

    return result
