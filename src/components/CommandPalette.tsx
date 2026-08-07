import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Search, ArrowRight } from 'lucide-react';
import { useStore } from '../store/store';
import { SIDEBAR_ITEMS } from '../App';

export const CommandPalette = () => {
  const [isOpen, setIsOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [selectedIndex, setSelectedIndex] = useState(0);

  const { setActiveApp, openWorkspace } = useStore();
  const recentWorkspaces = useStore(s => s.settings.recentWorkspaces || []);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        setIsOpen((prev) => !prev);
      }
      if (e.key === 'Escape') {
        setIsOpen(false);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  const items = SIDEBAR_ITEMS.map((item) => ({
    id: item.id,
    label: item.label,
    icon: item.icon,
    action: () => {
      setActiveApp(item.id as any);
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
    if (!isOpen) return;

    const handleKeyboard = (e: KeyboardEvent) => {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setSelectedIndex((prev) => (prev + 1) % filteredItems.length);
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        setSelectedIndex((prev) => (prev - 1 + filteredItems.length) % filteredItems.length);
      } else if (e.key === 'Enter') {
        e.preventDefault();
        if (filteredItems[selectedIndex]) {
          filteredItems[selectedIndex].action();
        }
      }
    };
    window.addEventListener('keydown', handleKeyboard);
    return () => window.removeEventListener('keydown', handleKeyboard);
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
            className="w-full max-w-2xl bg-[#0a0f18] border border-white/10 rounded-2xl shadow-2xl overflow-hidden flex flex-col"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center px-4 py-4 border-b border-white/10">
              <Search className="w-6 h-6 text-gray-400 mr-3" />
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
                className="flex-1 bg-transparent text-white text-lg focus:outline-none placeholder:text-gray-500"
              />
              <div className="flex items-center gap-1 text-xs text-gray-500">
                <kbd className="px-2 py-1 bg-white/5 rounded border border-white/10 font-mono">ESC</kbd>
                <span>to close</span>
              </div>
            </div>

            <div id="command-palette-results" className="max-h-[60vh] overflow-y-auto p-2" role="listbox" aria-label="Command palette results">
              {filteredItems.length === 0 ? (
                <div className="p-8 text-center text-gray-500" role="status">No results found for "{search}"</div>
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
                      idx === selectedIndex ? 'bg-indigo-500/20 text-indigo-400' : 'text-gray-300 hover:bg-white/5'
                    }`}
                  >
                    <div className="w-8 h-8 flex items-center justify-center bg-black/30 rounded-lg mr-4" aria-hidden="true">
                      {item.icon}
                    </div>
                    <span className="flex-1 font-medium">{item.label}</span>
                    {idx === selectedIndex && <ArrowRight className="w-5 h-5 text-indigo-400" aria-hidden="true" />}
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
