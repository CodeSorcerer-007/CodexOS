import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { FileGrid } from '../FileGrid';
import { CommandPalette } from '../CommandPalette';
import { useStore } from '../../store/store';
import { invoke } from '@tauri-apps/api/core';
import { formatFileError, undoLastFileOperation, getFileOperationHistory, permanentDeleteFile } from '../../ipc';

// Mock Tauri invoke
vi.mock('@tauri-apps/api/core', () => ({
  invoke: vi.fn(),
}));

const mockFiles = [
  { name: 'document.txt', path: 'C:\\Users\\test\\document.txt', is_dir: false, size_bytes: 2048 },
  { name: 'project', path: 'C:\\Users\\test\\project', is_dir: true, size_bytes: 0 },
  { name: 'photo.png', path: 'C:\\Users\\test\\photo.png', is_dir: false, size_bytes: 4096 },
];

describe('Phase 05.2.1: File Operations UX Foundation', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useStore.setState({
      tabs: [{ id: 'tab-1', activeApp: 'files', currentPath: 'C:\\Users\\test', selectedFile: null, openFiles: [], pathHistory: [], historyIndex: 0 }],
      activeTabId: 'tab-1',
      activeApp: 'files',
      toasts: [],
    });

    (invoke as any).mockImplementation((cmd: string, _args: any) => {
      if (cmd === 'get_files_in_dir') {
        return Promise.resolve(mockFiles);
      }
      if (cmd === 'get_sys_stats') {
        return Promise.resolve({ drives: [] });
      }
      if (cmd === 'get_git_status') {
        return Promise.resolve({ staged: [], unstaged: [], untracked: [], branch: 'main' });
      }
      if (cmd === 'undo_last_file_operation') {
        return Promise.resolve({
          success: true,
          description: 'Restored C:\\Users\\test\\document.txt',
          undone_type: 'Rename',
        });
      }
      if (cmd === 'get_file_operation_history') {
        return Promise.resolve([
          {
            type: 'Rename',
            old_path: 'C:\\Users\\test\\old.txt',
            new_path: 'C:\\Users\\test\\document.txt',
            timestamp: 1710000000,
          },
          {
            type: 'Copy',
            destination: 'C:\\Users\\test\\copy.txt',
            size_bytes: 1024,
            sha256: 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
            timestamp: 1709999000,
          },
        ]);
      }
      if (cmd === 'permanent_delete_file') {
        return Promise.resolve();
      }
      return Promise.resolve();
    });
  });

  describe('1. Error Message Formatting (formatFileError)', () => {
    it('formats Access Denied errors without generic administrator advice', () => {
      const formatted = formatFileError('Access is denied. (os error 5)');
      expect(formatted.title).toBe('Access Denied');
      expect(formatted.message).toContain('current Windows user account lacks write permissions');
      expect(formatted.message).not.toContain('run CodexOS as Administrator');
    });

    it('formats system-protected path errors with stability warning', () => {
      const formatted = formatFileError('Access is denied in C:\\Windows\\System32 (os error 5)');
      expect(formatted.title).toBe('System Access Denied');
      expect(formatted.message).toContain('elevated administrator privileges');
      expect(formatted.message).toContain('impact system stability');
    });

    it('formats Read-Only Attribute errors user-friendly', () => {
      const formatted = formatFileError('The file is read-only');
      expect(formatted.title).toBe('Read-Only Attribute');
      expect(formatted.message).toContain('marked read-only');
    });

    it('formats DeleteTrash manual recovery required message', () => {
      const formatted = formatFileError('Cannot undo DeleteTrash: please restore the file manually from the Windows Recycle Bin');
      expect(formatted.title).toBe('Manual Recovery Required');
      expect(formatted.message).toContain('Windows Recycle Bin');
    });

    it('formats Sharing Violation / File In Use errors user-friendly', () => {
      const formatted = formatFileError('The process cannot access the file because it is being used by another process. (os error 32)');
      expect(formatted.title).toBe('File in Use');
      expect(formatted.message).toContain('locked by another application');
    });

    it('formats Destination Collision errors user-friendly', () => {
      const formatted = formatFileError('Cannot create a file when that file already exists. (os error 183)');
      expect(formatted.title).toBe('Item Already Exists');
      expect(formatted.message).toContain('already exists');
    });

    it('formats Unsupported Recycle Bin errors user-friendly', () => {
      const formatted = formatFileError('RecycleBinFailed: drive does not support trash');
      expect(formatted.title).toBe('Recycle Bin Not Supported');
      expect(formatted.message).toContain('Recycle Bin');
    });

    it('formats Modified Destination Fingerprint errors user-friendly', () => {
      const formatted = formatFileError('UndoFailedDestinationModified: sha256 mismatch');
      expect(formatted.title).toBe('Destination Modified');
      expect(formatted.message).toContain('Undo was aborted to prevent accidental data loss');
    });

    it('formats Not Found errors user-friendly', () => {
      const formatted = formatFileError('The system cannot find the file specified. (os error 2)');
      expect(formatted.title).toBe('Item Not Found');
      expect(formatted.message).toContain('no longer exists');
    });
  });

  describe('2. IPC Typed Wrappers', () => {
    it('undoLastFileOperation validates response schema', async () => {
      const res = await undoLastFileOperation();
      expect(res.success).toBe(true);
      expect(res.description).toContain('Restored');
      expect(res.undone_type).toBe('Rename');
      expect(invoke).toHaveBeenCalledWith('undo_last_file_operation');
    });

    it('getFileOperationHistory validates array schema', async () => {
      const history = await getFileOperationHistory(10);
      expect(history.length).toBe(2);
      expect(history[0].type).toBe('Rename');
      expect(history[1].type).toBe('Copy');
      expect(invoke).toHaveBeenCalledWith('get_file_operation_history', { limit: 10 });
    });

    it('permanentDeleteFile sends confirmed flag', async () => {
      await permanentDeleteFile('C:\\Users\\test\\secret.txt', true);
      expect(invoke).toHaveBeenCalledWith('permanent_delete_file', {
        path: 'C:\\Users\\test\\secret.txt',
        confirm: true,
      });
    });
  });

  describe('3. Keyboard Shortcut Interception & Suppression', () => {
    it('triggers undo on Ctrl+Z when not focused on text input', async () => {
      render(
        <FileGrid
          currentPath="C:\\Users\\test"
          onNavigate={vi.fn()}
          selectedFile={null}
          onSelect={vi.fn()}
        />
      );

      await waitFor(() => {
        expect(screen.getByText('document.txt')).toBeInTheDocument();
      });

      await act(async () => {
        fireEvent.keyDown(window, { key: 'z', ctrlKey: true });
      });

      await waitFor(() => {
        expect(invoke).toHaveBeenCalledWith('undo_last_file_operation');
      });
    });

    it('suppresses Ctrl+Z when focused in an input field', async () => {
      render(
        <FileGrid
          currentPath="C:\\Users\\test"
          onNavigate={vi.fn()}
          selectedFile={null}
          onSelect={vi.fn()}
        />
      );

      await waitFor(() => {
        expect(screen.getByText('document.txt')).toBeInTheDocument();
      });

      const searchInput = screen.getByPlaceholderText(/Search/i);
      searchInput.focus();

      await act(async () => {
        fireEvent.keyDown(searchInput, { key: 'z', ctrlKey: true });
      });

      expect(invoke).not.toHaveBeenCalledWith('undo_last_file_operation');
    });

    it('suppresses Ctrl+Z when focused in a textarea', async () => {
      render(
        <div>
          <textarea data-testid="dummy-textarea" />
          <FileGrid
            currentPath="C:\\Users\\test"
            onNavigate={vi.fn()}
            selectedFile={null}
            onSelect={vi.fn()}
          />
        </div>
      );

      await waitFor(() => {
        expect(screen.getByText('document.txt')).toBeInTheDocument();
      });

      const textarea = screen.getByTestId('dummy-textarea');
      textarea.focus();

      await act(async () => {
        fireEvent.keyDown(textarea, { key: 'z', ctrlKey: true });
      });

      expect(invoke).not.toHaveBeenCalledWith('undo_last_file_operation');
    });
  });

  describe('4. Permanent Deletion Confirmation Modal', () => {
    it('opens permanent deletion modal on Shift+Delete and requires confirmation', async () => {
      render(
        <FileGrid
          currentPath="C:\\Users\\test"
          onNavigate={vi.fn()}
          selectedFile="C:\\Users\\test\\document.txt"
          onSelect={vi.fn()}
        />
      );

      await waitFor(() => {
        expect(screen.getByText('document.txt')).toBeInTheDocument();
      });

      // Trigger Shift+Delete
      await act(async () => {
        fireEvent.keyDown(window, { key: 'Delete', shiftKey: true });
      });

      // Check modal appears with warning
      await waitFor(() => {
        expect(screen.getByText('Permanently Delete?')).toBeInTheDocument();
        expect(screen.getByText(/Recycle Bin/i)).toBeInTheDocument();
        expect(screen.getByText(/cannot be recovered or undone/i)).toBeInTheDocument();
        expect(screen.getAllByText(/document\.txt/i).length).toBeGreaterThan(0);
      });

      // Cancel button test
      const cancelBtn = screen.getByRole('button', { name: 'Cancel' });
      await act(async () => {
        fireEvent.click(cancelBtn);
      });

      await waitFor(() => {
        expect(screen.queryByText('Permanently Delete?')).not.toBeInTheDocument();
      });
      expect(invoke).not.toHaveBeenCalledWith('permanent_delete_file', expect.anything());

      // Open again and confirm
      await act(async () => {
        fireEvent.keyDown(window, { key: 'Delete', shiftKey: true });
      });

      await waitFor(() => {
        expect(screen.getByText('Permanently Delete?')).toBeInTheDocument();
      });

      const confirmBtn = screen.getByRole('button', { name: 'Permanently Delete' });
      await act(async () => {
        fireEvent.click(confirmBtn);
      });

      await waitFor(() => {
        expect(invoke).toHaveBeenCalledWith('permanent_delete_file', expect.objectContaining({
          confirm: true,
        }));
      });
    });

    it('handles multi-selection permanent deletion with item counts, representative names, nested folder warning, and zero backend calls on cancel', async () => {
      render(
        <FileGrid
          currentPath="C:\\Users\\test"
          onNavigate={vi.fn()}
          selectedFile={null}
          onSelect={vi.fn()}
        />
      );

      await waitFor(() => {
        expect(screen.getByText('document.txt')).toBeInTheDocument();
        expect(screen.getByText('project')).toBeInTheDocument();
      });

      // Select both document.txt and project
      fireEvent.click(screen.getByText('document.txt'));
      fireEvent.click(screen.getByText('project'), { ctrlKey: true });

      // Trigger Shift+Delete
      await act(async () => {
        fireEvent.keyDown(window, { key: 'Delete', shiftKey: true });
      });

      // Verify multi-selection dialog details
      await waitFor(() => {
        expect(screen.getByText('Permanently Delete?')).toBeInTheDocument();
        expect(screen.getAllByText(/2 items/i).length).toBeGreaterThanOrEqual(1);
        expect(screen.getByText(/1 file/i)).toBeInTheDocument();
        expect(screen.getByText(/1 folder/i)).toBeInTheDocument();
        expect(screen.getByText(/Folder Contents Warning/i)).toBeInTheDocument();
      });

      // Cancellation causes zero backend calls
      const cancelBtn = screen.getByRole('button', { name: 'Cancel' });
      await act(async () => {
        fireEvent.click(cancelBtn);
      });

      await waitFor(() => {
        expect(screen.queryByText('Permanently Delete?')).not.toBeInTheDocument();
      });
      expect(invoke).not.toHaveBeenCalledWith('permanent_delete_file', expect.anything());

      // Trigger Shift+Delete again and confirm
      await act(async () => {
        fireEvent.keyDown(window, { key: 'Delete', shiftKey: true });
      });

      await waitFor(() => {
        expect(screen.getByText('Permanently Delete?')).toBeInTheDocument();
      });

      const confirmBtn = screen.getByRole('button', { name: 'Permanently Delete' });
      await act(async () => {
        fireEvent.click(confirmBtn);
      });

      await waitFor(() => {
        expect(invoke).toHaveBeenCalledWith('permanent_delete_file', {
          path: 'C:\\Users\\test\\document.txt',
          confirm: true,
        });
        expect(invoke).toHaveBeenCalledWith('permanent_delete_file', {
          path: 'C:\\Users\\test\\project',
          confirm: true,
        });
      });
    });
  });

  describe('5. Operation History Modal', () => {
    it('opens history modal from toolbar, shows in-memory disclaimer, and lists operations', async () => {
      render(
        <FileGrid
          currentPath="C:\\Users\\test"
          onNavigate={vi.fn()}
          selectedFile={null}
          onSelect={vi.fn()}
        />
      );

      await waitFor(() => {
        expect(screen.getByText('document.txt')).toBeInTheDocument();
      });

      // Click history button in toolbar
      const historyBtn = screen.getByTitle('View file operation history');
      await act(async () => {
        fireEvent.click(historyBtn);
      });

      // History modal should open
      await waitFor(() => {
        expect(screen.getByText('File Operation History')).toBeInTheDocument();
        expect(screen.getByText(/Session Memory/i)).toBeInTheDocument();
        expect(screen.getByText(/Operations are tracked in-memory for this session only/i)).toBeInTheDocument();
      });

      // Check entries rendered with badges
      expect(screen.getByText('RENAME')).toBeInTheDocument();
      expect(screen.getByText('COPY')).toBeInTheDocument();
      expect(screen.getByText(/Next Undo Target/i)).toBeInTheDocument();

      // Close modal
      const closeBtn = screen.getByTitle('Close');
      fireEvent.click(closeBtn);

      await waitFor(() => {
        expect(screen.queryByText('File Operation History')).not.toBeInTheDocument();
      });
    });

    it('shows empty state when no operations are recorded', async () => {
      (invoke as any).mockImplementation((cmd: string) => {
        if (cmd === 'get_files_in_dir') return Promise.resolve(mockFiles);
        if (cmd === 'get_sys_stats') return Promise.resolve({ drives: [] });
        if (cmd === 'get_git_status') return Promise.resolve({ staged: [], unstaged: [], untracked: [], branch: 'main' });
        if (cmd === 'get_file_operation_history') return Promise.resolve([]);
        return Promise.resolve();
      });

      render(
        <FileGrid
          currentPath="C:\\Users\\test"
          onNavigate={vi.fn()}
          selectedFile={null}
          onSelect={vi.fn()}
        />
      );

      await waitFor(() => {
        expect(screen.getByText('document.txt')).toBeInTheDocument();
      });

      const historyBtn = screen.getByTitle('View file operation history');
      await act(async () => {
        fireEvent.click(historyBtn);
      });

      await waitFor(() => {
        expect(screen.getByText('No file operations recorded yet.')).toBeInTheDocument();
      });
    });

    it('displays DeleteTrash with Manual Recovery badge, instructional guidance, and does NOT badge as Reversible', async () => {
      (invoke as any).mockImplementation((cmd: string) => {
        if (cmd === 'get_files_in_dir') return Promise.resolve(mockFiles);
        if (cmd === 'get_sys_stats') return Promise.resolve({ drives: [] });
        if (cmd === 'get_git_status') return Promise.resolve({ staged: [], unstaged: [], untracked: [], branch: 'main' });
        if (cmd === 'get_file_operation_history') {
          return Promise.resolve([
            {
              type: 'DeleteTrash',
              path: 'C:\\Users\\test\\trashed.txt',
              timestamp: 1710000000,
            },
            {
              type: 'Copy',
              destination: 'C:\\Users\\test\\copy.txt',
              size_bytes: 1024,
              sha256: 'abcdef123456',
              timestamp: 1709999000,
            },
          ]);
        }
        return Promise.resolve();
      });

      render(
        <FileGrid
          currentPath="C:\\Users\\test"
          onNavigate={vi.fn()}
          selectedFile={null}
          onSelect={vi.fn()}
        />
      );

      await waitFor(() => {
        expect(screen.getByText('document.txt')).toBeInTheDocument();
      });

      const historyBtn = screen.getByTitle('View file operation history');
      await act(async () => {
        fireEvent.click(historyBtn);
      });

      await waitFor(() => {
        expect(screen.getByText('File Operation History')).toBeInTheDocument();
      });

      // Verify badges
      expect(screen.getByText('Manual Recovery (Recycle Bin)')).toBeInTheDocument();
      expect(screen.getByText('Reversible (Fingerprint Verified)')).toBeInTheDocument();
      expect(screen.getByText(/Restore via Windows Recycle Bin/i)).toBeInTheDocument();
      expect(screen.queryByText('↵ Next Undo Target')).not.toBeInTheDocument();

      // Verify instructional guidance & copy path button
      expect(screen.getByText(/To restore this item, open the Windows Recycle Bin/i)).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Copy Path' })).toBeInTheDocument();
    });
  });

  describe('6. Command Palette Integration', () => {
    it('registers File Undo and View History commands', async () => {
      render(<CommandPalette />);

      // Trigger Ctrl+K
      await act(async () => {
        fireEvent.keyDown(window, { key: 'k', ctrlKey: true });
      });

      await waitFor(() => {
        expect(screen.getByPlaceholderText(/Search commands/i)).toBeInTheDocument();
      });

      const input = screen.getByPlaceholderText(/Search commands/i);
      await act(async () => {
        fireEvent.change(input, { target: { value: 'Undo Last Operation' } });
      });

      await waitFor(() => {
        expect(screen.getByText('File: Undo Last Operation (Ctrl+Z)')).toBeInTheDocument();
      });

      await act(async () => {
        fireEvent.change(input, { target: { value: 'Operation History' } });
      });

      await waitFor(() => {
        expect(screen.getByText('File: View Operation History')).toBeInTheDocument();
      });
    });
  });

  describe('7. DeleteTrash Undo Prevention', () => {
    it('prevents backend undo call when top entry is DeleteTrash and advises manual recovery', async () => {
      (invoke as any).mockImplementation((cmd: string) => {
        if (cmd === 'get_files_in_dir') return Promise.resolve(mockFiles);
        if (cmd === 'get_sys_stats') return Promise.resolve({ drives: [] });
        if (cmd === 'get_git_status') return Promise.resolve({ staged: [], unstaged: [], untracked: [], branch: 'main' });
        if (cmd === 'get_file_operation_history') {
          return Promise.resolve([
            {
              type: 'DeleteTrash',
              path: 'C:\\Users\\test\\document.txt',
              timestamp: 1710000000,
            },
          ]);
        }
        return Promise.resolve();
      });

      render(
        <FileGrid
          currentPath="C:\\Users\\test"
          onNavigate={vi.fn()}
          selectedFile={null}
          onSelect={vi.fn()}
        />
      );

      await waitFor(() => {
        expect(screen.getByText('document.txt')).toBeInTheDocument();
      });

      // Trigger Ctrl+Z
      await act(async () => {
        fireEvent.keyDown(window, { key: 'z', ctrlKey: true });
      });

      // Verify undo_last_file_operation was NOT called
      expect(invoke).not.toHaveBeenCalledWith('undo_last_file_operation');

      // Verify toast with manual recovery instructions was triggered
      const toasts = useStore.getState().toasts;
      expect(toasts.some(t => t.title === 'Manual Recovery Required' && t.message?.includes('Windows Recycle Bin'))).toBe(true);
    });
  });

  describe('8. Undo Failure Regressions', () => {
    it('handles original destination occupied without reporting success', async () => {
      (invoke as any).mockImplementation((cmd: string) => {
        if (cmd === 'get_files_in_dir') return Promise.resolve(mockFiles);
        if (cmd === 'get_sys_stats') return Promise.resolve({ drives: [] });
        if (cmd === 'get_git_status') return Promise.resolve({ staged: [], unstaged: [], untracked: [], branch: 'main' });
        if (cmd === 'get_file_operation_history') {
          return Promise.resolve([
            {
              type: 'Rename',
              old_path: 'C:\\Users\\test\\old.txt',
              new_path: 'C:\\Users\\test\\document.txt',
              timestamp: 1710000000,
            },
          ]);
        }
        if (cmd === 'undo_last_file_operation') {
          return Promise.reject(new Error('Cannot create a file when that file already exists. (os error 183)'));
        }
        return Promise.resolve();
      });

      render(
        <FileGrid
          currentPath="C:\\Users\\test"
          onNavigate={vi.fn()}
          selectedFile={null}
          onSelect={vi.fn()}
        />
      );

      await waitFor(() => {
        expect(screen.getByText('document.txt')).toBeInTheDocument();
      });

      await act(async () => {
        fireEvent.keyDown(window, { key: 'z', ctrlKey: true });
      });

      await waitFor(() => {
        const toasts = useStore.getState().toasts;
        expect(toasts.some(t => t.type === 'error' && t.title === 'Item Already Exists')).toBe(true);
        expect(toasts.some(t => t.type === 'success')).toBe(false);
      });
    });

    it('handles modified copied destination (fingerprint mismatch) without deleting destination', async () => {
      (invoke as any).mockImplementation((cmd: string) => {
        if (cmd === 'get_files_in_dir') return Promise.resolve(mockFiles);
        if (cmd === 'get_sys_stats') return Promise.resolve({ drives: [] });
        if (cmd === 'get_git_status') return Promise.resolve({ staged: [], unstaged: [], untracked: [], branch: 'main' });
        if (cmd === 'get_file_operation_history') {
          return Promise.resolve([
            {
              type: 'Copy',
              destination: 'C:\\Users\\test\\copy.txt',
              size_bytes: 1024,
              sha256: 'dummy',
              timestamp: 1710000000,
            },
          ]);
        }
        if (cmd === 'undo_last_file_operation') {
          return Promise.reject(new Error('UndoFailedDestinationModified: destination file content was modified since copy'));
        }
        return Promise.resolve();
      });

      render(
        <FileGrid
          currentPath="C:\\Users\\test"
          onNavigate={vi.fn()}
          selectedFile={null}
          onSelect={vi.fn()}
        />
      );

      await waitFor(() => {
        expect(screen.getByText('document.txt')).toBeInTheDocument();
      });

      await act(async () => {
        fireEvent.keyDown(window, { key: 'z', ctrlKey: true });
      });

      await waitFor(() => {
        const toasts = useStore.getState().toasts;
        expect(toasts.some(t => t.type === 'error' && t.title === 'Destination Modified')).toBe(true);
        expect(toasts.some(t => t.type === 'success')).toBe(false);
      });
    });

    it('handles locked destination (sharing violation) gracefully', async () => {
      (invoke as any).mockImplementation((cmd: string) => {
        if (cmd === 'get_files_in_dir') return Promise.resolve(mockFiles);
        if (cmd === 'get_sys_stats') return Promise.resolve({ drives: [] });
        if (cmd === 'get_git_status') return Promise.resolve({ staged: [], unstaged: [], untracked: [], branch: 'main' });
        if (cmd === 'get_file_operation_history') {
          return Promise.resolve([
            {
              type: 'Rename',
              old_path: 'C:\\Users\\test\\old.txt',
              new_path: 'C:\\Users\\test\\document.txt',
              timestamp: 1710000000,
            },
          ]);
        }
        if (cmd === 'undo_last_file_operation') {
          return Promise.reject(new Error('The process cannot access the file because it is being used by another process. (os error 32)'));
        }
        return Promise.resolve();
      });

      render(
        <FileGrid
          currentPath="C:\\Users\\test"
          onNavigate={vi.fn()}
          selectedFile={null}
          onSelect={vi.fn()}
        />
      );

      await waitFor(() => {
        expect(screen.getByText('document.txt')).toBeInTheDocument();
      });

      await act(async () => {
        fireEvent.keyDown(window, { key: 'z', ctrlKey: true });
      });

      await waitFor(() => {
        const toasts = useStore.getState().toasts;
        expect(toasts.some(t => t.type === 'error' && t.title === 'File in Use')).toBe(true);
        expect(toasts.some(t => t.type === 'success')).toBe(false);
      });
    });

    it('handles missing target gracefully', async () => {
      (invoke as any).mockImplementation((cmd: string) => {
        if (cmd === 'get_files_in_dir') return Promise.resolve(mockFiles);
        if (cmd === 'get_sys_stats') return Promise.resolve({ drives: [] });
        if (cmd === 'get_git_status') return Promise.resolve({ staged: [], unstaged: [], untracked: [], branch: 'main' });
        if (cmd === 'get_file_operation_history') {
          return Promise.resolve([
            {
              type: 'Rename',
              old_path: 'C:\\Users\\test\\old.txt',
              new_path: 'C:\\Users\\test\\missing.txt',
              timestamp: 1710000000,
            },
          ]);
        }
        if (cmd === 'undo_last_file_operation') {
          return Promise.reject(new Error('The system cannot find the file specified. (os error 2)'));
        }
        return Promise.resolve();
      });

      render(
        <FileGrid
          currentPath="C:\\Users\\test"
          onNavigate={vi.fn()}
          selectedFile={null}
          onSelect={vi.fn()}
        />
      );

      await waitFor(() => {
        expect(screen.getByText('document.txt')).toBeInTheDocument();
      });

      await act(async () => {
        fireEvent.keyDown(window, { key: 'z', ctrlKey: true });
      });

      await waitFor(() => {
        const toasts = useStore.getState().toasts;
        expect(toasts.some(t => t.type === 'error' && t.title === 'Item Not Found')).toBe(true);
        expect(toasts.some(t => t.type === 'success')).toBe(false);
      });
    });
  });
});
