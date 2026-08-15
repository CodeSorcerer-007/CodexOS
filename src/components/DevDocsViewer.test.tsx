import { describe, test, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { DevDocsViewer } from './DevDocsViewer';
import { invoke } from '@tauri-apps/api/core';

vi.mock('@tauri-apps/api/core', () => ({
  invoke: vi.fn(),
  convertFileSrc: (path: string) => `asset://localhost/${path}`,
}));

describe('DevDocsViewer component', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(invoke).mockResolvedValue([
      { name: 'String.prototype.indexOf', type: 'Method', path: 'index.html#indexOf' },
      { name: 'Array.prototype.map', type: 'Method', path: 'array.html#map' },
    ]);
  });

  test('renders offline DevDocs search panel', () => {
    render(<DevDocsViewer />);
    expect(screen.getByText(/Offline DevDocs/i)).toBeInTheDocument();
    expect(screen.getByPlaceholderText(/search api/i)).toBeInTheDocument();
  });

  test('searches docset and lists matched index items', async () => {
    render(<DevDocsViewer />);
    const pathInput = screen.getByPlaceholderText(/path to \.docset/i);
    fireEvent.change(pathInput, { target: { value: 'C:\\docsets\\JavaScript.docset' } });

    const searchInput = screen.getByPlaceholderText(/search api/i);
    fireEvent.change(searchInput, { target: { value: 'map' } });

    const searchBtn = screen.getByRole('button', { name: /search/i });
    fireEvent.click(searchBtn);

    await waitFor(() => {
      expect(screen.getByText('String.prototype.indexOf')).toBeInTheDocument();
      expect(screen.getByText('Array.prototype.map')).toBeInTheDocument();
    });
  });
});
