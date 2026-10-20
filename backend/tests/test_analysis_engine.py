from datetime import datetime, timedelta, timezone
import os
from pathlib import Path
import tempfile
import pytest
from httpx import ASGITransport, AsyncClient

from app.main import app
from app.models.schemas import (
    AnalysisOptions,
    ExtractionStatusEnum,
    FileInfo,
    FindingCategoryEnum,
    FindingSeverityEnum,
)
from app.services.analysis_engine import analysis_engine
from app.services.document_extractor import document_extractor
from app.services.scanner_service import scanner_service


def test_exact_duplicate_detection_sha256():
    """Verify exact duplicate detection groups files by SHA-256 and calculates wasted bytes."""
    with tempfile.TemporaryDirectory() as tmpdir:
        f1 = Path(tmpdir) / "document.pdf"
        f2 = Path(tmpdir) / "document_copy.pdf"
        payload = b"IDENTICAL_DOCUMENT_PAYLOAD_BYTES" * 50
        f1.write_bytes(payload)
        f2.write_bytes(payload)

        scan_result = scanner_service.scan_folder(tmpdir, compute_hashes=True)
        findings = analysis_engine.analyze(tmpdir, scan_result.files).findings

        dup_findings = [f for f in findings if f.category == FindingCategoryEnum.EXACT_DUPLICATE]
        assert len(dup_findings) == 1
        finding = dup_findings[0]
        assert finding.storage_impact_bytes == len(payload)
        assert len(finding.relative_paths) == 2
        assert "document.pdf" in finding.relative_paths
        assert "document_copy.pdf" in finding.relative_paths
        assert any("SHA-256" in f for f in finding.measured_facts)
        assert any("Secondary copies" in pos for pos in finding.inferred_possibilities)
        assert "Preserve canonical copy" in finding.recommended_next_step


def test_large_file_identification_configurable_threshold():
    """Verify large files are flagged based on configurable byte threshold."""
    with tempfile.TemporaryDirectory() as tmpdir:
        big_f = Path(tmpdir) / "large_dataset.bin"
        # 2 MB payload
        big_f.write_bytes(b"A" * (2 * 1024 * 1024))

        small_f = Path(tmpdir) / "small_note.txt"
        small_f.write_text("hello", encoding="utf-8")

        scan_result = scanner_service.scan_folder(tmpdir, compute_hashes=False)

        # Set threshold to 1 MB -> should catch large_dataset.bin only
        opts = AnalysisOptions(large_file_threshold_bytes=1 * 1024 * 1024)
        analysis_res = analysis_engine.analyze(tmpdir, scan_result.files, options=opts)

        large_findings = [f for f in analysis_res.findings if f.category == FindingCategoryEnum.LARGE_FILE]
        assert len(large_findings) == 1
        assert large_findings[0].relative_paths == ["large_dataset.bin"]
        assert large_findings[0].storage_impact_bytes == 2 * 1024 * 1024
        assert any("Measured file size" in fact for fact in large_findings[0].measured_facts)


def test_empty_file_detection_and_sentinel_markers():
    """Verify zero-byte files and distinguish sentinel markers (.gitkeep)."""
    with tempfile.TemporaryDirectory() as tmpdir:
        empty_stub = Path(tmpdir) / "unpopulated.py"
        empty_stub.write_bytes(b"")

        sentinel = Path(tmpdir) / ".gitkeep"
        sentinel.write_bytes(b"")

        scan_result = scanner_service.scan_folder(tmpdir, compute_hashes=False, include_hidden=True)
        analysis_res = analysis_engine.analyze(tmpdir, scan_result.files)

        empty_findings = [f for f in analysis_res.findings if f.category == FindingCategoryEnum.EMPTY_FILE]
        assert len(empty_findings) == 2

        # Check sentinel finding
        sentinel_f = next(f for f in empty_findings if ".gitkeep" in f.relative_paths[0])
        assert sentinel_f.severity == FindingSeverityEnum.INFO
        assert any("sentinel" in fact.lower() for fact in sentinel_f.measured_facts)

        # Check regular empty stub
        stub_f = next(f for f in empty_findings if "unpopulated.py" in f.relative_paths[0])
        assert stub_f.severity == FindingSeverityEnum.LOW
        assert "Delete empty file" in stub_f.recommended_next_step


def test_redundant_export_detection_source_pair_and_build_dirs():
    """Verify detection of source/export pairs and build directory artifacts."""
    with tempfile.TemporaryDirectory() as tmpdir:
        # 1. Source and export pair
        source = Path(tmpdir) / "AnnualReport.docx"
        source.write_text("Source document", encoding="utf-8")
        export = Path(tmpdir) / "AnnualReport.pdf"
        export.write_text("Exported pdf", encoding="utf-8")

        # 2. Build folder export
        dist_dir = Path(tmpdir) / "dist"
        dist_dir.mkdir()
        bundle = dist_dir / "bundle.min.js"
        bundle.write_text("console.log(1)", encoding="utf-8")

        scan_result = scanner_service.scan_folder(tmpdir, compute_hashes=False)
        analysis_res = analysis_engine.analyze(tmpdir, scan_result.files)

        export_findings = [f for f in analysis_res.findings if f.category == FindingCategoryEnum.REDUNDANT_EXPORT]
        assert len(export_findings) >= 2

        # Check source pair
        pair_f = next(f for f in export_findings if "AnnualReport.pdf" in f.relative_paths)
        assert "AnnualReport.docx" in pair_f.relative_paths
        assert any("Master source file" in fact for fact in pair_f.measured_facts)

        # Check build directory artifact
        dist_f = next(f for f in export_findings if "bundle.min.js" in f.relative_paths[0])
        assert any("build/export directory" in fact for fact in dist_f.measured_facts)


def test_old_file_review_candidates_non_pejorative():
    """Verify old files are flagged as review candidates without being labeled useless."""
    now = datetime.now(timezone.utc)
    old_mtime = (now - timedelta(days=200)).timestamp()

    with tempfile.TemporaryDirectory() as tmpdir:
        old_file = Path(tmpdir) / "historical_archive.txt"
        old_file.write_text("Important archive notes from last year", encoding="utf-8")
        os.utime(str(old_file), (old_mtime, old_mtime))

        scan_result = scanner_service.scan_folder(tmpdir, compute_hashes=False)
        opts = AnalysisOptions(old_file_threshold_days=180)
        analysis_res = analysis_engine.analyze(tmpdir, scan_result.files, options=opts)

        old_findings = [f for f in analysis_res.findings if f.category == FindingCategoryEnum.OLD_FILE_REVIEW]
        assert len(old_findings) == 1
        finding = old_findings[0]
        assert finding.storage_impact_bytes == 0  # Inactive files are not automatically counted as wasted!
        assert any("does NOT imply the file is useless" in pos for pos in finding.inferred_possibilities)
        assert "Review Candidate" in finding.title


def test_unfinished_work_marker_detection_with_excerpts():
    """Verify detection of explicit TODO, FIXME, WIP markers and bounded source excerpts."""
    with tempfile.TemporaryDirectory() as tmpdir:
        todo_doc = Path(tmpdir) / "notes.md"
        todo_doc.write_text(
            "# Architecture\n\n## Section 1\nTODO: Implement offline duplicate cache.\n\n## Section 2\nFIXME: Resolve memory leak in stream parser.",
            encoding="utf-8",
        )

        scan_result = scanner_service.scan_folder(tmpdir, extract_documents=True)
        analysis_res = analysis_engine.analyze(
            tmpdir, scan_result.files, extracted_docs=scan_result.extracted_documents
        )

        work_findings = [f for f in analysis_res.findings if f.category == FindingCategoryEnum.UNFINISHED_WORK]
        assert len(work_findings) >= 2

        markers = {f.metadata["marker"] for f in work_findings}
        assert "TODO" in markers
        assert "FIXME" in markers

        fixme_finding = next(f for f in work_findings if f.metadata["marker"] == "FIXME")
        assert fixme_finding.severity == FindingSeverityEnum.MEDIUM
        assert "memory leak" in fixme_finding.metadata["excerpt"]
        assert any("Section 2" in fact for fact in fixme_finding.measured_facts)


def test_determinism_repeated_scans_produce_identical_findings():
    """Verify repeated scans of the same workspace produce identical finding IDs, contents, and order."""
    with tempfile.TemporaryDirectory() as tmpdir:
        # Create various files
        f1 = Path(tmpdir) / "draft.md"
        f1.write_text("# Project\nTODO: add tests\n\n## Details\nWIP: refactoring", encoding="utf-8")

        f2 = Path(tmpdir) / "fileA.bin"
        f3 = Path(tmpdir) / "fileB.bin"
        payload = b"IDENTICAL_BYTES" * 100
        f2.write_bytes(payload)
        f3.write_bytes(payload)

        scan_1 = scanner_service.scan_folder(tmpdir, compute_hashes=True, extract_documents=True)
        res_1 = analysis_engine.analyze(tmpdir, scan_1.files, extracted_docs=scan_1.extracted_documents)

        scan_2 = scanner_service.scan_folder(tmpdir, compute_hashes=True, extract_documents=True)
        res_2 = analysis_engine.analyze(tmpdir, scan_2.files, extracted_docs=scan_2.extracted_documents)

        assert len(res_1.findings) == len(res_2.findings)
        for find_a, find_b in zip(res_1.findings, res_2.findings):
            assert find_a.finding_id == find_b.finding_id
            assert find_a.category == find_b.category
            assert find_a.severity == find_b.severity
            assert find_a.relative_paths == find_b.relative_paths
            assert find_a.storage_impact_bytes == find_b.storage_impact_bytes


def test_unsupported_file_types_and_missing_metadata_handled():
    """Verify unsupported formats and binary files do not crash the analysis engine."""
    with tempfile.TemporaryDirectory() as tmpdir:
        weird_file = Path(tmpdir) / "strange_blob.xyz123"
        weird_file.write_bytes(b"\x00\xff\xfe\x01\x02\x03\x04")

        scan_result = scanner_service.scan_folder(tmpdir, compute_hashes=True, extract_documents=True)
        res = analysis_engine.analyze(tmpdir, scan_result.files, extracted_docs=scan_result.extracted_documents)

        assert res.inventory.total_files == 1
        assert res.inventory.total_size_bytes == 7


@pytest.mark.asyncio
async def test_api_analysis_rules_and_deterministic_endpoints():
    """Verify GET /api/analysis/rules and POST /api/analysis/deterministic endpoints."""
    with tempfile.TemporaryDirectory() as tmpdir:
        f = Path(tmpdir) / "plan.md"
        f.write_text("# Plan\nTODO: Deploy app to production", encoding="utf-8")

        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
            # 1. Rules endpoint
            rules_res = await client.get("/api/analysis/rules")
            assert rules_res.status_code == 200
            rules_data = rules_res.json()
            assert rules_data["offline_ready"] is True
            assert rules_data["ai_dependency"] is False
            assert len(rules_data["rules"]) == 6

            # 2. Deterministic analysis endpoint
            analyze_res = await client.post(
                "/api/analysis/deterministic",
                json={
                    "folder_path": tmpdir,
                    "options": {"large_file_threshold_bytes": 1048576, "old_file_threshold_days": 90},
                },
            )
            assert analyze_res.status_code == 200
            analyze_data = analyze_res.json()
            assert "inventory" in analyze_data
            assert "findings" in analyze_data
            assert "findings_summary" in analyze_data
            assert analyze_data["inventory"]["total_files"] == 1
            assert any(f["category"] == "unfinished_work" for f in analyze_data["findings"])
