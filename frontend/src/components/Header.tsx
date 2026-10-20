import React from 'react';
import { Bot, Cpu, RefreshCw } from 'lucide-react';
import type { HealthStatus } from '../types';

interface HeaderProps {
  health: HealthStatus | null;
  loading: boolean;
  onRefreshHealth: () => void;
  folderPath?: string;
  onOpenWorkspaceTab?: () => void;
}

export const Header: React.FC<HeaderProps> = ({
  health,
  loading,
  onRefreshHealth,
  folderPath,
  onOpenWorkspaceTab,
}) => {
  const isOllamaUp = health?.ollama_connected && health?.ollama_model_present;
  const folderName = folderPath ? folderPath.split('/').filter(Boolean).pop() || folderPath : 'Workspace';

  return (
    <header className="top-nav">
      <div className="brand-section">
        <div className="brand-logo" aria-label="ProcrastinateOS Logo">
          <Bot size={22} />
        </div>
        <div>
          <h1 className="brand-title">ProcrastinateOS</h1>
          <p className="brand-tagline">Stop postponing. Let your computer do the boring work.</p>
        </div>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', flexWrap: 'wrap' }}>
        {/* Active Workspace Pill */}
        {folderPath && (
          <button
            onClick={onOpenWorkspaceTab}
            className="health-pill"
            style={{
              cursor: 'pointer',
              border: '1px solid var(--border-medium)',
              background: 'var(--bg-card)',
              color: 'var(--forest-900)',
              fontWeight: 600,
            }}
            title={`Active Workspace: ${folderPath}`}
          >
            <span style={{ color: 'var(--forest-600)' }}>📁</span>
            <span style={{ maxWidth: '160px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {folderName}
            </span>
          </button>
        )}

        {/* Local-Only Privacy Pill */}
        <div
          className="health-pill"
          style={{ background: 'var(--forest-50)', color: 'var(--forest-900)', border: '1px solid var(--forest-200)' }}
          title="100% On-Device Processing. No cloud telemetry."
        >
          <span style={{ color: 'var(--forest-600)', fontSize: '0.72rem', fontWeight: 700 }}>100% LOCAL</span>
        </div>

        {/* Health status pill */}
        <div className="health-pill" title={health ? `Backend: ${health.status} | Ollama: ${health.ollama_url}` : 'Connecting...'}>
          <span className={`pulse-dot ${isOllamaUp ? '' : 'offline'}`} />
          <Cpu size={14} style={{ color: 'var(--forest-600)' }} />
          <span>
            {health?.ollama_model_present
              ? `Ollama: ${health.ollama_model}`
              : health?.ollama_connected
              ? `Model ${health.ollama_model} missing`
              : 'Ollama Offline'}
          </span>
        </div>

        <button
          className="btn-secondary"
          onClick={onRefreshHealth}
          disabled={loading}
          style={{ padding: '0.4rem 0.65rem', fontSize: '0.8rem' }}
          title="Refresh health status"
          aria-label="Refresh Status"
        >
          <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
        </button>
      </div>
    </header>
  );
};
