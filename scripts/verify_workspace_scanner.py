#!/usr/bin/env python3
"""
Verify ProcrastinateOS workspace scanner against real files in a disposable directory.
"""
import asyncio
import os
import sys
import tempfile
from pathlib import Path

# Add backend to path
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "backend")))

from app.services.scanner_service import scanner_service
from app.services.scan_job_manager import scan_job_manager
from app.models.schemas import ScanRequest


async def main():
    print("=== ProcrastinateOS Real Workspace Scanner Verification ===")

    with tempfile.TemporaryDirectory() as tmp_root:
        print(f"Created disposable test workspace: {tmp_root}")

        # 1. Create nested structure
        sub_dir = Path(tmp_root) / "projects" / "ai_agent"
        sub_dir.mkdir(parents=True, exist_ok=True)

        deep_file = sub_dir / "agent.py"
        deep_file.write_text("print('ProcrastinateOS core agent')", encoding="utf-8")

        # 2. Create Unicode files
        uni_file1 = Path(tmp_root) / "résumé_draft_2026.docx"
        uni_file1.write_bytes(b"PK\x03\x04DocxBinaryHeader_Resume")

        uni_file2 = Path(tmp_root) / "日本語_アイディア.md"
        uni_file2.write_text("# アイディア\nローカルAIで整理する。", encoding="utf-8")

        uni_file3 = Path(tmp_root) / "rocket_🚀_spec.json"
        uni_file3.write_text('{"name": "falcon", "stage": 2}', encoding="utf-8")

        # 3. Create exact duplicate files
        payload = b"CRITICAL_SHARED_BINARY_BLOB_FOR_DUPLICATE_DETECTION" * 128
        orig_file = Path(tmp_root) / "installer.bin"
        dup_file = sub_dir / "installer_copy.bin"
        orig_file.write_bytes(payload)
        dup_file.write_bytes(payload)

        # 4. Create external symlink pointing outside workspace
        with tempfile.TemporaryDirectory() as outside_tmp:
            outside_file = Path(outside_tmp) / "external_private_data.txt"
            outside_file.write_text("Do not scan outside workspace!")

            ext_link = Path(tmp_root) / "link_to_external_folder"
            try:
                os.symlink(str(outside_file), str(ext_link))
                print(f"Created outside symlink: {ext_link} -> {outside_file}")
            except (OSError, NotImplementedError):
                pass

            # 5. Direct scanner test
            print("\n1. Testing scanner_service.scan_folder directly on real disk...")
            res = scanner_service.scan_folder(
                folder_path=tmp_root,
                max_depth=15,
                compute_hashes=True,
            )

            print(f"  ✓ Files indexed: {res.total_files}")
            print(f"  ✓ Storage size: {res.total_size_formatted} ({res.total_size_bytes} bytes)")
            print(f"  ✓ Traversal duration: {res.duration_seconds}s")
            print(f"  ✓ Categories discovered: {[c.category for c in res.categories]}")
            print(f"  ✓ Duplicate groups: {len(res.duplicate_groups)}")
            print(f"  ✓ Wasted duplicate bytes: {res.total_wasted_formatted}")
            print(f"  ✓ Skipped security items: {len(res.skipped_files)}")

            # Assertions
            assert res.total_files >= 5, f"Expected at least 5 files, got {res.total_files}"
            assert res.total_size_bytes == (
                len("print('ProcrastinateOS core agent')".encode("utf-8"))
                + len(b"PK\x03\x04DocxBinaryHeader_Resume")
                + len("# アイディア\nローカルAIで整理する。".encode("utf-8"))
                + len('{"name": "falcon", "stage": 2}'.encode("utf-8"))
                + (len(payload) * 2)
            ), "Byte size mismatch!"

            # Check relative paths
            rel_paths = {f.relative_path for f in res.files}
            assert "projects/ai_agent/agent.py" in rel_paths
            assert "résumé_draft_2026.docx" in rel_paths
            assert "日本語_アイディア.md" in rel_paths
            assert "rocket_🚀_spec.json" in rel_paths
            print("  ✓ All workspace-relative paths verified.")

            # Check duplicate detection
            assert len(res.duplicate_groups) == 1
            dup_grp = res.duplicate_groups[0]
            assert dup_grp.wasted_bytes == len(payload)
            print("  ✓ SHA-256 duplicate calculation verified.")

            # Check external symlink protection
            if os.path.exists(str(ext_link)):
                ext_skipped = [s for s in res.skipped_files if s.error_type == "symlink_external"]
                assert len(ext_skipped) >= 1
                print("  ✓ External symlink safely rejected and logged in skipped_files.")

            # 6. Test async ScanJobManager lifecycle
            print("\n2. Testing async ScanJobManager with live progress polling...")
            req = ScanRequest(folder_path=tmp_root, max_depth=10, compute_hashes=True)
            job_id = scan_job_manager.create_job(req)
            print(f"  ✓ Job created: {job_id}")

            for _ in range(50):
                prog = scan_job_manager.get_progress(job_id)
                if prog and prog.is_complete:
                    print(f"  ✓ Job finished with status '{prog.status.value}' in {prog.elapsed_seconds}s")
                    break
                await asyncio.sleep(0.05)

            job_result = scan_job_manager.get_result(job_id)
            assert job_result is not None
            assert job_result.total_files == res.total_files
            print(f"  ✓ Async job result matches direct scan: {job_result.total_files} files.")

    print("\n=== All real workspace scanner verifications PASSED successfully! ===")


if __name__ == "__main__":
    asyncio.run(main())
