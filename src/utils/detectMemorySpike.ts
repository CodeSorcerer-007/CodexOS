/**
 * Pure utility for memory-spike detection.
 *
 * Given a rolling window of recent samples, a new sample, a threshold (MB),
 * and a window duration (seconds), returns `true` when the memory delta across
 * the retained window equals or exceeds `thresholdMb`.
 *
 * The function is intentionally side-effect-free so it can be unit-tested
 * without any React/Tauri dependencies.
 *
 * Related requirements: 3.1, 3.2, 3.3
 */

export interface MemorySample {
  timestamp: number; // Unix ms (Date.now())
  memMb: number;
}

/**
 * Detects whether a memory spike has occurred.
 *
 * @param window     The current rolling window of samples for a process.
 *                   Must NOT be mutated by the caller after passing — the
 *                   function returns a new, evicted+appended array via
 *                   `nextWindow`.
 * @param newSample  The freshly-polled sample to append to the window.
 * @param thresholdMb  Minimum delta (inclusive) in MB that constitutes a spike.
 * @param windowSec  Rolling window width in seconds. Samples older than
 *                   `newSample.timestamp - windowSec * 1000` are evicted.
 *
 * @returns An object containing:
 *   - `spikeDetected`: `true` iff `delta >= thresholdMb` and there are ≥ 2
 *     retained samples.
 *   - `nextWindow`: The updated window (stale entries evicted, newSample
 *     appended) that the caller should store back into its ref.
 */
export function detectMemorySpike(
  window: MemorySample[],
  newSample: MemorySample,
  thresholdMb: number,
  windowSec: number,
): { spikeDetected: boolean; nextWindow: MemorySample[] } {
  const windowMs = windowSec * 1000;
  const windowStart = newSample.timestamp - windowMs;

  // Evict expired entries, then append the new sample.
  const retained = window.filter((e) => e.timestamp >= windowStart);
  retained.push(newSample);

  if (retained.length < 2) {
    return { spikeDetected: false, nextWindow: retained };
  }

  const delta = retained[retained.length - 1].memMb - retained[0].memMb;
  return {
    spikeDetected: delta >= thresholdMb,
    nextWindow: retained,
  };
}
