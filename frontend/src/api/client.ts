import type {
  ActionRecommendationsResponse,
  AIHealthStatus,
  AnalysisOptions,
  ApplyActionsResponse,
  AuditLogResponse,
  DeterministicAnalysisResult,
  DocumentExtractionResult,
  DuplicateResult,
  FilesystemActionPreview,
  FolderPickerResponse,
  ForgottenWorkRecoveryResponse,
  GenerateQueueResponse,
  HealthStatus,
  PreviewActionsResponse,
  ProcrastinationQueueResponse,
  ProposedActionItem,
  QueueTask,
  QueueTaskStatus,
  ScanProgress,
  ScanResult,
  SemanticGroupingResponse,
  UndoActionResponse,
} from '../types';

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:8000';

export async function fetchHealth(): Promise<HealthStatus> {
  const res = await fetch(`${API_BASE_URL}/api/health`);
  if (!res.ok) {
    throw new Error(`Failed to fetch health: ${res.statusText}`);
  }
  return res.json();
}

export async function pickFolderNative(): Promise<FolderPickerResponse> {
  const res = await fetch(`${API_BASE_URL}/api/scan/pick-folder`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
  });
  if (!res.ok) {
    return { supported: false, message: 'Native folder dialog failed.' };
  }
  return res.json();
}

export interface ScanRequestOptions {
  max_depth?: number;
  include_hidden?: boolean;
  min_size_bytes?: number;
  compute_hashes?: boolean;
  extract_documents?: boolean;
  max_files?: number;
  max_duration_seconds?: number;
}

export async function scanFolder(
  folderPath: string,
  options?: ScanRequestOptions
): Promise<ScanResult> {
  const payload = {
    folder_path: folderPath,
    max_depth: options?.max_depth,
    include_hidden: options?.include_hidden,
    min_size_bytes: options?.min_size_bytes,
    compute_hashes: options?.compute_hashes,
    extract_documents: options?.extract_documents,
    max_files: options?.max_files,
    max_duration_seconds: options?.max_duration_seconds,
  };
  const res = await fetch(`${API_BASE_URL}/api/scan/folder`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const errorData = await res.json().catch(() => ({}));
    throw new Error(errorData.detail || `Scan failed with status ${res.status}`);
  }
  return res.json();
}

export async function startScanJob(
  folderPath: string,
  options?: ScanRequestOptions
): Promise<{ job_id: string }> {
  const payload = {
    folder_path: folderPath,
    max_depth: options?.max_depth,
    include_hidden: options?.include_hidden,
    min_size_bytes: options?.min_size_bytes,
    compute_hashes: options?.compute_hashes,
    extract_documents: options?.extract_documents,
    max_files: options?.max_files,
    max_duration_seconds: options?.max_duration_seconds,
  };
  const res = await fetch(`${API_BASE_URL}/api/scan/jobs`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const errorData = await res.json().catch(() => ({}));
    throw new Error(errorData.detail || `Scan job creation failed: ${res.status}`);
  }
  return res.json();
}

export async function getScanProgress(jobId: string): Promise<ScanProgress> {
  const res = await fetch(`${API_BASE_URL}/api/scan/jobs/${jobId}/progress`);
  if (!res.ok) {
    throw new Error(`Progress request failed with status ${res.status}`);
  }
  return res.json();
}

export async function getScanResult(jobId: string): Promise<ScanResult> {
  const res = await fetch(`${API_BASE_URL}/api/scan/jobs/${jobId}/result`);
  if (!res.ok) {
    const errorData = await res.json().catch(() => ({}));
    throw new Error(errorData.detail || `Result request failed with status ${res.status}`);
  }
  return res.json();
}

export async function cancelScanJob(jobId: string): Promise<void> {
  await fetch(`${API_BASE_URL}/api/scan/jobs/${jobId}/cancel`, {
    method: 'POST',
  });
}

export async function scanDuplicates(folderPath: string): Promise<DuplicateResult> {
  const res = await fetch(`${API_BASE_URL}/api/scan/duplicates`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ folder_path: folderPath }),
  });
  if (!res.ok) {
    const errorData = await res.json().catch(() => ({}));
    throw new Error(errorData.detail || `Duplicate scan failed: ${res.status}`);
  }
  return res.json();
}

export async function extractDocument(
  folderPath: string,
  relativePath: string
): Promise<DocumentExtractionResult> {
  const res = await fetch(`${API_BASE_URL}/api/documents/extract`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ folder_path: folderPath, relative_path: relativePath }),
  });
  if (!res.ok) {
    const errorData = await res.json().catch(() => ({}));
    throw new Error(errorData.detail || `Extraction failed: ${res.status}`);
  }
  return res.json();
}

export async function fetchSupportedDocumentFormats(): Promise<any> {
  const res = await fetch(`${API_BASE_URL}/api/documents/supported`);
  if (!res.ok) {
    throw new Error(`Failed to fetch formats: ${res.status}`);
  }
  return res.json();
}

export async function generateActionQueue(
  folderPath: string,
  scanResult?: ScanResult
): Promise<GenerateQueueResponse> {
  const res = await fetch(`${API_BASE_URL}/api/ai/action-queue`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      folder_path: folderPath,
      scan_result: scanResult,
    }),
  });
  if (!res.ok) {
    const errorData = await res.json().catch(() => ({}));
    throw new Error(errorData.detail || `AI Action Queue generation failed: ${res.status}`);
  }
  return res.json();
}

export async function sendChatMessage(prompt: string): Promise<{ response: string; model: string }> {
  const res = await fetch(`${API_BASE_URL}/api/ai/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      messages: [{ role: 'user', content: prompt }],
    }),
  });
  if (!res.ok) {
    const errorData = await res.json().catch(() => ({}));
    throw new Error(errorData.detail || `Chat request failed: ${res.status}`);
  }
  return res.json();
}

export async function runDeterministicAnalysis(
  folderPath: string,
  options?: AnalysisOptions
): Promise<DeterministicAnalysisResult> {
  const res = await fetch(`${API_BASE_URL}/api/analysis/deterministic`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      folder_path: folderPath,
      options: options,
    }),
  });
  if (!res.ok) {
    const errorData = await res.json().catch(() => ({}));
    throw new Error(errorData.detail || `Analysis failed: ${res.status}`);
  }
  return res.json();
}

export async function fetchAnalysisRules(): Promise<any> {
  const res = await fetch(`${API_BASE_URL}/api/analysis/rules`);
  if (!res.ok) {
    throw new Error(`Failed to fetch rules: ${res.status}`);
  }
  return res.json();
}

export async function fetchAIHealth(model?: string): Promise<AIHealthStatus> {
  const url = model
    ? `${API_BASE_URL}/api/ai/health?model=${encodeURIComponent(model)}`
    : `${API_BASE_URL}/api/ai/health`;
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`AI health check failed: ${res.status}`);
  }
  return res.json();
}

export async function fetchSemanticProjectGroups(
  folderPath: string,
  model?: string,
  maxFiles: number = 20
): Promise<SemanticGroupingResponse> {
  const res = await fetch(`${API_BASE_URL}/api/ai/semantic-groups`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      folder_path: folderPath,
      model: model,
      max_files: maxFiles,
    }),
  });
  if (!res.ok) {
    const errorData = await res.json().catch(() => ({}));
    throw new Error(errorData.detail || `Semantic project grouping failed: ${res.status}`);
  }
  return res.json();
}

export async function fetchForgottenWorkRecovery(
  folderPath: string,
  model?: string,
  maxDocs: number = 20
): Promise<ForgottenWorkRecoveryResponse> {
  const res = await fetch(`${API_BASE_URL}/api/ai/forgotten-work`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      folder_path: folderPath,
      model: model,
      max_documents: maxDocs,
    }),
  });
  if (!res.ok) {
    const errorData = await res.json().catch(() => ({}));
    throw new Error(errorData.detail || `Forgotten work recovery failed: ${res.status}`);
  }
  return res.json();
}

export async function fetchActionRecommendations(
  folderPath: string,
  model?: string,
  customFocus?: string
): Promise<ActionRecommendationsResponse> {
  const res = await fetch(`${API_BASE_URL}/api/ai/recommendations`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      folder_path: folderPath,
      model: model,
      custom_focus: customFocus,
    }),
  });
  if (!res.ok) {
    const errorData = await res.json().catch(() => ({}));
    throw new Error(errorData.detail || `Action recommendations failed: ${res.status}`);
  }
  return res.json();
}

// -----------------------------------------------------------------------------
// Procrastination Queue API Methods
// -----------------------------------------------------------------------------
export async function generateProcrastinationQueue(
  folderPath: string,
  timeBudgetMinutes: number = 15,
  forceRegenerate: boolean = false,
  includeAI: boolean = true
): Promise<ProcrastinationQueueResponse> {
  const res = await fetch(`${API_BASE_URL}/api/queue/generate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      folder_path: folderPath,
      time_budget_minutes: timeBudgetMinutes,
      force_regenerate: forceRegenerate,
      include_ai_recommendations: includeAI,
    }),
  });
  if (!res.ok) {
    const errorData = await res.json().catch(() => ({}));
    throw new Error(errorData.detail || `Queue generation failed: ${res.status}`);
  }
  return res.json();
}

export async function fetchWorkspaceTasks(
  folderPath: string,
  status?: QueueTaskStatus
): Promise<QueueTask[]> {
  const query = status
    ? `?folder_path=${encodeURIComponent(folderPath)}&status=${encodeURIComponent(status)}`
    : `?folder_path=${encodeURIComponent(folderPath)}`;
  const res = await fetch(`${API_BASE_URL}/api/queue${query}`);
  if (!res.ok) {
    throw new Error(`Failed to fetch workspace tasks: ${res.status}`);
  }
  return res.json();
}

export async function updateTaskStatus(
  taskId: string,
  newStatus: QueueTaskStatus
): Promise<QueueTask> {
  const res = await fetch(`${API_BASE_URL}/api/queue/${encodeURIComponent(taskId)}/status`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ status: newStatus }),
  });
  if (!res.ok) {
    const errorData = await res.json().catch(() => ({}));
    throw new Error(errorData.detail || `Failed to update task status: ${res.status}`);
  }
  return res.json();
}

export async function dismissTask(taskId: string): Promise<QueueTask> {
  const res = await fetch(`${API_BASE_URL}/api/queue/${encodeURIComponent(taskId)}/dismiss`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
  });
  if (!res.ok) {
    const errorData = await res.json().catch(() => ({}));
    throw new Error(errorData.detail || `Failed to dismiss task: ${res.status}`);
  }
  return res.json();
}

export async function clearWorkspaceTasks(
  folderPath: string,
  onlyProposed: boolean = true
): Promise<{ message: string; count: number }> {
  const res = await fetch(
    `${API_BASE_URL}/api/queue/clear?folder_path=${encodeURIComponent(folderPath)}&only_proposed=${onlyProposed}`,
    {
      method: 'POST',
    }
  );
  if (!res.ok) {
    throw new Error(`Failed to clear tasks: ${res.status}`);
  }
  return res.json();
}

// -----------------------------------------------------------------------------
// Action System API Functions
// -----------------------------------------------------------------------------
export async function previewActions(
  folderPath: string,
  actions: ProposedActionItem[]
): Promise<PreviewActionsResponse> {
  const res = await fetch(`${API_BASE_URL}/api/actions/preview`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      workspace_path: folderPath,
      actions,
    }),
  });
  if (!res.ok) {
    const errorData = await res.json().catch(() => ({}));
    throw new Error(errorData.detail || `Action preview failed: ${res.status}`);
  }
  return res.json();
}

export async function applyActions(
  folderPath: string,
  previews: FilesystemActionPreview[],
  actionIds?: string[]
): Promise<ApplyActionsResponse> {
  const res = await fetch(`${API_BASE_URL}/api/actions/apply`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      workspace_path: folderPath,
      previews,
      action_ids: actionIds,
    }),
  });
  if (!res.ok) {
    const errorData = await res.json().catch(() => ({}));
    throw new Error(errorData.detail || `Failed to apply actions: ${res.status}`);
  }
  return res.json();
}

export async function undoAction(
  folderPath: string,
  actionId: string
): Promise<UndoActionResponse> {
  const res = await fetch(`${API_BASE_URL}/api/actions/undo`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      workspace_path: folderPath,
      action_id: actionId,
    }),
  });
  if (!res.ok) {
    const errorData = await res.json().catch(() => ({}));
    throw new Error(errorData.detail || `Undo failed: ${res.status}`);
  }
  return res.json();
}

export async function fetchAuditLog(
  folderPath: string,
  limit: number = 100
): Promise<AuditLogResponse> {
  const res = await fetch(
    `${API_BASE_URL}/api/actions/audit?workspace_path=${encodeURIComponent(folderPath)}&limit=${limit}`
  );
  if (!res.ok) {
    const errorData = await res.json().catch(() => ({}));
    throw new Error(errorData.detail || `Failed to fetch audit log: ${res.status}`);
  }
  return res.json();
}


