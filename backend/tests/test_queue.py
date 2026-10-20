import os
import tempfile
import pytest
from httpx import ASGITransport, AsyncClient

from app.main import app
from app.models.schemas import (
    GenerateProcrastinationQueueRequest,
    QueueTask,
    QueueTaskStatus,
    SupportingFileRef,
)
from app.services.queue_service import QueueService
from app.services.task_store import TaskStore


@pytest.fixture
def temp_store():
    with tempfile.NamedTemporaryFile(suffix=".db", delete=False) as f:
        db_path = f.name
    store = TaskStore(db_path=db_path)
    yield store
    if os.path.exists(db_path):
        os.remove(db_path)


@pytest.fixture
def mock_workspace():
    with tempfile.TemporaryDirectory() as tmpdir:
        resolved_tmpdir = str(os.path.realpath(tmpdir))
        # Create duplicate files
        dup1 = os.path.join(resolved_tmpdir, "archive_a.zip")
        dup2 = os.path.join(resolved_tmpdir, "archive_copy.zip")
        content = b"Exact identical archive bytes for sha256 matching."
        with open(dup1, "wb") as f:
            f.write(content)
        with open(dup2, "wb") as f:
            f.write(content)

        # Create note with explicit TODO
        note = os.path.join(resolved_tmpdir, "project_notes.txt")
        with open(note, "w") as f:
            f.write("Section 1: Architecture overview.\nTODO: write benchmark harness for database driver.\n")

        # Create large file
        large = os.path.join(resolved_tmpdir, "big_dataset.csv")
        with open(large, "wb") as f:
            f.write(b"0" * 60000000)  # ~60 MB

        yield resolved_tmpdir


# -----------------------------------------------------------------------------
# Unit Tests for TaskStore (Persistence)
# -----------------------------------------------------------------------------
def test_task_store_persistence_lifecycle(temp_store):
    task = QueueTask(
        id="task_test_123",
        workspace_path="/test/ws",
        title="Review duplicate archive",
        reason="Free disk space",
        supporting_files=[SupportingFileRef(relative_path="archive.zip")],
        evidence="SHA-256 matched",
        suggested_action="Delete copy",
        estimated_minutes=3,
        effort_label="Est. ~3 min (approximate effort)",
        status=QueueTaskStatus.PROPOSED,
        category="duplicate_cleanup",
        priority_score=95,
    )

    # Insert
    saved = temp_store.upsert_task(task)
    assert saved.id == "task_test_123"
    assert saved.status == QueueTaskStatus.PROPOSED

    # Retrieve
    fetched = temp_store.get_task("task_test_123")
    assert fetched is not None
    assert fetched.title == "Review duplicate archive"
    assert fetched.estimated_minutes == 3
    assert len(fetched.supporting_files) == 1

    # Update status to APPROVED
    updated = temp_store.update_task_status("task_test_123", QueueTaskStatus.APPROVED)
    assert updated.status == QueueTaskStatus.APPROVED

    # Verify upsert preserves APPROVED status
    task_modified = task.model_copy(update={"title": "Review duplicate archive v2"})
    saved_again = temp_store.upsert_task(task_modified, preserve_existing_status=True)
    assert saved_again.status == QueueTaskStatus.APPROVED
    assert saved_again.title == "Review duplicate archive v2"

    # List
    approved_list = temp_store.list_tasks_for_workspace("/test/ws", status=QueueTaskStatus.APPROVED)
    assert len(approved_list) == 1

    # Dismiss
    temp_store.update_task_status("task_test_123", QueueTaskStatus.DISMISSED)
    dismissed_list = temp_store.list_tasks_for_workspace("/test/ws", status=QueueTaskStatus.DISMISSED)
    assert len(dismissed_list) == 1

    # Delete
    assert temp_store.delete_task("task_test_123") is True
    assert temp_store.get_task("task_test_123") is None


# -----------------------------------------------------------------------------
# Unit Tests for QueueService & Time Budgets
# -----------------------------------------------------------------------------
@pytest.mark.asyncio
async def test_queue_generation_respects_time_budget_5_min(temp_store, mock_workspace):
    service = QueueService(store=temp_store)

    req = GenerateProcrastinationQueueRequest(
        folder_path=mock_workspace,
        time_budget_minutes=5,
        force_regenerate=True,
        include_ai_recommendations=False,
    )
    res = await service.generate_queue(req)

    assert res.workspace_path == mock_workspace
    assert res.time_budget_minutes == 5
    assert len(res.tasks) >= 1
    # Total effort for active tasks must respect the 5 min budget
    active_tasks = [t for t in res.tasks if t.status in (QueueTaskStatus.PROPOSED, QueueTaskStatus.APPROVED)]
    total_minutes = sum(t.estimated_minutes for t in active_tasks)
    assert total_minutes <= 5


@pytest.mark.asyncio
async def test_queue_generation_respects_time_budget_15_and_30_min(temp_store, mock_workspace):
    service = QueueService(store=temp_store)

    # 15 minutes budget
    req15 = GenerateProcrastinationQueueRequest(
        folder_path=mock_workspace,
        time_budget_minutes=15,
        force_regenerate=True,
        include_ai_recommendations=False,
    )
    res15 = await service.generate_queue(req15)
    active15 = [t for t in res15.tasks if t.status in (QueueTaskStatus.PROPOSED, QueueTaskStatus.APPROVED)]
    total15 = sum(t.estimated_minutes for t in active15)
    assert total15 <= 15
    assert len(active15) >= 2

    # 30 minutes budget
    req30 = GenerateProcrastinationQueueRequest(
        folder_path=mock_workspace,
        time_budget_minutes=30,
        force_regenerate=True,
        include_ai_recommendations=False,
    )
    res30 = await service.generate_queue(req30)
    active30 = [t for t in res30.tasks if t.status in (QueueTaskStatus.PROPOSED, QueueTaskStatus.APPROVED)]
    total30 = sum(t.estimated_minutes for t in active30)
    assert total30 <= 30
    assert len(active30) >= len(active15)


@pytest.mark.asyncio
async def test_queue_tasks_have_strict_traceability_and_evidence(temp_store, mock_workspace):
    service = QueueService(store=temp_store)

    req = GenerateProcrastinationQueueRequest(
        folder_path=mock_workspace,
        time_budget_minutes=30,
        force_regenerate=True,
        include_ai_recommendations=False,
    )
    res = await service.generate_queue(req)

    for task in res.tasks:
        # Traceability assertions
        assert task.title and len(task.title) > 5
        assert task.reason and len(task.reason) > 5
        assert task.suggested_action and len(task.suggested_action) > 5
        assert task.evidence and len(task.evidence) > 5
        assert len(task.supporting_files) >= 1
        for f in task.supporting_files:
            assert f.relative_path and not f.relative_path.startswith("/")
        assert "approximate effort" in task.effort_label.lower()
        assert task.estimated_minutes > 0


@pytest.mark.asyncio
async def test_dismissed_tasks_are_not_reproposed(temp_store, mock_workspace):
    service = QueueService(store=temp_store)

    req = GenerateProcrastinationQueueRequest(
        folder_path=mock_workspace,
        time_budget_minutes=15,
        force_regenerate=True,
        include_ai_recommendations=False,
    )
    res1 = await service.generate_queue(req)
    assert len(res1.tasks) > 0

    first_task = res1.tasks[0]
    # User dismisses first task
    temp_store.update_task_status(first_task.id, QueueTaskStatus.DISMISSED)

    # Regenerate queue
    res2 = await service.generate_queue(req)
    proposed_ids = {t.id for t in res2.tasks if t.status == QueueTaskStatus.PROPOSED}
    assert first_task.id not in proposed_ids
    assert res2.dismissed_count >= 1


# -----------------------------------------------------------------------------
# FastAPI Integration Tests for /api/queue Endpoints
# -----------------------------------------------------------------------------
@pytest.mark.asyncio
async def test_api_queue_full_flow(mock_workspace):
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
        # 1. Generate Queue
        gen_res = await ac.post("/api/queue/generate", json={
            "folder_path": mock_workspace,
            "time_budget_minutes": 15,
            "force_regenerate": True,
            "include_ai_recommendations": False,
        })
        assert gen_res.status_code == 200
        data = gen_res.json()
        assert data["workspace_path"] == mock_workspace
        assert data["time_budget_minutes"] == 15
        assert len(data["tasks"]) > 0

        first_task = data["tasks"][0]
        task_id = first_task["id"]

        # 2. Update Status to Approved
        patch_res = await ac.patch(f"/api/queue/{task_id}/status", json={"status": "approved"})
        assert patch_res.status_code == 200
        assert patch_res.json()["status"] == "approved"

        # 3. List Tasks by Status
        list_res = await ac.get(f"/api/queue?folder_path={mock_workspace}&status=approved")
        assert list_res.status_code == 200
        tasks = list_res.json()
        assert any(t["id"] == task_id for t in tasks)

        # 4. Dismiss Task
        dismiss_res = await ac.post(f"/api/queue/{task_id}/dismiss")
        assert dismiss_res.status_code == 200
        assert dismiss_res.json()["status"] == "dismissed"

        # 5. Clear Tasks
        clear_res = await ac.post(f"/api/queue/clear?folder_path={mock_workspace}&only_proposed=false")
        assert clear_res.status_code == 200
