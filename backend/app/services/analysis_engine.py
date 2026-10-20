from collections import defaultdict
from datetime import datetime, timezone
import hashlib
import os
from pathlib import Path
import re
import time
from typing import Any, Dict, List, Optional, Set, Tuple

from app.models.schemas import (
    AnalysisOptions,
    DeterministicAnalysisResult,
    DeterministicFinding,
    DocumentExtractionResult,
    FileInfo,
    FindingCategoryEnum,
    FindingsSummary,
    FindingSeverityEnum,
    InventorySummary,
)
def format_bytes(size: int) -> str:
    """Format bytes into readable human format."""
    if size < 1024:
        return f"{size} B"
    size_f = float(size)
    for unit in ["KB", "MB", "GB", "TB"]:
        size_f /= 1024.0
        if size_f < 1024.0:
            return f"{size_f:.1f} {unit}"
    return f"{size_f:.1f} PB"


# Documented source-to-export format associations
SOURCE_EXTENSIONS: Set[str] = {
    ".docx",
    ".doc",
    ".md",
    ".markdown",
    ".rst",
    ".tex",
    ".key",
    ".pages",
    ".psd",
    ".ai",
}

EXPORT_EXTENSIONS: Set[str] = {
    ".pdf",
    ".html",
    ".htm",
    ".epub",
    ".png",
    ".jpg",
    ".jpeg",
}

EXPORT_DIRECTORIES: Set[str] = {
    "dist",
    "build",
    "out",
    "export",
    "exports",
    "generated",
    "target",
}

SENTINEL_FILENAMES: Set[str] = {
    ".gitkeep",
    "__init__.py",
    ".keep",
    ".touch",
    ".empty",
}

UNFINISHED_MARKERS_REGEX = re.compile(
    r"(?i)(?:\b(TODO|FIXME|WIP|DRAFT|STUB|TBD|HOLD|UNFINISHED|XXX)\b\s*[:\-\s]\s*([^\n\r]{1,160}))|(?:\s*-\s*\[\s*\]\s+([^\n\r]{1,160}))"
)


def make_finding_id(category: FindingCategoryEnum, keys: List[str]) -> str:
    """Generate deterministic, stable finding ID from category and unique sorted keys."""
    sorted_joined = ":".join(sorted(keys))
    token = f"{category.value}:{sorted_joined}"
    hash_hex = hashlib.sha256(token.encode("utf-8")).hexdigest()[:12]
    return f"find_{category.value}_{hash_hex}"


class DeterministicAnalysisEngine:
    """
    Deterministic file analysis engine for ProcrastinateOS.
    Operates strictly on-device without cloud services or Ollama dependencies.
    Produces identical findings across repeated scans of identical workspace files.
    """

    def analyze(
        self,
        root_path: str,
        files: List[FileInfo],
        extracted_docs: Optional[List[DocumentExtractionResult]] = None,
        options: Optional[AnalysisOptions] = None,
    ) -> DeterministicAnalysisResult:
        start_time = time.monotonic()
        opts = options or AnalysisOptions()
        now = datetime.now(timezone.utc)
        extracted = extracted_docs or []

        # Map relative path to FileInfo and DocumentExtractionResult
        file_map: Dict[str, FileInfo] = {f.relative_path: f for f in files}
        doc_map: Dict[str, DocumentExtractionResult] = {d.relative_path: d for d in extracted}

        # 1. Compute Inventory Summary
        inventory = self._compute_inventory(files, extracted)

        findings: List[DeterministicFinding] = []

        # 2. Rule: Exact Duplicate Detection (SHA-256)
        duplicate_findings = self._detect_exact_duplicates(files, opts)
        findings.extend(duplicate_findings)

        # 3. Rule: Large File Identification
        large_file_findings = self._detect_large_files(files, opts)
        findings.extend(large_file_findings)

        # 4. Rule: Empty File Detection
        empty_file_findings = self._detect_empty_files(files, doc_map)
        findings.extend(empty_file_findings)

        # 5. Rule: Potentially Redundant Export Detection
        if opts.enable_export_detection:
            export_findings = self._detect_redundant_exports(files)
            findings.extend(export_findings)

        # 6. Rule: Old File Review Candidates
        old_file_findings = self._detect_old_file_candidates(files, opts)
        findings.extend(old_file_findings)

        # 7. Rule: Explicit TODOs and Unfinished Work Markers
        if opts.enable_unfinished_work_scan:
            unfinished_findings = self._detect_unfinished_work(extracted, files)
            findings.extend(unfinished_findings)

        # Sort findings deterministically by (category, severity, finding_id)
        severity_order = {
            FindingSeverityEnum.HIGH: 0,
            FindingSeverityEnum.MEDIUM: 1,
            FindingSeverityEnum.LOW: 2,
            FindingSeverityEnum.INFO: 3,
        }
        findings.sort(key=lambda f: (severity_order.get(f.severity, 4), f.category.value, f.finding_id))

        # 8. Compute Findings Summary
        summary = self._compute_findings_summary(findings)
        duration = round(time.monotonic() - start_time, 3)

        return DeterministicAnalysisResult(
            root_path=root_path,
            analyzed_at=now,
            duration_seconds=duration,
            options=opts,
            inventory=inventory,
            findings=findings,
            findings_summary=summary,
        )

    def _compute_inventory(
        self, files: List[FileInfo], extracted: List[DocumentExtractionResult]
    ) -> InventorySummary:
        total_files = len(files)
        total_size = sum(f.size_bytes for f in files)
        category_counts: Dict[str, int] = defaultdict(int)
        category_sizes: Dict[str, int] = defaultdict(int)

        oldest_f: Optional[FileInfo] = None
        newest_f: Optional[FileInfo] = None
        largest_f: Optional[FileInfo] = None

        for f in files:
            category_counts[f.category] += 1
            category_sizes[f.category] += f.size_bytes

            if oldest_f is None or f.modified_at < oldest_f.modified_at:
                oldest_f = f
            if newest_f is None or f.modified_at > newest_f.modified_at:
                newest_f = f
            if largest_f is None or f.size_bytes > largest_f.size_bytes:
                largest_f = f

        return InventorySummary(
            total_files=total_files,
            total_size_bytes=total_size,
            total_size_formatted=format_bytes(total_size),
            category_counts=dict(category_counts),
            category_sizes=dict(category_sizes),
            oldest_file_relative=oldest_f.relative_path if oldest_f else None,
            oldest_file_date=oldest_f.modified_at if oldest_f else None,
            newest_file_relative=newest_f.relative_path if newest_f else None,
            newest_file_date=newest_f.modified_at if newest_f else None,
            largest_file_relative=largest_f.relative_path if largest_f else None,
            largest_file_size_formatted=format_bytes(largest_f.size_bytes) if largest_f else None,
            documents_extracted_count=len(extracted),
        )

    def _detect_exact_duplicates(
        self, files: List[FileInfo], opts: AnalysisOptions
    ) -> List[DeterministicFinding]:
        """Detect byte-identical files using verified SHA-256 hashes."""
        findings: List[DeterministicFinding] = []
        hash_groups: Dict[str, List[FileInfo]] = defaultdict(list)

        for f in files:
            if f.sha256 and f.size_bytes >= opts.min_duplicate_size_bytes:
                hash_groups[f.sha256].append(f)

        for sha256_hash, group in hash_groups.items():
            if len(group) < 2:
                continue

            # Deterministic ordering by relative path
            group_sorted = sorted(group, key=lambda x: x.relative_path)
            primary = group_sorted[0]
            redundant = group_sorted[1:]
            unit_size = primary.size_bytes
            wasted_bytes = unit_size * len(redundant)

            file_ids = [f.file_id or f.sha256 or f.relative_path for f in group_sorted]
            rel_paths = [f.relative_path for f in group_sorted]

            finding_id = make_finding_id(
                FindingCategoryEnum.EXACT_DUPLICATE,
                [sha256_hash] + rel_paths,
            )

            severity = FindingSeverityEnum.HIGH if wasted_bytes >= 10 * 1024 * 1024 else FindingSeverityEnum.MEDIUM

            measured_facts = [
                f"SHA-256 checksum: {sha256_hash}",
                f"Identical byte size: {format_bytes(unit_size)} ({unit_size} bytes) across {len(group_sorted)} files",
                f"Recoverable storage space: {format_bytes(wasted_bytes)} ({wasted_bytes} bytes)",
                f"Primary path: {primary.relative_path}",
                f"Duplicate path(s): {', '.join(f.relative_path for f in redundant)}",
            ]

            inferred_possibilities = [
                "Files share an identical cryptographic hash, indicating bit-for-bit equivalence regardless of differing filenames.",
                "Secondary copies may have resulted from repeated downloads, folder copying, or accidental backup snapshots.",
            ]

            explanation = (
                f"Found {len(group_sorted)} files sharing exact SHA-256 hash '{sha256_hash[:12]}...'. "
                f"Reclaiming redundant copies can free {format_bytes(wasted_bytes)} of disk space."
            )

            recommended_step = (
                f"Preserve canonical copy at '{primary.relative_path}' and safely delete or symlink the "
                f"{len(redundant)} redundant duplicate(s)."
            )

            findings.append(
                DeterministicFinding(
                    finding_id=finding_id,
                    category=FindingCategoryEnum.EXACT_DUPLICATE,
                    severity=severity,
                    title=f"Exact Duplicate: {primary.name} ({len(group_sorted)} copies)",
                    file_ids=file_ids,
                    relative_paths=rel_paths,
                    facts=[f"SHA-256: {sha256_hash}", f"Size: {format_bytes(unit_size)}", f"Wasted: {format_bytes(wasted_bytes)}"],
                    explanation=explanation,
                    recommended_next_step=recommended_step,
                    measured_facts=measured_facts,
                    inferred_possibilities=inferred_possibilities,
                    storage_impact_bytes=wasted_bytes,
                    storage_impact_formatted=format_bytes(wasted_bytes),
                    metadata={"sha256": sha256_hash, "wasted_bytes": wasted_bytes, "unit_size_bytes": unit_size},
                )
            )

        return findings

    def _detect_large_files(
        self, files: List[FileInfo], opts: AnalysisOptions
    ) -> List[DeterministicFinding]:
        """Detect files exceeding the configured large-file threshold."""
        findings: List[DeterministicFinding] = []
        threshold = opts.large_file_threshold_bytes

        for f in files:
            if f.size_bytes >= threshold:
                f_id = f.file_id or f.sha256 or f.relative_path
                finding_id = make_finding_id(
                    FindingCategoryEnum.LARGE_FILE,
                    [f.relative_path, str(f.size_bytes)],
                )

                severity = (
                    FindingSeverityEnum.HIGH
                    if f.size_bytes >= 200 * 1024 * 1024
                    else FindingSeverityEnum.MEDIUM
                )

                measured_facts = [
                    f"Measured file size: {format_bytes(f.size_bytes)} ({f.size_bytes} bytes)",
                    f"Configured threshold: {format_bytes(threshold)} ({threshold} bytes)",
                    f"File type: {f.category} ({f.extension or 'no extension'})",
                    f"Last modified: {f.modified_at.strftime('%Y-%m-%d %H:%M:%S UTC')}",
                ]

                inferred_possibilities = [
                    f"File accounts for a disproportionate footprint in the workspace ({format_bytes(f.size_bytes)}).",
                    "May be an uncompressed video, database snapshot, virtual environment, binary installer, or deep learning weight file.",
                ]

                explanation = (
                    f"File '{f.relative_path}' measures {format_bytes(f.size_bytes)}, exceeding the configured "
                    f"large-file threshold of {format_bytes(threshold)}."
                )

                recommended_step = (
                    f"Verify if '{f.name}' is actively referenced. Consider moving to cold external storage, "
                    f"compressing, or adding to .gitignore if it is a build or cache artifact."
                )

                findings.append(
                    DeterministicFinding(
                        finding_id=finding_id,
                        category=FindingCategoryEnum.LARGE_FILE,
                        severity=severity,
                        title=f"Large File: {f.name} ({format_bytes(f.size_bytes)})",
                        file_ids=[f_id],
                        relative_paths=[f.relative_path],
                        facts=[f"Size: {format_bytes(f.size_bytes)}", f"Threshold: {format_bytes(threshold)}"],
                        explanation=explanation,
                        recommended_next_step=recommended_step,
                        measured_facts=measured_facts,
                        inferred_possibilities=inferred_possibilities,
                        storage_impact_bytes=f.size_bytes,
                        storage_impact_formatted=format_bytes(f.size_bytes),
                        metadata={"size_bytes": f.size_bytes, "threshold_bytes": threshold},
                    )
                )

        return findings

    def _detect_empty_files(
        self, files: List[FileInfo], doc_map: Dict[str, DocumentExtractionResult]
    ) -> List[DeterministicFinding]:
        """Detect zero-byte files or extractable documents with empty content."""
        findings: List[DeterministicFinding] = []

        for f in files:
            is_zero_byte = f.size_bytes == 0
            doc_res = doc_map.get(f.relative_path)
            is_empty_doc = doc_res is not None and doc_res.total_chars == 0 and doc_res.status.value in ["empty", "image_only_or_empty"]

            if is_zero_byte or is_empty_doc:
                f_id = f.file_id or f.sha256 or f.relative_path
                is_sentinel = f.name.lower() in SENTINEL_FILENAMES or f.name.startswith(".keep")
                finding_id = make_finding_id(
                    FindingCategoryEnum.EMPTY_FILE,
                    [f.relative_path, "zero" if is_zero_byte else "emptydoc"],
                )

                severity = FindingSeverityEnum.INFO if is_sentinel else FindingSeverityEnum.LOW

                measured_facts = [
                    f"Physical file size: {f.size_bytes} bytes",
                    f"Extracted characters: {doc_res.total_chars if doc_res else 0}",
                    f"File path: {f.relative_path}",
                    f"Known directory sentinel marker: {'Yes' if is_sentinel else 'No'}",
                ]

                inferred_possibilities = (
                    ["Likely an intentional directory sentinel marker (e.g. .gitkeep or __init__.py) for version control or Python packages."]
                    if is_sentinel
                    else [
                        "May represent an abandoned file stub, an interrupted file transfer, or an unpopulated draft.",
                        "Empty files take zero significant storage but contribute to workspace cognitive clutter.",
                    ]
                )

                explanation = (
                    f"File '{f.relative_path}' is an empty file with zero usable content."
                    + (" Matches known sentinel marker naming conventions." if is_sentinel else "")
                )

                recommended_step = (
                    "Retain sentinel file if needed for directory tracking or Python module import."
                    if is_sentinel
                    else f"Delete empty file '{f.name}' if unneeded, or populate with intended content."
                )

                findings.append(
                    DeterministicFinding(
                        finding_id=finding_id,
                        category=FindingCategoryEnum.EMPTY_FILE,
                        severity=severity,
                        title=f"Empty File: {f.name}" + (" (Directory Sentinel)" if is_sentinel else ""),
                        file_ids=[f_id],
                        relative_paths=[f.relative_path],
                        facts=[f"Size: {f.size_bytes} B", f"Sentinel: {is_sentinel}"],
                        explanation=explanation,
                        recommended_next_step=recommended_step,
                        measured_facts=measured_facts,
                        inferred_possibilities=inferred_possibilities,
                        storage_impact_bytes=0,
                        storage_impact_formatted="0 B",
                        metadata={"is_sentinel": is_sentinel, "size_bytes": f.size_bytes},
                    )
                )

        return findings

    def _detect_redundant_exports(self, files: List[FileInfo]) -> List[DeterministicFinding]:
        """
        Detect potentially redundant export files according to documented rules:
        Rule 1: Master editable source file (.docx, .md, .tex) exists alongside export (.pdf, .html).
        Rule 2: Files located inside build or export directory artifacts (dist/, build/, export/).
        Rule 3: Export suffix naming conventions (e.g. 'Thesis_export.pdf', 'Doc (1).pdf').
        """
        findings: List[DeterministicFinding] = []

        # Index sources by directory and stem
        sources_by_dir_stem: Dict[Tuple[str, str], FileInfo] = {}
        for f in files:
            if f.extension.lower() in SOURCE_EXTENSIONS:
                p = Path(f.relative_path)
                dir_key = str(p.parent)
                stem_key = p.stem.lower()
                sources_by_dir_stem[(dir_key, stem_key)] = f

        for f in files:
            p = Path(f.relative_path)
            dir_parts = [part.lower() for part in p.parts[:-1]]
            ext = f.extension.lower()
            stem = p.stem.lower()
            dir_key = str(p.parent)

            # Rule 1: Master editable source paired with export
            matching_source = sources_by_dir_stem.get((dir_key, stem))
            # Also check workspace root or adjacent directory
            if not matching_source and ext in EXPORT_EXTENSIONS:
                for (s_dir, s_stem), s_file in sources_by_dir_stem.items():
                    if s_stem == stem:
                        matching_source = s_file
                        break

            # Rule 2: In export / build directory
            in_export_dir = any(part in EXPORT_DIRECTORIES for part in dir_parts)

            # Rule 3: Export suffix in file name
            has_export_suffix = any(
                stem.endswith(suffix)
                for suffix in ["_export", "-export", "_rendered", "-out", "_final_final", " copy"]
            ) or bool(re.search(r"\s*\(\d+\)$", stem))

            if matching_source and f.relative_path != matching_source.relative_path:
                # Paired source export match
                time_diff = (f.modified_at - matching_source.modified_at).total_seconds()
                is_stale_export = time_diff < -60  # Export older than source by > 1 min

                f_id = f.file_id or f.sha256 or f.relative_path
                src_id = matching_source.file_id or matching_source.sha256 or matching_source.relative_path

                finding_id = make_finding_id(
                    FindingCategoryEnum.REDUNDANT_EXPORT,
                    [matching_source.relative_path, f.relative_path, "source_pair"],
                )

                measured_facts = [
                    f"Master source file: '{matching_source.relative_path}' ({format_bytes(matching_source.size_bytes)}, mod {matching_source.modified_at.strftime('%Y-%m-%d %H:%M')})",
                    f"Derived export file: '{f.relative_path}' ({format_bytes(f.size_bytes)}, mod {f.modified_at.strftime('%Y-%m-%d %H:%M')})",
                    f"Export age relative to source: {'Stale (older than source)' if is_stale_export else 'Fresh (newer than or equal to source)'}",
                ]

                inferred_possibilities = [
                    "Export file may be reproducible on demand from the original master document.",
                    "If source was updated after export, the export file likely reflects outdated draft contents."
                    if is_stale_export
                    else "Export file was compiled from source and could be re-exported whenever distribution is needed.",
                ]

                explanation = (
                    f"File '{f.name}' appears to be a compiled/exported artifact of source document "
                    f"'{matching_source.name}'."
                    + (" Note: Export is older than source and may be outdated." if is_stale_export else "")
                )

                recommended_step = (
                    f"Preserve source '{matching_source.name}'. If '{f.name}' is not currently needed for external "
                    f"sharing, archive or delete it to save {format_bytes(f.size_bytes)}."
                )

                findings.append(
                    DeterministicFinding(
                        finding_id=finding_id,
                        category=FindingCategoryEnum.REDUNDANT_EXPORT,
                        severity=FindingSeverityEnum.MEDIUM if is_stale_export else FindingSeverityEnum.LOW,
                        title=f"Export Artifact: {f.name} (Source: {matching_source.name})",
                        file_ids=[f_id, src_id],
                        relative_paths=[f.relative_path, matching_source.relative_path],
                        facts=[f"Source: {matching_source.relative_path}", f"Export: {f.relative_path}", f"Size: {format_bytes(f.size_bytes)}"],
                        explanation=explanation,
                        recommended_next_step=recommended_step,
                        measured_facts=measured_facts,
                        inferred_possibilities=inferred_possibilities,
                        storage_impact_bytes=f.size_bytes,
                        storage_impact_formatted=format_bytes(f.size_bytes),
                        metadata={
                            "rule": "source_pair",
                            "source_file": matching_source.relative_path,
                            "export_file": f.relative_path,
                            "is_stale_export": is_stale_export,
                        },
                    )
                )

            elif in_export_dir or (has_export_suffix and ext in EXPORT_EXTENSIONS):
                # Directory or suffix-based export finding
                f_id = f.file_id or f.sha256 or f.relative_path
                finding_id = make_finding_id(
                    FindingCategoryEnum.REDUNDANT_EXPORT,
                    [f.relative_path, "artifact_location" if in_export_dir else "suffix_convention"],
                )

                rule_type = "build_directory" if in_export_dir else "export_suffix"

                measured_facts = [
                    f"File path: '{f.relative_path}'",
                    f"File size: {format_bytes(f.size_bytes)} ({f.size_bytes} bytes)",
                    f"Trigger rule: {'Located in build/export directory' if in_export_dir else 'Export suffix in filename'}",
                    f"Last modified: {f.modified_at.strftime('%Y-%m-%d %H:%M:%S UTC')}",
                ]

                inferred_possibilities = [
                    "File is situated in a known compiler/exporter build target directory or matches export naming conventions.",
                    "Build targets and generated exports can typically be regenerated via project build scripts.",
                ]

                explanation = (
                    f"File '{f.relative_path}' is identified as a build or export artifact based on "
                    f"{'directory location' if in_export_dir else 'filename naming conventions'}."
                )

                recommended_step = (
                    f"If build artifacts are reproducible, run project cleanup or delete '{f.name}' to save {format_bytes(f.size_bytes)}."
                )

                findings.append(
                    DeterministicFinding(
                        finding_id=finding_id,
                        category=FindingCategoryEnum.REDUNDANT_EXPORT,
                        severity=FindingSeverityEnum.LOW,
                        title=f"Generated Artifact: {f.name} ({format_bytes(f.size_bytes)})",
                        file_ids=[f_id],
                        relative_paths=[f.relative_path],
                        facts=[f"Rule: {rule_type}", f"Size: {format_bytes(f.size_bytes)}"],
                        explanation=explanation,
                        recommended_next_step=recommended_step,
                        measured_facts=measured_facts,
                        inferred_possibilities=inferred_possibilities,
                        storage_impact_bytes=f.size_bytes,
                        storage_impact_formatted=format_bytes(f.size_bytes),
                        metadata={"rule": rule_type, "size_bytes": f.size_bytes},
                    )
                )

        return findings

    def _detect_old_file_candidates(
        self, files: List[FileInfo], opts: AnalysisOptions
    ) -> List[DeterministicFinding]:
        """
        Identify old files for review without treating them as automatically useless.
        Maintains strict non-pejorative framing between measured inactivity and utility.
        """
        findings: List[DeterministicFinding] = []
        threshold_days = opts.old_file_threshold_days

        for f in files:
            if f.days_inactive >= threshold_days:
                f_id = f.file_id or f.sha256 or f.relative_path
                finding_id = make_finding_id(
                    FindingCategoryEnum.OLD_FILE_REVIEW,
                    [f.relative_path, str(f.days_inactive)],
                )

                measured_facts = [
                    f"Last modified timestamp: {f.modified_at.strftime('%Y-%m-%d %H:%M:%S UTC')} ({f.days_inactive} days ago)",
                    f"Review threshold: {threshold_days} days",
                    f"Category: {f.category} ({f.extension or 'none'})",
                    f"File size: {format_bytes(f.size_bytes)}",
                ]

                inferred_possibilities = [
                    f"File has not been modified in {f.days_inactive} days.",
                    "Inactivity does NOT imply the file is useless: it may be a completed reference, stable documentation, or cold archival material.",
                    "Alternatively, it may represent a forgotten draft or abandoned experiment that can be filed or archived.",
                ]

                explanation = (
                    f"File '{f.relative_path}' was last modified {f.days_inactive} days ago. "
                    "Flagged for user review without making assumptions about its current value."
                )

                recommended_step = (
                    f"Review '{f.name}'. If it is permanent reference or finished work, consider filing into a dedicated "
                    f"archive folder; if obsolete, consider retiring it."
                )

                findings.append(
                    DeterministicFinding(
                        finding_id=finding_id,
                        category=FindingCategoryEnum.OLD_FILE_REVIEW,
                        severity=FindingSeverityEnum.LOW,
                        title=f"Review Candidate: {f.name} ({f.days_inactive}d inactive)",
                        file_ids=[f_id],
                        relative_paths=[f.relative_path],
                        facts=[f"Inactive: {f.days_inactive} days", f"Modified: {f.modified_at.strftime('%Y-%m-%d')}"],
                        explanation=explanation,
                        recommended_next_step=recommended_step,
                        measured_facts=measured_facts,
                        inferred_possibilities=inferred_possibilities,
                        storage_impact_bytes=0,  # Inactive files are not automatically counted as wasted space!
                        storage_impact_formatted="0 B",
                        metadata={"days_inactive": f.days_inactive, "threshold_days": threshold_days},
                    )
                )

        return findings

    def _detect_unfinished_work(
        self,
        extracted_docs: List[DocumentExtractionResult],
        files: List[FileInfo],
    ) -> List[DeterministicFinding]:
        """
        Scan extracted document chunks and text files for explicit TODOs, FIXMEs,
        and unfinished-work markers. Captures exact line references and excerpts.
        """
        findings: List[DeterministicFinding] = []
        files_by_rel = {f.relative_path: f for f in files}

        for doc in extracted_docs:
            f_info = files_by_rel.get(doc.relative_path)
            f_id = doc.file_id

            for chunk in doc.chunks:
                # Scan chunk text for marker matches
                for match in UNFINISHED_MARKERS_REGEX.finditer(chunk.text):
                    marker = match.group(1) or "UNCHECKED_TASK"
                    detail = (match.group(2) or match.group(3) or "").strip()
                    marker_upper = marker.upper()

                    # Bounded snippet
                    snippet = f"{marker_upper}: {detail}"[:160]

                    finding_id = make_finding_id(
                        FindingCategoryEnum.UNFINISHED_WORK,
                        [doc.relative_path, chunk.reference, marker_upper, detail[:30]],
                    )

                    severity = (
                        FindingSeverityEnum.MEDIUM
                        if marker_upper in ["FIXME", "WIP", "HOLD", "UNFINISHED"]
                        else FindingSeverityEnum.LOW
                    )

                    measured_facts = [
                        f"Explicit marker keyword: '{marker_upper}'",
                        f"Document location reference: {chunk.reference} ({doc.relative_path})",
                        f"Extracted excerpt: \"{snippet}\"",
                        f"Document status: {doc.status.value}",
                    ]

                    inferred_possibilities = [
                        f"Author explicitly embedded a '{marker_upper}' note to indicate pending work or known debt.",
                        "May represent an unfinished draft section, a pending refactor, or an outstanding requirement.",
                    ]

                    explanation = (
                        f"Found unfinished work marker '{marker_upper}' at {chunk.reference} in '{doc.relative_path}'."
                    )

                    recommended_step = (
                        f"Review \"{snippet}\" and decide whether to resume work, address the note, or remove the marker."
                    )

                    findings.append(
                        DeterministicFinding(
                            finding_id=finding_id,
                            category=FindingCategoryEnum.UNFINISHED_WORK,
                            severity=severity,
                            title=f"Unfinished Work: {marker_upper} in {Path(doc.relative_path).name}",
                            file_ids=[f_id],
                            relative_paths=[doc.relative_path],
                            facts=[f"Marker: {marker_upper}", f"Location: {chunk.reference}", f"Excerpt: {snippet}"],
                            explanation=explanation,
                            recommended_next_step=recommended_step,
                            measured_facts=measured_facts,
                            inferred_possibilities=inferred_possibilities,
                            storage_impact_bytes=0,
                            storage_impact_formatted="0 B",
                            metadata={
                                "marker": marker_upper,
                                "reference": chunk.reference,
                                "excerpt": snippet,
                                "chunk_id": chunk.chunk_id,
                            },
                        )
                    )

        return findings

    def _compute_findings_summary(self, findings: List[DeterministicFinding]) -> FindingsSummary:
        by_category: Dict[str, int] = defaultdict(int)
        by_severity: Dict[str, int] = defaultdict(int)
        total_savings = 0
        flagged_files: Set[str] = set()

        for f in findings:
            by_category[f.category.value] += 1
            by_severity[f.severity.value] += 1
            total_savings += f.storage_impact_bytes
            for p in f.relative_paths:
                flagged_files.add(p)

        return FindingsSummary(
            total_findings=len(findings),
            by_category=dict(by_category),
            by_severity=dict(by_severity),
            total_potential_savings_bytes=total_savings,
            total_potential_savings_formatted=format_bytes(total_savings),
            total_files_flagged=len(flagged_files),
        )


analysis_engine = DeterministicAnalysisEngine()
