/**
 * Unit tests for CommandPalette.
 *
 * Covers:
 * - Opens on Ctrl+K / Cmd+K
 * - Closes on Escape
 * - Closes when backdrop is clicked
 * - Search filters module items
 * - Shows "No results" for unmatched queries
 * - Keyboard navigation (ArrowDown / ArrowUp / Enter)
 * - Renders workspace items when recent workspaces exist
 * - Selecting a module item calls setActiveApp
 */

import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { CommandPalette } from '../CommandPalette';
import { useStore } from '../../store/store';

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Fire a keyboard event on window to simulate global shortcuts. */
function pressKey(key: string, opts: Partial<KeyboardEventInit> = {}) {
  fireEvent.keyDown(window, { key, ...opts });
}

function openPalette() {
  pressKey('k', { ctrlKey: true });
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('CommandPalette', () => {
  beforeEach(() => {
    // Reset store to a clean state before each test
    useStore.setState({
      settings: {
        defaultPath: '',
        terminalShell: 'powershell',
        theme: 'dark',
        recentWorkspaces: [],
        aiCopilotEnabled: true,
        memorySpikeThresholdMb: 500,
        memorySpikeWindowSec: 10,
      },
    } as never);
    vi.clearAllMocks();
  });

  // ── Open / Close ─────────────────────────────────────────────────────────────

  it('is not visible on initial render', () => {
    render(<CommandPalette />);
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('opens when Ctrl+K is pressed', async () => {
    render(<CommandPalette />);
    act(() => openPalette());
    await waitFor(() => {
      expect(screen.getByRole('dialog', { name: 'Command palette' })).toBeInTheDocument();
    });
  });

  it('closes when Escape is pressed', async () => {
    render(<CommandPalette />);
    act(() => openPalette());
    await waitFor(() => expect(screen.getByRole('dialog')).toBeInTheDocument());

    act(() => pressKey('Escape'));
    await waitFor(() => {
      expect(screen.queryByRole('dialog')).toBeNull();
    });
  });

  it('closes when the backdrop overlay is clicked', async () => {
    render(<CommandPalette />);
    act(() => openPalette());
    await waitFor(() => expect(screen.getByRole('dialog')).toBeInTheDocument());

    // The backdrop is the outermost motion.div (role="dialog" itself)
    act(() => {
      fireEvent.click(screen.getByRole('dialog'));
    });
    await waitFor(() => {
      expect(screen.queryByRole('dialog')).toBeNull();
    });
  });

  it('toggles closed when Ctrl+K is pressed a second time', async () => {
    render(<CommandPalette />);
    act(() => openPalette());
    await waitFor(() => expect(screen.getByRole('dialog')).toBeInTheDocument());

    act(() => openPalette());
    await waitFor(() => {
      expect(screen.queryByRole('dialog')).toBeNull();
    });
  });

  // ── Search filtering ──────────────────────────────────────────────────────────

  it('shows all modules when search is empty', async () => {
    render(<CommandPalette />);
    act(() => openPalette());
    await waitFor(() => expect(screen.getByRole('dialog')).toBeInTheDocument());

    // There should be many listbox options visible
    const options = screen.getAllByRole('option');
    expect(options.length).toBeGreaterThan(10);
  });

  it('filters results when the user types in the search box', async () => {
    render(<CommandPalette />);
    act(() => openPalette());
    await waitFor(() => expect(screen.getByRole('dialog')).toBeInTheDocument());

    const input = screen.getByRole('textbox', { name: /search commands/i });
    fireEvent.change(input, { target: { value: 'docker' } });

    await waitFor(() => {
      const options = screen.getAllByRole('option');
      // Only Docker-related items should match
      expect(options.length).toBeLessThan(5);
      expect(screen.getByText('Docker')).toBeInTheDocument();
    });
  });

  it('shows "No results" message when search matches nothing', async () => {
    render(<CommandPalette />);
    act(() => openPalette());
    await waitFor(() => expect(screen.getByRole('dialog')).toBeInTheDocument());

    const input = screen.getByRole('textbox', { name: /search commands/i });
    fireEvent.change(input, { target: { value: 'xyznotexistent' } });

    await waitFor(() => {
      expect(screen.getByText(/no results/i)).toBeInTheDocument();
    });
  });

  // ── Keyboard navigation ───────────────────────────────────────────────────────

  it('moves selection down with ArrowDown', async () => {
    render(<CommandPalette />);
    act(() => openPalette());
    await waitFor(() => expect(screen.getByRole('dialog')).toBeInTheDocument());

    // First option should be selected initially (index 0)
    const options = screen.getAllByRole('option');
    expect(options[0]).toHaveAttribute('aria-selected', 'true');

    act(() => pressKey('ArrowDown'));
    await waitFor(() => {
      expect(options[1]).toHaveAttribute('aria-selected', 'true');
      expect(options[0]).toHaveAttribute('aria-selected', 'false');
    });
  });

  it('moves selection up with ArrowUp', async () => {
    render(<CommandPalette />);
    act(() => openPalette());
    await waitFor(() => expect(screen.getByRole('dialog')).toBeInTheDocument());

    // Move down first, then back up
    act(() => pressKey('ArrowDown'));
    act(() => pressKey('ArrowUp'));

    const options = screen.getAllByRole('option');
    await waitFor(() => {
      expect(options[0]).toHaveAttribute('aria-selected', 'true');
    });
  });

  it('calls setActiveApp and closes when Enter is pressed on selected item', async () => {
    const setActiveAppSpy = vi.spyOn(useStore.getState(), 'setActiveApp');

    render(<CommandPalette />);
    act(() => openPalette());
    await waitFor(() => expect(screen.getByRole('dialog')).toBeInTheDocument());

    act(() => pressKey('Enter'));

    await waitFor(() => {
      expect(setActiveAppSpy).toHaveBeenCalled();
      expect(screen.queryByRole('dialog')).toBeNull();
    });
  });

  // ── Workspace items ───────────────────────────────────────────────────────────

  it('renders recent workspace items when workspaces exist in store', async () => {
    useStore.setState({
      settings: {
        defaultPath: '',
        terminalShell: 'powershell',
        theme: 'dark',
        recentWorkspaces: [
          { path: '/home/user/myapp', name: 'MyApp', lastOpened: Date.now() },
        ],
        aiCopilotEnabled: true,
        memorySpikeThresholdMb: 500,
        memorySpikeWindowSec: 10,
      },
    } as never);

    render(<CommandPalette />);
    act(() => openPalette());
    await waitFor(() => expect(screen.getByRole('dialog')).toBeInTheDocument());

    expect(screen.getByText('Switch Workspace: MyApp')).toBeInTheDocument();
  });

  it('does not render workspace section when no recent workspaces exist', async () => {
    render(<CommandPalette />);
    act(() => openPalette());
    await waitFor(() => expect(screen.getByRole('dialog')).toBeInTheDocument());

    expect(screen.queryByText(/workspaces/i)).toBeNull();
  });
});
