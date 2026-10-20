from datetime import datetime, timezone
import json
import logging
import os
from pathlib import Path
import sqlite3
from typing import List, Optional

from app.models.schemas import QueueTask, QueueTaskStatus, SupportingFileRef

logger = logging.getLogger(__name__)


class TaskStore:
    """
    SQLite-backed local persistence for Procrastination Queue tasks.
    Persists user task decisions (approved, completed, dismissed, blocked)
    locally across server reboots and scans.
    """

    def __init__(self, db_path: Optional[str] = None):
        if db_path:
            self.db_path = db_path
        else:
            default_dir = os.path.expanduser("~/.procrastinate_os")
            os.makedirs(default_dir, exist_ok=True)
            self.db_path = os.path.join(default_dir, "tasks.db")

        self._init_db()

    def _get_connection(self) -> sqlite3.Connection:
        conn = sqlite3.connect(self.db_path)
        conn.row_factory = sqlite3.Row
        return conn

    def _init_db(self) -> None:
        if self.db_path != ":memory:":
            os.makedirs(os.path.dirname(os.path.abspath(self.db_path)), exist_ok=True)

        with self._get_connection() as conn:
            conn.execute(
                """
                CREATE TABLE IF NOT EXISTS queue_tasks (
                    id TEXT PRIMARY KEY,
                    workspace_path TEXT NOT NULL,
                    title TEXT NOT NULL,
                    reason TEXT NOT NULL,
                    supporting_files TEXT NOT NULL,
                    evidence TEXT NOT NULL,
                    suggested_action TEXT NOT NULL,
                    estimated_minutes INTEGER NOT NULL,
                    effort_label TEXT NOT NULL,
                    status TEXT NOT NULL,
                    source_finding_id TEXT,
                    category TEXT NOT NULL,
                    priority_score INTEGER NOT NULL,
                    created_at TEXT NOT NULL,
                    updated_at TEXT NOT NULL
                );
                """
            )
            conn.execute("CREATE INDEX IF NOT EXISTS idx_tasks_workspace ON queue_tasks(workspace_path);")
            conn.execute("CREATE INDEX IF NOT EXISTS idx_tasks_status ON queue_tasks(status);")
            conn.commit()

    def _row_to_task(self, row: sqlite3.Row) -> QueueTask:
        supporting_files_data = json.loads(row["supporting_files"])
        supporting_files = [SupportingFileRef(**f) for f in supporting_files_data]

        created_at = datetime.fromisoformat(row["created_at"])
        updated_at = datetime.fromisoformat(row["updated_at"])

        return QueueTask(
            id=row["id"],
            workspace_path=row["workspace_path"],
            title=row["title"],
            reason=row["reason"],
            supporting_files=supporting_files,
            evidence=row["evidence"],
            suggested_action=row["suggested_action"],
            estimated_minutes=row["estimated_minutes"],
            effort_label=row["effort_label"],
            status=QueueTaskStatus(row["status"]),
            source_finding_id=row["source_finding_id"],
            category=row["category"],
            priority_score=row["priority_score"],
            created_at=created_at,
            updated_at=updated_at,
        )

    def upsert_task(self, task: QueueTask, preserve_existing_status: bool = True) -> QueueTask:
        """Insert or update a task. If preserve_existing_status is True, keeps prior user status changes."""
        with self._get_connection() as conn:
            cursor = conn.cursor()
            cursor.execute("SELECT status, created_at FROM queue_tasks WHERE id = ?", (task.id,))
            existing = cursor.fetchone()

            effective_status = task.status
            effective_created_at = task.created_at

            if existing:
                if preserve_existing_status and existing["status"] != QueueTaskStatus.PROPOSED.value:
                    effective_status = QueueTaskStatus(existing["status"])
                effective_created_at = datetime.fromisoformat(existing["created_at"])

            now_iso = datetime.now(timezone.utc).isoformat()
            files_json = json.dumps([f.model_dump() for f in task.supporting_files])

            cursor.execute(
                """
                INSERT INTO queue_tasks (
                    id, workspace_path, title, reason, supporting_files, evidence,
                    suggested_action, estimated_minutes, effort_label, status,
                    source_finding_id, category, priority_score, created_at, updated_at
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                ON CONFLICT(id) DO UPDATE SET
                    title = excluded.title,
                    reason = excluded.reason,
                    supporting_files = excluded.supporting_files,
                    evidence = excluded.evidence,
                    suggested_action = excluded.suggested_action,
                    estimated_minutes = excluded.estimated_minutes,
                    effort_label = excluded.effort_label,
                    status = ?,
                    source_finding_id = excluded.source_finding_id,
                    category = excluded.category,
                    priority_score = excluded.priority_score,
                    updated_at = excluded.updated_at
                """,
                (
                    task.id,
                    task.workspace_path,
                    task.title,
                    task.reason,
                    files_json,
                    task.evidence,
                    task.suggested_action,
                    task.estimated_minutes,
                    task.effort_label,
                    effective_status.value,
                    task.source_finding_id,
                    task.category,
                    task.priority_score,
                    effective_created_at.isoformat(),
                    now_iso,
                    effective_status.value,
                ),
            )
            conn.commit()

            task.status = effective_status
            task.created_at = effective_created_at
            return task

    def get_task(self, task_id: str) -> Optional[QueueTask]:
        with self._get_connection() as conn:
            cursor = conn.cursor()
            cursor.execute("SELECT * FROM queue_tasks WHERE id = ?", (task_id,))
            row = cursor.fetchone()
            if row:
                return self._row_to_task(row)
            return None

    def list_tasks_for_workspace(
        self,
        workspace_path: str,
        status: Optional[QueueTaskStatus] = None,
    ) -> List[QueueTask]:
        """Fetch tasks for workspace, sorted deterministically by priority score desc."""
        with self._get_connection() as conn:
            cursor = conn.cursor()
            if status:
                cursor.execute(
                    """
                    SELECT * FROM queue_tasks
                    WHERE workspace_path = ? AND status = ?
                    ORDER BY priority_score DESC, updated_at DESC
                    """,
                    (workspace_path, status.value),
                )
            else:
                cursor.execute(
                    """
                    SELECT * FROM queue_tasks
                    WHERE workspace_path = ?
                    ORDER BY priority_score DESC, updated_at DESC
                    """,
                    (workspace_path,),
                )
            rows = cursor.fetchall()
            return [self._row_to_task(r) for r in rows]

    def update_task_status(self, task_id: str, new_status: QueueTaskStatus) -> Optional[QueueTask]:
        now_iso = datetime.now(timezone.utc).isoformat()
        with self._get_connection() as conn:
            cursor = conn.cursor()
            cursor.execute(
                """
                UPDATE queue_tasks
                SET status = ?, updated_at = ?
                WHERE id = ?
                """,
                (new_status.value, now_iso, task_id),
            )
            conn.commit()
            if cursor.rowcount > 0:
                return self.get_task(task_id)
            return None

    def delete_task(self, task_id: str) -> bool:
        with self._get_connection() as conn:
            cursor = conn.cursor()
            cursor.execute("DELETE FROM queue_tasks WHERE id = ?", (task_id,))
            conn.commit()
            return cursor.rowcount > 0

    def clear_workspace_tasks(self, workspace_path: str, only_proposed: bool = False) -> int:
        with self._get_connection() as conn:
            cursor = conn.cursor()
            if only_proposed:
                cursor.execute(
                    "DELETE FROM queue_tasks WHERE workspace_path = ? AND status = 'proposed'",
                    (workspace_path,),
                )
            else:
                cursor.execute(
                    "DELETE FROM queue_tasks WHERE workspace_path = ?",
                    (workspace_path,),
                )
            conn.commit()
            return cursor.rowcount


task_store = TaskStore()
