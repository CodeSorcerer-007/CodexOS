// Usage: const { success, error } = useToast();
// success('File saved!');
// error('Operation failed', err.message);

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
}

export const useStore = create<DashboardState>((set) => ({
  activeApp: 'home',
  currentPath: null,
  selectedFile: null,
  toasts: [],
  setActiveApp: (app) => set({ activeApp: app }),
  setCurrentPath: (path) => set({ currentPath: path }),
  setSelectedFile: (file) => set({ selectedFile: file }),
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
