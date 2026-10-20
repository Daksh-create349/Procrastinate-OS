from datetime import datetime, timezone
import hashlib
import os
from pathlib import Path
import sqlite3
import pytest
from fastapi.testclient import TestClient

from app.main import create_app
from app.models.schemas import (
    ActionOperationType,
    ActionStatusEnum,
    ApplyActionsRequest,
    ApplyBatchStatus,
    FilesystemActionPreview,
    ProposedActionItem,
    ProposeActionsRequest,
    UndoActionRequest,
)
from app.services.action_service import ActionService, compute_sha256
from app.services.action_store import ActionStore


@pytest.fixture
def temp_workspace(tmp_path):
    ws = tmp_path / "test_workspace"
    ws.mkdir(parents=True, exist_ok=True)
    return ws


@pytest.fixture
def action_service(tmp_path):
    db_file = tmp_path / "test_actions.db"
    store = ActionStore(db_path=str(db_file))
    return ActionService(action_store=store)


@pytest.fixture
def test_client(temp_workspace, monkeypatch, tmp_path):
    app = create_app()
    # Point global store to temporary db
    from app.api.routes import actions
    test_db = tmp_path / "api_test_actions.db"
    custom_store = ActionStore(db_path=str(test_db))
    custom_service = ActionService(action_store=custom_store)
    monkeypatch.setattr(actions, "_action_store", custom_store)
    monkeypatch.setattr(actions, "_action_service", custom_service)
    client = TestClient(app)
    return client


# -----------------------------------------------------------------------------
# 1. Successful Operations & Full Lifecycle (Propose -> Preview -> Approve -> Apply -> Verify -> Undo)
# -----------------------------------------------------------------------------
def test_lifecycle_move_to_archive_and_undo(temp_workspace, action_service):
    # Setup test file
    sub = temp_workspace / "subfolder"
    sub.mkdir()
    doc = sub / "draft.txt"
    doc.write_text("Unique draft content 12345", encoding="utf-8")
    original_hash = compute_sha256(doc)

    # 1. Propose & Preview
    propose_req = ProposeActionsRequest(
        workspace_path=str(temp_workspace),
        actions=[
            ProposedActionItem(
                operation_type=ActionOperationType.MOVE_TO_ARCHIVE,
                source_relative_path="subfolder/draft.txt",
                target_name_or_folder="_archive",
                reason="Archive old draft",
            )
        ],
    )
    preview_res = action_service.preview_actions_batch(propose_req)
    assert preview_res.total_previewed == 1
    assert preview_res.can_apply_count == 1
    prev = preview_res.previews[0]
    assert prev.can_apply is True
    assert prev.source_file_exists is True
    assert prev.destination_file_exists is False
    assert prev.source_sha256 == original_hash
    assert prev.destination_relative_path == "_archive/subfolder/draft.txt"

    # 2. Approve & Apply
    apply_req = ApplyActionsRequest(
        workspace_path=str(temp_workspace),
        previews=[prev],
    )
    apply_res = action_service.apply_actions(apply_req)
    assert apply_res.batch_status == ApplyBatchStatus.ALL_SUCCEEDED
    assert apply_res.succeeded_count == 1
    assert apply_res.failed_count == 0
    assert apply_res.results[0].verified is True

    # 3. Verify on disk
    dest_path = temp_workspace / "_archive" / "subfolder" / "draft.txt"
    assert dest_path.exists()
    assert not doc.exists()
    assert compute_sha256(dest_path) == original_hash

    # Check Audit Record
    record = action_service.action_store.get_record(prev.action_id)
    assert record is not None
    assert record.status == ActionStatusEnum.APPLIED
    assert record.post_hash == original_hash
    assert record.can_undo is True

    # 4. Safe Undo
    undo_req = UndoActionRequest(
        workspace_path=str(temp_workspace),
        action_id=prev.action_id,
    )
    undo_res = action_service.undo_action(undo_req)
    assert undo_res.success is True
    assert undo_res.status == ActionStatusEnum.UNDONE

    # Verify restored state on disk
    assert doc.exists()
    assert not dest_path.exists()
    assert compute_sha256(doc) == original_hash

    # Check Audit Record after undo
    updated_rec = action_service.action_store.get_record(prev.action_id)
    assert updated_rec.status == ActionStatusEnum.UNDONE
    assert updated_rec.undone_at is not None


def test_lifecycle_rename_and_undo(temp_workspace, action_service):
    sub = temp_workspace / "reports"
    sub.mkdir()
    messy_file = sub / "report_final_v2_FINAL.csv"
    messy_file.write_text("id,val\n1,100\n", encoding="utf-8")
    file_hash = compute_sha256(messy_file)

    # 1. Preview
    propose_req = ProposeActionsRequest(
        workspace_path=str(temp_workspace),
        actions=[
            ProposedActionItem(
                operation_type=ActionOperationType.RENAME,
                source_relative_path="reports/report_final_v2_FINAL.csv",
                target_name_or_folder="report_clean.csv",
                reason="Normalize filename",
            )
        ],
    )
    preview_res = action_service.preview_actions_batch(propose_req)
    prev = preview_res.previews[0]
    assert prev.can_apply is True
    assert prev.destination_relative_path == "reports/report_clean.csv"

    # 2. Apply
    apply_res = action_service.apply_actions(
        ApplyActionsRequest(workspace_path=str(temp_workspace), previews=[prev])
    )
    assert apply_res.batch_status == ApplyBatchStatus.ALL_SUCCEEDED

    clean_file = sub / "report_clean.csv"
    assert clean_file.exists()
    assert not messy_file.exists()
    assert compute_sha256(clean_file) == file_hash

    # 3. Undo
    undo_res = action_service.undo_action(
        UndoActionRequest(workspace_path=str(temp_workspace), action_id=prev.action_id)
    )
    assert undo_res.success is True
    assert messy_file.exists()
    assert not clean_file.exists()


# -----------------------------------------------------------------------------
# 2. Collisions & Anti-Overwrite Protection
# -----------------------------------------------------------------------------
def test_collision_destination_already_exists(temp_workspace, action_service):
    # Create source file
    src = temp_workspace / "source.txt"
    src.write_text("Source data", encoding="utf-8")

    # Create destination file already present
    archive_dir = temp_workspace / "_archive"
    archive_dir.mkdir()
    existing_dest = archive_dir / "source.txt"
    existing_dest.write_text("Important existing content", encoding="utf-8")
    existing_dest_hash = compute_sha256(existing_dest)

    propose_req = ProposeActionsRequest(
        workspace_path=str(temp_workspace),
        actions=[
            ProposedActionItem(
                operation_type=ActionOperationType.MOVE_TO_ARCHIVE,
                source_relative_path="source.txt",
                target_name_or_folder="_archive",
                reason="Move duplicate",
            )
        ],
    )
    preview_res = action_service.preview_actions_batch(propose_req)
    prev = preview_res.previews[0]
    assert prev.destination_file_exists is True
    assert prev.can_apply is False
    assert any("already exists" in w for w in prev.warnings)

    # Even if client forces apply on this preview, backend MUST refuse!
    apply_res = action_service.apply_actions(
        ApplyActionsRequest(workspace_path=str(temp_workspace), previews=[prev])
    )
    assert apply_res.batch_status == ApplyBatchStatus.ALL_FAILED
    assert apply_res.failed_count == 1
    # Ensure existing file was NOT overwritten
    assert existing_dest.exists()
    assert compute_sha256(existing_dest) == existing_dest_hash
    # Source file remains intact
    assert src.exists()


# -----------------------------------------------------------------------------
# 3. Missing Files Prior to Apply
# -----------------------------------------------------------------------------
def test_source_file_vanished_before_apply(temp_workspace, action_service):
    src = temp_workspace / "ephemeral.txt"
    src.write_text("Will be deleted before apply", encoding="utf-8")

    propose_req = ProposeActionsRequest(
        workspace_path=str(temp_workspace),
        actions=[
            ProposedActionItem(
                operation_type=ActionOperationType.MOVE_TO_ARCHIVE,
                source_relative_path="ephemeral.txt",
                reason="Test vanish",
            )
        ],
    )
    prev = action_service.preview_actions_batch(propose_req).previews[0]
    assert prev.can_apply is True

    # Delete source file before apply
    src.unlink()

    apply_res = action_service.apply_actions(
        ApplyActionsRequest(workspace_path=str(temp_workspace), previews=[prev])
    )
    assert apply_res.batch_status == ApplyBatchStatus.ALL_FAILED
    assert apply_res.failed_count == 1
    assert "vanished" in apply_res.results[0].error_message.lower() or "not exist" in apply_res.results[0].error_message.lower()


# -----------------------------------------------------------------------------
# 4. Changed / Modified Files (Hash Mismatch Before Apply)
# -----------------------------------------------------------------------------
def test_file_modified_between_preview_and_apply(temp_workspace, action_service):
    src = temp_workspace / "notes.txt"
    src.write_text("Version A", encoding="utf-8")

    prev = action_service.preview_actions_batch(
        ProposeActionsRequest(
            workspace_path=str(temp_workspace),
            actions=[
                ProposedActionItem(
                    operation_type=ActionOperationType.RENAME,
                    source_relative_path="notes.txt",
                    target_name_or_folder="notes_renamed.txt",
                    reason="Rename test",
                )
            ],
        )
    ).previews[0]

    # Modify file content on disk after preview
    src.write_text("Version B (User edited this file!)", encoding="utf-8")

    apply_res = action_service.apply_actions(
        ApplyActionsRequest(workspace_path=str(temp_workspace), previews=[prev])
    )
    assert apply_res.batch_status == ApplyBatchStatus.ALL_FAILED
    assert "modified on disk" in apply_res.results[0].error_message.lower()

    # Original file must remain untouched
    assert src.exists()
    assert not (temp_workspace / "notes_renamed.txt").exists()


# -----------------------------------------------------------------------------
# 5. Path Traversal & Security Validation
# -----------------------------------------------------------------------------
def test_path_traversal_attacks_rejected(temp_workspace, action_service):
    malicious_inputs = [
        "../outside.txt",
        "../../etc/passwd",
        "/etc/shadow",
        "sub/../../../../secret.txt",
        "valid/path\x00with_nul",
    ]

    for bad_path in malicious_inputs:
        prev = action_service.preview_action(
            str(temp_workspace),
            ProposedActionItem(
                operation_type=ActionOperationType.MOVE_TO_ARCHIVE,
                source_relative_path=bad_path,
                reason="Attack attempt",
            ),
        )
        assert prev.can_apply is False
        assert prev.validation_error is not None

    # Test invalid rename characters
    invalid_renames = [
        "../escaped.txt",
        "folder/newname.txt",  # Rename cannot include subfolders
        "bad:name.txt",
        "wild*card.txt",
        "",
        "..",
    ]
    src = temp_workspace / "valid.txt"
    src.write_text("Safe", encoding="utf-8")

    for bad_name in invalid_renames:
        prev = action_service.preview_action(
            str(temp_workspace),
            ProposedActionItem(
                operation_type=ActionOperationType.RENAME,
                source_relative_path="valid.txt",
                target_name_or_folder=bad_name,
                reason="Invalid rename test",
            ),
        )
        assert prev.can_apply is False
        assert prev.validation_error is not None


# -----------------------------------------------------------------------------
# 6. Partial Batch Failures (Never Claim Whole Batch Succeeded)
# -----------------------------------------------------------------------------
def test_partial_batch_failure(temp_workspace, action_service):
    # File 1: Valid
    f1 = temp_workspace / "file1.txt"
    f1.write_text("F1 content", encoding="utf-8")

    # File 2: Collision (dest exists)
    f2 = temp_workspace / "file2.txt"
    f2.write_text("F2 content", encoding="utf-8")
    archive_dir = temp_workspace / "_archive"
    archive_dir.mkdir(exist_ok=True)
    (archive_dir / "file2.txt").write_text("Already in archive", encoding="utf-8")

    # File 3: Valid
    f3 = temp_workspace / "file3.txt"
    f3.write_text("F3 content", encoding="utf-8")

    batch_preview = action_service.preview_actions_batch(
        ProposeActionsRequest(
            workspace_path=str(temp_workspace),
            actions=[
                ProposedActionItem(
                    operation_type=ActionOperationType.MOVE_TO_ARCHIVE,
                    source_relative_path="file1.txt",
                    reason="Move 1",
                ),
                ProposedActionItem(
                    operation_type=ActionOperationType.MOVE_TO_ARCHIVE,
                    source_relative_path="file2.txt",
                    reason="Move 2 (collide)",
                ),
                ProposedActionItem(
                    operation_type=ActionOperationType.MOVE_TO_ARCHIVE,
                    source_relative_path="file3.txt",
                    reason="Move 3",
                ),
            ],
        )
    )

    assert batch_preview.has_collisions is True
    assert batch_preview.can_apply_count == 2

    # Execute batch
    apply_res = action_service.apply_actions(
        ApplyActionsRequest(workspace_path=str(temp_workspace), previews=batch_preview.previews)
    )

    # Batch status MUST be PARTIALLY_SUCCEEDED, not all_succeeded
    assert apply_res.batch_status == ApplyBatchStatus.PARTIALLY_SUCCEEDED
    assert apply_res.succeeded_count == 2
    assert apply_res.failed_count == 1

    # Verify file 1 moved
    assert (archive_dir / "file1.txt").exists()
    assert not f1.exists()

    # Verify file 2 collision protected
    assert f2.exists()
    assert (archive_dir / "file2.txt").read_text(encoding="utf-8") == "Already in archive"

    # Verify file 3 moved
    assert (archive_dir / "file3.txt").exists()
    assert not f3.exists()


# -----------------------------------------------------------------------------
# 7. Undo Conflicts & Safety
# -----------------------------------------------------------------------------
def test_undo_conflicts_prevented(temp_workspace, action_service):
    src = temp_workspace / "original.txt"
    src.write_text("Original text", encoding="utf-8")

    prev = action_service.preview_actions_batch(
        ProposeActionsRequest(
            workspace_path=str(temp_workspace),
            actions=[
                ProposedActionItem(
                    operation_type=ActionOperationType.MOVE_TO_ARCHIVE,
                    source_relative_path="original.txt",
                    reason="Archive",
                )
            ],
        )
    ).previews[0]

    action_service.apply_actions(
        ApplyActionsRequest(workspace_path=str(temp_workspace), previews=[prev])
    )
    dest_path = temp_workspace / "_archive" / "original.txt"
    assert dest_path.exists()
    assert not src.exists()

    # Conflict Scenario A: A new file was placed at the original source path!
    src.write_text("I am a new file taking the old path!", encoding="utf-8")

    # Undo must REFUSE to overwrite the new file
    undo_res = action_service.undo_action(
        UndoActionRequest(workspace_path=str(temp_workspace), action_id=prev.action_id)
    )
    assert undo_res.success is False
    assert "already occupied" in undo_res.error_message.lower()
    # The new file remains untouched
    assert src.read_text(encoding="utf-8") == "I am a new file taking the old path!"
    # The archived file remains untouched
    assert dest_path.exists()

    # Resolve conflict by removing the blocking file
    src.unlink()

    # Conflict Scenario B: The file at the archive destination was modified!
    dest_path.write_text("Modified archived content", encoding="utf-8")

    # Undo must REFUSE because content hash changed
    undo_res2 = action_service.undo_action(
        UndoActionRequest(workspace_path=str(temp_workspace), action_id=prev.action_id)
    )
    assert undo_res2.success is False
    assert "modified after operation" in undo_res2.error_message.lower()


# -----------------------------------------------------------------------------
# 8. Crash Recovery for Interrupted Actions
# -----------------------------------------------------------------------------
def test_crash_recovery_orphaned_applying_action(temp_workspace, action_service):
    # Setup test file
    src = temp_workspace / "interrupted.txt"
    src.write_text("Important content", encoding="utf-8")
    h = compute_sha256(src)

    prev = action_service.preview_action(
        str(temp_workspace),
        ProposedActionItem(
            operation_type=ActionOperationType.MOVE_TO_ARCHIVE,
            source_relative_path="interrupted.txt",
            reason="Crash recovery test",
        ),
    )

    # Simulate app crash while in APPLYING state
    action_service.action_store.update_status(prev.action_id, ActionStatusEnum.APPLYING)
    record = action_service.action_store.get_record(prev.action_id)
    assert record.status == ActionStatusEnum.APPLYING

    # Scenario: File was never moved (src exists, dest missing)
    recovered = action_service.recover_interrupted_actions(str(temp_workspace))
    assert recovered == 1
    updated = action_service.action_store.get_record(prev.action_id)
    assert updated.status == ActionStatusEnum.FAILED
    assert "interrupted" in updated.error_message.lower()


# -----------------------------------------------------------------------------
# 9. HTTP API Endpoints Integration Test
# -----------------------------------------------------------------------------
def test_actions_api_endpoints(test_client, temp_workspace):
    doc = temp_workspace / "api_test.txt"
    doc.write_text("API test content", encoding="utf-8")

    # 1. POST /api/actions/preview
    res = test_client.post(
        "/api/actions/preview",
        json={
            "workspace_path": str(temp_workspace),
            "actions": [
                {
                    "operation_type": "move_to_archive",
                    "source_relative_path": "api_test.txt",
                    "reason": "API move test",
                }
            ],
        },
    )
    assert res.status_code == 200
    data = res.json()
    assert data["total_previewed"] == 1
    assert data["can_apply_count"] == 1
    preview = data["previews"][0]

    # 2. POST /api/actions/apply
    res = test_client.post(
        "/api/actions/apply",
        json={
            "workspace_path": str(temp_workspace),
            "previews": [preview],
        },
    )
    assert res.status_code == 200
    apply_data = res.json()
    assert apply_data["batch_status"] == "all_succeeded"
    assert apply_data["succeeded_count"] == 1

    # Verify file moved on disk
    dest = temp_workspace / "_archive" / "api_test.txt"
    assert dest.exists()
    assert not doc.exists()

    # 3. GET /api/actions/audit
    res = test_client.get(f"/api/actions/audit?workspace_path={temp_workspace}")
    assert res.status_code == 200
    audit_data = res.json()
    assert audit_data["total_count"] >= 1
    assert audit_data["records"][0]["action_id"] == preview["action_id"]
    assert audit_data["records"][0]["status"] == "applied"
    assert audit_data["records"][0]["can_undo"] is True

    # 4. POST /api/actions/undo
    res = test_client.post(
        "/api/actions/undo",
        json={
            "workspace_path": str(temp_workspace),
            "action_id": preview["action_id"],
        },
    )
    assert res.status_code == 200
    undo_data = res.json()
    assert undo_data["success"] is True
    assert undo_data["status"] == "undone"

    # Verify restored on disk
    assert doc.exists()
    assert not dest.exists()
