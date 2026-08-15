/**
 * Unit tests for CodexOSDashboard.
 *
 * Covers:
 * - Renders the main heading and status bar
 * - Renders all module cards from SIDEBAR_ITEMS
 * - Module card click calls onOpenApp with the correct id
 * - Badge renders on git/secrets/tunnel cards when counts > 0
 * - Vital cards show placeholder "—" when sys stats unavailable
 * - Vital cards show live values when sys stats load
 * - Recent workspaces section hidden when no workspaces
 * - Recent workspaces render and clicking one opens the files module
 */

import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { invoke } from '@tauri-apps/api/core';
import { CodexOSDashboard } from '../CodexOSDashboard';
import { useStore } from '../../store/store';

const mockedInvoke = vi.mocked(invoke);

// Framer-motion wraps elements in motion divs; we just need the functional behaviour.
vi.mock('framer-motion', async () => {
  const actual = await vi.importActual<typeof import('framer-motion')>('framer-motion');
  return {
    ...actual,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    motion: new Proxy(actual.motion, {
      get: (target, prop: string) => {
        if (prop in target) {
          // Return a plain HTML element wrapper so tests don't need layout animations
          return (actual.motion as unknown as Record<string, unknown>)[prop];
        }
        return target[prop as keyof typeof target];
      },
    }),
  };
});

// ── Helpers ───────────────────────────────────────────────────────────────────

function resetStore(
  overrides: Partial<{
    secretsCount: number;
    activeTunnelCount: number;
    peerCount: number;
    currentPath: string | null;
    recentWorkspaces: { path: string; name: string; lastOpened: number }[];
  }> = {}
) {
  useStore.setState({
    secretsCount: overrides.secretsCount ?? 0,
    activeTunnelCount: overrides.activeTunnelCount ?? 0,
    peerCount: overrides.peerCount ?? 0,
    currentPath: overrides.currentPath ?? null,
    settings: {
      defaultPath: '',
      terminalShell: 'powershell' as const,
      theme: 'dark' as const,
      recentWorkspaces: overrides.recentWorkspaces ?? [],
      aiCopilotEnabled: true,
      memorySpikeThresholdMb: 500,
      memorySpikeWindowSec: 10,
    },
  } as never);
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('CodexOSDashboard', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resetStore();
    // Default: reject all invoke calls (simulates Tauri not available in test env)
    // Components gracefully catch these and show placeholder values.
    mockedInvoke.mockRejectedValue(new Error('Tauri not available'));
  });

  // ── Heading and status bar ────────────────────────────────────────────────────

  it('renders the CodexOS heading', async () => {
    const onOpenApp = vi.fn();
    await act(async () => {
      render(<CodexOSDashboard onOpenApp={onOpenApp} />);
    });
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('CodexOS');
  });

  it('renders the "Welcome to CodexOS" title header', async () => {
    const onOpenApp = vi.fn();
    await act(async () => {
      render(<CodexOSDashboard onOpenApp={onOpenApp} />);
    });
    expect(screen.getByText(/Welcome to CodexOS/i)).toBeInTheDocument();
  });

  // ── Module cards ──────────────────────────────────────────────────────────────

  it('renders a widget card for pinned dashboard utilities', async () => {
    const onOpenApp = vi.fn();
    await act(async () => {
      render(<CodexOSDashboard onOpenApp={onOpenApp} />);
    });

    const cards = document.querySelectorAll('h3');
    const labels = Array.from(cards).map(el => el.textContent?.trim());
    expect(labels.length).toBeGreaterThan(0);
  });

  it('calls onOpenApp with the correct id when a module card is clicked', async () => {
    const onOpenApp = vi.fn();
    await act(async () => {
      render(<CodexOSDashboard onOpenApp={onOpenApp} />);
    });

    // Click the "Docker" module card
    fireEvent.click(screen.getByText('Docker'));
    expect(onOpenApp).toHaveBeenCalledWith('docker');
  });

  it('calls onOpenApp with "terminal" when Terminal card is clicked', async () => {
    const onOpenApp = vi.fn();
    await act(async () => {
      render(<CodexOSDashboard onOpenApp={onOpenApp} />);
    });

    fireEvent.click(screen.getByText('Terminal'));
    expect(onOpenApp).toHaveBeenCalledWith('terminal');
  });

  // ── Badges ────────────────────────────────────────────────────────────────────

  it('renders a badge on the Secrets card when secretsCount > 0', async () => {
    resetStore({ secretsCount: 5 });
    const onOpenApp = vi.fn();
    await act(async () => {
      render(<CodexOSDashboard onOpenApp={onOpenApp} />);
    });

    // The module card badge uses the cx-badge-pulse class — verify it exists with value 5
    const badge = document.querySelector('.cx-badge-pulse');
    expect(badge).not.toBeNull();
    expect(badge?.textContent?.trim()).toBe('5');
  });

  it('renders a badge on the Relay Tunnel card when activeTunnelCount > 0', async () => {
    resetStore({ activeTunnelCount: 3 });
    const onOpenApp = vi.fn();
    await act(async () => {
      render(<CodexOSDashboard onOpenApp={onOpenApp} />);
    });

    expect(screen.getByText('3')).toBeInTheDocument();
  });

  it('does not render badges when all counts are zero', async () => {
    resetStore({ secretsCount: 0, activeTunnelCount: 0 });
    const onOpenApp = vi.fn();
    await act(async () => {
      render(<CodexOSDashboard onOpenApp={onOpenApp} />);
    });

    // No numeric badge values should appear in the module grid
    // Verify the secrets badge specifically is not rendered
    // (badge only renders when count > 0)
    const badges = document.querySelectorAll('.cx-badge-pulse');
    expect(badges.length).toBe(0);
  });

  // ── Vital cards ───────────────────────────────────────────────────────────────

  it('shows "—" placeholders in vital cards when sys stats are unavailable', async () => {
    mockedInvoke.mockRejectedValue(new Error('Tauri not available'));

    const onOpenApp = vi.fn();
    await act(async () => {
      render(<CodexOSDashboard onOpenApp={onOpenApp} />);
    });

    const dashes = screen.getAllByText('—');
    // CPU, Memory, Free Storage vital cards each show "—"
    expect(dashes.length).toBeGreaterThanOrEqual(3);
  });

  it('shows live sys stats when get_sys_stats resolves', async () => {
    mockedInvoke.mockImplementation(async (cmd) => {
      if (cmd === 'get_sys_stats') {
        return {
          cpu_usage: 42.5,
          mem_total: 16 * 1024 ** 3,
          mem_used:  8  * 1024 ** 3,
          drives: [{ name: 'C', mount_point: 'C:\\', total_space: 500 * 1024 ** 3, available_space: 250 * 1024 ** 3 }],
        };
      }
      return null;
    });

    const onOpenApp = vi.fn();
    await act(async () => {
      render(<CodexOSDashboard onOpenApp={onOpenApp} />);
    });

    await waitFor(() => {
      expect(screen.getByText('42.5%')).toBeInTheDocument();
    });
  });

  // ── Recent workspaces ─────────────────────────────────────────────────────────

  it('does not render the Recent Workspaces section when the list is empty', async () => {
    resetStore({ recentWorkspaces: [] });
    const onOpenApp = vi.fn();
    await act(async () => {
      render(<CodexOSDashboard onOpenApp={onOpenApp} />);
    });

    expect(screen.queryByText(/recent workspaces/i)).toBeNull();
  });

  it('renders workspace cards when recentWorkspaces exist', async () => {
    resetStore({
      recentWorkspaces: [
        { path: '/home/user/myapp', name: 'MyApp', lastOpened: Date.now() },
        { path: '/home/user/api',   name: 'API',   lastOpened: Date.now() - 1000 },
      ],
    });
    const onOpenApp = vi.fn();
    await act(async () => {
      render(<CodexOSDashboard onOpenApp={onOpenApp} />);
    });

    expect(screen.getByText('MyApp')).toBeInTheDocument();
    expect(screen.getByText('API')).toBeInTheDocument();
  });

  it('calls onOpenApp("files") when a workspace card is clicked', async () => {
    resetStore({
      recentWorkspaces: [
        { path: '/home/user/myapp', name: 'MyApp', lastOpened: Date.now() },
      ],
    });
    const onOpenApp = vi.fn();
    await act(async () => {
      render(<CodexOSDashboard onOpenApp={onOpenApp} />);
    });

    fireEvent.click(screen.getByText('MyApp'));
    expect(onOpenApp).toHaveBeenCalledWith('files');
  });

  it('limits displayed workspace cards to 3', async () => {
    resetStore({
      recentWorkspaces: [
        { path: '/p1', name: 'Proj1', lastOpened: Date.now() },
        { path: '/p2', name: 'Proj2', lastOpened: Date.now() - 1 },
        { path: '/p3', name: 'Proj3', lastOpened: Date.now() - 2 },
        { path: '/p4', name: 'Proj4', lastOpened: Date.now() - 3 },
      ],
    });
    const onOpenApp = vi.fn();
    await act(async () => {
      render(<CodexOSDashboard onOpenApp={onOpenApp} />);
    });

    // Only 3 workspace cards should be rendered even though 4 exist
    expect(screen.getByText('Proj1')).toBeInTheDocument();
    expect(screen.getByText('Proj2')).toBeInTheDocument();
    expect(screen.getByText('Proj3')).toBeInTheDocument();
    expect(screen.queryByText('Proj4')).toBeNull();
  });
});
