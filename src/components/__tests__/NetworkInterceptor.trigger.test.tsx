/**
 * Unit tests for NetworkInterceptor network trigger.
 *
 * Tests Requirements 4.1, 4.2, 4.3, 1.2:
 *   - response_status < 400  → "Diagnose" button NOT rendered
 *   - response_status >= 400 → "Diagnose" button rendered
 *   - button click with enabled === false → invoke NOT called
 *   - button click with enabled === true  → setLoading then invoke called
 */

import { render, screen, fireEvent, act } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import { useDiagnosisStore } from '../../store/diagnosisStore';
import { NetworkInterceptor } from '../NetworkInterceptor';

// ── Mocks ─────────────────────────────────────────────────────────────────────

// Stub DiagnosisCard — avoids heavy framer-motion deps, not under test here.
vi.mock('../DiagnosisCard', () => ({
  DiagnosisCard: () => null,
}));

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Reset the Zustand store to a known state before each test. */
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

/** A minimal captured request fixture. */
function makeRequest(id: number, responseStatus: number) {
  return {
    id,
    method: 'GET',
    url: `https://example.com/api/test/${id}`,
    request_headers: [] as [string, string][],
    request_body: '',
    response_status: responseStatus,
    response_headers: [] as [string, string][],
    response_body: '',
    timestamp: Date.now(),
    duration_ms: 42,
  };
}

/**
 * Render NetworkInterceptor and seed it with a list of captured requests via
 * the `get_captured_requests` invoke mock. Also resolves the `listen` mock so
 * the component finishes its init effect.
 */
async function renderWithRequests(
  requests: ReturnType<typeof makeRequest>[]
) {
  vi.mocked(invoke).mockImplementation(async (cmd) => {
    if (cmd === 'get_captured_requests') {
      return requests;
    }
    // start_proxy / stop_proxy / clear_captured_requests → no-op
    return null;
  });

  vi.mocked(listen).mockResolvedValue(() => {});

  await act(async () => {
    render(<NetworkInterceptor />);
  });
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('NetworkInterceptor — network trigger', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resetStore();
  });

  // ── Requirement 4.1 ─────────────────────────────────────────────────────────
  describe('Diagnose button visibility', () => {
    it('does NOT render a "Diagnose" button when response_status < 400', async () => {
      await renderWithRequests([
        makeRequest(1, 200),
        makeRequest(2, 301),
        makeRequest(3, 304),
      ]);

      expect(screen.queryByRole('button', { name: /diagnose/i })).toBeNull();
    });

    it('renders a "Diagnose" button when response_status === 400', async () => {
      await renderWithRequests([makeRequest(10, 400)]);

      expect(screen.getByRole('button', { name: /diagnose/i })).toBeInTheDocument();
    });

    it('renders a "Diagnose" button when response_status > 400 (404)', async () => {
      await renderWithRequests([makeRequest(11, 404)]);

      expect(screen.getByRole('button', { name: /diagnose/i })).toBeInTheDocument();
    });

    it('renders a "Diagnose" button when response_status is 500', async () => {
      await renderWithRequests([makeRequest(12, 500)]);

      expect(screen.getByRole('button', { name: /diagnose/i })).toBeInTheDocument();
    });

    it('renders "Diagnose" buttons only for error rows when mixed statuses present', async () => {
      await renderWithRequests([
        makeRequest(20, 200),
        makeRequest(21, 404),
        makeRequest(22, 201),
        makeRequest(23, 500),
      ]);

      // Exactly two error rows → two Diagnose buttons
      expect(screen.getAllByRole('button', { name: /diagnose/i })).toHaveLength(2);
    });
  });

  // ── Requirement 1.2 ─────────────────────────────────────────────────────────
  describe('button click with enabled === false', () => {
    it('does NOT call invoke("diagnose_issue") when enabled is false', async () => {
      resetStore({ enabled: false });

      await renderWithRequests([makeRequest(30, 500)]);

      // Clear the mocked calls that happened during component init
      vi.mocked(invoke).mockClear();

      const diagnoseBtn = screen.getByRole('button', { name: /diagnose/i });
      await act(async () => {
        fireEvent.click(diagnoseBtn);
      });

      expect(vi.mocked(invoke)).not.toHaveBeenCalledWith(
        'diagnose_issue',
        expect.anything()
      );
    });
  });

  // ── Requirements 4.2, 4.3, 1.2 ──────────────────────────────────────────────
  describe('button click with enabled === true', () => {
    it('calls setLoading and then invoke("diagnose_issue") with the correct proxy_error trigger', async () => {
      resetStore({ enabled: true });

      const callOrder: string[] = [];
      const REQ_ID = 40;
      const REQ_STATUS = 422;
      const REQ_URL = `https://example.com/api/test/${REQ_ID}`;

      // Spy on setLoading to record the call order
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

      await renderWithRequests([makeRequest(REQ_ID, REQ_STATUS)]);

      // Set up the diagnose_issue mock AFTER init (so it records order correctly)
      vi.mocked(invoke).mockImplementation(async (cmd) => {
        if (cmd === 'get_captured_requests') return [];
        if (cmd === 'diagnose_issue') {
          callOrder.push('invoke');
          return {
            cause: 'Unprocessable Entity',
            confidence: 'high',
            explanation: 'The request body was invalid.',
            suggested_fix: 'Fix the request payload.',
            related_files: [],
          };
        }
        return null;
      });

      const diagnoseBtn = screen.getByRole('button', { name: /diagnose/i });
      await act(async () => {
        fireEvent.click(diagnoseBtn);
      });

      const expectedTriggerId = `proxy:${REQ_ID}`;

      // setLoading must have been called with the correct triggerId
      expect(setLoadingSpy).toHaveBeenCalledWith(expectedTriggerId);

      // invoke must be called with the correct command and trigger payload
      expect(vi.mocked(invoke)).toHaveBeenCalledWith('diagnose_issue', {
        trigger: {
          type: 'proxy_error',
          request_id: REQ_ID,
          status_code: REQ_STATUS,
          url: REQ_URL,
          method: 'GET',
        },
        repoPath: null,
      });

      // setLoading must have been called BEFORE invoke
      expect(callOrder.indexOf('setLoading')).toBeLessThan(
        callOrder.indexOf('invoke')
      );
    });
  });
});
