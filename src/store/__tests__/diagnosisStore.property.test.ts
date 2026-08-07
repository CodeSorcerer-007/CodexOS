/**
 * Property-based tests for diagnosisStore — Property 6: Dismiss persistence
 *
 * Validates: Requirements 5.4, 5.5
 *
 * **Validates: Requirements 5.4, 5.5**
 *
 * Property 6 states:
 *   - dismissedIds only ever grows monotonically (size never decreases)
 *   - once dismiss(id) is called, that id persists in dismissedIds for the session
 */

import { describe, test, beforeEach } from 'vitest';
import * as fc from 'fast-check';
import { useDiagnosisStore } from '../diagnosisStore';

/** Reset store to a clean baseline before each test */
const resetStore = () => {
  useDiagnosisStore.setState({
    entries: {},
    dismissedIds: new Set<string>(),
    enabled: true,
  });
};

describe('Property 6: Dismiss persistence — dismissedIds monotone growth', () => {
  beforeEach(resetStore);

  /**
   * P6-A: dismissedIds.size never decreases after any sequence of dismiss() calls.
   *
   * For an arbitrary array of string IDs, we call dismiss() on each one in order
   * and assert that the size after each call is >= the size before the call.
   *
   * **Validates: Requirements 5.4, 5.5**
   */
  test('P6-A: dismissedIds.size is monotonically non-decreasing across arbitrary dismiss sequences', () => {
    fc.assert(
      fc.property(
        fc.array(fc.string(), { minLength: 1, maxLength: 50 }),
        (ids) => {
          resetStore();
          const store = useDiagnosisStore;

          let previousSize = store.getState().dismissedIds.size;

          for (const id of ids) {
            store.getState().dismiss(id);
            const currentSize = store.getState().dismissedIds.size;
            // Size must never decrease
            if (currentSize < previousSize) {
              return false;
            }
            previousSize = currentSize;
          }

          return true;
        }
      )
    );
  });

  /**
   * P6-B: Every dismissed triggerId is present in all subsequent snapshots.
   *
   * After calling dismiss(id), that id must remain in dismissedIds no matter
   * how many additional dismiss() calls follow.
   *
   * **Validates: Requirements 5.4, 5.5**
   */
  test('P6-B: a dismissed triggerId is always present in all subsequent snapshots', () => {
    fc.assert(
      fc.property(
        // ids[0] is the id we will check; ids[1..] are subsequent calls
        fc.array(fc.string(), { minLength: 2, maxLength: 50 }),
        (ids) => {
          resetStore();
          const store = useDiagnosisStore;

          const [targetId, ...rest] = ids;

          // Dismiss the target id first
          store.getState().dismiss(targetId);

          // Verify it's present immediately
          if (!store.getState().dismissedIds.has(targetId)) {
            return false;
          }

          // Dismiss all subsequent ids and re-verify target is still there
          for (const id of rest) {
            store.getState().dismiss(id);
            if (!store.getState().dismissedIds.has(targetId)) {
              return false;
            }
          }

          return true;
        }
      )
    );
  });

  /**
   * P6-C: dismissing the same id multiple times is idempotent on the set content
   * and size only changes (increases by 1) on the first call for a new id.
   *
   * **Validates: Requirements 5.4, 5.5**
   */
  test('P6-C: dismissing an already-dismissed id does not change dismissedIds.size', () => {
    fc.assert(
      fc.property(
        fc.string(),
        fc.integer({ min: 1, max: 10 }),
        (id, repeatCount) => {
          resetStore();
          const store = useDiagnosisStore;

          // First dismiss
          store.getState().dismiss(id);
          const sizeAfterFirst = store.getState().dismissedIds.size;

          // Dismiss the same id repeatedly
          for (let i = 0; i < repeatCount; i++) {
            store.getState().dismiss(id);
            const sizeNow = store.getState().dismissedIds.size;
            if (sizeNow !== sizeAfterFirst) {
              return false;
            }
          }

          return true;
        }
      )
    );
  });
});
