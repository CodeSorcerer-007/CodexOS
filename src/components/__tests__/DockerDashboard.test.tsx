import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { DockerDashboard } from '../DockerDashboard';
import { invoke } from '@tauri-apps/api/core';

describe('DockerDashboard', () => {
  beforeEach(() => {
    vi.mocked(invoke).mockClear();
    vi.mocked(invoke).mockImplementation(async (cmd) => {
      if (cmd === 'get_docker_containers') {
        return [{
          id: '123',
          name: 'test-container',
          image: 'nginx:latest',
          state: 'running',
          status: 'Up 2 hours',
          ports: '80->80/tcp'
        }];
      }
      if (cmd === 'get_docker_images') {
        return [{
          id: 'img1',
          repository: 'nginx',
          tag: 'latest',
          size: '140MB',
          created: '2 days ago'
        }];
      }
      return null;
    });
  });

  it('container list renders from mock data', async () => {
    render(<DockerDashboard />);
    await waitFor(() => {
      expect(screen.getByText('test-container')).toBeInTheDocument();
      expect(screen.getByText('nginx:latest')).toBeInTheDocument();
    });
  });

  it('container selection shows details and action buttons', async () => {
    render(<DockerDashboard />);
    await waitFor(() => {
      expect(screen.getByText('test-container')).toBeInTheDocument();
    });

    const card = screen.getByText('test-container');
    fireEvent.click(card);

    await waitFor(() => {
      expect(screen.getByText('Stop')).toBeInTheDocument();
      expect(screen.getByText('Restart')).toBeInTheDocument();
      expect(screen.getByText('Remove')).toBeInTheDocument();
    });

    const stopButton = screen.getByText('Stop');
    fireEvent.click(stopButton);
    expect(invoke).toHaveBeenCalledWith('docker_action', { containerId: '123', action: 'stop' });
  });
});
