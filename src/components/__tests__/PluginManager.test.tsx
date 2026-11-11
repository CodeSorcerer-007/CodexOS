import { describe, test, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { PluginManager } from '../PluginManager';
import { invoke } from '@tauri-apps/api/core';
import { open } from '@tauri-apps/plugin-dialog';
import type { InstalledPlugin } from '../../types/plugin';

vi.mock('@tauri-apps/api/core', () => ({
  invoke: vi.fn(),
}));

vi.mock('@tauri-apps/plugin-dialog', () => ({
  open: vi.fn(),
}));

const mockInstalledPlugin: InstalledPlugin = {
  id: 'wasm-rust-formatter',
  name: 'Rust AST Formatter',
  version: '1.2.0',
  author: 'CodeSorcerer',
  description: 'High-speed WASM AST code formatter for Rust files.',
  category: 'DevTools',
  size: '1.4 MB',
  downloads: 412,
  verified: true,
  wasmFile: 'rust_fmt.wasm',
  sha256: '968e98acd3e2898569441c1769845bc3ad79616458ffcd1cce35fadb48ff7381',
  installedAt: '2026-10-04T00:00:00Z',
  enabled: true,
};

describe('PluginManager component (Milestone M2)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    vi.mocked(open).mockResolvedValue('C:\\plugins\\test.wasm');
    vi.mocked(invoke).mockResolvedValue('Execution success: returns 42');
  });

  test('renders WASM Plugins panel and manual file loader', () => {
    render(<PluginManager currentPath="/test/workspace" />);
    expect(screen.getByText(/WASM Plugins/i)).toBeInTheDocument();
    expect(screen.getByTitle(/browse wasm file/i)).toBeInTheDocument();
    expect(screen.getByText(/Installed Plugins \(0\)/i)).toBeInTheDocument();
  });

  test('executes manual wasm plugin file when Execute Plugin is clicked', async () => {
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

  test('reflects installed marketplace plugins from shared storage', () => {
    localStorage.setItem('codexos_installed_plugins', JSON.stringify([mockInstalledPlugin]));
    render(<PluginManager currentPath="/test/workspace" />);

    expect(screen.getByText(/Installed Plugins \(1\)/i)).toBeInTheDocument();
    expect(screen.getByText('Rust AST Formatter')).toBeInTheDocument();
    expect(screen.getByText(/v1\.2\.0 • CodeSorcerer/i)).toBeInTheDocument();
    expect(screen.getByText('Enabled')).toBeInTheDocument();
  });

  test('toggles installed plugin enable/disable state', async () => {
    localStorage.setItem('codexos_installed_plugins', JSON.stringify([mockInstalledPlugin]));
    render(<PluginManager currentPath="/test/workspace" />);

    const toggleBtn = screen.getByRole('button', { name: /enabled/i });
    fireEvent.click(toggleBtn);

    await waitFor(() => {
      expect(screen.getByText('Disabled')).toBeInTheDocument();
    });

    // Check localStorage reflects false
    const stored = JSON.parse(localStorage.getItem('codexos_installed_plugins') || '[]');
    expect(stored[0].enabled).toBe(false);

    // Toggle back to enabled
    const disableBtn = screen.getByRole('button', { name: /disabled/i });
    fireEvent.click(disableBtn);

    await waitFor(() => {
      expect(screen.getByText('Enabled')).toBeInTheDocument();
    });
    const storedAfter = JSON.parse(localStorage.getItem('codexos_installed_plugins') || '[]');
    expect(storedAfter[0].enabled).toBe(true);
  });

  test('executes enabled installed plugin and logs output', async () => {
    localStorage.setItem('codexos_installed_plugins', JSON.stringify([mockInstalledPlugin]));
    vi.mocked(invoke).mockResolvedValue('Formatted AST output: ok');

    render(<PluginManager currentPath="/test/workspace" />);

    const runBtn = screen.getByRole('button', { name: /^run$/i });
    expect(runBtn).not.toBeDisabled();
    fireEvent.click(runBtn);

    await waitFor(() => {
      expect(invoke).toHaveBeenCalledWith('execute_marketplace_plugin', expect.objectContaining({
        pluginId: 'wasm-rust-formatter',
      }));
      expect(screen.getByText(/Formatted AST output: ok/i)).toBeInTheDocument();
    });
  });

  test('disables execution when plugin is disabled', () => {
    const disabledPlugin = { ...mockInstalledPlugin, enabled: false };
    localStorage.setItem('codexos_installed_plugins', JSON.stringify([disabledPlugin]));

    render(<PluginManager currentPath="/test/workspace" />);

    const runBtn = screen.getByRole('button', { name: /^run$/i });
    expect(runBtn).toBeDisabled();
  });

  test('uninstalls plugin and removes from shared storage', async () => {
    localStorage.setItem('codexos_installed_plugins', JSON.stringify([mockInstalledPlugin]));
    render(<PluginManager currentPath="/test/workspace" />);

    expect(screen.getByText('Rust AST Formatter')).toBeInTheDocument();

    const uninstallBtn = screen.getByTitle(/uninstall plugin/i);
    fireEvent.click(uninstallBtn);

    await waitFor(() => {
      expect(screen.queryByText('Rust AST Formatter')).not.toBeInTheDocument();
      const stored = JSON.parse(localStorage.getItem('codexos_installed_plugins') || '[]');
      expect(stored).toHaveLength(0);
    });
  });

  test('clears execution logs when clear button is clicked', async () => {
    render(<PluginManager currentPath="/test/workspace" />);
    const browseBtn = screen.getByTitle(/browse wasm file/i);
    fireEvent.click(browseBtn);

    await waitFor(() => {
      expect(screen.getByDisplayValue('C:\\plugins\\test.wasm')).toBeInTheDocument();
    });

    const executeBtn = screen.getByRole('button', { name: /execute plugin/i });
    fireEvent.click(executeBtn);

    await waitFor(() => {
      expect(screen.getByText(/Execution success: returns 42/i)).toBeInTheDocument();
    });

    const clearBtn = screen.getByRole('button', { name: /clear logs/i });
    fireEvent.click(clearBtn);

    await waitFor(() => {
      expect(screen.getByText(/waiting for execution\.\.\./i)).toBeInTheDocument();
    });
  });
});
