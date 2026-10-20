import json
import os
import tempfile
from unittest.mock import AsyncMock, patch
import httpx
import pytest
from httpx import ASGITransport, AsyncClient

from app.main import app
from datetime import datetime, timezone

from app.models.schemas import (
    DocumentChunk,
    DocumentExtractionResult,
    ExtractionStatusEnum,
    FileInfo,
    ProjectGroupConfidence,
)
from app.services.local_ai_service import LocalAIService, clean_json_text


def make_mock_file(file_id: str, name: str, rel_path: str, ext: str, size: int) -> FileInfo:
    return FileInfo(
        file_id=file_id,
        path=f"/mock/{rel_path}",
        relative_path=rel_path,
        name=name,
        extension=ext,
        size_bytes=size,
        size_formatted=f"{size} B",
        category="documents",
        mime_type="text/plain",
        content_format="text",
        is_previewable=True,
        modified_at=datetime(2026, 1, 1, tzinfo=timezone.utc),
        days_inactive=10,
        is_likely_abandoned=False,
    )


def make_mock_doc(file_id: str, rel_path: str, ext: str, chunk_ref: str, text: str) -> DocumentExtractionResult:
    chunk = DocumentChunk(
        chunk_id=f"chk-{file_id}",
        file_id=file_id,
        relative_path=rel_path,
        reference=chunk_ref,
        text=text,
        token_estimate=len(text) // 4,
        char_count=len(text),
    )
    return DocumentExtractionResult(
        file_id=file_id,
        path=f"/mock/{rel_path}",
        relative_path=rel_path,
        extension=ext,
        status=ExtractionStatusEnum.SUCCESS,
        total_chars=len(text),
        total_chunks=1,
        chunks=[chunk],
    )


@pytest.fixture
def mock_files_and_docs():
    file1 = make_mock_file("fid-novel-ch1", "chapter_1.txt", "novel/chapter_1.txt", ".txt", 1200)
    file2 = make_mock_file("fid-novel-outline", "plot_outline.md", "notes/plot_outline.md", ".md", 2400)
    file3 = make_mock_file("fid-unrelated-recipe", "pancake_recipe.txt", "kitchen/pancake_recipe.txt", ".txt", 800)

    doc1 = make_mock_doc(
        "fid-novel-ch1",
        "novel/chapter_1.txt",
        ".txt",
        "Line 1-10",
        "Chapter 1. Detective Vance arrived at the manor. TODO: clarify the motive behind the missing heirloom.",
    )
    doc2 = make_mock_doc(
        "fid-novel-outline",
        "notes/plot_outline.md",
        ".md",
        "Section: Characters",
        "Detective Vance mysteries. Plot outline for the manor crime series. Need to resolve chapter 1 climax.",
    )
    doc3 = make_mock_doc(
        "fid-unrelated-recipe",
        "kitchen/pancake_recipe.txt",
        ".txt",
        "Full text",
        "Ingredients: 2 cups flour, 2 eggs, 1 cup milk. Mix well.",
    )

    return [file1, file2, file3], [doc1, doc2, doc3]


# -----------------------------------------------------------------------------
# Clean JSON Helper Tests
# -----------------------------------------------------------------------------
def test_clean_json_text_strips_fences_and_wrapper():
    fenced_json = "```json\n{\"status\": \"ok\"}\n```"
    assert clean_json_text(fenced_json) == '{"status": "ok"}'

    prose_wrapped = "Here is the result:\n```\n[1, 2, 3]\n```\nHope that helps!"
    assert clean_json_text(prose_wrapped) == "[1, 2, 3]"

    already_clean = '{"groups": []}'
    assert clean_json_text(already_clean) == '{"groups": []}'


# -----------------------------------------------------------------------------
# Health Check & Ollama Verification Tests (Mocked)
# -----------------------------------------------------------------------------
@pytest.mark.asyncio
async def test_health_check_ollama_online_and_model_present():
    service = LocalAIService()

    mock_tags_response = httpx.Response(
        status_code=200,
        json={"models": [{"name": "qwen2.5:1.5b:latest"}, {"name": "llama3:latest"}]},
        request=httpx.Request("GET", "http://localhost:11434/api/tags"),
    )

    with patch("httpx.AsyncClient.get", new_callable=AsyncMock) as mock_get:
        mock_get.return_value = mock_tags_response
        health = await service.check_health("qwen2.5:1.5b")

        assert health.connected is True
        assert health.model_present is True
        assert health.target_model == "qwen2.5:1.5b"
        assert health.fix_instructions is None


@pytest.mark.asyncio
async def test_health_check_ollama_online_but_model_missing():
    service = LocalAIService()

    mock_tags_response = httpx.Response(
        status_code=200,
        json={"models": [{"name": "llama3:latest"}]},
        request=httpx.Request("GET", "http://localhost:11434/api/tags"),
    )

    with patch("httpx.AsyncClient.get", new_callable=AsyncMock) as mock_get:
        mock_get.return_value = mock_tags_response
        health = await service.check_health("qwen2.5:1.5b")

        assert health.connected is True
        assert health.model_present is False
        assert health.fix_instructions is not None and "ollama pull qwen2.5:1.5b" in health.fix_instructions


@pytest.mark.asyncio
async def test_health_check_ollama_offline():
    service = LocalAIService()

    with patch("httpx.AsyncClient.get", new_callable=AsyncMock, side_effect=httpx.ConnectError("Connection refused")):
        health = await service.check_health("qwen2.5:1.5b")

        assert health.connected is False
        assert health.model_present is False
        assert health.fix_instructions is not None and "ollama serve" in health.fix_instructions


# -----------------------------------------------------------------------------
# Capability A: Semantic Project Grouping Tests (Mocked)
# -----------------------------------------------------------------------------
@pytest.mark.asyncio
async def test_semantic_grouping_valid_clustering_and_path_resolution(mock_files_and_docs):
    files, docs = mock_files_and_docs
    service = LocalAIService()

    mock_llm_json = {
        "groups": [
            {
                "group_id": "proj-vance-mysteries",
                "project_name": "Detective Vance Mystery Series",
                "file_ids": ["fid-novel-ch1", "fid-novel-outline", "fid-hallucinated-doc-999"],
                "confidence": "high",
                "evidence": "Both documents reference Detective Vance manor mystery",
                "theme_summary": "Draft chapter and plot outline for Vance series",
            }
        ]
    }

    # Mock health check and raw ollama call
    with patch.object(service, "check_health", new_callable=AsyncMock) as mock_health, \
         patch.object(service, "_call_ollama_raw", new_callable=AsyncMock) as mock_ollama:

        from app.models.schemas import AIHealthStatus
        mock_health.return_value = AIHealthStatus(
            connected=True,
            url="http://localhost:11434",
            target_model="qwen2.5:1.5b",
            model_present=True,
            available_models=["qwen2.5:1.5b"],
        )
        mock_ollama.return_value = json.dumps(mock_llm_json)

        res = await service.group_semantic_projects(files, docs, model="qwen2.5:1.5b")

        assert res.status == "success"
        assert len(res.groups) == 1
        group = res.groups[0]
        assert group.project_name == "Detective Vance Mystery Series"
        assert group.confidence == ProjectGroupConfidence.HIGH

        # Verify hallucinated file ID was stripped
        assert "fid-hallucinated-doc-999" not in group.file_ids
        assert group.file_ids == ["fid-novel-ch1", "fid-novel-outline"]

        # Verify paths resolved strictly from backend registry
        assert "novel/chapter_1.txt" in group.relative_paths
        assert "notes/plot_outline.md" in group.relative_paths
        assert len(group.relative_paths) == 2


@pytest.mark.asyncio
async def test_semantic_grouping_filters_out_insufficient_matches(mock_files_and_docs):
    files, docs = mock_files_and_docs
    service = LocalAIService()

    # Model returned a group with only 1 valid file and 1 hallucinated file
    mock_llm_json = {
        "groups": [
            {
                "group_id": "proj-single",
                "project_name": "Lone Project",
                "file_ids": ["fid-novel-ch1", "fid-completely-fake"],
                "confidence": "medium",
                "evidence": "Single match",
                "theme_summary": "Single",
            }
        ]
    }

    with patch.object(service, "check_health", new_callable=AsyncMock) as mock_health, \
         patch.object(service, "_call_ollama_raw", new_callable=AsyncMock) as mock_ollama:

        from app.models.schemas import AIHealthStatus
        mock_health.return_value = AIHealthStatus(
            connected=True,
            url="http://localhost:11434",
            target_model="qwen2.5:1.5b",
            model_present=True,
            available_models=["qwen2.5:1.5b"],
        )
        mock_ollama.return_value = json.dumps(mock_llm_json)

        res = await service.group_semantic_projects(files, docs, model="qwen2.5:1.5b")

        assert res.status == "success"
        # Since < 2 valid files remain, group must be dropped
        assert len(res.groups) == 0


# -----------------------------------------------------------------------------
# Capability B: Forgotten-Work Recovery Tests (Mocked)
# -----------------------------------------------------------------------------
@pytest.mark.asyncio
async def test_forgotten_work_recovery_explicit_evidence(mock_files_and_docs):
    files, docs = mock_files_and_docs
    service = LocalAIService()

    mock_llm_json = {
        "items": [
            {
                "item_id": "fw-1",
                "title": "Clarify motive behind missing heirloom",
                "file_id": "fid-novel-ch1",
                "task_type": "todo",
                "evidence_excerpt": "TODO: clarify the motive behind the missing heirloom.",
                "section_reference": "Line 1-10",
                "suggested_action": "Write the backstory detailing why the heirloom was stolen.",
                "confidence": "high",
            },
            {
                "item_id": "fw-2",
                "title": "Resolve chapter 1 climax",
                "file_id": "fid-novel-outline",
                "task_type": "incomplete_draft",
                "evidence_excerpt": "Need to resolve chapter 1 climax.",
                "section_reference": "Section: Characters",
                "suggested_action": "Draft final showdown scene in the manor library.",
                "confidence": "high",
            },
            {
                "item_id": "fw-fake",
                "title": "Hallucinated task",
                "file_id": "fake_file_id_not_in_workspace",
                "task_type": "todo",
                "evidence_excerpt": "Some fake evidence",
            },
        ]
    }

    with patch.object(service, "check_health", new_callable=AsyncMock) as mock_health, \
         patch.object(service, "_call_ollama_raw", new_callable=AsyncMock) as mock_ollama:

        from app.models.schemas import AIHealthStatus
        mock_health.return_value = AIHealthStatus(
            connected=True,
            url="http://localhost:11434",
            target_model="qwen2.5:1.5b",
            model_present=True,
            available_models=["qwen2.5:1.5b"],
        )
        mock_ollama.return_value = json.dumps(mock_llm_json)

        res = await service.recover_forgotten_work(files, docs, model="qwen2.5:1.5b")

        assert res.status == "success"
        # Fake file ID item must be discarded
        assert len(res.items) == 2

        item1 = res.items[0]
        assert item1.file_id == "fid-novel-ch1"
        assert item1.relative_path == "novel/chapter_1.txt"
        assert "TODO: clarify the motive" in item1.evidence_excerpt

        item2 = res.items[1]
        assert item2.file_id == "fid-novel-outline"
        assert item2.relative_path == "notes/plot_outline.md"


# -----------------------------------------------------------------------------
# Capability C: Action Recommendations & Retry Handling Tests (Mocked)
# -----------------------------------------------------------------------------
@pytest.mark.asyncio
async def test_action_recommendations_with_single_retry(mock_files_and_docs):
    files, _ = mock_files_and_docs
    service = LocalAIService()

    valid_response_json = {
        "summary": "Workspace has unfinished draft materials and duplicate files needing attention.",
        "recommendations": [
            {
                "recommendation_id": "rec-1",
                "title": "Finish Chapter 1 Climax in Detective Vance",
                "category": "review_unfinished",
                "priority": "high",
                "rationale": "High value draft nearing completion",
                "action_step": "Open novel/chapter_1.txt and write the resolution scene.",
                "estimated_time_minutes": 15,
            }
        ],
    }

    # First attempt returns corrupted non-JSON text; second retry returns valid JSON
    corrupted_output = "I am an AI, here is the recommendation: {not valid json"
    valid_output = json.dumps(valid_response_json)

    with patch.object(service, "check_health", new_callable=AsyncMock) as mock_health, \
         patch.object(service, "_call_ollama_raw", new_callable=AsyncMock, side_effect=[corrupted_output, valid_output]) as mock_ollama:

        from app.models.schemas import AIHealthStatus
        mock_health.return_value = AIHealthStatus(
            connected=True,
            url="http://localhost:11434",
            target_model="qwen2.5:1.5b",
            model_present=True,
            available_models=["qwen2.5:1.5b"],
        )

        res = await service.generate_action_recommendations(
            folder_path="/mock/workspace",
            files=files,
            findings_count=4,
            duplicate_bytes=5000000,
            duplicate_formatted="5.0 MB",
            unfinished_items_count=2,
            categories_summary=[{"category": "documents", "count": 3, "size": "4.4 KB"}],
            model="qwen2.5:1.5b",
        )

        assert res.status == "success"
        assert len(res.recommendations) == 1
        assert res.recommendations[0].title == "Finish Chapter 1 Climax in Detective Vance"
        assert mock_ollama.call_count == 2  # Exactly 1 retry before success


@pytest.mark.asyncio
async def test_action_recommendations_offline_deterministic_fallback(mock_files_and_docs):
    files, _ = mock_files_and_docs
    service = LocalAIService()

    # Ollama is offline
    with patch.object(service, "check_health", new_callable=AsyncMock) as mock_health:
        from app.models.schemas import AIHealthStatus
        mock_health.return_value = AIHealthStatus(
            connected=False,
            url="http://localhost:11434",
            target_model="qwen2.5:1.5b",
            model_present=False,
            available_models=[],
            fix_instructions="Run 'ollama serve' in your terminal.",
        )

        res = await service.generate_action_recommendations(
            folder_path="/mock/workspace",
            files=files,
            findings_count=3,
            duplicate_bytes=10485760,
            duplicate_formatted="10.0 MB",
            unfinished_items_count=3,
            categories_summary=[],
            model="qwen2.5:1.5b",
        )

        assert res.status == "model_unavailable"
        assert res.fix_suggestion is not None and "ollama serve" in res.fix_suggestion
        # Deterministic fallback recommendations provided
        assert len(res.recommendations) >= 2
        categories = [r.category for r in res.recommendations]
        assert "duplicate_cleanup" in categories
        assert "review_unfinished" in categories


# -----------------------------------------------------------------------------
# FastAPI AI API Endpoints Tests
# -----------------------------------------------------------------------------
@pytest.mark.asyncio
async def test_api_ai_health_endpoint():
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
        with patch("app.services.local_ai_service.local_ai_service.check_health", new_callable=AsyncMock) as mock_chk:
            from app.models.schemas import AIHealthStatus
            mock_chk.return_value = AIHealthStatus(
                connected=True,
                url="http://localhost:11434",
                target_model="qwen2.5:1.5b",
                model_present=True,
                available_models=["qwen2.5:1.5b:latest"],
            )

            response = await ac.get("/api/ai/health?model=qwen2.5:1.5b")
            assert response.status_code == 200
            data = response.json()
            assert data["connected"] is True
            assert data["model_present"] is True
            assert data["target_model"] == "qwen2.5:1.5b"


@pytest.mark.asyncio
async def test_api_ai_semantic_groups_endpoint():
    with tempfile.TemporaryDirectory() as tmpdir:
        # Create 2 text files with content
        f1 = os.path.join(tmpdir, "alpha.txt")
        f2 = os.path.join(tmpdir, "beta.md")
        with open(f1, "w") as f:
            f.write("Project Apollo telemetry specs and flight trajectories.")
        with open(f2, "w") as f:
            f.write("# Apollo Mission Notes\nTelemetry verification checklist.")

        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
            with patch("app.services.local_ai_service.local_ai_service.group_semantic_projects", new_callable=AsyncMock) as mock_grp:
                from app.models.schemas import SemanticGroupingResponse, SemanticProjectGroup
                mock_grp.return_value = SemanticGroupingResponse(
                    status="success",
                    groups=[
                        SemanticProjectGroup(
                            group_id="proj-apollo",
                            project_name="Apollo Mission",
                            file_ids=["id1", "id2"],
                            relative_paths=["alpha.txt", "beta.md"],
                            confidence=ProjectGroupConfidence.HIGH,
                            evidence="Apollo telemetry references",
                            theme_summary="Flight trajectory notes",
                        )
                    ],
                    model_used="qwen2.5:1.5b",
                    analyzed_documents_count=2,
                    duration_seconds=0.5,
                )

                response = await ac.post("/api/ai/semantic-groups", json={"folder_path": tmpdir})
                assert response.status_code == 200
                data = response.json()
                assert data["status"] == "success"
                assert len(data["groups"]) == 1
                assert data["groups"][0]["project_name"] == "Apollo Mission"


@pytest.mark.asyncio
async def test_api_ai_forgotten_work_endpoint():
    with tempfile.TemporaryDirectory() as tmpdir:
        draft_file = os.path.join(tmpdir, "draft.txt")
        with open(draft_file, "w") as f:
            f.write("Section 1: Initial draft. TODO: verify experiment conclusions before publishing.")

        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
            with patch("app.services.local_ai_service.local_ai_service.recover_forgotten_work", new_callable=AsyncMock) as mock_rec:
                from app.models.schemas import ForgottenWorkItem, ForgottenWorkRecoveryResponse, ForgottenWorkType
                mock_rec.return_value = ForgottenWorkRecoveryResponse(
                    status="success",
                    items=[
                        ForgottenWorkItem(
                            item_id="fw-test-1",
                            title="Verify Experiment Conclusions",
                            file_id="fid-draft-1",
                            relative_path="draft.txt",
                            task_type=ForgottenWorkType.TODO,
                            evidence_excerpt="TODO: verify experiment conclusions before publishing.",
                            section_reference="Section 1",
                            suggested_action="Review raw experiment data and write concluding section.",
                            confidence="high",
                        )
                    ],
                    model_used="qwen2.5:1.5b",
                    analyzed_documents_count=1,
                    duration_seconds=0.4,
                )

                response = await ac.post("/api/ai/forgotten-work", json={"folder_path": tmpdir})
                assert response.status_code == 200
                data = response.json()
                assert data["status"] == "success"
                assert len(data["items"]) == 1
                assert data["items"][0]["title"] == "Verify Experiment Conclusions"


@pytest.mark.asyncio
async def test_api_ai_recommendations_endpoint():
    with tempfile.TemporaryDirectory() as tmpdir:
        test_file = os.path.join(tmpdir, "test.txt")
        with open(test_file, "w") as f:
            f.write("Just some text content for scanning.")

        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
            with patch("app.services.local_ai_service.local_ai_service.generate_action_recommendations", new_callable=AsyncMock) as mock_gen:
                from app.models.schemas import ActionRecommendationsResponse, AIActionRecommendation
                mock_gen.return_value = ActionRecommendationsResponse(
                    status="success",
                    summary="Test workspace action summary.",
                    recommendations=[
                        AIActionRecommendation(
                            recommendation_id="rec-api-1",
                            title="Clean Up Workspace Duplicates",
                            category="duplicate_cleanup",
                            priority="high",
                            rationale="Storage savings",
                            action_step="Review Duplicate Finder tab",
                            estimated_time_minutes=4,
                        )
                    ],
                    model_used="qwen2.5:1.5b",
                    duration_seconds=0.3,
                )

                response = await ac.post("/api/ai/recommendations", json={"folder_path": tmpdir})
                assert response.status_code == 200
                data = response.json()
                assert data["status"] == "success"
                assert len(data["recommendations"]) == 1
                assert data["recommendations"][0]["title"] == "Clean Up Workspace Duplicates"

