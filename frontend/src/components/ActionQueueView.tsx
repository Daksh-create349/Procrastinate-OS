import React, { useState } from 'react';
import type { QueueTask, QueueTaskStatus } from '../types';
import {
  Clock,
  CheckCircle2,
  XCircle,
  ThumbsUp,
  RotateCcw,
  ChevronDown,
  ChevronRight,
  FileText,
  Copy,
  Check,
  Ban,
  ArrowRight,
  Timer,
  Zap,
} from 'lucide-react';

interface ActionQueueViewProps {
  tasks: QueueTask[];
  summary: string;
  modelUsed?: string;
  timeBudgetMinutes: number;
  totalEstimatedMinutes: number;
  completedCount: number;
  dismissedCount: number;
  onTimeBudgetChange: (budget: number) => void;
  onUpdateStatus: (taskId: string, newStatus: QueueTaskStatus) => void;
  onDismissTask: (taskId: string) => void;
  onRefreshQueue: () => void;
  onSelectFileForAI?: (filePath: string) => void;
  isGenerating: boolean;
  folderPath: string;
}

export const ActionQueueView: React.FC<ActionQueueViewProps> = ({
  tasks,
  summary,
  modelUsed,
  timeBudgetMinutes,
  totalEstimatedMinutes,
  completedCount,
  dismissedCount,
  onTimeBudgetChange,
  onUpdateStatus,
  onDismissTask,
  onRefreshQueue,
  onSelectFileForAI,
  isGenerating,
  folderPath,
}) => {
  const [filter, setFilter] = useState<'active' | 'completed' | 'dismissed' | 'all'>('active');
  const [expandedEvidence, setExpandedEvidence] = useState<Record<string, boolean>>({});
  const [copiedPath, setCopiedPath] = useState<string | null>(null);

  const toggleEvidence = (taskId: string) => {
    setExpandedEvidence((prev) => ({ ...prev, [taskId]: !prev[taskId] }));
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopiedPath(text);
    setTimeout(() => setCopiedPath(null), 2000);
  };

  // Filter tasks according to selected view tab
  const filteredTasks = tasks.filter((t) => {
    if (filter === 'active') {
      return t.status === 'proposed' || t.status === 'approved';
    }
    if (filter === 'completed') {
      return t.status === 'completed';
    }
    if (filter === 'dismissed') {
      return t.status === 'dismissed' || t.status === 'blocked';
    }
    return true;
  });

  const activeTasks = tasks.filter((t) => t.status === 'proposed' || t.status === 'approved');
  const activeEstimatedMinutes = totalEstimatedMinutes || activeTasks.reduce((sum, t) => sum + t.estimated_minutes, 0);
  const budgetPercent = Math.min(100, Math.round((activeEstimatedMinutes / timeBudgetMinutes) * 100));

  if (!folderPath) {
    return (
      <div className="panel-card">
        <div className="empty-state">
          <Timer className="empty-icon" size={42} />
          <h3 className="empty-title">Procrastination Queue</h3>
          <p className="empty-desc">
            Select a folder on your computer to generate a structured, bite-sized queue based on deterministic findings and validated local AI recommendations.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
      {/* Header and Time Budget Selector */}
      <div className="panel-card" style={{ padding: '1.25rem 1.5rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '1rem' }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <Timer size={20} style={{ color: 'var(--forest-600)' }} />
              <h2 style={{ fontSize: '1.15rem', fontWeight: 700, color: 'var(--forest-900)', margin: 0 }}>
                Procrastination Queue
              </h2>
            </div>
            <p style={{ margin: '0.2rem 0 0 0', fontSize: '0.82rem', color: 'var(--text-muted)' }}>
              Stop postponing. Let your computer do the boring work &mdash; Pick your time budget:
            </p>
          </div>

          <button
            className="btn-secondary"
            onClick={onRefreshQueue}
            disabled={isGenerating}
            style={{ padding: '0.45rem 0.95rem', fontSize: '0.82rem', display: 'flex', alignItems: 'center', gap: '0.4rem' }}
          >
            <RotateCcw size={14} className={isGenerating ? 'animate-spin' : ''} />
            {isGenerating ? 'Synthesizing Queue...' : 'Regenerate Queue'}
          </button>
        </div>

        {/* Time Budget Selector Chips */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem', marginTop: '1rem', flexWrap: 'wrap' }}>
          <span style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--forest-900)' }}>Time Budget:</span>
          {[
            { mins: 5, label: '5 min', desc: 'Quick Win', icon: <Zap size={13} /> },
            { mins: 15, label: '15 min', desc: 'Deep Breath', icon: <Timer size={13} /> },
            { mins: 30, label: '30 min', desc: 'Focus Session', icon: <Clock size={13} /> },
          ].map((b) => (
            <button
              key={b.mins}
              onClick={() => onTimeBudgetChange(b.mins)}
              disabled={isGenerating}
              style={{
                padding: '0.4rem 0.85rem',
                fontSize: '0.82rem',
                fontWeight: 600,
                borderRadius: 'var(--radius-full)',
                border: timeBudgetMinutes === b.mins ? '2px solid var(--forest-600)' : '1px solid var(--border-light)',
                backgroundColor: timeBudgetMinutes === b.mins ? 'var(--forest-50)' : 'var(--bg-surface)',
                color: timeBudgetMinutes === b.mins ? 'var(--forest-900)' : 'var(--text-secondary)',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '0.4rem',
                transition: 'all 0.15s ease',
              }}
            >
              {b.icon}
              <span>{b.label}</span>
              <span style={{ fontSize: '0.72rem', opacity: 0.75, fontWeight: 400 }}>({b.desc})</span>
            </button>
          ))}
        </div>

        {/* Budget Allocation Progress Bar */}
        <div style={{ marginTop: '1.25rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: '0.8rem', marginBottom: '0.35rem' }}>
            <span style={{ color: 'var(--forest-900)', fontWeight: 600 }}>
              Effort Allocated: {activeEstimatedMinutes} min / {timeBudgetMinutes} min budget
            </span>
            <span style={{ color: 'var(--text-muted)' }}>
              {completedCount} completed &bull; {dismissedCount} dismissed
            </span>
          </div>

          <div
            style={{
              height: '6px',
              backgroundColor: 'var(--forest-100)',
              borderRadius: 'var(--radius-full)',
              overflow: 'hidden',
            }}
          >
            <div
              style={{
                height: '100%',
                width: `${budgetPercent}%`,
                backgroundColor: budgetPercent > 90 ? '#d97706' : 'var(--forest-600)',
                transition: 'width 0.3s ease',
              }}
            />
          </div>
        </div>

        {summary && (
          <div
            style={{
              marginTop: '1rem',
              padding: '0.65rem 0.9rem',
              backgroundColor: 'var(--bg-subtle)',
              border: '1px solid var(--border-light)',
              borderRadius: 'var(--radius-sm)',
              fontSize: '0.82rem',
              color: 'var(--forest-900)',
              lineHeight: 1.45,
            }}
          >
            <strong>Queue Grounding: </strong>
            {summary}
            {modelUsed && (
              <span style={{ marginLeft: '0.5rem', color: 'var(--forest-600)', fontWeight: 500 }}>
                (Priorities optimized by {modelUsed})
              </span>
            )}
          </div>
        )}
      </div>

      {/* Filter Tabs */}
      <div style={{ display: 'flex', gap: '0.5rem', borderBottom: '1px solid var(--border-light)', paddingBottom: '0.25rem' }}>
        <button
          className={`tab-btn ${filter === 'active' ? 'active' : ''}`}
          onClick={() => setFilter('active')}
          style={{ padding: '0.45rem 0.9rem', fontSize: '0.82rem' }}
        >
          Active ({activeTasks.length})
        </button>
        <button
          className={`tab-btn ${filter === 'completed' ? 'active' : ''}`}
          onClick={() => setFilter('completed')}
          style={{ padding: '0.45rem 0.9rem', fontSize: '0.82rem' }}
        >
          Completed ({completedCount})
        </button>
        <button
          className={`tab-btn ${filter === 'dismissed' ? 'active' : ''}`}
          onClick={() => setFilter('dismissed')}
          style={{ padding: '0.45rem 0.9rem', fontSize: '0.82rem' }}
        >
          Dismissed / Blocked ({tasks.filter((t) => t.status === 'dismissed' || t.status === 'blocked').length})
        </button>
        <button
          className={`tab-btn ${filter === 'all' ? 'active' : ''}`}
          onClick={() => setFilter('all')}
          style={{ padding: '0.45rem 0.9rem', fontSize: '0.82rem' }}
        >
          All ({tasks.length})
        </button>
      </div>

      {/* Celebratory Zero-Inbox State */}
      {filter === 'active' && activeTasks.length === 0 && (
        <div className="panel-card" style={{ textAlign: 'center', padding: '3.5rem 1.5rem' }}>
          <CheckCircle2 size={46} style={{ color: 'var(--forest-600)', margin: '0 auto 0.75rem' }} />
          <h3 style={{ fontSize: '1.2rem', fontWeight: 700, color: 'var(--forest-900)', margin: 0 }}>
            {completedCount > 0
              ? `You crushed your ${timeBudgetMinutes}-minute session!`
              : 'Queue is Clear!'}
          </h3>
          <p style={{ fontSize: '0.88rem', color: 'var(--text-muted)', maxWidth: '440px', margin: '0.5rem auto 1.5rem' }}>
            {completedCount > 0
              ? 'All planned tasks in this time budget have been addressed. Enjoy your cleared mental space or choose a larger time budget to continue.'
              : 'No pending tasks in this budget. Click Regenerate Queue or increase your time budget.'}
          </p>
          <div style={{ display: 'flex', justifyContent: 'center', gap: '0.75rem' }}>
            {timeBudgetMinutes < 30 && (
              <button
                className="btn-primary"
                onClick={() => onTimeBudgetChange(timeBudgetMinutes === 5 ? 15 : 30)}
                style={{ padding: '0.5rem 1.1rem', fontSize: '0.85rem' }}
              >
                Expand to {timeBudgetMinutes === 5 ? '15 Min' : '30 Min'} Budget
              </button>
            )}
            <button
              className="btn-secondary"
              onClick={onRefreshQueue}
              style={{ padding: '0.5rem 1.1rem', fontSize: '0.85rem' }}
            >
              Regenerate Queue
            </button>
          </div>
        </div>
      )}

      {/* Task List */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.9rem' }}>
        {filteredTasks.map((task) => {
          const isExpanded = !!expandedEvidence[task.id];
          const isDone = task.status === 'completed';
          const isDismissed = task.status === 'dismissed';
          const isApproved = task.status === 'approved';
          const isBlocked = task.status === 'blocked';

          const accentColor = isDone
            ? '#16a34a'
            : isApproved
            ? 'var(--forest-600)'
            : isBlocked
            ? '#d97706'
            : isDismissed
            ? '#9ca3af'
            : 'var(--sage-400)';

          return (
            <div
              key={task.id}
              className="panel-card"
              style={{
                padding: '1.15rem 1.25rem',
                borderLeft: `4px solid ${accentColor}`,
                opacity: isDismissed ? 0.65 : 1,
                display: 'flex',
                flexDirection: 'column',
                gap: '0.75rem',
              }}
            >
              {/* Top Row: Title, Status Badge, Effort Estimate */}
              <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '1rem' }}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
                    <h3
                      style={{
                        margin: 0,
                        fontSize: '1rem',
                        fontWeight: 700,
                        color: isDone ? 'var(--text-muted)' : 'var(--forest-900)',
                        textDecoration: isDone ? 'line-through' : 'none',
                      }}
                    >
                      {task.title}
                    </h3>

                    {/* Status Badge */}
                    <span
                      style={{
                        fontSize: '0.68rem',
                        fontWeight: 700,
                        textTransform: 'uppercase',
                        padding: '0.15rem 0.5rem',
                        borderRadius: 'var(--radius-full)',
                        backgroundColor:
                          task.status === 'approved'
                            ? 'var(--forest-100)'
                            : task.status === 'completed'
                            ? '#dcfce7'
                            : task.status === 'blocked'
                            ? '#fef3c7'
                            : 'var(--bg-subtle)',
                        color:
                          task.status === 'approved'
                            ? 'var(--forest-900)'
                            : task.status === 'completed'
                            ? '#166534'
                            : task.status === 'blocked'
                            ? '#92400e'
                            : 'var(--text-muted)',
                      }}
                    >
                      {task.status}
                    </span>

                    {/* Category */}
                    <span
                      style={{
                        fontSize: '0.7rem',
                        color: 'var(--text-muted)',
                        backgroundColor: 'var(--bg-subtle)',
                        padding: '0.12rem 0.45rem',
                        borderRadius: 'var(--radius-sm)',
                      }}
                    >
                      {task.category.replace(/_/g, ' ')}
                    </span>
                  </div>

                  {/* Reason for Recommendation */}
                  <p style={{ margin: 0, fontSize: '0.84rem', color: 'var(--text-secondary)' }}>
                    {task.reason}
                  </p>
                </div>

                {/* Effort Estimate Pill */}
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '0.35rem',
                    padding: '0.3rem 0.65rem',
                    backgroundColor: 'var(--bg-subtle)',
                    border: '1px solid var(--border-light)',
                    borderRadius: 'var(--radius-full)',
                    fontSize: '0.78rem',
                    fontWeight: 600,
                    color: 'var(--forest-800)',
                    whiteSpace: 'nowrap',
                  }}
                  title="Approximate effort estimate based on task complexity"
                >
                  <Clock size={12} />
                  <span>{task.effort_label}</span>
                </div>
              </div>

              {/* Action Box */}
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  padding: '0.6rem 0.85rem',
                  backgroundColor: '#f6faf4',
                  border: '1px solid var(--forest-100)',
                  borderRadius: 'var(--radius-sm)',
                  fontSize: '0.82rem',
                  color: 'var(--forest-900)',
                  gap: '0.75rem',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.45rem' }}>
                  <ArrowRight size={14} style={{ color: 'var(--forest-600)', flexShrink: 0 }} />
                  <span>
                    <strong>Next Action:</strong> {task.suggested_action}
                  </span>
                </div>

                {onSelectFileForAI && task.supporting_files.length > 0 && (
                  <button
                    className="btn-secondary"
                    onClick={() => onSelectFileForAI(task.supporting_files[0].relative_path)}
                    style={{ padding: '0.25rem 0.55rem', fontSize: '0.72rem', whiteSpace: 'nowrap' }}
                  >
                    Ask AI
                  </button>
                )}
              </div>

              {/* Expandable Supporting Evidence & Files */}
              <div>
                <button
                  onClick={() => toggleEvidence(task.id)}
                  style={{
                    background: 'none',
                    border: 'none',
                    padding: 0,
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '0.35rem',
                    fontSize: '0.76rem',
                    fontWeight: 600,
                    color: 'var(--forest-700)',
                  }}
                >
                  {isExpanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                  <span>Source Evidence &amp; Files ({task.supporting_files.length})</span>
                </button>

                {isExpanded && (
                  <div
                    style={{
                      marginTop: '0.5rem',
                      padding: '0.75rem 0.95rem',
                      backgroundColor: 'var(--bg-subtle)',
                      borderRadius: 'var(--radius-sm)',
                      fontSize: '0.78rem',
                      display: 'flex',
                      flexDirection: 'column',
                      gap: '0.5rem',
                    }}
                  >
                    <div>
                      <strong>Verified Evidence: </strong>
                      <span style={{ fontStyle: 'italic', color: 'var(--text-secondary)' }}>
                        {task.evidence}
                      </span>
                    </div>

                    <div>
                      <strong>Supporting Files:</strong>
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.4rem', marginTop: '0.25rem' }}>
                        {task.supporting_files.map((f, idx) => (
                          <div
                            key={idx}
                            style={{
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: '0.3rem',
                              padding: '0.2rem 0.5rem',
                              backgroundColor: 'var(--bg-surface)',
                              border: '1px solid var(--border-light)',
                              borderRadius: 'var(--radius-sm)',
                              fontFamily: 'var(--font-mono)',
                              fontSize: '0.72rem',
                            }}
                          >
                            <FileText size={11} style={{ color: 'var(--text-muted)' }} />
                            <span>{f.relative_path}</span>
                            <button
                              onClick={() => copyToClipboard(f.relative_path)}
                              title="Copy relative path"
                              style={{
                                background: 'none',
                                border: 'none',
                                cursor: 'pointer',
                                padding: 0,
                                display: 'inline-flex',
                                alignItems: 'center',
                                color: 'var(--text-muted)',
                              }}
                            >
                              {copiedPath === f.relative_path ? <Check size={11} /> : <Copy size={11} />}
                            </button>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                )}
              </div>

              {/* Bottom Action Controls: Approve, Complete, Block, Dismiss */}
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  borderTop: '1px solid var(--border-light)',
                  paddingTop: '0.65rem',
                  marginTop: '0.25rem',
                  flexWrap: 'wrap',
                  gap: '0.5rem',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                  {task.status !== 'completed' && (
                    <button
                      className="btn-primary"
                      onClick={() => onUpdateStatus(task.id, 'completed')}
                      style={{ padding: '0.3rem 0.75rem', fontSize: '0.78rem', display: 'flex', alignItems: 'center', gap: '0.35rem' }}
                    >
                      <CheckCircle2 size={13} />
                      Complete Task
                    </button>
                  )}

                  {task.status === 'proposed' && (
                    <button
                      className="btn-secondary"
                      onClick={() => onUpdateStatus(task.id, 'approved')}
                      style={{ padding: '0.3rem 0.75rem', fontSize: '0.78rem', display: 'flex', alignItems: 'center', gap: '0.35rem' }}
                    >
                      <ThumbsUp size={13} />
                      Approve
                    </button>
                  )}

                  {task.status !== 'blocked' && task.status !== 'completed' && task.status !== 'dismissed' && (
                    <button
                      className="btn-secondary"
                      onClick={() => onUpdateStatus(task.id, 'blocked')}
                      style={{ padding: '0.3rem 0.65rem', fontSize: '0.78rem', display: 'flex', alignItems: 'center', gap: '0.3rem' }}
                      title="Mark task as blocked"
                    >
                      <Ban size={12} />
                      Block
                    </button>
                  )}

                  {(task.status === 'completed' || task.status === 'dismissed' || task.status === 'blocked') && (
                    <button
                      className="btn-secondary"
                      onClick={() => onUpdateStatus(task.id, 'proposed')}
                      style={{ padding: '0.3rem 0.65rem', fontSize: '0.78rem', display: 'flex', alignItems: 'center', gap: '0.3rem' }}
                    >
                      <RotateCcw size={12} />
                      Reopen
                    </button>
                  )}
                </div>

                {task.status !== 'dismissed' && (
                  <button
                    onClick={() => onDismissTask(task.id)}
                    style={{
                      background: 'none',
                      border: 'none',
                      cursor: 'pointer',
                      fontSize: '0.76rem',
                      color: 'var(--text-muted)',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '0.3rem',
                      padding: '0.25rem 0.5rem',
                      borderRadius: 'var(--radius-sm)',
                    }}
                    title="Dismiss task so it won't be re-proposed"
                  >
                    <XCircle size={13} />
                    Dismiss
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};
