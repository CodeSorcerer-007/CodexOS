// Usage: const { success, error } = useToast();
// success('File saved!');
// error('Operation failed', err.message);

import { create } from 'zustand';
import type { Tab } from '../App';

<<<<<<< HEAD
export type ToastType = 'success' | 'error' | 'warning' | 'info';

export interface Toast {
  id: string;
  type: ToastType;
  title: string;
  message?: string;
  duration?: number; // ms, 0 = never auto-dismiss
}

interface DashboardState {
  activeApp: Tab['activeApp'];
  currentPath: string | null;
  selectedFile: string | null;
  toasts: Toast[];
  setActiveApp: (app: Tab['activeApp']) => void;
  setCurrentPath: (path: string | null) => void;
  setSelectedFile: (file: string | null) => void;
  addToast: (toast: Omit<Toast, 'id'>) => void;
  removeToast: (id: string) => void;
=======
export interface DashboardState {
  activeApp: Tab['activeApp'];
  currentPath: string | null;
  selectedFile: string | null;
  
  // Navigation State
  pathHistory: string[];
  historyIndex: number;
  canGoBack: boolean;
  canGoForward: boolean;

  // Git State
  gitRepoPath: string | null;

  // Active Tunnels Badge
  activeTunnelCount: number;

  // Active Secrets Badge
  secretsCount: number;

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
  setActiveApp: (app: Tab['activeApp']) => void;
  setCurrentPath: (path: string | null) => void;
  setSelectedFile: (file: string | null) => void;
  pushPath: (path: string) => void;
  goBack: () => void;
  goForward: () => void;
  setGitRepoPath: (path: string | null) => void;
  setActiveTunnelCount: (count: number) => void;
  setSecretsCount: (count: number) => void;
  updateSettings: (partial: Partial<DashboardState['settings']>) => void;
  addSshConnection: (connection: string) => void;
>>>>>>> subagent-Store-Expander-self-2c4706bf
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

export const useStore = create<DashboardState>((set) => ({
  activeApp: 'home',
  currentPath: null,
  selectedFile: null,
<<<<<<< HEAD
  toasts: [],
=======
  
  pathHistory: [],
  historyIndex: -1,
  canGoBack: false,
  canGoForward: false,

  gitRepoPath: null,
  activeTunnelCount: 0,
  secretsCount: 0,

  settings: getSavedSettings(),
  sshConnections: [],

>>>>>>> subagent-Store-Expander-self-2c4706bf
  setActiveApp: (app) => set({ activeApp: app }),
  
  setCurrentPath: (path) => {
    if (path === null) return;
    useStore.getState().pushPath(path);
  },

  setSelectedFile: (file) => set({ selectedFile: file }),
<<<<<<< HEAD
  addToast: (toast) => set((state) => ({
    toasts: [
      ...state.toasts.slice(-3), // keep last 3, add new = max 4
      { ...toast, id: `toast-${Date.now()}-${Math.random().toString(36).slice(2)}` }
    ]
  })),
  removeToast: (id) => set((state) => ({
    toasts: state.toasts.filter((t) => t.id !== id)
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
=======

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
  setActiveTunnelCount: (count) => set({ activeTunnelCount: count }),
  setSecretsCount: (count) => set({ secretsCount: count }),
  
  updateSettings: (partial) => set((state) => ({
    settings: { ...state.settings, ...partial }
  })),

  addSshConnection: (connection) => set((state) => ({
    sshConnections: Array.from(new Set([connection, ...state.sshConnections]))
  })),
}));

useStore.subscribe((state) => {
  localStorage.setItem('vaultly-settings', JSON.stringify(state.settings));
});
>>>>>>> subagent-Store-Expander-self-2c4706bf
