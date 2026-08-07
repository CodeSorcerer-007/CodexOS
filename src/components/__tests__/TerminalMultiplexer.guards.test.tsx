/**
 * Unit tests for TerminalMultiplexer terminal trigger guards.
 *
 * Tests Requirements 2.1, 2.3, 1.2:
 *   - enabled === false  → diagnose_issue is NOT invoked
 *   - triggerId in dismissedIds → diagnose_issue is NOT invoked
 *   - exitCode === 0 → diagnose_issue is NOT invoked
 *   - all guards pass → setLoading then invoke called
 */

import { render, act } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import { useDiagnosisStore } from '../../store/diagnosisStore';
import { TerminalPane } from '../TerminalMultiplexer';

// ── Mocks ─────────────────────────────────────────────────────────────────────

// xterm uses a class constructor — must be a regular function, not an arrow.
vi.mock('xterm', () => {
  function Terminal() {
    return {
      loadAddon: vi.fn(),
      open: vi.fn(),
      onData: vi.fn(),
      write: vi.fn(),
      dispose: vi.fn(),
    };
  }
  return { Terminal };
});

vi.mock('xterm-addon-fit', () => {
  function FitAddon() {
    return { fit: vi.fn() };
  }
  return { FitAddon };
});

vi.mock('xterm/css/xterm.css', () => ({}));

// DiagnosisCard has heavy framer-motion deps — stub it for guard tests only.
vi.mock('../DiagnosisCard', () => ({
  DiagnosisCard: () => null,
}));

// ── Constants ─────────────────────────────────────────────────────────────────

const PANE_ID = 'test-pane-id-guards';
const TRIGGER_ID = `terminal:${PANE_ID}`;

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Reset the Zustand store to a known state. */
function resetStore(
  overrides: Partial<{
    enabled: boolean;
    dismissedIds: Set<string>;
  }> = {}
) {
  useDiagnosisStore.setState({
    entries: {},
    dismissedIds: new Set<string>(),
    enabled: true,
    ...overrides,
  });
}

/**
 * Renders TerminalPane and returns a function to fire the captured PTY exit event.
 * The `listen` mock must be set up with a capture slot BEFORE calling this helper.
 *
 * @param exitCallback - mutable ref that will be populated by the listen mock
 */
async function renderPaneAndWaitForInit(
  exitCallbackRef: { current: ((event: { payload: number }) => void) | null }
) {
  // The listen mock needs to capture the callback; set it up before render.
  vi.mocked(listen).mockImplementation(async (event, cb) => {
    if (event === `pty-exit-${PANE_ID}`) {
      exitCallbackRef.current = cb as (event: { payload: number }) => void;
    }
    return () => {};
  });

  // Render inside act so the useEffect fires synchronously in jsdom
  await act(async () => {
    render(
      <TerminalPane
        id={PANE_ID}
        onClose={() => {}}
        showClose={false}
        shell="bash"
        cwd={null}
      />
    );
  });
}

/** Fire the captured exit event or throw if not registered. */
async function fireExit(
  exitCallbackRef: { current: ((event: { payload: number }) => void) | null },
  exitCode: number
) {
  if (!exitCallbackRef.current) {
    throw new Error(
      'pty-exit listener was not captured. Check that listen mock is installed before render.'
    );
  }
  await act(async () => {
    exitCallbackRef.current!({ payload: exitCode });
  });
}



// ── Tests ─────────────────────────────────────────────────────────────────────

describe('TerminalMultiplexer — trigger guards', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resetStore();
  });

  // ── Requirement 1.2 ─────────────────────────────────────────────────────────
  it('does NOT invoke diagnose_issue when enabled === false', async () => {
    resetStore({ enabled: false });

    const exitCbRef: { current: ((event: { payload: number }) => void) | null } =
      { current: null };

    await renderPaneAndWaitForInit(exitCbRef);
    await fireExit(exitCbRef, 1);

    expect(vi.mocked(invoke)).not.toHaveBeenCalledWith(
      'diagnose_issue',
      expect.anything()
    );
  });

  // ── Requirement 2.3 ─────────────────────────────────────────────────────────
  it('does NOT invoke diagnose_issue when triggerId is in dismissedIds', async () => {
    resetStore({ dismissedIds: new Set([TRIGGER_ID]) });

    const exitCbRef: { current: ((event: { payload: number }) => void) | null } =
      { current: null };

    await renderPaneAndWaitForInit(exitCbRef);
    await fireExit(exitCbRef, 1);

    expect(vi.mocked(invoke)).not.toHaveBeenCalledWith(
      'diagnose_issue',
      expect.anything()
    );
  });

  // ── Requirement 2.1 ─────────────────────────────────────────────────────────
  it('does NOT invoke diagnose_issue when exitCode === 0', async () => {
    resetStore({ enabled: true });

    const exitCbRef: { current: ((event: { payload: number }) => void) | null } =
      { current: null };

    await renderPaneAndWaitForInit(exitCbRef);
    await fireExit(exitCbRef, 0);

    expect(vi.mocked(invoke)).not.toHaveBeenCalledWith(
      'diagnose_issue',
      expect.anything()
    );
  });

  // ── Requirements 2.1, 2.3, 1.2 ──────────────────────────────────────────────
  it('calls setLoading then invoke("diagnose_issue") when all guards pass', async () => {
    resetStore({ enabled: true });

    const callOrder: string[] = [];

    // Spy on setLoading to record call order
    const setLoadingSpy = vi
      .spyOn(useDiagnosisStore.getState(), 'setLoading')
      .mockImplementation((id) => {
        callOrder.push('setLoading');
        useDiagnosisStore.setState((s) => ({
          entries: {
            ...s.entries,
            [id]: { status: 'loading', triggerId: id },
          },
        }));
      });

    // Mock invoke to record call order for the diagnose_issue command
    vi.mocked(invoke).mockImplementation(async (cmd) => {
      if (cmd === 'diagnose_issue') {
        callOrder.push('invoke');
      }
      if (cmd === 'diagnose_issue') {
        return {
          cause: 'Test error',
          confidence: 'high',
          explanation: 'Something broke.',
          suggested_fix: 'Fix it',
          related_files: [],
        };
      }
      return null;
    });

    const exitCbRef: { current: ((event: { payload: number }) => void) | null } =
      { current: null };

    await renderPaneAndWaitForInit(exitCbRef);
    await fireExit(exitCbRef, 1);

    // setLoading must be called with the correct triggerId
    expect(setLoadingSpy).toHaveBeenCalledWith(TRIGGER_ID);

    // invoke must be called with the correct command and trigger payload
    expect(vi.mocked(invoke)).toHaveBeenCalledWith('diagnose_issue', {
      trigger: {
        type: 'terminal_error',
        session_id: PANE_ID,
        exit_code: 1,
      },
      repoPath: null,
    });

    // setLoading must have been called BEFORE invoke
    expect(callOrder.indexOf('setLoading')).toBeLessThan(
      callOrder.indexOf('invoke')
    );
  });
});
