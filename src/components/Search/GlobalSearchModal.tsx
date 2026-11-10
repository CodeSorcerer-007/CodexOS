import { useEffect, useRef, useState, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Search,
  X,
  FileCode,
  FileText,
  Image,
  Film,
  Archive,
  Folder,
  FolderOpen,
  ArrowUpDown,
  AlertCircle,
  HardDrive,
  Sparkles,
} from 'lucide-react';
import { useSearchStore, type FileTypeFilter, type SizeFilter, type DateFilter, type SearchSortBy } from '../../store/searchStore';
import type { SearchMatch } from '../../ipc';

interface GlobalSearchModalProps {
  onNavigateToPath?: (path: string) => void;
  onOpenFile?: (path: string) => void;
}

export const GlobalSearchModal = ({
  onNavigateToPath,
  onOpenFile,
}: GlobalSearchModalProps) => {
  const {
    isOpen,
    searchScope,
    scopeLabel,
    query,
    queryError,
    results,
    isSearching,
    totalScanned,
    searchDurationMs,
    selectedResultIndex,
    filterType,
    filterSize,
    filterDate,
    contentSearchEnabled,
    sortBy,
    sortOrder,
    closeSearch,
    setQuery,
    setFilterType,
    setFilterSize,
    setFilterDate,
    setContentSearchEnabled,
    setSort,
    selectIndex,
    executeSearch,
    cancelActiveSearch,
  } = useSearchStore();

  const [inputVal, setInputVal] = useState(query);
  const inputRef = useRef<HTMLInputElement>(null);
  const resultsListRef = useRef<HTMLDivElement>(null);

  // Sync internal input value with store query
  useEffect(() => {
    setInputVal(query);
  }, [query]);

  // Focus input when opened
  useEffect(() => {
    if (isOpen) {
      setTimeout(() => {
        inputRef.current?.focus();
        inputRef.current?.select();
      }, 50);
    }
  }, [isOpen]);

  // Debounced search trigger
  useEffect(() => {
    if (!isOpen) return;
    const timer = setTimeout(() => {
      setQuery(inputVal);
      executeSearch();
    }, 300);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [inputVal, isOpen]);

  // Keyboard navigation
  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        closeSearch();
      } else if (e.key === 'ArrowDown') {
        e.preventDefault();
        selectIndex(selectedResultIndex + 1);
        scrollSelectedIntoView(selectedResultIndex + 1);
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        selectIndex(selectedResultIndex - 1);
        scrollSelectedIntoView(selectedResultIndex - 1);
      } else if (e.key === 'Enter') {
        e.preventDefault();
        const currentMatch = sortedResults[selectedResultIndex];
        if (currentMatch) {
          handleOpenItem(currentMatch);
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, selectedResultIndex, results, sortBy, sortOrder]);

  const scrollSelectedIntoView = (index: number) => {
    if (!resultsListRef.current) return;
    const el = document.getElementById(`search-item-${index}`);
    if (el && typeof el.scrollIntoView === 'function') {
      el.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    }
  };

  const sortedResults = useMemo(() => {
    return [...results].sort((a, b) => {
      let comparison = 0;
      if (sortBy === 'relevance') {
        comparison = (b.relevance_score || 0) - (a.relevance_score || 0);
      } else if (sortBy === 'name') {
        comparison = a.filename.localeCompare(b.filename);
      } else if (sortBy === 'size') {
        comparison = a.size_bytes - b.size_bytes;
      } else if (sortBy === 'modified') {
        comparison = a.modified_secs - b.modified_secs;
      }
      return sortOrder === 'desc' ? comparison : -comparison;
    });
  }, [results, sortBy, sortOrder]);

  const handleOpenItem = (match: SearchMatch) => {
    if (match.is_dir) {
      onNavigateToPath?.(match.path);
    } else {
      onOpenFile?.(match.path);
    }
    closeSearch();
  };

  const handleRevealItem = (match: SearchMatch, e: React.MouseEvent) => {
    e.stopPropagation();
    const parentDir = match.path.replace(/[/\\][^/\\]+$/, '');
    onNavigateToPath?.(parentDir || match.path);
    closeSearch();
  };

  const appendQueryToken = (token: string) => {
    const updated = inputVal.trim() ? `${inputVal.trim()} ${token}` : token;
    setInputVal(updated);
    inputRef.current?.focus();
  };

  const formatFileSize = (bytes: number) => {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return `${(bytes / Math.pow(k, i)).toFixed(1)} ${sizes[i]}`;
  };

  const formatModifiedDate = (secs: number) => {
    if (!secs) return '';
    const date = new Date(secs * 1000);
    return date.toLocaleDateString(undefined, {
      month: 'short',
      day: 'numeric',
      year: date.getFullYear() !== new Date().getFullYear() ? 'numeric' : undefined,
    });
  };

  const getItemIcon = (match: SearchMatch) => {
    if (match.is_dir) {
      return <Folder className="w-4 h-4 text-amber-400 flex-shrink-0" />;
    }
    const ext = match.filename.split('.').pop()?.toLowerCase() || '';
    if (['rs', 'ts', 'tsx', 'js', 'jsx', 'py', 'json', 'html', 'css'].includes(ext)) {
      return <FileCode className="w-4 h-4 text-cyan-400 flex-shrink-0" />;
    }
    if (['png', 'jpg', 'jpeg', 'gif', 'svg', 'webp'].includes(ext)) {
      return <Image className="w-4 h-4 text-emerald-400 flex-shrink-0" />;
    }
    if (['mp3', 'wav', 'mp4', 'mkv', 'avi'].includes(ext)) {
      return <Film className="w-4 h-4 text-violet-400 flex-shrink-0" />;
    }
    if (['zip', 'tar', 'gz', '7z', 'rar'].includes(ext)) {
      return <Archive className="w-4 h-4 text-amber-500 flex-shrink-0" />;
    }
    return <FileText className="w-4 h-4 text-zinc-400 flex-shrink-0" />;
  };

  if (!isOpen) return null;

  return (
    <AnimatePresence>
      <div
        className="fixed inset-0 z-50 bg-black/70 backdrop-blur-xs flex items-start justify-center pt-16 px-4"
        onClick={closeSearch}
      >
        <motion.div
          initial={{ opacity: 0, scale: 0.96, y: -10 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.96, y: -10 }}
          transition={{ duration: 0.15 }}
          className="bg-[#1e1e1e] border border-white/10 rounded-xl shadow-2xl w-full max-w-4xl max-h-[82vh] flex flex-col overflow-hidden text-zinc-200"
          onClick={(e) => e.stopPropagation()}
        >
          {/* Top Bar: Scope & Close */}
          <div className="flex items-center justify-between px-4 py-2.5 bg-[#252526] border-b border-white/5 text-xs text-zinc-400">
            <div className="flex items-center gap-2 truncate">
              <HardDrive className="w-3.5 h-3.5 text-cyan-400 flex-shrink-0" />
              <span className="font-medium text-zinc-300">Searching Scope:</span>
              <span className="text-zinc-400 truncate max-w-lg font-mono bg-white/5 px-2 py-0.5 rounded" title={searchScope}>
                {scopeLabel} ({searchScope})
              </span>
            </div>
            <button
              onClick={closeSearch}
              className="p-1 rounded hover:bg-white/10 text-zinc-400 hover:text-white transition-colors"
              title="Close (Esc)"
              aria-label="Close"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          {/* Search Input Box */}
          <div className="flex items-center px-4 py-3 border-b border-white/10 gap-3 bg-[#181818]">
            <Search className="w-5 h-5 text-zinc-400 flex-shrink-0" />
            <input
              ref={inputRef}
              type="text"
              value={inputVal}
              onChange={(e) => setInputVal(e.target.value)}
              placeholder="Search by name, ext:rs, size:>10mb, modified:7d, content:&quot;phrase&quot;..."
              className="flex-1 bg-transparent border-none outline-none text-base text-zinc-100 placeholder:text-zinc-500 font-sans"
            />
            {inputVal && (
              <button
                onClick={() => {
                  setInputVal('');
                  setQuery('');
                }}
                className="p-1 rounded hover:bg-white/10 text-zinc-500 hover:text-zinc-200"
                title="Clear input"
              >
                <X className="w-4 h-4" />
              </button>
            )}
            {isSearching && (
              <button
                onClick={cancelActiveSearch}
                className="text-xs px-2.5 py-1 bg-rose-500/20 text-rose-300 border border-rose-500/30 rounded hover:bg-rose-500/30 transition-colors"
              >
                Cancel
              </button>
            )}
          </div>

          {/* Query Syntax Helper Pills */}
          <div className="flex items-center gap-1.5 px-4 py-1.5 bg-[#202020] border-b border-white/5 text-[11px] overflow-x-auto no-scrollbar">
            <span className="text-zinc-500 font-medium">Quick syntax:</span>
            <button
              onClick={() => appendQueryToken('ext:rs,ts')}
              className="px-2 py-0.5 rounded bg-white/5 hover:bg-white/10 text-cyan-300 transition-colors"
            >
              ext:rs,ts
            </button>
            <button
              onClick={() => appendQueryToken('size:>10mb')}
              className="px-2 py-0.5 rounded bg-white/5 hover:bg-white/10 text-amber-300 transition-colors"
            >
              size:&gt;10mb
            </button>
            <button
              onClick={() => appendQueryToken('modified:7d')}
              className="px-2 py-0.5 rounded bg-white/5 hover:bg-white/10 text-emerald-300 transition-colors"
            >
              modified:7d
            </button>
            <button
              onClick={() => appendQueryToken('content:"TODO"')}
              className="px-2 py-0.5 rounded bg-white/5 hover:bg-white/10 text-purple-300 transition-colors"
            >
              content:&quot;TODO&quot;
            </button>
            <button
              onClick={() => appendQueryToken('path:src')}
              className="px-2 py-0.5 rounded bg-white/5 hover:bg-white/10 text-blue-300 transition-colors"
            >
              path:src
            </button>

            {queryError && (
              <div className="ml-auto flex items-center gap-1 text-rose-400 bg-rose-950/40 px-2 py-0.5 rounded border border-rose-800/40">
                <AlertCircle className="w-3 h-3" />
                <span>{queryError}</span>
              </div>
            )}
          </div>

          {/* Filter Chips Bar */}
          <div className="flex flex-wrap items-center justify-between px-4 py-2 bg-[#1b1b1b] border-b border-white/5 gap-2 text-xs">
            {/* Category / Type Chips */}
            <div className="flex items-center gap-1 overflow-x-auto no-scrollbar">
              {(['all', 'code', 'doc', 'image', 'media', 'archive'] as FileTypeFilter[]).map((type) => (
                <button
                  key={type}
                  onClick={() => setFilterType(type)}
                  className={`px-2.5 py-1 rounded-md capitalize transition-colors font-medium ${
                    filterType === type
                      ? 'bg-cyan-500 text-black shadow-xs font-semibold'
                      : 'bg-white/5 hover:bg-white/10 text-zinc-400 hover:text-zinc-200'
                  }`}
                >
                  {type}
                </button>
              ))}
            </div>

            {/* Size & Date Dropdowns / Quick Toggles */}
            <div className="flex items-center gap-2">
              <select
                value={filterSize}
                onChange={(e) => setFilterSize(e.target.value as SizeFilter)}
                className="bg-[#252526] border border-white/10 rounded px-2 py-1 text-xs text-zinc-300 outline-none hover:border-white/20"
                aria-label="Filter by size"
              >
                <option value="all">Any Size</option>
                <option value="<100kb">&lt; 100 KB</option>
                <option value="<1mb">&lt; 1 MB</option>
                <option value=">10mb">&gt; 10 MB</option>
              </select>

              <select
                value={filterDate}
                onChange={(e) => setFilterDate(e.target.value as DateFilter)}
                className="bg-[#252526] border border-white/10 rounded px-2 py-1 text-xs text-zinc-300 outline-none hover:border-white/20"
                aria-label="Filter by modification date"
              >
                <option value="all">Any Date</option>
                <option value="today">Today</option>
                <option value="7d">Past 7 Days</option>
                <option value="30d">Past 30 Days</option>
              </select>

              {/* Content Search Toggle */}
              <label className="flex items-center gap-1.5 cursor-pointer select-none bg-white/5 hover:bg-white/10 px-2 py-1 rounded text-zinc-300 transition-colors">
                <input
                  type="checkbox"
                  checked={contentSearchEnabled}
                  onChange={(e) => setContentSearchEnabled(e.target.checked)}
                  className="rounded accent-cyan-400 w-3.5 h-3.5"
                />
                <span>Content</span>
              </label>

              {/* Sort Selector */}
              <div className="flex items-center bg-[#252526] border border-white/10 rounded px-1.5 py-0.5">
                <select
                  value={sortBy}
                  onChange={(e) => setSort(e.target.value as SearchSortBy)}
                  className="bg-transparent border-none outline-none text-xs text-zinc-300 cursor-pointer pr-1"
                  aria-label="Sort by"
                >
                  <option value="relevance">Relevance</option>
                  <option value="name">Name</option>
                  <option value="size">Size</option>
                  <option value="modified">Date</option>
                </select>
                <button
                  onClick={() => setSort(sortBy)}
                  className="p-1 text-zinc-400 hover:text-white"
                  title={`Sort ${sortOrder === 'asc' ? 'Ascending' : 'Descending'}`}
                >
                  <ArrowUpDown className="w-3 h-3" />
                </button>
              </div>
            </div>
          </div>

          {/* Results Header / Progress Status */}
          <div className="flex items-center justify-between px-4 py-1.5 bg-[#181818] border-b border-white/5 text-[11px] text-zinc-400">
            <div className="flex items-center gap-2">
              {isSearching ? (
                <div className="flex items-center gap-2 text-cyan-400">
                  <div className="w-2 h-2 rounded-full bg-cyan-400 animate-ping" />
                  <span>Scanning... ({totalScanned} files scanned, {results.length} matches)</span>
                </div>
              ) : (
                <span>
                  Found <strong className="text-zinc-200">{sortedResults.length}</strong> {sortedResults.length === 1 ? 'match' : 'matches'}
                  {totalScanned > 0 && ` across ${totalScanned} scanned items`}
                  {searchDurationMs > 0 && ` in ${searchDurationMs} ms`}
                </span>
              )}
            </div>
            <span className="text-zinc-500">
              Use ↑↓ to navigate, Enter to open, Esc to dismiss
            </span>
          </div>

          {/* Results List */}
          <div
            ref={resultsListRef}
            className="flex-1 overflow-y-auto divide-y divide-white/5 max-h-[50vh] p-1 bg-[#1a1a1a]"
            role="listbox"
          >
            {sortedResults.length === 0 && !isSearching && (
              <div className="py-16 text-center text-zinc-500 flex flex-col items-center gap-2">
                <Search className="w-8 h-8 opacity-40" />
                <p className="text-sm">
                  {inputVal ? 'No files match your query.' : 'Type a query or syntax filter to search.'}
                </p>
                <p className="text-xs text-zinc-600 max-w-sm">
                  Supports structured keywords: <code className="text-zinc-400">ext:rs</code>, <code className="text-zinc-400">size:&gt;10mb</code>, <code className="text-zinc-400">modified:7d</code>, <code className="text-zinc-400">content:&quot;text&quot;</code>
                </p>
              </div>
            )}

            {sortedResults.map((match, idx) => {
              const isSelected = idx === selectedResultIndex;
              return (
                <div
                  key={`${match.path}-${idx}`}
                  id={`search-item-${idx}`}
                  onClick={() => selectIndex(idx)}
                  onDoubleClick={() => handleOpenItem(match)}
                  className={`group px-3 py-2 rounded-lg flex flex-col gap-1 cursor-pointer transition-colors ${
                    isSelected
                      ? 'bg-cyan-500/15 border border-cyan-500/40 text-white'
                      : 'hover:bg-white/5 border border-transparent text-zinc-300'
                  }`}
                  role="option"
                  aria-selected={isSelected}
                >
                  <div className="flex items-center justify-between gap-3">
                    <div className="flex items-center gap-2.5 min-w-0">
                      {getItemIcon(match)}
                      <span className="font-medium text-sm truncate text-zinc-100 group-hover:text-cyan-300">
                        {match.filename}
                      </span>
                      {match.is_dir && (
                        <span className="text-[10px] px-1.5 py-0.5 rounded bg-amber-500/10 text-amber-400 border border-amber-500/20 font-mono">
                          DIR
                        </span>
                      )}
                    </div>

                    <div className="flex items-center gap-3 text-xs text-zinc-500 flex-shrink-0">
                      <span>{formatFileSize(match.size_bytes)}</span>
                      <span>{formatModifiedDate(match.modified_secs)}</span>

                      <div className="opacity-0 group-hover:opacity-100 flex items-center gap-1 transition-opacity">
                        <button
                          onClick={(e) => handleRevealItem(match, e)}
                          className="px-2 py-0.5 rounded bg-white/10 hover:bg-white/20 text-zinc-200 text-xs flex items-center gap-1"
                          title="Reveal in folder"
                        >
                          <FolderOpen className="w-3 h-3" />
                          <span>Reveal</span>
                        </button>
                      </div>
                    </div>
                  </div>

                  {/* Relative Path */}
                  <div className="text-[11px] text-zinc-500 truncate font-mono pl-6.5">
                    {match.path}
                  </div>

                  {/* Content Snippet */}
                  {match.snippet && (
                    <div className="mt-1 pl-6.5 text-xs text-zinc-400 bg-black/40 border border-white/5 rounded px-2.5 py-1.5 font-mono overflow-x-auto">
                      <span className="text-zinc-600 mr-2 select-none">
                        L{match.line_number || 1}:
                      </span>
                      <span className="text-zinc-300">{match.snippet}</span>
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {/* Footer Bar */}
          <div className="flex items-center justify-between px-4 py-2 bg-[#252526] border-t border-white/5 text-xs text-zinc-400">
            <div className="flex items-center gap-2">
              <Sparkles className="w-3.5 h-3.5 text-cyan-400" />
              <span>Native streaming engine (offline & bounded memory)</span>
            </div>
            <div className="flex items-center gap-3">
              <button
                onClick={closeSearch}
                className="px-3 py-1 bg-white/10 hover:bg-white/15 rounded text-zinc-300 transition-colors"
              >
                Close
              </button>
            </div>
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
};
