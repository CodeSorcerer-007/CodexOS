import { describe, test, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { PortTunnel } from './PortTunnel';
import { invoke } from '@tauri-apps/api/core';

vi.mock('@tauri-apps/api/core', () => ({
  invoke: vi.fn(),
}));

vi.mock('@tauri-apps/api/event', () => ({
  listen: vi.fn().mockResolvedValue(() => {}),
}));

describe('PortTunnel component', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(invoke).mockImplementation(async (cmd) => {
      if (cmd === 'list_tunnels') {
        return [
          { local_port: 3000, public_url: 'https://preview-3000.loca.lt', status: 'online' },
        ];
      }
      return undefined;
    });
  });

  test('renders active tunnels and port input', async () => {
    render(<PortTunnel />);
    await waitFor(() => {
      expect(screen.getByText('localhost:3000')).toBeInTheDocument();
      expect(screen.getByText('https://preview-3000.loca.lt')).toBeInTheDocument();
    });
  });

  test('exposes a new port on button click', async () => {
    render(<PortTunnel />);
    const portInput = screen.getByPlaceholderText(/e\.g\. 3000/i);
    fireEvent.change(portInput, { target: { value: '8080' } });

    const exposeBtn = screen.getByRole('button', { name: /expose port/i });
    fireEvent.click(exposeBtn);

    const confirmBtn = screen.getByRole('button', { name: /I Understand, Expose Port/i });
    fireEvent.click(confirmBtn);

    await waitFor(() => {
      expect(invoke).toHaveBeenCalledWith('start_tunnel', { localPort: 8080, customRelay: null });
    });
  });

  test('stops a running tunnel', async () => {
    render(<PortTunnel />);
    await waitFor(() => {
      expect(screen.getByText('localhost:3000')).toBeInTheDocument();
    });

    const closeBtn = screen.getByRole('button', { name: /close tunnel/i });
    fireEvent.click(closeBtn);

    await waitFor(() => {
      expect(invoke).toHaveBeenCalledWith('stop_tunnel', { localPort: 3000 });
    });
  });
});
