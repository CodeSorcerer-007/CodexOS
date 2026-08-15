import type { StateCreator } from 'zustand';
import type { DashboardState } from '../store';

export type ToastType = 'success' | 'error' | 'warning' | 'info';

export interface Toast {
  id: string;
  type: ToastType;
  title: string;
  message?: string;
  duration?: number;
}

export interface UiSlice {
  toasts: Toast[];
  addToast: (toast: Omit<Toast, 'id'>) => void;
  removeToast: (id: string) => void;

  isVaultLocked: boolean;
  secretsCount: number;
  setVaultLocked: (locked: boolean) => void;
  setSecretsCount: (count: number) => void;

  peerCount: number;
  setPeerCount: (count: number) => void;

  activeTunnelCount: number;
  setActiveTunnelCount: (count: number) => void;

  showKeyboardHelp: boolean;
  setShowKeyboardHelp: (show: boolean) => void;

  gitRepoPath: string | null;
  setGitRepoPath: (path: string | null) => void;
  
  sshConnections: string[];
  addSshConnection: (connection: string) => void;
}

export const createUiSlice: StateCreator<DashboardState, [], [], UiSlice> = (set) => ({
  toasts: [],
  addToast: (toast) => set((state) => ({
    toasts: [
      ...state.toasts.slice(-3),
      { ...toast, id: `toast-${Date.now()}-${Math.random().toString(36).slice(2)}` }
    ]
  })),
  removeToast: (id) => set((state) => ({
    toasts: state.toasts.filter((t) => t.id !== id)
  })),

  isVaultLocked: true,
  setVaultLocked: (locked) => set({ isVaultLocked: locked }),
  
  secretsCount: 0,
  setSecretsCount: (count) => set({ secretsCount: count }),

  peerCount: 0,
  setPeerCount: (count) => set({ peerCount: count }),

  activeTunnelCount: 0,
  setActiveTunnelCount: (count) => set({ activeTunnelCount: count }),

  showKeyboardHelp: false,
  setShowKeyboardHelp: (show) => set({ showKeyboardHelp: show }),

  gitRepoPath: null,
  setGitRepoPath: (path) => set({ gitRepoPath: path }),

  sshConnections: [],
  addSshConnection: (connection) => set((state) => ({
    sshConnections: Array.from(new Set([connection, ...state.sshConnections]))
  })),
});
