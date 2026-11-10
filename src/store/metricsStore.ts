import { create } from 'zustand';
import { invoke } from '@tauri-apps/api/core';
import { useStore } from './store';

export interface DriveInfo {
  name: string;
  mount_point: string;
  total_space: number;
  available_space: number;
}

export interface SysStats {
  cpu_usage: number;
  mem_total: number;
  mem_used: number;
  drives: DriveInfo[];
}

export interface MetricsState {
  cpuUsage: number | null;
  memTotal: number;
  memUsed: number;
  memPercent: number | null;
  drives: DriveInfo[];
  lastUpdated: number;
  isFetching: boolean;
  fetchMetrics: (forceDisks?: boolean) => Promise<void>;
}

let pollingTimer: ReturnType<typeof setTimeout> | null = null;
let isSingleFlightActive = false;

function getIntervalMs(mode: 'lightweight' | 'balanced' | 'developer'): number {
  switch (mode) {
    case 'developer':
      return 2000;
    case 'balanced':
      return 4500;
    case 'lightweight':
    default:
      return 8000;
  }
}

export const useMetricsStore = create<MetricsState>((set) => ({
  cpuUsage: null,
  memTotal: 0,
  memUsed: 0,
  memPercent: null,
  drives: [],
  lastUpdated: 0,
  isFetching: false,

  fetchMetrics: async (forceDisks = false) => {
    // Single-flight guard: prevent overlapping telemetry calls
    if (isSingleFlightActive) return;

    const { settings } = useStore.getState();
    if (settings?.monitoringEnabled === false) return;
    if (typeof document !== 'undefined' && document.visibilityState === 'hidden') return;

    isSingleFlightActive = true;
    set({ isFetching: true });

    try {
      const stats = await invoke<SysStats>('get_sys_stats', { refreshDisks: forceDisks });
      if (stats) {
        const memPercent =
          stats.mem_total > 0 && stats.mem_used >= 0
            ? Math.round((stats.mem_used / stats.mem_total) * 100)
            : null;

        set({
          cpuUsage: isNaN(stats.cpu_usage) ? null : stats.cpu_usage,
          memTotal: stats.mem_total,
          memUsed: stats.mem_used,
          memPercent,
          drives: stats.drives || [],
          lastUpdated: Date.now(),
        });
      }
    } catch {
      // Gracefully handle test environment or offline backend
    } finally {
      isSingleFlightActive = false;
      set({ isFetching: false });
    }
  },
}));

/**
 * Initializes adaptive system metrics polling.
 * Honors performance mode ('lightweight' | 'balanced' | 'developer'),
 * pauses completely when window is minimized/hidden, and prevents duplicate intervals.
 */
export function stopMetricsPolling(): void {
  if (pollingTimer) {
    clearTimeout(pollingTimer);
    pollingTimer = null;
  }
}

export function startMetricsPolling(): () => void {
  if (typeof window === 'undefined') return () => {};
  stopMetricsPolling();

  const scheduleNext = () => {
    if (pollingTimer) clearTimeout(pollingTimer);

    const { settings } = useStore.getState();
    if (settings?.monitoringEnabled === false) return;

    const interval = getIntervalMs(settings.performanceMode || 'lightweight');
    pollingTimer = setTimeout(async () => {
      if (document.visibilityState !== 'hidden') {
        await useMetricsStore.getState().fetchMetrics();
      }
      scheduleNext();
    }, interval);
  };

  const handleVisibilityChange = () => {
    if (document.visibilityState === 'visible') {
      const state = useMetricsStore.getState();
      const elapsed = Date.now() - state.lastUpdated;
      const { settings } = useStore.getState();
      const interval = getIntervalMs(settings.performanceMode || 'lightweight');

      if (elapsed > interval) {
        state.fetchMetrics();
      }
      scheduleNext();
    } else {
      if (pollingTimer) clearTimeout(pollingTimer);
    }
  };

  document.addEventListener('visibilitychange', handleVisibilityChange);
  // Initial immediate fetch
  useMetricsStore.getState().fetchMetrics(true);
  scheduleNext();

  return () => {
    stopMetricsPolling();
    document.removeEventListener('visibilitychange', handleVisibilityChange);
  };
}
