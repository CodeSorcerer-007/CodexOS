import type { StateCreator } from 'zustand';
import type { DashboardState } from '../store';
import { addAllowedPath, kvGet, kvSet } from '../../ipc';

export interface AppSettings {
  defaultPath: string;
  terminalShell: 'powershell' | 'cmd' | 'wsl';
  theme: 'dark' | 'light';
  recentWorkspaces: { path: string; name: string; lastOpened: number }[];
  aiCopilotEnabled: boolean;
  memorySpikeThresholdMb: number;
  memorySpikeWindowSec: number;
  sidebarCollapsed: boolean;
  proxyWhitelist: string[];
}

const SETTINGS_STORAGE_KEY = 'codexos-settings';

export const defaultSettings: AppSettings = {
  defaultPath: '',
  terminalShell: 'powershell',
  theme: 'dark',
  recentWorkspaces: [],
  aiCopilotEnabled: true,
  memorySpikeThresholdMb: 500,
  memorySpikeWindowSec: 10,
  sidebarCollapsed: false,
  proxyWhitelist: ['127.0.0.1', 'localhost'],
};

export function loadSettings(): AppSettings {
  try {
    const saved = localStorage.getItem(SETTINGS_STORAGE_KEY);
    if (saved) return { ...defaultSettings, ...JSON.parse(saved) };
  } catch (e) {
    console.error('[CodexOS] Failed to parse persisted settings:', e);
  }
  return { ...defaultSettings };
}

export function saveSettings(settings: AppSettings): void {
  try {
    const json = JSON.stringify(settings);
    localStorage.setItem(SETTINGS_STORAGE_KEY, json);
    kvSet(SETTINGS_STORAGE_KEY, json).catch(() => {});
  } catch (e) {
    console.error('[CodexOS] Failed to persist settings:', e);
  }
}

export interface SettingsSlice {
  settings: AppSettings;
  updateSettings: (partial: Partial<AppSettings>) => void;
  setAiCopilotEnabled: (value: boolean) => void;
  setMemorySpikeThresholdMb: (value: number) => void;
  setMemorySpikeWindowSec: (value: number) => void;
  openWorkspace: (path: string, name: string) => void;
  hydrateSettingsFromSqlite: () => Promise<void>;
}

export const createSettingsSlice: StateCreator<DashboardState, [], [], SettingsSlice> = (set) => ({
  settings: loadSettings(),
  
  hydrateSettingsFromSqlite: async () => {
    try {
      const raw = await kvGet(SETTINGS_STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        set((state) => ({
          settings: { ...state.settings, ...parsed },
        }));
      }
    } catch (e) {
      console.warn('[CodexOS] Could not hydrate settings from SQLite:', e);
    }
  },

  updateSettings: (partial) => set((state) => {
    const updated = { ...state.settings, ...partial };
    saveSettings(updated);
    return { settings: updated };
  }),

  setAiCopilotEnabled: (value) => set((state) => {
    const updated = { ...state.settings, aiCopilotEnabled: value };
    saveSettings(updated);
    return { settings: updated };
  }),

  setMemorySpikeThresholdMb: (value) => set((state) => {
    const updated = { ...state.settings, memorySpikeThresholdMb: value };
    saveSettings(updated);
    return { settings: updated };
  }),

  setMemorySpikeWindowSec: (value) => set((state) => {
    const updated = { ...state.settings, memorySpikeWindowSec: value };
    saveSettings(updated);
    return { settings: updated };
  }),

  openWorkspace: (path, name) => {
    addAllowedPath(path).catch(() => {});
    set((state) => {
      const existing = state.settings.recentWorkspaces || [];
      const filtered = existing.filter(w => w.path !== path);
      filtered.unshift({ path, name, lastOpened: Date.now() });
      const updated = { ...state.settings, recentWorkspaces: filtered.slice(0, 10) };
      saveSettings(updated);
      return {
        settings: updated,
        currentPath: path,
      };
    });
  },
});
