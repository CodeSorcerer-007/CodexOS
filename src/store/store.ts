import { create } from 'zustand';
import type { Tab } from '../App';

export type ToastType = 'success' | 'error' | 'warning' | 'info';

export interface Toast {
  id: string;
  type: ToastType;
  title: string;
  message?: string;
  duration?: number; // ms, 0 = never auto-dismiss
}

export interface AppTab {
  id: string;
  activeApp: Tab['activeApp'];
  currentPath: string | null;
  selectedFile: string | null;
}

export interface DashboardState {
  tabs: AppTab[];
  activeTabId: string;
  activeApp: Tab['activeApp'];
  currentPath: string | null;
  selectedFile: string | null;
  toasts: Toast[];
  
  // Navigation State
  pathHistory: string[];
  historyIndex: number;
  canGoBack: boolean;
  canGoForward: boolean;
  isVaultLocked: boolean;
  setVaultLocked: (locked: boolean) => void;
  secretsCount: number;
  setSecretsCount: (count: number) => void;

  // Git State
  gitRepoPath: string | null;

  // Peer Count
  peerCount: number;

  // Active Tunnels Badge
  activeTunnelCount: number;

  // Settings State
  settings: {
    defaultPath: string;
    terminalShell: 'powershell' | 'cmd' | 'wsl';
    theme: 'dark';
    sidebarCollapsed: boolean;
  };

  // SSH Connections
  sshConnections: string[];

  // Actions
  addTab: () => void;
  closeTab: (id: string) => void;
  setActiveTab: (id: string) => void;
  updateActiveTab: (changes: Partial<AppTab>) => void;
  reorderTabs: (fromIndex: number, toIndex: number) => void;
  
  setActiveApp: (app: Tab['activeApp']) => void;
  setCurrentPath: (path: string | null) => void;
  setSelectedFile: (file: string | null) => void;
  addToast: (toast: Omit<Toast, 'id'>) => void;
  removeToast: (id: string) => void;
  pushPath: (path: string) => void;
  goBack: () => void;
  goForward: () => void;
  setGitRepoPath: (path: string | null) => void;
  setPeerCount: (count: number) => void;
  setActiveTunnelCount: (count: number) => void;
  updateSettings: (partial: Partial<DashboardState['settings']>) => void;
  addSshConnection: (connection: string) => void;
}

const getSavedSettings = () => {
  const saved = localStorage.getItem('vaultly-settings');
  if (saved) {
    try {
      return JSON.parse(saved);
    } catch (e) {
      console.error('Failed to parse settings', e);
    }
  }
  return {
    defaultPath: '',
    terminalShell: 'powershell',
    theme: 'dark',
    sidebarCollapsed: false,
  };
};

export const useStore = create<DashboardState>((set, get) => ({
  tabs: [{ id: 'tab-1', activeApp: 'home', currentPath: null, selectedFile: null }],
  activeTabId: 'tab-1',
  activeApp: 'home',
  currentPath: null,
  selectedFile: null,
  toasts: [],
  
  pathHistory: [],
  historyIndex: -1,
  canGoBack: false,
  canGoForward: false,
  isVaultLocked: true,
  setVaultLocked: (locked) => set({ isVaultLocked: locked }),
  secretsCount: 0,
  setSecretsCount: (count) => set({ secretsCount: count }),

  gitRepoPath: null,
  peerCount: 0,
  activeTunnelCount: 0,

  settings: getSavedSettings(),
  sshConnections: [],

  addTab: () => set((state) => {
    if (state.tabs.length >= 8) return state;
    const newTab: AppTab = {
      id: `tab-${Date.now()}`,
      activeApp: 'home',
      currentPath: null,
      selectedFile: null,
    };
    return { tabs: [...state.tabs, newTab], activeTabId: newTab.id, activeApp: 'home', currentPath: null, selectedFile: null };
  }),

  closeTab: (id) => set((state) => {
    if (state.tabs.length === 1) return state; // can't close last tab
    const newTabs = state.tabs.filter(t => t.id !== id);
    const newActiveId = state.activeTabId === id
      ? newTabs[newTabs.length - 1].id
      : state.activeTabId;
    const activeTab = newTabs.find(t => t.id === newActiveId)!;
    return { 
      tabs: newTabs, 
      activeTabId: newActiveId,
      activeApp: activeTab.activeApp,
      currentPath: activeTab.currentPath,
      selectedFile: activeTab.selectedFile
    };
  }),

  setActiveTab: (id) => set((state) => {
    const tab = state.tabs.find(t => t.id === id);
    if (!tab) return state;
    return {
      activeTabId: id,
      activeApp: tab.activeApp,
      currentPath: tab.currentPath,
      selectedFile: tab.selectedFile
    };
  }),

  updateActiveTab: (changes) => set((state) => {
    const tabs = state.tabs.map(t => t.id === state.activeTabId ? { ...t, ...changes } : t);
    const tab = tabs.find(t => t.id === state.activeTabId)!;
    return {
      tabs,
      activeApp: tab.activeApp,
      currentPath: tab.currentPath,
      selectedFile: tab.selectedFile
    };
  }),

  reorderTabs: (from, to) => set((state) => {
    const tabs = [...state.tabs];
    const [removed] = tabs.splice(from, 1);
    tabs.splice(to, 0, removed);
    return { tabs };
  }),

  setActiveApp: (app) => get().updateActiveTab({ activeApp: app }),
  
  setCurrentPath: (path) => {
    if (path === null) return;
    get().pushPath(path);
    get().updateActiveTab({ currentPath: path });
  },

  setSelectedFile: (file) => get().updateActiveTab({ selectedFile: file }),
  addToast: (toast) => set((state) => ({
    toasts: [
      ...state.toasts.slice(-3), // keep last 3, add new = max 4
      { ...toast, id: `toast-${Date.now()}-${Math.random().toString(36).slice(2)}` }
    ]
  })),
  removeToast: (id) => set((state) => ({
    toasts: state.toasts.filter((t) => t.id !== id)
  })),

  pushPath: (path) => set((state) => {
    const newHistory = [...state.pathHistory.slice(0, state.historyIndex + 1), path];
    return {
      pathHistory: newHistory,
      historyIndex: newHistory.length - 1,
      currentPath: path,
      canGoBack: newHistory.length > 1,
      canGoForward: false,
    };
  }),

  goBack: () => set((state) => {
    if (!state.canGoBack) return state;
    const newIndex = state.historyIndex - 1;
    return {
      historyIndex: newIndex,
      currentPath: state.pathHistory[newIndex],
      canGoBack: newIndex > 0,
      canGoForward: true,
    };
  }),

  goForward: () => set((state) => {
    if (!state.canGoForward) return state;
    const newIndex = state.historyIndex + 1;
    return {
      historyIndex: newIndex,
      currentPath: state.pathHistory[newIndex],
      canGoBack: true,
      canGoForward: newIndex < state.pathHistory.length - 1,
    };
  }),

  setGitRepoPath: (path) => set({ gitRepoPath: path }),
  setPeerCount: (count) => set({ peerCount: count }),
  setActiveTunnelCount: (count) => set({ activeTunnelCount: count }),
  
  updateSettings: (partial) => set((state) => ({
    settings: { ...state.settings, ...partial }
  })),

  addSshConnection: (connection) => set((state) => ({
    sshConnections: Array.from(new Set([connection, ...state.sshConnections]))
  })),
}));

export const useToast = () => {
  const addToast = useStore((s) => s.addToast);
  return {
    success: (title: string, message?: string) => addToast({ type: 'success', title, message, duration: 4000 }),
    error: (title: string, message?: string) => addToast({ type: 'error', title, message, duration: 6000 }),
    warning: (title: string, message?: string) => addToast({ type: 'warning', title, message, duration: 5000 }),
    info: (title: string, message?: string) => addToast({ type: 'info', title, message, duration: 4000 }),
  };
};

useStore.subscribe((state) => {
  localStorage.setItem('vaultly-settings', JSON.stringify(state.settings));
});
