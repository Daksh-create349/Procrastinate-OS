import asyncio
import os
import sys
import tempfile
import pytest
from httpx import ASGITransport, AsyncClient
from app.main import app
from app.services.scanner_service import scanner_service
from app.services.path_validator import validate_workspace_path


@pytest.fixture
def rich_workspace():
    """Create a temporary workspace with nested folders, duplicates, unicode files, and symlinks."""
    with tempfile.TemporaryDirectory() as tmpdir:
        # Level 1: Standard files
        f_readme = os.path.join(tmpdir, "README.md")
        with open(f_readme, "w", encoding="utf-8") as f:
            f.write("# Sample Project\nTesting ProcrastinateOS scanner.")

        # Unicode filenames
        f_unicode1 = os.path.join(tmpdir, "résumé_2026.docx")
        with open(f_unicode1, "wb") as f:
            f.write(b"PK\x03\x04DocxContentResume")

        f_unicode2 = os.path.join(tmpdir, "日本語_メモ.txt")
        with open(f_unicode2, "w", encoding="utf-8") as f:
            f.write("これはローカルAIテストです。")

        f_unicode3 = os.path.join(tmpdir, "script_🚀.py")
        with open(f_unicode3, "w", encoding="utf-8") as f:
            f.write("print('Rocket!')")

        # Nested folder
        nested_dir = os.path.join(tmpdir, "deeply", "nested", "folder")
        os.makedirs(nested_dir, exist_ok=True)

        # Exact duplicate files across directories
        dup_payload = b"EXACT_IDENTICAL_BINARY_PAYLOAD_FOR_HASH_TEST" * 50
        dup1 = os.path.join(tmpdir, "original_asset.bin")
        dup2 = os.path.join(nested_dir, "copy_of_asset.bin")
        with open(dup1, "wb") as f:
            f.write(dup_payload)
        with open(dup2, "wb") as f:
            f.write(dup_payload)

        # Unreadable file if supported by OS/filesystem
        unreadable = os.path.join(tmpdir, "unreadable.secret")
        try:
            with open(unreadable, "w") as f:
                f.write("secret")
            os.chmod(unreadable, 0)
        except Exception:
            pass

        # Outside workspace target for external symlink test
        with tempfile.TemporaryDirectory() as outside_dir:
            outside_target = os.path.join(outside_dir, "outside_file.txt")
            with open(outside_target, "w") as f:
                f.write("This is outside the workspace.")

            # Symlink pointing outside workspace
            symlink_outside = os.path.join(tmpdir, "link_to_outside")
            try:
                os.symlink(outside_target, symlink_outside)
            except (OSError, NotImplementedError):
                pass

            # Symlink pointing inside workspace
            symlink_inside = os.path.join(tmpdir, "link_to_readme.md")
            try:
                os.symlink(f_readme, symlink_inside)
            except (OSError, NotImplementedError):
                pass

            # Symlink loop (directory link to parent)
            loop_dir = os.path.join(nested_dir, "loop_link")
            try:
                os.symlink(tmpdir, loop_dir)
            except (OSError, NotImplementedError):
                pass

            yield tmpdir


def test_scanner_service_comprehensive(rich_workspace):
    """Test scanner service on rich workspace structure with duplicates, unicode, and symlinks."""
    result = scanner_service.scan_folder(rich_workspace, max_depth=10, compute_hashes=True)

    assert result.total_files >= 5
    assert result.total_size_bytes > 0
    assert result.root_path == os.path.realpath(rich_workspace)

    # Verify workspace-relative paths
    file_rel_paths = {f.relative_path for f in result.files}
    assert "README.md" in file_rel_paths
    assert "résumé_2026.docx" in file_rel_paths
    assert "日本語_メモ.txt" in file_rel_paths
    assert "deeply/nested/folder/copy_of_asset.bin" in file_rel_paths

    # Verify file categories
    categories = {c.category for c in result.categories}
    assert "Documents" in categories
    assert "Code" in categories

    # Verify duplicate detection via SHA-256
    assert len(result.duplicate_groups) >= 1
    dup_group = result.duplicate_groups[0]
    assert len(dup_group.files) >= 2
    assert dup_group.wasted_bytes > 0

    # Verify external symlink was skipped and logged in skipped_files
    if os.path.exists(os.path.join(rich_workspace, "link_to_outside")):
        skipped_reasons = [s.error_type for s in result.skipped_files]
        assert "symlink_external" in skipped_reasons


def test_path_validator_security():
    """Verify security rejection of system roots and invalid paths."""
    with pytest.raises(ValueError, match="forbidden"):
        validate_workspace_path("/")

    with pytest.raises(ValueError, match="forbidden"):
        validate_workspace_path("/System")

    with pytest.raises(FileNotFoundError):
        validate_workspace_path("/nonexistent/directory/that/does/not/exist/12345")


@pytest.mark.asyncio
async def test_scan_folder_direct_api(rich_workspace):
    """Test synchronous direct scanning endpoint."""
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
        response = await ac.post("/api/scan/folder", json={"folder_path": rich_workspace})
    assert response.status_code == 200
    data = response.json()
    assert data["total_files"] >= 5
    assert len(data["categories"]) >= 2
    assert len(data["duplicate_groups"]) >= 1


@pytest.mark.asyncio
async def test_scan_jobs_lifecycle_api(rich_workspace):
    """Test full asynchronous scan job lifecycle: start -> poll progress -> get result."""
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
        # Step 1: Start scan job
        create_res = await ac.post("/api/scan/jobs", json={
            "folder_path": rich_workspace,
            "max_depth": 10,
            "compute_hashes": True,
        })
        assert create_res.status_code == 200
        job_data = create_res.json()
        job_id = job_data["job_id"]
        assert job_id.startswith("scan-")

        # Step 2: Poll progress until completed
        for _ in range(50):
            prog_res = await ac.get(f"/api/scan/jobs/{job_id}/progress")
            assert prog_res.status_code == 200
            prog_data = prog_res.json()
            if prog_data["is_complete"]:
                assert prog_data["status"] == "completed"
                break
            await asyncio.sleep(0.05)

        # Step 3: Fetch final result
        res_res = await ac.get(f"/api/scan/jobs/{job_id}/result")
        assert res_res.status_code == 200
        res_data = res_res.json()
        assert res_data["total_files"] >= 5
        assert len(res_data["duplicate_groups"]) >= 1
