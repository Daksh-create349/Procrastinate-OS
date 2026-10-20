import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { WorkspaceView } from '../components/WorkspaceView';
import { OverviewView } from '../components/OverviewView';
import { CleanupReviewView } from '../components/CleanupReviewView';
import { ActivityHistoryView } from '../components/ActivityHistoryView';
import { SettingsView } from '../components/SettingsView';
import type { HealthStatus, ScanResult } from '../types';
import * as client from '../api/client';

vi.mock('../api/client', async () => {
  const actual = await vi.importActual('../api/client');
  return {
    ...actual,
    fetchAuditLog: vi.fn(),
    fetchSupportedDocumentFormats: vi.fn(),
    clearWorkspaceTasks: vi.fn(),
    undoAction: vi.fn(),
  };
});

const mockHealth: HealthStatus = {
  status: 'ok',
  app_name: 'ProcrastinateOS API',
  version: '0.1.0',
  ollama_connected: true,
  ollama_url: 'http://localhost:11434',
  ollama_model: 'qwen2.5:1.5b',
  ollama_model_present: true,
  available_models: ['qwen2.5:1.5b'],
  timestamp: new Date().toISOString(),
};

const mockScanResult: ScanResult = {
  root_path: '/mock/workspace',
  scanned_at: new Date().toISOString(),
  duration_seconds: 0.45,
  total_files: 42,
  total_size_bytes: 52428800,
  total_size_formatted: '50.0 MB',
  total_wasted_bytes: 10485760,
  total_wasted_formatted: '10.0 MB',
  categories: [
    { category: 'documents', count: 20, total_size_bytes: 20971520, total_size_formatted: '20.0 MB' },
    { category: 'code', count: 15, total_size_bytes: 10485760, total_size_formatted: '10.0 MB' },
    { category: 'media', count: 7, total_size_bytes: 20971520, total_size_formatted: '20.0 MB' },
  ],
  abandoned_files: [],
  largest_files: [
    {
      path: '/mock/workspace/large_dump.sql',
      relative_path: 'large_dump.sql',
      name: 'large_dump.sql',
      extension: '.sql',
      size_bytes: 25000000,
      size_formatted: '25.0 MB',
      category: 'database',
      mime_type: 'application/sql',
      content_format: 'text',
      is_previewable: true,
      modified_at: new Date().toISOString(),
      days_inactive: 30,
      is_likely_abandoned: false,
    },
  ],
  recent_files: [],
  duplicate_groups: [
    {
      checksum: '112233445566',
      file_size_bytes: 5242880,
      file_size_formatted: '5.0 MB',
      wasted_bytes: 5242880,
      wasted_formatted: '5.0 MB',
      files: ['/mock/workspace/data.csv', '/mock/workspace/data_copy.csv'],
      relative_files: ['data.csv', 'data_copy.csv'],
    },
  ],
  skipped_files: [
    {
      path: '/mock/workspace/.secret',
      relative_path: '.secret',
      reason: 'Permission denied accessing folder',
      error_type: 'permission_denied',
    },
  ],
  files: [],
  deterministic_findings: [
    {
      finding_id: 'find-dup-1',
      category: 'exact_duplicate',
      severity: 'medium',
      title: 'Exact Duplicate Pair',
      file_ids: ['f1', 'f2'],
      relative_paths: ['data.csv', 'data_copy.csv'],
      facts: ['Identical SHA-256 hash: 112233445566'],
      explanation: 'Byte-for-byte identical files wasting 5.0 MB storage.',
      recommended_next_step: 'Archive secondary copy',
      measured_facts: ['5.0 MB duplicate'],
      inferred_possibilities: [],
      storage_impact_bytes: 5242880,
      storage_impact_formatted: '5.0 MB',
    },
    {
      finding_id: 'find-ver-1',
      category: 'redundant_export',
      severity: 'low',
      title: 'Redundant Version Suffix',
      file_ids: ['f3'],
      relative_paths: ['notes_final_v2_FINAL.md'],
      facts: ['Filename matches version suffix pattern'],
      explanation: 'File contains messy duplicate version markers.',
      recommended_next_step: 'Rename to clean normalized name',
      measured_facts: ['Version suffix matched'],
      inferred_possibilities: [],
      storage_impact_bytes: 0,
      storage_impact_formatted: '0 B',
    },
  ],
  inventory_summary: {
    total_files: 42,
    total_size_bytes: 52428800,
    total_size_formatted: '50.0 MB',
    oldest_file_relative: 'legacy/archive.zip',
    oldest_file_date: '2023-01-15T00:00:00Z',
    newest_file_relative: 'notes.md',
    newest_file_date: '2026-10-19T00:00:00Z',
    largest_file_relative: 'large_dump.sql',
    largest_file_size_formatted: '25.0 MB',
    documents_extracted_count: 5,
    category_counts: { documents: 10, media: 2, code: 30 },
    category_sizes: { documents: 10485760, media: 10485760, code: 31457280 },
  },
};

describe('ProcrastinateOS Core Views', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // 1. Workspace View
  it('renders Workspace view with scope controls, recursion limits, and skipped file diagnostics', () => {
    const onScan = vi.fn();
    const onUpdateLimits = vi.fn();

    render(
      <WorkspaceView
        folderPath="/mock/workspace"
        setFolderPath={vi.fn()}
        onScan={onScan}
        isScanning={false}
        scanProgress={null}
        scanResult={mockScanResult}
        scanLimits={{
          maxDepth: 15,
          maxFiles: 50000,
          includeHidden: false,
          computeHashes: true,
          extractDocuments: true,
        }}
        onUpdateLimits={onUpdateLimits}
      />
    );

    expect(screen.getByText('Select Local Workspace')).toBeInTheDocument();
    expect(screen.getByText('Scan Scope & Safety Controls')).toBeInTheDocument();
    expect(screen.getByText('Max Directory Depth:')).toBeInTheDocument();
    expect(screen.getByText(/Permission denied accessing folder/i)).toBeInTheDocument();

    const scanBtn = screen.getByRole('button', { name: /Start Workspace Scan/i });
    fireEvent.click(scanBtn);
    expect(onScan).toHaveBeenCalledTimes(1);
  });

  // 2. Overview View
  it('renders Overview view with genuine workspace metrics, category breakdown, and findings', () => {
    const onNavigateTab = vi.fn();

    render(
      <OverviewView
        scanResult={mockScanResult}
        health={mockHealth}
        onNavigateTab={onNavigateTab}
      />
    );

    expect(screen.getByText('42')).toBeInTheDocument();
    expect(screen.getByText('50.0 MB')).toBeInTheDocument();
    expect(screen.getAllByText('10.0 MB').length).toBeGreaterThan(0);
    expect(screen.getByText('Storage Breakdown by Category')).toBeInTheDocument();
    expect(screen.getByText('legacy/archive.zip')).toBeInTheDocument();
    expect(screen.getByText('Exact Duplicate Pair')).toBeInTheDocument();

    const cleanupBtn = screen.getByRole('button', { name: /Review in Cleanup/i });
    fireEvent.click(cleanupBtn);
    expect(onNavigateTab).toHaveBeenCalledWith('cleanup');
  });

  // 3. Cleanup Review View
  it('renders Cleanup Review view with duplicates, large files, version suffixes, and propose actions', () => {
    const onProposeActions = vi.fn();

    render(
      <CleanupReviewView
        scanResult={mockScanResult}
        duplicateResult={null}
        folderPath="/mock/workspace"
        onProposeActions={onProposeActions}
      />
    );

    expect(screen.getByText('Duplicate Set #1')).toBeInTheDocument();
    expect(screen.getByText('data.csv')).toBeInTheDocument();
    expect(screen.getByText('data_copy.csv')).toBeInTheDocument();

    // Click "Archive Copy"
    const archiveBtn = screen.getByRole('button', { name: /Archive Copy/i });
    fireEvent.click(archiveBtn);

    expect(onProposeActions).toHaveBeenCalledWith([
      {
        operation_type: 'move_to_archive',
        source_relative_path: 'data_copy.csv',
        target_name_or_folder: '_archive/duplicates',
        reason: 'Archive redundant copy of data.csv',
      },
    ]);

    // Switch to Redundant Suffixes subtab
    const versionsTab = screen.getByRole('button', { name: /Redundant Suffixes/i });
    fireEvent.click(versionsTab);

    expect(screen.getByText('notes_final_v2_FINAL.md')).toBeInTheDocument();
    const renameBtn = screen.getByRole('button', { name: /Propose Clean Rename/i });
    fireEvent.click(renameBtn);

    expect(onProposeActions).toHaveBeenCalledWith([
      {
        operation_type: 'rename',
        source_relative_path: 'notes_final_v2_FINAL.md',
        target_name_or_folder: 'notes.md',
        reason: 'Normalize redundant version suffix: Redundant Version Suffix',
      },
    ]);
  });

  // 4. Activity History View
  it('renders Activity History view with audit records and triggers undo', async () => {
    vi.mocked(client.fetchAuditLog).mockResolvedValueOnce({
      workspace_path: '/mock/workspace',
      total_count: 1,
      records: [
        {
          action_id: 'act-audit-99',
          workspace_path: '/mock/workspace',
          operation_type: 'move_to_archive',
          source_relative_path: 'temp/draft.txt',
          destination_relative_path: '_archive/temp/draft.txt',
          file_size_bytes: 2048,
          pre_hash: 'aabbccdd',
          post_hash: 'aabbccdd',
          reason: 'Archive duplicate draft',
          status: 'applied',
          can_undo: true,
          created_at: new Date().toISOString(),
          applied_at: new Date().toISOString(),
        },
      ],
    });

    render(<ActivityHistoryView folderPath="/mock/workspace" />);

    await waitFor(() => {
      expect(screen.getByText('Filesystem Audit Manifest')).toBeInTheDocument();
      expect(screen.getByText('Archive duplicate draft')).toBeInTheDocument();
      expect(screen.getByText('Undo Action')).toBeInTheDocument();
    });
  });

  // 5. Settings View
  it('renders Settings view with Ollama details, limits sliders, supported formats, and clear tools', async () => {
    vi.mocked(client.fetchSupportedDocumentFormats).mockResolvedValueOnce({
      supported_extensions: ['.txt', '.md', '.pdf', '.docx', '.csv', '.json'],
      max_file_size_bytes: 10485760,
      max_chars_per_doc: 60000,
    });

    vi.mocked(client.clearWorkspaceTasks).mockResolvedValueOnce({
      message: 'Cleared',
      count: 3,
    });

    const onRefreshHealth = vi.fn();
    const onUpdateLimits = vi.fn();
    const onResetLimits = vi.fn();

    render(
      <SettingsView
        health={mockHealth}
        onRefreshHealth={onRefreshHealth}
        folderPath="/mock/workspace"
        scanLimits={{
          maxDepth: 15,
          maxFiles: 50000,
          includeHidden: false,
          computeHashes: true,
          extractDocuments: true,
        }}
        onUpdateLimits={onUpdateLimits}
        onResetLimits={onResetLimits}
      />
    );

    expect(screen.getByText('Local AI Model & Ollama Engine')).toBeInTheDocument();
    expect(screen.getByText('http://localhost:11434')).toBeInTheDocument();
    expect(screen.getByText('Model downloaded & ready')).toBeInTheDocument();

    await waitFor(() => {
      expect(screen.getByText('.pdf')).toBeInTheDocument();
      expect(screen.getByText('.docx')).toBeInTheDocument();
    });

    // Test clear proposed tasks button
    const clearBtn = screen.getByRole('button', { name: /Clear Proposed Tasks/i });
    fireEvent.click(clearBtn);

    await waitFor(() => {
      expect(client.clearWorkspaceTasks).toHaveBeenCalledWith('/mock/workspace', true);
      expect(screen.getByText('Cleared 3 proposed task(s).')).toBeInTheDocument();
    });
  });
});
