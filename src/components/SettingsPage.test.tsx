import { expect, test, describe, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { SettingsPage } from './SettingsPage';
import { invoke } from '@tauri-apps/api/core';
import { useStore } from '../store/store';

const mockedInvoke = vi.mocked(invoke);

describe('SettingsPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useStore.setState({
      settings: {
        defaultPath: 'C:\\test',
        terminalShell: 'powershell',
        theme: 'dark',
        aiCopilotEnabled: false,
        memorySpikeThresholdMb: 500,
        memorySpikeWindowSec: 10,
        sidebarCollapsed: false,
        recentWorkspaces: [],
        proxyWhitelist: ['127.0.0.1', 'localhost'],
      }
    });
  });

  test('renders Settings header and inputs', () => {
    render(<SettingsPage />);
    expect(screen.getByText('Settings')).toBeDefined();
    expect(screen.getByText('Terminal Shell')).toBeDefined();
    expect(screen.getByText('Default Startup Path')).toBeDefined();
  });

  test('validates valid path', async () => {
    mockedInvoke.mockImplementation(async (cmd, _args) => {
      if (cmd === 'get_files_in_dir') return [];
      if (cmd === 'is_copilot_configured') return false;
      return null;
    });
    
    render(<SettingsPage />);
    const input = screen.getByPlaceholderText(/e\.g\./);
    
    fireEvent.change(input, { target: { value: 'C:\\valid' } });
    
    await waitFor(() => {
      expect(screen.getByText('✓ Path Exists')).toBeDefined();
    });
    expect(useStore.getState().settings.defaultPath).toBe('C:\\valid');
  });

  test('validates invalid path', async () => {
    mockedInvoke.mockImplementation(async (cmd, _args) => {
      if (cmd === 'get_files_in_dir') throw new Error("Not found");
      if (cmd === 'is_copilot_configured') return false;
      return null;
    });
    
    render(<SettingsPage />);
    const input = screen.getByPlaceholderText(/e\.g\./);
    
    fireEvent.change(input, { target: { value: 'C:\\invalid' } });
    
    await waitFor(() => {
      expect(screen.getByText('✕ Path Not Found')).toBeDefined();
    });
  });

  test('changes theme', () => {
    mockedInvoke.mockResolvedValue(false);
    render(<SettingsPage />);
    
    const themeSelect = screen.getAllByRole('combobox')[1];
    fireEvent.change(themeSelect, { target: { value: 'light' } });
    
    expect(useStore.getState().settings.theme).toBe('light');
  });
});
