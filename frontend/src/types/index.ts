export interface HealthStatus {
  status: string;
  app_name: string;
  version: string;
  ollama_connected: boolean;
  ollama_url: string;
  ollama_model: string;
  ollama_model_present: boolean;
  available_models: string[];
  timestamp: string;
}

export interface SkippedFile {
  path: string;
  relative_path: string;
  reason: string;
  error_type: string;
}

export type ExtractionStatus =
  | 'success'
  | 'empty'
  | 'password_protected'
  | 'image_only_or_empty'
  | 'malformed'
  | 'skipped_size'
  | 'timeout'
  | 'unsupported'
  | 'permission_denied'
  | 'error';

export interface DocumentChunk {
  chunk_id: string;
  file_id: string;
  relative_path: string;
  reference: string;
  text: string;
  token_estimate: number;
  char_count: number;
}

export interface DocumentExtractionResult {
  file_id: string;
  path: string;
  relative_path: string;
  extension: string;
  status: ExtractionStatus;
  error_message?: string;
  total_chars: number;
  total_chunks: number;
  sections_count: number;
  chunks: DocumentChunk[];
  duration_seconds: number;
}

export interface FileInfo {
  file_id?: string;
  path: string;
  relative_path: string;
  name: string;
  extension: string;
  size_bytes: number;
  size_formatted: string;
  category: string;
  mime_type: string;
  content_format: 'text' | 'code' | 'document' | 'image' | 'media' | 'archive' | 'binary' | string;
  is_previewable: boolean;
  created_at?: string;
  modified_at: string;
  accessed_at?: string;
  sha256?: string;
  days_inactive: number;
  is_likely_abandoned: boolean;
  extraction_status?: ExtractionStatus;
  extracted_chars?: number;
  extracted_chunks_count?: number;
}

export interface CategorySummary {
  category: string;
  count: number;
  total_size_bytes: number;
  total_size_formatted: string;
}

export interface DuplicateGroup {
  checksum: string;
  file_size_bytes: number;
  file_size_formatted: string;
  wasted_bytes: number;
  wasted_formatted: string;
  files: string[];
  relative_files?: string[];
}

export type FindingCategory =
  | 'exact_duplicate'
  | 'large_file'
  | 'empty_file'
  | 'redundant_export'
  | 'old_file_review'
  | 'unfinished_work';

export type FindingSeverity = 'info' | 'low' | 'medium' | 'high';

export interface DeterministicFinding {
  finding_id: string;
  category: FindingCategory;
  severity: FindingSeverity;
  title: string;
  file_ids: string[];
  relative_paths: string[];
  facts: string[];
  explanation: string;
  recommended_next_step: string;
  measured_facts: string[];
  inferred_possibilities: string[];
  storage_impact_bytes: number;
  storage_impact_formatted: string;
  metadata?: Record<string, any>;
}

export interface InventorySummary {
  total_files: number;
  total_size_bytes: number;
  total_size_formatted: string;
  category_counts: Record<string, number>;
  category_sizes: Record<string, number>;
  oldest_file_relative?: string;
  oldest_file_date?: string;
  newest_file_relative?: string;
  newest_file_date?: string;
  largest_file_relative?: string;
  largest_file_size_formatted?: string;
  documents_extracted_count: number;
}

export interface FindingsSummary {
  total_findings: number;
  by_category: Record<string, number>;
  by_severity: Record<string, number>;
  total_potential_savings_bytes: number;
  total_potential_savings_formatted: string;
  total_files_flagged: number;
}

export interface AnalysisOptions {
  large_file_threshold_bytes?: number;
  old_file_threshold_days?: number;
  enable_unfinished_work_scan?: boolean;
  enable_export_detection?: boolean;
  min_duplicate_size_bytes?: number;
}

export interface DeterministicAnalysisResult {
  root_path: string;
  analyzed_at: string;
  duration_seconds: number;
  options: AnalysisOptions;
  inventory: InventorySummary;
  findings: DeterministicFinding[];
  findings_summary: FindingsSummary;
}

export interface ScanResult {
  root_path: string;
  scanned_at: string;
  duration_seconds: number;
  total_files: number;
  total_size_bytes: number;
  total_size_formatted: string;
  categories: CategorySummary[];
  abandoned_files: FileInfo[];
  largest_files: FileInfo[];
  recent_files: FileInfo[];
  duplicate_groups: DuplicateGroup[];
  skipped_files: SkippedFile[];
  total_wasted_bytes: number;
  total_wasted_formatted: string;
  files: FileInfo[];
  extracted_documents?: DocumentExtractionResult[];
  extraction_summary?: Record<string, number>;
  deterministic_findings?: DeterministicFinding[];
  findings_summary?: FindingsSummary;
  inventory_summary?: InventorySummary;
}

export interface ScanProgress {
  job_id: string;
  status: 'queued' | 'running' | 'completed' | 'failed' | 'cancelled';
  folder_path: string;
  files_scanned: number;
  bytes_scanned: number;
  bytes_scanned_formatted: string;
  current_directory: string;
  errors_count: number;
  elapsed_seconds: number;
  is_complete: boolean;
  documents_extracted?: number;
  error_message?: string;
}

export interface FolderPickerResponse {
  selected_path?: string;
  supported: boolean;
  message?: string;
}

export interface DuplicateResult {
  scanned_path: string;
  scanned_at: string;
  groups_count: number;
  total_duplicate_files: number;
  total_wasted_bytes: number;
  total_wasted_formatted: string;
  groups: DuplicateGroup[];
}

export interface ActionQueueItem {
  id: string;
  title: string;
  action_type: 'organize' | 'review' | 'delete_duplicates' | 'archive' | 'resume_project' | string;
  urgency: 'high' | 'medium' | 'low';
  target_path?: string;
  estimated_time_minutes: number;
  ai_reasoning: string;
  completed?: boolean;
}

export interface GenerateQueueResponse {
  summary: string;
  actions: ActionQueueItem[];
  model_used: string;
  generated_at: string;
}

// -----------------------------------------------------------------------------
// Procrastination Queue Core Types
// -----------------------------------------------------------------------------
export type QueueTaskStatus = 'proposed' | 'approved' | 'completed' | 'dismissed' | 'blocked';

export interface SupportingFileRef {
  file_id?: string;
  relative_path: string;
  name?: string;
}

export interface QueueTask {
  id: string;
  workspace_path: string;
  title: string;
  reason: string;
  supporting_files: SupportingFileRef[];
  evidence: string;
  suggested_action: string;
  estimated_minutes: number;
  effort_label: string;
  status: QueueTaskStatus;
  source_finding_id?: string;
  category: string;
  priority_score: number;
  created_at: string;
  updated_at: string;
}

export interface ProcrastinationQueueResponse {
  workspace_path: string;
  time_budget_minutes: number;
  total_estimated_minutes: number;
  tasks: QueueTask[];
  completed_count: number;
  dismissed_count: number;
  summary: string;
  model_used?: string;
  generated_at: string;
}

export interface AIHealthStatus {
  connected: boolean;
  url: string;
  target_model: string;
  model_present: boolean;
  available_models: string[];
  fix_instructions?: string;
}

export type ProjectGroupConfidence = 'high' | 'medium' | 'low';

export interface SemanticProjectGroup {
  group_id: string;
  project_name: string;
  file_ids: string[];
  relative_paths: string[];
  confidence: ProjectGroupConfidence;
  evidence: string;
  theme_summary: string;
}

export interface SemanticGroupingResponse {
  status: string;
  groups: SemanticProjectGroup[];
  model_used: string;
  analyzed_documents_count?: number;
  duration_seconds: number;
  error_message?: string;
  fix_suggestion?: string;
}

export type ForgottenWorkType = 'todo' | 'unresolved_question' | 'incomplete_draft' | 'next_step';

export interface ForgottenWorkItem {
  item_id: string;
  title: string;
  file_id: string;
  relative_path: string;
  task_type: ForgottenWorkType;
  evidence_excerpt: string;
  section_reference?: string;
  suggested_action: string;
  confidence: string;
}

export interface ForgottenWorkRecoveryResponse {
  status: string;
  items: ForgottenWorkItem[];
  model_used: string;
  analyzed_documents_count?: number;
  duration_seconds: number;
  error_message?: string;
  fix_suggestion?: string;
}

export interface AIActionRecommendation {
  recommendation_id: string;
  title: string;
  category: string;
  priority: 'high' | 'medium' | 'low' | string;
  associated_file_ids: string[];
  associated_paths: string[];
  rationale: string;
  action_step: string;
  estimated_time_minutes: number;
}

export interface ActionRecommendationsResponse {
  status: string;
  summary: string;
  recommendations: AIActionRecommendation[];
  model_used: string;
  duration_seconds: number;
  error_message?: string;
  fix_suggestion?: string;
}

// -----------------------------------------------------------------------------
// Filesystem Action System Types
// -----------------------------------------------------------------------------
export type ActionOperationType = 'move_to_archive' | 'rename';

export type ActionStatus =
  | 'proposed'
  | 'previewed'
  | 'approved'
  | 'applying'
  | 'applied'
  | 'failed'
  | 'undone'
  | 'undo_failed';

export interface ProposedActionItem {
  proposed_id?: string;
  operation_type: ActionOperationType;
  source_relative_path: string;
  target_name_or_folder?: string;
  reason: string;
}

export interface ProposeActionsRequest {
  workspace_path: string;
  actions: ProposedActionItem[];
}

export interface FilesystemActionPreview {
  action_id: string;
  workspace_path: string;
  operation_type: ActionOperationType;
  source_relative_path: string;
  destination_relative_path: string;
  source_file_exists: boolean;
  destination_file_exists: boolean;
  source_size_bytes: number;
  source_size_formatted: string;
  source_sha256?: string;
  reason: string;
  status: ActionStatus;
  can_apply: boolean;
  warnings: string[];
  validation_error?: string;
}

export interface PreviewActionsResponse {
  workspace_path: string;
  total_previewed: number;
  can_apply_count: number;
  has_collisions: boolean;
  previews: FilesystemActionPreview[];
}

export interface ApplyActionsRequest {
  workspace_path: string;
  action_ids?: string[];
  previews: FilesystemActionPreview[];
}

export interface ActionExecutionResult {
  action_id: string;
  operation_type: ActionOperationType;
  source_relative_path: string;
  destination_relative_path: string;
  success: boolean;
  status: ActionStatus;
  error_message?: string;
  verified: boolean;
  timestamp: string;
}

export type ApplyBatchStatus = 'all_succeeded' | 'partially_succeeded' | 'all_failed';

export interface ApplyActionsResponse {
  batch_id: string;
  workspace_path: string;
  batch_status: ApplyBatchStatus;
  total_requested: number;
  succeeded_count: number;
  failed_count: number;
  results: ActionExecutionResult[];
}

export interface UndoActionRequest {
  workspace_path: string;
  action_id: string;
}

export interface UndoActionResponse {
  action_id: string;
  success: boolean;
  status: ActionStatus;
  message: string;
  error_message?: string;
  source_relative_path: string;
  destination_relative_path: string;
}

export interface ActionAuditRecord {
  action_id: string;
  batch_id?: string;
  workspace_path: string;
  operation_type: ActionOperationType;
  source_relative_path: string;
  destination_relative_path: string;
  file_size_bytes: number;
  pre_hash?: string;
  post_hash?: string;
  reason: string;
  status: ActionStatus;
  error_message?: string;
  can_undo: boolean;
  created_at: string;
  applied_at?: string;
  undone_at?: string;
}

export interface AuditLogResponse {
  workspace_path: string;
  records: ActionAuditRecord[];
  total_count: number;
}

