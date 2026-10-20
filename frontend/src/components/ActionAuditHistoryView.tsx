import React, { useState, useEffect, useCallback } from 'react';
import {
  ArrowRight,
  CheckCircle,
  Clock,
  FileText,
  FolderArchive,
  History,
  Loader2,
  RefreshCw,
  RotateCcw,
  ShieldAlert,
} from 'lucide-react';
import type { ActionAuditRecord, UndoActionResponse } from '../types';
import { fetchAuditLog, undoAction } from '../api/client';

interface ActionAuditHistoryViewProps {
  folderPath: string;
}

export const ActionAuditHistoryView: React.FC<ActionAuditHistoryViewProps> = ({ folderPath }) => {
  const [records, setRecords] = useState<ActionAuditRecord[]>([]);
  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [undoStatusMap, setUndoStatusMap] = useState<
    Record<string, { loading: boolean; response?: UndoActionResponse; error?: string }>
  >({});
  const [statusFilter, setStatusFilter] = useState<'all' | 'applied' | 'undone' | 'failed'>('all');

  const loadAuditLog = useCallback(async () => {
    if (!folderPath.trim()) return;
    setLoading(true);
    setErrorMessage(null);
    try {
      const data = await fetchAuditLog(folderPath, 150);
      setRecords(data.records);
    } catch (err: any) {
      setErrorMessage(err.message || 'Failed to load audit history.');
    } finally {
      setLoading(false);
    }
  }, [folderPath]);

  useEffect(() => {
    loadAuditLog();
  }, [loadAuditLog]);

  const handleUndo = async (actionId: string) => {
    setUndoStatusMap((prev) => ({
      ...prev,
      [actionId]: { loading: true },
    }));

    try {
      const res = await undoAction(folderPath, actionId);
      setUndoStatusMap((prev) => ({
        ...prev,
        [actionId]: { loading: false, response: res },
      }));
      // Refresh list to update status to undone
      loadAuditLog();
    } catch (err: any) {
      setUndoStatusMap((prev) => ({
        ...prev,
        [actionId]: { loading: false, error: err.message || 'Undo operation failed.' },
      }));
    }
  };

  const filteredRecords = records.filter((r) => {
    if (statusFilter === 'all') return true;
    if (statusFilter === 'applied') return r.status === 'applied';
    if (statusFilter === 'undone') return r.status === 'undone';
    if (statusFilter === 'failed') return r.status === 'failed' || r.status === 'undo_failed';
    return true;
  });

  return (
    <div>
      {/* Header and Filter Controls */}
      <div
        className="panel-card"
        style={{
          marginBottom: '1.25rem',
          padding: '1.25rem 1.5rem',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          flexWrap: 'wrap',
          gap: '1rem',
        }}
      >
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
            <History size={20} style={{ color: 'var(--forest-600)' }} />
            <h3 style={{ margin: 0, fontSize: '1.15rem', fontWeight: 700, color: 'var(--text-primary)' }}>
              Filesystem Audit Manifest
            </h3>
          </div>
          <p style={{ margin: '0.25rem 0 0 0', fontSize: '0.82rem', color: 'var(--text-muted)' }}>
            Persistent, non-repudiable local record of all proposed, approved, executed, and undone operations.
          </p>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
          {/* Status filter */}
          <div style={{ display: 'flex', borderRadius: '6px', border: '1px solid var(--border)', overflow: 'hidden' }}>
            {(['all', 'applied', 'undone', 'failed'] as const).map((filter) => (
              <button
                key={filter}
                onClick={() => setStatusFilter(filter)}
                style={{
                  padding: '0.35rem 0.75rem',
                  fontSize: '0.78rem',
                  border: 'none',
                  background: statusFilter === filter ? 'var(--forest-600)' : 'var(--bg-card)',
                  color: statusFilter === filter ? '#ffffff' : 'var(--text-secondary)',
                  cursor: 'pointer',
                  fontWeight: statusFilter === filter ? 600 : 500,
                  textTransform: 'capitalize',
                  transition: 'background 0.15s ease',
                }}
              >
                {filter}
              </button>
            ))}
          </div>

          <button
            className="btn-secondary"
            onClick={loadAuditLog}
            disabled={loading}
            style={{ padding: '0.35rem 0.75rem', fontSize: '0.78rem', display: 'flex', alignItems: 'center', gap: '0.35rem' }}
          >
            <RefreshCw size={13} className={loading ? 'spin' : ''} />
            Refresh
          </button>
        </div>
      </div>

      {errorMessage && (
        <div
          style={{
            marginBottom: '1rem',
            padding: '0.75rem 1rem',
            background: '#fef2f2',
            border: '1px solid #fecaca',
            borderRadius: '6px',
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

      {/* Audit Entries List */}
      <div className="panel-card" style={{ padding: 0, overflow: 'hidden' }}>
        {filteredRecords.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '3.5rem 1.5rem', color: 'var(--text-muted)' }}>
            <CheckCircle size={36} style={{ color: 'var(--forest-500)', margin: '0 auto 0.5rem' }} />
            <h4 style={{ fontWeight: 600, color: 'var(--text-primary)', margin: '0.25rem 0' }}>
              No Audit Records Found
            </h4>
            <p style={{ fontSize: '0.82rem', margin: 0 }}>
              {statusFilter !== 'all'
                ? `No actions matching status '${statusFilter}'.`
                : 'Execute file actions through the Action Review system to generate an audit trail.'}
            </p>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column' }}>
            {filteredRecords.map((record) => {
              const undoState = undoStatusMap[record.action_id];

              return (
                <div
                  key={record.action_id}
                  style={{
                    padding: '1.1rem 1.5rem',
                    borderBottom: '1px solid var(--border)',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '0.5rem',
                  }}
                >
                  {/* Top line: operation, reason, status */}
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '0.5rem' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
                      <span
                        className={`badge ${
                          record.operation_type === 'move_to_archive' ? 'badge-primary' : 'badge-medium'
                        }`}
                        style={{
                          fontSize: '0.72rem',
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: '0.3rem',
                          fontWeight: 700,
                        }}
                      >
                        {record.operation_type === 'move_to_archive' ? (
                          <>
                            <FolderArchive size={12} /> MOVE TO ARCHIVE
                          </>
                        ) : (
                          <>
                            <FileText size={12} /> RENAME
                          </>
                        )}
                      </span>

                      <span style={{ fontWeight: 600, fontSize: '0.88rem', color: 'var(--text-primary)' }}>
                        {record.reason}
                      </span>
                    </div>

                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                      {/* Status Badge */}
                      <span
                        className="badge"
                        style={{
                          fontSize: '0.72rem',
                          textTransform: 'uppercase',
                          fontWeight: 700,
                          background:
                            record.status === 'applied'
                              ? '#dcfce7'
                              : record.status === 'undone'
                              ? '#e0f2fe'
                              : '#fee2e2',
                          color:
                            record.status === 'applied'
                              ? '#15803d'
                              : record.status === 'undone'
                              ? '#0369a1'
                              : '#b91c1c',
                        }}
                      >
                        {record.status}
                      </span>

                      <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
                        <Clock size={12} />
                        {new Date(record.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                      </span>
                    </div>
                  </div>

                  {/* Path Transition */}
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '0.6rem',
                      fontSize: '0.82rem',
                      background: 'var(--bg-subtle, #f8fafc)',
                      padding: '0.45rem 0.75rem',
                      borderRadius: '6px',
                      fontFamily: 'var(--font-mono)',
                      overflowX: 'auto',
                    }}
                  >
                    <div style={{ color: 'var(--text-secondary)' }}>{record.source_relative_path}</div>
                    <ArrowRight size={13} style={{ color: 'var(--forest-600)', flexShrink: 0 }} />
                    <div style={{ color: 'var(--forest-900)', fontWeight: 600 }}>
                      {record.destination_relative_path}
                    </div>
                  </div>

                  {/* Hash & Size verification details */}
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      flexWrap: 'wrap',
                      gap: '0.75rem',
                      fontSize: '0.75rem',
                      color: 'var(--text-muted)',
                    }}
                  >
                    <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap' }}>
                      <span>Action ID: <code>{record.action_id}</code></span>
                      {record.pre_hash && <span>Pre-SHA: <code>{record.pre_hash.substring(0, 8)}...</code></span>}
                      {record.post_hash && <span>Post-SHA: <code>{record.post_hash.substring(0, 8)}...</code></span>}
                      {record.applied_at && (
                        <span>Applied: {new Date(record.applied_at).toLocaleTimeString()}</span>
                      )}
                      {record.undone_at && (
                        <span style={{ color: '#0369a1' }}>Undone: {new Date(record.undone_at).toLocaleTimeString()}</span>
                      )}
                    </div>

                    {/* Undo Trigger Button */}
                    {record.can_undo && (
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                        <button
                          className="btn-secondary"
                          onClick={() => handleUndo(record.action_id)}
                          disabled={undoState?.loading}
                          style={{
                            padding: '0.2rem 0.6rem',
                            fontSize: '0.75rem',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '0.35rem',
                            color: '#b91c1c',
                            borderColor: '#fca5a5',
                          }}
                        >
                          {undoState?.loading ? (
                            <Loader2 size={12} className="spin" />
                          ) : (
                            <RotateCcw size={12} />
                          )}
                          Undo Action
                        </button>

                        {undoState?.error && (
                          <span style={{ color: '#b91c1c', fontSize: '0.75rem' }}>
                            {undoState.error}
                          </span>
                        )}
                      </div>
                    )}
                  </div>

                  {/* Error if operation failed */}
                  {record.error_message && (
                    <div
                      style={{
                        padding: '0.4rem 0.6rem',
                        background: '#fef2f2',
                        borderRadius: '4px',
                        color: '#b91c1c',
                        fontSize: '0.75rem',
                        marginTop: '0.25rem',
                      }}
                    >
                      <strong>Failure Log:</strong> {record.error_message}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};
