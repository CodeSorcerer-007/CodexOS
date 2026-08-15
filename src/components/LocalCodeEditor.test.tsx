import { describe, test, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { LocalCodeEditor } from './LocalCodeEditor';
import { useStore } from '../store/store';
import { invoke } from '@tauri-apps/api/core';

vi.mock('@tauri-apps/api/core', () => ({
  invoke: vi.fn(),
}));

vi.mock('@monaco-editor/react', () => ({
  default: ({ value, onChange }: { value: string; onChange: (v: string) => void }) => (
    <textarea
      data-testid="monaco-mock"
      value={value}
      onChange={(e) => onChange(e.target.value)}
    />
  ),
}));

vi.mock('./TerminalMultiplexer', () => ({
  TerminalPane: () => <div data-testid="terminal-pane-mock">Terminal Mock</div>,
}));

describe('LocalCodeEditor component', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useStore.setState({
      currentPath: '/home/user/project',
      selectedFile: '/home/user/project/index.ts',
      openFiles: ['/home/user/project/index.ts'],
    });
    vi.mocked(invoke).mockImplementation(async (cmd) => {
      if (cmd === 'read_file_text') return 'console.log("hello world");';
      if (cmd === 'get_files_in_dir') return [
        { name: 'index.ts', path: '/home/user/project/index.ts', is_dir: false, size_bytes: 100 },
      ];
      return undefined;
    });
  });

  test('renders file list in sidebar', async () => {
    render(<LocalCodeEditor />);
    await waitFor(() => {
      expect(screen.getByText('index.ts')).toBeInTheDocument();
    });
  });

  test('loads and displays file content in editor', async () => {
    render(<LocalCodeEditor />);
    await waitFor(() => {
      const editor = screen.getByTestId('monaco-mock') as HTMLTextAreaElement;
      expect(editor.value).toBe('console.log("hello world");');
    });
  });

  test('saves file on Save button click', async () => {
    render(<LocalCodeEditor />);
    await waitFor(() => {
      expect(screen.getByTestId('monaco-mock')).toBeInTheDocument();
    });

    const saveBtn = screen.getByRole('button', { name: /save/i });
    fireEvent.click(saveBtn);

    await waitFor(() => {
      expect(invoke).toHaveBeenCalledWith('write_file_text', expect.objectContaining({
        path: '/home/user/project/index.ts',
        content: 'console.log("hello world");',
      }));
    });
  });

  test('renders integrated terminal when active', () => {
    render(<LocalCodeEditor />);
    expect(screen.getByTestId('terminal-pane-mock')).toBeInTheDocument();
  });
});
