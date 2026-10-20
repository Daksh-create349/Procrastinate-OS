import React from 'react';
import type { DuplicateResult, ProposedActionItem } from '../types';
import { Copy, Trash2, CheckCircle, FileWarning, FolderArchive } from 'lucide-react';

interface DuplicateFinderViewProps {
  duplicateResult: DuplicateResult | null;
  onScanDuplicates: () => void;
  isScanning: boolean;
  folderPath: string;
  onProposeActions?: (actions: ProposedActionItem[]) => void;
}

export const DuplicateFinderView: React.FC<DuplicateFinderViewProps> = ({
  duplicateResult,
  onScanDuplicates,
  isScanning,
  folderPath,
  onProposeActions,
}) => {
  if (!duplicateResult) {
    return (
      <div className="panel-card">
        <div className="empty-state">
          <Copy className="empty-icon" size={42} />
          <h3 className="empty-title">Duplicate Scanner Ready</h3>
          <p className="empty-desc">
            Identify exact byte-for-byte duplicate files consuming unnecessary storage and causing version clutter.
          </p>
          <div style={{ marginTop: '1.25rem' }}>
            <button
              className="btn-primary"
              onClick={onScanDuplicates}
              disabled={isScanning || !folderPath.trim()}
              id="find-duplicates-btn"
            >
              <Copy size={16} />
              {isScanning ? 'Computing Hashes...' : 'Find Duplicate Files'}
            </button>
          </div>
        </div>
      </div>
    );
  }

  const handleArchiveAllDuplicates = () => {
    if (!onProposeActions) return;
    const items: ProposedActionItem[] = [];
    duplicateResult.groups.forEach((group) => {
      const original = group.relative_files && group.relative_files[0] ? group.relative_files[0] : group.files[0];
      group.files.forEach((file, idx) => {
        if (idx > 0) {
          const rel = group.relative_files && group.relative_files[idx] ? group.relative_files[idx] : file;
          items.push({
            operation_type: 'move_to_archive',
            source_relative_path: rel,
            target_name_or_folder: '_archive',
            reason: `Archive redundant copy of ${original}`,
          });
        }
      });
    });
    if (items.length > 0) {
      onProposeActions(items);
    }
  };

  const handleArchiveSingleFile = (relPath: string, originalPath: string) => {
    if (!onProposeActions) return;
    onProposeActions([
      {
        operation_type: 'move_to_archive',
        source_relative_path: relPath,
        target_name_or_folder: '_archive',
        reason: `Archive redundant duplicate copy of ${originalPath}`,
      },
    ]);
  };

  return (
    <div>
      <div className="stat-grid">
        <div className="stat-card">
          <div className="stat-header">
            <span className="stat-title">Duplicate Groups</span>
            <Copy size={18} className="stat-icon" />
          </div>
          <div className="stat-value">{duplicateResult.groups_count}</div>
          <div className="stat-subtitle">Sets of identical files</div>
        </div>

        <div className="stat-card">
          <div className="stat-header">
            <span className="stat-title">Redundant Copies</span>
            <FileWarning size={18} className="stat-icon" />
          </div>
          <div className="stat-value">{duplicateResult.total_duplicate_files}</div>
          <div className="stat-subtitle">Files that can be pruned</div>
        </div>

        <div className="stat-card">
          <div className="stat-header">
            <span className="stat-title">Wasted Space</span>
            <Trash2 size={18} className="stat-icon" style={{ color: '#ef4444' }} />
          </div>
          <div className="stat-value" style={{ color: duplicateResult.total_wasted_bytes > 0 ? '#b91c1c' : 'inherit' }}>
            {duplicateResult.total_wasted_formatted}
          </div>
          <div className="stat-subtitle">Recoverable disk capacity</div>
        </div>
      </div>

      <div className="panel-card">
        <div className="panel-header" style={{ flexWrap: 'wrap', gap: '0.75rem' }}>
          <h3 className="panel-title">
            <Copy size={18} style={{ color: 'var(--forest-600)' }} />
            Identified Duplicate Sets
          </h3>

          <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem' }}>
            {onProposeActions && duplicateResult.total_duplicate_files > 0 && (
              <button
                className="btn-primary"
                onClick={handleArchiveAllDuplicates}
                style={{ padding: '0.4rem 0.85rem', fontSize: '0.82rem', display: 'flex', alignItems: 'center', gap: '0.35rem' }}
                id="archive-all-duplicates-btn"
              >
                <FolderArchive size={14} />
                Review & Archive All Duplicates ({duplicateResult.total_duplicate_files})
              </button>
            )}

            <button
              className="btn-secondary"
              onClick={onScanDuplicates}
              disabled={isScanning}
              style={{ padding: '0.4rem 0.85rem', fontSize: '0.82rem' }}
            >
              {isScanning ? 'Scanning...' : 'Rescan Duplicates'}
            </button>
          </div>
        </div>

        <div className="panel-body">
          {duplicateResult.groups.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '2rem 1rem' }}>
              <CheckCircle size={36} style={{ color: 'var(--forest-500)', margin: '0 auto 0.5rem' }} />
              <h4 style={{ fontWeight: 600, color: 'var(--forest-900)' }}>No Duplicate Files Found</h4>
              <p style={{ fontSize: '0.88rem', color: 'var(--text-muted)' }}>
                Your folder is completely free of identical files.
              </p>
            </div>
          ) : (
            duplicateResult.groups.map((group, index) => {
              const originalRel = group.relative_files && group.relative_files[0] ? group.relative_files[0] : group.files[0];
              return (
                <div key={group.checksum} className="duplicate-card">
                  <div className="duplicate-card-header">
                    <div>
                      <span style={{ fontWeight: 700, fontSize: '0.95rem' }}>
                        Duplicate Set #{index + 1}
                      </span>
                      <span
                        style={{
                          marginLeft: '0.75rem',
                          fontSize: '0.78rem',
                          color: 'var(--text-muted)',
                          fontFamily: 'var(--font-mono)',
                        }}
                      >
                        SHA256: {group.checksum.substring(0, 12)}...
                      </span>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                      <span style={{ fontSize: '0.82rem', color: 'var(--text-secondary)' }}>
                        Size: <strong>{group.file_size_formatted}</strong> each
                      </span>
                      <span className="badge badge-high">
                        Wastes {group.wasted_formatted}
                      </span>
                    </div>
                  </div>

                  <div className="duplicate-card-paths">
                    {group.files.map((file, i) => {
                      const relPath = group.relative_files && group.relative_files[i] ? group.relative_files[i] : file;
                      return (
                        <div
                          key={file}
                          className="duplicate-path-item"
                          title={file}
                          style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}
                        >
                          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', minWidth: 0 }}>
                            <span
                              style={{
                                fontSize: '0.7rem',
                                padding: '0.1rem 0.35rem',
                                borderRadius: 3,
                                backgroundColor: i === 0 ? 'var(--forest-100)' : 'var(--danger-bg)',
                                color: i === 0 ? 'var(--forest-800)' : 'var(--danger-text)',
                                fontWeight: 600,
                              }}
                            >
                              {i === 0 ? 'KEEP' : 'REDUNDANT'}
                            </span>
                            <span style={{ fontWeight: 500 }}>{relPath}</span>
                            {relPath !== file && (
                              <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>
                                ({file})
                              </span>
                            )}
                          </div>

                          {i > 0 && onProposeActions && (
                            <button
                              className="btn-secondary"
                              onClick={() => handleArchiveSingleFile(relPath, originalRel)}
                              style={{
                                padding: '0.2rem 0.5rem',
                                fontSize: '0.72rem',
                                display: 'flex',
                                alignItems: 'center',
                                gap: '0.3rem',
                              }}
                              title="Propose moving this duplicate to archive"
                            >
                              <FolderArchive size={12} />
                              Archive
                            </button>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
};

