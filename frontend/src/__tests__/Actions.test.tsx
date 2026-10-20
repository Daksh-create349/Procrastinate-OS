import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { ActionReviewModal } from '../components/ActionReviewModal';
import { ActionAuditHistoryView } from '../components/ActionAuditHistoryView';
import { DuplicateFinderView } from '../components/DuplicateFinderView';
import type {
  ApplyActionsResponse,
  DuplicateResult,
  FilesystemActionPreview,
} from '../types';
import * as client from '../api/client';

vi.mock('../api/client', async () => {
  const actual = await vi.importActual('../api/client');
  return {
    ...actual,
    applyActions: vi.fn(),
    undoAction: vi.fn(),
    fetchAuditLog: vi.fn(),
  };
});

const mockPreviews: FilesystemActionPreview[] = [
  {
    action_id: 'act-1',
    workspace_path: '/test/workspace',
    operation_type: 'move_to_archive',
    source_relative_path: 'docs/duplicate_v1.pdf',
    destination_relative_path: '_archive/docs/duplicate_v1.pdf',
    source_file_exists: true,
    destination_file_exists: false,
    source_size_bytes: 1048576,
    source_size_formatted: '1.0 MB',
    source_sha256: 'abcdef1234567890',
    reason: 'Archive redundant copy of original docs.pdf',
    status: 'previewed',
    can_apply: true,
    warnings: [],
  },
  {
    action_id: 'act-2',
    workspace_path: '/test/workspace',
    operation_type: 'rename',
    source_relative_path: 'notes_FINAL_v2.txt',
    destination_relative_path: 'notes_clean.txt',
    source_file_exists: true,
    destination_file_exists: true,
    source_size_bytes: 2048,
    source_size_formatted: '2.0 KB',
    source_sha256: '9876543210fedcba',
    reason: 'Normalize version suffixes',
    status: 'previewed',
    can_apply: false,
    warnings: ['Destination already exists! Overwriting is strictly prohibited.'],
  },
];

describe('Filesystem Action System Components', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('ActionReviewModal', () => {
    it('renders proposal preview with original path, destination, reason, and safety statuses', () => {
      render(
        <ActionReviewModal
          isOpen={true}
          workspacePath="/test/workspace"
          previews={mockPreviews}
          onClose={vi.fn()}
        />
      );

      expect(screen.getByText('Filesystem Action Review')).toBeInTheDocument();
      expect(screen.getByText('Archive redundant copy of original docs.pdf')).toBeInTheDocument();
      expect(screen.getByText('docs/duplicate_v1.pdf')).toBeInTheDocument();
      expect(screen.getByText('_archive/docs/duplicate_v1.pdf')).toBeInTheDocument();

      // Check collision warning on act-2
      expect(screen.getByText(/Destination already exists/i)).toBeInTheDocument();

      // act-1 should be safe and selectable, act-2 disabled
      const checkboxes = screen.getAllByRole('checkbox');
      // [0] is select all, [1] is act-1, [2] is act-2
      expect(checkboxes[1]).toBeEnabled();
      expect(checkboxes[2]).toBeDisabled();
    });

    it('approves and executes selected actions via backend endpoint', async () => {
      const mockApplyResponse: ApplyActionsResponse = {
        batch_id: 'batch-xyz',
        workspace_path: '/test/workspace',
        batch_status: 'all_succeeded',
        total_requested: 1,
        succeeded_count: 1,
        failed_count: 0,
        results: [
          {
            action_id: 'act-1',
            operation_type: 'move_to_archive',
            source_relative_path: 'docs/duplicate_v1.pdf',
            destination_relative_path: '_archive/docs/duplicate_v1.pdf',
            success: true,
            status: 'applied',
            verified: true,
            timestamp: new Date().toISOString(),
          },
        ],
      };

      vi.mocked(client.applyActions).mockResolvedValueOnce(mockApplyResponse);
      const onApplied = vi.fn();

      render(
        <ActionReviewModal
          isOpen={true}
          workspacePath="/test/workspace"
          previews={[mockPreviews[0]]}
          onClose={vi.fn()}
          onApplied={onApplied}
        />
      );

      const approveBtn = screen.getByText(/Approve & Execute/i);
      fireEvent.click(approveBtn);

      await waitFor(() => {
        expect(client.applyActions).toHaveBeenCalledWith(
          '/test/workspace',
          [mockPreviews[0]],
          ['act-1']
        );
      });

      await waitFor(() => {
        expect(screen.getByText('All Actions Succeeded & Verified!')).toBeInTheDocument();
        expect(screen.getByText('Undo Operation')).toBeInTheDocument();
      });
    });

    it('displays partial failures transparently without claiming whole batch succeeded', async () => {
      const mockPartialResponse: ApplyActionsResponse = {
        batch_id: 'batch-partial',
        workspace_path: '/test/workspace',
        batch_status: 'partially_succeeded',
        total_requested: 2,
        succeeded_count: 1,
        failed_count: 1,
        results: [
          {
            action_id: 'act-1',
            operation_type: 'move_to_archive',
            source_relative_path: 'docs/duplicate_v1.pdf',
            destination_relative_path: '_archive/docs/duplicate_v1.pdf',
            success: true,
            status: 'applied',
            verified: true,
            timestamp: new Date().toISOString(),
          },
          {
            action_id: 'act-2',
            operation_type: 'rename',
            source_relative_path: 'notes_FINAL_v2.txt',
            destination_relative_path: 'notes_clean.txt',
            success: false,
            status: 'failed',
            error_message: 'Destination path already exists on disk. Refusing to overwrite.',
            verified: false,
            timestamp: new Date().toISOString(),
          },
        ],
      };

      vi.mocked(client.applyActions).mockResolvedValueOnce(mockPartialResponse);

      render(
        <ActionReviewModal
          isOpen={true}
          workspacePath="/test/workspace"
          previews={mockPreviews}
          onClose={vi.fn()}
        />
      );

      const approveBtn = screen.getByText(/Approve & Execute/i);
      fireEvent.click(approveBtn);

      await waitFor(() => {
        expect(
          screen.getByText('Batch Partially Succeeded (Itemized Errors Below)')
        ).toBeInTheDocument();
        expect(screen.getByText(/Destination path already exists on disk/i)).toBeInTheDocument();
      });
    });
  });

  describe('ActionAuditHistoryView', () => {
    it('loads and displays audit manifest records and supports undo', async () => {
      vi.mocked(client.fetchAuditLog).mockResolvedValueOnce({
        workspace_path: '/test/workspace',
        total_count: 1,
        records: [
          {
            action_id: 'act-hist-1',
            workspace_path: '/test/workspace',
            operation_type: 'move_to_archive',
            source_relative_path: 'old_project/spec.txt',
            destination_relative_path: '_archive/old_project/spec.txt',
            file_size_bytes: 4096,
            pre_hash: '11223344',
            post_hash: '11223344',
            reason: 'Archived redundant project spec',
            status: 'applied',
            can_undo: true,
            created_at: new Date().toISOString(),
            applied_at: new Date().toISOString(),
          },
        ],
      });

      vi.mocked(client.undoAction).mockResolvedValueOnce({
        action_id: 'act-hist-1',
        success: true,
        status: 'undone',
        message: 'Successfully restored file',
        source_relative_path: 'old_project/spec.txt',
        destination_relative_path: '_archive/old_project/spec.txt',
      });

      render(<ActionAuditHistoryView folderPath="/test/workspace" />);

      await waitFor(() => {
        expect(screen.getByText('Archived redundant project spec')).toBeInTheDocument();
        expect(screen.getByText('Undo Action')).toBeInTheDocument();
      });

      fireEvent.click(screen.getByText('Undo Action'));

      await waitFor(() => {
        expect(client.undoAction).toHaveBeenCalledWith('/test/workspace', 'act-hist-1');
      });
    });
  });

  describe('DuplicateFinderView Proposal Integration', () => {
    it('triggers proposal action workflow when user requests archive of duplicates', () => {
      const mockDupResult: DuplicateResult = {
        scanned_path: '/test/workspace',
        scanned_at: new Date().toISOString(),
        groups_count: 1,
        total_duplicate_files: 1,
        total_wasted_bytes: 512,
        total_wasted_formatted: '512 B',
        groups: [
          {
            checksum: 'deadbeef1234',
            file_size_bytes: 512,
            file_size_formatted: '512 B',
            wasted_bytes: 512,
            wasted_formatted: '512 B',
            files: ['/test/workspace/orig.txt', '/test/workspace/copy.txt'],
            relative_files: ['orig.txt', 'copy.txt'],
          },
        ],
      };

      const onProposeActions = vi.fn();

      render(
        <DuplicateFinderView
          duplicateResult={mockDupResult}
          onScanDuplicates={vi.fn()}
          isScanning={false}
          folderPath="/test/workspace"
          onProposeActions={onProposeActions}
        />
      );

      const archiveAllBtn = screen.getByText(/Review & Archive All Duplicates/i);
      fireEvent.click(archiveAllBtn);

      expect(onProposeActions).toHaveBeenCalledTimes(1);
      expect(onProposeActions).toHaveBeenCalledWith([
        {
          operation_type: 'move_to_archive',
          source_relative_path: 'copy.txt',
          target_name_or_folder: '_archive',
          reason: 'Archive redundant copy of orig.txt',
        },
      ]);
    });
  });
});
