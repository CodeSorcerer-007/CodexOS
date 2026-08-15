import { create } from 'zustand';
import { createTabsSlice, type TabsSlice, type AppTab } from './slices/tabsSlice';
import { createSettingsSlice, type SettingsSlice } from './slices/settingsSlice';
import { createUiSlice, type UiSlice } from './slices/uiSlice';
import { kvSet } from '../ipc';

export type { AppTab };
export type DashboardState = TabsSlice & SettingsSlice & UiSlice;

export const useStore = create<DashboardState>((...args) => ({
  ...createTabsSlice(...args),
  ...createSettingsSlice(...args),
  ...createUiSlice(...args),
}));

export async function hydrateStore(): Promise<void> {
  const state = useStore.getState();
  await Promise.allSettled([
    state.hydrateTabsFromSqlite?.(),
    state.hydrateSettingsFromSqlite?.(),
  ]);
}



export const useToast = () => {
  const addToast = useStore((s) => s.addToast);
  return {
    success: (title: string, message?: string) => addToast({ type: 'success', title, message, duration: 4000 }),
    error: (title: string, message?: string) => addToast({ type: 'error', title, message, duration: 6000 }),
    warning: (title: string, message?: string) => addToast({ type: 'warning', title, message, duration: 5000 }),
    info: (title: string, message?: string) => addToast({ type: 'info', title, message, duration: 4000 }),
  };
};

let lastSavedSettings = '';
let saveTimeout: ReturnType<typeof setTimeout> | null = null;
useStore.subscribe((state) => {
  const safeSettings = { ...state.settings };
  const currentSettingsStr = JSON.stringify(safeSettings);
  if (currentSettingsStr !== lastSavedSettings) {
    if (saveTimeout) clearTimeout(saveTimeout);
    saveTimeout = setTimeout(() => {
      lastSavedSettings = currentSettingsStr;
      localStorage.setItem('codexos-settings', currentSettingsStr);
      kvSet('codexos-settings', currentSettingsStr).catch(() => {});
    }, 500);
  }
});
