import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Keyboard } from 'lucide-react';

export const KeyboardHelp = () => {
  const [isOpen, setIsOpen] = useState(false);

  useEffect(() => {
    const handler = () => setIsOpen(true);
    window.addEventListener('vaultly-show-shortcuts', handler);
    return () => window.removeEventListener('vaultly-show-shortcuts', handler);
  }, []);

  if (!isOpen) return null;

  const shortcuts = [
    { keys: 'Ctrl + 1-9', action: 'Navigate to Modules' },
    { keys: 'Ctrl + T', action: 'New Tab' },
    { keys: 'Ctrl + W', action: 'Close Current Tab' },
    { keys: 'Ctrl + ,', action: 'Open Settings' },
    { keys: 'Ctrl + Shift + P', action: 'Open Command Palette (Files)' },
    { keys: 'Ctrl + Shift + ?', action: 'Show this Help Menu' },
  ];

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0, scale: 0.95 }}
          className="bg-black border border-white/10 rounded-2xl w-full max-w-lg shadow-2xl overflow-hidden flex flex-col"
        >
          <div className="flex items-center justify-between p-4 border-b border-white/10 bg-white/5">
            <h2 className="text-lg font-bold flex items-center gap-2">
              <Keyboard className="text-indigo-400" size={20} />
              Keyboard Shortcuts
            </h2>
            <button
              onClick={() => setIsOpen(false)}
              className="p-1 hover:bg-white/10 rounded-lg transition-colors text-gray-400 hover:text-white"
            >
              <X size={20} />
            </button>
          </div>

          <div className="p-4 flex flex-col gap-2 bg-black/40">
            {shortcuts.map((s, i) => (
              <div key={i} className="flex justify-between items-center py-2 px-3 rounded-lg hover:bg-white/5 transition-colors">
                <span className="text-gray-300 font-medium">{s.action}</span>
                <span className="text-indigo-400 font-mono text-sm bg-indigo-500/10 px-2 py-1 rounded-md border border-indigo-500/20">
                  {s.keys}
                </span>
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
