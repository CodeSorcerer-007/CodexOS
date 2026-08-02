import { create } from 'zustand';
import type { Tab } from '../App';

interface DashboardState {
  activeApp: Tab['activeApp'];
  currentPath: string | null;
  selectedFile: string | null;
  setActiveApp: (app: Tab['activeApp']) => void;
  setCurrentPath: (path: string | null) => void;
  setSelectedFile: (file: string | null) => void;
}

export const useStore = create<DashboardState>((set) => ({
  activeApp: 'home',
  currentPath: null,
  selectedFile: null,
  setActiveApp: (app) => set({ activeApp: app }),
  setCurrentPath: (path) => set({ currentPath: path }),
  setSelectedFile: (file) => set({ selectedFile: file }),
}));
