/**
 * Unit tests for the detectMemorySpike pure utility function.
 *
 * Tests Requirements 3.1, 3.2, 3.3:
 *   3.1 — delta >= threshold triggers a spike
 *   3.2 — a process already in "loading" state must not trigger again
 *   3.3 — window eviction removes stale samples
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { detectMemorySpike, type MemorySample } from '../detectMemorySpike';
import { useDiagnosisStore } from '../../store/diagnosisStore';

// ── Helpers ───────────────────────────────────────────────────────────────────

const BASE_TIME = 1_000_000; // arbitrary fixed "now" for deterministic tests

function makeSample(timestamp: number, memMb: number): MemorySample {
  return { timestamp, memMb };
}

// ── detectMemorySpike — pure function tests ───────────────────────────────────

describe('detectMemorySpike — pure logic', () => {
  // ── Requirement 3.1 ─────────────────────────────────────────────────────────

  it('returns spikeDetected=false when delta is below the threshold', () => {
    const threshold = 500;
    const windowSec = 10;
    // Two samples inside the window: delta = 499 MB  (< 500)
    const existingWindow: MemorySample[] = [
      makeSample(BASE_TIME, 1000),
    ];
    const newSample = makeSample(BASE_TIME + 5_000, 1499);

    const { spikeDetected } = detectMemorySpike(
      existingWindow,
      newSample,
      threshold,
      windowSec,
    );

    expect(spikeDetected).toBe(false);
  });

  it('returns spikeDetected=true when delta equals the threshold exactly', () => {
    const threshold = 500;
    const windowSec = 10;
    // Two samples inside the window: delta = 500 MB  (== 500, boundary case)
    const existingWindow: MemorySample[] = [
      makeSample(BASE_TIME, 1000),
    ];
    const newSample = makeSample(BASE_TIME + 5_000, 1500);

    const { spikeDetected } = detectMemorySpike(
      existingWindow,
      newSample,
      threshold,
      windowSec,
    );

    expect(spikeDetected).toBe(true);
  });

  it('returns spikeDetected=true when delta exceeds the threshold', () => {
    const threshold = 500;
    const windowSec = 10;
    const existingWindow: MemorySample[] = [
      makeSample(BASE_TIME, 1000),
    ];
    const newSample = makeSample(BASE_TIME + 5_000, 1700); // delta = 700

    const { spikeDetected } = detectMemorySpike(
      existingWindow,
      newSample,
      threshold,
      windowSec,
    );

    expect(spikeDetected).toBe(true);
  });

  it('returns spikeDetected=false when there is only one sample (the new one, empty prior window)', () => {
    const { spikeDetected } = detectMemorySpike(
      [],
      makeSample(BASE_TIME, 2000),
      500,
      10,
    );

    expect(spikeDetected).toBe(false);
  });

  // ── Requirement 3.3 — window eviction ───────────────────────────────────────

  it('evicts stale samples that fall outside the rolling window', () => {
    const threshold = 500;
    const windowSec = 10; // 10 000 ms window

    // Stale sample: 15 s before the new sample (outside the 10 s window)
    const staleSample = makeSample(BASE_TIME - 15_000, 100);
    // Fresh sample inside the window
    const freshSample = makeSample(BASE_TIME - 5_000, 200);

    const existingWindow: MemorySample[] = [staleSample, freshSample];
    const newSample = makeSample(BASE_TIME, 300);

    const { nextWindow } = detectMemorySpike(
      existingWindow,
      newSample,
      threshold,
      windowSec,
    );

    // staleSample must have been evicted — it is 15 s old vs a 10 s window
    const timestamps = nextWindow.map((s) => s.timestamp);
    expect(timestamps).not.toContain(staleSample.timestamp);
    // Fresh sample and new sample must be retained
    expect(timestamps).toContain(freshSample.timestamp);
    expect(timestamps).toContain(newSample.timestamp);
  });

  it('returns spikeDetected=false after eviction leaves fewer than 2 samples', () => {
    const threshold = 100;
    const windowSec = 10;

    // Only one sample, and it is stale (12 s old)
    const staleSample = makeSample(BASE_TIME - 12_000, 50);
    const existingWindow: MemorySample[] = [staleSample];
    const newSample = makeSample(BASE_TIME, 900); // huge memMb, but only 1 retained sample

    const { spikeDetected, nextWindow } = detectMemorySpike(
      existingWindow,
      newSample,
      threshold,
      windowSec,
    );

    // After eviction only newSample remains  →  < 2 samples  →  no spike
    expect(spikeDetected).toBe(false);
    expect(nextWindow).toHaveLength(1);
    expect(nextWindow[0]).toEqual(newSample);
  });

  it('computes delta only across the retained (non-evicted) window', () => {
    const threshold = 500;
    const windowSec = 10;

    // Stale sample has memMb=100; fresh sample has memMb=800
    // If stale were included: delta = 900 - 100 = 800 → spike
    // After eviction: delta = 900 - 800 = 100 → no spike
    const staleSample = makeSample(BASE_TIME - 12_000, 100);
    const freshSample = makeSample(BASE_TIME - 5_000, 800);
    const newSample = makeSample(BASE_TIME, 900);

    const { spikeDetected } = detectMemorySpike(
      [staleSample, freshSample],
      newSample,
      threshold,
      windowSec,
    );

    expect(spikeDetected).toBe(false);
  });

  it('returns the updated nextWindow with the new sample appended', () => {
    const existingWindow: MemorySample[] = [makeSample(BASE_TIME, 100)];
    const newSample = makeSample(BASE_TIME + 2_000, 200);

    const { nextWindow } = detectMemorySpike(existingWindow, newSample, 500, 10);

    expect(nextWindow).toHaveLength(2);
    expect(nextWindow[nextWindow.length - 1]).toEqual(newSample);
  });
});

// ── "Already loading" guard — Requirement 3.2 ────────────────────────────────
//
// The guard (`store.entries[triggerId]?.status !== 'loading'`) lives in
// MemoryProfiler.tsx, not in detectMemorySpike. We test it here by operating
// directly on the diagnosisStore.
//
// Pattern mirrors the TerminalMultiplexer guard tests in
// src/components/__tests__/TerminalMultiplexer.guards.test.tsx.

describe('already-loading guard — Requirement 3.2', () => {
  const PROCESS_NAME = 'test-process';
  const TRIGGER_ID = `memory:${PROCESS_NAME}`;

  beforeEach(() => {
    // Reset the store to a clean baseline
    useDiagnosisStore.setState({
      entries: {},
      dismissedIds: new Set<string>(),
      enabled: true,
    });
    vi.clearAllMocks();
  });

  it('guard allows invocation when no entry exists for the process', () => {
    const store = useDiagnosisStore.getState();
    const isAlreadyLoading = store.entries[TRIGGER_ID]?.status === 'loading';
    expect(isAlreadyLoading).toBe(false);
  });

  it('guard blocks invocation when the entry is already in "loading" state', () => {
    // Simulate what MemoryProfiler does when it first calls setLoading
    useDiagnosisStore.getState().setLoading(TRIGGER_ID);

    const store = useDiagnosisStore.getState();
    const isAlreadyLoading = store.entries[TRIGGER_ID]?.status === 'loading';
    expect(isAlreadyLoading).toBe(true);
  });

  it('guard allows invocation after the entry transitions to "success"', () => {
    useDiagnosisStore.getState().setLoading(TRIGGER_ID);
    useDiagnosisStore.getState().setDiagnosis(TRIGGER_ID, {
      cause: 'High memory usage',
      confidence: 'high',
      explanation: 'The process allocated too much memory.',
      suggested_fix: 'Restart the process.',
      related_files: [],
    });

    const store = useDiagnosisStore.getState();
    const isAlreadyLoading = store.entries[TRIGGER_ID]?.status === 'loading';
    expect(isAlreadyLoading).toBe(false);
  });

  it('guard allows invocation after the entry transitions to "error"', () => {
    useDiagnosisStore.getState().setLoading(TRIGGER_ID);
    useDiagnosisStore.getState().setError(TRIGGER_ID, 'API timeout');

    const store = useDiagnosisStore.getState();
    const isAlreadyLoading = store.entries[TRIGGER_ID]?.status === 'loading';
    expect(isAlreadyLoading).toBe(false);
  });

  it('guard allows invocation when enabled=true and no prior loading entry', () => {
    const store = useDiagnosisStore.getState();
    const shouldInvoke =
      store.enabled && store.entries[TRIGGER_ID]?.status !== 'loading';
    expect(shouldInvoke).toBe(true);
  });

  it('guard blocks invocation when enabled=false regardless of loading state', () => {
    useDiagnosisStore.setState({ enabled: false });
    const store = useDiagnosisStore.getState();
    const shouldInvoke =
      store.enabled && store.entries[TRIGGER_ID]?.status !== 'loading';
    expect(shouldInvoke).toBe(false);
  });
});
