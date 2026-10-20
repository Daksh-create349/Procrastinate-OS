import React, { useState, useEffect } from 'react';
import {
  AlertTriangle,
  Bot,
  CheckCircle,
  FileCheck,
  FolderLock,
  RefreshCw,
  RotateCcw,
  Shield,
  ShieldCheck,
  Sliders,
  Trash2,
} from 'lucide-react';
import type { HealthStatus } from '../types';
import { clearWorkspaceTasks, fetchSupportedDocumentFormats } from '../api/client';

interface SettingsViewProps {
  health: HealthStatus | null;
  onRefreshHealth: () => void;
  folderPath: string;
  scanLimits: {
    maxDepth: number;
    maxFiles: number;
    includeHidden: boolean;
    computeHashes: boolean;
    extractDocuments: boolean;
  };
  onUpdateLimits: (limits: Partial<SettingsViewProps['scanLimits']>) => void;
  onResetLimits: () => void;
}

export const SettingsView: React.FC<SettingsViewProps> = ({
  health,
  onRefreshHealth,
  folderPath,
  scanLimits,
  onUpdateLimits,
  onResetLimits,
}) => {
  const [supportedFormats, setSupportedFormats] = useState<any>(null);
  const [formatsLoading, setFormatsLoading] = useState(false);
  const [taskClearMessage, setTaskClearMessage] = useState<string | null>(null);
  const [clearingTasks, setClearingTasks] = useState(false);

  useEffect(() => {
    let isMounted = true;
    setFormatsLoading(true);
    fetchSupportedDocumentFormats()
      .then((data) => {
        if (isMounted) setSupportedFormats(data);
      })
      .catch((err) => console.warn('Failed fetching supported formats:', err))
      .finally(() => {
        if (isMounted) setFormatsLoading(false);
      });
    return () => {
      isMounted = false;
    };
  }, []);

  const handleClearProposed = async () => {
    if (!folderPath.trim()) return;
    setClearingTasks(true);
    try {
      const res = await clearWorkspaceTasks(folderPath, true);
      setTaskClearMessage(`Cleared ${res.count} proposed task(s).`);
    } catch (err: any) {
      setTaskClearMessage(`Error: ${err.message}`);
    } finally {
      setClearingTasks(false);
    }
  };

  const handleClearAll = async () => {
    if (!folderPath.trim()) return;
    if (!window.confirm('Clear all task decisions for this workspace?')) return;
    setClearingTasks(true);
    try {
      const res = await clearWorkspaceTasks(folderPath, false);
      setTaskClearMessage(`Cleared all ${res.count} task(s).`);
    } catch (err: any) {
      setTaskClearMessage(`Error: ${err.message}`);
    } finally {
      setClearingTasks(false);
    }
  };

  const isOllamaUp = health?.ollama_connected && health?.ollama_model_present;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem', maxWidth: '960px' }}>
      {/* 1. Ollama & Local Model Configuration */}
      <div className="panel-card" style={{ padding: '1.5rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1rem', flexWrap: 'wrap', gap: '0.5rem' }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
              <Bot size={20} style={{ color: 'var(--forest-600)' }} />
              <h3 style={{ margin: 0, fontSize: '1.15rem', fontWeight: 700, color: 'var(--forest-900)' }}>
                Local AI Model &amp; Ollama Engine
              </h3>
            </div>
            <p style={{ margin: '0.25rem 0 0 0', fontSize: '0.82rem', color: 'var(--text-muted)' }}>
              100% on-device AI inference. ProcrastinateOS runs strictly against your local Ollama instance.
            </p>
          </div>

          <button
            className="btn-secondary"
            onClick={onRefreshHealth}
            style={{ padding: '0.4rem 0.85rem', fontSize: '0.82rem', display: 'flex', alignItems: 'center', gap: '0.4rem' }}
          >
            <RefreshCw size={13} />
            Test Connection
          </button>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '1rem' }}>
          {/* Target Model Card */}
          <div style={{ padding: '0.85rem 1rem', background: 'var(--bg-subtle)', borderRadius: '6px', border: '1px solid var(--border-light)' }}>
            <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Configured Model:</span>
            <div style={{ fontSize: '1.05rem', fontWeight: 700, color: 'var(--forest-900)', marginTop: '0.2rem' }}>
              {health?.ollama_model || 'qwen2.5:1.5b'}
            </div>
            <div style={{ fontSize: '0.75rem', marginTop: '0.4rem' }}>
              {health?.ollama_model_present ? (
                <span style={{ color: 'var(--forest-700)', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
                  <CheckCircle size={13} /> Model downloaded &amp; ready
                </span>
              ) : health?.ollama_connected ? (
                <span style={{ color: '#b91c1c', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
                  <AlertTriangle size={13} /> Model not found in Ollama
                </span>
              ) : (
                <span style={{ color: '#b91c1c', fontWeight: 600 }}>Ollama daemon unreachable</span>
              )}
            </div>
          </div>

          {/* Connection URL Card */}
          <div style={{ padding: '0.85rem 1rem', background: 'var(--bg-subtle)', borderRadius: '6px', border: '1px solid var(--border-light)' }}>
            <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Ollama Daemon URL:</span>
            <div style={{ fontSize: '1.05rem', fontWeight: 700, fontFamily: 'var(--font-mono)', color: 'var(--forest-900)', marginTop: '0.2rem' }}>
              {health?.ollama_url || 'http://localhost:11434'}
            </div>
            <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '0.4rem' }}>
              Available local models: <strong>{health?.available_models.length || 0}</strong>
            </div>
          </div>
        </div>

        {/* Diagnostic Fix Guide if Disconnected */}
        {!isOllamaUp && (
          <div
            style={{
              marginTop: '1rem',
              padding: '0.85rem 1rem',
              backgroundColor: '#fffbeb',
              border: '1px solid #fde68a',
              borderRadius: '6px',
              fontSize: '0.82rem',
              color: '#92400e',
            }}
          >
            <strong>Local AI Diagnostic Guide:</strong>
            <ul style={{ margin: '0.4rem 0 0 1.25rem', padding: 0 }}>
              <li>
                Ensure Ollama is running: <code>ollama serve</code>
              </li>
              <li>
                Pull the required model: <code>ollama run qwen2.5:1.5b</code>
              </li>
              <li>ProcrastinateOS works fully with deterministic analysis even if Ollama is paused.</li>
            </ul>
          </div>
        )}
      </div>

      {/* 2. Scanning Limits & Boundary Rules */}
      <div className="panel-card" style={{ padding: '1.5rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1rem', flexWrap: 'wrap', gap: '0.5rem' }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
              <Sliders size={20} style={{ color: 'var(--forest-600)' }} />
              <h3 style={{ margin: 0, fontSize: '1.15rem', fontWeight: 700, color: 'var(--forest-900)' }}>
                Scanning Limits &amp; Boundary Rules
              </h3>
            </div>
            <p style={{ margin: '0.25rem 0 0 0', fontSize: '0.82rem', color: 'var(--text-muted)' }}>
              Configure resource ceilings, recursion limits, and hash calculation options.
            </p>
          </div>

          <button
            className="btn-secondary"
            onClick={onResetLimits}
            style={{ padding: '0.4rem 0.85rem', fontSize: '0.82rem', display: 'flex', alignItems: 'center', gap: '0.4rem' }}
          >
            <RotateCcw size={13} />
            Reset Defaults
          </button>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '1.25rem' }}>
          {/* Depth limit */}
          <div>
            <label style={{ fontSize: '0.84rem', fontWeight: 600, color: 'var(--text-secondary)', display: 'block', marginBottom: '0.35rem' }}>
              Maximum Traversal Depth: <strong>{scanLimits.maxDepth}</strong>
            </label>
            <input
              type="range"
              min={1}
              max={30}
              value={scanLimits.maxDepth}
              onChange={(e) => onUpdateLimits({ maxDepth: parseInt(e.target.value, 10) })}
              style={{ width: '100%' }}
            />
            <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>
              Stops traversal beyond {scanLimits.maxDepth} folder levels.
            </span>
          </div>

          {/* Max files */}
          <div>
            <label style={{ fontSize: '0.84rem', fontWeight: 600, color: 'var(--text-secondary)', display: 'block', marginBottom: '0.35rem' }}>
              Maximum Scanned Files: <strong>{scanLimits.maxFiles.toLocaleString()}</strong>
            </label>
            <select
              value={scanLimits.maxFiles}
              onChange={(e) => onUpdateLimits({ maxFiles: parseInt(e.target.value, 10) })}
              style={{
                width: '100%',
                padding: '0.4rem 0.6rem',
                border: '1px solid var(--border)',
                borderRadius: '4px',
                fontSize: '0.84rem',
              }}
            >
              <option value={5000}>5,000 files</option>
              <option value={20000}>20,000 files</option>
              <option value={50000}>50,000 files (Recommended)</option>
              <option value={100000}>100,000 files</option>
            </select>
            <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>
              Ceiling to guard memory and performance.
            </span>
          </div>

          {/* Hashing & Extraction */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', justifyContent: 'center' }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: '0.45rem', fontSize: '0.82rem', cursor: 'pointer' }}>
              <input
                type="checkbox"
                checked={scanLimits.computeHashes}
                onChange={(e) => onUpdateLimits({ computeHashes: e.target.checked })}
              />
              <span>Compute SHA-256 for duplicate detection</span>
            </label>

            <label style={{ display: 'flex', alignItems: 'center', gap: '0.45rem', fontSize: '0.82rem', cursor: 'pointer' }}>
              <input
                type="checkbox"
                checked={scanLimits.extractDocuments}
                onChange={(e) => onUpdateLimits({ extractDocuments: e.target.checked })}
              />
              <span>Extract bounded document text for AI</span>
            </label>

            <label style={{ display: 'flex', alignItems: 'center', gap: '0.45rem', fontSize: '0.82rem', cursor: 'pointer' }}>
              <input
                type="checkbox"
                checked={scanLimits.includeHidden}
                onChange={(e) => onUpdateLimits({ includeHidden: e.target.checked })}
              />
              <span>Include hidden files (.git excluded by rule)</span>
            </label>
          </div>
        </div>
      </div>

      {/* 3. Supported Document Parsers */}
      <div className="panel-card" style={{ padding: '1.5rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', marginBottom: '0.75rem' }}>
          <FileCheck size={20} style={{ color: 'var(--forest-600)' }} />
          <h3 style={{ margin: 0, fontSize: '1.15rem', fontWeight: 700, color: 'var(--forest-900)' }}>
            Supported Document Formats &amp; Extraction Guarantees
          </h3>
        </div>

        <p style={{ fontSize: '0.82rem', color: 'var(--text-muted)', margin: '0 0 1rem 0' }}>
          Documents are processed strictly on-device using hardened local parsers. Bounded text chunks with page/section references are extracted without executing macros.
        </p>

        {supportedFormats ? (
          <div>
            <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', marginBottom: '1rem' }}>
              {supportedFormats.supported_extensions?.map((ext: string) => (
                <span
                  key={ext}
                  style={{
                    padding: '0.25rem 0.65rem',
                    borderRadius: '4px',
                    fontFamily: 'var(--font-mono)',
                    fontSize: '0.8rem',
                    fontWeight: 600,
                    backgroundColor: 'var(--forest-100)',
                    color: 'var(--forest-900)',
                  }}
                >
                  {ext}
                </span>
              ))}
            </div>

            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
                gap: '0.75rem',
                fontSize: '0.8rem',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', color: 'var(--forest-800)' }}>
                <CheckCircle size={14} style={{ color: 'var(--forest-600)' }} />
                <span>PDF text streams extracted safely</span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', color: 'var(--forest-800)' }}>
                <CheckCircle size={14} style={{ color: 'var(--forest-600)' }} />
                <span>DOCX paragraphs &amp; headings</span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', color: 'var(--forest-800)' }}>
                <CheckCircle size={14} style={{ color: 'var(--forest-600)' }} />
                <span>Markdown header section chunking</span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', color: 'var(--forest-800)' }}>
                <CheckCircle size={14} style={{ color: 'var(--forest-600)' }} />
                <span>CSV row and JSON key batching</span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', color: 'var(--forest-800)' }}>
                <ShieldCheck size={14} style={{ color: 'var(--forest-600)' }} />
                <span>Macros and script execution disabled</span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', color: 'var(--forest-800)' }}>
                <ShieldCheck size={14} style={{ color: 'var(--forest-600)' }} />
                <span>Cloud upload disabled</span>
              </div>
            </div>
          </div>
        ) : (
          <div style={{ fontSize: '0.82rem', color: 'var(--text-muted)' }}>
            {formatsLoading ? 'Loading format specifications...' : 'Format specifications unavailable.'}
          </div>
        )}
      </div>

      {/* 4. Task Store & Local Database Management */}
      <div className="panel-card" style={{ padding: '1.5rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', marginBottom: '0.75rem' }}>
          <FolderLock size={20} style={{ color: 'var(--forest-600)' }} />
          <h3 style={{ margin: 0, fontSize: '1.15rem', fontWeight: 700, color: 'var(--forest-900)' }}>
            Persistent Local Storage &amp; Manifests
          </h3>
        </div>

        <p style={{ fontSize: '0.82rem', color: 'var(--text-muted)', margin: '0 0 1rem 0' }}>
          User decisions, queue tasks, and non-repudiable audit trails are stored locally in SQLite database manifests on your machine.
        </p>

        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            gap: '0.5rem',
            fontSize: '0.8rem',
            fontFamily: 'var(--font-mono)',
            background: 'var(--bg-subtle)',
            padding: '0.75rem 1rem',
            borderRadius: '6px',
            marginBottom: '1rem',
          }}
        >
          <div>
            <span style={{ color: 'var(--text-muted)' }}>Tasks Database: </span>
            <code>~/.procrastinate_os/tasks.db</code>
          </div>
          <div>
            <span style={{ color: 'var(--text-muted)' }}>Audit Manifest Database: </span>
            <code>~/.procrastinate_os/actions.db</code>
          </div>
        </div>

        <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap', alignItems: 'center' }}>
          <button
            className="btn-secondary"
            onClick={handleClearProposed}
            disabled={clearingTasks}
            style={{ padding: '0.45rem 0.85rem', fontSize: '0.82rem' }}
          >
            Clear Proposed Tasks
          </button>

          <button
            className="btn-secondary"
            onClick={handleClearAll}
            disabled={clearingTasks}
            style={{ padding: '0.45rem 0.85rem', fontSize: '0.82rem', color: '#b91c1c', borderColor: '#fca5a5' }}
          >
            <Trash2 size={13} />
            Reset All Workspace Tasks
          </button>

          {taskClearMessage && (
            <span style={{ fontSize: '0.8rem', color: 'var(--forest-700)', fontWeight: 600 }}>
              {taskClearMessage}
            </span>
          )}
        </div>
      </div>

      {/* 5. Privacy Manifesto */}
      <div
        style={{
          padding: '1.25rem 1.5rem',
          background: 'var(--forest-900)',
          color: '#ffffff',
          borderRadius: 'var(--radius-md)',
          display: 'flex',
          alignItems: 'flex-start',
          gap: '1rem',
        }}
      >
        <Shield size={24} style={{ color: '#86efac', flexShrink: 0, marginTop: '0.15rem' }} />
        <div>
          <h4 style={{ margin: 0, fontSize: '0.98rem', fontWeight: 700 }}>
            ProcrastinateOS Local Privacy Manifesto
          </h4>
          <p style={{ margin: '0.35rem 0 0 0', fontSize: '0.82rem', color: '#d1fae5', lineHeight: 1.5 }}>
            No workspace files, extracted text, file names, or tokens are ever uploaded to cloud servers.
            Inference executes completely on your CPU / GPU through Ollama.
            All filesystem actions require explicit user review and never overwrite files.
          </p>
        </div>
      </div>
    </div>
  );
};
