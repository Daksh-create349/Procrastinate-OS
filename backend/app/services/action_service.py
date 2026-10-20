from datetime import datetime, timezone
import hashlib
import logging
import os
from pathlib import Path
import shutil
from typing import List, Optional, Tuple
import uuid

from app.models.schemas import (
    ActionAuditRecord,
    ActionExecutionResult,
    ActionOperationType,
    ActionStatusEnum,
    ApplyActionsRequest,
    ApplyActionsResponse,
    ApplyBatchStatus,
    FilesystemActionPreview,
    PreviewActionsResponse,
    ProposeActionsRequest,
    ProposedActionItem,
    UndoActionRequest,
    UndoActionResponse,
)
from app.services.action_store import ActionStore
from app.services.path_validator import validate_workspace_path

logger = logging.getLogger(__name__)


def compute_sha256(file_path: Path) -> str:
    """Compute SHA-256 hex digest for a file."""
    hasher = hashlib.sha256()
    with open(file_path, "rb") as f:
        while chunk := f.read(65536):
            hasher.update(chunk)
    return hasher.hexdigest()


def format_size(size_bytes: int) -> str:
    """Format bytes into readable string."""
    size_f = float(size_bytes)
    for unit in ["B", "KB", "MB", "GB"]:
        if size_f < 1024.0 or unit == "GB":
            return f"{size_f:.1f} {unit}" if unit != "B" else f"{int(size_f)} B"
        size_f /= 1024.0
    return f"{size_f:.1f} GB"


def validate_clean_filename(name: str) -> str:
    """
    Validate that a proposed file name contains no directory separators,
    no traversal characters, and no illegal filesystem characters.
    """
    if not name or not name.strip():
        raise ValueError("Filename cannot be empty.")
    clean = name.strip()
    if "/" in clean or "\\" in clean:
        raise ValueError("Filename cannot contain directory separators ('/' or '\\').")
    if clean in {".", ".."} or ".." in clean:
        raise ValueError("Filename cannot contain traversal markers.")
    if "\x00" in clean:
        raise ValueError("Filename cannot contain NUL byte.")

    # Restrict characters forbidden across Windows and POSIX filesystems
    invalid_chars = set('<>:"|?*')
    if any(c in invalid_chars for c in clean):
        raise ValueError(f"Filename contains illegal characters: '{clean}'")

    return clean


def safe_resolve_relative(workspace_root: Path, relative_str: str) -> Tuple[Path, str]:
    """
    Strictly validate and resolve a workspace-relative path.
    Rejects:
    - Empty paths
    - NUL bytes
    - Explicit traversal '..' components
    - Absolute paths
    - Symbolic links resolving outside the workspace
    Returns (resolved_absolute_path, normalized_relative_path).
    """
    if not relative_str or not relative_str.strip():
        raise ValueError("Relative path cannot be empty.")

    clean_str = relative_str.strip()
    if "\x00" in clean_str:
        raise ValueError("Path contains invalid NUL byte.")

    # Reject absolute paths passed as relative
    if os.path.isabs(clean_str):
        raise ValueError(f"Relative path cannot be absolute: '{clean_str}'")

    # Normalize separators
    normalized_rel = os.path.normpath(clean_str).replace("\\", "/")
    if normalized_rel == "." or not normalized_rel:
        raise ValueError("Relative path cannot refer to workspace root itself.")

    # Reject '..' components
    parts = Path(normalized_rel).parts
    if ".." in parts:
        raise ValueError(f"Path traversal detected in relative path: '{relative_str}'")

    target_path = (workspace_root / normalized_rel)

    # If file exists, ensure canonical path is strictly inside workspace
    if target_path.exists() or target_path.is_symlink():
        resolved = target_path.resolve()
        try:
            resolved.relative_to(workspace_root.resolve())
        except ValueError:
            raise ValueError(f"Path traversal: path escapes workspace root: '{relative_str}'")
        return resolved, normalized_rel

    # If file does not exist yet (e.g. proposed destination), verify its parent
    parent_resolved = target_path.parent.resolve()
    try:
        parent_resolved.relative_to(workspace_root.resolve())
    except ValueError:
        raise ValueError(f"Destination path escapes workspace root: '{relative_str}'")

    return target_path, normalized_rel


def safe_atomic_non_overwrite_move(src_path: Path, dst_path: Path) -> None:
    """
    Safely move src_path to dst_path with ZERO risk of overwriting dst_path.
    Guarantees:
    - Never overwrites if dst_path exists.
    - Creates destination parent directories safely.
    - Preserves file content and mode.
    - Atomically fails if destination exists.
    """
    if dst_path.exists() or dst_path.is_symlink():
        raise FileExistsError(f"Destination file already exists: {dst_path.name}")

    # Ensure parent directory exists
    dst_path.parent.mkdir(parents=True, exist_ok=True)

    # 1. Attempt hardlink + unlink (atomic, fails with FileExistsError if dst exists)
    try:
        os.link(src_path, dst_path)
        os.unlink(src_path)
        return
    except (OSError, NotImplementedError, PermissionError) as link_err:
        if isinstance(link_err, FileExistsError):
            raise
        # Cross-filesystem or hardlinks not supported, proceed to exclusive copy fallback
        pass

    # 2. Exclusive creation fallback: O_CREAT | O_EXCL ensures file must NOT already exist
    flags = os.O_WRONLY | os.O_CREAT | os.O_EXCL | getattr(os, "O_BINARY", 0)

    fd = os.open(dst_path, flags, 0o644)
    try:
        with open(fd, "wb") as dst_f, open(src_path, "rb") as src_f:
            shutil.copyfileobj(src_f, dst_f)
            dst_f.flush()
            os.fsync(dst_f.fileno())

        try:
            shutil.copymode(src_path, dst_path)
        except Exception:
            pass

        os.unlink(src_path)
    except Exception as exc:
        # If write failed partially, clean up partial destination file
        if dst_path.exists():
            try:
                os.unlink(dst_path)
            except Exception:
                pass
        raise exc


class ActionService:
    """
    Core filesystem action orchestrator for ProcrastinateOS.
    Implements:
    PROPOSE -> PREVIEW -> APPROVE -> APPLY -> VERIFY -> UNDO
    """

    def __init__(self, action_store: Optional[ActionStore] = None):
        self.action_store = action_store or ActionStore()

    def resolve_destination(
        self,
        workspace_root: Path,
        operation_type: ActionOperationType,
        source_rel: str,
        target_name_or_folder: Optional[str],
    ) -> Tuple[Path, str]:
        """
        Compute destination path based on operation type and validate workspace containment.
        """
        src_path = Path(source_rel)

        if operation_type == ActionOperationType.MOVE_TO_ARCHIVE:
            # Default archive directory is '_archive' inside workspace root
            archive_folder = (target_name_or_folder or "_archive").strip().replace("\\", "/")
            if archive_folder.startswith("/") or ".." in Path(archive_folder).parts:
                raise ValueError(f"Invalid archive folder specification: '{archive_folder}'")

            # Destination preserves relative path inside archive folder
            dest_rel = f"{archive_folder}/{source_rel}"
            dest_rel_norm = os.path.normpath(dest_rel).replace("\\", "/")
            dst_path, clean_rel = safe_resolve_relative(workspace_root, dest_rel_norm)
            return dst_path, clean_rel

        elif operation_type == ActionOperationType.RENAME:
            if not target_name_or_folder:
                raise ValueError("Target clean filename must be provided for rename operation.")

            clean_filename = validate_clean_filename(target_name_or_folder)
            parent_rel = src_path.parent
            if str(parent_rel) == "." or str(parent_rel) == "":
                dest_rel = clean_filename
            else:
                dest_rel = f"{str(parent_rel).replace(chr(92), '/')}/{clean_filename}"

            dest_rel_norm = os.path.normpath(dest_rel).replace("\\", "/")
            dst_path, clean_rel = safe_resolve_relative(workspace_root, dest_rel_norm)
            return dst_path, clean_rel

        else:
            raise ValueError(f"Unsupported operation type: {operation_type}")

    def preview_action(
        self,
        workspace_path: str,
        proposed: ProposedActionItem,
    ) -> FilesystemActionPreview:
        """
        Validate and construct a preview for a single proposed action.
        """
        workspace_root = validate_workspace_path(workspace_path)
        action_id = proposed.proposed_id or f"act_{uuid.uuid4().hex[:12]}"

        warnings: List[str] = []
        validation_error: Optional[str] = None
        source_file_exists = False
        dest_file_exists = False
        size_bytes = 0
        sha256: Optional[str] = None
        dest_rel = ""

        # Validate source
        try:
            src_path, clean_source_rel = safe_resolve_relative(workspace_root, proposed.source_relative_path)
            if not src_path.exists():
                validation_error = f"Source file does not exist: '{proposed.source_relative_path}'"
            elif not src_path.is_file():
                validation_error = f"Source path is not a regular file: '{proposed.source_relative_path}'"
            else:
                source_file_exists = True
                size_bytes = src_path.stat().st_size
                sha256 = compute_sha256(src_path)
        except Exception as e:
            validation_error = str(e)
            clean_source_rel = proposed.source_relative_path

        # Validate destination
        if not validation_error:
            try:
                dst_path, dest_rel = self.resolve_destination(
                    workspace_root,
                    proposed.operation_type,
                    clean_source_rel,
                    proposed.target_name_or_folder,
                )
                if dst_path.exists() or dst_path.is_symlink():
                    dest_file_exists = True
                    warnings.append(f"Destination already exists: '{dest_rel}'. Overwriting is strictly prohibited.")
            except Exception as e:
                validation_error = str(e)

        can_apply = (
            validation_error is None
            and source_file_exists
            and not dest_file_exists
        )

        preview = FilesystemActionPreview(
            action_id=action_id,
            workspace_path=str(workspace_root),
            operation_type=proposed.operation_type,
            source_relative_path=clean_source_rel,
            destination_relative_path=dest_rel,
            source_file_exists=source_file_exists,
            destination_file_exists=dest_file_exists,
            source_size_bytes=size_bytes,
            source_size_formatted=format_size(size_bytes),
            source_sha256=sha256,
            reason=proposed.reason,
            status=ActionStatusEnum.PREVIEWED,
            can_apply=can_apply,
            warnings=warnings,
            validation_error=validation_error,
        )

        # Record preview in audit store
        self.action_store.record_preview(preview)
        return preview

    def preview_actions_batch(
        self,
        request: ProposeActionsRequest,
    ) -> PreviewActionsResponse:
        """
        Generate previews for a batch of proposed actions.
        """
        workspace_root = validate_workspace_path(request.workspace_path)
        batch_id = f"batch_{uuid.uuid4().hex[:8]}"

        previews: List[FilesystemActionPreview] = []
        can_apply_count = 0
        has_collisions = False

        # Track destinations within the batch to detect internal collisions
        batch_destinations = set()

        for item in request.actions:
            prev = self.preview_action(str(workspace_root), item)

            if prev.destination_relative_path in batch_destinations:
                prev.can_apply = False
                prev.warnings.append(
                    f"Collision within batch: destination '{prev.destination_relative_path}' target of multiple actions."
                )
            elif prev.destination_relative_path:
                batch_destinations.add(prev.destination_relative_path)

            if prev.can_apply:
                can_apply_count += 1
            if prev.destination_file_exists or any("Collision" in w for w in prev.warnings):
                has_collisions = True

            self.action_store.record_preview(prev, batch_id=batch_id)
            previews.append(prev)

        return PreviewActionsResponse(
            workspace_path=str(workspace_root),
            total_previewed=len(previews),
            can_apply_count=can_apply_count,
            has_collisions=has_collisions,
            previews=previews,
        )

    def apply_actions(
        self,
        request: ApplyActionsRequest,
    ) -> ApplyActionsResponse:
        """
        Execute explicitly approved actions with immediate pre-execution revalidation.
        Enforces:
        - Revalidates paths and file state immediately before changes.
        - Source hash verification (rejects if file modified on disk).
        - Destination collision check (never overwrite).
        - Verification post-apply (destination exists, hash matches, source gone).
        - Accurate partial failure accounting.
        """
        workspace_root = validate_workspace_path(request.workspace_path)
        batch_id = f"batch_{uuid.uuid4().hex[:8]}"
        now = datetime.now(timezone.utc)

        allowed_ids = set(request.action_ids) if request.action_ids is not None else None

        results: List[ActionExecutionResult] = []
        succeeded_count = 0
        failed_count = 0

        for preview in request.previews:
            action_id = preview.action_id

            # Filter if specific action_ids were approved
            if allowed_ids is not None and action_id not in allowed_ids:
                continue

            # Check if preview itself was invalid
            if not preview.can_apply:
                err_msg = preview.validation_error or "; ".join(preview.warnings) or "Action cannot be applied."
                self.action_store.update_status(action_id, ActionStatusEnum.FAILED, error_message=err_msg)
                results.append(
                    ActionExecutionResult(
                        action_id=action_id,
                        operation_type=preview.operation_type,
                        source_relative_path=preview.source_relative_path,
                        destination_relative_path=preview.destination_relative_path,
                        success=False,
                        status=ActionStatusEnum.FAILED,
                        error_message=err_msg,
                        verified=False,
                        timestamp=now,
                    )
                )
                failed_count += 1
                continue

            # Mark state as applying for crash recovery tracking
            self.action_store.update_status(action_id, ActionStatusEnum.APPLYING)

            try:
                # 1. Immediate revalidation of source path
                src_path, _ = safe_resolve_relative(workspace_root, preview.source_relative_path)
                if not src_path.exists() or not src_path.is_file():
                    raise FileNotFoundError(f"Source file vanished or is not regular file: '{preview.source_relative_path}'")

                # 2. Immediate revalidation of source hash (file modified detection)
                current_hash = compute_sha256(src_path)
                if preview.source_sha256 and current_hash != preview.source_sha256:
                    raise ValueError(
                        f"Source file was modified on disk since preview was created (hash mismatch). Refusing to apply."
                    )

                # 3. Immediate revalidation of destination path (anti-overwrite)
                dst_path, _ = safe_resolve_relative(workspace_root, preview.destination_relative_path)
                if dst_path.exists() or dst_path.is_symlink():
                    raise FileExistsError(f"Destination path already exists on disk: '{preview.destination_relative_path}'. Refusing to overwrite.")

                # 4. Safe non-overwriting move
                safe_atomic_non_overwrite_move(src_path, dst_path)

                # 5. POST-APPLY VERIFICATION
                if not dst_path.exists() or not dst_path.is_file():
                    raise RuntimeError(f"Post-apply verification failed: destination file '{preview.destination_relative_path}' does not exist.")

                if src_path.exists():
                    raise RuntimeError(f"Post-apply verification failed: source file '{preview.source_relative_path}' was not removed.")

                dest_hash = compute_sha256(dst_path)
                if dest_hash != current_hash:
                    raise RuntimeError("Post-apply verification failed: destination SHA-256 does not match original file hash.")

                # Operation verified and completed
                self.action_store.update_status(
                    action_id=action_id,
                    status=ActionStatusEnum.APPLIED,
                    post_hash=dest_hash,
                    applied_at=now,
                )

                results.append(
                    ActionExecutionResult(
                        action_id=action_id,
                        operation_type=preview.operation_type,
                        source_relative_path=preview.source_relative_path,
                        destination_relative_path=preview.destination_relative_path,
                        success=True,
                        status=ActionStatusEnum.APPLIED,
                        verified=True,
                        timestamp=now,
                    )
                )
                succeeded_count += 1

            except Exception as exc:
                logger.error(f"Failed to apply action {action_id}: {exc}")
                err_text = str(exc)
                self.action_store.update_status(action_id, ActionStatusEnum.FAILED, error_message=err_text)

                results.append(
                    ActionExecutionResult(
                        action_id=action_id,
                        operation_type=preview.operation_type,
                        source_relative_path=preview.source_relative_path,
                        destination_relative_path=preview.destination_relative_path,
                        success=False,
                        status=ActionStatusEnum.FAILED,
                        error_message=err_text,
                        verified=False,
                        timestamp=now,
                    )
                )
                failed_count += 1

        # Calculate accurate batch status
        if failed_count == 0 and succeeded_count > 0:
            batch_status = ApplyBatchStatus.ALL_SUCCEEDED
        elif succeeded_count > 0 and failed_count > 0:
            batch_status = ApplyBatchStatus.PARTIALLY_SUCCEEDED
        else:
            batch_status = ApplyBatchStatus.ALL_FAILED

        return ApplyActionsResponse(
            batch_id=batch_id,
            workspace_path=str(workspace_root),
            batch_status=batch_status,
            total_requested=len(results),
            succeeded_count=succeeded_count,
            failed_count=failed_count,
            results=results,
        )

    def undo_action(
        self,
        request: UndoActionRequest,
    ) -> UndoActionResponse:
        """
        Revert a previously applied move or rename when filesystem state is safely valid.
        Safety constraints:
        - Never overwrite existing files during undo.
        - Target destination file must still exist and its content/hash must match.
        - Original source path must be vacant.
        """
        workspace_root = validate_workspace_path(request.workspace_path)
        record = self.action_store.get_record(request.action_id)

        if not record:
            return UndoActionResponse(
                action_id=request.action_id,
                success=False,
                status=ActionStatusEnum.UNDO_FAILED,
                message="Action not found in audit log.",
                error_message="Audit record missing.",
                source_relative_path="",
                destination_relative_path="",
            )

        if record.status not in (ActionStatusEnum.APPLIED, ActionStatusEnum.UNDO_FAILED):
            return UndoActionResponse(
                action_id=request.action_id,
                success=False,
                status=ActionStatusEnum.UNDO_FAILED,
                message=f"Cannot undo action in status '{record.status.value}'. Only 'applied' actions can be undone.",
                error_message=f"Invalid action status for undo: {record.status.value}",
                source_relative_path=record.source_relative_path,
                destination_relative_path=record.destination_relative_path,
            )

        try:
            # 1. Resolve current file location (was destination during apply)
            curr_path, _ = safe_resolve_relative(workspace_root, record.destination_relative_path)
            if not curr_path.exists() or not curr_path.is_file():
                raise FileNotFoundError(
                    f"Cannot undo: file at '{record.destination_relative_path}' is missing or not a regular file."
                )

            # 2. Verify current file hash matches recorded post_hash / pre_hash
            curr_hash = compute_sha256(curr_path)
            expected_hash = record.post_hash or record.pre_hash
            if expected_hash and curr_hash != expected_hash:
                raise ValueError(
                    f"Cannot undo: file at '{record.destination_relative_path}' was modified after operation. Hash changed."
                )

            # 3. Resolve original location (where file will be restored)
            orig_path, _ = safe_resolve_relative(workspace_root, record.source_relative_path)
            if orig_path.exists() or orig_path.is_symlink():
                raise FileExistsError(
                    f"Cannot undo: original path '{record.source_relative_path}' is already occupied. Overwriting is strictly forbidden."
                )

            # 4. Perform safe non-overwriting revert
            safe_atomic_non_overwrite_move(curr_path, orig_path)

            # 5. POST-UNDO VERIFICATION
            if not orig_path.exists() or not orig_path.is_file():
                raise RuntimeError(f"Post-undo verification failed: original file '{record.source_relative_path}' not found.")

            if curr_path.exists():
                raise RuntimeError(f"Post-undo verification failed: destination file '{record.destination_relative_path}' still exists.")

            restored_hash = compute_sha256(orig_path)
            if expected_hash and restored_hash != expected_hash:
                raise RuntimeError("Post-undo verification failed: restored file hash does not match original.")

            now = datetime.now(timezone.utc)
            self.action_store.update_status(
                action_id=request.action_id,
                status=ActionStatusEnum.UNDONE,
                undone_at=now,
            )

            return UndoActionResponse(
                action_id=request.action_id,
                success=True,
                status=ActionStatusEnum.UNDONE,
                message=f"Successfully restored '{record.destination_relative_path}' back to '{record.source_relative_path}'.",
                source_relative_path=record.source_relative_path,
                destination_relative_path=record.destination_relative_path,
            )

        except Exception as exc:
            logger.error(f"Failed to undo action {request.action_id}: {exc}")
            err_text = str(exc)
            self.action_store.update_status(
                action_id=request.action_id,
                status=ActionStatusEnum.UNDO_FAILED,
                error_message=err_text,
            )
            return UndoActionResponse(
                action_id=request.action_id,
                success=False,
                status=ActionStatusEnum.UNDO_FAILED,
                message=f"Undo failed: {err_text}",
                error_message=err_text,
                source_relative_path=record.source_relative_path,
                destination_relative_path=record.destination_relative_path,
            )

    def recover_interrupted_actions(self, workspace_path: str) -> int:
        """
        Inspect audit records stuck in APPLYING state (e.g. if application closed during execution).
        Recovers and marks them appropriately.
        """
        try:
            workspace_root = validate_workspace_path(workspace_path)
        except Exception:
            return 0

        interrupted = self.action_store.get_interrupted_actions(str(workspace_root))
        recovered_count = 0

        for rec in interrupted:
            try:
                src_path, _ = safe_resolve_relative(workspace_root, rec.source_relative_path)
                dst_path, _ = safe_resolve_relative(workspace_root, rec.destination_relative_path)

                # Case A: Destination exists and matches hash, source is gone -> Move completed before crash
                if dst_path.exists() and not src_path.exists():
                    dst_hash = compute_sha256(dst_path)
                    if rec.pre_hash and dst_hash == rec.pre_hash:
                        self.action_store.update_status(
                            action_id=rec.action_id,
                            status=ActionStatusEnum.APPLIED,
                            post_hash=dst_hash,
                            applied_at=datetime.now(timezone.utc),
                        )
                        recovered_count += 1
                        continue

                # Case B: Source still exists, destination missing -> Move didn't execute
                if src_path.exists() and not dst_path.exists():
                    self.action_store.update_status(
                        action_id=rec.action_id,
                        status=ActionStatusEnum.FAILED,
                        error_message="Process interrupted before file transfer completed.",
                    )
                    recovered_count += 1
                    continue

                # Case C: Ambiguous or incomplete
                self.action_store.update_status(
                    action_id=rec.action_id,
                    status=ActionStatusEnum.FAILED,
                    error_message="Process closed unexpectedly during filesystem operation.",
                )
                recovered_count += 1
            except Exception as e:
                logger.warning(f"Failed recovering interrupted action {rec.action_id}: {e}")

        return recovered_count
