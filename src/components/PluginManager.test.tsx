import { describe, test, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { PluginManager } from './PluginManager';
import { invoke } from '@tauri-apps/api/core';
import { open } from '@tauri-apps/plugin-dialog';

vi.mock('@tauri-apps/api/core', () => ({
  invoke: vi.fn(),
}));

vi.mock('@tauri-apps/plugin-dialog', () => ({
  open: vi.fn(),
}));

describe('PluginManager component', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(open).mockResolvedValue('C:\\plugins\\test.wasm');
    vi.mocked(invoke).mockResolvedValue('Execution success: returns 42');
  });

  test('renders WASM Plugins panel', () => {
    render(<PluginManager currentPath="/test/workspace" />);
    expect(screen.getByText(/WASM Plugins/i)).toBeInTheDocument();
    expect(screen.getByTitle(/browse wasm file/i)).toBeInTheDocument();
  });

  test('executes wasm plugin when Execute Plugin is clicked', async () => {
    render(<PluginManager currentPath="/test/workspace" />);
    const browseBtn = screen.getByTitle(/browse wasm file/i);
    fireEvent.click(browseBtn);

    await waitFor(() => {
      expect(screen.getByDisplayValue('C:\\plugins\\test.wasm')).toBeInTheDocument();
    });

    const executeBtn = screen.getByRole('button', { name: /execute plugin/i });
    fireEvent.click(executeBtn);

    await waitFor(() => {
      expect(invoke).toHaveBeenCalledWith('run_wasm_plugin', { path: 'C:\\plugins\\test.wasm' });
      expect(screen.getByText(/Execution success: returns 42/i)).toBeInTheDocument();
    });
  });
});
