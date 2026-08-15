import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NetworkInterceptor } from '../NetworkInterceptor';
import { invoke } from '@tauri-apps/api/core';

describe('NetworkInterceptor', () => {
  beforeEach(() => {
    vi.mocked(invoke).mockClear();
    vi.mocked(invoke).mockImplementation(async (cmd) => {
      if (cmd === 'is_proxy_running') {
        return false;
      }
      if (cmd === 'get_captured_requests') {
        return [{
          id: 1,
          method: 'GET',
          url: 'http://example.com',
          request_headers: [],
          request_body: '',
          response_status: 404,
          response_headers: [],
          response_body: '',
          timestamp: Date.now(),
          duration_ms: 10
        }];
      }
      return null;
    });
  });

  it('proxy start/stop button toggles state', async () => {
    render(<NetworkInterceptor />);
    const toggleButton = screen.getByRole('button', { name: /Start Proxy/i });
    fireEvent.click(toggleButton);
    
    await waitFor(() => {
      expect(invoke).toHaveBeenCalledWith('start_proxy', expect.any(Object));
    });
  });

  it('captured request row renders method, url, and status', async () => {
    render(<NetworkInterceptor />);
    await waitFor(() => {
      expect(screen.getAllByText('GET').length).toBeGreaterThan(0);
      expect(screen.getByText('http://example.com')).toBeInTheDocument();
      expect(screen.getByText('404')).toBeInTheDocument();
    });
  });

  it('clear button calls clear_captured_requests invoke', async () => {
    render(<NetworkInterceptor />);
    const clearButton = screen.getByRole('button', { name: /Clear/i });
    fireEvent.click(clearButton);
    
    await waitFor(() => {
      expect(invoke).toHaveBeenCalledWith('clear_captured_requests');
    });
  });
});
