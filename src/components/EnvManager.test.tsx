import { describe, test, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { EnvManager } from './EnvManager';
import { useStore } from '../store/store';
import { invoke } from '@tauri-apps/api/core';

vi.mock('@tauri-apps/api/core', () => ({
  invoke: vi.fn(),
}));

describe('EnvManager component', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useStore.setState({ currentPath: '/test/workspace' });
    vi.mocked(invoke).mockImplementation(async (cmd) => {
      if (cmd === 'get_files_in_dir') {
        return [
          { name: '.env', path: '/test/workspace/.env', is_dir: false, size_bytes: 50 },
          { name: '.env.local', path: '/test/workspace/.env.local', is_dir: false, size_bytes: 120 },
        ];
      }
      if (cmd === 'read_file_text') {
        return 'PORT=3000\nDATABASE_URL=postgres://localhost/db\n';
      }
      return undefined;
    });
  });

  test('loads and displays .env files from workspace', async () => {
    render(<EnvManager />);
    await waitFor(() => {
      expect(screen.getByText('.env')).toBeInTheDocument();
      expect(screen.getByText('.env.local')).toBeInTheDocument();
    });
  });

  test('selects an env file and parses key-value rows', async () => {
    render(<EnvManager />);
    await waitFor(() => {
      expect(screen.getByText('.env')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText('.env'));

    await waitFor(() => {
      expect(screen.getByDisplayValue('PORT')).toBeInTheDocument();
      expect(screen.getByDisplayValue('DATABASE_URL')).toBeInTheDocument();
    });
  });

  test('masks values when toggle is hidden', async () => {
    render(<EnvManager />);
    await waitFor(() => {
      expect(screen.getByText('.env')).toBeInTheDocument();
    });
    fireEvent.click(screen.getByText('.env'));

    await waitFor(() => {
      const valInput = screen.getByDisplayValue('3000') as HTMLInputElement;
      expect(valInput.type).toBe('password');
    });
  });
});
