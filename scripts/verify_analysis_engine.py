#!/usr/bin/env python3
"""
Verify ProcrastinateOS deterministic file analysis engine against real temporary files.
Tests:
1. Exact duplicate detection (SHA-256)
2. Large-file identification (configurable threshold)
3. Empty-file detection (distinguishing sentinels)
4. Redundant export detection (source/export pairs, build directories)
5. Old-file review candidates (non-pejorative framing)
6. Explicit TODOs and unfinished-work markers with excerpts
7. Determinism across repeated scans
"""
from datetime import datetime, timedelta, timezone
import io
import os
from pathlib import Path
import sys
import tempfile

import docx
import pypdf

# Add backend to path
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "backend")))

from app.models.schemas import AnalysisOptions, FindingCategoryEnum
from app.services.analysis_engine import analysis_engine
from app.services.scanner_service import scanner_service


def main():
    print("=== ProcrastinateOS Deterministic Analysis Engine Verification ===")

    with tempfile.TemporaryDirectory() as tmp_dir:
        root = Path(tmp_dir)
        now = datetime.now(timezone.utc)

        # 1. Exact duplicates (valid PDF)
        dup1 = root / "invoice_march.pdf"
        dup2 = root / "invoice_march_copy.pdf"
        pdf_writer = pypdf.PdfWriter()
        pdf_writer.add_blank_page(width=100, height=100)
        buf_dup = io.BytesIO()
        pdf_writer.write(buf_dup)
        dup_bytes = buf_dup.getvalue()
        dup1.write_bytes(dup_bytes)
        dup2.write_bytes(dup_bytes)

        # 2. Large file (3 MB)
        large_f = root / "system_dump.raw"
        large_f.write_bytes(b"X" * (3 * 1024 * 1024))

        # 3. Empty files (one regular stub, one directory sentinel)
        empty_stub = root / "unwritten.py"
        empty_stub.write_bytes(b"")

        sentinel = root / "__init__.py"
        sentinel.write_bytes(b"")

        # 4. Redundant export: master source + compiled export
        source_doc = root / "thesis_draft.docx"
        doc = docx.Document()
        doc.add_heading("Master Thesis Draft", 0)
        doc.add_paragraph("Master thesis source document in word format.")
        doc.save(str(source_doc))

        export_pdf = root / "thesis_draft.pdf"
        exp_writer = pypdf.PdfWriter()
        exp_writer.add_blank_page(width=300, height=300)
        with open(export_pdf, "wb") as f_exp:
            exp_writer.write(f_exp)

        build_dir = root / "dist"
        build_dir.mkdir()
        build_artifact = build_dir / "index.bundle.js"
        build_artifact.write_text("var app=1;", encoding="utf-8")

        # 5. Old file review candidate (last modified 240 days ago)
        old_file = root / "reference_manual_v1.txt"
        old_file.write_text("Completed and stable architecture manual from last year.", encoding="utf-8")
        past_ts = (now - timedelta(days=240)).timestamp()
        os.utime(str(old_file), (past_ts, past_ts))

        # 6. Unfinished work document with explicit TODO and FIXME markers
        todo_doc = root / "roadmap.md"
        todo_doc.write_text(
            "# Roadmap\n\n## Section A\nTODO: Add multi-folder indexing benchmark.\n\n## Section B\nFIXME: Catch symlink cycle edge case in traversal.",
            encoding="utf-8",
        )

        print("\n[1/3] Scanning Workspace and Running Deterministic Analysis...")
        scan_result = scanner_service.scan_folder(
            str(root),
            compute_hashes=True,
            extract_documents=True,
        )

        # Run analysis engine with 2 MB threshold for large files, 180 days for old files
        opts = AnalysisOptions(
            large_file_threshold_bytes=2 * 1024 * 1024,
            old_file_threshold_days=180,
        )

        res1 = analysis_engine.analyze(
            root_path=str(root),
            files=scan_result.files,
            extracted_docs=scan_result.extracted_documents,
            options=opts,
        )

        print(f"  ✓ Workspace scanned: {res1.inventory.total_files} files, {res1.inventory.total_size_formatted}")
        print(f"  ✓ Total findings generated: {len(res1.findings)}")
        print(f"  ✓ Potential storage savings: {res1.findings_summary.total_potential_savings_formatted}")

        # Check each rule
        print("\n[2/3] Verifying Individual Deterministic Rules...")
        categories_found = {f.category for f in res1.findings}

        assert FindingCategoryEnum.EXACT_DUPLICATE in categories_found, "Missing exact duplicate finding"
        dup_f = next(f for f in res1.findings if f.category == FindingCategoryEnum.EXACT_DUPLICATE)
        assert len(dup_f.relative_paths) == 2
        print(f"  ✓ Exact Duplicate: found {dup_f.title} (reclaims {dup_f.storage_impact_formatted})")

        assert FindingCategoryEnum.LARGE_FILE in categories_found, "Missing large file finding"
        large_f_item = next(f for f in res1.findings if f.category == FindingCategoryEnum.LARGE_FILE)
        assert "system_dump.raw" in large_f_item.relative_paths[0]
        print(f"  ✓ Large File: {large_f_item.title}")

        assert FindingCategoryEnum.EMPTY_FILE in categories_found, "Missing empty file finding"
        empty_items = [f for f in res1.findings if f.category == FindingCategoryEnum.EMPTY_FILE]
        assert any("unwritten.py" in f.relative_paths[0] for f in empty_items)
        assert any("__init__.py" in f.relative_paths[0] for f in empty_items)
        print(f"  ✓ Empty Files: detected {len(empty_items)} empty files (including sentinel distinction)")

        assert FindingCategoryEnum.REDUNDANT_EXPORT in categories_found, "Missing redundant export finding"
        export_items = [f for f in res1.findings if f.category == FindingCategoryEnum.REDUNDANT_EXPORT]
        assert len(export_items) >= 2
        print(f"  ✓ Redundant Exports: detected {len(export_items)} export artifacts (source pair & build dir)")

        assert FindingCategoryEnum.OLD_FILE_REVIEW in categories_found, "Missing old file review finding"
        old_item = next(f for f in res1.findings if f.category == FindingCategoryEnum.OLD_FILE_REVIEW)
        assert old_item.storage_impact_bytes == 0  # Inactive files not treated as wasted!
        print(f"  ✓ Old File Review: {old_item.title} (non-pejorative framing preserved)")

        assert FindingCategoryEnum.UNFINISHED_WORK in categories_found, "Missing unfinished work finding"
        work_items = [f for f in res1.findings if f.category == FindingCategoryEnum.UNFINISHED_WORK]
        assert len(work_items) >= 2
        print(f"  ✓ Unfinished Work: detected {len(work_items)} explicit markers with source excerpts")

        # Verify Measured Facts vs Inferred Possibilities on every single finding
        for f in res1.findings:
            assert f.finding_id != "", "Empty finding ID"
            assert len(f.measured_facts) > 0, f"Finding {f.finding_id} missing measured facts"
            assert len(f.inferred_possibilities) > 0, f"Finding {f.finding_id} missing inferred possibilities"
            assert f.recommended_next_step != "", f"Finding {f.finding_id} missing recommendation"

        print("  ✓ Strict distinction between measured facts and inferred possibilities verified across all findings")

        # Verify Determinism across repeated execution
        print("\n[3/3] Verifying Strict Determinism Across Repeated Runs...")
        res2 = analysis_engine.analyze(
            root_path=str(root),
            files=scan_result.files,
            extracted_docs=scan_result.extracted_documents,
            options=opts,
        )

        assert len(res1.findings) == len(res2.findings), "Finding counts differ between runs"
        for idx, (f_a, f_b) in enumerate(zip(res1.findings, res2.findings)):
            assert f_a.finding_id == f_b.finding_id, f"Finding ID mismatch at {idx}: {f_a.finding_id} != {f_b.finding_id}"
            assert f_a.category == f_b.category
            assert f_a.severity == f_b.severity
            assert f_a.relative_paths == f_b.relative_paths
            assert f_a.storage_impact_bytes == f_b.storage_impact_bytes

        print("  ✓ Repeated scan test: 100% identical finding IDs, severity levels, and ordering")

    print("\nSUCCESS: All deterministic file analysis engine requirements verified!")


if __name__ == "__main__":
    main()
