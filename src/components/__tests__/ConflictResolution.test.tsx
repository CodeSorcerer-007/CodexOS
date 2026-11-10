import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { ConflictResolutionDialog } from '../FileGrid/ConflictResolutionDialog';
import { invoke } from '@tauri-apps/api/core';
import type { ConflictInfo } from '../../ipc';
import {
  checkFileConflicts,
  executeFileTransfer,
  compareFileContents,
  generateUniqueName,
} from '../../ipc';

// Mock Tauri invoke
vi.mock('@tauri-apps/api/core', () => ({
  invoke: vi.fn(),
}));

const mockConflict: ConflictInfo = {
  source_path: 'C:\\Users\\test\\source\\document.pdf',
  dest_path: 'C:\\Users\\test\\dest\\document.pdf',
  item_name: 'document.pdf',
  is_dir: false,
  source_size_bytes: 4096,
  dest_size_bytes: 2048,
  source_mtime: 1710002000,
  dest_mtime: 1710001000,
  is_same_size: false,
  is_same_mtime: false,
  type_mismatch: false,
  dest_is_dir: false,
};

const mockTypeMismatchConflict: ConflictInfo = {
  source_path: 'C:\\Users\\test\\source\\data',
  dest_path: 'C:\\Users\\test\\dest\\data',
  item_name: 'data',
  is_dir: false, // File
  source_size_bytes: 512,
  dest_size_bytes: 0,
  source_mtime: 1710002000,
  dest_mtime: 1710001000,
  is_same_size: false,
  is_same_mtime: false,
  type_mismatch: true, // File vs Directory conflict!
  dest_is_dir: true,  // Destination is Directory
};

describe('Phase 05.2.2: File Conflict Resolution Engine', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('1. Conflict Resolution Dialog UI & Differences', () => {
    it('renders source and destination metadata cards with differences', () => {
      const onResolve = vi.fn();
      const onCancel = vi.fn();

      render(
        <ConflictResolutionDialog
          conflict={mockConflict}
          currentIndex={0}
          totalConflicts={2}
          operation="copy"
          onResolve={onResolve}
          onCancel={onCancel}
        />
      );

      expect(screen.getByText('File Conflict Detected')).toBeInTheDocument();
      expect(screen.getByText(/Copying to a destination with an existing item/i)).toBeInTheDocument();
      expect(screen.getAllByText('document.pdf')).toHaveLength(2); // In source and dest cards
      expect(screen.getByText('Incoming Source')).toBeInTheDocument();
      expect(screen.getByText('Existing in Destination')).toBeInTheDocument();

      // Diff indicators
      expect(screen.getByText(/Source is larger/i)).toBeInTheDocument();
      expect(screen.getByText(/Source is newer/i)).toBeInTheDocument();
    });

    it('displays Type Conflict warning and disables Replace when type mismatch exists', () => {
      const onResolve = vi.fn();
      const onCancel = vi.fn();

      render(
        <ConflictResolutionDialog
          conflict={mockTypeMismatchConflict}
          currentIndex={0}
          totalConflicts={1}
          operation="copy"
          onResolve={onResolve}
          onCancel={onCancel}
        />
      );

      expect(screen.getByText(/Type Conflict:/i)).toBeInTheDocument();
      expect(screen.getByText(/Cannot replace a file with a folder/i)).toBeInTheDocument();

      const replaceBtn = screen.getByRole('button', { name: /Replace/i });
      expect(replaceBtn).toBeDisabled();
    });
  });

  describe('2. User Decision Actions', () => {
    it('triggers Replace with applyToAll=false on Replace button click', () => {
      const onResolve = vi.fn();
      const onCancel = vi.fn();

      render(
        <ConflictResolutionDialog
          conflict={mockConflict}
          currentIndex={0}
          totalConflicts={1}
          operation="copy"
          onResolve={onResolve}
          onCancel={onCancel}
        />
      );

      const replaceBtn = screen.getByRole('button', { name: /Replace/i });
      fireEvent.click(replaceBtn);

      expect(onResolve).toHaveBeenCalledWith('replace', false);
    });

    it('triggers Skip with applyToAll=false on Skip button click', () => {
      const onResolve = vi.fn();
      const onCancel = vi.fn();

      render(
        <ConflictResolutionDialog
          conflict={mockConflict}
          currentIndex={0}
          totalConflicts={1}
          operation="copy"
          onResolve={onResolve}
          onCancel={onCancel}
        />
      );

      const skipBtn = screen.getByRole('button', { name: /Skip/i });
      fireEvent.click(skipBtn);

      expect(onResolve).toHaveBeenCalledWith('skip', false);
    });

    it('triggers Rename with applyToAll=false on Rename button click', () => {
      const onResolve = vi.fn();
      const onCancel = vi.fn();

      render(
        <ConflictResolutionDialog
          conflict={mockConflict}
          currentIndex={0}
          totalConflicts={1}
          operation="copy"
          onResolve={onResolve}
          onCancel={onCancel}
        />
      );

      const renameBtn = screen.getByRole('button', { name: /Rename/i });
      fireEvent.click(renameBtn);

      expect(onResolve).toHaveBeenCalledWith('rename', false);
    });

    it('triggers Cancel on Cancel button click or Escape key', () => {
      const onResolve = vi.fn();
      const onCancel = vi.fn();

      render(
        <ConflictResolutionDialog
          conflict={mockConflict}
          currentIndex={0}
          totalConflicts={1}
          operation="copy"
          onResolve={onResolve}
          onCancel={onCancel}
        />
      );

      const cancelBtn = screen.getByRole('button', { name: /Cancel transfer/i });
      fireEvent.click(cancelBtn);
      expect(onCancel).toHaveBeenCalledTimes(1);

      // Also verify Escape key
      fireEvent.keyDown(window, { key: 'Escape' });
      expect(onCancel).toHaveBeenCalledTimes(2);
    });

    it('supports Apply To All across batch conflicts', () => {
      const onResolve = vi.fn();
      const onCancel = vi.fn();

      render(
        <ConflictResolutionDialog
          conflict={mockConflict}
          currentIndex={0}
          totalConflicts={3}
          operation="copy"
          onResolve={onResolve}
          onCancel={onCancel}
        />
      );

      const checkbox = screen.getByRole('checkbox');
      expect(checkbox).toBeInTheDocument();
      fireEvent.click(checkbox);
      expect(checkbox).toBeChecked();

      const renameBtn = screen.getByRole('button', { name: /Rename/i });
      fireEvent.click(renameBtn);

      expect(onResolve).toHaveBeenCalledWith('rename', true);
    });
  });

  describe('3. Binary Content Comparison (SHA-256)', () => {
    it('calls compareFileContents and displays identical match', async () => {
      (invoke as any).mockResolvedValueOnce({
        source_sha256: 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
        dest_sha256: 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
        is_identical_content: true,
        is_identical_size: true,
        is_identical_mtime: true,
        is_identical_metadata: true,
      });

      render(
        <ConflictResolutionDialog
          conflict={mockConflict}
          currentIndex={0}
          totalConflicts={1}
          operation="copy"
          onResolve={vi.fn()}
          onCancel={vi.fn()}
        />
      );

      const compareBtn = screen.getByRole('button', { name: /Compare Contents/i });
      fireEvent.click(compareBtn);

      await waitFor(() => {
        expect(screen.getByText(/Identical binary contents/i)).toBeInTheDocument();
      });
    });

    it('displays difference alert when hashes do not match', async () => {
      (invoke as any).mockResolvedValueOnce({
        source_sha256: 'aaaa1111',
        dest_sha256: 'bbbb2222',
        is_identical_content: false,
        is_identical_size: false,
        is_identical_mtime: false,
        is_identical_metadata: false,
      });

      render(
        <ConflictResolutionDialog
          conflict={mockConflict}
          currentIndex={0}
          totalConflicts={1}
          operation="copy"
          onResolve={vi.fn()}
          onCancel={vi.fn()}
        />
      );

      const compareBtn = screen.getByRole('button', { name: /Compare Contents/i });
      fireEvent.click(compareBtn);

      await waitFor(() => {
        expect(screen.getByText(/File contents differ/i)).toBeInTheDocument();
      });
    });
  });

  describe('4. Backend IPC Integration Contracts', () => {
    it('checkFileConflicts correctly passes parameters and parses result', async () => {
      (invoke as any).mockResolvedValueOnce({
        conflicts: [mockConflict],
        safe_count: 2,
        total_count: 3,
      });

      const res = await checkFileConflicts(['C:\\a.txt', 'C:\\b.txt'], 'D:\\dest', 'copy');
      expect(invoke).toHaveBeenCalledWith('check_file_conflicts', {
        sources: ['C:\\a.txt', 'C:\\b.txt'],
        targetDir: 'D:\\dest',
        operation: 'copy',
      });
      expect(res.conflicts).toHaveLength(1);
      expect(res.safe_count).toBe(2);
      expect(res.total_count).toBe(3);
    });

    it('executeFileTransfer correctly passes items and parses BatchTransferResult', async () => {
      (invoke as any).mockResolvedValueOnce({
        operation: 'copy',
        total_items: 2,
        success_count: 2,
        replaced_count: 1,
        renamed_count: 1,
        skipped_count: 0,
        failed_count: 0,
        records: [
          {
            source: 'C:\\a.txt',
            dest: 'D:\\a.txt',
            final_path: 'D:\\a.txt',
            status: 'replaced',
            error: null,
          },
          {
            source: 'C:\\b.txt',
            dest: 'D:\\b.txt',
            final_path: 'D:\\b (1).txt',
            status: 'renamed',
            error: null,
          },
        ],
      });

      const res = await executeFileTransfer('copy', [
        { source: 'C:\\a.txt', dest: 'D:\\a.txt', action: 'replace' },
        { source: 'C:\\b.txt', dest: 'D:\\b.txt', action: 'rename' },
      ]);

      expect(invoke).toHaveBeenCalledWith('execute_file_transfer', {
        operation: 'copy',
        items: [
          { source: 'C:\\a.txt', dest: 'D:\\a.txt', action: 'replace' },
          { source: 'C:\\b.txt', dest: 'D:\\b.txt', action: 'rename' },
        ],
        defaultAction: null,
      });

      expect(res.success_count).toBe(2);
      expect(res.replaced_count).toBe(1);
      expect(res.renamed_count).toBe(1);
      expect(res.failed_count).toBe(0);
    });

    it('compareFileContents calls compare_file_contents and validates schema', async () => {
      (invoke as any).mockResolvedValueOnce({
        source_sha256: 'hash1',
        dest_sha256: 'hash2',
        is_identical_content: false,
        is_identical_size: true,
        is_identical_mtime: false,
        is_identical_metadata: false,
      });

      const res = await compareFileContents('C:\\file1.txt', 'C:\\file2.txt');
      expect(res.is_identical_content).toBe(false);
      expect(res.is_identical_size).toBe(true);
    });

    it('generateUniqueName calls generate_unique_name IPC', async () => {
      (invoke as any).mockResolvedValueOnce('C:\\dest\\report (1).pdf');
      const unique = await generateUniqueName('C:\\dest\\report.pdf');
      expect(unique).toBe('C:\\dest\\report (1).pdf');
    });
  });
});
