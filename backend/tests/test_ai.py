import os
import tempfile
import pytest
from httpx import ASGITransport, AsyncClient
from app.main import app


@pytest.fixture
def mock_folder():
    with tempfile.TemporaryDirectory() as tmpdir:
        draft = os.path.join(tmpdir, "novel_chapter1.docx")
        with open(draft, "wb") as f:
            f.write(b"Chapter 1: The Great Procrastination")
        yield tmpdir


@pytest.mark.asyncio
async def test_ai_action_queue_generation(mock_folder):
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
        response = await ac.post("/api/ai/action-queue", json={
            "folder_path": mock_folder,
        })
    assert response.status_code == 200
    data = response.json()
    assert "summary" in data
    assert "actions" in data
    assert len(data["actions"]) > 0
    assert "model_used" in data
