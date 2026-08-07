import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { invoke } from '@tauri-apps/api/core';
import { VaultUnlock } from './VaultUnlock';
import { useStore } from '../store/store';

const mockedInvoke = vi.mocked(invoke);

describe('VaultUnlock', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Stub setInterval to prevent the 5-second polling from running
    vi.spyOn(window, 'setInterval').mockReturnValue(0 as unknown as ReturnType<typeof setInterval>);
    useStore.setState({ isVaultLocked: false });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('does not render overlay when vault is unlocked', async () => {
    mockedInvoke.mockResolvedValueOnce(false);
    render(<VaultUnlock />);
    await waitFor(() => {
      expect(screen.queryByText('Vault is Locked')).not.toBeInTheDocument();
    });
  });

  it('renders the lock overlay when vault is locked', async () => {
    mockedInvoke.mockResolvedValueOnce(true);
    render(<VaultUnlock />);
    await waitFor(() => {
      expect(screen.getByText('Vault is Locked')).toBeInTheDocument();
    });
  });

  it('shows an error message on wrong password', async () => {
    mockedInvoke.mockResolvedValueOnce(true);  // is_vault_locked = true
    mockedInvoke.mockResolvedValueOnce(false); // unlock_vault fails

    render(<VaultUnlock />);

    await waitFor(() => {
      expect(screen.getByText('Vault is Locked')).toBeInTheDocument();
    });

    const input = screen.getByLabelText('Master Password');
    fireEvent.change(input, { target: { value: 'wrongpassword' } });
    fireEvent.click(screen.getByText('Unlock Vault'));

    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent('Invalid password');
    });
  });

  it('hides overlay on successful unlock', async () => {
    mockedInvoke.mockImplementation((cmd: string) => {
      if (cmd === 'is_vault_locked') return Promise.resolve(true);
      if (cmd === 'unlock_vault') return Promise.resolve(true); // success
      return Promise.resolve(null);
    });

    render(<VaultUnlock />);

    await waitFor(() => {
      expect(screen.getByText('Vault is Locked')).toBeInTheDocument();
    });

    const input = screen.getByLabelText('Master Password');
    fireEvent.change(input, { target: { value: 'correctpassword' } });
    fireEvent.click(screen.getByText('Unlock Vault'));

    // After successful unlock the store should reflect unlocked state.
    await waitFor(() => {
      expect(useStore.getState().isVaultLocked).toBe(false);
    });
  });
});
