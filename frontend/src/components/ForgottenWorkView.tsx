import React, { useState } from 'react';
import type { ForgottenWorkItem, ScanResult, SemanticProjectGroup } from '../types';
import {
  History,
  FileQuestion,
  Sparkles,
  Layers,
  FileText,
  AlertCircle,
  HelpCircle,
  FileEdit,
  ArrowRight,
  ShieldCheck,
  Bookmark,
} from 'lucide-react';
import { fetchForgottenWorkRecovery, fetchSemanticProjectGroups } from '../api/client';

interface ForgottenWorkViewProps {
  scanResult: ScanResult | null;
  onSelectFileForAI: (filePath: string) => void;
}

export const ForgottenWorkView: React.FC<ForgottenWorkViewProps> = ({
  scanResult,
  onSelectFileForAI,
}) => {
  const [subTab, setSubTab] = useState<'recovery' | 'grouping'>('recovery');
  const [aiItems, setAiItems] = useState<ForgottenWorkItem[]>([]);
  const [semanticGroups, setSemanticGroups] = useState<SemanticProjectGroup[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [fixSuggestion, setFixSuggestion] = useState<string | null>(null);
  const [modelUsed, setModelUsed] = useState<string>('qwen2.5:1.5b');
  const [lastAnalyzedAt, setLastAnalyzedAt] = useState<string | null>(null);

  if (!scanResult) {
    return (
      <div className="panel-card">
        <div className="empty-state">
          <History className="empty-icon" size={42} />
          <h3 className="empty-title">Forgotten Work &amp; Project Recovery</h3>
          <p className="empty-desc">
            Scan a workspace folder to discover unfinished drafts, unresolved questions, and semantically grouped project materials via local AI.
          </p>
        </div>
      </div>
    );
  }

  // Handle triggering AI Forgotten-Work Recovery
  const handleRunRecovery = async () => {
    setIsLoading(true);
    setErrorMessage(null);
    setFixSuggestion(null);

    try {
      const res = await fetchForgottenWorkRecovery(scanResult.root_path, 'qwen2.5:1.5b');
      if (res.status === 'model_unavailable' || res.error_message) {
        setErrorMessage(res.error_message || 'Local AI model unavailable.');
        setFixSuggestion(res.fix_suggestion || null);
      }
      setAiItems(res.items || []);
      setModelUsed(res.model_used);
      setLastAnalyzedAt(new Date().toLocaleTimeString());
    } catch (err: any) {
      setErrorMessage(err.message || 'Forgotten work recovery failed.');
    } finally {
      setIsLoading(false);
    }
  };

  // Handle triggering AI Semantic Project Grouping
  const handleRunGrouping = async () => {
    setIsLoading(true);
    setErrorMessage(null);
    setFixSuggestion(null);

    try {
      const res = await fetchSemanticProjectGroups(scanResult.root_path, 'qwen2.5:1.5b');
      if (res.status === 'model_unavailable' || res.error_message) {
        setErrorMessage(res.error_message || 'Local AI model unavailable.');
        setFixSuggestion(res.fix_suggestion || null);
      }
      setSemanticGroups(res.groups || []);
      setModelUsed(res.model_used);
      setLastAnalyzedAt(new Date().toLocaleTimeString());
    } catch (err: any) {
      setErrorMessage(err.message || 'Semantic project grouping failed.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
      {/* Top AI Action Bar */}
      <div className="panel-card" style={{ padding: '1rem 1.25rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '1rem' }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <Sparkles size={18} style={{ color: 'var(--forest-600)' }} />
              <h3 style={{ fontSize: '1.02rem', fontWeight: 700, color: 'var(--forest-900)', margin: 0 }}>
                Local AI Intelligence: {modelUsed}
              </h3>
            </div>
            <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)', marginTop: '0.2rem' }}>
              100% on-device inference via Ollama. Untrusted document contents sanitized; paths strictly backend-resolved.
              {lastAnalyzedAt && <span style={{ marginLeft: '0.4rem', color: 'var(--forest-600)' }}>&bull; Last run: {lastAnalyzedAt}</span>}
            </div>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <button
              className="btn-primary"
              onClick={subTab === 'recovery' ? handleRunRecovery : handleRunGrouping}
              disabled={isLoading}
              style={{ padding: '0.45rem 1rem', fontSize: '0.82rem', display: 'flex', alignItems: 'center', gap: '0.4rem' }}
            >
              <Sparkles size={14} />
              {isLoading
                ? 'Analyzing...'
                : subTab === 'recovery'
                ? 'Recover Forgotten Work'
                : 'Discover Project Groups'}
            </button>
          </div>
        </div>

        {/* Offline / Error Banner with Fix Instructions */}
        {errorMessage && (
          <div
            style={{
              marginTop: '1rem',
              padding: '0.85rem 1rem',
              backgroundColor: '#fffbeb',
              border: '1px solid #fde68a',
              borderRadius: 'var(--radius-sm)',
              fontSize: '0.82rem',
              color: '#92400e',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', fontWeight: 600 }}>
              <AlertCircle size={15} />
              <span>AI Service Notice: {errorMessage}</span>
            </div>
            {fixSuggestion && (
              <div style={{ marginTop: '0.35rem', color: '#78350f', fontFamily: 'var(--font-mono)', fontSize: '0.78rem' }}>
                💡 Fix: {fixSuggestion}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Sub-tab Navigation */}
      <div style={{ display: 'flex', gap: '0.5rem' }}>
        <button
          className={`tab-btn ${subTab === 'recovery' ? 'active' : ''}`}
          onClick={() => setSubTab('recovery')}
          style={{ padding: '0.5rem 1rem', fontSize: '0.85rem', display: 'flex', alignItems: 'center', gap: '0.4rem' }}
        >
          <History size={15} />
          Forgotten Work &amp; Drafts ({aiItems.length})
        </button>

        <button
          className={`tab-btn ${subTab === 'grouping' ? 'active' : ''}`}
          onClick={() => setSubTab('grouping')}
          style={{ padding: '0.5rem 1rem', fontSize: '0.85rem', display: 'flex', alignItems: 'center', gap: '0.4rem' }}
        >
          <Layers size={15} />
          Semantic Project Groups ({semanticGroups.length})
        </button>
      </div>

      {/* Tab Panel 1: Forgotten-Work Recovery */}
      {subTab === 'recovery' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          {/* Policy Banner */}
          <div
            style={{
              padding: '0.75rem 1rem',
              backgroundColor: '#f6faf4',
              border: '1px solid var(--forest-200)',
              borderRadius: 'var(--radius-sm)',
              fontSize: '0.8rem',
              color: 'var(--forest-800)',
              display: 'flex',
              alignItems: 'center',
              gap: '0.5rem',
            }}
          >
            <ShieldCheck size={16} style={{ color: 'var(--forest-600)', flexShrink: 0 }} />
            <span>
              <strong>Objective Analysis:</strong> Work items are identified strictly by explicit textual evidence
              (TODOs, unresolved questions, incomplete draft sections). Inactivity age alone is never treated as abandonment.
            </span>
          </div>

          {aiItems.length === 0 ? (
            <div className="panel-card" style={{ textAlign: 'center', padding: '3rem 1.5rem', color: 'var(--text-muted)' }}>
              <FileQuestion size={36} style={{ color: 'var(--sage-400)', margin: '0 auto 0.5rem' }} />
              <h4 style={{ color: 'var(--forest-900)', marginBottom: '0.35rem' }}>No AI Items Loaded Yet</h4>
              <p style={{ fontSize: '0.85rem' }}>
                Click <strong>Recover Forgotten Work</strong> above to run local <code>qwen2.5:1.5b</code> text extraction
                across workspace documents.
              </p>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.85rem' }}>
              {aiItems.map((item) => {
                const typeIcon =
                  item.task_type === 'unresolved_question' ? (
                    <HelpCircle size={15} style={{ color: '#d97706' }} />
                  ) : item.task_type === 'incomplete_draft' ? (
                    <FileEdit size={15} style={{ color: '#7c3aed' }} />
                  ) : (
                    <Bookmark size={15} style={{ color: 'var(--forest-600)' }} />
                  );

                return (
                  <div
                    key={item.item_id}
                    className="panel-card"
                    style={{
                      borderLeft: '4px solid var(--forest-600)',
                      display: 'flex',
                      flexDirection: 'column',
                      gap: '0.65rem',
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '1rem' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                        {typeIcon}
                        <h4 style={{ margin: 0, fontSize: '0.94rem', fontWeight: 600, color: 'var(--forest-900)' }}>
                          {item.title}
                        </h4>
                      </div>

                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.45rem' }}>
                        <span
                          style={{
                            fontSize: '0.68rem',
                            fontWeight: 700,
                            textTransform: 'uppercase',
                            padding: '0.15rem 0.5rem',
                            borderRadius: 'var(--radius-full)',
                            backgroundColor: 'var(--bg-subtle)',
                            color: 'var(--forest-800)',
                          }}
                        >
                          {item.task_type.replace(/_/g, ' ')}
                        </span>
                      </div>
                    </div>

                    <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>
                      Location: <code style={{ fontFamily: 'var(--font-mono)' }}>{item.relative_path}</code>
                      {item.section_reference && <span> &bull; Ref: {item.section_reference}</span>}
                    </div>

                    {/* Evidence Quote */}
                    <div
                      style={{
                        padding: '0.55rem 0.85rem',
                        backgroundColor: '#fafcf9',
                        borderLeft: '3px solid var(--forest-400)',
                        borderRadius: '0 var(--radius-sm) var(--radius-sm) 0',
                        fontStyle: 'italic',
                        fontSize: '0.82rem',
                        color: 'var(--text-secondary)',
                      }}
                    >
                      &ldquo;{item.evidence_excerpt}&rdquo;
                    </div>

                    {/* Suggested Action */}
                    <div
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        padding: '0.5rem 0.8rem',
                        backgroundColor: 'var(--bg-subtle)',
                        borderRadius: 'var(--radius-sm)',
                        fontSize: '0.8rem',
                        color: 'var(--forest-900)',
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                        <ArrowRight size={13} style={{ color: 'var(--forest-600)' }} />
                        <span>
                          <strong>Suggested Action:</strong> {item.suggested_action}
                        </span>
                      </div>

                      <button
                        className="btn-secondary"
                        onClick={() => onSelectFileForAI(item.relative_path)}
                        style={{ padding: '0.25rem 0.55rem', fontSize: '0.72rem' }}
                      >
                        Ask AI
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* Tab Panel 2: Semantic Project Grouping */}
      {subTab === 'grouping' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          {semanticGroups.length === 0 ? (
            <div className="panel-card" style={{ textAlign: 'center', padding: '3rem 1.5rem', color: 'var(--text-muted)' }}>
              <Layers size={36} style={{ color: 'var(--sage-400)', margin: '0 auto 0.5rem' }} />
              <h4 style={{ color: 'var(--forest-900)', marginBottom: '0.35rem' }}>No Semantic Clusters Generated Yet</h4>
              <p style={{ fontSize: '0.85rem' }}>
                Click <strong>Discover Project Groups</strong> above to have <code>qwen2.5:1.5b</code> find related documents
                across folders, even when their filenames differ.
              </p>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.85rem' }}>
              {semanticGroups.map((group) => {
                const confColor =
                  group.confidence === 'high'
                    ? 'var(--forest-800)'
                    : group.confidence === 'medium'
                    ? '#0369a1'
                    : '#92400e';

                return (
                  <div
                    key={group.group_id}
                    className="panel-card"
                    style={{
                      borderLeft: '4px solid #2563eb',
                      display: 'flex',
                      flexDirection: 'column',
                      gap: '0.7rem',
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '1rem' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                        <Layers size={16} style={{ color: '#2563eb' }} />
                        <h4 style={{ margin: 0, fontSize: '0.96rem', fontWeight: 600, color: 'var(--forest-900)' }}>
                          {group.project_name}
                        </h4>
                      </div>

                      <span
                        style={{
                          fontSize: '0.68rem',
                          fontWeight: 700,
                          textTransform: 'uppercase',
                          padding: '0.15rem 0.5rem',
                          borderRadius: 'var(--radius-full)',
                          backgroundColor: '#eff6ff',
                          color: confColor,
                        }}
                      >
                        {group.confidence} Confidence
                      </span>
                    </div>

                    <div style={{ fontSize: '0.84rem', color: 'var(--text-main)', lineHeight: 1.45 }}>
                      <strong>Theme: </strong>
                      {group.theme_summary}
                    </div>

                    {/* Evidence Quote */}
                    <div
                      style={{
                        padding: '0.55rem 0.85rem',
                        backgroundColor: '#f8fafc',
                        border: '1px solid #e2e8f0',
                        borderRadius: 'var(--radius-sm)',
                        fontSize: '0.8rem',
                        color: 'var(--text-secondary)',
                      }}
                    >
                      <strong>Evidence: </strong>
                      {group.evidence}
                    </div>

                    {/* Member Files */}
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem', marginTop: '0.2rem' }}>
                      <div style={{ fontSize: '0.72rem', fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase' }}>
                        Clustered Workspace Files ({group.relative_paths.length}):
                      </div>
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.4rem' }}>
                        {group.relative_paths.map((p) => (
                          <span
                            key={p}
                            style={{
                              fontFamily: 'var(--font-mono)',
                              fontSize: '0.76rem',
                              padding: '0.2rem 0.55rem',
                              backgroundColor: 'var(--bg-subtle)',
                              borderRadius: 'var(--radius-sm)',
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: '0.35rem',
                              color: 'var(--forest-900)',
                            }}
                          >
                            <FileText size={12} style={{ color: 'var(--forest-600)' }} />
                            {p}
                          </span>
                        ))}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
};
