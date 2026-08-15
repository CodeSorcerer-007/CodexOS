import { describe, test, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { PluginMarketplace } from './PluginMarketplace';

vi.mock('@tauri-apps/api/core', () => ({
  invoke: vi.fn().mockResolvedValue(null),
}));

describe('PluginMarketplace component', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  test('renders plugin marketplace with search and filters', () => {
    render(<PluginMarketplace />);
    expect(screen.getByRole('heading', { name: /p2p plugin marketplace/i })).toBeInTheDocument();
    expect(screen.getByPlaceholderText(/search wasm plugins/i)).toBeInTheDocument();
  });

  test('filters plugins by search query', async () => {
    render(<PluginMarketplace />);
    const searchInput = screen.getByPlaceholderText(/search wasm plugins/i);
    fireEvent.change(searchInput, { target: { value: 'Secret Leak' } });

    await waitFor(() => {
      expect(screen.getByText('Secret Leak Scanner')).toBeInTheDocument();
      expect(screen.queryByText('Rust AST Formatter')).not.toBeInTheDocument();
    });
  });

  test('filters plugins by category tabs', async () => {
    render(<PluginMarketplace />);
    const securityTab = screen.getByRole('button', { name: /^security/i });
    fireEvent.click(securityTab);

    await waitFor(() => {
      expect(screen.getByText('Secret Leak Scanner')).toBeInTheDocument();
      expect(screen.queryByText('Rust AST Formatter')).not.toBeInTheDocument();
    });
  });
});
