import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { invoke } from '@tauri-apps/api/core';
import { ZKPVault } from './ZKPVault';

const mockedInvoke = vi.mocked(invoke);

describe('ZKPVault', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders the generator and verifier panels', () => {
    render(<ZKPVault />);
    expect(screen.getByText('HMAC Proof Generator')).toBeInTheDocument();
    expect(screen.getByText('HMAC Proof Verifier')).toBeInTheDocument();
  });

  it('HMAC key inputs are type=password (not plaintext)', () => {
    render(<ZKPVault />);
    const passwordInputs = document.querySelectorAll('input[type="password"]');
    // Both the generator key and verifier key should be password fields
    expect(passwordInputs.length).toBeGreaterThanOrEqual(2);
  });

  it('calls generate_hmac_proof on button click', async () => {
    mockedInvoke.mockResolvedValueOnce('abc123hash');
    render(<ZKPVault />);
    fireEvent.click(screen.getByText('Generate HMAC Proof'));
    await waitFor(() => {
      expect(mockedInvoke).toHaveBeenCalledWith('generate_hmac_proof', expect.any(Object));
    });
  });

  it('displays the generated proof hash', async () => {
    mockedInvoke.mockResolvedValueOnce('deadbeef1234');
    render(<ZKPVault />);
    fireEvent.click(screen.getByText('Generate HMAC Proof'));
    await waitFor(() => {
      expect(screen.getByText('deadbeef1234')).toBeInTheDocument();
    });
  });

  it('shows VERIFIED when proof is valid', async () => {
    mockedInvoke.mockResolvedValueOnce(true);
    render(<ZKPVault />);
    fireEvent.click(screen.getByText('Verify Proof'));
    await waitFor(() => {
      expect(screen.getByText(/CRYPTOGRAPHIC PROOF VERIFIED/)).toBeInTheDocument();
    });
  });

  it('shows INVALID when proof fails', async () => {
    mockedInvoke.mockResolvedValueOnce(false);
    render(<ZKPVault />);
    fireEvent.click(screen.getByText('Verify Proof'));
    await waitFor(() => {
      expect(screen.getByText(/INVALID PROOF/)).toBeInTheDocument();
    });
  });
});
