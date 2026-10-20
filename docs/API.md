# ProcrastinateOS API Reference

Base URL: `http://localhost:8000`

## Endpoints

### 1. Health & Status
#### `GET /api/health`
Checks backend operational status and detects local Ollama connectivity and model presence.

**Response `200 OK`**:
```json
{
  "status": "ok",
  "app_name": "ProcrastinateOS API",
  "version": "0.1.0",
  "ollama_connected": true,
  "ollama_url": "http://localhost:11434",
  "ollama_model": "qwen2.5:1.5b",
  "ollama_model_present": true,
  "available_models": ["qwen2.5:1.5b"],
  "timestamp": "2026-10-20T03:00:00Z"
}
```

---

### 2. Workspace Scanner Endpoints

#### `POST /api/scan/pick-folder`
Launches native macOS folder selection dialog (`choose folder`) and returns local filesystem path.

**Response `200 OK`**:
```json
{
  "selected_path": "/Users/dakshsrivastava/Projects/Notes",
  "supported": true,
  "message": "Folder selected successfully."
}
```

#### `POST /api/scan/jobs`
Starts an asynchronous background scan job with limits and security validation.

**Request Body**:
```json
{
  "folder_path": "/Users/dakshsrivastava/Downloads",
  "max_depth": 15,
  "include_hidden": false,
  "min_size_bytes": 0,
  "compute_hashes": true,
  "max_files": 50000,
  "max_duration_seconds": 60.0
}
```

**Response `200 OK`**:
```json
{
  "job_id": "scan-8f0f59ffff",
  "status": "running",
  "folder_path": "/Users/dakshsrivastava/Downloads"
}
```

#### `GET /api/scan/jobs/{job_id}/progress`
Returns real-time progress for an ongoing scan.

**Response `200 OK`**:
```json
{
  "job_id": "scan-8f0f59ffff",
  "status": "running",
  "folder_path": "/Users/dakshsrivastava/Downloads",
  "files_scanned": 124,
  "bytes_scanned": 45802100,
  "bytes_scanned_formatted": "43.7 MB",
  "current_directory": "/Users/dakshsrivastava/Downloads/Archives",
  "errors_count": 0,
  "elapsed_seconds": 1.25,
  "is_complete": false
}
```

#### `GET /api/scan/jobs/{job_id}/result`
Retrieves final scan result once `is_complete` is true.

**Response `200 OK`**:
```json
{
  "root_path": "/Users/dakshsrivastava/Downloads",
  "scanned_at": "2026-10-20T03:00:00Z",
  "duration_seconds": 1.45,
  "total_files": 150,
  "total_size_bytes": 52428800,
  "total_size_formatted": "50.0 MB",
  "categories": [
    {
      "category": "Documents",
      "count": 45,
      "total_size_bytes": 15728640,
      "total_size_formatted": "15.0 MB"
    }
  ],
  "duplicate_groups": [],
  "skipped_files": [],
  "total_wasted_bytes": 0,
  "total_wasted_formatted": "0 B",
  "files": [
    {
      "path": "/Users/dakshsrivastava/Downloads/notes.md",
      "relative_path": "notes.md",
      "name": "notes.md",
      "extension": ".md",
      "size_bytes": 1024,
      "size_formatted": "1.0 KB",
      "category": "Documents",
      "mime_type": "text/markdown",
      "content_format": "text",
      "is_previewable": true,
      "modified_at": "2026-10-20T02:00:00Z",
      "sha256": "4b5d6...",
      "days_inactive": 0,
      "is_likely_abandoned": false
    }
  ]
}
```

#### `POST /api/scan/jobs/{job_id}/cancel`
Cancels an ongoing scan job safely.

#### `POST /api/scan/folder`
Direct synchronous scan endpoint (returns `ScanResult`).

---

### 3. Duplicate Detection
#### `POST /api/scan/duplicates`
Computes SHA-256 hashes of size collisions to find byte-identical copies.

---

### 4. Local AI Action Queue
#### `POST /api/ai/action-queue`
Assembles prioritized action plan using `qwen2.5:1.5b`.

---

### 5. Local AI Chat
#### `POST /api/ai/chat`
Ask cleanup advice directly to the local model.

---

### 6. Safe Local Document Extraction

Local-first, zero-cloud text extraction for TXT, Markdown, PDF, DOCX, CSV, and JSON. All parsed document content is strictly quarantined as untrusted data context and scanned for control-tag prompt injections.

#### `GET /api/documents/supported`
Returns supported extensions, bounded processing limits, and active security feature flags.

**Response `200 OK`**:
```json
{
  "supported_extensions": [".csv", ".docx", ".json", ".markdown", ".md", ".pdf", ".txt"],
  "max_file_size_bytes": 10485760,
  "max_chars_per_doc": 60000,
  "features": {
    "pdf_text_extraction": true,
    "docx_section_extraction": true,
    "markdown_header_chunking": true,
    "csv_row_batching": true,
    "json_key_chunking": true,
    "ocr_enabled": false,
    "macro_execution_disabled": true,
    "cloud_transfer_disabled": true,
    "untrusted_prompt_injection_sanitization": true
  }
}
```

#### `POST /api/documents/extract`
Extracts bounded text chunks with page or section references from a single workspace document.

**Request Body**:
```json
{
  "folder_path": "/Users/dakshsrivastava/Projects/Notes",
  "relative_path": "quarterly_goals.md",
  "max_chars": 60000
}
```

**Response `200 OK`**:
```json
{
  "file_id": "doc_e3b0c44298fc1c14",
  "path": "/Users/dakshsrivastava/Projects/Notes/quarterly_goals.md",
  "relative_path": "quarterly_goals.md",
  "extension": ".md",
  "status": "success",
  "error_message": null,
  "total_chars": 1420,
  "total_chunks": 3,
  "sections_count": 3,
  "chunks": [
    {
      "chunk_id": "doc_e3b0c44298fc1c14_chunk_0",
      "file_id": "doc_e3b0c44298fc1c14",
      "relative_path": "quarterly_goals.md",
      "reference": "Section: Q3 Overview",
      "text": "Core development milestones for ProcrastinateOS.",
      "token_estimate": 12,
      "char_count": 48
    }
  ],
  "duration_seconds": 0.003
}
```

#### `POST /api/documents/batch-extract`
Batch extracts text chunks across multiple workspace documents with status categorization (`success`, `empty`, `password_protected`, `image_only_or_empty`, `malformed`, `skipped_size`).

**Request Body**:
```json
{
  "folder_path": "/Users/dakshsrivastava/Projects/Notes",
  "relative_paths": ["spec.md", "data.csv", "encrypted.pdf"],
  "max_files": 200,
  "max_chars_per_file": 60000
}
```

**Response `200 OK`**:
```json
{
  "total_requested": 3,
  "total_extracted": 2,
  "total_skipped": 1,
  "total_failed": 0,
  "documents": [...],
  "duration_seconds": 0.025
}
```

---

### 7. Deterministic File Analysis Engine

100% offline, reproducible, ground-truth filesystem rules. Works identically whether Ollama is connected or completely offline. Every finding maintains a strict, transparent distinction between **measured facts** and **inferred possibilities**.

#### `GET /api/analysis/rules`
Returns the complete specification of deterministic rules, default thresholds, and factual guarantees.

**Response `200 OK`**:
```json
{
  "engine": "Deterministic File Analysis Engine",
  "offline_ready": true,
  "ai_dependency": false,
  "rules": [
    {
      "category": "exact_duplicate",
      "title": "Exact SHA-256 Duplicate Detection",
      "severity_default": "high",
      "rule_logic": "Groups files sharing identical SHA-256 checksums (size > 0 bytes). Similar filenames or stems are strictly never used as proof of duplication."
    },
    {
      "category": "large_file",
      "title": "Large File Identification",
      "severity_default": "medium",
      "rule_logic": "Identifies files with size >= configurable threshold (default: 50 MB)."
    },
    {
      "category": "empty_file",
      "title": "Empty File Detection",
      "severity_default": "low",
      "rule_logic": "Flags files with 0 bytes or empty text. Distinguishes directory sentinel markers (.gitkeep, __init__.py)."
    },
    {
      "category": "redundant_export",
      "title": "Potentially Redundant Export Detection",
      "severity_default": "medium",
      "rule_logic": "Matches master editable source files (.docx, .md, .tex) with export formats (.pdf, .html), or files in build/export directories (dist/, build/)."
    },
    {
      "category": "old_file_review",
      "title": "Old File Review Candidates",
      "severity_default": "low",
      "rule_logic": "Identifies files inactive beyond threshold (default: 180 days). Strictly non-pejorative: old files are never treated as automatically useless."
    },
    {
      "category": "unfinished_work",
      "title": "Explicit Unfinished Work Marker Detection",
      "severity_default": "medium",
      "rule_logic": "Scans extracted document text for explicit author markers: TODO, FIXME, WIP, DRAFT, STUB, TBD, HOLD, UNFINISHED, XXX, and unchecked checkboxes."
    }
  ]
}
```

#### `POST /api/analysis/deterministic`
Runs deterministic analysis on a workspace folder with configurable thresholds.

**Request Body**:
```json
{
  "folder_path": "/Users/dakshsrivastava/Projects/Notes",
  "options": {
    "large_file_threshold_bytes": 52428800,
    "old_file_threshold_days": 180,
    "enable_unfinished_work_scan": true,
    "enable_export_detection": true,
    "min_duplicate_size_bytes": 1
  }
}
```

**Response `200 OK`**:
```json
{
  "root_path": "/Users/dakshsrivastava/Projects/Notes",
  "analyzed_at": "2026-10-20T03:30:00Z",
  "duration_seconds": 0.045,
  "options": { ... },
  "inventory": {
    "total_files": 42,
    "total_size_bytes": 157286400,
    "total_size_formatted": "150.0 MB",
    "category_counts": { "Documents": 30, "Code": 12 },
    "documents_extracted_count": 28
  },
  "findings": [
    {
      "finding_id": "find_exact_duplicate_8a12e34f",
      "category": "exact_duplicate",
      "severity": "high",
      "title": "Exact Duplicate: dataset.csv (2 copies)",
      "file_ids": ["id1", "id2"],
      "relative_paths": ["data/dataset.csv", "backup/dataset.csv"],
      "facts": ["SHA-256: e3b0c442...", "Size: 10.0 MB", "Wasted: 10.0 MB"],
      "explanation": "Found 2 files sharing exact SHA-256 hash 'e3b0c442...'. Reclaiming redundant copies can free 10.0 MB of disk space.",
      "recommended_next_step": "Preserve canonical copy at 'data/dataset.csv' and safely delete or symlink the 1 redundant duplicate(s).",
      "measured_facts": [
        "SHA-256 checksum: e3b0c442...",
        "Identical byte size: 10.0 MB (10485760 bytes) across 2 files",
        "Recoverable storage space: 10.0 MB (10485760 bytes)"
      ],
      "inferred_possibilities": [
        "Files share an identical cryptographic hash, indicating bit-for-bit equivalence regardless of differing filenames.",
        "Secondary copies may have resulted from repeated downloads or folder copying."
      ],
      "storage_impact_bytes": 10485760,
      "storage_impact_formatted": "10.0 MB",
      "metadata": { "sha256": "e3b0c442...", "wasted_bytes": 10485760 }
    }
  ],
  "findings_summary": {
    "total_findings": 1,
    "by_category": { "exact_duplicate": 1 },
    "by_severity": { "high": 1 },
    "total_potential_savings_bytes": 10485760,
    "total_potential_savings_formatted": "10.0 MB",
    "total_files_flagged": 2
  }
}
```

---

### 5. Local AI Integration Endpoints

All local AI endpoints use on-device Ollama (`qwen2.5:1.5b`), defend against prompt injection, and resolve paths strictly on the backend.

#### `GET /api/ai/health`
Checks Ollama daemon status and verifies presence of the configured model. Returns concrete fix instructions if offline.

**Response `200 OK`**:
```json
{
  "connected": true,
  "url": "http://localhost:11434",
  "target_model": "qwen2.5:1.5b",
  "model_present": true,
  "available_models": ["qwen2.5:1.5b:latest"],
  "fix_instructions": null
}
```

#### `POST /api/ai/semantic-groups`
Capability A: Analyzes bounded document excerpts and groups related files by semantic project or theme, even when filenames differ. Validates file IDs and resolves paths strictly on the backend.

**Request Body**:
```json
{
  "folder_path": "/Users/dakshsrivastava/Projects/MarsRover",
  "model": "qwen2.5:1.5b",
  "max_files": 20
}
```

**Response `200 OK`**:
```json
{
  "status": "success",
  "groups": [
    {
      "group_id": "proj-1",
      "project_name": "Mars Rover Mission",
      "file_ids": ["fid-rover-telemetry", "fid-hazard-specs"],
      "relative_paths": ["rover_telemetry.txt", "avionics/hazard_specs.md"],
      "confidence": "high",
      "evidence": "Shared keywords 'RedSand-4', 'terrain hazard detection', and stereoscopic calibration",
      "theme_summary": "Rover mission navigation and camera calibration"
    }
  ],
  "model_used": "qwen2.5:1.5b",
  "analyzed_documents_count": 2,
  "duration_seconds": 2.85,
  "error_message": null,
  "fix_suggestion": null
}
```

#### `POST /api/ai/forgotten-work`
Capability B: Identifies explicit unfinished tasks, author TODOs, unresolved questions, incomplete drafts, and stated next steps. Never infers work is abandoned merely because it is old.

**Request Body**:
```json
{
  "folder_path": "/Users/dakshsrivastava/Projects/MarsRover",
  "model": "qwen2.5:1.5b",
  "max_documents": 20
}
```

**Response `200 OK`**:
```json
{
  "status": "success",
  "items": [
    {
      "item_id": "fw-1",
      "title": "Calibrate stereoscopic cameras for terrain hazard detection",
      "file_id": "fid-rover-telemetry",
      "relative_path": "rover_telemetry.txt",
      "task_type": "todo",
      "evidence_excerpt": "TODO: calibrate stereoscopic cameras for terrain hazard detection",
      "section_reference": "Line 4",
      "suggested_action": "Execute calibration test with simulated Martian terrain lighting",
      "confidence": "high"
    }
  ],
  "model_used": "qwen2.5:1.5b",
  "analyzed_documents_count": 2,
  "duration_seconds": 6.9,
  "error_message": null,
  "fix_suggestion": null
}
```

#### `POST /api/ai/recommendations`
Capability C: Generates 3-5 prioritized, motivating workspace action suggestions grounded in measured facts (disk waste, unfinished tasks, clutter). Falls back to deterministic heuristics when offline.

**Request Body**:
```json
{
  "folder_path": "/Users/dakshsrivastava/Projects/MarsRover",
  "model": "qwen2.5:1.5b",
  "custom_focus": "Productivity and draft completion"
}
```

**Response `200 OK`**:
```json
{
  "status": "success",
  "summary": "Workspace contains 4 files and 4 unfinished tasks with 85 B wasted across duplicate copies.",
  "recommendations": [
    {
      "recommendation_id": "rec-1",
      "title": "Review and complete 2 unfinished tasks",
      "category": "review_unfinished",
      "priority": "medium",
      "rationale": "Completing tasks prevents feeling overwhelmed and helps maintain productivity.",
      "action_step": "Review the 2 unfinished tasks and complete them.",
      "estimated_time_minutes": 5
    }
  ],
  "model_used": "qwen2.5:1.5b",
  "duration_seconds": 4.4,
  "error_message": null,
```

---

### 6. Procrastination Queue Endpoints

The Procrastination Queue is the central decision-reduction interface of ProcrastinateOS. Tasks are packaged into manageable 5, 15, or 30-minute budgets and grounded strictly in verified findings.

#### `POST /api/queue/generate`
Generates or retrieves a budget-bounded task queue. Enforces deterministic priority ordering and effort estimates.

**Request Body**:
```json
{
  "folder_path": "/Users/dakshsrivastava/Projects/Notes",
  "time_budget_minutes": 15,
  "force_regenerate": false,
  "include_ai_recommendations": true
}
```

**Response `200 OK`**:
```json
{
  "workspace_path": "/Users/dakshsrivastava/Projects/Notes",
  "time_budget_minutes": 15,
  "total_estimated_minutes": 12,
  "tasks": [
    {
      "id": "task_duplicate_8a12e34f9a",
      "workspace_path": "/Users/dakshsrivastava/Projects/Notes",
      "title": "Review duplicate copies of dataset.csv",
      "reason": "Identical bit-for-bit copies found. Reclaiming secondary copies frees 10.0 MB.",
      "supporting_files": [
        { "file_id": "fid-1", "relative_path": "data/dataset.csv", "name": "dataset.csv" },
        { "file_id": "fid-2", "relative_path": "backup/dataset.csv", "name": "dataset.csv" }
      ],
      "evidence": "2 copies match exact cryptographic checksum e3b0c442. Recoverable: 10.0 MB.",
      "suggested_action": "Preserve canonical copy at 'data/dataset.csv' and delete 1 duplicate copy.",
      "estimated_minutes": 3,
      "effort_label": "Est. ~3 min (approximate effort)",
      "status": "proposed",
      "source_finding_id": "find_exact_duplicate_8a12e34f",
      "category": "duplicate_cleanup",
      "priority_score": 95,
      "created_at": "2026-10-20T04:30:00Z",
      "updated_at": "2026-10-20T04:30:00Z"
    }
  ],
  "completed_count": 0,
  "dismissed_count": 0,
  "summary": "Tailored 15-minute action queue containing 3 high-leverage steps (12 min estimated effort).",
  "model_used": "qwen2.5:1.5b",
  "generated_at": "2026-10-20T04:30:00Z"
}
```

#### `GET /api/queue`
Lists persisted tasks for a workspace with optional status filter (`proposed`, `approved`, `completed`, `dismissed`, `blocked`).

#### `PATCH /api/queue/{task_id}/status`
Updates task status and persists the user decision in local SQLite storage.

**Request Body**:
```json
{
  "status": "approved"
}
```

#### `POST /api/queue/{task_id}/dismiss`
Dismisses a task so it will not be proposed again on subsequent queue regenerations.

#### `DELETE /api/queue/{task_id}`
Permanently deletes a task from the persistent store.

#### `POST /api/queue/clear`
Clears workspace tasks (optionally only `proposed` tasks).




