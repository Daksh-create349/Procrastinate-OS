# Local AI Setup & Architecture (Ollama + qwen2.5:1.5b)

ProcrastinateOS operates 100% locally with zero cloud API keys, zero remote tracking, and zero paid subscriptions. It pairs an offline deterministic file engine with on-device LLM inference using **Ollama** and **`qwen2.5:1.5b`**.

---

## 1. Quick Verification & Setup

### Check Ollama Status
```bash
curl http://localhost:11434/api/tags
```

### If Ollama Is Offline
Launch the Ollama desktop application or run:
```bash
ollama serve
```

### If `qwen2.5:1.5b` Is Missing
ProcrastinateOS will **never** automatically download models in the background without explicit user action. If the model is missing, pull it in your terminal:
```bash
ollama pull qwen2.5:1.5b
```

Verify installed models:
```bash
ollama list
```
Expected output:
```text
NAME            ID              SIZE      MODIFIED
qwen2.5:1.5b    65ec06548149    986 MB    ...
```

---

## 2. Dedicated Local AI Capabilities

### Capability A: Semantic Project Grouping (`POST /api/ai/semantic-groups`)
- Analyzes bounded document excerpts (up to 20 files, 600 chars per excerpt).
- Clusters related files into coherent projects even when filenames differ (e.g., `telemetry.txt` and `camera_specs.md`).
- Returns structured JSON containing project titles, confidence levels, thematic summaries, and supporting evidence.
- **Security & Validation**: Hallucinated file IDs are strictly filtered. Paths are resolved **only** on the backend from verified `file_id` records in the scanner registry. Groups with `< 2` verified files are discarded.

### Capability B: Forgotten-Work Recovery (`POST /api/ai/forgotten-work`)
- Scans bounded document slices for explicit unfinished tasks, author TODOs, unresolved questions, incomplete drafts, and stated next steps.
- Captures exact verbatim evidence quotes with section/page references.
- **Objective Non-Abandonment Rule**: The model is strictly instructed never to infer that work is abandoned merely because a file or timestamp is old. Only explicit textual evidence is surfaced.

### Capability C: Action Recommendations (`POST /api/ai/recommendations`)
- Generates 3-5 prioritized, motivating workspace suggestions grounded in real measured facts (duplicate disk waste, unfinished TODO count, largest file footprint).
- Includes categories (`duplicate_cleanup`, `review_unfinished`, `organize_project`, `archive_candidate`), priority, rationale, estimated time in minutes, and concrete next action steps.
- **Offline Decoupling**: If Ollama is offline or inference times out, deterministic fallback recommendations are generated instantly so the user is never blocked.

---

## 3. Security & Safety Architecture

1. **Untrusted Input Boundaries**: All document text extracted from the user's workspace is treated as untrusted data. Context is wrapped in `<untrusted_document_context file_id="..." filename="...">` boundaries with explicit system prompts to ignore embedded instructions.
2. **Control Token Sanitization**: ChatML / Llama / Qwen control tokens (such as `<|im_start|>`, `<|im_end|>`, `<system>`) are stripped prior to inference.
3. **Backend-Only Path Resolution**: The LLM is never allowed to execute filesystem commands or return trusted filesystem paths. File paths are resolved solely by mapping valid backend `file_id`s.
4. **Single-Retry Resilience**: If the model emits malformed JSON or markdown chatter, the service automatically performs a single targeted JSON repair retry before reporting failure.
5. **No Silent Remote Fallback**: The system will **never** send workspace text or file contents to cloud APIs. If local inference fails, deterministic scanning and offline features remain 100% operational.

---

## 4. Configuration Reference

Backend configuration resides in `backend/app/config.py` and can be overridden via `.env`:

| Setting | Default | Description |
|---|---|---|
| `OLLAMA_BASE_URL` | `http://localhost:11434` | Local Ollama HTTP daemon endpoint |
| `OLLAMA_MODEL` | `qwen2.5:1.5b` | Configured local model name |
| `OLLAMA_TIMEOUT_SECONDS` | `60.0` | Maximum timeout for local inference |
| `OLLAMA_MAX_TOKENS` | `2048` | Maximum generation token budget |
| `OLLAMA_MAX_BATCH_EXCERPTS`| `20` | Maximum document excerpts sent in single prompt |
| `OLLAMA_MAX_EXCERPT_CHARS` | `600` | Maximum characters per document excerpt |
| `OLLAMA_MAX_RETRIES` | `1` | Maximum JSON parse retry attempts |

---

## 5. Testing & Verification

### Mocked Unit & Integration Tests (Fast, Offline)
Tests all error paths, hallucination filtration, retry logic, and offline fallbacks without requiring a live Ollama daemon:
```bash
./backend/venv/bin/pytest backend/tests/test_local_ai.py -v
```

### Live Model Verification (`qwen2.5:1.5b` Real Inference)
Executes live inference against the actual local Ollama daemon and measures real-world prompt, grouping, and recovery times:
```bash
./backend/venv/bin/python scripts/verify_local_ai.py
```
