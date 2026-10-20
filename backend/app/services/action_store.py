from datetime import datetime, timezone
import json
import logging
import os
from pathlib import Path
import sqlite3
from typing import List, Optional

from app.models.schemas import ActionAuditRecord, ActionOperationType, ActionStatusEnum, FilesystemActionPreview

logger = logging.getLogger(__name__)


class ActionStore:
    """
    Persistent SQLite-backed local audit manifest for ProcrastinateOS filesystem operations.
    Every proposed, applied, failed, and undone action is durably recorded.
    """

    def __init__(self, db_path: Optional[str] = None):
        if db_path:
            self.db_path = db_path
        else:
            default_dir = os.path.expanduser("~/.procrastinate_os")
            os.makedirs(default_dir, exist_ok=True)
            self.db_path = os.path.join(default_dir, "actions.db")

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
                CREATE TABLE IF NOT EXISTS action_audit_log (
                    action_id TEXT PRIMARY KEY,
                    batch_id TEXT,
                    workspace_path TEXT NOT NULL,
                    operation_type TEXT NOT NULL,
                    source_relative_path TEXT NOT NULL,
                    destination_relative_path TEXT NOT NULL,
                    file_size_bytes INTEGER NOT NULL,
                    pre_hash TEXT,
                    post_hash TEXT,
                    reason TEXT NOT NULL,
                    status TEXT NOT NULL,
                    error_message TEXT,
                    created_at TEXT NOT NULL,
                    applied_at TEXT,
                    undone_at TEXT
                );
                """
            )
            conn.execute("CREATE INDEX IF NOT EXISTS idx_actions_workspace ON action_audit_log(workspace_path);")
            conn.execute("CREATE INDEX IF NOT EXISTS idx_actions_status ON action_audit_log(status);")
            conn.execute("CREATE INDEX IF NOT EXISTS idx_actions_batch ON action_audit_log(batch_id);")
            conn.commit()

    def _row_to_record(self, row: sqlite3.Row) -> ActionAuditRecord:
        applied_at = datetime.fromisoformat(row["applied_at"]) if row["applied_at"] else None
        undone_at = datetime.fromisoformat(row["undone_at"]) if row["undone_at"] else None
        status = ActionStatusEnum(row["status"])

        return ActionAuditRecord(
            action_id=row["action_id"],
            batch_id=row["batch_id"],
            workspace_path=row["workspace_path"],
            operation_type=ActionOperationType(row["operation_type"]),
            source_relative_path=row["source_relative_path"],
            destination_relative_path=row["destination_relative_path"],
            file_size_bytes=row["file_size_bytes"],
            pre_hash=row["pre_hash"],
            post_hash=row["post_hash"],
            reason=row["reason"],
            status=status,
            error_message=row["error_message"],
            can_undo=(status in (ActionStatusEnum.APPLIED, ActionStatusEnum.UNDO_FAILED)),
            created_at=datetime.fromisoformat(row["created_at"]),
            applied_at=applied_at,
            undone_at=undone_at,
        )

    def record_preview(self, preview: FilesystemActionPreview, batch_id: Optional[str] = None) -> ActionAuditRecord:
        """Insert previewed action into audit log."""
        now_iso = datetime.now(timezone.utc).isoformat()
        with self._get_connection() as conn:
            conn.execute(
                """
                INSERT OR REPLACE INTO action_audit_log (
                    action_id, batch_id, workspace_path, operation_type,
                    source_relative_path, destination_relative_path, file_size_bytes,
                    pre_hash, post_hash, reason, status, error_message,
                    created_at, applied_at, undone_at
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    preview.action_id,
                    batch_id,
                    str(preview.workspace_path),
                    preview.operation_type.value,
                    preview.source_relative_path,
                    preview.destination_relative_path,
                    preview.source_size_bytes,
                    preview.source_sha256,
                    None,
                    preview.reason,
                    preview.status.value,
                    preview.validation_error,
                    now_iso,
                    None,
                    None,
                ),
            )
            conn.commit()

        rec = self.get_record(preview.action_id)
        assert rec is not None
        return rec

    def update_status(
        self,
        action_id: str,
        status: ActionStatusEnum,
        error_message: Optional[str] = None,
        post_hash: Optional[str] = None,
        applied_at: Optional[datetime] = None,
        undone_at: Optional[datetime] = None,
    ) -> Optional[ActionAuditRecord]:
        """Update the status and execution artifacts of an audit record."""
        with self._get_connection() as conn:
            cursor = conn.cursor()
            updates = ["status = ?"]
            params = [status.value]

            if error_message is not None:
                updates.append("error_message = ?")
                params.append(error_message)

            if post_hash is not None:
                updates.append("post_hash = ?")
                params.append(post_hash)

            if applied_at is not None:
                updates.append("applied_at = ?")
                params.append(applied_at.isoformat())

            if undone_at is not None:
                updates.append("undone_at = ?")
                params.append(undone_at.isoformat())

            params.append(action_id)
            query = f"UPDATE action_audit_log SET {', '.join(updates)} WHERE action_id = ?"
            cursor.execute(query, params)
            conn.commit()

        return self.get_record(action_id)

    def get_record(self, action_id: str) -> Optional[ActionAuditRecord]:
        with self._get_connection() as conn:
            cursor = conn.cursor()
            cursor.execute("SELECT * FROM action_audit_log WHERE action_id = ?", (action_id,))
            row = cursor.fetchone()
            if row:
                return self._row_to_record(row)
        return None

    def get_workspace_audit_log(self, workspace_path: str, limit: int = 200) -> List[ActionAuditRecord]:
        try:
            resolved = str(Path(workspace_path).resolve())
        except Exception:
            resolved = str(workspace_path)

        with self._get_connection() as conn:
            cursor = conn.cursor()
            cursor.execute(
                """
                SELECT * FROM action_audit_log
                WHERE workspace_path = ? OR workspace_path = ?
                ORDER BY created_at DESC
                LIMIT ?
                """,
                (str(workspace_path), resolved, limit),
            )
            rows = cursor.fetchall()
            return [self._row_to_record(r) for r in rows]

    def get_interrupted_actions(self, workspace_path: str) -> List[ActionAuditRecord]:
        with self._get_connection() as conn:
            cursor = conn.cursor()
            cursor.execute(
                """
                SELECT * FROM action_audit_log
                WHERE workspace_path = ? AND status = ?
                """,
                (str(workspace_path), ActionStatusEnum.APPLYING.value),
            )
            rows = cursor.fetchall()
            return [self._row_to_record(r) for r in rows]
