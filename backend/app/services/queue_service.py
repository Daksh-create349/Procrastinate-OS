from datetime import datetime, timezone
import hashlib
import logging
from pathlib import Path
from typing import Dict, List, Optional, Set

from app.models.schemas import (
    DeterministicFinding,
    FindingCategoryEnum,
    GenerateProcrastinationQueueRequest,
    ProcrastinationQueueResponse,
    QueueTask,
    QueueTaskStatus,
    ScanResult,
    SupportingFileRef,
)
from app.services.local_ai_service import local_ai_service
from app.services.path_validator import validate_workspace_path
from app.services.scanner_service import scanner_service
from app.services.task_store import TaskStore, task_store

logger = logging.getLogger(__name__)


def generate_task_deterministic_id(workspace_path: str, category: str, primary_file: str, key_phrase: str) -> str:
    """Generate a stable, repeatable task ID based on workspace, category, and file/evidence."""
    raw = f"{workspace_path}:{category}:{primary_file}:{key_phrase}".lower().strip()
    digest = hashlib.sha256(raw.encode("utf-8")).hexdigest()[:12]
    return f"task_{category}_{digest}"


class QueueService:
    """
    Central engine for the ProcrastinateOS Procrastination Queue.
    Reduces decision fatigue by synthesizing a small, prioritized, budget-bounded queue
    grounded strictly in measured facts and validated local AI findings.
    """

    def __init__(self, store: Optional[TaskStore] = None):
        self.store = store or task_store

    async def generate_queue(
        self,
        request: GenerateProcrastinationQueueRequest,
        existing_scan: Optional[ScanResult] = None,
    ) -> ProcrastinationQueueResponse:
        resolved_root = validate_workspace_path(request.folder_path)
        workspace_str = str(resolved_root)
        budget = max(5, min(request.time_budget_minutes, 30))  # normalize to 5, 15, or 30

        # Load existing tasks to preserve manual decisions (approved, completed, dismissed, blocked)
        existing_tasks = self.store.list_tasks_for_workspace(workspace_str)
        existing_by_id: Dict[str, QueueTask] = {t.id: t for t in existing_tasks}
        dismissed_ids: Set[str] = {t.id for t in existing_tasks if t.status == QueueTaskStatus.DISMISSED}
        completed_ids: Set[str] = {t.id for t in existing_tasks if t.status == QueueTaskStatus.COMPLETED}

        # 1. Obtain scan result & deterministic findings
        scan_res = existing_scan
        if not scan_res:
            scan_res = scanner_service.scan_folder(
                workspace_str,
                compute_hashes=True,
                extract_documents=True,
            )

        files_by_id = {f.file_id: f for f in scan_res.files if f.file_id}
        files_by_rel_path = {f.relative_path: f for f in scan_res.files}

        # 2. Build candidate tasks from deterministic findings
        candidates: List[QueueTask] = []

        # Category A: Exact Duplicates
        dup_findings = [f for f in scan_res.deterministic_findings if f.category == FindingCategoryEnum.EXACT_DUPLICATE]
        for f in dup_findings:
            if not f.relative_paths or len(f.relative_paths) < 2:
                continue

            primary_path = f.relative_paths[0]
            task_id = generate_task_deterministic_id(workspace_str, "duplicate", primary_path, f.finding_id)
            if task_id in dismissed_ids:
                continue

            supporting_refs = [
                SupportingFileRef(
                    file_id=files_by_rel_path[p].file_id if p in files_by_rel_path else None,
                    relative_path=p,
                    name=Path(p).name,
                )
                for p in f.relative_paths
            ]

            storage_saved = f.storage_impact_formatted or "redundant space"
            cand = QueueTask(
                id=task_id,
                workspace_path=workspace_str,
                title=f"Review duplicate copies of {Path(primary_path).name}",
                reason=f"Identical bit-for-bit copies found. Reclaiming secondary copies frees {storage_saved}.",
                supporting_files=supporting_refs,
                evidence=f"{len(f.relative_paths)} copies match exact cryptographic checksum. Recoverable: {storage_saved}.",
                suggested_action=f"Preserve canonical copy at '{primary_path}' and safely delete or archive remaining {len(f.relative_paths) - 1} duplicate copy(ies).",
                estimated_minutes=3,
                effort_label="Est. ~3 min (approximate effort)",
                status=existing_by_id[task_id].status if task_id in existing_by_id else QueueTaskStatus.PROPOSED,
                source_finding_id=f.finding_id,
                category="duplicate_cleanup",
                priority_score=95,
            )
            candidates.append(cand)

        # Category B: Explicit Unfinished Work / TODOs
        unfinished_findings = [f for f in scan_res.deterministic_findings if f.category == FindingCategoryEnum.UNFINISHED_WORK]
        for f in unfinished_findings:
            if not f.relative_paths:
                continue
            primary_path = f.relative_paths[0]
            excerpt = f.metadata.get("matched_text", f.explanation)
            task_id = generate_task_deterministic_id(workspace_str, "unfinished", primary_path, excerpt[:40])
            if task_id in dismissed_ids:
                continue

            supporting_refs = [
                SupportingFileRef(
                    file_id=files_by_rel_path[p].file_id if p in files_by_rel_path else None,
                    relative_path=p,
                    name=Path(p).name,
                )
                for p in f.relative_paths
            ]

            cand = QueueTask(
                id=task_id,
                workspace_path=workspace_str,
                title=f"Address unfinished task in {Path(primary_path).name}",
                reason="Explicit unfinished task or next step detected directly in document text.",
                supporting_files=supporting_refs,
                evidence=f'Quoted text: "{excerpt[:180]}"',
                suggested_action=f"Open '{primary_path}' and either resolve the item or define its immediate next milestone.",
                estimated_minutes=5,
                effort_label="Est. ~5 min (approximate effort)",
                status=existing_by_id[task_id].status if task_id in existing_by_id else QueueTaskStatus.PROPOSED,
                source_finding_id=f.finding_id,
                category="todo_review",
                priority_score=90,
            )
            candidates.append(cand)

        # Category C: Optional Local AI Insights (Semantic Groups & Forgotten Work)
        ai_model_used = None
        if request.include_ai_recommendations:
            health = await local_ai_service.check_health()
            if health.connected and health.model_present:
                ai_model_used = health.target_model

                # Semantic Project Groups
                if len(scan_res.extracted_documents) >= 2:
                    try:
                        grp_res = await local_ai_service.group_semantic_projects(
                            files=scan_res.files,
                            extracted_docs=scan_res.extracted_documents,
                            max_files=15,
                        )
                        if grp_res.status == "success":
                            for g in grp_res.groups[:2]:  # Limit to top 2 coherent clusters
                                if not g.relative_paths or len(g.relative_paths) < 2:
                                    continue
                                task_id = generate_task_deterministic_id(workspace_str, "project_group", g.project_name, g.group_id)
                                if task_id in dismissed_ids:
                                    continue

                                supporting_refs = [
                                    SupportingFileRef(
                                        file_id=fid,
                                        relative_path=p,
                                        name=Path(p).name,
                                    )
                                    for fid, p in zip(g.file_ids, g.relative_paths)
                                ]

                                cand = QueueTask(
                                    id=task_id,
                                    workspace_path=workspace_str,
                                    title=f"Organize related files: {g.project_name}",
                                    reason=f"Local AI identified related project materials across separate folders: {g.theme_summary}",
                                    supporting_files=supporting_refs,
                                    evidence=f"Shared themes: {g.evidence}",
                                    suggested_action=f"Review the {len(g.relative_paths)} connected files and place them into a designated project subfolder.",
                                    estimated_minutes=8,
                                    effort_label="Est. ~8 min (approximate effort)",
                                    status=existing_by_id[task_id].status if task_id in existing_by_id else QueueTaskStatus.PROPOSED,
                                    source_finding_id=g.group_id,
                                    category="project_organization",
                                    priority_score=80,
                                )
                                candidates.append(cand)
                    except Exception as e:
                        logger.warning(f"Semantic grouping queue synthesis skipped: {e}")

        # Category D: Large Files
        large_findings = [f for f in scan_res.deterministic_findings if f.category == FindingCategoryEnum.LARGE_FILE]
        for f in large_findings[:3]:
            if not f.relative_paths:
                continue
            primary_path = f.relative_paths[0]
            task_id = generate_task_deterministic_id(workspace_str, "large_file", primary_path, f.finding_id)
            if task_id in dismissed_ids:
                continue

            supporting_refs = [
                SupportingFileRef(
                    file_id=files_by_rel_path[p].file_id if p in files_by_rel_path else None,
                    relative_path=p,
                    name=Path(p).name,
                )
                for p in f.relative_paths
            ]

            size_str = f.metadata.get("size_formatted", "large size")
            cand = QueueTask(
                id=task_id,
                workspace_path=workspace_str,
                title=f"Review large file: {Path(primary_path).name} ({size_str})",
                reason=f"Single file occupies {size_str} of storage space.",
                supporting_files=supporting_refs,
                evidence=f"File footprint: {size_str}. Inactive for {f.metadata.get('days_inactive', 0)} days.",
                suggested_action=f"Inspect '{primary_path}' to determine if it should be kept locally, compressed, or moved to cold storage.",
                estimated_minutes=4,
                effort_label="Est. ~4 min (approximate effort)",
                status=existing_by_id[task_id].status if task_id in existing_by_id else QueueTaskStatus.PROPOSED,
                source_finding_id=f.finding_id,
                category="large_file_review",
                priority_score=70,
            )
            candidates.append(cand)

        # Category E: Redundant Exports & Build Artifacts
        export_findings = [f for f in scan_res.deterministic_findings if f.category == FindingCategoryEnum.REDUNDANT_EXPORT]
        for f in export_findings[:2]:
            if not f.relative_paths:
                continue
            primary_path = f.relative_paths[0]
            task_id = generate_task_deterministic_id(workspace_str, "redundant_export", primary_path, f.finding_id)
            if task_id in dismissed_ids:
                continue

            supporting_refs = [
                SupportingFileRef(
                    file_id=files_by_rel_path[p].file_id if p in files_by_rel_path else None,
                    relative_path=p,
                    name=Path(p).name,
                )
                for p in f.relative_paths
            ]

            cand = QueueTask(
                id=task_id,
                workspace_path=workspace_str,
                title=f"Check redundant build artifact: {Path(primary_path).name}",
                reason="Generated export or build artifact found sitting alongside primary source files.",
                supporting_files=supporting_refs,
                evidence=f.explanation,
                suggested_action=f"Confirm that primary source is intact and remove outdated '{primary_path}' artifact.",
                estimated_minutes=3,
                effort_label="Est. ~3 min (approximate effort)",
                status=existing_by_id[task_id].status if task_id in existing_by_id else QueueTaskStatus.PROPOSED,
                source_finding_id=f.finding_id,
                category="redundant_export",
                priority_score=65,
            )
            candidates.append(cand)

        # Category F: Old Inactive File Review
        old_findings = [f for f in scan_res.deterministic_findings if f.category == FindingCategoryEnum.OLD_FILE_REVIEW]
        for f in old_findings[:2]:
            if not f.relative_paths:
                continue
            primary_path = f.relative_paths[0]
            task_id = generate_task_deterministic_id(workspace_str, "old_file", primary_path, f.finding_id)
            if task_id in dismissed_ids:
                continue

            supporting_refs = [
                SupportingFileRef(
                    file_id=files_by_rel_path[p].file_id if p in files_by_rel_path else None,
                    relative_path=p,
                    name=Path(p).name,
                )
                for p in f.relative_paths
            ]

            days = f.metadata.get("days_inactive", 180)
            cand = QueueTask(
                id=task_id,
                workspace_path=workspace_str,
                title=f"Review archival candidate: {Path(primary_path).name}",
                reason=f"Unchanged for {days} days. Candidate for structured archive rather than root clutter.",
                supporting_files=supporting_refs,
                evidence=f"Last modified: {f.metadata.get('modified_at', 'long ago')} ({days} days inactive).",
                suggested_action=f"Quickly verify if '{primary_path}' is still actively needed or can be filed away.",
                estimated_minutes=4,
                effort_label="Est. ~4 min (approximate effort)",
                status=existing_by_id[task_id].status if task_id in existing_by_id else QueueTaskStatus.PROPOSED,
                source_finding_id=f.finding_id,
                category="archive_review",
                priority_score=55,
            )
            candidates.append(cand)

        # Deduplicate candidates by ID while preserving highest priority score
        unique_candidates: Dict[str, QueueTask] = {}
        for c in candidates:
            if c.id not in unique_candidates or c.priority_score > unique_candidates[c.id].priority_score:
                unique_candidates[c.id] = c

        # Sort candidate tasks deterministically by priority score desc
        sorted_candidates = sorted(unique_candidates.values(), key=lambda t: t.priority_score, reverse=True)

        # 3. Budget-Constrained Packing
        # Priority rule:
        # Existing APPROVED tasks must be included first.
        # Then, fill remaining budget with top PROPOSED candidates.
        # Completed tasks within this workspace are also kept for tracking.
        selected_tasks: List[QueueTask] = []
        allocated_minutes = 0

        # Include approved tasks first
        for t in sorted_candidates:
            if t.status == QueueTaskStatus.APPROVED:
                selected_tasks.append(t)
                allocated_minutes += t.estimated_minutes

        # Fill remaining budget with proposed tasks
        for t in sorted_candidates:
            if t.status == QueueTaskStatus.PROPOSED:
                if allocated_minutes + t.estimated_minutes <= budget:
                    selected_tasks.append(t)
                    allocated_minutes += t.estimated_minutes
                elif not selected_tasks:
                    # Guarantee at least one task even if it equals or slightly approaches the budget
                    selected_tasks.append(t)
                    allocated_minutes += t.estimated_minutes
                    break

        # Also retrieve any completed tasks for this workspace so the user sees completed decisions
        for cid in completed_ids:
            if cid in existing_by_id and existing_by_id[cid] not in selected_tasks:
                selected_tasks.append(existing_by_id[cid])

        # Persist all newly generated/updated tasks into TaskStore
        for t in selected_tasks:
            self.store.upsert_task(t, preserve_existing_status=True)

        active_tasks = [t for t in selected_tasks if t.status in (QueueTaskStatus.PROPOSED, QueueTaskStatus.APPROVED)]
        active_minutes = sum(t.estimated_minutes for t in active_tasks)
        completed_count = len([t for t in selected_tasks if t.status == QueueTaskStatus.COMPLETED])
        dismissed_count = len(dismissed_ids)

        summary_text = (
            f"Tailored {budget}-minute action queue containing {len(active_tasks)} high-leverage steps "
            f"({active_minutes} min estimated effort). Every task is grounded in verified workspace findings."
        )

        return ProcrastinationQueueResponse(
            workspace_path=workspace_str,
            time_budget_minutes=budget,
            total_estimated_minutes=active_minutes,
            tasks=selected_tasks,
            completed_count=completed_count,
            dismissed_count=dismissed_count,
            summary=summary_text,
            model_used=ai_model_used,
            generated_at=datetime.now(timezone.utc),
        )


queue_service = QueueService()
