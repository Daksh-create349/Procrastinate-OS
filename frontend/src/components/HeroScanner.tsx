import React, { useState } from 'react';
import {
  FolderSearch,
  Sparkles,
  Folder,
  ArrowRight,
  FolderOpen,
  StopCircle,
  HardDrive,
  FileCheck,
} from 'lucide-react';
import type { ScanProgress } from '../types';
import { pickFolderNative } from '../api/client';

interface HeroScannerProps {
  folderPath: string;
  setFolderPath: (path: string) => void;
  onScan: () => void;
  onCancelScan?: () => void;
  onGenerateQueue: () => void;
  isScanning: boolean;
  isGeneratingQueue: boolean;
  scanProgress: ScanProgress | null;
}

export const HeroScanner: React.FC<HeroScannerProps> = ({
  folderPath,
  setFolderPath,
  onScan,
  onCancelScan,
  onGenerateQueue,
  isScanning,
  isGeneratingQueue,
  scanProgress,
}) => {
  const [pickingFolder, setPickingFolder] = useState(false);

  const suggestions = [
    { label: 'This Repository', path: '/Users/dakshsrivastava/Desktop/Procrastinate OS' },
    { label: 'Downloads', path: '/Users/dakshsrivastava/Downloads' },
    { label: 'Desktop', path: '/Users/dakshsrivastava/Desktop' },
    { label: 'Documents', path: '/Users/dakshsrivastava/Documents' },
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

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (folderPath.trim() && !isScanning) {
      onScan();
    }
  };

  return (
    <section className="hero-banner">
      <div className="hero-badge">
        <Sparkles size={13} />
        Local-First AI Organization
      </div>
      <h2 className="hero-heading">Turn digital chaos into clarity.</h2>
      <p className="hero-description">
        Choose any folder on your computer. Your local AI will inspect cluttered files, discover forgotten half-finished drafts, detect byte-identical duplicates, and assemble an actionable queue without any cloud upload.
      </p>

      <form onSubmit={handleSubmit} className="scanner-bar" style={{ maxWidth: '840px' }}>
        <div className="input-wrapper">
          <Folder className="input-icon" size={18} />
          <input
            type="text"
            className="text-input"
            value={folderPath}
            onChange={(e) => setFolderPath(e.target.value)}
            placeholder="Enter absolute folder path or click Browse..."
            required
            aria-label="Folder Path Input"
            disabled={isScanning}
          />
        </div>

        <button
          type="button"
          className="btn-secondary"
          onClick={handleNativePick}
          disabled={isScanning || pickingFolder}
          title="Open native macOS folder picker dialog"
          id="browse-folder-btn"
          style={{ whiteSpace: 'nowrap' }}
        >
          <FolderOpen size={16} />
          {pickingFolder ? 'Selecting...' : 'Browse...'}
        </button>

        {!isScanning ? (
          <button
            type="submit"
            className="btn-primary"
            disabled={!folderPath.trim()}
            id="scan-folder-btn"
            style={{ whiteSpace: 'nowrap' }}
          >
            <FolderSearch size={17} />
            Scan Folder
          </button>
        ) : (
          <button
            type="button"
            className="btn-secondary"
            onClick={onCancelScan}
            style={{
              color: '#b91c1c',
              borderColor: '#f87171',
              backgroundColor: '#fef2f2',
              whiteSpace: 'nowrap',
            }}
            id="cancel-scan-btn"
          >
            <StopCircle size={17} />
            Stop Scan
          </button>
        )}

        <button
          type="button"
          className="btn-secondary"
          onClick={onGenerateQueue}
          disabled={isGeneratingQueue || isScanning || !folderPath.trim()}
          id="generate-queue-btn"
          style={{ whiteSpace: 'nowrap' }}
        >
          <Sparkles size={17} style={{ color: 'var(--forest-600)' }} />
          {isGeneratingQueue ? 'Thinking...' : 'AI Plan'}
        </button>
      </form>

      {/* Quick paths */}
      <div style={{ marginTop: '0.85rem', display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
        <span style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>Quick paths:</span>
        {suggestions.map((item) => (
          <button
            key={item.label}
            type="button"
            onClick={() => setFolderPath(item.path)}
            disabled={isScanning}
            style={{
              fontSize: '0.76rem',
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

      {/* Real-time Scan Progress Bar & Card */}
      {isScanning && scanProgress && (
        <div
          style={{
            marginTop: '1.5rem',
            padding: '1.25rem',
            backgroundColor: '#ffffff',
            border: '1px solid var(--forest-500)',
            borderRadius: 'var(--radius-md)',
            boxShadow: 'var(--shadow-sm)',
          }}
          data-testid="scan-progress-card"
        >
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              marginBottom: '0.65rem',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
              <span className="pulse-dot" />
              <strong style={{ fontSize: '0.92rem', color: 'var(--forest-900)' }}>
                Scanning directory safely...
              </strong>
            </div>
            <span style={{ fontSize: '0.82rem', color: 'var(--text-muted)' }}>
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
              marginBottom: '0.75rem',
            }}
          >
            <div
              style={{
                height: '100%',
                width: '100%',
                backgroundColor: 'var(--forest-600)',
                animation: 'pulse 1.5s infinite ease-in-out',
              }}
            />
          </div>

          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '1.5rem',
              fontSize: '0.82rem',
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
                  maxWidth: '360px',
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
    </section>
  );
};
