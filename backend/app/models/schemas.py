from datetime import datetime, timezone
from enum import Enum
from typing import Any, Dict, List, Optional
from pydantic import BaseModel, Field


class HealthResponse(BaseModel):
    status: str = Field(..., description="Overall backend health status (e.g. ok, degraded)")
    app_name: str
    version: str
    ollama_connected: bool
    ollama_url: str
    ollama_model: str
    ollama_model_present: bool
    available_models: List[str] = Field(default_factory=list)
    timestamp: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))


class SkippedFile(BaseModel):
    path: str
    relative_path: str
    reason: str
    error_type: str  # permission_denied, symlink_external, symlink_cycle, file_not_found, size_limit, os_error, timeout


class ExtractionStatusEnum(str, Enum):
    SUCCESS = "success"
    EMPTY = "empty"
    PASSWORD_PROTECTED = "password_protected"
    IMAGE_ONLY_OR_EMPTY = "image_only_or_empty"
    MALFORMED = "malformed"
    SKIPPED_SIZE = "skipped_size"
    TIMEOUT = "timeout"
    UNSUPPORTED = "unsupported"
    PERMISSION_DENIED = "permission_denied"
    ERROR = "error"


class FindingCategoryEnum(str, Enum):
    EXACT_DUPLICATE = "exact_duplicate"
    LARGE_FILE = "large_file"
    EMPTY_FILE = "empty_file"
    REDUNDANT_EXPORT = "redundant_export"
    OLD_FILE_REVIEW = "old_file_review"
    UNFINISHED_WORK = "unfinished_work"


class FindingSeverityEnum(str, Enum):
    INFO = "info"
    LOW = "low"
    MEDIUM = "medium"
    HIGH = "high"


class DocumentChunk(BaseModel):
    chunk_id: str
    file_id: str
    relative_path: str
    reference: str  # e.g. "Page 1", "Section: Introduction", "Rows 1-50", "Key: data"
    text: str
    token_estimate: int
    char_count: int


class DocumentExtractionResult(BaseModel):
    file_id: str
    path: str
    relative_path: str
    extension: str
    status: ExtractionStatusEnum
    error_message: Optional[str] = None
    total_chars: int = 0
    total_chunks: int = 0
    sections_count: int = 0
    chunks: List[DocumentChunk] = Field(default_factory=list)
    duration_seconds: float = 0.0


class FileInfo(BaseModel):
    file_id: Optional[str] = None
    path: str
    relative_path: str
    name: str
    extension: str
    size_bytes: int
    size_formatted: str
    category: str
    mime_type: str
    content_format: str  # text, code, document, image, media, archive, binary
    is_previewable: bool
    created_at: Optional[datetime] = None
    modified_at: datetime
    accessed_at: Optional[datetime] = None
    sha256: Optional[str] = None
    days_inactive: int
    is_likely_abandoned: bool
    extraction_status: Optional[ExtractionStatusEnum] = None
    extracted_chars: int = 0
    extracted_chunks_count: int = 0


class CategorySummary(BaseModel):
    category: str
    count: int
    total_size_bytes: int
    total_size_formatted: str


class DuplicateGroup(BaseModel):
    checksum: str
    file_size_bytes: int
    file_size_formatted: str
    wasted_bytes: int
    wasted_formatted: str
    files: List[str]
    relative_files: List[str] = Field(default_factory=list)


class DeterministicFinding(BaseModel):
    finding_id: str
    category: FindingCategoryEnum
    severity: FindingSeverityEnum = FindingSeverityEnum.INFO
    title: str
    file_ids: List[str]
    relative_paths: List[str]
    facts: List[str]                  # Excerpts or measured numbers behind finding
    explanation: str                  # Transparent description of why rule matched
    recommended_next_step: str        # Actionable next step
    measured_facts: List[str]         # Strict distinction: measured facts
    inferred_possibilities: List[str] # Strict distinction: inferred possibilities
    storage_impact_bytes: int = 0
    storage_impact_formatted: str = "0 B"
    metadata: Dict[str, Any] = Field(default_factory=dict)


class InventorySummary(BaseModel):
    total_files: int
    total_size_bytes: int
    total_size_formatted: str
    category_counts: Dict[str, int] = Field(default_factory=dict)
    category_sizes: Dict[str, int] = Field(default_factory=dict)
    oldest_file_relative: Optional[str] = None
    oldest_file_date: Optional[datetime] = None
    newest_file_relative: Optional[str] = None
    newest_file_date: Optional[datetime] = None
    largest_file_relative: Optional[str] = None
    largest_file_size_formatted: Optional[str] = None
    documents_extracted_count: int = 0


class FindingsSummary(BaseModel):
    total_findings: int = 0
    by_category: Dict[str, int] = Field(default_factory=dict)
    by_severity: Dict[str, int] = Field(default_factory=dict)
    total_potential_savings_bytes: int = 0
    total_potential_savings_formatted: str = "0 B"
    total_files_flagged: int = 0


class AnalysisOptions(BaseModel):
    large_file_threshold_bytes: int = 50 * 1024 * 1024  # 50 MB
    old_file_threshold_days: int = 180                  # 180 days (~6 months)
    enable_unfinished_work_scan: bool = True
    enable_export_detection: bool = True
    min_duplicate_size_bytes: int = 1


class AnalyzeWorkspaceRequest(BaseModel):
    folder_path: str = Field(..., description="Root workspace folder path")
    options: Optional[AnalysisOptions] = None


class DeterministicAnalysisResult(BaseModel):
    root_path: str
    analyzed_at: datetime
    duration_seconds: float = 0.0
    options: AnalysisOptions
    inventory: InventorySummary
    findings: List[DeterministicFinding] = Field(default_factory=list)
    findings_summary: FindingsSummary


class ScanLimits(BaseModel):
    max_files: int = 50000
    max_file_size_bytes: int = 2 * 1024 * 1024 * 1024  # 2 GB
    max_depth: int = 15
    max_duration_seconds: float = 60.0
    max_extract_file_size_bytes: int = 10 * 1024 * 1024  # 10 MB limit for document parsing
    max_extract_chars_per_doc: int = 60000


class ScanRequest(BaseModel):
    folder_path: str = Field(..., description="Absolute path of the folder to scan")
    max_depth: int = Field(default=15, ge=1, le=30, description="Maximum directory traversal depth")
    include_hidden: bool = Field(default=False, description="Whether to include hidden files/folders")
    min_size_bytes: int = Field(default=0, ge=0, description="Minimum file size in bytes")
    compute_hashes: bool = Field(default=True, description="Whether to compute SHA-256 hashes for duplicates")
    extract_documents: bool = Field(default=True, description="Whether to extract bounded text from supported documents")
    max_files: int = Field(default=50000, ge=10, le=200000, description="Maximum files to scan before stopping")
    max_duration_seconds: float = Field(default=60.0, ge=5.0, le=300.0, description="Scan timeout limit")


class ScanStatusEnum(str, Enum):
    QUEUED = "queued"
    RUNNING = "running"
    COMPLETED = "completed"
    FAILED = "failed"
    CANCELLED = "cancelled"


class ScanProgress(BaseModel):
    job_id: str
    status: ScanStatusEnum
    folder_path: str
    files_scanned: int = 0
    bytes_scanned: int = 0
    bytes_scanned_formatted: str = "0 B"
    current_directory: str = ""
    errors_count: int = 0
    elapsed_seconds: float = 0.0
    is_complete: bool = False
    documents_extracted: int = 0
    error_message: Optional[str] = None


class ScanJobCreated(BaseModel):
    job_id: str
    status: ScanStatusEnum
    folder_path: str


class ScanResult(BaseModel):
    root_path: str
    scanned_at: datetime
    duration_seconds: float = 0.0
    total_files: int
    total_size_bytes: int
    total_size_formatted: str
    categories: List[CategorySummary]
    abandoned_files: List[FileInfo]
    largest_files: List[FileInfo]
    recent_files: List[FileInfo]
    duplicate_groups: List[DuplicateGroup] = Field(default_factory=list)
    skipped_files: List[SkippedFile] = Field(default_factory=list)
    total_wasted_bytes: int = 0
    total_wasted_formatted: str = "0 B"
    files: List[FileInfo] = Field(default_factory=list)
    extracted_documents: List[DocumentExtractionResult] = Field(default_factory=list)
    extraction_summary: Dict[str, int] = Field(default_factory=dict)
    deterministic_findings: List[DeterministicFinding] = Field(default_factory=list)
    findings_summary: Optional[FindingsSummary] = None
    inventory_summary: Optional[InventorySummary] = None


class DocumentExtractRequest(BaseModel):
    folder_path: str = Field(..., description="Root workspace folder path")
    relative_path: str = Field(..., description="Relative path of file to extract")
    max_chars: int = Field(default=60000, ge=1000, le=200000)


class BatchExtractRequest(BaseModel):
    folder_path: str = Field(..., description="Root workspace folder path")
    relative_paths: Optional[List[str]] = None
    max_files: int = Field(default=50, ge=1, le=200)
    max_chars_per_file: int = Field(default=60000, ge=1000, le=200000)


class BatchExtractResponse(BaseModel):
    total_requested: int
    total_extracted: int
    total_skipped: int
    total_failed: int
    documents: List[DocumentExtractionResult]
    duration_seconds: float


class DuplicateRequest(BaseModel):
    folder_path: str = Field(..., description="Absolute path of folder to scan for duplicates")
    min_size_bytes: int = Field(default=1024, ge=0, description="Minimum file size to evaluate")
    include_hidden: bool = Field(default=False)


class DuplicateResult(BaseModel):
    scanned_path: str
    scanned_at: datetime
    groups_count: int
    total_duplicate_files: int
    total_wasted_bytes: int
    total_wasted_formatted: str
    groups: List[DuplicateGroup]


class FolderPickerResponse(BaseModel):
    selected_path: Optional[str] = None
    supported: bool = True
    message: Optional[str] = None


class ActionQueueItem(BaseModel):
    id: str
    title: str
    action_type: str = "organize"
    urgency: str = "medium"
    target_path: Optional[str] = None
    estimated_time_minutes: int = 5
    ai_reasoning: str = "Helps streamline folder organization and clear mental overhead."
    completed: bool = False


class GenerateQueueRequest(BaseModel):
    folder_path: str
    scan_result: Optional[ScanResult] = None
    custom_instructions: Optional[str] = None


class GenerateQueueResponse(BaseModel):
    summary: str
    actions: List[ActionQueueItem]
    model_used: str
    generated_at: datetime


# -----------------------------------------------------------------------------
# Procrastination Queue Core Schemas
# -----------------------------------------------------------------------------
class QueueTaskStatus(str, Enum):
    PROPOSED = "proposed"
    APPROVED = "approved"
    COMPLETED = "completed"
    DISMISSED = "dismissed"
    BLOCKED = "blocked"


class SupportingFileRef(BaseModel):
    file_id: Optional[str] = None
    relative_path: str
    name: Optional[str] = None


class QueueTask(BaseModel):
    id: str
    workspace_path: str
    title: str
    reason: str
    supporting_files: List[SupportingFileRef] = Field(default_factory=list)
    evidence: str
    suggested_action: str
    estimated_minutes: int
    effort_label: str  # e.g. "Est. ~3 min (approximate effort)"
    status: QueueTaskStatus = QueueTaskStatus.PROPOSED
    source_finding_id: Optional[str] = None
    category: str = "general"
    priority_score: int = 50
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    updated_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))


class GenerateProcrastinationQueueRequest(BaseModel):
    folder_path: str
    time_budget_minutes: int = Field(default=15, description="Time budget in minutes (5, 15, or 30)")
    force_regenerate: bool = False
    include_ai_recommendations: bool = True


class ProcrastinationQueueResponse(BaseModel):
    workspace_path: str
    time_budget_minutes: int
    total_estimated_minutes: int
    tasks: List[QueueTask]
    completed_count: int
    dismissed_count: int
    summary: str
    model_used: Optional[str] = None
    generated_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))


class UpdateTaskStatusRequest(BaseModel):
    status: QueueTaskStatus



class ChatMessage(BaseModel):
    role: str
    content: str


class AIChatRequest(BaseModel):
    messages: List[ChatMessage]
    system_prompt: Optional[str] = None


class AIChatResponse(BaseModel):
    response: str
    model: str


class AIHealthStatus(BaseModel):
    connected: bool
    url: str
    target_model: str
    model_present: bool
    available_models: List[str] = Field(default_factory=list)
    fix_instructions: Optional[str] = None


class ProjectGroupConfidence(str, Enum):
    HIGH = "high"
    MEDIUM = "medium"
    LOW = "low"


class SemanticProjectGroup(BaseModel):
    group_id: str
    project_name: str
    file_ids: List[str]
    relative_paths: List[str] = Field(default_factory=list)
    confidence: ProjectGroupConfidence = ProjectGroupConfidence.MEDIUM
    evidence: str
    theme_summary: str


class SemanticGroupingRequest(BaseModel):
    folder_path: str = Field(..., description="Root folder to analyze")
    model: Optional[str] = None
    max_files: int = Field(default=20, ge=2, le=50)


class SemanticGroupingResponse(BaseModel):
    status: str
    groups: List[SemanticProjectGroup] = Field(default_factory=list)
    model_used: str
    analyzed_documents_count: int = 0
    duration_seconds: float = 0.0
    error_message: Optional[str] = None
    fix_suggestion: Optional[str] = None


class ForgottenWorkType(str, Enum):
    TODO = "todo"
    UNRESOLVED_QUESTION = "unresolved_question"
    INCOMPLETE_DRAFT = "incomplete_draft"
    NEXT_STEP = "next_step"


class ForgottenWorkItem(BaseModel):
    item_id: str
    title: str
    file_id: str
    relative_path: str = ""
    task_type: ForgottenWorkType
    evidence_excerpt: str
    section_reference: Optional[str] = None
    suggested_action: str
    confidence: str = "medium"


class ForgottenWorkRecoveryRequest(BaseModel):
    folder_path: str = Field(..., description="Root folder to analyze")
    model: Optional[str] = None
    max_documents: int = Field(default=20, ge=1, le=50)


class ForgottenWorkRecoveryResponse(BaseModel):
    status: str
    items: List[ForgottenWorkItem] = Field(default_factory=list)
    model_used: str
    analyzed_documents_count: int = 0
    duration_seconds: float = 0.0
    error_message: Optional[str] = None
    fix_suggestion: Optional[str] = None


class AIActionRecommendation(BaseModel):
    recommendation_id: str
    title: str
    category: str  # review_unfinished, duplicate_cleanup, organize_project, archive_candidate
    priority: str  # high, medium, low
    associated_file_ids: List[str] = Field(default_factory=list)
    associated_paths: List[str] = Field(default_factory=list)
    rationale: str
    action_step: str
    estimated_time_minutes: int = 5


class ActionRecommendationsRequest(BaseModel):
    folder_path: str = Field(..., description="Root folder to analyze")
    model: Optional[str] = None
    custom_focus: Optional[str] = None


class ActionRecommendationsResponse(BaseModel):
    status: str
    summary: str
    recommendations: List[AIActionRecommendation] = Field(default_factory=list)
    model_used: str
    duration_seconds: float = 0.0
    error_message: Optional[str] = None
    fix_suggestion: Optional[str] = None


# -----------------------------------------------------------------------------
# Filesystem Action System Schemas (Propose -> Preview -> Approve -> Apply -> Verify -> Undo)
# -----------------------------------------------------------------------------
class ActionOperationType(str, Enum):
    MOVE_TO_ARCHIVE = "move_to_archive"
    RENAME = "rename"


class ActionStatusEnum(str, Enum):
    PROPOSED = "proposed"
    PREVIEWED = "previewed"
    APPROVED = "approved"
    APPLYING = "applying"
    APPLIED = "applied"
    FAILED = "failed"
    UNDONE = "undone"
    UNDO_FAILED = "undo_failed"


class ProposedActionItem(BaseModel):
    proposed_id: Optional[str] = None
    operation_type: ActionOperationType
    source_relative_path: str
    target_name_or_folder: Optional[str] = None
    reason: str


class ProposeActionsRequest(BaseModel):
    workspace_path: str = Field(..., description="Root workspace folder path")
    actions: List[ProposedActionItem] = Field(..., min_length=1)


class FilesystemActionPreview(BaseModel):
    action_id: str
    workspace_path: str
    operation_type: ActionOperationType
    source_relative_path: str
    destination_relative_path: str
    source_file_exists: bool
    destination_file_exists: bool
    source_size_bytes: int
    source_size_formatted: str
    source_sha256: Optional[str] = None
    reason: str
    status: ActionStatusEnum = ActionStatusEnum.PREVIEWED
    can_apply: bool
    warnings: List[str] = Field(default_factory=list)
    validation_error: Optional[str] = None


class PreviewActionsResponse(BaseModel):
    workspace_path: str
    total_previewed: int
    can_apply_count: int
    has_collisions: bool
    previews: List[FilesystemActionPreview]


class ApplyActionsRequest(BaseModel):
    workspace_path: str = Field(..., description="Root workspace folder path")
    action_ids: Optional[List[str]] = Field(default=None, description="Explicitly approved action IDs to apply")
    previews: List[FilesystemActionPreview] = Field(..., min_length=1, description="Previewed actions with verified source/destination")


class ActionExecutionResult(BaseModel):
    action_id: str
    operation_type: ActionOperationType
    source_relative_path: str
    destination_relative_path: str
    success: bool
    status: ActionStatusEnum
    error_message: Optional[str] = None
    verified: bool = False
    timestamp: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))


class ApplyBatchStatus(str, Enum):
    ALL_SUCCEEDED = "all_succeeded"
    PARTIALLY_SUCCEEDED = "partially_succeeded"
    ALL_FAILED = "all_failed"


class ApplyActionsResponse(BaseModel):
    batch_id: str
    workspace_path: str
    batch_status: ApplyBatchStatus
    total_requested: int
    succeeded_count: int
    failed_count: int
    results: List[ActionExecutionResult]


class UndoActionRequest(BaseModel):
    workspace_path: str = Field(..., description="Root workspace folder path")
    action_id: str = Field(..., description="Action ID to undo")


class UndoActionResponse(BaseModel):
    action_id: str
    success: bool
    status: ActionStatusEnum
    message: str
    error_message: Optional[str] = None
    source_relative_path: str
    destination_relative_path: str


class ActionAuditRecord(BaseModel):
    action_id: str
    batch_id: Optional[str] = None
    workspace_path: str
    operation_type: ActionOperationType
    source_relative_path: str
    destination_relative_path: str
    file_size_bytes: int
    pre_hash: Optional[str] = None
    post_hash: Optional[str] = None
    reason: str
    status: ActionStatusEnum
    error_message: Optional[str] = None
    can_undo: bool = False
    created_at: datetime
    applied_at: Optional[datetime] = None
    undone_at: Optional[datetime] = None


class AuditLogResponse(BaseModel):
    workspace_path: str
    records: List[ActionAuditRecord]
    total_count: int


