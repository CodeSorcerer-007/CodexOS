import { motion, AnimatePresence } from 'framer-motion';
import { useState, useEffect, useRef } from 'react';
import { invoke } from '@tauri-apps/api/core';

interface SearchResult {
  file: string;
  line: number;
  content: string;
}

const springPhysics = {
  type: "spring" as const,
  stiffness: 300,
  damping: 25
};

export const SearchOverlay = ({ isOpen, onClose, currentPath }: { isOpen: boolean, onClose: () => void, currentPath: string | null }) => {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SearchResult[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isOpen) {
      setTimeout(() => inputRef.current?.focus(), 100);
    } else {
      setQuery('');
      setResults([]);
    }
  }, [isOpen]);

  useEffect(() => {
    const delayDebounceFn = setTimeout(() => {
      if (query.trim().length > 2 && currentPath) {
        performSearch(query);
      } else {
        setResults([]);
      }
    }, 300);

    return () => clearTimeout(delayDebounceFn);
  }, [query, currentPath]);

  const performSearch = async (q: string) => {
    setIsSearching(true);
    try {
      const res = await invoke<SearchResult[]>('search_contents', { path: currentPath, query: q });
      setResults(res);
    } catch (e) {
      console.error(e);
      // Ripgrep might fail if not installed or bad query
      setResults([]);
    }
    setIsSearching(false);
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0, scale: 0.95 }}
          transition={springPhysics}
          className="absolute inset-x-0 top-20 mx-auto w-[800px] max-w-full z-50 liquid-glass border border-white/10 rounded-2xl shadow-2xl flex flex-col"
          style={{ maxHeight: 'calc(100vh - 120px)' }}
        >
          <div className="p-4 border-b border-white/10 flex items-center gap-4">
            <span className="text-cyan text-xl">🔍</span>
            <input
              ref={inputRef}
              type="text"
              placeholder="Search code contents globally (Powered by ripgrep)..."
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              className="flex-1 bg-transparent text-lg text-white focus:outline-none placeholder-gray-500 font-mono"
              onKeyDown={(e) => e.key === 'Escape' && onClose()}
            />
            {isSearching && <span className="text-cyan text-sm animate-pulse">Searching...</span>}
            <button onClick={onClose} className="text-gray-400 hover:text-white">✕</button>
          </div>
          
          <div className="flex-1 overflow-y-auto p-2 font-mono text-sm">
            {results.length === 0 && query.length > 2 && !isSearching && (
              <div className="p-8 text-center text-gray-500">No results found in {currentPath}</div>
            )}
            
            {results.length === 0 && query.length <= 2 && (
              <div className="p-8 text-center text-gray-500">Type at least 3 characters to search with Ripgrep</div>
            )}

            {results.map((res, idx) => (
              <motion.div 
                key={idx}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: Math.min(idx * 0.02, 0.5) }}
                className="p-3 border-b border-white/5 hover:bg-cyan/10 cursor-pointer group transition-colors flex flex-col gap-1"
              >
                <div className="text-cyan/80 text-xs truncate">{res.file}:{res.line}</div>
                <div className="text-gray-300 truncate group-hover:text-white transition-colors">{res.content}</div>
              </motion.div>
            ))}
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};
