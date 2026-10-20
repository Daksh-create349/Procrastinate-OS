import React, { useState } from 'react';
import type { FindingCategory, FindingSeverity, ScanResult } from '../types';
import {
  ShieldCheck,
  CheckCircle2,
  Lightbulb,
  ArrowRight,
  HardDrive,
  Copy,
  AlertOctagon,
  FileText,
  Clock,
  Layers,
  FileCode,
  FileX,
} from 'lucide-react';

interface DeterministicFindingsViewProps {
  scanResult: ScanResult | null;
}

const CATEGORY_LABELS: Record<FindingCategory, { label: string; icon: React.FC<{ size?: number; className?: string }> }> = {
  exact_duplicate: { label: 'Exact Duplicates', icon: Copy },
  large_file: { label: 'Large Files', icon: HardDrive },
  empty_file: { label: 'Empty Files', icon: FileX },
  redundant_export: { label: 'Redundant Exports', icon: Layers },
  old_file_review: { label: 'Old File Review', icon: Clock },
  unfinished_work: { label: 'Unfinished Work', icon: FileCode },
};

export const DeterministicFindingsView: React.FC<DeterministicFindingsViewProps> = ({ scanResult }) => {
  const [selectedCategory, setSelectedCategory] = useState<FindingCategory | 'all'>('all');
  const [selectedSeverity, setSelectedSeverity] = useState<FindingSeverity | 'all'>('all');
  const [searchQuery, setSearchQuery] = useState('');

  if (!scanResult) {
    return (
      <div className="panel-card">
        <div className="empty-state">
          <ShieldCheck className="empty-icon" size={44} style={{ color: 'var(--forest-600)' }} />
          <h3 className="empty-title">Deterministic Engine Ready</h3>
          <p className="empty-desc">
            Scan a workspace folder to trigger 100% offline, deterministic rule analysis.
            Detects exact duplicates, oversized files, redundant exports, empty stubs, old review candidates, and TODO markers.
          </p>
        </div>
      </div>
    );
  }

  const findings = scanResult.deterministic_findings || [];
  const summary = scanResult.findings_summary;
  const inventory = scanResult.inventory_summary;

  // Filter findings
  const filteredFindings = findings.filter((f) => {
    if (selectedCategory !== 'all' && f.category !== selectedCategory) return false;
    if (selectedSeverity !== 'all' && f.severity !== selectedSeverity) return false;
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      const matchTitle = f.title.toLowerCase().includes(q);
      const matchPaths = f.relative_paths.some((p) => p.toLowerCase().includes(q));
      const matchExpl = f.explanation.toLowerCase().includes(q);
      if (!matchTitle && !matchPaths && !matchExpl) return false;
    }
    return true;
  });

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
      {/* Top Banner: Deterministic Offline Guarantee */}
      <div
        style={{
          padding: '0.9rem 1.25rem',
          backgroundColor: '#f6faf4',
          border: '1px solid var(--forest-200)',
          borderRadius: 'var(--radius-md)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          flexWrap: 'wrap',
          gap: '0.75rem',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem' }}>
          <ShieldCheck size={22} style={{ color: 'var(--forest-600)' }} />
          <div>
            <div style={{ fontWeight: 600, color: 'var(--forest-900)', fontSize: '0.92rem' }}>
              Deterministic File Analysis Engine
            </div>
            <div style={{ fontSize: '0.78rem', color: 'var(--forest-700)' }}>
              100% offline &bull; Zero model hallucination &bull; Ground-truth cryptographic &amp; filesystem rules
            </div>
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
          <span className="badge badge-low" style={{ fontWeight: 600 }}>
            {summary?.total_findings || findings.length} Findings Total
          </span>
          {summary && summary.total_potential_savings_bytes > 0 && (
            <span
              className="badge"
              style={{ backgroundColor: '#e0f2fe', color: '#0369a1', fontWeight: 600 }}
            >
              {summary.total_potential_savings_formatted} Recoverable Space
            </span>
          )}
        </div>
      </div>

      {/* Inventory & Finding Summary Metric Cards */}
      <div className="stat-grid">
        <div className="stat-card">
          <div className="stat-header">
            <span className="stat-title">Flagged Files</span>
            <AlertOctagon size={18} className="stat-icon" />
          </div>
          <div className="stat-value">{summary?.total_files_flagged || 0}</div>
          <div className="stat-subtitle">Across {findings.length} rule matches</div>
        </div>

        <div className="stat-card">
          <div className="stat-header">
            <span className="stat-title">Potential Disk Savings</span>
            <HardDrive size={18} className="stat-icon" />
          </div>
          <div className="stat-value" style={{ color: 'var(--forest-700)' }}>
            {summary?.total_potential_savings_formatted || '0 B'}
          </div>
          <div className="stat-subtitle">Exact duplicates &amp; exports</div>
        </div>

        <div className="stat-card">
          <div className="stat-header">
            <span className="stat-title">Workspace Inventory</span>
            <Layers size={18} className="stat-icon" />
          </div>
          <div className="stat-value">{inventory?.total_files || scanResult.total_files}</div>
          <div className="stat-subtitle">{inventory?.total_size_formatted || scanResult.total_size_formatted} total space</div>
        </div>

        <div className="stat-card">
          <div className="stat-header">
            <span className="stat-title">Unfinished Work Notes</span>
            <FileCode size={18} className="stat-icon" />
          </div>
          <div className="stat-value">
            {summary?.by_category['unfinished_work'] || 0}
          </div>
          <div className="stat-subtitle">Explicit TODOs &amp; FIXMEs</div>
        </div>
      </div>

      {/* Filter Bar */}
      <div className="panel-card" style={{ padding: '0.85rem 1.15rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '0.75rem' }}>
          {/* Category Tabs */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', flexWrap: 'wrap' }}>
            <button
              className={`btn-secondary ${selectedCategory === 'all' ? 'active-filter' : ''}`}
              onClick={() => setSelectedCategory('all')}
              style={{
                fontSize: '0.78rem',
                padding: '0.35rem 0.7rem',
                backgroundColor: selectedCategory === 'all' ? 'var(--forest-100)' : 'transparent',
                borderColor: selectedCategory === 'all' ? 'var(--forest-600)' : 'var(--border-light)',
                color: selectedCategory === 'all' ? 'var(--forest-900)' : 'var(--text-main)',
                fontWeight: selectedCategory === 'all' ? 600 : 400,
              }}
            >
              All Categories ({findings.length})
            </button>

            {(Object.keys(CATEGORY_LABELS) as FindingCategory[]).map((cat) => {
              const count = summary?.by_category[cat] || 0;
              const IconComp = CATEGORY_LABELS[cat].icon;
              const isSelected = selectedCategory === cat;

              return (
                <button
                  key={cat}
                  className={`btn-secondary ${isSelected ? 'active-filter' : ''}`}
                  onClick={() => setSelectedCategory(cat)}
                  style={{
                    fontSize: '0.78rem',
                    padding: '0.35rem 0.7rem',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '0.35rem',
                    backgroundColor: isSelected ? 'var(--forest-100)' : 'transparent',
                    borderColor: isSelected ? 'var(--forest-600)' : 'var(--border-light)',
                    color: isSelected ? 'var(--forest-900)' : 'var(--text-main)',
                    fontWeight: isSelected ? 600 : 400,
                  }}
                >
                  <IconComp size={13} />
                  {CATEGORY_LABELS[cat].label} ({count})
                </button>
              );
            })}
          </div>

          {/* Severity & Search Controls */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
            <select
              value={selectedSeverity}
              onChange={(e) => setSelectedSeverity(e.target.value as FindingSeverity | 'all')}
              className="text-input"
              style={{ padding: '0.35rem 0.65rem', fontSize: '0.78rem', minWidth: 120, cursor: 'pointer' }}
              aria-label="Filter findings by severity"
            >
              <option value="all">All Severities</option>
              <option value="high">High Severity</option>
              <option value="medium">Medium Severity</option>
              <option value="low">Low Severity</option>
              <option value="info">Info</option>
            </select>

            <input
              type="text"
              placeholder="Filter findings..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="text-input"
              style={{ padding: '0.35rem 0.65rem', fontSize: '0.8rem', minWidth: 160 }}
              aria-label="Filter findings by text"
            />
          </div>
        </div>
      </div>

      {/* Findings List */}
      {filteredFindings.length === 0 ? (
        <div className="panel-card" style={{ textAlign: 'center', padding: '3rem 1.5rem', color: 'var(--text-muted)' }}>
          <CheckCircle2 size={36} style={{ color: 'var(--forest-500)', marginBottom: '0.5rem' }} />
          <h4 style={{ color: 'var(--forest-900)', marginBottom: '0.25rem' }}>Zero Matches in Current Filter</h4>
          <p style={{ fontSize: '0.85rem' }}>No deterministic findings match the selected category or search filter.</p>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.9rem' }}>
          {filteredFindings.map((finding) => {
            const CatIcon = CATEGORY_LABELS[finding.category]?.icon || AlertOctagon;
            const severityColor =
              finding.severity === 'high'
                ? '#b91c1c'
                : finding.severity === 'medium'
                ? '#b45309'
                : finding.severity === 'low'
                ? '#0369a1'
                : 'var(--forest-700)';

            const severityBg =
              finding.severity === 'high'
                ? '#fef2f2'
                : finding.severity === 'medium'
                ? '#fffbeb'
                : finding.severity === 'low'
                ? '#f0f9ff'
                : 'var(--forest-50)';

            return (
              <div
                key={finding.finding_id}
                className="panel-card"
                style={{
                  borderLeft: `4px solid ${severityColor}`,
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '0.85rem',
                }}
              >
                {/* Header Row */}
                <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '1rem' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem' }}>
                    <div
                      style={{
                        width: 32,
                        height: 32,
                        borderRadius: 'var(--radius-sm)',
                        backgroundColor: severityBg,
                        color: severityColor,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        flexShrink: 0,
                      }}
                    >
                      <CatIcon size={17} />
                    </div>

                    <div>
                      <h4 style={{ fontSize: '0.96rem', fontWeight: 600, color: 'var(--forest-900)', margin: 0 }}>
                        {finding.title}
                      </h4>
                      <div style={{ fontSize: '0.74rem', color: 'var(--text-muted)', marginTop: '0.15rem' }}>
                        ID: <code style={{ fontFamily: 'var(--font-mono)' }}>{finding.finding_id}</code>
                        &nbsp;&bull;&nbsp; Category: <strong>{finding.category.replace(/_/g, ' ')}</strong>
                      </div>
                    </div>
                  </div>

                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexShrink: 0 }}>
                    <span
                      style={{
                        fontSize: '0.7rem',
                        fontWeight: 700,
                        textTransform: 'uppercase',
                        padding: '0.2rem 0.55rem',
                        borderRadius: 'var(--radius-full)',
                        backgroundColor: severityBg,
                        color: severityColor,
                      }}
                    >
                      {finding.severity}
                    </span>

                    {finding.storage_impact_bytes > 0 && (
                      <span className="badge badge-medium" style={{ fontWeight: 600 }}>
                        {finding.storage_impact_formatted} impact
                      </span>
                    )}
                  </div>
                </div>

                {/* Explanation */}
                <div style={{ fontSize: '0.86rem', color: 'var(--text-main)', lineHeight: 1.5 }}>
                  {finding.explanation}
                </div>

                {/* Supporting Files / Relative Paths */}
                {finding.relative_paths.length > 0 && (
                  <div
                    style={{
                      padding: '0.55rem 0.85rem',
                      backgroundColor: 'var(--bg-subtle)',
                      borderRadius: 'var(--radius-sm)',
                      fontSize: '0.8rem',
                      fontFamily: 'var(--font-mono)',
                      display: 'flex',
                      flexDirection: 'column',
                      gap: '0.25rem',
                    }}
                  >
                    <div style={{ fontWeight: 600, fontSize: '0.72rem', color: 'var(--text-muted)', textTransform: 'uppercase' }}>
                      Associated Workspace Files:
                    </div>
                    {finding.relative_paths.map((p) => (
                      <div key={p} style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                        <FileText size={12} style={{ color: 'var(--forest-600)' }} />
                        <span>{p}</span>
                      </div>
                    ))}
                  </div>
                )}

                {/* Clear Distinction: Measured Facts vs Inferred Possibilities */}
                <div
                  style={{
                    display: 'grid',
                    gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
                    gap: '0.75rem',
                    backgroundColor: '#fafcf9',
                    border: '1px solid var(--border-light)',
                    borderRadius: 'var(--radius-sm)',
                    padding: '0.75rem 0.95rem',
                  }}
                >
                  {/* Measured Facts Column */}
                  <div>
                    <div
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '0.35rem',
                        fontSize: '0.75rem',
                        fontWeight: 700,
                        textTransform: 'uppercase',
                        color: 'var(--forest-800)',
                        marginBottom: '0.4rem',
                      }}
                    >
                      <CheckCircle2 size={13} style={{ color: 'var(--forest-600)' }} />
                      Measured Facts
                    </div>
                    <ul style={{ margin: 0, paddingLeft: '1.1rem', fontSize: '0.8rem', color: 'var(--text-main)', lineHeight: 1.45 }}>
                      {finding.measured_facts.map((fact, idx) => (
                        <li key={idx} style={{ marginBottom: '0.2rem' }}>
                          {fact}
                        </li>
                      ))}
                    </ul>
                  </div>

                  {/* Inferred Possibilities Column */}
                  <div>
                    <div
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '0.35rem',
                        fontSize: '0.75rem',
                        fontWeight: 700,
                        textTransform: 'uppercase',
                        color: '#92400e',
                        marginBottom: '0.4rem',
                      }}
                    >
                      <Lightbulb size={13} style={{ color: '#d97706' }} />
                      Inferred Possibilities
                    </div>
                    <ul style={{ margin: 0, paddingLeft: '1.1rem', fontSize: '0.8rem', color: 'var(--text-main)', lineHeight: 1.45 }}>
                      {finding.inferred_possibilities.map((pos, idx) => (
                        <li key={idx} style={{ marginBottom: '0.2rem' }}>
                          {pos}
                        </li>
                      ))}
                    </ul>
                  </div>
                </div>

                {/* Recommended Next Step Box */}
                <div
                  style={{
                    padding: '0.65rem 0.9rem',
                    backgroundColor: 'var(--forest-50)',
                    border: '1px solid var(--forest-100)',
                    borderRadius: 'var(--radius-sm)',
                    display: 'flex',
                    alignItems: 'flex-start',
                    gap: '0.55rem',
                    fontSize: '0.82rem',
                    color: 'var(--forest-900)',
                  }}
                >
                  <ArrowRight size={15} style={{ color: 'var(--forest-600)', flexShrink: 0, marginTop: 2 }} />
                  <div>
                    <strong>Recommended Next Step: </strong>
                    {finding.recommended_next_step}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};
