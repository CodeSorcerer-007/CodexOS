import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { SettingsPage } from '../SettingsPage';
import { useStore } from '../../store/store';
import { invoke } from '@tauri-apps/api/core';

const mockedInvoke = vi.mocked(invoke);

describe('SettingsPage — Windows Integration Section', () => {
  beforeEach(() => {
    vi.clearAllMocks();

    useStore.setState({
      settings: {
        defaultPath: '',
        terminalShell: 'powershell',
        theme: 'dark',
        recentWorkspaces: [],
        aiCopilotEnabled: true,
        memorySpikeThresholdMb: 500,
        memorySpikeWindowSec: 10,
        sidebarCollapsed: false,
        proxyWhitelist: ['127.0.0.1'],
        performanceMode: 'lightweight',
        monitoringEnabled: true,
      },
    });

    mockedInvoke.mockImplementation(async (cmd, args: any) => {
      if (cmd === 'get_windows_integration_status') {
        return {
          context_menu: {
            is_registered: false,
            supported: true,
            directory_registered: false,
            background_registered: false,
            drive_registered: false,
          },
          startup: {
            enabled: false,
            start_minimized: false,
            supported: true,
          },
          is_windows: true,
          win11_modern_menu_note: 'Win11 classic note',
          default_folder_note: 'Explorer default note',
        };
      }
      if (cmd === 'register_context_menu') {
        return {
          is_registered: true,
          supported: true,
          directory_registered: true,
          background_registered: true,
          drive_registered: true,
        };
      }
      if (cmd === 'unregister_context_menu') {
        return {
          is_registered: false,
          supported: true,
          directory_registered: false,
          background_registered: false,
          drive_registered: false,
        };
      }
      if (cmd === 'set_windows_startup') {
        return {
          enabled: args?.enabled ?? false,
          start_minimized: args?.startMinimized ?? false,
          supported: true,
        };
      }
      if (cmd === 'restore_windows_defaults') {
        return {
          context_menu: {
            is_registered: false,
            supported: true,
            directory_registered: false,
            background_registered: false,
            drive_registered: false,
          },
          startup: {
            enabled: false,
            start_minimized: false,
            supported: true,
          },
          is_windows: true,
          win11_modern_menu_note: 'Win11 classic note',
          default_folder_note: 'Explorer default note',
        };
      }
      if (cmd === 'generate_registry_scripts') {
        return ['REG_REGISTER_CONTENT', 'REG_UNREGISTER_CONTENT'];
      }
      if (cmd === 'is_copilot_configured') return true;
      if (cmd === 'get_db_migration_status') return { is_up_to_date: true, applied_migrations: [] };
      if (cmd === 'get_diagnostics_summary') return { app_version: '2.3.0', is_telemetry_enabled: true };
      return null;
    });
  });

  it('renders Windows Explorer & Shell Integration section', async () => {
    render(<SettingsPage />);

    expect(screen.getByText('Windows Explorer & Shell Integration')).toBeInTheDocument();
    await waitFor(() => {
      expect(screen.getByText('Windows 10/11')).toBeInTheDocument();
    });
  });

  it('toggles context menu registration via IPC', async () => {
    render(<SettingsPage />);

    const regBtn = await screen.findByTestId('toggle-context-menu-btn');
    expect(regBtn).toHaveTextContent('Register Context Menu');

    fireEvent.click(regBtn);

    await waitFor(() => {
      expect(mockedInvoke).toHaveBeenCalledWith('register_context_menu');
      expect(regBtn).toHaveTextContent('Unregister');
    });
  });

  it('toggles startup integration via IPC', async () => {
    render(<SettingsPage />);

    const startupBtn = await screen.findByTestId('toggle-startup-btn');
    expect(startupBtn).toHaveTextContent('Disabled');

    fireEvent.click(startupBtn);

    await waitFor(() => {
      expect(mockedInvoke).toHaveBeenCalledWith('set_windows_startup', {
        enabled: true,
        startMinimized: false,
      });
      expect(startupBtn).toHaveTextContent('Enabled');
    });
  });

  it('handles restore defaults action', async () => {
    render(<SettingsPage />);

    const restoreBtn = await screen.findByTestId('restore-defaults-btn');
    fireEvent.click(restoreBtn);

    await waitFor(() => {
      expect(mockedInvoke).toHaveBeenCalledWith('restore_windows_defaults');
    });
  });

  it('deduplicates tabs when opening a path that is already open in an existing tab', () => {
    const store = useStore.getState();
    // Open path A
    store.openPathInTab('C:\\Projects\\MyApp');
    const tabCountAfterFirst = useStore.getState().tabs.length;
    const tabIdFirst = useStore.getState().activeTabId;

    // Open path B
    store.openPathInTab('D:\\OtherProject');
    expect(useStore.getState().tabs.length).toBe(tabCountAfterFirst + 1);

    // Re-open path A (duplicate launch)
    store.openPathInTab('C:\\Projects\\MyApp');

    // Should NOT create another tab, but should activate the existing tab
    expect(useStore.getState().tabs.length).toBe(tabCountAfterFirst + 1);
    expect(useStore.getState().activeTabId).toBe(tabIdFirst);
    expect(useStore.getState().currentPath).toBe('C:\\Projects\\MyApp');
  });
});
