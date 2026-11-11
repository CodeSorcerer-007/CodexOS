import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { TransferCenter } from '../TransferCenter/TransferCenter';
import { useTransferStore } from '../../store/transferStore';
import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import type { TransferProgressEvent } from '../../ipc';

vi.mock('@tauri-apps/api/core', () => ({
  invoke: vi.fn().mockImplementation((cmd: string) => {
    if (cmd === 'get_active_transfers') {
      return Promise.resolve([]);
    }
    if (cmd === 'cancel_file_transfer') {
      return Promise.resolve(true);
    }
    return Promise.resolve(null);
  }),
}));

vi.mock('@tauri-apps/api/event', () => ({
  listen: vi.fn().mockImplementation(() => Promise.resolve(vi.fn())),
}));

const mockTransferRunning: TransferProgressEvent = {
  transfer_id: 'tx_test_1',
  source: 'C:\\source\\dataset.zip',
  dest: 'D:\\backup\\dataset.zip',
  operation: 'copy',
  status: 'running',
  total_files: 1,
  completed_files: 0,
  total_bytes: 100 * 1024 * 1024, // 100 MB
  transferred_bytes: 50 * 1024 * 1024, // 50 MB
  current_file: 'dataset.zip',
  bytes_per_sec: 10 * 1024 * 1024, // 10 MB/s
  estimated_remaining_secs: 5,
  error_count: 0,
  skipped_count: 0,
  error_message: null,
};

const mockTransferMove: TransferProgressEvent = {
  transfer_id: 'tx_test_2',
  source: 'C:\\source\\images',
  dest: 'D:\\backup\\images',
  operation: 'move',
  status: 'running',
  total_files: 10,
  completed_files: 4,
  total_bytes: 20 * 1024 * 1024,
  transferred_bytes: 8 * 1024 * 1024,
  current_file: 'photo_4.png',
  bytes_per_sec: 2 * 1024 * 1024,
  estimated_remaining_secs: 6,
  error_count: 0,
  skipped_count: 0,
  error_message: null,
};

describe('TransferCenter Component Tests', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useTransferStore.setState({
      transfers: {},
      isMinimized: false,
      isOpen: false,
    });
  });

  it('1. Renders nothing when no transfers exist or isOpen is false', () => {
    const { container } = render(<TransferCenter />);
    expect(container.firstChild).toBeNull();
  });

  it('2. Renders active transfer with progress, speed, ETA, and current file', () => {
    useTransferStore.setState({
      transfers: {
        [mockTransferRunning.transfer_id]: mockTransferRunning,
      },
      isOpen: true,
      isMinimized: false,
    });

    render(<TransferCenter />);

    expect(screen.getByText('File Transfers')).toBeInTheDocument();
    expect(screen.getAllByText('dataset.zip').length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText('copy')).toBeInTheDocument();
    expect(screen.getByText('50%')).toBeInTheDocument();
    expect(screen.getByText(/50.0 MB \/ 100.0 MB/)).toBeInTheDocument();
    expect(screen.getByText(/10.0 MB\/s/)).toBeInTheDocument();
    expect(screen.getByText(/5s left/)).toBeInTheDocument();

    const progressBar = screen.getByTestId('transfer-progress-bar');
    expect(progressBar).toHaveStyle({ width: '50%' });
  });

  it('3. Renders multiple transfer cards simultaneously with independent metrics', () => {
    useTransferStore.setState({
      transfers: {
        [mockTransferRunning.transfer_id]: mockTransferRunning,
        [mockTransferMove.transfer_id]: mockTransferMove,
      },
      isOpen: true,
      isMinimized: false,
    });

    render(<TransferCenter />);

    expect(screen.getByText('2 active')).toBeInTheDocument();
    expect(screen.getByTestId('transfer-card-tx_test_1')).toBeInTheDocument();
    expect(screen.getByTestId('transfer-card-tx_test_2')).toBeInTheDocument();

    expect(screen.getByText('move')).toBeInTheDocument();
    expect(screen.getByText('images')).toBeInTheDocument();
    expect(screen.getByText('4 of 10 files')).toBeInTheDocument();
  });

  it('4. Updates progress dynamically when store receives updates', () => {
    useTransferStore.setState({
      transfers: {
        [mockTransferRunning.transfer_id]: mockTransferRunning,
      },
      isOpen: true,
      isMinimized: false,
    });

    const { rerender } = render(<TransferCenter />);
    expect(screen.getByText('50%')).toBeInTheDocument();

    // Dynamically update progress to 80%
    act(() => {
      useTransferStore.getState().updateTransfer({
        ...mockTransferRunning,
        transferred_bytes: 80 * 1024 * 1024,
        estimated_remaining_secs: 2,
      });
    });

    rerender(<TransferCenter />);
    expect(screen.getByText('80%')).toBeInTheDocument();
    expect(screen.getByText(/80.0 MB \/ 100.0 MB/)).toBeInTheDocument();
    expect(screen.getByText(/2s left/)).toBeInTheDocument();
  });

  it('5. Handles cancellation request, confirmation workflow, and backend cancellation', async () => {
    useTransferStore.setState({
      transfers: {
        [mockTransferRunning.transfer_id]: mockTransferRunning,
      },
      isOpen: true,
      isMinimized: false,
    });

    render(<TransferCenter />);

    // Click cancel
    const cancelBtn = screen.getByText('Cancel Transfer');
    fireEvent.click(cancelBtn);

    // Confirmation prompt appears
    expect(screen.getByText('Cancel transfer?')).toBeInTheDocument();
    const yesBtn = screen.getByText('Yes');
    fireEvent.click(yesBtn);

    await waitFor(() => {
      expect(invoke).toHaveBeenCalledWith('cancel_file_transfer', {
        transferId: 'tx_test_1',
      });
      expect(screen.getByText('Cancelled')).toBeInTheDocument();
    });
  });

  it('6. Handles completed and failed states, error messages, and dismiss actions', () => {
    const completedTransfer: TransferProgressEvent = {
      ...mockTransferRunning,
      transfer_id: 'tx_done',
      status: 'completed',
      completed_files: 1,
      transferred_bytes: 100 * 1024 * 1024,
    };

    const failedTransfer: TransferProgressEvent = {
      ...mockTransferMove,
      transfer_id: 'tx_failed',
      status: 'failed',
      error_count: 1,
      error_message: 'Access denied on destination',
    };

    useTransferStore.setState({
      transfers: {
        tx_done: completedTransfer,
        tx_failed: failedTransfer,
      },
      isOpen: true,
      isMinimized: false,
    });

    render(<TransferCenter />);

    expect(screen.getByText('Done')).toBeInTheDocument();
    expect(screen.getByText('Failed')).toBeInTheDocument();
    expect(screen.getByText('Access denied on destination')).toBeInTheDocument();

    // Dismiss the completed transfer
    const dismissBtns = screen.getAllByTitle('Dismiss');
    fireEvent.click(dismissBtns[0]);

    expect(screen.queryByText('dataset.zip')).toBeNull();
    expect(screen.getByText('images')).toBeInTheDocument();

    // Clear Finished
    const clearBtn = screen.getByText('Clear Finished');
    fireEvent.click(clearBtn);

    // Both done and failed are removed
    expect(useTransferStore.getState().isOpen).toBe(false);
  });

  it('7. Toggles between minimized floating pill and expanded panel', () => {
    useTransferStore.setState({
      transfers: {
        [mockTransferRunning.transfer_id]: mockTransferRunning,
      },
      isOpen: true,
      isMinimized: false,
    });

    const { rerender } = render(<TransferCenter />);
    expect(screen.getByTestId('transfer-center-expanded')).toBeInTheDocument();

    // Click minimize
    const minBtn = screen.getByLabelText('Minimize Transfers');
    fireEvent.click(minBtn);

    rerender(<TransferCenter />);
    expect(screen.getByTestId('transfer-center-minimized')).toBeInTheDocument();
    expect(screen.getByText(/1 transfer \(50%\)/)).toBeInTheDocument();

    // Click expand
    const expandBtn = screen.getByLabelText('Expand Transfers');
    fireEvent.click(expandBtn);

    rerender(<TransferCenter />);
    expect(screen.getByTestId('transfer-center-expanded')).toBeInTheDocument();
  });

  it('8. Subscribes to Tauri transfer events and cleans up on unmount', async () => {
    const unlistenFn = vi.fn();
    (listen as any).mockImplementation(() => Promise.resolve(unlistenFn));

    const cleanup = useTransferStore.getState().initTransferListeners();

    expect(listen).toHaveBeenCalledWith('transfer://started', expect.any(Function));
    expect(listen).toHaveBeenCalledWith('transfer://progress', expect.any(Function));
    expect(listen).toHaveBeenCalledWith('transfer://completed', expect.any(Function));
    expect(listen).toHaveBeenCalledWith('transfer://failed', expect.any(Function));
    expect(listen).toHaveBeenCalledWith('transfer://cancelled', expect.any(Function));

    // Wait for the promises in initTransferListeners to resolve
    await Promise.resolve();

    cleanup();
    expect(unlistenFn).toHaveBeenCalled();
  });

  it('9. Handles out-of-order or delayed progress events gracefully', () => {
    useTransferStore.setState({
      transfers: {
        [mockTransferRunning.transfer_id]: {
          ...mockTransferRunning,
          transferred_bytes: 80 * 1024 * 1024,
        },
      },
      isOpen: true,
      isMinimized: false,
    });

    const { rerender } = render(<TransferCenter />);
    expect(screen.getByText('80%')).toBeInTheDocument();

    // Delayed event arriving later with lower byte count is absorbed without crash
    act(() => {
      useTransferStore.getState().updateTransfer({
        ...mockTransferRunning,
        transferred_bytes: 40 * 1024 * 1024,
      });
    });

    rerender(<TransferCenter />);
    expect(screen.getByText('40%')).toBeInTheDocument();
  });

  it('10. Rejects stale non-terminal progress updates after terminal state', () => {
    useTransferStore.setState({
      transfers: {
        tx_terminal: {
          ...mockTransferRunning,
          transfer_id: 'tx_terminal',
          status: 'completed',
        },
      },
      isOpen: true,
    });

    // Late running event arrives
    useTransferStore.getState().updateTransfer({
      ...mockTransferRunning,
      transfer_id: 'tx_terminal',
      status: 'running',
      transferred_bytes: 20 * 1024 * 1024,
    });

    // Must remain completed!
    expect(useTransferStore.getState().transfers['tx_terminal'].status).toBe('completed');
  });

  it('11. Hydrates snapshot of active transfers via getActiveTransfers on initialization', async () => {
    (invoke as any).mockImplementation((cmd: string) => {
      if (cmd === 'get_active_transfers') {
        return Promise.resolve([
          {
            ...mockTransferRunning,
            transfer_id: 'tx_hydrated',
            status: 'running',
          },
        ]);
      }
      return Promise.resolve(null);
    });

    const cleanup = useTransferStore.getState().initTransferListeners();
    await waitFor(() => {
      expect(useTransferStore.getState().transfers['tx_hydrated']).toBeDefined();
      expect(useTransferStore.getState().transfers['tx_hydrated'].status).toBe('running');
    });

    cleanup();
  });

  it('12. Renders preparation status with Prep indicator', () => {
    useTransferStore.setState({
      transfers: {
        tx_prep: {
          ...mockTransferRunning,
          transfer_id: 'tx_prep',
          status: 'preparing',
        },
      },
      isOpen: true,
      isMinimized: false,
    });

    render(<TransferCenter />);
    expect(screen.getByText('Prep')).toBeInTheDocument();
  });
});

