# Contributing to ProcrastinateOS

Thank you for your interest in contributing to ProcrastinateOS! We welcome contributions from developers, designers, and systems engineers.

---

## 1. Core Engineering Principles

Before contributing code, please ensure your design respects these non-negotiable principles:

1. **Local-First & Private**: No files, text, metadata, or telemetry ever leave the user's computer. Cloud AI network calls are strictly forbidden in core features.
2. **Deterministic-First**: The application must remain fully functional and useful even if Ollama is not installed or offline. All core rules (duplicates, large files, sentinels, TODOs) must be deterministic and testable.
3. **Safety & Zero Data Loss**: Files are never permanently deleted (`rm` is disabled). Filesystem changes require explicit user preview and approval, are verified with SHA-256 hashes, and support 1-click undo.
4. **Honest UX**: No fake progress bars, placeholder screens, or hallucinated productivity metrics. Distinguish measured facts from inferred possibilities.

---

## 2. Developer Setup

### Prerequisites
* macOS or Linux
* Python 3.10+ (tested with Python 3.11)
* Node.js 18+ (tested with Node 20+) and npm
* [Ollama](https://ollama.com) with model `qwen2.5:1.5b` (`ollama pull qwen2.5:1.5b`)

### Initial Workspace Setup

1. **Clone the repository**:
   ```bash
   git clone https://github.com/Daksh-create349/Procrastinate-OS.git
   cd Procrastinate-OS
   ```

2. **Setup Backend**:
   ```bash
   cd backend
   python3.11 -m venv venv
   source venv/bin/activate
   pip install -r requirements.txt
   ```

3. **Setup Frontend**:
   ```bash
   cd ../frontend
   npm install
   ```

---

## 3. Running Locally

* **Terminal 1: Start Backend**
  ```bash
  cd backend
  source venv/bin/activate
  uvicorn app.main:app --host 127.0.0.1 --port 8000 --reload
  ```

* **Terminal 2: Start Frontend**
  ```bash
  cd frontend
  npm run dev
  ```

* **Terminal 3: Start Ollama**
  ```bash
  ollama serve
  ```

Open `http://localhost:5173` in your browser.

---

## 4. Verification & Testing

Every Pull Request must pass all test suites, type-checks, and builds:

### Full Backend & Integration Test Suite (77 Tests)
```bash
./backend/venv/bin/pytest backend/tests tests/integration -v
```

### Type Checking (Pyright)
```bash
npx pyright backend scripts tests
```

### Frontend Unit & Component Tests (Vitest)
```bash
cd frontend
npm test -- --run
```

### Frontend Production Bundle Build
```bash
cd frontend
npm run build
```

### End-to-End Walkthrough Script
```bash
./backend/venv/bin/python scripts/demo_walkthrough.py
```

---

## 5. Contribution Workflow

1. Fork the repository and create a descriptive branch:
   ```bash
   git checkout -b feature/your-feature-name
   ```
2. Write clean code following existing conventions:
   - Python: PEP 8, strict type hints, Pydantic v2 schemas.
   - React: TypeScript, no ad-hoc inline styles, maintain the forest-green and off-white design tokens in `index.css`.
3. Add corresponding unit or integration tests for any new endpoints or views.
4. Run all verification commands listed in Section 4.
5. Submit a pull request with a clear description of the problem solved, testing evidence, and screenshots of UI changes.
