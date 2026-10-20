import React, { useState } from 'react';
import {
  AlertTriangle,
  ArrowRight,
  CheckCircle,
  FileText,
  FolderArchive,
  Loader2,
  RotateCcw,
  Shield,
  ShieldAlert,
  ShieldCheck,
  X,
} from 'lucide-react';
import type {
  ApplyActionsResponse,
  FilesystemActionPreview,
  UndoActionResponse,
} from '../types';
import { applyActions, undoAction } from '../api/client';

interface ActionReviewModalProps {
  isOpen: boolean;
  workspacePath: string;
  previews: FilesystemActionPreview[];
  onClose: () => void;
  onApplied?: (response: ApplyActionsResponse) => void;
}

export const ActionReviewModal: React.FC<ActionReviewModalProps> = ({
  isOpen,
  workspacePath,
  previews,
  onClose,
  onApplied,
}) => {
  // Track selected action IDs (default to selecting all can_apply items)
  const [selectedIds, setSelectedIds] = useState<Set<string>>(() => {
    return new Set(previews.filter((p) => p.can_apply).map((p) => p.action_id));
  });

  const [isApplying, setIsApplying] = useState(false);
  const [applyResponse, setApplyResponse] = useState<ApplyActionsResponse | null>(null);
  const [undoStatusMap, setUndoStatusMap] = useState<Record<string, { loading: boolean; response?: UndoActionResponse; error?: string }>>({});
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  if (!isOpen) return null;

  const toggleSelect = (actionId: string) => {
    if (applyResponse) return; // Locked once applied
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(actionId)) {
        next.delete(actionId);
      } else {
        next.add(actionId);
      }
      return next;
    });
  };

  const toggleSelectAll = () => {
    if (applyResponse) return;
    const safeIds = previews.filter((p) => p.can_apply).map((p) => p.action_id);
    if (selectedIds.size === safeIds.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(safeIds));
    }
  };

  const handleApproveAndApply = async () => {
    if (selectedIds.size === 0) return;
    setIsApplying(true);
    setErrorMessage(null);

    try {
      const chosenIds = Array.from(selectedIds);
      const res = await applyActions(workspacePath, previews, chosenIds);
      setApplyResponse(res);
      if (onApplied) {
        onApplied(res);
      }
    } catch (err: any) {
      setErrorMessage(err.message || 'Failed to apply filesystem actions.');
    } finally {
      setIsApplying(false);
    }
  };

  const handleUndo = async (actionId: string) => {
    setUndoStatusMap((prev) => ({
      ...prev,
      [actionId]: { loading: true },
    }));

    try {
      const res = await undoAction(workspacePath, actionId);
      setUndoStatusMap((prev) => ({
        ...prev,
        [actionId]: { loading: false, response: res },
      }));
    } catch (err: any) {
      setUndoStatusMap((prev) => ({
        ...prev,
        [actionId]: { loading: false, error: err.message || 'Undo failed.' },
      }));
    }
  };

  const safeCount = previews.filter((p) => p.can_apply).length;
  const collisionCount = previews.filter((p) => p.destination_file_exists || !p.can_apply).length;

  return (
    <div className="modal-overlay" style={{ zIndex: 1100 }}>
      <div
        className="modal-content"
        style={{
          maxWidth: '850px',
          width: '95%',
          maxHeight: '90vh',
          display: 'flex',
          flexDirection: 'column',
          padding: 0,
          overflow: 'hidden',
        }}
      >
        {/* Modal Header */}
        <div
          style={{
            padding: '1.25rem 1.5rem',
            borderBottom: '1px solid var(--border)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            background: 'var(--bg-card)',
          }}
        >
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
              <ShieldCheck size={22} style={{ color: 'var(--forest-600)' }} />
              <h3 style={{ margin: 0, fontSize: '1.2rem', fontWeight: 700, color: 'var(--text-primary)' }}>
                Filesystem Action Review
              </h3>
            </div>
            <div
              style={{
                fontSize: '0.78rem',
                color: 'var(--text-muted)',
                marginTop: '0.25rem',
                display: 'flex',
                gap: '0.5rem',
                alignItems: 'center',
              }}
            >
              <span>PROPOSE</span>
              <span>&rarr;</span>
              <strong style={{ color: 'var(--forest-700)' }}>PREVIEW</strong>
              <span>&rarr;</span>
              <span>APPROVE</span>
              <span>&rarr;</span>
              <span>APPLY</span>
              <span>&rarr;</span>
              <span>VERIFY</span>
              <span>&rarr;</span>
              <span>UNDO</span>
            </div>
          </div>
          <button
            onClick={onClose}
            className="btn-secondary"
            style={{ padding: '0.4rem', border: 'none', background: 'transparent', cursor: 'pointer' }}
            title="Close"
          >
            <X size={20} />
          </button>
        </div>

        {/* Security Banner */}
        <div
          style={{
            background: 'var(--forest-50)',
            borderBottom: '1px solid var(--forest-200)',
            padding: '0.75rem 1.5rem',
            fontSize: '0.82rem',
            color: 'var(--forest-900)',
            display: 'flex',
            alignItems: 'center',
            gap: '0.65rem',
          }}
        >
          <Shield size={16} style={{ color: 'var(--forest-700)', flexShrink: 0 }} />
          <span>
            <strong>Safety Guarantees:</strong> Never overwrites existing files. Strict workspace isolation. File state and SHA-256 revalidated immediately before execution.
          </span>
        </div>

        {/* Status / Counts Bar */}
        <div
          style={{
            padding: '0.75rem 1.5rem',
            background: 'var(--bg-subtle, #f8fafc)',
            borderBottom: '1px solid var(--border)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            fontSize: '0.85rem',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '1.25rem' }}>
            {!applyResponse && (
              <label style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', cursor: 'pointer', fontWeight: 600 }}>
                <input
                  type="checkbox"
                  checked={selectedIds.size > 0 && selectedIds.size === safeCount}
                  onChange={toggleSelectAll}
                  disabled={safeCount === 0 || isApplying}
                />
                Select All Safe ({safeCount})
              </label>
            )}
            <span style={{ color: 'var(--text-muted)' }}>
              Total: <strong>{previews.length}</strong>
            </span>
            {collisionCount > 0 && (
              <span style={{ color: '#b91c1c', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
                <AlertTriangle size={14} />
                {collisionCount} with warnings/collisions
              </span>
            )}
          </div>

          <div>
            {!applyResponse && (
              <span style={{ fontWeight: 600, color: 'var(--forest-700)' }}>
                {selectedIds.size} action{selectedIds.size === 1 ? '' : 's'} selected for approval
              </span>
            )}
          </div>
        </div>

        {/* Error message if any */}
        {errorMessage && (
          <div
            style={{
              padding: '0.75rem 1.5rem',
              background: '#fef2f2',
              borderBottom: '1px solid #fecaca',
              color: '#991b1b',
              fontSize: '0.85rem',
              display: 'flex',
              alignItems: 'center',
              gap: '0.5rem',
            }}
          >
            <ShieldAlert size={16} />
            <span>{errorMessage}</span>
          </div>
        )}

        {/* Batch Result Banner (Post-Execution) */}
        {applyResponse && (
          <div
            style={{
              padding: '1rem 1.5rem',
              borderBottom: '1px solid var(--border)',
              background:
                applyResponse.batch_status === 'all_succeeded'
                  ? '#f0fdf4'
                  : applyResponse.batch_status === 'partially_succeeded'
                  ? '#fffbeb'
                  : '#fef2f2',
              color:
                applyResponse.batch_status === 'all_succeeded'
                  ? '#166534'
                  : applyResponse.batch_status === 'partially_succeeded'
                  ? '#92400e'
                  : '#991b1b',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', fontWeight: 700, fontSize: '0.95rem' }}>
              {applyResponse.batch_status === 'all_succeeded' ? (
                <CheckCircle size={18} />
              ) : (
                <AlertTriangle size={18} />
              )}
              <span>
                {applyResponse.batch_status === 'all_succeeded' && 'All Actions Succeeded & Verified!'}
                {applyResponse.batch_status === 'partially_succeeded' && 'Batch Partially Succeeded (Itemized Errors Below)'}
                {applyResponse.batch_status === 'all_failed' && 'All Actions Failed (No Files Overwritten)'}
              </span>
            </div>
            <div style={{ fontSize: '0.82rem', marginTop: '0.35rem' }}>
              Batch ID: <code>{applyResponse.batch_id}</code> | Succeeded: <strong>{applyResponse.succeeded_count}</strong> | Failed: <strong>{applyResponse.failed_count}</strong>
            </div>
          </div>
        )}

        {/* Scrollable Preview List */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '1rem 1.5rem', display: 'flex', flexDirection: 'column', gap: '0.85rem' }}>
          {previews.map((preview) => {
            const isSelected = selectedIds.has(preview.action_id);
            const execResult = applyResponse?.results.find((r) => r.action_id === preview.action_id);
            const undoState = undoStatusMap[preview.action_id];

            return (
              <div
                key={preview.action_id}
                style={{
                  border: `1px solid ${
                    execResult
                      ? execResult.success
                        ? '#86efac'
                        : '#fca5a5'
                      : preview.can_apply
                      ? 'var(--border)'
                      : '#fecaca'
                  }`,
                  borderRadius: '8px',
                  padding: '1rem',
                  background: !preview.can_apply ? '#fefefe' : 'var(--bg-card)',
                  boxShadow: '0 1px 2px rgba(0,0,0,0.03)',
                  transition: 'border-color 0.15s ease',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'flex-start', gap: '0.75rem' }}>
                  {/* Selection Checkbox */}
                  {!applyResponse && (
                    <input
                      type="checkbox"
                      checked={isSelected}
                      disabled={!preview.can_apply || isApplying}
                      onChange={() => toggleSelect(preview.action_id)}
                      style={{ marginTop: '0.25rem', cursor: preview.can_apply ? 'pointer' : 'not-allowed' }}
                    />
                  )}

                  <div style={{ flex: 1, minWidth: 0 }}>
                    {/* Header Row: Operation Badge + Reason */}
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '0.5rem', marginBottom: '0.4rem' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                        <span
                          className={`badge ${
                            preview.operation_type === 'move_to_archive' ? 'badge-primary' : 'badge-medium'
                          }`}
                          style={{
                            fontSize: '0.72rem',
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '0.3rem',
                            textTransform: 'uppercase',
                            fontWeight: 700,
                          }}
                        >
                          {preview.operation_type === 'move_to_archive' ? (
                            <>
                              <FolderArchive size={12} /> Move to Archive
                            </>
                          ) : (
                            <>
                              <FileText size={12} /> Rename File
                            </>
                          )}
                        </span>
                        <span style={{ fontSize: '0.82rem', fontWeight: 600, color: 'var(--text-primary)' }}>
                          {preview.reason}
                        </span>
                      </div>

                      {/* Execution / Undo Status Badge */}
                      {execResult && (
                        <div>
                          {execResult.success ? (
                            undoState?.response?.success ? (
                              <span className="badge badge-low" style={{ background: '#e0f2fe', color: '#0369a1' }}>
                                Undone & Restored
                              </span>
                            ) : (
                              <span className="badge badge-low" style={{ background: '#dcfce7', color: '#15803d' }}>
                                Verified & Applied
                              </span>
                            )
                          ) : (
                            <span className="badge badge-high" style={{ background: '#fee2e2', color: '#b91c1c' }}>
                              Failed
                            </span>
                          )}
                        </div>
                      )}
                    </div>

                    {/* Path Transition Display */}
                    <div
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '0.6rem',
                        fontSize: '0.85rem',
                        background: 'var(--bg-subtle, #f8fafc)',
                        padding: '0.5rem 0.75rem',
                        borderRadius: '6px',
                        fontFamily: 'var(--font-mono)',
                        overflowX: 'auto',
                      }}
                    >
                      <div style={{ color: 'var(--text-secondary)', display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                        <FileText size={14} style={{ color: 'var(--text-muted)' }} />
                        <span>{preview.source_relative_path}</span>
                      </div>

                      <ArrowRight size={14} style={{ color: 'var(--forest-600)', flexShrink: 0 }} />

                      <div style={{ color: 'var(--forest-900)', fontWeight: 600 }}>
                        {preview.destination_relative_path}
                      </div>
                    </div>

                    {/* Metadata & Warnings */}
                    <div
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '1rem',
                        fontSize: '0.75rem',
                        color: 'var(--text-muted)',
                        marginTop: '0.45rem',
                        flexWrap: 'wrap',
                      }}
                    >
                      <span>Size: <strong>{preview.source_size_formatted}</strong></span>
                      {preview.source_sha256 && (
                        <span>SHA-256: <code>{preview.source_sha256.substring(0, 10)}...</code></span>
                      )}

                      {/* Warnings / Collisions */}
                      {preview.warnings.map((warn, i) => (
                        <span key={i} style={{ color: '#b91c1c', fontWeight: 600, display: 'inline-flex', alignItems: 'center', gap: '0.25rem' }}>
                          <AlertTriangle size={12} />
                          {warn}
                        </span>
                      ))}

                      {preview.validation_error && (
                        <span style={{ color: '#b91c1c', fontWeight: 600 }}>
                          Error: {preview.validation_error}
                        </span>
                      )}
                    </div>

                    {/* Post-execution error */}
                    {execResult && !execResult.success && (
                      <div
                        style={{
                          marginTop: '0.5rem',
                          padding: '0.4rem 0.6rem',
                          background: '#fef2f2',
                          borderRadius: '4px',
                          color: '#b91c1c',
                          fontSize: '0.78rem',
                        }}
                      >
                        <strong>Execution Error:</strong> {execResult.error_message}
                      </div>
                    )}

                    {/* Post-execution undo feedback / button */}
                    {execResult?.success && !undoState?.response?.success && (
                      <div style={{ marginTop: '0.65rem', display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                        <button
                          className="btn-secondary"
                          style={{
                            padding: '0.25rem 0.65rem',
                            fontSize: '0.75rem',
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '0.35rem',
                            color: '#b91c1c',
                            borderColor: '#fca5a5',
                          }}
                          disabled={undoState?.loading}
                          onClick={() => handleUndo(preview.action_id)}
                        >
                          {undoState?.loading ? (
                            <Loader2 size={12} className="spin" />
                          ) : (
                            <RotateCcw size={12} />
                          )}
                          Undo Operation
                        </button>

                        {undoState?.error && (
                          <span style={{ fontSize: '0.75rem', color: '#b91c1c' }}>
                            {undoState.error}
                          </span>
                        )}
                      </div>
                    )}

                    {undoState?.response?.success && (
                      <div
                        style={{
                          marginTop: '0.5rem',
                          fontSize: '0.78rem',
                          color: '#0369a1',
                          display: 'flex',
                          alignItems: 'center',
                          gap: '0.3rem',
                        }}
                      >
                        <CheckCircle size={13} />
                        <span>{undoState.response.message}</span>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        {/* Modal Footer */}
        <div
          style={{
            padding: '1rem 1.5rem',
            borderTop: '1px solid var(--border)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            background: 'var(--bg-card)',
          }}
        >
          <button className="btn-secondary" onClick={onClose} disabled={isApplying}>
            {applyResponse ? 'Close Review' : 'Cancel'}
          </button>

          {!applyResponse ? (
            <button
              className="btn-primary"
              disabled={selectedIds.size === 0 || isApplying}
              onClick={handleApproveAndApply}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '0.45rem',
                minWidth: '200px',
                justifyContent: 'center',
              }}
            >
              {isApplying ? (
                <>
                  <Loader2 size={16} className="spin" />
                  Applying & Verifying...
                </>
              ) : (
                <>
                  <ShieldCheck size={16} />
                  Approve & Execute ({selectedIds.size})
                </>
              )}
            </button>
          ) : (
            <button className="btn-primary" onClick={onClose}>
              Done
            </button>
          )}
        </div>
      </div>
    </div>
  );
};
