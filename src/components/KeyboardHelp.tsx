import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Keyboard } from 'lucide-react';

export const KeyboardHelp = () => {
  const [isOpen, setIsOpen] = useState(false);

  useEffect(() => {
    const handler = () => setIsOpen(true);
    window.addEventListener('codexos-show-shortcuts', handler);
    return () => window.removeEventListener('codexos-show-shortcuts', handler);
  }, []);

  useEffect(() => {
    if (!isOpen) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setIsOpen(false);
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [isOpen]);

  if (!isOpen) return null;

  const shortcuts = [
    { keys: 'Ctrl + 1-9', action: 'Navigate to Modules' },
    { keys: 'Ctrl + K / Ctrl + Shift + P', action: 'Open Command Palette' },
    { keys: 'Ctrl + S', action: 'Save File in Code Editor' },
    { keys: 'Ctrl + T', action: 'New Tab' },
    { keys: 'Ctrl + W', action: 'Close Current Tab' },
    { keys: 'Ctrl + ,', action: 'Open Settings' },
    { keys: 'Ctrl + Shift + ?', action: 'Show this Help Menu' },
  ];

  return (
    <AnimatePresence>
      <div
        className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm"
        role="dialog"
        aria-modal="true"
        aria-labelledby="keyboard-help-title"
        onClick={() => setIsOpen(false)}
      >
        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0, scale: 0.95 }}
          className="bg-black border border-white/10 rounded-2xl w-full max-w-lg shadow-2xl overflow-hidden flex flex-col"
          onClick={e => e.stopPropagation()}
        >
          <div className="flex items-center justify-between p-4 border-b border-white/10 bg-white/5">
            <h2 id="keyboard-help-title" className="text-lg font-bold flex items-center gap-2">
              <Keyboard className="text-indigo-400" size={20} aria-hidden="true" />
              Keyboard Shortcuts
            </h2>
            <button
              onClick={() => setIsOpen(false)}
              aria-label="Close keyboard shortcuts"
              className="p-1 hover:bg-white/10 rounded-lg transition-colors text-gray-400 hover:text-white"
            >
              <X size={20} aria-hidden="true" />
            </button>
          </div>

          <div className="p-4 flex flex-col gap-2 bg-black/40">
            {shortcuts.map((s) => (
              <div key={s.keys} className="flex justify-between items-center py-2 px-3 rounded-lg hover:bg-white/5 transition-colors">
                <span className="text-gray-300 font-medium">{s.action}</span>
                <kbd className="text-indigo-400 font-mono text-sm bg-indigo-500/10 px-2 py-1 rounded-md border border-indigo-500/20">
                  {s.keys}
                </kbd>
              </div>
            ))}
          </div>
          
          <div className="p-4 bg-white/5 border-t border-white/10 text-xs text-center text-gray-500">
            Press Esc or click outside to close
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
};
