import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { ForgottenWorkView } from '../components/ForgottenWorkView';
import * as apiClient from '../api/client';
import type { ScanResult } from '../types';

const mockScanResult: ScanResult = {
  root_path: '/Users/test/workspace',
  scanned_at: new Date().toISOString(),
  duration_seconds: 0.5,
  total_files: 4,
  total_size_bytes: 4096,
  total_size_formatted: '4.0 KB',
  total_wasted_bytes: 512,
  total_wasted_formatted: '512 B',
  categories: [],
  abandoned_files: [],
  largest_files: [],
  recent_files: [],
  duplicate_groups: [],
  skipped_files: [],
  files: [],
  extracted_documents: [],
  extraction_summary: { total_documents: 2, success: 2, empty: 0, password_protected: 0, image_only_or_empty: 0, malformed: 0, skipped_size: 0, timeout: 0, unsupported: 0, permission_denied: 0, error: 0, total_chunks: 2, total_chars: 500 },
  deterministic_findings: [],
  findings_summary: {
    total_findings: 0,
    by_category: {},
    by_severity: {},
    total_potential_savings_bytes: 0,
    total_potential_savings_formatted: '0 B',
    total_files_flagged: 0,
  },
};

describe('ForgottenWorkView & Local AI Component', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('renders subtabs and switches between Recovery and Semantic Grouping', () => {
    render(<ForgottenWorkView scanResult={mockScanResult} onSelectFileForAI={() => {}} />);

    // Check subtab buttons
    const recoveryTab = screen.getByRole('button', { name: /Forgotten Work & Drafts/i });
    const groupingTab = screen.getByRole('button', { name: /Semantic Project Groups/i });
    expect(recoveryTab).toBeInTheDocument();
    expect(groupingTab).toBeInTheDocument();

    // Click grouping tab
    fireEvent.click(groupingTab);
    expect(screen.getByRole('button', { name: /Discover Project Groups/i })).toBeInTheDocument();
  });

  it('triggers Forgotten-Work Recovery and renders recovered tasks and quotes', async () => {
    vi.spyOn(apiClient, 'fetchForgottenWorkRecovery').mockResolvedValueOnce({
      status: 'success',
      items: [
        {
          item_id: 'fw-1',
          title: 'Calibrate Mars stereoscopic cameras',
          file_id: 'fid-123',
          relative_path: 'telemetry/camera.txt',
          task_type: 'todo',
          evidence_excerpt: 'TODO: calibrate camera disparity maps',
          section_reference: 'Section: Optics',
          suggested_action: 'Run benchmark with terrain simulation lighting',
          confidence: 'high',
        },
      ],
      model_used: 'qwen2.5:1.5b',
      analyzed_documents_count: 1,
      duration_seconds: 2.1,
    });

    render(<ForgottenWorkView scanResult={mockScanResult} onSelectFileForAI={() => {}} />);

    const runBtn = screen.getByRole('button', { name: /Recover Forgotten Work/i });
    fireEvent.click(runBtn);

    await waitFor(() => {
      expect(screen.getByText(/Calibrate Mars stereoscopic cameras/i)).toBeInTheDocument();
      expect(screen.getByText(/TODO: calibrate camera disparity maps/i)).toBeInTheDocument();
      expect(screen.getByText(/telemetry\/camera\.txt/i)).toBeInTheDocument();
    });
  });

  it('displays fix instructions banner when Ollama model is unavailable', async () => {
    vi.spyOn(apiClient, 'fetchForgottenWorkRecovery').mockResolvedValueOnce({
      status: 'model_unavailable',
      items: [],
      model_used: 'qwen2.5:1.5b',
      duration_seconds: 0.1,
      error_message: "Local Ollama model 'qwen2.5:1.5b' is unavailable.",
      fix_suggestion: "Run 'ollama pull qwen2.5:1.5b' in terminal.",
    });

    render(<ForgottenWorkView scanResult={mockScanResult} onSelectFileForAI={() => {}} />);

    const runBtn = screen.getByRole('button', { name: /Recover Forgotten Work/i });
    fireEvent.click(runBtn);

    await waitFor(() => {
      expect(screen.getByText(/Local Ollama model 'qwen2.5:1.5b' is unavailable/i)).toBeInTheDocument();
      expect(screen.getByText(/ollama pull qwen2.5:1.5b/i)).toBeInTheDocument();
    });
  });
});
