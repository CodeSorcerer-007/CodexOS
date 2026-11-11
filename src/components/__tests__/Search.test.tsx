import { render, screen, fireEvent, act } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { GlobalSearchModal } from '../Search/GlobalSearchModal';
import { useSearchStore } from '../../store/searchStore';
import type { SearchMatch } from '../../ipc';

// Mock Tauri invoke and event listener
vi.mock('@tauri-apps/api/core', () => ({
  invoke: vi.fn(),
}));

vi.mock('@tauri-apps/api/event', () => ({
  listen: vi.fn().mockResolvedValue(() => {}),
}));

describe('Search Engine & GlobalSearchModal', () => {
  beforeEach(() => {
    useSearchStore.setState({
      isOpen: false,
      searchScope: 'E:/Github/CodexOS',
      scopeLabel: 'CodexOS',
      query: '',
      parsedQuery: null,
      queryError: null,
      results: [],
      isSearching: false,
      totalScanned: 0,
      searchDurationMs: 0,
      activeSearchId: null,
      selectedResultIndex: 0,
      filterType: 'all',
      filterSize: 'all',
      filterDate: 'all',
      contentSearchEnabled: false,
      sortBy: 'relevance',
      sortOrder: 'desc',
    });
    vi.clearAllMocks();
  });

  it('renders nothing when closed', () => {
    const { container } = render(<GlobalSearchModal />);
    expect(container.firstChild).toBeNull();
  });

  it('renders search modal when open', () => {
    act(() => {
      useSearchStore.getState().openSearch('E:/Github/CodexOS', 'CodexOS');
    });

    render(<GlobalSearchModal />);
    expect(screen.getByPlaceholderText(/Search by name/i)).toBeInTheDocument();
    expect(screen.getByText(/Searching Scope:/i)).toBeInTheDocument();
    expect(screen.getByText(/CodexOS \(E:\/Github\/CodexOS\)/i)).toBeInTheDocument();
  });

  it('appends quick syntax tokens on click', () => {
    act(() => {
      useSearchStore.getState().openSearch('E:/Github/CodexOS', 'CodexOS');
    });

    render(<GlobalSearchModal />);
    const syntaxBtn = screen.getByRole('button', { name: 'ext:rs,ts' });
    fireEvent.click(syntaxBtn);

    const input = screen.getByPlaceholderText(/Search by name/i) as HTMLInputElement;
    expect(input.value).toContain('ext:rs,ts');
  });

  it('switches filter chips and updates store state', () => {
    act(() => {
      useSearchStore.getState().openSearch('E:/Github/CodexOS', 'CodexOS');
    });

    render(<GlobalSearchModal />);
    const codeBtn = screen.getByRole('button', { name: 'code' });
    fireEvent.click(codeBtn);

    expect(useSearchStore.getState().filterType).toBe('code');
  });

  it('renders search results with file details and snippets', () => {
    const mockMatches: SearchMatch[] = [
      {
        path: 'E:/Github/CodexOS/src/search.rs',
        filename: 'search.rs',
        is_dir: false,
        size_bytes: 24576,
        modified_secs: 1731234567,
        line_number: 42,
        snippet: 'pub fn parse_search_query(...)',
        match_indices: [[7, 25]],
        relevance_score: 120,
      },
      {
        path: 'E:/Github/CodexOS/src/components',
        filename: 'components',
        is_dir: true,
        size_bytes: 0,
        modified_secs: 1731230000,
        match_indices: [],
        relevance_score: 50,
      },
    ];

    act(() => {
      useSearchStore.setState({
        isOpen: true,
        results: mockMatches,
      });
    });

    render(<GlobalSearchModal />);

    expect(screen.getByText('search.rs')).toBeInTheDocument();
    expect(screen.getByText('components')).toBeInTheDocument();
    expect(screen.getByText('DIR')).toBeInTheDocument();
    expect(screen.getByText(/pub fn parse_search_query/i)).toBeInTheDocument();
  });

  it('supports keyboard navigation through results', () => {
    const mockMatches: SearchMatch[] = [
      {
        path: 'E:/file1.txt',
        filename: 'file1.txt',
        is_dir: false,
        size_bytes: 100,
        modified_secs: 1000,
        match_indices: [],
        relevance_score: 100,
      },
      {
        path: 'E:/file2.txt',
        filename: 'file2.txt',
        is_dir: false,
        size_bytes: 200,
        modified_secs: 2000,
        match_indices: [],
        relevance_score: 90,
      },
    ];

    act(() => {
      useSearchStore.setState({
        isOpen: true,
        results: mockMatches,
        selectedResultIndex: 0,
      });
    });

    render(<GlobalSearchModal />);

    // Arrow down
    fireEvent.keyDown(window, { key: 'ArrowDown' });
    expect(useSearchStore.getState().selectedResultIndex).toBe(1);

    // Arrow up
    fireEvent.keyDown(window, { key: 'ArrowUp' });
    expect(useSearchStore.getState().selectedResultIndex).toBe(0);
  });

  it('invokes onOpenFile or onNavigateToPath on item select and Enter', () => {
    const onOpenFile = vi.fn();
    const onNavigateToPath = vi.fn();

    const mockMatches: SearchMatch[] = [
      {
        path: 'E:/test_file.rs',
        filename: 'test_file.rs',
        is_dir: false,
        size_bytes: 500,
        modified_secs: 1000,
        match_indices: [],
        relevance_score: 100,
      },
    ];

    act(() => {
      useSearchStore.setState({
        isOpen: true,
        results: mockMatches,
        selectedResultIndex: 0,
      });
    });

    render(
      <GlobalSearchModal
        onOpenFile={onOpenFile}
        onNavigateToPath={onNavigateToPath}
      />
    );

    fireEvent.keyDown(window, { key: 'Enter' });
    expect(onOpenFile).toHaveBeenCalledWith('E:/test_file.rs');
    expect(useSearchStore.getState().isOpen).toBe(false);
  });

  it('closes modal on Escape key', () => {
    act(() => {
      useSearchStore.getState().openSearch('E:/Github/CodexOS');
    });

    render(<GlobalSearchModal />);
    expect(useSearchStore.getState().isOpen).toBe(true);

    fireEvent.keyDown(window, { key: 'Escape' });
    expect(useSearchStore.getState().isOpen).toBe(false);
  });

  it('shows cancel button during active search', () => {
    act(() => {
      useSearchStore.setState({
        isOpen: true,
        isSearching: true,
        totalScanned: 1500,
      });
    });

    render(<GlobalSearchModal />);
    expect(screen.getByRole('button', { name: 'Cancel' })).toBeInTheDocument();
    expect(screen.getByText(/Scanning... \(1500 files scanned/i)).toBeInTheDocument();
  });
});
