import { describe, test, expect, beforeEach } from 'vitest';
import fc from 'fast-check';
import { useStore } from '../store';

const resetStore = () => {
  useStore.setState({
    tabs: [{ id: 'tab-1', activeApp: 'home', currentPath: null, selectedFile: null, openFiles: [], pathHistory: [], historyIndex: -1 }],
    activeTabId: 'tab-1',
    activeApp: 'home',
    currentPath: null,
    selectedFile: null,
    openFiles: [],
    toasts: [],
  });
};

describe('store property invariants', () => {
  beforeEach(resetStore);

  test('tab count is strictly between 1 and 8 after any operation sequence', () => {
    fc.assert(
      fc.property(
        fc.array(
          fc.oneof(
            fc.constant('addTab'),
            fc.constant('closeTab'),
            fc.tuple(fc.nat(10), fc.nat(10)).map(([from, to]) => ({ type: 'reorder', from, to }))
          ),
          { maxLength: 50 }
        ),
        (ops) => {
          resetStore();
          for (const op of ops) {
            const state = useStore.getState();
            if (op === 'addTab') {
              state.addTab();
            } else if (op === 'closeTab') {
              state.closeTab(state.activeTabId);
            } else if (typeof op === 'object' && op.type === 'reorder') {
              state.reorderTabs(op.from % Math.max(1, state.tabs.length), op.to % Math.max(1, state.tabs.length));
            }
          }
          const finalTabs = useStore.getState().tabs;
          expect(finalTabs.length).toBeGreaterThanOrEqual(1);
          expect(finalTabs.length).toBeLessThanOrEqual(8);
        }
      )
    );
  });

  test('pathHistory and historyIndex remain valid after arbitrary path actions', () => {
    fc.assert(
      fc.property(
        fc.array(
          fc.oneof(
            fc.string({ minLength: 1 }).map((p) => ({ type: 'push', path: `/${p}` })),
            fc.constant({ type: 'back' }),
            fc.constant({ type: 'forward' })
          ),
          { maxLength: 50 }
        ),
        (ops) => {
          resetStore();
          for (const op of ops) {
            const state = useStore.getState();
            if (op.type === 'push') {
              state.pushPath(op.path);
            } else if (op.type === 'back') {
              state.goBack();
            } else if (op.type === 'forward') {
              state.goForward();
            }
          }
          const state = useStore.getState();
          const activeTab = state.tabs.find(t => t.id === state.activeTabId)!;
          const { pathHistory, historyIndex } = activeTab;
          const canGoBack = historyIndex > 0;
          const canGoForward = historyIndex < pathHistory.length - 1;
          if (pathHistory.length === 0) {
            expect(historyIndex).toBe(-1);
            expect(canGoBack).toBe(false);
            expect(canGoForward).toBe(false);
          } else {
            expect(historyIndex).toBeGreaterThanOrEqual(0);
            expect(historyIndex).toBeLessThan(pathHistory.length);
            expect(canGoBack).toBe(historyIndex > 0);
            expect(canGoForward).toBe(historyIndex < pathHistory.length - 1);
          }
        }
      )
    );
  });
});
