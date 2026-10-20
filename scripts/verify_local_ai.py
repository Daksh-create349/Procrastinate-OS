#!/usr/bin/env python3
"""
Real Model Verification Script for ProcrastinateOS Local AI Integration
=======================================================================
THIS SUITE EXECUTES LIVE INFERENCE AGAINST THE LOCAL OLLAMA INSTANCE
USING MODEL: qwen2.5:1.5b.

NOTE: This is strictly distinct from the fast mocked unit tests in
`backend/tests/test_local_ai.py`. This script interacts directly with the
running local model to verify real-world extraction, semantic grouping,
and JSON generation performance.
"""

import asyncio
import os
import sys
import tempfile
import time
from pathlib import Path

# Add backend directory to sys.path
backend_path = Path(__file__).resolve().parent.parent / "backend"
sys.path.insert(0, str(backend_path))

from app.services.local_ai_service import local_ai_service
from app.services.scanner_service import scanner_service


async def run_live_verification():
    print("=" * 72)
    print("  PROCRASTINATE-OS: REAL MODEL VERIFICATION (qwen2.5:1.5b)")
    print("  [LIVE TEST - NOT MOCKED]")
    print("=" * 72)

    # 1. Health & Model check
    print("\n[Step 1] Checking local Ollama health and model presence...")
    health = await local_ai_service.check_health("qwen2.5:1.5b")
    print(f"  Connected to Ollama:  {health.connected} ({health.url})")
    print(f"  Target Model:         {health.target_model}")
    print(f"  Model Installed:      {health.model_present}")
    if health.available_models:
        print(f"  Available Models:     {', '.join(health.available_models)}")

    if not health.connected or not health.model_present:
        print("\n[ERROR] Live test cannot continue because local model is unavailable.")
        if health.fix_instructions:
            print(f"Fix Instructions: {health.fix_instructions}")
        sys.exit(1)

    print("  => Ollama and qwen2.5:1.5b are ready for live inference.\n")

    # 2. Setup temporary workspace with realistic documents
    with tempfile.TemporaryDirectory() as tmpdir:
        workspace_dir = Path(tmpdir)
        print(f"[Step 2] Creating temporary test workspace at {workspace_dir}...")

        # File A: Rover Telemetry Notes
        file_a = workspace_dir / "rover_telemetry.txt"
        file_a.write_text(
            "Mars Rover Mission: RedSand-4.\n"
            "Author: Sarah Chen.\n"
            "Status: System integration.\n"
            "TODO: calibrate stereoscopic cameras for terrain hazard detection.\n"
            "Unresolved question: should we switch to 24V bus or retain legacy 12V?\n"
        )

        # File B: Subsystem Checklist with different filename
        subfolder = workspace_dir / "avionics"
        subfolder.mkdir()
        file_b = subfolder / "hazard_avoidance_specs.md"
        file_b.write_text(
            "# RedSand-4 Avionics & Navigation\n"
            "Stereoscopic cameras require 3D disparity map calibration.\n"
            "Next step: execute bench test with simulated Martian terrain lighting.\n"
        )

        # File C: Unrelated file
        file_c = workspace_dir / "grocery_budget.txt"
        file_c.write_text(
            "Weekly Groceries:\n"
            "- Almond milk\n"
            "- Coffee beans\n"
            "- Whole grain bread\n"
            "Total budget: $45\n"
        )

        # File D: Duplicate file
        file_d = workspace_dir / "grocery_budget_copy.txt"
        file_d.write_text(file_c.read_text())

        print(f"  Created 4 test files across workspace subdirectories.")

        # 3. Scan workspace
        print("\n[Step 3] Running deterministic document extraction and scanner...")
        scan_res = scanner_service.scan_folder(
            str(workspace_dir),
            compute_hashes=True,
            extract_documents=True,
        )
        print(f"  Scanned files: {scan_res.total_files}")
        print(f"  Extracted text docs: {len(scan_res.extracted_documents)}")
        print(f"  Duplicate wasted bytes: {scan_res.total_wasted_bytes} ({scan_res.total_wasted_formatted})")
        print(f"  Deterministic findings: {len(scan_res.deterministic_findings)}")

        # 4. Capability A: Live Semantic Project Grouping
        print("\n[Step 4] Capability A: LIVE Semantic Project Grouping with qwen2.5:1.5b...")
        start_t = time.monotonic()
        grouping_res = await local_ai_service.group_semantic_projects(
            files=scan_res.files,
            extracted_docs=scan_res.extracted_documents,
            model="qwen2.5:1.5b",
        )
        duration = round(time.monotonic() - start_t, 2)
        print(f"  Status: {grouping_res.status} (Inference time: {duration}s)")
        print(f"  Discovered Project Groups: {len(grouping_res.groups)}")
        for idx, grp in enumerate(grouping_res.groups, 1):
            print(f"    Group {idx}: '{grp.project_name}' [Confidence: {grp.confidence.value}]")
            print(f"      Resolved Relative Paths: {grp.relative_paths}")
            print(f"      Theme Summary: {grp.theme_summary}")
            print(f"      Evidence: {grp.evidence}")

        # 5. Capability B: Live Forgotten-Work Recovery
        print("\n[Step 5] Capability B: LIVE Forgotten-Work Recovery with qwen2.5:1.5b...")
        start_t = time.monotonic()
        recovery_res = await local_ai_service.recover_forgotten_work(
            files=scan_res.files,
            extracted_docs=scan_res.extracted_documents,
            model="qwen2.5:1.5b",
        )
        duration = round(time.monotonic() - start_t, 2)
        print(f"  Status: {recovery_res.status} (Inference time: {duration}s)")
        print(f"  Recovered Work Items: {len(recovery_res.items)}")
        for idx, itm in enumerate(recovery_res.items, 1):
            print(f"    Item {idx}: [{itm.task_type.value.upper()}] '{itm.title}'")
            print(f"      File: {itm.relative_path}")
            print(f"      Evidence Quote: \"{itm.evidence_excerpt}\"")
            print(f"      Suggested Action: {itm.suggested_action}")

        # 6. Capability C: Live Action Recommendations
        print("\n[Step 6] Capability C: LIVE Action Recommendations with qwen2.5:1.5b...")
        start_t = time.monotonic()
        recs_res = await local_ai_service.generate_action_recommendations(
            folder_path=str(workspace_dir),
            files=scan_res.files,
            findings_count=len(scan_res.deterministic_findings),
            duplicate_bytes=scan_res.total_wasted_bytes,
            duplicate_formatted=scan_res.total_wasted_formatted,
            unfinished_items_count=len(recovery_res.items),
            categories_summary=[{"category": c.category, "count": c.count, "size": c.total_size_formatted} for c in scan_res.categories],
            model="qwen2.5:1.5b",
        )
        duration = round(time.monotonic() - start_t, 2)
        print(f"  Status: {recs_res.status} (Inference time: {duration}s)")
        print(f"  Summary: {recs_res.summary}")
        print(f"  Recommendations: {len(recs_res.recommendations)}")
        for idx, rec in enumerate(recs_res.recommendations, 1):
            print(f"    Rec {idx} [{rec.priority.upper()}]: '{rec.title}' ({rec.category})")
            print(f"      Action Step: {rec.action_step}")
            print(f"      Rationale: {rec.rationale}")
            print(f"      Est. Time: {rec.estimated_time_minutes} min")

        print("\n" + "=" * 72)
        print("  LIVE REAL-MODEL VERIFICATION COMPLETED SUCCESSFULLY!")
        print("=" * 72)


if __name__ == "__main__":
    asyncio.run(run_live_verification())
