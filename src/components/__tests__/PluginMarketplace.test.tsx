import { describe, test, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { PluginMarketplace } from '../PluginMarketplace';
import { invoke } from '@tauri-apps/api/core';

vi.mock('@tauri-apps/api/core', () => ({
  invoke: vi.fn(),
}));

describe('PluginMarketplace component (Milestone M2)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    vi.mocked(invoke).mockResolvedValue('Rust code formatted successfully');
  });

  test('renders marketplace with search, category tabs, and SHA-256 badges', () => {
    render(<PluginMarketplace />);
    expect(screen.getByRole('heading', { name: /p2p plugin marketplace/i })).toBeInTheDocument();
    expect(screen.getByPlaceholderText(/search wasm plugins/i)).toBeInTheDocument();
    expect(screen.getByText('Rust AST Formatter')).toBeInTheDocument();
    expect(screen.getByText(/968e98acd3e2898569441c1769845bc3ad79616458ffcd1cce35fadb48ff7381/i)).toBeInTheDocument();
  });

  test('filters plugins by search and category tabs', async () => {
    render(<PluginMarketplace />);
    const searchInput = screen.getByPlaceholderText(/search wasm plugins/i);
    fireEvent.change(searchInput, { target: { value: 'Secret Leak' } });

    await waitFor(() => {
      expect(screen.getByText('Secret Leak Scanner')).toBeInTheDocument();
      expect(screen.queryByText('Rust AST Formatter')).not.toBeInTheDocument();
    });

    fireEvent.change(searchInput, { target: { value: '' } });
    const devToolsTab = screen.getByRole('button', { name: /^DevTools/i });
    fireEvent.click(devToolsTab);

    await waitFor(() => {
      expect(screen.getByText('Rust AST Formatter')).toBeInTheDocument();
      expect(screen.queryByText('Secret Leak Scanner')).not.toBeInTheDocument();
    });
  });

  test('verifies SHA-256 checksum and installs valid package', async () => {
    render(<PluginMarketplace />);

    // Locate the install button for Rust AST Formatter
    const installButtons = screen.getAllByRole('button', { name: /install via p2p/i });
    expect(installButtons.length).toBeGreaterThan(0);
    fireEvent.click(installButtons[0]);

    // Should complete verification and reflect installed state
    await waitFor(() => {
      expect(screen.getByText(/✓ Verified/i)).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /run plugin/i })).toBeInTheDocument();
    });

    // Check shared storage
    const stored = JSON.parse(localStorage.getItem('codexos_installed_plugins') || '[]');
    expect(stored).toHaveLength(1);
    expect(stored[0].id).toBe('wasm-rust-formatter');
    expect(stored[0].verified).toBe(true);
    expect(stored[0].enabled).toBe(true);
    expect(stored[0].sha256).toBe('968e98acd3e2898569441c1769845bc3ad79616458ffcd1cce35fadb48ff7381');
  });

  test('rejects corrupted package with mismatched checksum and does not install', async () => {
    render(<PluginMarketplace />);

    // Find the tampered package
    const tamperedTitle = screen.getByText('Tampered Crypto Plugin');
    expect(tamperedTitle).toBeInTheDocument();

    const tamperedCard = tamperedTitle.closest('.group');
    expect(tamperedCard).not.toBeNull();
    const installBtn = tamperedCard!.querySelector('button');
    expect(installBtn).not.toBeNull();
    fireEvent.click(installBtn!);

    // Wait and verify it was NOT saved to localStorage
    await waitFor(() => {
      const stored = JSON.parse(localStorage.getItem('codexos_installed_plugins') || '[]');
      const found = stored.find((p: any) => p.id === 'wasm-corrupted-pkg');
      expect(found).toBeUndefined();
    });

    // Button should still say "Install via P2P"
    expect(screen.getByText('Tampered Crypto Plugin')).toBeInTheDocument();
  });

  test('uninstalls plugin and updates shared registry', async () => {
    render(<PluginMarketplace />);

    // Install first
    const installButtons = screen.getAllByRole('button', { name: /install via p2p/i });
    fireEvent.click(installButtons[0]);

    await waitFor(() => {
      expect(screen.getByTitle(/uninstall plugin/i)).toBeInTheDocument();
    });

    // Click uninstall
    const uninstallBtn = screen.getByTitle(/uninstall plugin/i);
    fireEvent.click(uninstallBtn);

    await waitFor(() => {
      const stored = JSON.parse(localStorage.getItem('codexos_installed_plugins') || '[]');
      expect(stored).toHaveLength(0);
      expect(screen.queryByTitle(/uninstall plugin/i)).not.toBeInTheDocument();
    });
  });

  test('opens runner modal and executes installed plugin via tauri IPC', async () => {
    render(<PluginMarketplace />);

    // Install
    const installButtons = screen.getAllByRole('button', { name: /install via p2p/i });
    fireEvent.click(installButtons[0]);

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /run plugin/i })).toBeInTheDocument();
    });

    // Open runner modal
    const runBtn = screen.getByRole('button', { name: /run plugin/i });
    fireEvent.click(runBtn);

    expect(screen.getByText(/Run WASM Plugin: Rust AST Formatter/i)).toBeInTheDocument();

    // Click Execute in Wasmtime
    const execBtn = screen.getByRole('button', { name: /execute in wasmtime/i });
    fireEvent.click(execBtn);

    await waitFor(() => {
      expect(invoke).toHaveBeenCalledWith('execute_marketplace_plugin', expect.objectContaining({
        pluginId: 'wasm-rust-formatter',
      }));
      expect(screen.getByText('Rust code formatted successfully')).toBeInTheDocument();
    });
  });
});
