import { describe, test, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { GPUCluster } from './GPUCluster';
import { invoke } from '@tauri-apps/api/core';

vi.mock('@tauri-apps/api/core', () => ({
  invoke: vi.fn(),
}));

describe('GPUCluster component', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(invoke).mockImplementation(async (cmd) => {
      if (cmd === 'get_gpu_info') {
        return [
          {
            name: 'NVIDIA GeForce RTX 4090',
            adapter_ram: '24 GB',
            driver_version: '551.86',
            video_processor: 'GeForce RTX 4090',
          },
        ];
      }
      if (cmd === 'get_gpu_utilization') return 45;
      return undefined;
    });
  });

  test('renders GPU compute cluster and detects devices', async () => {
    render(<GPUCluster />);
    await waitFor(() => {
      expect(screen.getByText('NVIDIA GeForce RTX 4090')).toBeInTheDocument();
      expect(screen.getByText('24 GB')).toBeInTheDocument();
    });
  });

  test('refreshes GPU status on Scan GPUs button click', async () => {
    render(<GPUCluster />);
    await waitFor(() => {
      expect(screen.getByText('NVIDIA GeForce RTX 4090')).toBeInTheDocument();
    });

    const scanBtn = screen.getByRole('button', { name: /scan gpus/i });
    fireEvent.click(scanBtn);

    await waitFor(() => {
      expect(invoke).toHaveBeenCalledWith('get_gpu_info');
    });
  });
});
