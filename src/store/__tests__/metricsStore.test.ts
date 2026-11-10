import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { invoke } from '@tauri-apps/api/core';
import { useMetricsStore, startMetricsPolling } from '../metricsStore';
import { useStore } from '../store';

const mockedInvoke = vi.mocked(invoke);

describe('metricsStore', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.clearAllTimers();
    vi.useFakeTimers();

    useStore.setState({
      settings: {
        defaultPath: '',
        terminalShell: 'powershell',
        theme: 'dark',
        recentWorkspaces: [],
        aiCopilotEnabled: true,
        memorySpikeThresholdMb: 500,
        memorySpikeWindowSec: 10,
        sidebarCollapsed: false,
        proxyWhitelist: ['127.0.0.1'],
        performanceMode: 'lightweight',
        monitoringEnabled: true,
      },
    });

    useMetricsStore.setState({
      cpuUsage: null,
      memTotal: 0,
      memUsed: 0,
      memPercent: null,
      drives: [],
      lastUpdated: 0,
      isFetching: false,
    });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('updates state with valid sys stats and computes memory percentage', async () => {
    mockedInvoke.mockResolvedValueOnce({
      cpu_usage: 18.5,
      mem_total: 16000000000,
      mem_used: 4000000000,
      drives: [{ name: 'C', mount_point: 'C:\\', total_space: 100, available_space: 50 }],
    });

    await useMetricsStore.getState().fetchMetrics(true);

    const state = useMetricsStore.getState();
    expect(state.cpuUsage).toBe(18.5);
    expect(state.memPercent).toBe(25);
    expect(state.drives).toHaveLength(1);
    expect(mockedInvoke).toHaveBeenCalledWith('get_sys_stats', { refreshDisks: true });
  });

  it('suppresses concurrent duplicate fetches via single-flight guard', async () => {
    let resolveFirst: (val: any) => void = () => {};
    const firstPromise = new Promise(resolve => {
      resolveFirst = resolve;
    });
    mockedInvoke.mockReturnValueOnce(firstPromise as any);

    // Trigger two calls simultaneously
    const p1 = useMetricsStore.getState().fetchMetrics();
    const p2 = useMetricsStore.getState().fetchMetrics();

    expect(mockedInvoke).toHaveBeenCalledTimes(1);

    resolveFirst({
      cpu_usage: 10,
      mem_total: 1000,
      mem_used: 200,
      drives: [],
    });
    await Promise.all([p1, p2]);

    expect(mockedInvoke).toHaveBeenCalledTimes(1);
  });

  it('skips fetching when monitoringEnabled is false', async () => {
    useStore.setState({
      settings: {
        ...useStore.getState().settings,
        monitoringEnabled: false,
      },
    });

    await useMetricsStore.getState().fetchMetrics();
    expect(mockedInvoke).not.toHaveBeenCalled();
  });

  it('startMetricsPolling schedules adaptive polling based on performance mode', async () => {
    mockedInvoke.mockResolvedValue({
      cpu_usage: 5.0,
      mem_total: 1000,
      mem_used: 100,
      drives: [],
    });

    const stop = startMetricsPolling();

    // Initial fetch
    expect(mockedInvoke).toHaveBeenCalledTimes(1);

    // Fast-forward lightweight interval (8000ms)
    await vi.advanceTimersByTimeAsync(8000);
    expect(mockedInvoke.mock.calls.length).toBeGreaterThanOrEqual(2);

    stop();

    const callCountAfterStop = mockedInvoke.mock.calls.length;
    // After stopping, no further calls occur
    await vi.advanceTimersByTimeAsync(16000);
    expect(mockedInvoke.mock.calls.length).toBe(callCountAfterStop);
  });
});
