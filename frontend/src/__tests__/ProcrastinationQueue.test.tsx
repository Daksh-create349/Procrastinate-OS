import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { ActionQueueView } from '../components/ActionQueueView';
import type { QueueTask } from '../types';

const mockTasks: QueueTask[] = [
  {
    id: 'task-1',
    workspace_path: '/mock/workspace',
    title: 'Review duplicate copies of backup.zip',
    reason: 'Identical bit-for-bit copies found. Reclaiming secondary copy frees 15.0 MB.',
    supporting_files: [
      { relative_path: 'archive/backup.zip', name: 'backup.zip' },
      { relative_path: 'downloads/backup_copy.zip', name: 'backup_copy.zip' },
    ],
    evidence: '2 copies match exact cryptographic checksum e3b0c442. Recoverable: 15.0 MB.',
    suggested_action: "Preserve canonical copy at 'archive/backup.zip' and delete 1 redundant copy.",
    estimated_minutes: 3,
    effort_label: 'Est. ~3 min (approximate effort)',
    status: 'proposed',
    category: 'duplicate_cleanup',
    priority_score: 95,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  },
  {
    id: 'task-2',
    workspace_path: '/mock/workspace',
    title: 'Address unfinished task in chapter1.txt',
    reason: 'Explicit unfinished task or next step detected directly in document text.',
    supporting_files: [{ relative_path: 'novel/chapter1.txt', name: 'chapter1.txt' }],
    evidence: 'Quoted text: "TODO: write climax scene for manor mystery"',
    suggested_action: "Open 'novel/chapter1.txt' and resolve the item.",
    estimated_minutes: 5,
    effort_label: 'Est. ~5 min (approximate effort)',
    status: 'approved',
    category: 'todo_review',
    priority_score: 90,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  },
];

describe('ProcrastinationQueue Component', () => {
  const onTimeBudgetChange = vi.fn();
  const onUpdateStatus = vi.fn();
  const onDismissTask = vi.fn();
  const onRefreshQueue = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders time budget switcher chips and handles budget switching', () => {
    render(
      <ActionQueueView
        tasks={mockTasks}
        summary="Tailored 15-minute action queue"
        modelUsed="qwen2.5:1.5b"
        timeBudgetMinutes={15}
        totalEstimatedMinutes={8}
        completedCount={0}
        dismissedCount={0}
        onTimeBudgetChange={onTimeBudgetChange}
        onUpdateStatus={onUpdateStatus}
        onDismissTask={onDismissTask}
        onRefreshQueue={onRefreshQueue}
        isGenerating={false}
        folderPath="/mock/workspace"
      />
    );

    // Verify budget chips by unique descriptive text
    expect(screen.getByRole('button', { name: /Quick Win/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Deep Breath/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Focus Session/i })).toBeInTheDocument();

    // Click 30 min budget
    fireEvent.click(screen.getByRole('button', { name: /Focus Session/i }));
    expect(onTimeBudgetChange).toHaveBeenCalledWith(30);

    // Click 5 min budget
    fireEvent.click(screen.getByRole('button', { name: /Quick Win/i }));
    expect(onTimeBudgetChange).toHaveBeenCalledWith(5);
  });

  it('renders task cards with effort labels, reasons, and next actions', () => {
    render(
      <ActionQueueView
        tasks={mockTasks}
        summary="Tailored 15-minute action queue"
        timeBudgetMinutes={15}
        totalEstimatedMinutes={8}
        completedCount={0}
        dismissedCount={0}
        onTimeBudgetChange={onTimeBudgetChange}
        onUpdateStatus={onUpdateStatus}
        onDismissTask={onDismissTask}
        onRefreshQueue={onRefreshQueue}
        isGenerating={false}
        folderPath="/mock/workspace"
      />
    );

    expect(screen.getByText('Review duplicate copies of backup.zip')).toBeInTheDocument();
    expect(screen.getByText(/Est\. ~3 min \(approximate effort\)/i)).toBeInTheDocument();
    expect(screen.getByText(/Identical bit-for-bit copies found/i)).toBeInTheDocument();
    expect(screen.getByText(/Preserve canonical copy at 'archive\/backup\.zip'/i)).toBeInTheDocument();

    expect(screen.getByText('Address unfinished task in chapter1.txt')).toBeInTheDocument();
  });

  it('handles task status updates (Complete, Approve, Block, Dismiss)', () => {
    render(
      <ActionQueueView
        tasks={mockTasks}
        summary="Tailored 15-minute action queue"
        timeBudgetMinutes={15}
        totalEstimatedMinutes={8}
        completedCount={0}
        dismissedCount={0}
        onTimeBudgetChange={onTimeBudgetChange}
        onUpdateStatus={onUpdateStatus}
        onDismissTask={onDismissTask}
        onRefreshQueue={onRefreshQueue}
        isGenerating={false}
        folderPath="/mock/workspace"
      />
    );

    // Click Complete Task on first task
    const completeBtns = screen.getAllByRole('button', { name: /Complete Task/i });
    fireEvent.click(completeBtns[0]);
    expect(onUpdateStatus).toHaveBeenCalledWith('task-1', 'completed');

    // Click Approve on task-1 (which is proposed)
    const approveBtn = screen.getByRole('button', { name: /Approve/i });
    fireEvent.click(approveBtn);
    expect(onUpdateStatus).toHaveBeenCalledWith('task-1', 'approved');

    // Click Dismiss on task-1 via exact title
    const dismissBtns = screen.getAllByTitle(/Dismiss task/i);
    fireEvent.click(dismissBtns[0]);
    expect(onDismissTask).toHaveBeenCalledWith('task-1');
  });

  it('toggles expandable evidence and displays source files and quotes', () => {
    render(
      <ActionQueueView
        tasks={mockTasks}
        summary="Tailored 15-minute action queue"
        timeBudgetMinutes={15}
        totalEstimatedMinutes={8}
        completedCount={0}
        dismissedCount={0}
        onTimeBudgetChange={onTimeBudgetChange}
        onUpdateStatus={onUpdateStatus}
        onDismissTask={onDismissTask}
        onRefreshQueue={onRefreshQueue}
        isGenerating={false}
        folderPath="/mock/workspace"
      />
    );

    const toggleEvidenceBtns = screen.getAllByRole('button', { name: /Source Evidence & Files/i });
    fireEvent.click(toggleEvidenceBtns[0]);

    expect(screen.getByText(/2 copies match exact cryptographic checksum e3b0c442/i)).toBeInTheDocument();
    expect(screen.getByText('archive/backup.zip')).toBeInTheDocument();
    expect(screen.getByText('downloads/backup_copy.zip')).toBeInTheDocument();
  });

  it('renders celebratory state when all tasks in budget are completed', () => {
    render(
      <ActionQueueView
        tasks={[]}
        summary="Session completed"
        timeBudgetMinutes={15}
        totalEstimatedMinutes={0}
        completedCount={3}
        dismissedCount={0}
        onTimeBudgetChange={onTimeBudgetChange}
        onUpdateStatus={onUpdateStatus}
        onDismissTask={onDismissTask}
        onRefreshQueue={onRefreshQueue}
        isGenerating={false}
        folderPath="/mock/workspace"
      />
    );

    expect(screen.getByText(/You crushed your 15-minute session!/i)).toBeInTheDocument();
  });
});
