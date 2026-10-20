import os
import tempfile
import pytest
from httpx import ASGITransport, AsyncClient
from app.main import app
from app.services.duplicate_service import duplicate_service


@pytest.fixture
def sample_duplicates_dir():
    with tempfile.TemporaryDirectory() as tmpdir:
        # Create identical content in 3 files
        identical_content = b"Exact duplicate content in ProcrastinateOS test suite." * 50
        
        f1 = os.path.join(tmpdir, "original.txt")
        f2 = os.path.join(tmpdir, "copy1.txt")
        f3 = os.path.join(tmpdir, "copy2.txt")
        f_unique = os.path.join(tmpdir, "unique.txt")

        with open(f1, "wb") as f:
            f.write(identical_content)
        with open(f2, "wb") as f:
            f.write(identical_content)
        with open(f3, "wb") as f:
            f.write(identical_content)
        with open(f_unique, "wb") as f:
            f.write(b"Unique content that has no duplicate anywhere.")

        yield tmpdir


def test_duplicate_service(sample_duplicates_dir):
    result = duplicate_service.find_duplicates(sample_duplicates_dir, min_size_bytes=10)
    assert result.groups_count == 1
    assert result.total_duplicate_files == 2
    assert result.total_wasted_bytes > 0
    group = result.groups[0]
    assert len(group.files) == 3


@pytest.mark.asyncio
async def test_duplicate_api_endpoint(sample_duplicates_dir):
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
        response = await ac.post("/api/scan/duplicates", json={
            "folder_path": sample_duplicates_dir,
            "min_size_bytes": 10,
        })
    assert response.status_code == 200
    data = response.json()
    assert data["groups_count"] == 1
    assert data["total_duplicate_files"] == 2
