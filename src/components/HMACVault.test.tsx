import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { invoke } from '@tauri-apps/api/core';
import { HMACVault } from './HMACVault';

const mockedInvoke = vi.mocked(invoke);

describe('HMACVault', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders the generator and verifier panels', () => {
    render(<HMACVault />);
    expect(screen.getByText('HMAC Proof Generator')).toBeInTheDocument();
    expect(screen.getByText('HMAC Proof Verifier')).toBeInTheDocument();
  });

  it('HMAC key inputs are type=password (not plaintext)', () => {
    render(<HMACVault />);
    const passwordInputs = document.querySelectorAll('input[type="password"]');
    // Both the generator key and verifier key should be password fields
    expect(passwordInputs.length).toBeGreaterThanOrEqual(2);
  });

  it('calls generate_hmac_proof on button click', async () => {
    mockedInvoke.mockResolvedValueOnce('abc123hash');
    render(<HMACVault />);
    fireEvent.click(screen.getByText('Generate HMAC Proof'));
    await waitFor(() => {
      expect(mockedInvoke).toHaveBeenCalledWith('generate_hmac_proof', expect.any(Object));
    });
  });

  it('displays the generated proof hash', async () => {
    mockedInvoke.mockResolvedValueOnce('deadbeef1234');
    render(<HMACVault />);
    fireEvent.click(screen.getByText('Generate HMAC Proof'));
    await waitFor(() => {
      expect(screen.getByText('deadbeef1234')).toBeInTheDocument();
    });
  });

  it('shows VERIFIED when proof is valid', async () => {
    mockedInvoke.mockResolvedValueOnce(true);
    render(<HMACVault />);
    fireEvent.click(screen.getByText('Verify Proof'));
    await waitFor(() => {
      expect(screen.getByText(/CRYPTOGRAPHIC PROOF VERIFIED/)).toBeInTheDocument();
    });
  });

  it('shows INVALID when proof fails', async () => {
    mockedInvoke.mockResolvedValueOnce(false);
    render(<HMACVault />);
    fireEvent.click(screen.getByText('Verify Proof'));
    await waitFor(() => {
      expect(screen.getByText(/INVALID PROOF/)).toBeInTheDocument();
    });
  });
});
