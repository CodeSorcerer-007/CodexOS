import type { StateCreator } from 'zustand';
import type { DashboardState } from '../store';
import type { Tab } from '../../types/tabs';
import { addAllowedPath, kvGet, kvSet } from '../../ipc';

const TABS_STORAGE_KEY = 'codexos-tabs';

export interface AppTab {
  id: string;
  activeApp: Tab['activeApp'];
  currentPath: string | null;
  selectedFile: string | null;
  openFiles: string[];
  pathHistory: string[];
  historyIndex: number;
}

export interface PersistedTabState {
  tabs: AppTab[];
  activeTabId: string;
}

export const DEFAULT_TAB: AppTab = {
  id: 'tab-1',
  activeApp: 'home',
  currentPath: null,
  selectedFile: null,
  openFiles: [],
  pathHistory: [],
  historyIndex: -1,
};

export function loadTabs(): PersistedTabState {
  try {
    const saved = localStorage.getItem(TABS_STORAGE_KEY);
    if (saved) {
      const parsed: PersistedTabState = JSON.parse(saved);
      if (
        Array.isArray(parsed.tabs) &&
        parsed.tabs.length > 0 &&
        typeof parsed.activeTabId === 'string'
      ) {
        const activeExists = parsed.tabs.some((t) => t.id === parsed.activeTabId);
        return {
          tabs: parsed.tabs,
          activeTabId: activeExists ? parsed.activeTabId : parsed.tabs[0].id,
        };
      }
    }
  } catch (e) {
    console.error('[CodexOS] Failed to parse persisted tabs:', e);
  }
  return { tabs: [{ ...DEFAULT_TAB }], activeTabId: DEFAULT_TAB.id };
}

export function saveTabs(state: PersistedTabState): void {
  try {
    const json = JSON.stringify(state);
    localStorage.setItem(TABS_STORAGE_KEY, json);
    // Asynchronously sync to SQLite KV store
    kvSet(TABS_STORAGE_KEY, json).catch((err) => {
      console.warn('[CodexOS] SQLite tab persist warning:', err);
    });
  } catch (e) {
    console.error('[CodexOS] Failed to persist tabs:', e);
  }
}

export interface TabsSlice {
  tabs: AppTab[];
  activeTabId: string;
  activeApp: Tab['activeApp'];
  currentPath: string | null;
  selectedFile: string | null;
  openFiles: string[];

  addTab: () => void;
  closeTab: (id: string) => void;
  setActiveTab: (id: string) => void;
  updateActiveTab: (changes: Partial<AppTab>) => void;
  reorderTabs: (fromIndex: number, toIndex: number) => void;
  setActiveApp: (app: Tab['activeApp']) => void;
  setCurrentPath: (path: string | null) => void;
  setSelectedFile: (file: string | null) => void;
  openFile: (file: string) => void;
  closeFile: (file: string) => void;
  pushPath: (path: string) => void;
  goBack: () => void;
  goForward: () => void;
  hydrateTabsFromSqlite: () => Promise<void>;
}

export const createTabsSlice: StateCreator<DashboardState, [], [], TabsSlice> = (set, get) => {
  const initial = loadTabs();
  const activeTab = initial.tabs.find(t => t.id === initial.activeTabId) || initial.tabs[0];
  
  return {
    tabs: initial.tabs,
    activeTabId: initial.activeTabId,
    activeApp: activeTab.activeApp,
    currentPath: activeTab.currentPath,
    selectedFile: activeTab.selectedFile,
    openFiles: activeTab.openFiles,

    hydrateTabsFromSqlite: async () => {
      try {
        const raw = await kvGet(TABS_STORAGE_KEY);
        if (raw) {
          const parsed: PersistedTabState = JSON.parse(raw);
          if (Array.isArray(parsed.tabs) && parsed.tabs.length > 0) {
            const activeTab = parsed.tabs.find(t => t.id === parsed.activeTabId) || parsed.tabs[0];
            set({
              tabs: parsed.tabs,
              activeTabId: parsed.activeTabId,
              activeApp: activeTab.activeApp,
              currentPath: activeTab.currentPath,
              selectedFile: activeTab.selectedFile,
              openFiles: activeTab.openFiles || [],
            });
            if (activeTab.currentPath) {
              addAllowedPath(activeTab.currentPath).catch(() => {});
            }
          }
        }
      } catch (e) {
        console.warn('[CodexOS] Could not hydrate tabs from SQLite:', e);
      }
    },

    addTab: () => set((state) => {
      if (state.tabs.length >= 8) return state;
      const newId = `tab-${crypto.randomUUID()}`;
      const newTabs = [...state.tabs, { 
        id: newId, 
        activeApp: 'home' as Tab['activeApp'], 
        currentPath: state.currentPath, 
        selectedFile: state.selectedFile, 
        openFiles: [], 
        pathHistory: state.currentPath ? [state.currentPath] : [], 
        historyIndex: state.currentPath ? 0 : -1 
      }];
      const updated = { tabs: newTabs, activeTabId: newId };
      saveTabs(updated);
      return updated;
    }),

    closeTab: (id) => set((state) => {
      if (state.tabs.length === 1) return state;
      const newTabs = state.tabs.filter(t => t.id !== id);
      const newActiveId = state.activeTabId === id
        ? newTabs[newTabs.length - 1].id
        : state.activeTabId;
      const t = newTabs.find(tab => tab.id === newActiveId)!;
      const updated = { 
        tabs: newTabs, 
        activeTabId: newActiveId,
        activeApp: t.activeApp,
        currentPath: t.currentPath,
        selectedFile: t.selectedFile,
        openFiles: t.openFiles
      };
      saveTabs({ tabs: newTabs, activeTabId: newActiveId });
      return updated;
    }),

    setActiveTab: (id) => set((state) => {
      const tab = state.tabs.find(t => t.id === id);
      if (!tab) return state;
      const updated = {
        activeTabId: id,
        activeApp: tab.activeApp,
        currentPath: tab.currentPath,
        selectedFile: tab.selectedFile,
        openFiles: tab.openFiles
      };
      saveTabs({ tabs: state.tabs, activeTabId: id });
      return updated;
    }),

    updateActiveTab: (changes) => set((state) => {
      const tabs = state.tabs.map(t => t.id === state.activeTabId ? { ...t, ...changes } : t);
      const tab = tabs.find(t => t.id === state.activeTabId)!;
      saveTabs({ tabs, activeTabId: state.activeTabId });
      return {
        tabs,
        activeApp: tab.activeApp,
        currentPath: tab.currentPath,
        selectedFile: tab.selectedFile,
        openFiles: tab.openFiles || []
      };
    }),

    reorderTabs: (from, to) => set((state) => {
      const tabs = [...state.tabs];
      const [removed] = tabs.splice(from, 1);
      tabs.splice(to, 0, removed);
      saveTabs({ tabs, activeTabId: state.activeTabId });
      return { tabs };
    }),

    setActiveApp: (app) => get().updateActiveTab({ activeApp: app }),
    
    setCurrentPath: (path) => {
      if (path) {
        addAllowedPath(path).catch(() => {});
      }
      set((state) => {
        const tabs = state.tabs.map(t => t.id === state.activeTabId ? { ...t, currentPath: path } : t);
        saveTabs({ tabs, activeTabId: state.activeTabId });
        return {
          currentPath: path,
          tabs
        };
      });
    },

    setSelectedFile: (file) => set((state) => {
      const tabs = state.tabs.map(t => t.id === state.activeTabId ? { ...t, selectedFile: file } : t);
      saveTabs({ tabs, activeTabId: state.activeTabId });
      return {
        selectedFile: file,
        tabs
      };
    }),

    openFile: (file) => set((state) => {
      let newOpenFiles = state.openFiles;
      if (!state.openFiles.includes(file)) {
        newOpenFiles = [...state.openFiles, file];
      }
      const tabs = state.tabs.map(t => t.id === state.activeTabId ? { ...t, openFiles: newOpenFiles, selectedFile: file } : t);
      saveTabs({ tabs, activeTabId: state.activeTabId });
      return { 
        openFiles: newOpenFiles, 
        selectedFile: file,
        tabs
      };
    }),

    closeFile: (file) => set((state) => {
      const newOpenFiles = state.openFiles.filter(f => f !== file);
      const newSelected = state.selectedFile === file ? (newOpenFiles[newOpenFiles.length - 1] || null) : state.selectedFile;
      const tabs = state.tabs.map(t => t.id === state.activeTabId ? { ...t, openFiles: newOpenFiles, selectedFile: newSelected } : t);
      saveTabs({ tabs, activeTabId: state.activeTabId });
      return { 
        openFiles: newOpenFiles, 
        selectedFile: newSelected,
        tabs
      };
    }),

    pushPath: (path) => {
      if (path) {
        addAllowedPath(path).catch(() => {});
      }
      set((state) => {
        const tab = state.tabs.find(t => t.id === state.activeTabId)!;
        const newHistory = [...tab.pathHistory.slice(0, tab.historyIndex + 1), path];
        const tabs = state.tabs.map(t => t.id === state.activeTabId ? { ...t, currentPath: path, pathHistory: newHistory, historyIndex: newHistory.length - 1 } : t);
        saveTabs({ tabs, activeTabId: state.activeTabId });
        return {
          currentPath: path,
          tabs,
        };
      });
    },

    goBack: () => set((state) => {
      const tab = state.tabs.find(t => t.id === state.activeTabId)!;
      if (tab.historyIndex <= 0) return state;
      const newIndex = tab.historyIndex - 1;
      const newPath = tab.pathHistory[newIndex];
      const tabs = state.tabs.map(t => t.id === state.activeTabId ? { ...t, currentPath: newPath, historyIndex: newIndex } : t);
      saveTabs({ tabs, activeTabId: state.activeTabId });
      return {
        currentPath: newPath,
        tabs,
      };
    }),

    goForward: () => set((state) => {
      const tab = state.tabs.find(t => t.id === state.activeTabId)!;
      if (tab.historyIndex >= tab.pathHistory.length - 1) return state;
      const newIndex = tab.historyIndex + 1;
      const newPath = tab.pathHistory[newIndex];
      const tabs = state.tabs.map(t => t.id === state.activeTabId ? { ...t, currentPath: newPath, historyIndex: newIndex } : t);
      saveTabs({ tabs, activeTabId: state.activeTabId });
      return {
        currentPath: newPath,
        tabs,
      };
    }),
  };
};
