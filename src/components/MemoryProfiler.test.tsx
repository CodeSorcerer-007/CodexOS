import { describe, test, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryProfiler } from './MemoryProfiler';
import { invoke } from '@tauri-apps/api/core';

vi.mock('@tauri-apps/api/core', () => ({
  invoke: vi.fn(),
}));

describe('MemoryProfiler component', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(invoke).mockImplementation(async (cmd) => {
      if (cmd === 'get_top_processes_memory') {
        return [
          { pid: 101, name: 'node.exe', memory_bytes: 1024 * 1024 * 512 },
          { pid: 102, name: 'chrome.exe', memory_bytes: 1024 * 1024 * 256 },
        ];
      }
      return undefined;
    });
  });

  test('renders top memory consumers correctly', async () => {
    render(<MemoryProfiler />);
    await waitFor(() => {
      expect(screen.getByText('node.exe')).toBeInTheDocument();
      expect(screen.getByText('chrome.exe')).toBeInTheDocument();
      expect(screen.getByText(/512 MB/i)).toBeInTheDocument();
      expect(screen.getByText(/256 MB/i)).toBeInTheDocument();
    });
  });
});
