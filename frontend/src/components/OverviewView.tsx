import React from 'react';
import {
  AlertCircle,
  ArrowRight,
  Bot,
  CheckCircle,
  FileText,
  FolderArchive,
  HardDrive,
  Trash2,
  Zap,
} from 'lucide-react';
import type { HealthStatus, ScanResult } from '../types';

interface OverviewViewProps {
  scanResult: ScanResult | null;
  health: HealthStatus | null;
  onNavigateTab: (tab: 'workspace' | 'overview' | 'forgotten' | 'queue' | 'cleanup' | 'history' | 'settings') => void;
  onSelectFindingForReview?: (findingId: string) => void;
}

export const OverviewView: React.FC<OverviewViewProps> = ({
  scanResult,
  health,
  onNavigateTab,
}) => {
  if (!scanResult) {
    return (
      <div className="panel-card">
        <div className="empty-state">
          <HardDrive className="empty-icon" size={42} />
          <h3 className="empty-title">Workspace Not Scanned Yet</h3>
          <p className="empty-desc">
            Initiate a scan in the Workspace tab to view genuine metrics, storage inventory, and deterministic clutter findings.
          </p>
          <div style={{ marginTop: '1.25rem' }}>
            <button className="btn-primary" onClick={() => onNavigateTab('workspace')}>
              Go to Workspace Scan
              <ArrowRight size={14} />
            </button>
          </div>
        </div>
      </div>
    );
  }

  const inventory = scanResult.inventory_summary;
  const findings = scanResult.deterministic_findings || [];
  const isOllamaUp = health?.ollama_connected && health?.ollama_model_present;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
      {/* 1. Primary Metrics Row */}
      <div className="stat-grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))' }}>
        <div className="stat-card">
          <div className="stat-header">
            <span className="stat-title">Indexed Files</span>
            <FileText size={18} className="stat-icon" />
          </div>
          <div className="stat-value">{scanResult.total_files.toLocaleString()}</div>
          <div className="stat-subtitle">Total files in scanned tree</div>
        </div>

        <div className="stat-card">
          <div className="stat-header">
            <span className="stat-title">Workspace Size</span>
            <HardDrive size={18} className="stat-icon" />
          </div>
          <div className="stat-value">{scanResult.total_size_formatted}</div>
          <div className="stat-subtitle">Total disk storage allocated</div>
        </div>

        <div className="stat-card">
          <div className="stat-header">
            <span className="stat-title">Wasted Duplicate Space</span>
            <Trash2 size={18} className="stat-icon" style={{ color: scanResult.total_wasted_bytes > 0 ? '#b91c1c' : 'inherit' }} />
          </div>
          <div className="stat-value" style={{ color: scanResult.total_wasted_bytes > 0 ? '#b91c1c' : 'inherit' }}>
            {scanResult.total_wasted_formatted}
          </div>
          <div className="stat-subtitle">From byte-identical copies</div>
        </div>

        <div className="stat-card">
          <div className="stat-header">
            <span className="stat-title">Deterministic Findings</span>
            <AlertCircle size={18} className="stat-icon" style={{ color: 'var(--forest-600)' }} />
          </div>
          <div className="stat-value">{findings.length}</div>
          <div className="stat-subtitle">Actionable issues detected</div>
        </div>
      </div>

      {/* 2. Workspace File Inventory Breakdown */}
      <div className="panel-card" style={{ padding: '1.25rem 1.5rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1rem' }}>
          <div>
            <h3 style={{ fontSize: '1.05rem', fontWeight: 700, color: 'var(--forest-900)', margin: 0 }}>
              Storage Breakdown by Category
            </h3>
            <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)', margin: '0.2rem 0 0' }}>
              Measured file types and storage distribution across workspace.
            </p>
          </div>
          <span style={{ fontSize: '0.78rem', color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>
            {scanResult.categories.length} categories identified
          </span>
        </div>

        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
            gap: '0.85rem',
          }}
        >
          {scanResult.categories.map((cat) => (
            <div
              key={cat.category}
              style={{
                padding: '0.75rem 1rem',
                backgroundColor: 'var(--bg-subtle)',
                borderRadius: 'var(--radius-sm)',
                border: '1px solid var(--border-light)',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.25rem' }}>
                <span style={{ fontWeight: 600, fontSize: '0.84rem', textTransform: 'capitalize', color: 'var(--forest-900)' }}>
                  {cat.category}
                </span>
                <span className="badge badge-low" style={{ fontSize: '0.7rem' }}>
                  {cat.count} files
                </span>
              </div>
              <div style={{ fontSize: '1.05rem', fontWeight: 700, color: 'var(--text-main)' }}>
                {cat.total_size_formatted}
              </div>
            </div>
          ))}
        </div>

        {/* Extremes (Oldest, Newest, Largest) */}
        {inventory && (
          <div
            style={{
              marginTop: '1.25rem',
              paddingTop: '1rem',
              borderTop: '1px solid var(--border-light)',
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))',
              gap: '1rem',
              fontSize: '0.82rem',
            }}
          >
            {inventory.oldest_file_relative && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.2rem' }}>
                <span style={{ color: 'var(--text-muted)' }}>Oldest Inactive File:</span>
                <span style={{ fontWeight: 600, fontFamily: 'var(--font-mono)', color: 'var(--text-main)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {inventory.oldest_file_relative}
                </span>
                <span style={{ fontSize: '0.75rem', color: 'var(--forest-700)' }}>
                  Last modified: {inventory.oldest_file_date ? new Date(inventory.oldest_file_date).toLocaleDateString() : 'N/A'}
                </span>
              </div>
            )}

            {inventory.newest_file_relative && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.2rem' }}>
                <span style={{ color: 'var(--text-muted)' }}>Most Recent File:</span>
                <span style={{ fontWeight: 600, fontFamily: 'var(--font-mono)', color: 'var(--text-main)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {inventory.newest_file_relative}
                </span>
                <span style={{ fontSize: '0.75rem', color: 'var(--forest-700)' }}>
                  Last modified: {inventory.newest_file_date ? new Date(inventory.newest_file_date).toLocaleDateString() : 'N/A'}
                </span>
              </div>
            )}

            {inventory.largest_file_relative && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.2rem' }}>
                <span style={{ color: 'var(--text-muted)' }}>Largest Single File:</span>
                <span style={{ fontWeight: 600, fontFamily: 'var(--font-mono)', color: 'var(--text-main)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {inventory.largest_file_relative}
                </span>
                <span style={{ fontSize: '0.75rem', color: 'var(--forest-700)' }}>
                  Size: {inventory.largest_file_size_formatted}
                </span>
              </div>
            )}
          </div>
        )}
      </div>

      {/* 3. Deterministic Findings Highlights */}
      <div className="panel-card" style={{ padding: '1.25rem 1.5rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1rem', flexWrap: 'wrap', gap: '0.5rem' }}>
          <div>
            <h3 style={{ fontSize: '1.05rem', fontWeight: 700, color: 'var(--forest-900)', margin: 0 }}>
              Deterministic Analysis Findings
            </h3>
            <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)', margin: '0.2rem 0 0' }}>
              Rule-based checks executed locally without hallucination. Strict distinction between measured facts and inferred possibilities.
            </p>
          </div>

          <button
            className="btn-secondary"
            onClick={() => onNavigateTab('cleanup')}
            style={{ padding: '0.4rem 0.85rem', fontSize: '0.82rem', display: 'flex', alignItems: 'center', gap: '0.4rem' }}
          >
            <FolderArchive size={14} />
            Review in Cleanup
            <ArrowRight size={12} />
          </button>
        </div>

        {findings.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '1.5rem', color: 'var(--text-muted)', fontSize: '0.85rem' }}>
            <CheckCircle size={28} style={{ color: 'var(--forest-600)', margin: '0 auto 0.4rem' }} />
            No clutter or duplication findings identified in this folder.
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
            {findings.slice(0, 4).map((f) => (
              <div
                key={f.finding_id}
                style={{
                  padding: '0.85rem 1rem',
                  border: '1px solid var(--border)',
                  borderRadius: '6px',
                  background: 'var(--bg-card)',
                  display: 'flex',
                  alignItems: 'flex-start',
                  justifyContent: 'space-between',
                  gap: '1rem',
                }}
              >
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.25rem' }}>
                    <span
                      className="badge"
                      style={{
                        fontSize: '0.7rem',
                        textTransform: 'uppercase',
                        fontWeight: 700,
                        backgroundColor: 'var(--forest-100)',
                        color: 'var(--forest-800)',
                      }}
                    >
                      {f.category.replace('_', ' ')}
                    </span>
                    <strong style={{ fontSize: '0.88rem', color: 'var(--text-primary)' }}>{f.title}</strong>
                  </div>

                  <p style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', margin: '0 0 0.4rem 0' }}>
                    {f.explanation}
                  </p>

                  <div style={{ fontSize: '0.75rem', color: 'var(--forest-700)', display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
                    <strong>Next Step:</strong> {f.recommended_next_step}
                  </div>
                </div>

                {f.storage_impact_bytes > 0 && (
                  <span className="badge badge-high" style={{ flexShrink: 0, fontSize: '0.75rem' }}>
                    Saves {f.storage_impact_formatted}
                  </span>
                )}
              </div>
            ))}

            {findings.length > 4 && (
              <div style={{ textAlign: 'center', paddingTop: '0.25rem' }}>
                <button
                  className="btn-secondary"
                  onClick={() => onNavigateTab('cleanup')}
                  style={{ fontSize: '0.8rem', padding: '0.35rem 0.75rem' }}
                >
                  View All {findings.length} Findings in Cleanup Review &rarr;
                </button>
              </div>
            )}
          </div>
        )}
      </div>

      {/* 4. Local AI Status & Actionable Launchers */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
          gap: '1rem',
        }}
      >
        {/* Local AI Status Card */}
        <div className="panel-card" style={{ padding: '1.25rem 1.5rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', marginBottom: '0.75rem' }}>
            <Bot size={20} style={{ color: 'var(--forest-600)' }} />
            <h4 style={{ fontSize: '0.95rem', fontWeight: 700, color: 'var(--forest-900)', margin: 0 }}>
              Local AI Engine Status
            </h4>
          </div>

          <div style={{ fontSize: '0.82rem', display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span style={{ color: 'var(--text-muted)' }}>Model:</span>
              <strong>{health?.ollama_model || 'qwen2.5:1.5b'}</strong>
            </div>

            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span style={{ color: 'var(--text-muted)' }}>Ollama Connection:</span>
              <span style={{ color: isOllamaUp ? 'var(--forest-700)' : '#b91c1c', fontWeight: 600 }}>
                {isOllamaUp ? 'Connected & Ready' : health?.ollama_connected ? 'Model Missing' : 'Offline'}
              </span>
            </div>

            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span style={{ color: 'var(--text-muted)' }}>Privacy Boundary:</span>
              <span className="badge badge-low" style={{ background: '#dcfce7', color: '#15803d', fontSize: '0.7rem' }}>
                100% On-Device
              </span>
            </div>
          </div>
        </div>

        {/* Actionable Next Steps */}
        <div className="panel-card" style={{ padding: '1.25rem 1.5rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', marginBottom: '0.75rem' }}>
            <Zap size={20} style={{ color: 'var(--forest-600)' }} />
            <h4 style={{ fontSize: '0.95rem', fontWeight: 700, color: 'var(--forest-900)', margin: 0 }}>
              Actionable Workflows
            </h4>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
            <button
              className="btn-primary"
              onClick={() => onNavigateTab('queue')}
              style={{
                width: '100%',
                justifyContent: 'space-between',
                padding: '0.55rem 0.85rem',
                fontSize: '0.84rem',
              }}
            >
              <span>Launch Timed Action Queue</span>
              <ArrowRight size={14} />
            </button>

            <button
              className="btn-secondary"
              onClick={() => onNavigateTab('cleanup')}
              style={{
                width: '100%',
                justifyContent: 'space-between',
                padding: '0.55rem 0.85rem',
                fontSize: '0.84rem',
              }}
            >
              <span>Review Duplicate &amp; Large File Cleanups</span>
              <ArrowRight size={14} />
            </button>

            <button
              className="btn-secondary"
              onClick={() => onNavigateTab('forgotten')}
              style={{
                width: '100%',
                justifyContent: 'space-between',
                padding: '0.55rem 0.85rem',
                fontSize: '0.84rem',
              }}
            >
              <span>Inspect Unfinished Drafts &amp; Projects</span>
              <ArrowRight size={14} />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
