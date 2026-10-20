#!/usr/bin/env python3
"""
ProcrastinateOS Reproducible Demo Walkthrough
--------------------------------------------
Demonstrates end-to-end local workflow:
1. Health & local Ollama model connection
2. Safe workspace scanning (confinement, limits, SHA-256)
3. Safe document text extraction (MD, TXT, JSON, DOCX, PDF)
4. Deterministic finding analysis (duplicates, large files, explicit TODOs)
5. Local AI semantic groupings & forgotten work revival
6. Action queue generation across time budgets (5, 15, 30 mins)
7. Propose -> Preview -> Approve -> Execute filesystem action
8. Verify physical filesystem modification
9. Undo action and verify restoration
10. Query persistent SQLite audit manifest
"""
import asyncio
import os
import sys
from pathlib import Path
from httpx import ASGITransport, AsyncClient

# Add backend directory to sys.path
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "backend")))

from app.main import app


async def run_demo():
    print("=" * 70)
    print("  ProcrastinateOS: End-to-End Local System Demo Walkthrough")
    print("  'Stop postponing. Let your computer do the boring work.'")
    print("=" * 70)

    demo_dir = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "demo_workspace"))
    if not os.path.exists(demo_dir):
        print(f"Error: Demo workspace directory not found at {demo_dir}")
        sys.exit(1)

    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://127.0.0.1:8000") as client:
        # 1. Health check & Ollama status
        print("\n[Step 1/10] Checking System & Local Model Health...")
        health_res = await client.get("/api/health")
        health = health_res.json()
        print(f"  • API Status: {health['status'].upper()}")
        print(f"  • Configured Ollama Model: {health['ollama_model']}")
        print(f"  • Ollama Connected: {health['ollama_connected']} (Model Present: {health['ollama_model_present']})")

        # 2. Workspace Scanning
        print(f"\n[Step 2/10] Scanning Workspace: {demo_dir}...")
        scan_res = await client.post(
            "/api/scan/folder",
            json={
                "folder_path": demo_dir,
                "compute_hashes": True,
                "extract_documents": True,
            },
        )
        scan = scan_res.json()
        print(f"  • Total Scanned Files: {scan['total_files']}")
        print(f"  • Total Size: {scan['total_size_formatted']}")
        print(f"  • Scan Duration: {scan['duration_seconds']}s")
        print(f"  • Skipped / Errored Files: {len(scan['skipped_files'])}")

        # 3. Document Extraction
        print("\n[Step 3/10] Inspecting Safe Document Extractions...")
        docs = scan["extracted_documents"]
        print(f"  • Total Documents Extracted: {len(docs)}")
        for d in docs[:4]:
            print(f"    - [{d['extension'].upper()}] {d['relative_path']}: {d['total_chars']} chars ({d['total_chunks']} chunks) [{d['status']}]")

        # 4. Deterministic Findings
        print("\n[Step 4/10] Reviewing Deterministic File Findings...")
        findings = scan["deterministic_findings"]
        print(f"  • Total Deterministic Findings: {len(findings)}")
        print(f"  • Potential Recoverable Storage: {scan['total_wasted_formatted']}")

        dup_findings = [f for f in findings if f["category"] == "exact_duplicate"]
        for df in dup_findings:
            print(f"    - [Exact Duplicate] {df['title']} (wastes {df['storage_impact_formatted']})")

        todo_findings = [f for f in findings if f["category"] == "unfinished_work"]
        for tf in todo_findings:
            print(f"    - [Unfinished Work] {tf['title']}: {tf['explanation']}")

        large_findings = [f for f in findings if f["category"] == "large_file"]
        for lf in large_findings:
            print(f"    - [Large File] {lf['title']}: {lf['explanation']}")

        # 5. Local AI Semantic Groupings & Forgotten Work
        print("\n[Step 5/10] Running Local AI Semantic Project Grouping...")
        if health["ollama_connected"] and health["ollama_model_present"]:
            ai_res = await client.post(
                "/api/ai/semantic-groups",
                json={"folder_path": demo_dir, "model": health["ollama_model"]},
            )
            ai_data = ai_res.json()
            print(f"  • Model Used: {ai_data['model_used']}")
            print(f"  • Status: {ai_data['status']}")
            print(f"  • Discovered Project Clusters: {len(ai_data.get('groups', []))}")
            for grp in ai_data.get("groups", []):
                print(f"    - Cluster: '{grp['project_name']}' ({grp['confidence']} confidence): {grp['relative_paths']}")
        else:
            print("  • Note: Local Ollama is offline or model missing. Skipping live inference; deterministic findings remain 100% active.")

        # 6. Action Queue Generation
        print("\n[Step 6/10] Generating Bounded Procrastination Action Queue (15-Minute Budget)...")
        queue_res = await client.post(
            "/api/queue/generate",
            json={
                "folder_path": demo_dir,
                "time_budget_minutes": 15,
                "scan_result": scan,
            },
        )
        q_data = queue_res.json()
        print(f"  • Time Budget: {q_data['time_budget_minutes']} min (Total Scheduled: {q_data['total_estimated_minutes']} min)")
        print(f"  • Queue Tasks Generated: {len(q_data['tasks'])}")
        for t in q_data["tasks"]:
            print(f"    [{t['status'].upper()}] {t['title']} ({t['effort_label']})")
            print(f"      Reason: {t['reason']}")
            print(f"      Action: {t['suggested_action']}")

        # 7. Action Preview
        target_dup = "quarterly_budget_2026_copy.csv"
        print(f"\n[Step 7/10] Filesystem Action Workflow: Proposing & Previewing Archive of '{target_dup}'...")
        preview_res = await client.post(
            "/api/actions/preview",
            json={
                "workspace_path": demo_dir,
                "actions": [
                    {
                        "operation_type": "move_to_archive",
                        "source_relative_path": target_dup,
                        "reason": "Redundant exact duplicate identified by SHA-256 byte comparison",
                    }
                ],
            },
        )
        preview_data = preview_res.json()
        assert preview_data["can_apply_count"] == 1
        p_item = preview_data["previews"][0]
        action_id = p_item["action_id"]
        dst_rel = p_item["destination_relative_path"]
        print(f"  • Action ID: {action_id}")
        print(f"  • Source Path: {p_item['source_relative_path']}")
        print(f"  • Destination Path: {dst_rel}")
        print(f"  • Validation Checks Passed: {p_item['can_apply']}")

        # 8. User Approval & Execution
        print("\n[Step 8/10] Simulating Explicit User Approval & Applying Action...")
        apply_res = await client.post(
            "/api/actions/apply",
            json={
                "workspace_path": demo_dir,
                "action_ids": [action_id],
                "previews": preview_data["previews"],
            },
        )
        apply_data = apply_res.json()
        print(f"  • Batch Status: {apply_data['batch_status']}")
        print(f"  • Succeeded: {apply_data['succeeded_count']}, Failed: {apply_data['failed_count']}")

        # Verify filesystem modification
        orig_full = os.path.join(demo_dir, target_dup)
        archived_full = os.path.join(demo_dir, dst_rel)
        assert not os.path.exists(orig_full), "Original file must no longer exist"
        assert os.path.exists(archived_full), "Archived copy must exist on disk"
        print("  • Physical Disk Verification: Original removed, file successfully relocated to archive.")

        # 9. Undo Operation
        print("\n[Step 9/10] Invoking 1-Click Action Undo...")
        undo_res = await client.post(
            "/api/actions/undo",
            json={
                "workspace_path": demo_dir,
                "action_id": action_id,
            },
        )
        undo_data = undo_res.json()
        print(f"  • Undo Result: {undo_data['status']} (success={undo_data['success']})")
        assert os.path.exists(orig_full), "Original file must be restored"
        assert not os.path.exists(archived_full), "Archived copy must be removed"
        print("  • Physical Disk Verification: Original file restored, archive stub removed.")

        # 10. Audit History
        print("\n[Step 10/10] Querying Persistent SQLite Audit Manifest...")
        audit_res = await client.get(f"/api/actions/audit?workspace_path={demo_dir}")
        audit_data = audit_res.json()
        print(f"  • Total Durable Audit Records: {audit_data['total_count']}")
        record = next(r for r in audit_data["records"] if r["action_id"] == action_id)
        print(f"    - Action ID: {record['action_id']}")
        print(f"    - Final Status: {record['status']}")
        print(f"    - Pre-Action SHA-256: {record['pre_hash'][:16]}...")
        print(f"    - Can Undo Now: {record['can_undo']}")

    print("\n" + "=" * 70)
    print("  DEMO WALKTHROUGH COMPLETED SUCCESSFULLY WITH 100% PASSING STEPS!")
    print("=" * 70)


if __name__ == "__main__":
    asyncio.run(run_demo())
