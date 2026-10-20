import React, { useState } from 'react';
import {
  ArrowRight,
  CheckCircle,
  FileCheck,
  Folder,
  FolderOpen,
  FolderSearch,
  HardDrive,
  Info,
  ShieldCheck,
  StopCircle,
} from 'lucide-react';
import type { ScanProgress, ScanResult, SkippedFile } from '../types';
import { pickFolderNative } from '../api/client';

interface WorkspaceViewProps {
  folderPath: string;
  setFolderPath: (path: string) => void;
  onScan: () => void;
  onCancelScan?: () => void;
  isScanning: boolean;
  scanProgress: ScanProgress | null;
  scanResult: ScanResult | null;
  scanLimits: {
    maxDepth: number;
    maxFiles: number;
    includeHidden: boolean;
    computeHashes: boolean;
    extractDocuments: boolean;
  };
  onUpdateLimits: (limits: Partial<WorkspaceViewProps['scanLimits']>) => void;
}

export const WorkspaceView: React.FC<WorkspaceViewProps> = ({
  folderPath,
  setFolderPath,
  onScan,
  onCancelScan,
  isScanning,
  scanProgress,
  scanResult,
  scanLimits,
  onUpdateLimits,
}) => {
  const [pickingFolder, setPickingFolder] = useState(false);
  const [skippedFilter, setSkippedFilter] = useState<string>('all');

  const suggestions = [
    { label: 'This Repository', path: '/Users/dakshsrivastava/Desktop/Procrastinate OS' },
    { label: 'Desktop', path: '/Users/dakshsrivastava/Desktop' },
    { label: 'Documents', path: '/Users/dakshsrivastava/Documents' },
    { label: 'Downloads', path: '/Users/dakshsrivastava/Downloads' },
  ];

  const handleNativePick = async () => {
    setPickingFolder(true);
    try {
      const res = await pickFolderNative();
      if (res.selected_path) {
        setFolderPath(res.selected_path);
      }
    } catch (err) {
      console.warn('Native picker error:', err);
    } finally {
      setPickingFolder(false);
    }
  };

  const skippedFiles: SkippedFile[] = scanResult?.skipped_files || [];
  const filteredSkipped = skippedFiles.filter((f) => {
    if (skippedFilter === 'all') return true;
    return f.error_type === skippedFilter;
  });

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
      {/* 1. Folder Selection Card */}
      <div className="panel-card" style={{ padding: '1.5rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1rem' }}>
          <div>
            <h3 style={{ fontSize: '1.15rem', fontWeight: 700, color: 'var(--forest-900)', margin: 0 }}>
              Select Local Workspace
            </h3>
            <p style={{ fontSize: '0.82rem', color: 'var(--text-muted)', margin: '0.25rem 0 0' }}>
              Choose a persistent directory on your local filesystem. ProcrastinateOS scans only within this root boundary.
            </p>
          </div>
          <span
            className="badge badge-low"
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '0.35rem',
              background: 'var(--forest-50)',
              color: 'var(--forest-800)',
              border: '1px solid var(--forest-200)',
            }}
          >
            <ShieldCheck size={13} />
            Isolated Traversal
          </span>
        </div>

        <div style={{ display: 'flex', gap: '0.6rem', alignItems: 'center', flexWrap: 'wrap' }}>
          <div style={{ flex: 1, minWidth: '280px', position: 'relative' }}>
            <input
              type="text"
              className="text-input"
              value={folderPath}
              onChange={(e) => setFolderPath(e.target.value)}
              placeholder="Enter absolute workspace path (e.g. /Users/name/Projects/MyFolder)"
              disabled={isScanning}
              style={{
                width: '100%',
                padding: '0.65rem 0.85rem 0.65rem 2.4rem',
                fontFamily: 'var(--font-mono)',
                fontSize: '0.88rem',
                border: '1px solid var(--border-medium)',
                borderRadius: 'var(--radius-sm)',
                backgroundColor: isScanning ? 'var(--bg-subtle)' : '#ffffff',
              }}
            />
            <Folder
              size={16}
              style={{
                position: 'absolute',
                left: '0.85rem',
                top: '50%',
                transform: 'translateY(-50%)',
                color: 'var(--forest-600)',
              }}
            />
          </div>

          <button
            type="button"
            className="btn-secondary"
            onClick={handleNativePick}
            disabled={isScanning || pickingFolder}
            style={{ padding: '0.65rem 1rem', display: 'flex', alignItems: 'center', gap: '0.45rem', fontSize: '0.88rem' }}
          >
            <FolderOpen size={16} />
            {pickingFolder ? 'Opening Dialog...' : 'Browse Native...'}
          </button>

          {!isScanning ? (
            <button
              type="button"
              className="btn-primary"
              onClick={onScan}
              disabled={!folderPath.trim()}
              style={{
                padding: '0.65rem 1.25rem',
                display: 'flex',
                alignItems: 'center',
                gap: '0.45rem',
                fontSize: '0.88rem',
                fontWeight: 600,
              }}
              id="start-scan-btn"
            >
              <FolderSearch size={16} />
              Start Workspace Scan
            </button>
          ) : (
            <button
              type="button"
              className="btn-secondary"
              onClick={onCancelScan}
              style={{
                padding: '0.65rem 1.25rem',
                color: '#b91c1c',
                borderColor: '#fca5a5',
                backgroundColor: '#fef2f2',
                display: 'flex',
                alignItems: 'center',
                gap: '0.45rem',
                fontSize: '0.88rem',
              }}
              id="cancel-scan-btn"
            >
              <StopCircle size={16} />
              Cancel Scan
            </button>
          )}
        </div>

        {/* Quick Presets */}
        <div style={{ marginTop: '0.85rem', display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
          <span style={{ fontSize: '0.76rem', color: 'var(--text-muted)' }}>Quick Presets:</span>
          {suggestions.map((item) => (
            <button
              key={item.label}
              type="button"
              onClick={() => setFolderPath(item.path)}
              disabled={isScanning}
              style={{
                fontSize: '0.75rem',
                color: 'var(--forest-800)',
                backgroundColor: 'var(--bg-subtle)',
                border: '1px solid var(--border-light)',
                borderRadius: 'var(--radius-full)',
                padding: '0.2rem 0.6rem',
                cursor: isScanning ? 'not-allowed' : 'pointer',
                display: 'inline-flex',
                alignItems: 'center',
                gap: '0.25rem',
              }}
            >
              {item.label}
              <ArrowRight size={10} />
            </button>
          ))}
        </div>
      </div>

      {/* 2. Scan Scope & Safety Boundaries */}
      <div className="panel-card" style={{ padding: '1.25rem 1.5rem' }}>
        <h4 style={{ fontSize: '0.95rem', fontWeight: 700, color: 'var(--forest-900)', margin: '0 0 0.75rem 0' }}>
          Scan Scope &amp; Safety Controls
        </h4>
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
            gap: '1rem',
            fontSize: '0.82rem',
          }}
        >
          {/* Depth Limit */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.3rem' }}>
            <label style={{ fontWeight: 600, color: 'var(--text-secondary)' }}>
              Max Directory Depth: <strong>{scanLimits.maxDepth} levels</strong>
            </label>
            <input
              type="range"
              min={1}
              max={30}
              value={scanLimits.maxDepth}
              disabled={isScanning}
              onChange={(e) => onUpdateLimits({ maxDepth: parseInt(e.target.value, 10) })}
            />
            <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>
              Prevents endless recursion in deep directory hierarchies.
            </span>
          </div>

          {/* Max Files Limit */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.3rem' }}>
            <label style={{ fontWeight: 600, color: 'var(--text-secondary)' }}>
              Max File Cap: <strong>{scanLimits.maxFiles.toLocaleString()} files</strong>
            </label>
            <select
              value={scanLimits.maxFiles}
              disabled={isScanning}
              onChange={(e) => onUpdateLimits({ maxFiles: parseInt(e.target.value, 10) })}
              style={{
                padding: '0.35rem 0.5rem',
                border: '1px solid var(--border-medium)',
                borderRadius: 'var(--radius-sm)',
                fontSize: '0.82rem',
              }}
            >
              <option value={5000}>5,000 files (Fast)</option>
              <option value={20000}>20,000 files (Standard)</option>
              <option value={50000}>50,000 files (Comprehensive)</option>
              <option value={100000}>100,000 files (Large Workspace)</option>
            </select>
            <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>
              Safety ceiling preventing runaway indexing.
            </span>
          </div>

          {/* Checkboxes: Hash, Extract, Hidden */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: '0.45rem', cursor: 'pointer' }}>
              <input
                type="checkbox"
                checked={scanLimits.computeHashes}
                disabled={isScanning}
                onChange={(e) => onUpdateLimits({ computeHashes: e.target.checked })}
              />
              <span>SHA-256 Duplicate Checksums</span>
            </label>

            <label style={{ display: 'flex', alignItems: 'center', gap: '0.45rem', cursor: 'pointer' }}>
              <input
                type="checkbox"
                checked={scanLimits.extractDocuments}
                disabled={isScanning}
                onChange={(e) => onUpdateLimits({ extractDocuments: e.target.checked })}
              />
              <span>Bounded Document Text Extraction</span>
            </label>

            <label style={{ display: 'flex', alignItems: 'center', gap: '0.45rem', cursor: 'pointer' }}>
              <input
                type="checkbox"
                checked={scanLimits.includeHidden}
                disabled={isScanning}
                onChange={(e) => onUpdateLimits({ includeHidden: e.target.checked })}
              />
              <span>Include Hidden Files (.git, etc. excluded)</span>
            </label>
          </div>
        </div>

        {/* Security Disclaimers */}
        <div
          style={{
            marginTop: '1rem',
            padding: '0.65rem 0.85rem',
            background: 'var(--bg-subtle)',
            borderRadius: 'var(--radius-sm)',
            fontSize: '0.76rem',
            color: 'var(--text-secondary)',
            display: 'flex',
            alignItems: 'center',
            gap: '0.5rem',
          }}
        >
          <Info size={14} style={{ color: 'var(--forest-600)', flexShrink: 0 }} />
          <span>
            <strong>Read-only traversal:</strong> No files are modified or moved during a scan. Symlinks resolving outside this folder are skipped to prevent path traversal leaks.
          </span>
        </div>
      </div>

      {/* 3. Live Progress Display */}
      {isScanning && scanProgress && (
        <div
          className="panel-card"
          style={{
            padding: '1.25rem 1.5rem',
            border: '1px solid var(--forest-600)',
            backgroundColor: '#ffffff',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.75rem' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
              <span className="pulse-dot" />
              <strong style={{ fontSize: '0.95rem', color: 'var(--forest-900)' }}>
                Scanning Workspace Recursively...
              </strong>
            </div>
            <span style={{ fontSize: '0.82rem', color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>
              Elapsed: {scanProgress.elapsed_seconds.toFixed(1)}s
            </span>
          </div>

          <div
            style={{
              height: 6,
              width: '100%',
              backgroundColor: 'var(--bg-muted)',
              borderRadius: 3,
              overflow: 'hidden',
              marginBottom: '0.85rem',
            }}
          >
            <div
              style={{
                height: '100%',
                width: '100%',
                backgroundColor: 'var(--forest-600)',
                animation: 'pulse 1.2s infinite ease-in-out',
              }}
            />
          </div>

          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '1.5rem',
              fontSize: '0.84rem',
              color: 'var(--text-secondary)',
              flexWrap: 'wrap',
            }}
          >
            <span style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
              <FileCheck size={14} style={{ color: 'var(--forest-600)' }} />
              <strong>{scanProgress.files_scanned.toLocaleString()}</strong> files indexed
            </span>

            <span style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
              <HardDrive size={14} style={{ color: 'var(--forest-600)' }} />
              <strong>{scanProgress.bytes_scanned_formatted}</strong> processed
            </span>

            {scanProgress.current_directory && (
              <span
                style={{
                  fontFamily: 'var(--font-mono)',
                  fontSize: '0.75rem',
                  color: 'var(--text-muted)',
                  maxWidth: '380px',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                }}
                title={scanProgress.current_directory}
              >
                In: {scanProgress.current_directory}
              </span>
            )}
          </div>
        </div>
      )}

      {/* 4. Scan Results & Skipped Files / Error Log */}
      {scanResult && !isScanning && (
        <div className="panel-card" style={{ padding: '1.25rem 1.5rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1rem', flexWrap: 'wrap', gap: '0.5rem' }}>
            <div>
              <h4 style={{ fontSize: '1rem', fontWeight: 700, color: 'var(--forest-900)', margin: 0 }}>
                Scan Scope &amp; Traversal Diagnostics
              </h4>
              <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)', margin: '0.2rem 0 0' }}>
                Completed in {scanResult.duration_seconds.toFixed(2)}s &bull; Root: <code>{scanResult.root_path}</code>
              </p>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <span className="badge badge-low" style={{ background: '#dcfce7', color: '#15803d' }}>
                {scanResult.total_files.toLocaleString()} Files Indexed
              </span>
              <span className="badge badge-medium">
                {scanResult.total_size_formatted} Total Size
              </span>
              {skippedFiles.length > 0 && (
                <span className="badge badge-high" style={{ background: '#fee2e2', color: '#991b1b' }}>
                  {skippedFiles.length} Skipped / Errors
                </span>
              )}
            </div>
          </div>

          {/* Skipped Files Filter and Table */}
          {skippedFiles.length > 0 ? (
            <div style={{ marginTop: '1rem' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.6rem' }}>
                <span style={{ fontSize: '0.82rem', fontWeight: 600, color: 'var(--text-secondary)' }}>
                  Files Skipped During Traversal:
                </span>

                <div style={{ display: 'flex', gap: '0.4rem', fontSize: '0.75rem' }}>
                  {['all', 'permission_denied', 'symlink_external', 'size_limit'].map((f) => (
                    <button
                      key={f}
                      onClick={() => setSkippedFilter(f)}
                      style={{
                        padding: '0.2rem 0.5rem',
                        borderRadius: '4px',
                        border: '1px solid var(--border)',
                        background: skippedFilter === f ? 'var(--forest-600)' : 'transparent',
                        color: skippedFilter === f ? '#fff' : 'var(--text-muted)',
                        cursor: 'pointer',
                        textTransform: 'capitalize',
                      }}
                    >
                      {f.replace('_', ' ')}
                    </button>
                  ))}
                </div>
              </div>

              <div
                style={{
                  maxHeight: '260px',
                  overflowY: 'auto',
                  border: '1px solid var(--border)',
                  borderRadius: '6px',
                  fontSize: '0.78rem',
                }}
              >
                {filteredSkipped.map((sf, idx) => (
                  <div
                    key={idx}
                    style={{
                      padding: '0.55rem 0.85rem',
                      borderBottom: '1px solid var(--border-light)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      gap: '0.75rem',
                      background: idx % 2 === 0 ? 'var(--bg-canvas)' : '#fff',
                    }}
                  >
                    <div style={{ minWidth: 0, flex: 1 }}>
                      <div style={{ fontFamily: 'var(--font-mono)', color: 'var(--text-main)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {sf.relative_path || sf.path}
                      </div>
                      <div style={{ color: 'var(--text-muted)', fontSize: '0.72rem', marginTop: '0.15rem' }}>
                        Reason: {sf.reason}
                      </div>
                    </div>

                    <span
                      style={{
                        padding: '0.15rem 0.4rem',
                        borderRadius: '3px',
                        fontSize: '0.7rem',
                        fontWeight: 600,
                        backgroundColor: '#fee2e2',
                        color: '#991b1b',
                        whiteSpace: 'nowrap',
                      }}
                    >
                      {sf.error_type}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <div
              style={{
                marginTop: '0.75rem',
                padding: '0.85rem',
                background: 'var(--bg-subtle)',
                borderRadius: '6px',
                fontSize: '0.82rem',
                color: 'var(--forest-800)',
                display: 'flex',
                alignItems: 'center',
                gap: '0.5rem',
              }}
            >
              <CheckCircle size={15} style={{ color: 'var(--forest-600)' }} />
              <span>Zero scan errors. 100% of workspace files were safely indexed without skips or permission faults.</span>
            </div>
          )}
        </div>
      )}
    </div>
  );
};
