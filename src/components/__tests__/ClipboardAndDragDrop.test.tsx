import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { FileGrid } from '../FileGrid';
import { useStore } from '../../store/store';
import { invoke } from '@tauri-apps/api/core';

// Mock Tauri invoke
vi.mock('@tauri-apps/api/core', () => ({
  invoke: vi.fn(),
}));

const mockFiles = [
  { name: 'document.txt', path: 'C:\\Users\\test\\document.txt', is_dir: false, size_bytes: 2048 },
  { name: 'project', path: 'C:\\Users\\test\\project', is_dir: true, size_bytes: 0 },
  { name: 'photo.png', path: 'C:\\Users\\test\\photo.png', is_dir: false, size_bytes: 4096 },
];

describe('Phase 05.2.2.1: Clipboard and Drag-and-Drop Regression Tests', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useStore.setState({
      tabs: [{ id: 'tab-1', activeApp: 'files', currentPath: 'C:\\Users\\test', selectedFile: null, openFiles: [], pathHistory: [], historyIndex: 0 }],
      activeTabId: 'tab-1',
      activeApp: 'files',
      toasts: [],
    });

    (invoke as any).mockImplementation((cmd: string, args: any) => {
      if (cmd === 'get_files_in_dir') {
        return Promise.resolve(mockFiles);
      }
      if (cmd === 'get_sys_stats') {
        return Promise.resolve({ drives: [] });
      }
      if (cmd === 'get_git_status') {
        return Promise.resolve({ staged: [], unstaged: [], untracked: [], branch: 'main' });
      }
      if (cmd === 'get_file_operation_history') {
        return Promise.resolve([]);
      }
      if (cmd === 'check_file_conflicts') {
        return Promise.resolve({
          conflicts: [],
          safe_count: args.sources.length,
          total_count: args.sources.length,
        });
      }
      if (cmd === 'execute_file_transfer') {
        return Promise.resolve({
          operation: args.operation,
          total_items: args.items.length,
          success_count: args.items.length,
          replaced_count: 0,
          renamed_count: 0,
          skipped_count: 0,
          failed_count: 0,
          records: args.items.map((i: any) => ({
            source: i.source,
            dest: i.dest,
            final_path: i.dest,
            status: args.operation === 'move' ? 'moved' : 'copied',
            error: null,
          })),
        });
      }
      return Promise.resolve();
    });
  });

  it('1. Copy semantics: Ctrl+C copies items, Ctrl+V pastes, and clipboard remains for repeated paste', async () => {
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

    // Select document.txt
    const item = screen.getByText('document.txt');
    fireEvent.click(item);

    // Press Ctrl+C
    fireEvent.keyDown(window, { key: 'c', ctrlKey: true });

    // Verify copy toast notification
    await waitFor(() => {
      const toasts = useStore.getState().toasts;
      expect(toasts.some(t => t.title.includes('Copied to Clipboard'))).toBe(true);
    });

    // First Paste (Ctrl+V)
    fireEvent.keyDown(window, { key: 'v', ctrlKey: true });

    await waitFor(() => {
      expect(invoke).toHaveBeenCalledWith('check_file_conflicts', expect.objectContaining({
        sources: ['C:\\Users\\test\\document.txt'],
        operation: 'copy',
      }));
      expect(invoke).toHaveBeenCalledWith('execute_file_transfer', expect.objectContaining({
        operation: 'copy',
      }));
    });

    // Repeated Paste (Ctrl+V): clipboard is preserved and can be pasted again deterministically!
    fireEvent.keyDown(window, { key: 'v', ctrlKey: true });

    await waitFor(() => {
      const calls = (invoke as any).mock.calls.filter((c: any[]) => c[0] === 'execute_file_transfer');
      expect(calls.length).toBe(2);
    });
  });

  it('2. Cut semantics: Ctrl+X cuts items, successful paste clears clipboard, so second paste is no-op', async () => {
    render(
      <FileGrid
        currentPath="C:\\Users\\test"
        onNavigate={vi.fn()}
        selectedFile={null}
        onSelect={vi.fn()}
      />
    );

    await waitFor(() => {
      expect(screen.getByText('photo.png')).toBeInTheDocument();
    });

    // Select photo.png
    fireEvent.click(screen.getByText('photo.png'));

    // Press Ctrl+X (Cut)
    fireEvent.keyDown(window, { key: 'x', ctrlKey: true });

    await waitFor(() => {
      const toasts = useStore.getState().toasts;
      expect(toasts.some(t => t.title.includes('Cut to Clipboard'))).toBe(true);
    });

    // Paste (Ctrl+V)
    fireEvent.keyDown(window, { key: 'v', ctrlKey: true });

    await waitFor(() => {
      expect(invoke).toHaveBeenCalledWith('execute_file_transfer', expect.objectContaining({
        operation: 'move',
      }));
    });

    // Second Paste (Ctrl+V): since move succeeded, clipboard was cleared; second paste is a no-op!
    const callsBefore = (invoke as any).mock.calls.filter((c: any[]) => c[0] === 'execute_file_transfer').length;
    fireEvent.keyDown(window, { key: 'v', ctrlKey: true });

    const callsAfter = (invoke as any).mock.calls.filter((c: any[]) => c[0] === 'execute_file_transfer').length;
    expect(callsAfter).toBe(callsBefore);
  });

  it('3. Failed Cut/Paste preserves clipboard state', async () => {
    // Mock transfer failure
    (invoke as any).mockImplementation((cmd: string, args: any) => {
      if (cmd === 'get_files_in_dir') return Promise.resolve(mockFiles);
      if (cmd === 'get_sys_stats') return Promise.resolve({ drives: [] });
      if (cmd === 'get_git_status') return Promise.resolve({ staged: [], unstaged: [], untracked: [], branch: 'main' });
      if (cmd === 'get_file_operation_history') return Promise.resolve([]);
      if (cmd === 'check_file_conflicts') {
        return Promise.resolve({ conflicts: [], safe_count: 1, total_count: 1 });
      }
      if (cmd === 'execute_file_transfer') {
        return Promise.resolve({
          operation: 'move',
          total_items: 1,
          success_count: 0,
          replaced_count: 0,
          renamed_count: 0,
          skipped_count: 0,
          failed_count: 1,
          records: [{
            source: args.items[0].source,
            dest: args.items[0].dest,
            final_path: null,
            status: 'failed',
            error: 'Access denied: destination locked by another process.',
          }],
        });
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

    fireEvent.click(screen.getByText('document.txt'));
    fireEvent.keyDown(window, { key: 'x', ctrlKey: true }); // Cut

    // Attempt Paste
    fireEvent.keyDown(window, { key: 'v', ctrlKey: true });

    await waitFor(() => {
      const toasts = useStore.getState().toasts;
      expect(toasts.some(t => t.title.includes('Access Denied') || t.title.includes('Transfer Failed'))).toBe(true);
    });

    // Because the move failed, clipboard must be preserved!
    // A second Ctrl+V will attempt the transfer again rather than being empty
    fireEvent.keyDown(window, { key: 'v', ctrlKey: true });

    await waitFor(() => {
      const calls = (invoke as any).mock.calls.filter((c: any[]) => c[0] === 'execute_file_transfer');
      expect(calls.length).toBe(2);
    });
  });

  it('4. Partial transfer failure updates clipboard to retain only failed items', async () => {
    (invoke as any).mockImplementation((cmd: string, args: any) => {
      if (cmd === 'get_files_in_dir') return Promise.resolve(mockFiles);
      if (cmd === 'get_sys_stats') return Promise.resolve({ drives: [] });
      if (cmd === 'get_git_status') return Promise.resolve({ staged: [], unstaged: [], untracked: [], branch: 'main' });
      if (cmd === 'get_file_operation_history') return Promise.resolve([]);
      if (cmd === 'check_file_conflicts') {
        return Promise.resolve({ conflicts: [], safe_count: 2, total_count: 2 });
      }
      if (cmd === 'execute_file_transfer') {
        // Item 1 succeeds, Item 2 fails
        return Promise.resolve({
          operation: 'move',
          total_items: 2,
          success_count: 1,
          replaced_count: 0,
          renamed_count: 0,
          skipped_count: 0,
          failed_count: 1,
          records: [
            { source: args.items[0].source, dest: args.items[0].dest, final_path: args.items[0].dest, status: 'moved', error: null },
            { source: args.items[1].source, dest: args.items[1].dest, final_path: null, status: 'failed', error: 'Locked file' },
          ],
        });
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

    // Select document.txt and photo.png
    fireEvent.click(screen.getByText('document.txt'));
    fireEvent.click(screen.getByText('photo.png'), { ctrlKey: true });

    // Cut both
    fireEvent.keyDown(window, { key: 'x', ctrlKey: true });

    // Paste
    fireEvent.keyDown(window, { key: 'v', ctrlKey: true });

    await waitFor(() => {
      const toasts = useStore.getState().toasts;
      expect(toasts.some(t => t.title.includes('Notices') || (t.message && t.message.includes('1 transferred, 0 skipped, 1 failed')))).toBe(true);
    });

    // On the next Paste, only the remaining failed item should be in clipboard!
    fireEvent.keyDown(window, { key: 'v', ctrlKey: true });

    await waitFor(() => {
      const calls = (invoke as any).mock.calls.filter((c: any[]) => c[0] === 'execute_file_transfer');
      expect(calls.length).toBe(2);
      const secondCallItems = calls[1][1].items;
      expect(secondCallItems.length).toBe(1);
      expect(secondCallItems[0].source).toBe('C:\\Users\\test\\photo.png');
    });
  });

  it('5. Cancelled conflict dialog preserves clipboard state intact', async () => {
    (invoke as any).mockImplementation((cmd: string) => {
      if (cmd === 'get_files_in_dir') return Promise.resolve(mockFiles);
      if (cmd === 'get_sys_stats') return Promise.resolve({ drives: [] });
      if (cmd === 'get_git_status') return Promise.resolve({ staged: [], unstaged: [], untracked: [], branch: 'main' });
      if (cmd === 'get_file_operation_history') return Promise.resolve([]);
      if (cmd === 'check_file_conflicts') {
        return Promise.resolve({
          conflicts: [{
            source_path: 'C:\\Users\\test\\document.txt',
            dest_path: 'C:\\Users\\test\\project\\document.txt',
            item_name: 'document.txt',
            is_dir: false,
            source_size_bytes: 2048,
            dest_size_bytes: 1024,
            source_mtime: 100,
            dest_mtime: 50,
            is_same_size: false,
            is_same_mtime: false,
            type_mismatch: false,
            dest_is_dir: false,
          }],
          safe_count: 0,
          total_count: 1,
        });
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

    // Cut document.txt
    fireEvent.click(screen.getByText('document.txt'));
    fireEvent.keyDown(window, { key: 'x', ctrlKey: true });

    // Paste into project folder via context menu or navigation
    fireEvent.keyDown(window, { key: 'v', ctrlKey: true });

    // Conflict dialog opens
    await waitFor(() => {
      expect(screen.getByText('File Conflict Detected')).toBeInTheDocument();
    });

    // Click Cancel in dialog
    const cancelButtons = screen.getAllByRole('button', { name: /Cancel/i });
    fireEvent.click(cancelButtons[0]);

    await waitFor(() => {
      expect(screen.queryByText('File Conflict Detected')).not.toBeInTheDocument();
      const toasts = useStore.getState().toasts;
      expect(toasts.some(t => t.title.includes('Transfer Cancelled'))).toBe(true);
    });

    // Clipboard is preserved!
    fireEvent.keyDown(window, { key: 'v', ctrlKey: true });

    // Opens conflict dialog again because clipboard was preserved!
    await waitFor(() => {
      expect(screen.getByText('File Conflict Detected')).toBeInTheDocument();
    });
  });

  it('6. External Windows Explorer drag-and-drop handles file drops with copy operation', async () => {
    render(
      <FileGrid
        currentPath="C:\\Users\\test"
        onNavigate={vi.fn()}
        selectedFile={null}
        onSelect={vi.fn()}
      />
    );

    await waitFor(() => {
      expect(screen.getByText('project')).toBeInTheDocument();
    });

    const projectFolder = screen.getByText('project').closest('[draggable="true"]');
    expect(projectFolder).toBeInTheDocument();

    // Create external drag-and-drop event with file path property from Webview2
    const dropEvent = {
      preventDefault: vi.fn(),
      dataTransfer: {
        files: [
          { name: 'external_notes.txt', path: 'D:\\Downloads\\external_notes.txt' },
        ],
        getData: vi.fn().mockReturnValue(''),
      },
    };

    // Drop onto project folder
    fireEvent.drop(projectFolder!, dropEvent);

    await waitFor(() => {
      expect(invoke).toHaveBeenCalledWith('check_file_conflicts', expect.objectContaining({
        sources: ['D:\\Downloads\\external_notes.txt'],
        targetDir: 'C:\\Users\\test\\project',
        operation: 'copy', // External drop defaults to copy!
      }));
    });
  });

  it('7. Internal folder drag-and-drop handles item drop with move operation', async () => {
    render(
      <FileGrid
        currentPath="C:\\Users\\test"
        onNavigate={vi.fn()}
        selectedFile={null}
        onSelect={vi.fn()}
      />
    );

    await waitFor(() => {
      expect(screen.getByText('project')).toBeInTheDocument();
    });

    const projectFolder = screen.getByText('project').closest('[draggable="true"]');

    // Internal drag payload
    const dropEvent = {
      preventDefault: vi.fn(),
      dataTransfer: {
        files: [],
        getData: (type: string) => {
          if (type === 'application/json') return JSON.stringify(['C:\\Users\\test\\document.txt']);
          if (type === 'text/plain') return 'C:\\Users\\test\\document.txt';
          return '';
        },
      },
    };

    fireEvent.drop(projectFolder!, dropEvent);

    await waitFor(() => {
      expect(invoke).toHaveBeenCalledWith('check_file_conflicts', expect.objectContaining({
        sources: ['C:\\Users\\test\\document.txt'],
        targetDir: 'C:\\Users\\test\\project',
        operation: 'move', // Internal drop defaults to move!
      }));
    });
  });
});
