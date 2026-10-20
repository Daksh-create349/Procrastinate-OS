import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import App from '../App';
import * as apiClient from '../api/client';

describe('ProcrastinateOS Frontend App', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('renders brand heading and tagline', async () => {
    vi.spyOn(apiClient, 'fetchHealth').mockResolvedValueOnce({
      status: 'ok',
      app_name: 'ProcrastinateOS API',
      version: '0.1.0',
      ollama_connected: true,
      ollama_url: 'http://localhost:11434',
      ollama_model: 'qwen2.5:1.5b',
      ollama_model_present: true,
      available_models: ['qwen2.5:1.5b'],
      timestamp: new Date().toISOString(),
    });

    render(<App />);

    expect(screen.getByRole('heading', { level: 1, name: 'ProcrastinateOS' })).toBeInTheDocument();
    expect(
      screen.getByText('Stop postponing. Let your computer do the boring work.')
    ).toBeInTheDocument();
    expect(screen.getByText('Turn digital chaos into clarity.')).toBeInTheDocument();

    await waitFor(() => {
      expect(screen.getByText(/Ollama: qwen2.5:1.5b/i)).toBeInTheDocument();
    });
  });

  it('allows switching between tabs', async () => {
    vi.spyOn(apiClient, 'fetchHealth').mockResolvedValueOnce({
      status: 'ok',
      app_name: 'ProcrastinateOS API',
      version: '0.1.0',
      ollama_connected: true,
      ollama_url: 'http://localhost:11434',
      ollama_model: 'qwen2.5:1.5b',
      ollama_model_present: true,
      available_models: ['qwen2.5:1.5b'],
      timestamp: new Date().toISOString(),
    });

    render(<App />);

    // Click Clutter Breakdown tab
    const inspectorTab = screen.getByRole('button', { name: /Clutter Breakdown/i });
    fireEvent.click(inspectorTab);
    expect(screen.getByText(/Folder Not Scanned Yet/i)).toBeInTheDocument();

    // Click Duplicate Finder tab
    const duplicatesTab = screen.getByRole('button', { name: /Duplicate Finder/i });
    fireEvent.click(duplicatesTab);
    expect(screen.getByText(/Duplicate Scanner Ready/i)).toBeInTheDocument();

    // Click Forgotten Work tab
    const forgottenTab = screen.getByRole('button', { name: /Forgotten Work/i });
    fireEvent.click(forgottenTab);
    expect(screen.getByText(/Forgotten Work & Project Recovery/i)).toBeInTheDocument();
  });

  it('handles native folder picker selection', async () => {
    vi.spyOn(apiClient, 'fetchHealth').mockResolvedValueOnce({
      status: 'ok',
      app_name: 'ProcrastinateOS API',
      version: '0.1.0',
      ollama_connected: true,
      ollama_url: 'http://localhost:11434',
      ollama_model: 'qwen2.5:1.5b',
      ollama_model_present: true,
      available_models: ['qwen2.5:1.5b'],
      timestamp: new Date().toISOString(),
    });

    vi.spyOn(apiClient, 'pickFolderNative').mockResolvedValueOnce({
      selected_path: '/Users/test/SelectedWorkspace',
      supported: true,
      message: 'Folder selected successfully.',
    });

    render(<App />);

    const browseBtn = screen.getByRole('button', { name: /Browse.../i });
    fireEvent.click(browseBtn);

    await waitFor(() => {
      const input = screen.getByLabelText('Folder Path Input') as HTMLInputElement;
      expect(input.value).toBe('/Users/test/SelectedWorkspace');
    });
  });

  it('handles folder scanning and populates results', async () => {
    vi.spyOn(apiClient, 'fetchHealth').mockResolvedValueOnce({
      status: 'ok',
      app_name: 'ProcrastinateOS API',
      version: '0.1.0',
      ollama_connected: true,
      ollama_url: 'http://localhost:11434',
      ollama_model: 'qwen2.5:1.5b',
      ollama_model_present: true,
      available_models: ['qwen2.5:1.5b'],
      timestamp: new Date().toISOString(),
    });

    vi.spyOn(apiClient, 'startScanJob').mockResolvedValueOnce({
      job_id: 'scan-test1234',
    });

    vi.spyOn(apiClient, 'getScanProgress').mockResolvedValueOnce({
      job_id: 'scan-test1234',
      status: 'completed',
      folder_path: '/fake/test/dir',
      files_scanned: 12,
      bytes_scanned: 5242880,
      bytes_scanned_formatted: '5.0 MB',
      current_directory: '/fake/test/dir',
      errors_count: 0,
      elapsed_seconds: 0.45,
      is_complete: true,
    });

    vi.spyOn(apiClient, 'getScanResult').mockResolvedValueOnce({
      root_path: '/fake/test/dir',
      scanned_at: new Date().toISOString(),
      duration_seconds: 0.45,
      total_files: 12,
      total_size_bytes: 5242880,
      total_size_formatted: '5.0 MB',
      categories: [
        {
          category: 'Documents',
          count: 8,
          total_size_bytes: 3145728,
          total_size_formatted: '3.0 MB',
        },
        {
          category: 'Code',
          count: 4,
          total_size_bytes: 2097152,
          total_size_formatted: '2.0 MB',
        },
      ],
      abandoned_files: [],
      largest_files: [],
      recent_files: [],
      duplicate_groups: [],
      skipped_files: [],
      total_wasted_bytes: 0,
      total_wasted_formatted: '0 B',
      files: [],
    });

    vi.spyOn(apiClient, 'generateProcrastinationQueue').mockResolvedValueOnce({
      workspace_path: '/fake/test/dir',
      time_budget_minutes: 15,
      total_estimated_minutes: 5,
      summary: 'Found 12 messy files ready for cleanup.',
      tasks: [
        {
          id: 'act-1',
          workspace_path: '/fake/test/dir',
          title: 'Review 8 older document files',
          reason: 'Batch review will clear backlog quickly.',
          supporting_files: [{ relative_path: 'doc1.txt' }],
          evidence: '8 inactive files',
          suggested_action: 'Inspect files in folder',
          estimated_minutes: 5,
          effort_label: 'Est. ~5 min (approximate effort)',
          status: 'proposed',
          category: 'review',
          priority_score: 90,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        },
      ],
      completed_count: 0,
      dismissed_count: 0,
      model_used: 'qwen2.5:1.5b',
      generated_at: new Date().toISOString(),
    });

    render(<App />);

    const scanBtn = screen.getByRole('button', { name: /Scan Folder/i });
    fireEvent.click(scanBtn);

    await waitFor(() => {
      expect(screen.getByText('Review 8 older document files')).toBeInTheDocument();
      expect(screen.getByText('Found 12 messy files ready for cleanup.')).toBeInTheDocument();
    });
  });

  it('displays document extraction results and opens chunk inspector modal', async () => {
    vi.spyOn(apiClient, 'fetchHealth').mockResolvedValueOnce({
      status: 'ok',
      app_name: 'ProcrastinateOS API',
      version: '0.1.0',
      ollama_connected: true,
      ollama_url: 'http://localhost:11434',
      ollama_model: 'qwen2.5:1.5b',
      ollama_model_present: true,
      available_models: ['qwen2.5:1.5b'],
      timestamp: new Date().toISOString(),
    });

    vi.spyOn(apiClient, 'startScanJob').mockResolvedValueOnce({
      job_id: 'scan-doc123',
    });

    vi.spyOn(apiClient, 'getScanProgress').mockResolvedValueOnce({
      job_id: 'scan-doc123',
      status: 'completed',
      folder_path: '/fake/test/docs',
      files_scanned: 3,
      bytes_scanned: 10240,
      bytes_scanned_formatted: '10.0 KB',
      current_directory: '/fake/test/docs',
      errors_count: 0,
      elapsed_seconds: 0.12,
      is_complete: true,
    });

    vi.spyOn(apiClient, 'getScanResult').mockResolvedValueOnce({
      root_path: '/fake/test/docs',
      scanned_at: new Date().toISOString(),
      duration_seconds: 0.12,
      total_files: 3,
      total_size_bytes: 10240,
      total_size_formatted: '10.0 KB',
      categories: [
        {
          category: 'Documents',
          count: 3,
          total_size_bytes: 10240,
          total_size_formatted: '10.0 KB',
        },
      ],
      abandoned_files: [],
      largest_files: [],
      recent_files: [],
      duplicate_groups: [],
      skipped_files: [],
      total_wasted_bytes: 0,
      total_wasted_formatted: '0 B',
      files: [],
      extracted_documents: [
        {
          file_id: 'doc-hash-1',
          path: '/fake/test/docs/notes.md',
          relative_path: 'notes.md',
          extension: '.md',
          status: 'success',
          total_chars: 420,
          total_chunks: 1,
          sections_count: 1,
          duration_seconds: 0.01,
          chunks: [
            {
              chunk_id: 'chk-1',
              file_id: 'doc-hash-1',
              relative_path: 'notes.md',
              reference: 'Section: Project Notes',
              char_count: 420,
              token_estimate: 105,
              text: 'Project architecture plan and milestones.',
            },
          ],
        },
        {
          file_id: 'doc-hash-2',
          path: '/fake/test/docs/secure.pdf',
          relative_path: 'secure.pdf',
          extension: '.pdf',
          status: 'password_protected',
          total_chars: 0,
          total_chunks: 0,
          sections_count: 0,
          duration_seconds: 0.005,
          chunks: [],
          error_message: 'PDF is password protected and encrypted',
        },
      ],
      extraction_summary: {
        success: 1,
        password_protected: 1,
      },
    });

    render(<App />);

    const scanBtn = screen.getByRole('button', { name: /Scan Folder/i });
    fireEvent.click(scanBtn);

    // Switch to Clutter Breakdown tab
    const inspectorTab = screen.getByRole('button', { name: /Clutter Breakdown/i });
    fireEvent.click(inspectorTab);

    await waitFor(() => {
      expect(screen.getByText(/Safe Document Extraction \(2\)/i)).toBeInTheDocument();
      expect(screen.getByText('notes.md')).toBeInTheDocument();
      expect(screen.getByText('secure.pdf')).toBeInTheDocument();
      expect(screen.getByText(/PDF is password protected/i)).toBeInTheDocument();
    });

    // Click "View Chunks" for notes.md
    const viewButtons = screen.getAllByRole('button', { name: /View Chunks/i });
    fireEvent.click(viewButtons[0]);

    // Modal should now be open
    await waitFor(() => {
      expect(screen.getByText(/Isolated Untrusted Data/i)).toBeInTheDocument();
      expect(screen.getByText(/Section: Project Notes/i)).toBeInTheDocument();
      expect(screen.getByText(/Project architecture plan and milestones\./i)).toBeInTheDocument();
    });

    // Close modal
    const closeBtn = screen.getByRole('button', { name: /Close modal/i });
    fireEvent.click(closeBtn);

    await waitFor(() => {
      expect(screen.queryByText(/Isolated Untrusted Data/i)).not.toBeInTheDocument();
    });
  });

  it('renders deterministic findings with measured facts and inferred possibilities', async () => {
    vi.spyOn(apiClient, 'fetchHealth').mockResolvedValueOnce({
      status: 'ok',
      app_name: 'ProcrastinateOS API',
      version: '0.1.0',
      ollama_connected: false,
      ollama_url: 'http://localhost:11434',
      ollama_model: 'qwen2.5:1.5b',
      ollama_model_present: false,
      available_models: [],
      timestamp: new Date().toISOString(),
    });

    vi.spyOn(apiClient, 'startScanJob').mockResolvedValueOnce({
      job_id: 'scan-findings-1',
    });

    vi.spyOn(apiClient, 'getScanProgress').mockResolvedValueOnce({
      job_id: 'scan-findings-1',
      status: 'completed',
      folder_path: '/fake/workspace',
      files_scanned: 5,
      bytes_scanned: 104857600,
      bytes_scanned_formatted: '100 MB',
      current_directory: '/fake/workspace',
      errors_count: 0,
      elapsed_seconds: 0.15,
      is_complete: true,
    });

    vi.spyOn(apiClient, 'getScanResult').mockResolvedValueOnce({
      root_path: '/fake/workspace',
      scanned_at: new Date().toISOString(),
      duration_seconds: 0.15,
      total_files: 5,
      total_size_bytes: 104857600,
      total_size_formatted: '100 MB',
      categories: [
        { category: 'Documents', count: 3, total_size_bytes: 52428800, total_size_formatted: '50 MB' },
        { category: 'Code', count: 2, total_size_bytes: 52428800, total_size_formatted: '50 MB' },
      ],
      abandoned_files: [],
      largest_files: [],
      recent_files: [],
      duplicate_groups: [],
      skipped_files: [],
      total_wasted_bytes: 20971520,
      total_wasted_formatted: '20 MB',
      files: [],
      deterministic_findings: [
        {
          finding_id: 'find_exact_duplicate_123',
          category: 'exact_duplicate',
          severity: 'high',
          title: 'Exact Duplicate: dataset.csv (2 copies)',
          file_ids: ['id1', 'id2'],
          relative_paths: ['data/dataset.csv', 'backup/dataset.csv'],
          facts: ['SHA-256: e3b0c442...', 'Size: 10 MB', 'Wasted: 10 MB'],
          explanation: 'Found 2 files sharing exact SHA-256 hash.',
          recommended_next_step: 'Preserve canonical copy at data/dataset.csv and delete duplicate.',
          measured_facts: ['SHA-256 checksum: e3b0c442...', 'Identical byte size: 10 MB across 2 files'],
          inferred_possibilities: ['Secondary copies are likely duplicate backups or repeated downloads.'],
          storage_impact_bytes: 10485760,
          storage_impact_formatted: '10 MB',
        },
        {
          finding_id: 'find_unfinished_work_456',
          category: 'unfinished_work',
          severity: 'medium',
          title: 'Unfinished Work: TODO in roadmap.md',
          file_ids: ['id3'],
          relative_paths: ['roadmap.md'],
          facts: ['Marker: TODO', 'Location: Section 1'],
          explanation: 'Found unfinished work marker TODO at Section 1 in roadmap.md.',
          recommended_next_step: 'Review TODO and schedule completion.',
          measured_facts: ['Explicit marker keyword: TODO', 'Document location: Section 1 (roadmap.md)'],
          inferred_possibilities: ['Author explicitly left note for pending feature work.'],
          storage_impact_bytes: 0,
          storage_impact_formatted: '0 B',
          metadata: { marker: 'TODO' },
        },
      ],
      findings_summary: {
        total_findings: 2,
        by_category: { exact_duplicate: 1, unfinished_work: 1 },
        by_severity: { high: 1, medium: 1 },
        total_potential_savings_bytes: 10485760,
        total_potential_savings_formatted: '10 MB',
        total_files_flagged: 3,
      },
      inventory_summary: {
        total_files: 5,
        total_size_bytes: 104857600,
        total_size_formatted: '100 MB',
        category_counts: { Documents: 3, Code: 2 },
        category_sizes: { Documents: 52428800, Code: 52428800 },
        documents_extracted_count: 2,
      },
    });

    render(<App />);

    const scanBtn = screen.getByRole('button', { name: /Scan Folder/i });
    fireEvent.click(scanBtn);

    // Switch to Deterministic Findings tab
    const findingsTab = screen.getByRole('button', { name: /Deterministic Findings/i });
    fireEvent.click(findingsTab);

    await waitFor(() => {
      expect(screen.getByText('Deterministic File Analysis Engine')).toBeInTheDocument();
      expect(screen.getByText(/Zero model hallucination/i)).toBeInTheDocument();
      expect(screen.getByText(/Exact Duplicate: dataset\.csv/i)).toBeInTheDocument();
      expect(screen.getByText(/Unfinished Work: TODO in roadmap\.md/i)).toBeInTheDocument();
      expect(screen.getByText('Preserve canonical copy at data/dataset.csv and delete duplicate.')).toBeInTheDocument();
    });

    // Verify Measured Facts and Inferred Possibilities are distinct
    expect(screen.getAllByText('Measured Facts').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Inferred Possibilities').length).toBeGreaterThan(0);
  });
});


