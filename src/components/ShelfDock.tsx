import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

interface ShelfDockProps {
  shelfFiles: string[];
  onRemoveFromShelf: (path: string) => void;
  onClearShelf: () => void;
  onCopyAllHere: () => void;
  onMoveAllHere: () => void;
}

export const ShelfDock = ({ shelfFiles, onRemoveFromShelf, onClearShelf, onCopyAllHere, onMoveAllHere }: ShelfDockProps) => {
  const [isExpanded, setIsExpanded] = useState(false);

  if (shelfFiles.length === 0) return null;

  return (
    <motion.div 
      initial={{ y: 100, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      className={`fixed bottom-4 left-1/2 -translate-x-1/2 z-40 flex flex-col items-center transition-all ${isExpanded ? 'w-[600px]' : 'w-auto'}`}
    >
      <AnimatePresence>
        {isExpanded && (
          <motion.div
            initial={{ opacity: 0, y: 20, height: 0 }}
            animate={{ opacity: 1, y: 0, height: 200 }}
            exit={{ opacity: 0, y: 20, height: 0 }}
            className="w-full bg-[#121212]/90 backdrop-blur-xl border border-white/20 rounded-t-2xl shadow-[0_-10px_30px_rgba(0,0,0,0.5)] overflow-hidden flex flex-col mb-2 liquid-glass"
          >
            <div className="p-3 border-b border-white/10 bg-black/50 flex justify-between items-center">
              <span className="font-bold text-sm text-gray-300">Staged Files ({shelfFiles.length})</span>
              <button onClick={onClearShelf} className="text-xs text-red-400 hover:bg-red-500/20 px-2 py-1 rounded transition-colors">Clear All</button>
            </div>
            
            <div className="flex-1 overflow-y-auto p-2 flex flex-col gap-1">
              {shelfFiles.map(file => (
                <div key={file} className="flex justify-between items-center p-2 hover:bg-white/5 rounded group text-sm font-mono text-gray-400">
                  <span className="truncate mr-4" title={file}>{file}</span>
                  <button 
                    onClick={() => onRemoveFromShelf(file)}
                    className="opacity-0 group-hover:opacity-100 text-red-400 hover:text-red-300 transition-opacity"
                  >
                    ✕
                  </button>
                </div>
              ))}
            </div>

            <div className="p-3 bg-black/50 border-t border-white/10 flex gap-2">
              <button onClick={onCopyAllHere} className="flex-1 bg-cyan/20 hover:bg-cyan/30 text-cyan border border-cyan/50 py-2 rounded font-bold text-sm transition-colors">
                Copy Here
              </button>
              <button onClick={onMoveAllHere} className="flex-1 bg-purple-500/20 hover:bg-purple-500/30 text-purple-400 border border-purple-500/50 py-2 rounded font-bold text-sm transition-colors">
                Move Here
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <motion.button
        whileHover={{ scale: 1.05 }}
        whileTap={{ scale: 0.95 }}
        onClick={() => setIsExpanded(!isExpanded)}
        className="bg-black/80 backdrop-blur-md border border-white/20 px-6 py-3 rounded-full flex items-center gap-3 shadow-2xl hover:bg-black transition-colors"
      >
        <span className="text-xl">🗃️</span>
        <span className="font-bold text-white">The Shelf</span>
        <span className="bg-cyan text-black text-xs font-bold px-2 py-0.5 rounded-full">{shelfFiles.length}</span>
      </motion.button>
    </motion.div>
  );
};
