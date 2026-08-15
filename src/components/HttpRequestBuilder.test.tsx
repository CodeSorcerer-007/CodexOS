import { describe, test, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { HttpRequestBuilder } from './HttpRequestBuilder';
import { invoke } from '@tauri-apps/api/core';

vi.mock('@tauri-apps/api/core', () => ({
  invoke: vi.fn(),
}));

describe('HttpRequestBuilder component', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(invoke).mockImplementation(async (cmd) => {
      if (cmd === 'replay_request') {
        return {
          response_status: 200,
          response_headers: [['content-type', 'application/json']],
          response_body: '{"message": "Practicality beats purity."}',
          duration_ms: 120,
        };
      }
      return undefined;
    });
  });

  test('renders HTTP client with method and URL inputs', () => {
    render(<HttpRequestBuilder />);
    expect(screen.getByDisplayValue('GET')).toBeInTheDocument();
    expect(screen.getByDisplayValue('https://api.github.com/zen')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /send/i })).toBeInTheDocument();
  });

  test('executes HTTP request and displays response payload and status', async () => {
    render(<HttpRequestBuilder />);
    const sendBtn = screen.getByRole('button', { name: /send/i });
    fireEvent.click(sendBtn);

    await waitFor(() => {
      expect(screen.getByText('200')).toBeInTheDocument();
      expect(screen.getByText(/Practicality beats purity/i)).toBeInTheDocument();
      expect(screen.getByText(/120 ms/i)).toBeInTheDocument();
    });
  });
});
