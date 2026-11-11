import { create } from 'zustand';
import { listen, type UnlistenFn } from '@tauri-apps/api/event';
import {
  startFileSearch,
  cancelFileSearch,
  parseQueryPreview,
  type SearchQuery,
  type SearchMatch,
  type SearchBatchEvent,
  type SearchDoneEvent,
  type SearchExecutionOptions,
} from '../ipc';

export type FileTypeFilter = 'all' | 'code' | 'doc' | 'image' | 'media' | 'archive';
export type SizeFilter = 'all' | '<100kb' | '<1mb' | '>10mb';
export type DateFilter = 'all' | 'today' | '7d' | '30d';
export type SearchSortBy = 'relevance' | 'name' | 'size' | 'modified';
export type SearchSortOrder = 'asc' | 'desc';

export interface SearchState {
  isOpen: boolean;
  searchScope: string;
  scopeLabel: string;
  query: string;
  parsedQuery: SearchQuery | null;
  queryError: string | null;
  results: SearchMatch[];
  isSearching: boolean;
  totalScanned: number;
  searchDurationMs: number;
  activeSearchId: string | null;
  selectedResultIndex: number;
  filterType: FileTypeFilter;
  filterSize: SizeFilter;
  filterDate: DateFilter;
  contentSearchEnabled: boolean;
  sortBy: SearchSortBy;
  sortOrder: SearchSortOrder;

  // Actions
  openSearch: (scopePath: string, scopeLabel?: string) => void;
  closeSearch: () => void;
  setQuery: (query: string) => void;
  setScope: (path: string, label?: string) => void;
  setFilterType: (type: FileTypeFilter) => void;
  setFilterSize: (size: SizeFilter) => void;
  setFilterDate: (date: DateFilter) => void;
  setContentSearchEnabled: (enabled: boolean) => void;
  setSort: (sortBy: SearchSortBy, sortOrder?: SearchSortOrder) => void;
  selectIndex: (index: number) => void;
  executeSearch: () => Promise<void>;
  cancelActiveSearch: () => Promise<void>;
  clearResults: () => void;
}

let batchUnlisten: UnlistenFn | null = null;
let doneUnlisten: UnlistenFn | null = null;

export const useSearchStore = create<SearchState>((set, get) => ({
  isOpen: false,
  searchScope: '',
  scopeLabel: 'Current Folder',
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

  openSearch: (scopePath: string, scopeLabel = 'Current Folder') => {
    set({
      isOpen: true,
      searchScope: scopePath,
      scopeLabel,
      selectedResultIndex: 0,
    });
  },

  closeSearch: () => {
    const { cancelActiveSearch } = get();
    cancelActiveSearch();
    set({ isOpen: false });
  },

  setQuery: (query: string) => {
    set({ query, selectedResultIndex: 0 });
    // Live preview parsing
    if (!query.trim()) {
      set({ parsedQuery: null, queryError: null });
      return;
    }
    parseQueryPreview(query)
      .then((parsed) => {
        set({ parsedQuery: parsed, queryError: null });
      })
      .catch((err) => {
        const msg = err instanceof Error ? err.message : String(err);
        set({ queryError: msg });
      });
  },

  setScope: (path: string, label?: string) => {
    set({
      searchScope: path,
      scopeLabel: label || path.split(/[/\\]/).filter(Boolean).pop() || path,
    });
  },

  setFilterType: (type: FileTypeFilter) => {
    set({ filterType: type });
    get().executeSearch();
  },

  setFilterSize: (size: SizeFilter) => {
    set({ filterSize: size });
    get().executeSearch();
  },

  setFilterDate: (date: DateFilter) => {
    set({ filterDate: date });
    get().executeSearch();
  },

  setContentSearchEnabled: (enabled: boolean) => {
    set({ contentSearchEnabled: enabled });
    get().executeSearch();
  },

  setSort: (sortBy: SearchSortBy, sortOrder) => {
    set((state) => ({
      sortBy,
      sortOrder: sortOrder || (state.sortBy === sortBy && state.sortOrder === 'desc' ? 'asc' : 'desc'),
    }));
  },

  selectIndex: (index: number) => {
    const { results } = get();
    if (results.length === 0) return;
    const clamped = Math.max(0, Math.min(index, results.length - 1));
    set({ selectedResultIndex: clamped });
  },

  clearResults: () => {
    set({ results: [], totalScanned: 0, searchDurationMs: 0, selectedResultIndex: 0 });
  },

  cancelActiveSearch: async () => {
    const { activeSearchId } = get();
    if (activeSearchId) {
      try {
        await cancelFileSearch(activeSearchId);
      } catch {
        // ignore
      }
    }
    if (batchUnlisten) {
      batchUnlisten();
      batchUnlisten = null;
    }
    if (doneUnlisten) {
      doneUnlisten();
      doneUnlisten = null;
    }
    set({ isSearching: false, activeSearchId: null });
  },

  executeSearch: async () => {
    const {
      searchScope,
      query,
      filterType,
      filterSize,
      filterDate,
      contentSearchEnabled,
      cancelActiveSearch,
    } = get();

    if (!searchScope || !query.trim()) {
      set({ results: [], isSearching: false, totalScanned: 0 });
      return;
    }

    await cancelActiveSearch();

    // Compose query with active filter chips
    const queryParts: string[] = [query.trim()];
    if (filterType !== 'all') {
      queryParts.push(`type:${filterType}`);
    }
    if (filterSize === '<100kb') {
      queryParts.push('size:<100kb');
    } else if (filterSize === '<1mb') {
      queryParts.push('size:<1mb');
    } else if (filterSize === '>10mb') {
      queryParts.push('size:>10mb');
    }

    if (filterDate === 'today') {
      queryParts.push('modified:today');
    } else if (filterDate === '7d') {
      queryParts.push('modified:7d');
    } else if (filterDate === '30d') {
      queryParts.push('modified:30d');
    }

    const composedQuery = queryParts.join(' ');
    const searchId = `search_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;

    set({
      isSearching: true,
      activeSearchId: searchId,
      results: [],
      totalScanned: 0,
      searchDurationMs: 0,
      selectedResultIndex: 0,
    });

    try {
      // Listen for progressive results
      batchUnlisten = await listen<SearchBatchEvent>('search://batch', (event) => {
        if (event.payload.search_id !== searchId) return;
        set((state) => {
          const merged = [...state.results, ...event.payload.matches];
          return {
            results: merged,
            totalScanned: event.payload.total_scanned,
          };
        });
      });

      doneUnlisten = await listen<SearchDoneEvent>('search://done', (event) => {
        if (event.payload.search_id !== searchId) return;
        set({
          isSearching: false,
          activeSearchId: null,
          totalScanned: event.payload.total_scanned,
          searchDurationMs: event.payload.duration_ms,
        });
        if (batchUnlisten) {
          batchUnlisten();
          batchUnlisten = null;
        }
        if (doneUnlisten) {
          doneUnlisten();
          doneUnlisten = null;
        }
      });

      const options: SearchExecutionOptions = {
        search_content: contentSearchEnabled,
        max_results: 2000,
        max_file_size_bytes: 10 * 1024 * 1024,
      };

      await startFileSearch(searchId, searchScope, composedQuery, options);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      set({
        isSearching: false,
        activeSearchId: null,
        queryError: msg,
      });
    }
  },
}));
