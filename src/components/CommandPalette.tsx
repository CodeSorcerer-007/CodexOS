import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Search, ArrowRight } from 'lucide-react';
import { useStore } from '../store/store';
import { NAVIGATION_ITEMS, type NavigationItem } from '../config/navigation';

export const CommandPalette = () => {
  const [isOpen, setIsOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [selectedIndex, setSelectedIndex] = useState(0);

  const { setActiveApp, openWorkspace } = useStore();
  const recentWorkspaces = useStore(s => s.settings.recentWorkspaces || []);

  const items = NAVIGATION_ITEMS.map((item: NavigationItem) => ({
    id: item.id,
    label: item.label,
    icon: item.icon,
    action: () => {
      setActiveApp(item.id);
      setIsOpen(false);
      setSearch('');
    },
    group: 'Modules',
  }));

  const workspaceItems = recentWorkspaces.map(w => ({
    id: `workspace-${w.path}`,
    label: `Switch Workspace: ${w.name}`,
    icon: <Search className="w-4 h-4 text-indigo-400" />, // Can use any icon
    action: () => {
      openWorkspace(w.path, w.name);
      setActiveApp('files');
      setIsOpen(false);
      setSearch('');
    },
    group: 'Workspaces',
  }));

  const allItems = [...items, ...workspaceItems];

  const filteredItems = allItems.filter((i) => i.label.toLowerCase().includes(search.toLowerCase()));

  useEffect(() => {
    setSelectedIndex(0);
  }, [search]);

  useEffect(() => {
    if (isOpen && filteredItems[selectedIndex]) {
      const el = document.getElementById(`cp-item-${filteredItems[selectedIndex].id}`);
      if (el) {
        el.scrollIntoView?.({ block: 'nearest' });
      }
    }
  }, [selectedIndex, isOpen, filteredItems]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setIsOpen((prev) => !prev);
        return;
      }

      if (e.key === 'Escape') {
        e.preventDefault();
        setIsOpen(false);
        return;
      }

      if (!isOpen) return;

      if (e.key === 'ArrowDown') {
        e.preventDefault();
        if (filteredItems.length > 0) {
          setSelectedIndex((prev) => (prev + 1) % filteredItems.length);
        }
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        if (filteredItems.length > 0) {
          setSelectedIndex((prev) => (prev - 1 + filteredItems.length) % filteredItems.length);
        }
      } else if (e.key === 'Enter') {
        e.preventDefault();
        if (filteredItems[selectedIndex]) {
          filteredItems[selectedIndex].action();
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, filteredItems, selectedIndex]);

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-50 flex items-start justify-center pt-32 bg-black/60 backdrop-blur-sm"
          onClick={() => setIsOpen(false)}
          role="dialog"
          aria-modal="true"
          aria-label="Command palette"
        >
          <motion.div
            initial={{ scale: 0.95, y: -20 }}
            animate={{ scale: 1, y: 0 }}
            exit={{ scale: 0.95, y: -20 }}
            className="w-full max-w-2xl bg-app-surface border border-app-border rounded-2xl shadow-2xl overflow-hidden flex flex-col"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center px-4 py-4 border-b border-app-border">
              <Search className="w-6 h-6 text-app-text-muted mr-3" />
              <input
                type="text"
                autoFocus
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search commands, modules, or tools..."
                aria-label="Search commands"
                aria-autocomplete="list"
                aria-controls="command-palette-results"
                aria-activedescendant={filteredItems[selectedIndex] ? `cp-item-${filteredItems[selectedIndex].id}` : undefined}
                className="flex-1 bg-transparent text-app-text text-lg focus:outline-none placeholder:text-app-text-muted"
              />
              <div className="flex items-center gap-1 text-xs text-app-text-muted">
                <kbd className="px-2 py-1 bg-black/5 dark:bg-white/5 rounded border border-app-border font-mono">ESC</kbd>
                <span>to close</span>
              </div>
            </div>

            <div id="command-palette-results" className="max-h-[60vh] overflow-y-auto p-2" role="listbox" aria-label="Command palette results">
              {filteredItems.length === 0 ? (
                <div className="p-8 text-center text-app-text-muted" role="status">No results found for "{search}"</div>
              ) : (
                filteredItems.map((item, idx) => (
                  <div
                    key={item.id}
                    id={`cp-item-${item.id}`}
                    role="option"
                    aria-selected={idx === selectedIndex}
                    onMouseEnter={() => setSelectedIndex(idx)}
                    onClick={() => item.action()}
                    className={`flex items-center px-4 py-3 rounded-xl cursor-pointer transition-colors ${
                      idx === selectedIndex ? 'bg-indigo-500/15 text-indigo-500 dark:text-indigo-400 font-medium' : 'text-app-text hover:bg-black/5 dark:hover:bg-white/5'
                    }`}
                  >
                    <div className="w-8 h-8 flex items-center justify-center bg-black/5 dark:bg-black/30 border border-app-border rounded-lg mr-4" aria-hidden="true">
                      {item.icon}
                    </div>
                    <span className="flex-1 font-medium">{item.label}</span>
                    {idx === selectedIndex && <ArrowRight className="w-5 h-5 text-indigo-500 dark:text-indigo-400" aria-hidden="true" />}
                  </div>
                ))
              )}
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};
