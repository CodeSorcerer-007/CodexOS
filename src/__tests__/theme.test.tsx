import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, act, fireEvent } from '@testing-library/react';
import { useStore } from '../store/store';
import App from '../App';
import { Sidebar } from '../components/layout/Sidebar';
import { SettingsPage } from '../components/SettingsPage';
import { invoke } from '@tauri-apps/api/core';

// Mock Tauri window API for App
vi.mock('@tauri-apps/api/window', () => ({
  getCurrentWindow: () => ({
    isMaximized: vi.fn().mockResolvedValue(false),
    onResized: vi.fn().mockResolvedValue(() => {}),
    minimize: vi.fn().mockResolvedValue(undefined),
    toggleMaximize: vi.fn().mockResolvedValue(undefined),
    close: vi.fn().mockResolvedValue(undefined),
  }),
}));

const mockedInvoke = vi.mocked(invoke);

describe('Universal Theme Adaptation & Component Integration', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    document.documentElement.className = '';
    localStorage.clear();
    localStorage.setItem('codexos-onboarded', 'true');

    act(() => {
      useStore.setState({
        activeApp: 'home',
        currentPath: '/test/workspace',
        settings: {
          ...useStore.getState().settings,
          theme: 'dark',
          defaultPath: '/test/workspace',
        },
      });
    });

    mockedInvoke.mockImplementation(async (cmd) => {
      if (cmd === 'get_sys_stats') {
        return { cpu_usage: 12.5, mem_total: 16000000000, mem_used: 8000000000, drives: [] };
      }
      if (cmd === 'get_docker_containers') return [];
      if (cmd === 'get_git_status') return { staged: [], unstaged: [], untracked: [], branch: 'main' };
      if (cmd === 'is_copilot_configured') return false;
      return null;
    });
  });

  it('updates store theme setting between light and dark modes', () => {
    expect(useStore.getState().settings.theme).toBe('dark');

    act(() => {
      useStore.getState().updateSettings({ theme: 'light' });
    });
    expect(useStore.getState().settings.theme).toBe('light');

    act(() => {
      useStore.getState().updateSettings({ theme: 'dark' });
    });
    expect(useStore.getState().settings.theme).toBe('dark');
  });

  it('App component dynamically synchronizes documentElement classList for light and dark modes', () => {
    render(<App />);

    // Initially dark
    expect(document.documentElement.classList.contains('dark')).toBe(true);
    expect(document.documentElement.classList.contains('light')).toBe(false);
    expect(document.documentElement.classList.contains('light-theme')).toBe(false);

    // Toggle store to light mode
    act(() => {
      useStore.getState().updateSettings({ theme: 'light' });
    });

    expect(document.documentElement.classList.contains('dark')).toBe(false);
    expect(document.documentElement.classList.contains('light')).toBe(true);
    expect(document.documentElement.classList.contains('light-theme')).toBe(true);

    // Toggle back to dark mode
    act(() => {
      useStore.getState().updateSettings({ theme: 'dark' });
    });

    expect(document.documentElement.classList.contains('dark')).toBe(true);
    expect(document.documentElement.classList.contains('light')).toBe(false);
    expect(document.documentElement.classList.contains('light-theme')).toBe(false);
  });

  it('SettingsPage allows toggling between themes and reflects change in store', () => {
    render(<SettingsPage />);

    expect(screen.getByText('Settings')).toBeInTheDocument();
    const selects = screen.getAllByRole('combobox');
    const themeSelect = selects[1]; // Second select is theme in SettingsPage

    // Change to light theme
    act(() => {
      fireEvent.change(themeSelect, { target: { value: 'light' } });
    });
    expect(useStore.getState().settings.theme).toBe('light');

    // Change back to dark theme
    act(() => {
      fireEvent.change(themeSelect, { target: { value: 'dark' } });
    });
    expect(useStore.getState().settings.theme).toBe('dark');
  });

  it('Sidebar renders with semantic theme tokens and contrast-safe logo classes', () => {
    render(<Sidebar />);

    const nav = screen.getByRole('navigation', { name: 'Main navigation' });
    expect(nav).toHaveClass('bg-app-surface/90');
    expect(nav).toHaveClass('border-app-border');

    const logoText = screen.getByText('CodexOS');
    expect(logoText).toHaveClass('from-gray-900');
    expect(logoText).toHaveClass('dark:from-gray-100');
  });
});
