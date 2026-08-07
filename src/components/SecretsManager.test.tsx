import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { invoke } from '@tauri-apps/api/core';
import { SecretsManager } from './SecretsManager';
import { useStore } from '../store/store';

const mockedInvoke = vi.mocked(invoke);

// Mock VaultUnlock so it never renders the lock overlay in these tests
vi.mock('./VaultUnlock', () => ({
  VaultUnlock: () => null,
}));

beforeEach(() => {
  vi.clearAllMocks();
  useStore.setState({ isVaultLocked: false });
  mockedInvoke.mockResolvedValue([] as unknown as null);
});

describe('SecretsManager', () => {
  it('renders the heading and empty state', async () => {
    render(<SecretsManager />);
    expect(screen.getByText('Secrets Manager')).toBeInTheDocument();
    await waitFor(() => {
      expect(screen.getByText(/No secrets in vault/)).toBeInTheDocument();
    });
  });

  it('calls list_secret_keys on mount', async () => {
    render(<SecretsManager />);
    await waitFor(() => {
      expect(mockedInvoke).toHaveBeenCalledWith('list_secret_keys');
    });
  });

  it('displays fetched secret keys in the vault list', async () => {
    mockedInvoke.mockImplementation(() =>
      Promise.resolve(['MY_API_KEY', 'DB_PASSWORD'] as unknown as null)
    );
    render(<SecretsManager />);
    // Each key appears as a yellow <span> in the vault list
    const keySpan = await screen.findByText('MY_API_KEY', { selector: '.font-mono.text-sm.text-yellow-300' });
    expect(keySpan).toBeInTheDocument();
    expect(
      screen.getByText('DB_PASSWORD', { selector: '.font-mono.text-sm.text-yellow-300' })
    ).toBeInTheDocument();
  });

  it('calls add_secret when Add button is clicked with key and value', async () => {
    render(<SecretsManager />);

    const keyInput = screen.getByPlaceholderText(/KEY_NAME/);
    const valInput = screen.getByPlaceholderText(/Super Secret/);

    fireEvent.change(keyInput, { target: { value: 'NEW_KEY' } });
    fireEvent.change(valInput, { target: { value: 'my-secret-value' } });
    fireEvent.click(screen.getByRole('button', { name: /add/i }));

    await waitFor(() => {
      expect(mockedInvoke).toHaveBeenCalledWith('add_secret', {
        key: 'NEW_KEY',
        value: 'my-secret-value',
      });
    });
  });

  it('calls remove_secret when trash button is clicked', async () => {
    mockedInvoke.mockImplementation(() =>
      Promise.resolve(['API_TOKEN'] as unknown as null)
    );
    render(<SecretsManager />);

    // Wait for the key to appear in the vault list
    await screen.findByText('API_TOKEN', { selector: '.font-mono.text-sm.text-yellow-300' });

    mockedInvoke.mockImplementation(() => Promise.resolve([] as unknown as null));
    fireEvent.click(screen.getByRole('button', { name: /Delete secret API_TOKEN/i }));

    await waitFor(() => {
      expect(mockedInvoke).toHaveBeenCalledWith('remove_secret', { key: 'API_TOKEN' });
    });
  });
});
