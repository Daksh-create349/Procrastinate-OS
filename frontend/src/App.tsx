import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  AlertTriangle,
  Copy,
  FileCheck,
  FolderArchive,
  FolderSearch,
  History,
  Layers,
  MessageSquare,
  PieChart,
  ShieldCheck,
  Sliders,
  Sparkles,
} from 'lucide-react';
import type {
  DuplicateResult,
  FilesystemActionPreview,
  HealthStatus,
  ProposedActionItem,
  QueueTask,
  QueueTaskStatus,
  ScanProgress,
  ScanResult,
} from './types';
import {
  fetchHealth,
  startScanJob,
  getScanProgress,
  getScanResult,
  scanFolder,
  scanDuplicates,
  generateProcrastinationQueue,
  updateTaskStatus,
  dismissTask,
  previewActions,
} from './api/client';
import { Header } from './components/Header';
import { HeroScanner } from './components/HeroScanner';
import { WorkspaceView } from './components/WorkspaceView';
import { OverviewView } from './components/OverviewView';
import { ActionQueueView } from './components/ActionQueueView';
import { CleanupReviewView } from './components/CleanupReviewView';
import { ForgottenWorkView } from './components/ForgottenWorkView';
import { DeterministicFindingsView } from './components/DeterministicFindingsView';
import { ClutterInspector } from './components/ClutterInspector';
import { DuplicateFinderView } from './components/DuplicateFinderView';
import { ActivityHistoryView } from './components/ActivityHistoryView';
import { SettingsView } from './components/SettingsView';
import { ActionReviewModal } from './components/ActionReviewModal';
import { LocalAIChatModal } from './components/LocalAIChatModal';

export type AppTab =
  | 'workspace'
  | 'overview'
  | 'forgotten'
  | 'queue'
  | 'cleanup'
  | 'history'
  | 'settings'
  | 'duplicates'
  | 'inspector'
  | 'findings';

export const App: React.FC = () => {
  // State
  const [health, setHealth] = useState<HealthStatus | null>(null);
  const [healthLoading, setHealthLoading] = useState(false);
  const [folderPath, setFolderPath] = useState<string>(
    '/Users/dakshsrivastava/Desktop/Procrastinate OS'
  );

  // Scan Results & Deterministic Findings
  const [scanResult, setScanResult] = useState<ScanResult | null>(null);
  const [duplicateResult, setDuplicateResult] = useState<DuplicateResult | null>(null);

  // Scan Limits State (persisted locally)
  const [scanLimits, setScanLimits] = useState(() => {
    try {
      const saved = localStorage.getItem('procrastinateos_scan_limits');
      if (saved) return JSON.parse(saved);
    } catch {}
    return {
      maxDepth: 15,
      maxFiles: 50000,
      includeHidden: false,
      computeHashes: true,
      extractDocuments: true,
    };
  });

  // Procrastination Queue State
  const [queueTasks, setQueueTasks] = useState<QueueTask[]>([]);
  const [timeBudget, setTimeBudget] = useState<number>(15);
  const [queueSummary, setQueueSummary] = useState<string>('');
  const [queueModelUsed, setQueueModelUsed] = useState<string>('qwen2.5:1.5b');
  const [completedCount, setCompletedCount] = useState<number>(0);
  const [dismissedCount, setDismissedCount] = useState<number>(0);

  // Scanning & Progress
  const [isScanning, setIsScanning] = useState(false);
  const [scanProgress, setScanProgress] = useState<ScanProgress | null>(null);
  const activeJobIdRef = useRef<string | null>(null);

  const [isDuplicateScanning, setIsDuplicateScanning] = useState(false);
  const [isGeneratingQueue, setIsGeneratingQueue] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<AppTab>('queue');

  // Filesystem Action Review State
  const [actionPreviews, setActionPreviews] = useState<FilesystemActionPreview[]>([]);
  const [isActionReviewOpen, setIsActionReviewOpen] = useState(false);

  // AI Chat Modal
  const [isChatOpen, setIsChatOpen] = useState(false);
  const [chatPrompt, setChatPrompt] = useState('');

  // Initial health check
  const refreshHealth = useCallback(async () => {
    setHealthLoading(true);
    try {
      const data = await fetchHealth();
      setHealth(data);
      setErrorMessage(null);
    } catch (err: any) {
      console.warn('Backend or Ollama check failed:', err);
      setHealth({
        status: 'disconnected',
        app_name: 'ProcrastinateOS API',
        version: '0.1.0',
        ollama_connected: false,
        ollama_url: 'http://localhost:11434',
        ollama_model: 'qwen2.5:1.5b',
        ollama_model_present: false,
        available_models: [],
        timestamp: new Date().toISOString(),
      });
    } finally {
      setHealthLoading(false);
    }
  }, []);

  useEffect(() => {
    refreshHealth();
  }, [refreshHealth]);

  const handleUpdateLimits = (newLimits: Partial<typeof scanLimits>) => {
    setScanLimits((prev: typeof scanLimits) => {
      const updated = { ...prev, ...newLimits };
      try {
        localStorage.setItem('procrastinateos_scan_limits', JSON.stringify(updated));
      } catch {}
      return updated;
    });
  };

  const handleResetLimits = () => {
    const defaults = {
      maxDepth: 15,
      maxFiles: 50000,
      includeHidden: false,
      computeHashes: true,
      extractDocuments: true,
    };
    setScanLimits(defaults);
    try {
      localStorage.removeItem('procrastinateos_scan_limits');
    } catch {}
  };

  // Folder scanning handler (async job with polling progress + direct fallback)
  const handleScan = async () => {
    if (!folderPath.trim()) return;
    setIsScanning(true);
    setErrorMessage(null);
    setScanProgress({
      job_id: 'pending',
      status: 'queued',
      folder_path: folderPath.trim(),
      files_scanned: 0,
      bytes_scanned: 0,
      bytes_scanned_formatted: '0 B',
      current_directory: folderPath.trim(),
      errors_count: 0,
      elapsed_seconds: 0,
      is_complete: false,
    });

    const scanOpts = {
      max_depth: scanLimits.maxDepth,
      max_files: scanLimits.maxFiles,
      include_hidden: scanLimits.includeHidden,
      compute_hashes: scanLimits.computeHashes,
      extract_documents: scanLimits.extractDocuments,
    };

    try {
      let finalResult: ScanResult;

      try {
        const { job_id } = await startScanJob(folderPath.trim(), scanOpts);
        activeJobIdRef.current = job_id;

        // Poll progress until completion
        while (activeJobIdRef.current === job_id) {
          const prog = await getScanProgress(job_id);
          setScanProgress(prog);

          if (prog.is_complete) {
            if (prog.status === 'failed') {
              throw new Error(prog.error_message || 'Scan job failed.');
            }
            break;
          }
          await new Promise((resolve) => setTimeout(resolve, 150));
        }

        finalResult = await getScanResult(job_id);
      } catch (jobErr: any) {
        // Fallback to direct synchronous scan
        console.warn('Async job failed, falling back to direct scan:', jobErr);
        finalResult = await scanFolder(folderPath.trim(), scanOpts);
      }

      setScanResult(finalResult);

      // Populate duplicateResult directly from the comprehensive scan if available
      if (finalResult.duplicate_groups && finalResult.duplicate_groups.length > 0) {
        setDuplicateResult({
          scanned_path: finalResult.root_path,
          scanned_at: finalResult.scanned_at,
          groups_count: finalResult.duplicate_groups.length,
          total_duplicate_files: finalResult.duplicate_groups.reduce(
            (acc, g) => acc + (g.files.length - 1),
            0
          ),
          total_wasted_bytes: finalResult.total_wasted_bytes,
          total_wasted_formatted: finalResult.total_wasted_formatted,
          groups: finalResult.duplicate_groups,
        });
      }

      // Auto generate initial action queue if empty
      if (queueTasks.length === 0) {
        handleGenerateQueue(finalResult);
      }
    } catch (err: any) {
      setErrorMessage(err.message || 'Error occurred while scanning directory.');
    } finally {
      setIsScanning(false);
      activeJobIdRef.current = null;
      setScanProgress(null);
    }
  };

  // Cancel running scan handler
  const handleCancelScan = () => {
    activeJobIdRef.current = null;
    setIsScanning(false);
    setScanProgress(null);
  };

  // Direct duplicate scanner
  const handleScanDuplicates = async () => {
    if (!folderPath.trim()) return;
    setIsDuplicateScanning(true);
    setErrorMessage(null);
    try {
      const data = await scanDuplicates(folderPath.trim());
      setDuplicateResult(data);
    } catch (err: any) {
      setErrorMessage(err.message || 'Duplicate scanning failed.');
    } finally {
      setIsDuplicateScanning(false);
    }
  };

  // Generate Procrastination Queue
  const handleGenerateQueue = async (
    currentScanResult?: ScanResult,
    budget?: number,
    force: boolean = false
  ) => {
    const activeResult = currentScanResult || scanResult;
    if (!activeResult && !folderPath.trim()) return;

    setIsGeneratingQueue(true);
    setErrorMessage(null);

    const targetBudget = budget ?? timeBudget;

    try {
      const res = await generateProcrastinationQueue(
        folderPath.trim(),
        targetBudget,
        force,
        true
      );
      setQueueTasks(res.tasks);
      setTimeBudget(res.time_budget_minutes);
      setQueueSummary(res.summary);
      if (res.model_used) setQueueModelUsed(res.model_used);
      setCompletedCount(res.completed_count);
      setDismissedCount(res.dismissed_count);
    } catch (err: any) {
      setErrorMessage(err.message || 'Failed to generate procrastination queue.');
    } finally {
      setIsGeneratingQueue(false);
    }
  };

  // Update task status
  const handleUpdateTaskStatus = async (taskId: string, newStatus: QueueTaskStatus) => {
    try {
      const updated = await updateTaskStatus(taskId, newStatus);
      setQueueTasks((prev) =>
        prev.map((t) => (t.id === taskId ? { ...t, status: updated.status } : t))
      );
      if (newStatus === 'completed') setCompletedCount((c) => c + 1);
    } catch (err: any) {
      console.warn('Failed to update task status:', err);
    }
  };

  // Dismiss task
  const handleDismissTask = async (taskId: string) => {
    try {
      await dismissTask(taskId);
      setQueueTasks((prev) =>
        prev.map((t) => (t.id === taskId ? { ...t, status: 'dismissed' as QueueTaskStatus } : t))
      );
      setDismissedCount((d) => d + 1);
    } catch (err: any) {
      console.warn('Failed to dismiss task:', err);
    }
  };

  // Time budget change
  const handleTimeBudgetChange = (budget: number) => {
    setTimeBudget(budget);
    handleGenerateQueue(undefined, budget, false);
  };

  // Propose Actions Workflow Handler
  const handleProposeActions = async (items: ProposedActionItem[]) => {
    if (!folderPath.trim() || items.length === 0) return;
    try {
      const res = await previewActions(folderPath.trim(), items);
      setActionPreviews(res.previews);
      setIsActionReviewOpen(true);
    } catch (err: any) {
      setErrorMessage(`Failed to preview filesystem actions: ${err.message}`);
    }
  };

  // Select file to discuss with local AI
  const handleSelectFileForAI = (filePath: string) => {
    setChatPrompt(`Help me understand and organize this file from my workspace: "${filePath}".`);
    setIsChatOpen(true);
  };

  return (
    <div className="app-shell">
      {/* Top Navigation */}
      <Header
        health={health}
        loading={healthLoading}
        onRefreshHealth={refreshHealth}
        folderPath={folderPath}
        onOpenWorkspaceTab={() => setActiveTab('workspace')}
      />

      <main className="main-content">
        {/* Error notification banner */}
        {errorMessage && (
          <div
            style={{
              padding: '0.9rem 1.25rem',
              backgroundColor: 'var(--danger-bg)',
              border: '1px solid var(--danger-border)',
              borderRadius: 'var(--radius-md)',
              color: 'var(--danger-text)',
              marginBottom: '1.25rem',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem' }}>
              <AlertTriangle size={18} />
              <span style={{ fontSize: '0.88rem' }}>{errorMessage}</span>
            </div>
            <button
              onClick={() => setErrorMessage(null)}
              style={{ color: 'var(--danger-text)', fontWeight: 600, fontSize: '0.82rem', cursor: 'pointer' }}
            >
              Dismiss
            </button>
          </div>
        )}

        {/* Hero Scanner Banner */}
        <HeroScanner
          folderPath={folderPath}
          setFolderPath={setFolderPath}
          onScan={handleScan}
          onCancelScan={handleCancelScan}
          onGenerateQueue={() => handleGenerateQueue()}
          isScanning={isScanning}
          isGeneratingQueue={isGeneratingQueue}
          scanProgress={scanProgress}
        />

        {/* Navigation Tabs Header */}
        <div className="tabs-header">
          {/* 1. WORKSPACE VIEW */}
          <button
            className={`tab-btn ${activeTab === 'workspace' ? 'active' : ''}`}
            onClick={() => setActiveTab('workspace')}
            id="tab-workspace"
          >
            <FolderSearch size={16} />
            Workspace
          </button>

          {/* 2. OVERVIEW VIEW */}
          <button
            className={`tab-btn ${activeTab === 'overview' ? 'active' : ''}`}
            onClick={() => setActiveTab('overview')}
            id="tab-overview"
          >
            <PieChart size={16} />
            Overview
            {scanResult && (
              <span className="badge badge-low" style={{ fontSize: '0.7rem' }}>
                {scanResult.total_files} files
              </span>
            )}
          </button>

          {/* 4. ACTION QUEUE */}
          <button
            className={`tab-btn ${activeTab === 'queue' ? 'active' : ''}`}
            onClick={() => setActiveTab('queue')}
            id="tab-queue"
          >
            <Sparkles size={16} />
            Action Queue
            {queueTasks.length > 0 && (
              <span
                style={{
                  fontSize: '0.72rem',
                  padding: '0.1rem 0.45rem',
                  backgroundColor: 'var(--forest-100)',
                  borderRadius: 'var(--radius-full)',
                }}
              >
                {queueTasks.filter((t) => t.status === 'proposed' || t.status === 'approved').length}
              </span>
            )}
          </button>

          {/* 5. CLEANUP REVIEW */}
          <button
            className={`tab-btn ${activeTab === 'cleanup' ? 'active' : ''}`}
            onClick={() => setActiveTab('cleanup')}
            id="tab-cleanup"
          >
            <FolderArchive size={16} />
            Cleanup Review
            {duplicateResult && duplicateResult.total_duplicate_files > 0 && (
              <span
                style={{
                  fontSize: '0.72rem',
                  padding: '0.1rem 0.45rem',
                  backgroundColor: '#fee2e2',
                  color: '#991b1b',
                  borderRadius: 'var(--radius-full)',
                }}
              >
                {duplicateResult.total_duplicate_files}
              </span>
            )}
          </button>

          {/* 3. FORGOTTEN WORK */}
          <button
            className={`tab-btn ${activeTab === 'forgotten' ? 'active' : ''}`}
            onClick={() => setActiveTab('forgotten')}
            id="tab-forgotten"
          >
            <History size={16} />
            Forgotten Work
            {scanResult && scanResult.abandoned_files.length > 0 && (
              <span
                style={{
                  fontSize: '0.72rem',
                  padding: '0.1rem 0.45rem',
                  backgroundColor: '#fef3c7',
                  color: '#92400e',
                  borderRadius: 'var(--radius-full)',
                }}
              >
                {scanResult.abandoned_files.length}
              </span>
            )}
          </button>

          {/* 6. ACTIVITY HISTORY */}
          <button
            className={`tab-btn ${activeTab === 'history' ? 'active' : ''}`}
            onClick={() => setActiveTab('history')}
            id="tab-history"
          >
            <ShieldCheck size={16} />
            Activity History
          </button>

          {/* 7. SETTINGS */}
          <button
            className={`tab-btn ${activeTab === 'settings' ? 'active' : ''}`}
            onClick={() => setActiveTab('settings')}
            id="tab-settings"
          >
            <Sliders size={16} />
            Settings
          </button>

          {/* Backwards Compatibility Tabs for Existing Tests */}
          <button
            className={`tab-btn ${activeTab === 'duplicates' ? 'active' : ''}`}
            onClick={() => setActiveTab('duplicates')}
            id="tab-duplicates"
            style={{ fontSize: '0.82rem', opacity: 0.8 }}
          >
            <Copy size={14} />
            Duplicate Finder
          </button>

          <button
            className={`tab-btn ${activeTab === 'inspector' ? 'active' : ''}`}
            onClick={() => setActiveTab('inspector')}
            id="tab-inspector"
            style={{ fontSize: '0.82rem', opacity: 0.8 }}
          >
            <Layers size={14} />
            Clutter Breakdown
          </button>

          <button
            className={`tab-btn ${activeTab === 'findings' ? 'active' : ''}`}
            onClick={() => setActiveTab('findings')}
            id="tab-findings"
            style={{ fontSize: '0.82rem', opacity: 0.8 }}
          >
            <FileCheck size={14} />
            Deterministic Findings
          </button>
        </div>

        {/* =========================================================================
            TAB PANELS (Views 1 through 7)
           ========================================================================= */}

        {/* View 1: Workspace */}
        {activeTab === 'workspace' && (
          <WorkspaceView
            folderPath={folderPath}
            setFolderPath={setFolderPath}
            onScan={handleScan}
            onCancelScan={handleCancelScan}
            isScanning={isScanning}
            scanProgress={scanProgress}
            scanResult={scanResult}
            scanLimits={scanLimits}
            onUpdateLimits={handleUpdateLimits}
          />
        )}

        {/* View 2: Overview */}
        {activeTab === 'overview' && (
          <OverviewView
            scanResult={scanResult}
            health={health}
            onNavigateTab={(tab) => setActiveTab(tab)}
          />
        )}

        {/* View 4: Action Queue */}
        {activeTab === 'queue' && (
          <ActionQueueView
            tasks={queueTasks}
            summary={queueSummary}
            modelUsed={queueModelUsed}
            timeBudgetMinutes={timeBudget}
            totalEstimatedMinutes={queueTasks
              .filter((t) => t.status === 'proposed' || t.status === 'approved')
              .reduce((acc, t) => acc + t.estimated_minutes, 0)}
            completedCount={completedCount}
            dismissedCount={dismissedCount}
            onTimeBudgetChange={handleTimeBudgetChange}
            onUpdateStatus={handleUpdateTaskStatus}
            onDismissTask={handleDismissTask}
            onRefreshQueue={() => handleGenerateQueue(undefined, timeBudget, true)}
            onSelectFileForAI={handleSelectFileForAI}
            isGenerating={isGeneratingQueue}
            folderPath={folderPath}
          />
        )}

        {/* View 5: Cleanup Review */}
        {activeTab === 'cleanup' && (
          <CleanupReviewView
            scanResult={scanResult}
            duplicateResult={duplicateResult}
            folderPath={folderPath}
            onProposeActions={handleProposeActions}
            onRescanDuplicates={handleScanDuplicates}
            isScanningDuplicates={isDuplicateScanning}
          />
        )}

        {/* View 3: Forgotten Work */}
        {activeTab === 'forgotten' && (
          <ForgottenWorkView
            scanResult={scanResult}
            onSelectFileForAI={handleSelectFileForAI}
          />
        )}

        {/* View 6: Activity History */}
        {activeTab === 'history' && (
          <ActivityHistoryView folderPath={folderPath} />
        )}

        {/* View 7: Settings */}
        {activeTab === 'settings' && (
          <SettingsView
            health={health}
            onRefreshHealth={refreshHealth}
            folderPath={folderPath}
            scanLimits={scanLimits}
            onUpdateLimits={handleUpdateLimits}
            onResetLimits={handleResetLimits}
          />
        )}

        {/* Compatibility Views */}
        {activeTab === 'duplicates' && (
          <DuplicateFinderView
            duplicateResult={duplicateResult}
            onScanDuplicates={handleScanDuplicates}
            isScanning={isDuplicateScanning}
            folderPath={folderPath}
            onProposeActions={handleProposeActions}
          />
        )}

        {activeTab === 'inspector' && (
          <ClutterInspector scanResult={scanResult} />
        )}

        {activeTab === 'findings' && (
          <DeterministicFindingsView scanResult={scanResult} />
        )}
      </main>

      {/* Floating Local AI Assistant Launcher */}
      <button
        onClick={() => {
          setChatPrompt('');
          setIsChatOpen(true);
        }}
        style={{
          position: 'fixed',
          bottom: '2rem',
          right: '2rem',
          backgroundColor: 'var(--forest-800)',
          color: '#ffffff',
          borderRadius: 'var(--radius-full)',
          padding: '0.85rem 1.4rem',
          boxShadow: 'var(--shadow-lg)',
          display: 'flex',
          alignItems: 'center',
          gap: '0.6rem',
          fontWeight: 600,
          fontSize: '0.92rem',
          zIndex: 50,
          border: '1px solid rgba(255, 255, 255, 0.15)',
        }}
        id="ai-assistant-btn"
        aria-label="Open Local AI Assistant"
      >
        <MessageSquare size={17} />
        Ask Local AI
      </button>

      {/* Local AI Assistant Modal */}
      <LocalAIChatModal
        isOpen={isChatOpen}
        onClose={() => setIsChatOpen(false)}
        initialPrompt={chatPrompt}
        defaultModel={health?.ollama_model || 'qwen2.5:1.5b'}
      />

      {/* Filesystem Action Review Modal (PROPOSE -> PREVIEW -> APPROVE -> APPLY -> VERIFY -> UNDO) */}
      <ActionReviewModal
        isOpen={isActionReviewOpen}
        workspacePath={folderPath}
        previews={actionPreviews}
        onClose={() => setIsActionReviewOpen(false)}
      />

      {/* Footer */}
      <footer className="app-footer">
        <p>
          <strong>ProcrastinateOS</strong> &bull; "Stop postponing. Let your computer do the boring work."
          &nbsp;&bull;&nbsp; 100% Local Inference &bull; Privacy First &bull; Zero Cloud Uploads
        </p>
      </footer>
    </div>
  );
};

export default App;
