import React, { useState } from 'react';
import {
  CheckCircle,
  Copy,
  FileText,
  FileWarning,
  FolderArchive,
  HardDrive,
  Trash2,
} from 'lucide-react';
import type {
  DeterministicFinding,
  DuplicateResult,
  FileInfo,
  ProposedActionItem,
  ScanResult,
} from '../types';

interface CleanupReviewViewProps {
  scanResult: ScanResult | null;
  duplicateResult: DuplicateResult | null;
  folderPath?: string;
  onProposeActions: (actions: ProposedActionItem[]) => void;
  onRescanDuplicates?: () => void;
  isScanningDuplicates?: boolean;
}

export const CleanupReviewView: React.FC<CleanupReviewViewProps> = ({
  scanResult,
  duplicateResult,
  onProposeActions,
  onRescanDuplicates,
  isScanningDuplicates,
}) => {
  const [activeCategory, setActiveCategory] = useState<'duplicates' | 'large' | 'redundant_versions' | 'empty'>('duplicates');

  if (!scanResult) {
    return (
      <div className="panel-card">
        <div className="empty-state">
          <FolderArchive className="empty-icon" size={42} />
          <h3 className="empty-title">Cleanup Candidates Unavailable</h3>
          <p className="empty-desc">
            Scan your workspace first to surface duplicate groups, oversized files, redundant version suffixes, and empty artifacts.
          </p>
        </div>
      </div>
    );
  }

  // 1. Gather Duplicates
  const duplicateGroups = duplicateResult?.groups || scanResult.duplicate_groups || [];
  const totalDuplicateCopies = duplicateResult?.total_duplicate_files || duplicateGroups.reduce((acc, g) => acc + (g.files.length - 1), 0);

  // 2. Gather Large Files (>20MB or top largest)
  const largestFiles: FileInfo[] = scanResult.largest_files || [];

  // 3. Gather Redundant Exports / Versioned Files
  const redundantExportFindings: DeterministicFinding[] = (scanResult.deterministic_findings || []).filter(
    (f) => f.category === 'redundant_export'
  );

  // 4. Gather Empty Files
  const emptyFileFindings: DeterministicFinding[] = (scanResult.deterministic_findings || []).filter(
    (f) => f.category === 'empty_file'
  );

  // Helper: propose archiving single duplicate
  const handleArchiveSingleDuplicate = (relPath: string, originalPath: string) => {
    onProposeActions([
      {
        operation_type: 'move_to_archive',
        source_relative_path: relPath,
        target_name_or_folder: '_archive/duplicates',
        reason: `Archive redundant copy of ${originalPath}`,
      },
    ]);
  };

  // Helper: propose archiving all duplicates
  const handleArchiveAllDuplicates = () => {
    const items: ProposedActionItem[] = [];
    duplicateGroups.forEach((group) => {
      const originalRel = group.relative_files && group.relative_files[0] ? group.relative_files[0] : group.files[0];
      group.files.forEach((file, idx) => {
        if (idx > 0) {
          const rel = group.relative_files && group.relative_files[idx] ? group.relative_files[idx] : file;
          items.push({
            operation_type: 'move_to_archive',
            source_relative_path: rel,
            target_name_or_folder: '_archive/duplicates',
            reason: `Archive redundant copy of ${originalRel}`,
          });
        }
      });
    });
    if (items.length > 0) {
      onProposeActions(items);
    }
  };

  // Helper: propose archiving large file
  const handleArchiveLargeFile = (file: FileInfo) => {
    onProposeActions([
      {
        operation_type: 'move_to_archive',
        source_relative_path: file.relative_path,
        target_name_or_folder: '_archive/large_files',
        reason: `Archive large file (${file.size_formatted}) consuming significant capacity`,
      },
    ]);
  };

  // Helper: propose renaming redundant export
  const handleRenameRedundantExport = (finding: DeterministicFinding) => {
    const sourceRel = finding.relative_paths[0];
    if (!sourceRel) return;

    // Derive cleaned filename (e.g. remove _v2, _FINAL, copy)
    const baseName = sourceRel.split('/').pop() || sourceRel;
    const cleanName = baseName
      .replace(/(_v\d+|-v\d+|_final|-final|_copy|\scopy(\s\(\d+\))?)/gi, '')
      .replace(/\s+/g, '_');

    onProposeActions([
      {
        operation_type: 'rename',
        source_relative_path: sourceRel,
        target_name_or_folder: cleanName,
        reason: `Normalize redundant version suffix: ${finding.title}`,
      },
    ]);
  };

  // Helper: propose archiving empty file
  const handleArchiveEmptyFile = (finding: DeterministicFinding) => {
    const sourceRel = finding.relative_paths[0];
    if (!sourceRel) return;
    onProposeActions([
      {
        operation_type: 'move_to_archive',
        source_relative_path: sourceRel,
        target_name_or_folder: '_archive/empty_files',
        reason: 'Archive zero-byte empty file artifact',
      },
    ]);
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
      {/* Overview Stat Strip */}
      <div className="stat-grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))' }}>
        <div className="stat-card">
          <div className="stat-header">
            <span className="stat-title">Redundant Copies</span>
            <Copy size={16} className="stat-icon" />
          </div>
          <div className="stat-value">{totalDuplicateCopies}</div>
          <div className="stat-subtitle">Identical duplicate files</div>
        </div>

        <div className="stat-card">
          <div className="stat-header">
            <span className="stat-title">Wasted Space</span>
            <Trash2 size={16} className="stat-icon" style={{ color: scanResult.total_wasted_bytes > 0 ? '#b91c1c' : 'inherit' }} />
          </div>
          <div className="stat-value" style={{ color: scanResult.total_wasted_bytes > 0 ? '#b91c1c' : 'inherit' }}>
            {scanResult.total_wasted_formatted}
          </div>
          <div className="stat-subtitle">Recoverable disk space</div>
        </div>

        <div className="stat-card">
          <div className="stat-header">
            <span className="stat-title">Large Files</span>
            <HardDrive size={16} className="stat-icon" />
          </div>
          <div className="stat-value">{largestFiles.length}</div>
          <div className="stat-subtitle">Significant storage candidates</div>
        </div>

        <div className="stat-card">
          <div className="stat-header">
            <span className="stat-title">Versioned / Empty</span>
            <FileWarning size={16} className="stat-icon" />
          </div>
          <div className="stat-value">{redundantExportFindings.length + emptyFileFindings.length}</div>
          <div className="stat-subtitle">Messy naming or zero-byte</div>
        </div>
      </div>

      {/* Main Review Card */}
      <div className="panel-card" style={{ padding: 0, overflow: 'hidden' }}>
        {/* Navigation Bar between Cleanup Categories */}
        <div
          style={{
            padding: '1rem 1.5rem',
            borderBottom: '1px solid var(--border)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            flexWrap: 'wrap',
            gap: '0.75rem',
            backgroundColor: 'var(--bg-card)',
          }}
        >
          {/* Subtabs */}
          <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
            <button
              className={`tab-btn ${activeCategory === 'duplicates' ? 'active' : ''}`}
              onClick={() => setActiveCategory('duplicates')}
              style={{ padding: '0.4rem 0.85rem', fontSize: '0.82rem' }}
            >
              <Copy size={14} />
              Duplicates ({totalDuplicateCopies})
            </button>

            <button
              className={`tab-btn ${activeCategory === 'large' ? 'active' : ''}`}
              onClick={() => setActiveCategory('large')}
              style={{ padding: '0.4rem 0.85rem', fontSize: '0.82rem' }}
            >
              <HardDrive size={14} />
              Large Files ({largestFiles.length})
            </button>

            <button
              className={`tab-btn ${activeCategory === 'redundant_versions' ? 'active' : ''}`}
              onClick={() => setActiveCategory('redundant_versions')}
              style={{ padding: '0.4rem 0.85rem', fontSize: '0.82rem' }}
            >
              <FileText size={14} />
              Redundant Suffixes ({redundantExportFindings.length})
            </button>

            <button
              className={`tab-btn ${activeCategory === 'empty' ? 'active' : ''}`}
              onClick={() => setActiveCategory('empty')}
              style={{ padding: '0.4rem 0.85rem', fontSize: '0.82rem' }}
            >
              <FileWarning size={14} />
              Empty Files ({emptyFileFindings.length})
            </button>
          </div>

          {/* Quick Batch Actions */}
          {activeCategory === 'duplicates' && (
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              {onRescanDuplicates && (
                <button
                  className="btn-secondary"
                  onClick={onRescanDuplicates}
                  disabled={isScanningDuplicates}
                  style={{ padding: '0.4rem 0.85rem', fontSize: '0.82rem' }}
                >
                  {isScanningDuplicates ? 'Scanning...' : 'Rescan Duplicates'}
                </button>
              )}
              {totalDuplicateCopies > 0 && (
                <button
                  className="btn-primary"
                  onClick={handleArchiveAllDuplicates}
                  style={{ padding: '0.4rem 0.85rem', fontSize: '0.82rem', display: 'flex', alignItems: 'center', gap: '0.35rem' }}
                >
                  <FolderArchive size={14} />
                  Review &amp; Archive All Duplicates ({totalDuplicateCopies})
                </button>
              )}
            </div>
          )}
        </div>

        {/* Content Body */}
        <div style={{ padding: '1.25rem 1.5rem' }}>
          {/* A. Duplicates Section */}
          {activeCategory === 'duplicates' && (
            <div>
              {duplicateGroups.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '3rem 1rem', color: 'var(--text-muted)' }}>
                  <CheckCircle size={36} style={{ color: 'var(--forest-500)', margin: '0 auto 0.5rem' }} />
                  <h4 style={{ fontWeight: 600, color: 'var(--forest-900)' }}>Zero Duplicates Found</h4>
                  <p style={{ fontSize: '0.82rem' }}>All files in this workspace have unique SHA-256 hashes.</p>
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                  {duplicateGroups.map((group, idx) => {
                    const originalRel = group.relative_files && group.relative_files[0] ? group.relative_files[0] : group.files[0];
                    return (
                      <div key={group.checksum} className="duplicate-card">
                        <div className="duplicate-card-header">
                          <div>
                            <span style={{ fontWeight: 700, fontSize: '0.92rem' }}>
                              Duplicate Set #{idx + 1}
                            </span>
                            <span style={{ marginLeft: '0.65rem', fontSize: '0.75rem', color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>
                              SHA: {group.checksum.substring(0, 10)}...
                            </span>
                          </div>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                            <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
                              Size: <strong>{group.file_size_formatted}</strong> each
                            </span>
                            <span className="badge badge-high">
                              Wastes {group.wasted_formatted}
                            </span>
                          </div>
                        </div>

                        <div className="duplicate-card-paths">
                          {group.files.map((file, i) => {
                            const rel = group.relative_files && group.relative_files[i] ? group.relative_files[i] : file;
                            return (
                              <div
                                key={file}
                                className="duplicate-path-item"
                                style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '0.5rem' }}
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
                                    {i === 0 ? 'ORIGINAL' : 'REDUNDANT'}
                                  </span>
                                  <span style={{ fontWeight: 500, fontFamily: 'var(--font-mono)' }}>{rel}</span>
                                </div>

                                {i > 0 && (
                                  <button
                                    className="btn-secondary"
                                    onClick={() => handleArchiveSingleDuplicate(rel, originalRel)}
                                    style={{ padding: '0.2rem 0.55rem', fontSize: '0.72rem', display: 'flex', alignItems: 'center', gap: '0.3rem' }}
                                  >
                                    <FolderArchive size={12} />
                                    Archive Copy
                                  </button>
                                )}
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {/* B. Large Files Section */}
          {activeCategory === 'large' && (
            <div>
              {largestFiles.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '3rem 1rem', color: 'var(--text-muted)' }}>
                  <CheckCircle size={36} style={{ color: 'var(--forest-500)', margin: '0 auto 0.5rem' }} />
                  <h4 style={{ fontWeight: 600, color: 'var(--forest-900)' }}>No Oversized Files</h4>
                  <p style={{ fontSize: '0.82rem' }}>All files are within reasonable storage thresholds.</p>
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                  {largestFiles.map((file) => (
                    <div
                      key={file.path}
                      style={{
                        padding: '0.85rem 1rem',
                        border: '1px solid var(--border)',
                        borderRadius: '6px',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        gap: '1rem',
                      }}
                    >
                      <div style={{ minWidth: 0, flex: 1 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                          <span style={{ fontWeight: 600, fontFamily: 'var(--font-mono)', fontSize: '0.85rem', color: 'var(--text-primary)' }}>
                            {file.relative_path}
                          </span>
                          <span className="badge badge-medium" style={{ fontSize: '0.7rem' }}>
                            {file.category}
                          </span>
                        </div>
                        <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '0.2rem' }}>
                          Size: <strong>{file.size_formatted}</strong> &bull; Modified: {new Date(file.modified_at).toLocaleDateString()}
                        </div>
                      </div>

                      <button
                        className="btn-secondary"
                        onClick={() => handleArchiveLargeFile(file)}
                        style={{ padding: '0.3rem 0.65rem', fontSize: '0.75rem', display: 'flex', alignItems: 'center', gap: '0.35rem' }}
                      >
                        <FolderArchive size={12} />
                        Propose Archive
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* C. Redundant Version Suffixes Section */}
          {activeCategory === 'redundant_versions' && (
            <div>
              {redundantExportFindings.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '3rem 1rem', color: 'var(--text-muted)' }}>
                  <CheckCircle size={36} style={{ color: 'var(--forest-500)', margin: '0 auto 0.5rem' }} />
                  <h4 style={{ fontWeight: 600, color: 'var(--forest-900)' }}>No Redundant Version Suffixes</h4>
                  <p style={{ fontSize: '0.82rem' }}>No messy filenames like _v2_FINAL or Copy (1) detected.</p>
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                  {redundantExportFindings.map((finding) => (
                    <div
                      key={finding.finding_id}
                      style={{
                        padding: '0.85rem 1rem',
                        border: '1px solid var(--border)',
                        borderRadius: '6px',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        gap: '1rem',
                      }}
                    >
                      <div style={{ minWidth: 0, flex: 1 }}>
                        <div style={{ fontWeight: 600, fontSize: '0.86rem', color: 'var(--text-primary)' }}>
                          {finding.title}
                        </div>
                        <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.78rem', color: 'var(--text-secondary)', marginTop: '0.2rem' }}>
                          {finding.relative_paths[0]}
                        </div>
                        <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '0.2rem' }}>
                          {finding.explanation}
                        </div>
                      </div>

                      <button
                        className="btn-secondary"
                        onClick={() => handleRenameRedundantExport(finding)}
                        style={{ padding: '0.3rem 0.65rem', fontSize: '0.75rem', display: 'flex', alignItems: 'center', gap: '0.35rem' }}
                      >
                        <FileText size={12} />
                        Propose Clean Rename
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* D. Empty Files Section */}
          {activeCategory === 'empty' && (
            <div>
              {emptyFileFindings.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '3rem 1rem', color: 'var(--text-muted)' }}>
                  <CheckCircle size={36} style={{ color: 'var(--forest-500)', margin: '0 auto 0.5rem' }} />
                  <h4 style={{ fontWeight: 600, color: 'var(--forest-900)' }}>Zero Empty Files</h4>
                  <p style={{ fontSize: '0.82rem' }}>All files in workspace contain non-zero bytes.</p>
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                  {emptyFileFindings.map((finding) => (
                    <div
                      key={finding.finding_id}
                      style={{
                        padding: '0.85rem 1rem',
                        border: '1px solid var(--border)',
                        borderRadius: '6px',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        gap: '1rem',
                      }}
                    >
                      <div style={{ minWidth: 0, flex: 1 }}>
                        <div style={{ fontWeight: 600, fontSize: '0.86rem', color: 'var(--text-primary)' }}>
                          {finding.title}
                        </div>
                        <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.78rem', color: 'var(--text-secondary)', marginTop: '0.2rem' }}>
                          {finding.relative_paths[0]}
                        </div>
                      </div>

                      <button
                        className="btn-secondary"
                        onClick={() => handleArchiveEmptyFile(finding)}
                        style={{ padding: '0.3rem 0.65rem', fontSize: '0.75rem', display: 'flex', alignItems: 'center', gap: '0.35rem' }}
                      >
                        <FolderArchive size={12} />
                        Propose Archive
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
