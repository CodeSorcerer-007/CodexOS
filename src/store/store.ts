import { create } from 'zustand';
import type { Tab } from '../App';

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
  
  pathHistory: [],
  historyIndex: -1,
  canGoBack: false,
  canGoForward: false,

  gitRepoPath: null,
  activeTunnelCount: 0,
  secretsCount: 0,

  settings: getSavedSettings(),
  sshConnections: [],

  setActiveApp: (app) => set({ activeApp: app }),
  
  setCurrentPath: (path) => {
    if (path === null) return;
    useStore.getState().pushPath(path);
  },

  setSelectedFile: (file) => set({ selectedFile: file }),

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
