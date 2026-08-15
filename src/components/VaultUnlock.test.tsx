import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
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
    mockedInvoke.mockImplementation((cmd: string) => {
      if (cmd === 'is_vault_locked') return Promise.resolve(false);
      return Promise.resolve(null);
    });
    render(<VaultUnlock />);
    await waitFor(() => {
      expect(screen.queryByText('Vault is Locked')).not.toBeInTheDocument();
    });
  });

  it('renders the lock overlay when vault is locked', async () => {
    mockedInvoke.mockImplementation((cmd: string) => {
      if (cmd === 'is_vault_locked') return Promise.resolve(true);
      return Promise.resolve(null);
    });
    render(<VaultUnlock />);
    await waitFor(() => {
      expect(screen.getByText('Vault is Locked')).toBeInTheDocument();
    });
  });

  it('shows an error message on wrong password', async () => {
    mockedInvoke.mockImplementation((cmd: string) => {
      if (cmd === 'is_vault_locked') return Promise.resolve(true);
      if (cmd === 'unlock_vault') return Promise.resolve(false);
      return Promise.resolve(null);
    });

    render(<VaultUnlock />);

    await waitFor(() => {
      expect(screen.getByText('Vault is Locked')).toBeInTheDocument();
    });

    const input = screen.getByLabelText('Master Password');
    await act(async () => {
      fireEvent.change(input, { target: { value: 'wrongpassword' } });
      fireEvent.click(screen.getByText('Unlock Vault'));
    });

    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent('Invalid password');
    });
  });

  it('hides overlay on successful unlock', async () => {
    mockedInvoke.mockImplementation((cmd: string) => {
      if (cmd === 'is_vault_locked') return Promise.resolve(true);
      if (cmd === 'unlock_vault') return Promise.resolve(true);
      return Promise.resolve(null);
    });

    useStore.setState({ isVaultLocked: true });
    render(<VaultUnlock />);

    const input = await screen.findByLabelText('Master Password');
    await act(async () => {
      fireEvent.change(input, { target: { value: 'correctpassword' } });
      fireEvent.click(screen.getByText('Unlock Vault'));
    });

    await waitFor(() => {
      expect(useStore.getState().isVaultLocked).toBe(false);
    });
  });
});
