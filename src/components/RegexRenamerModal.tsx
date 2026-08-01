import { motion, AnimatePresence } from 'framer-motion';
import { useState } from 'react';
import { invoke } from '@tauri-apps/api/core';

interface RegexRenamerModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentPath: string | null;
}

export const RegexRenamerModal = ({ isOpen, onClose, currentPath }: RegexRenamerModalProps) => {
  const [pattern, setPattern] = useState('(.*)\\.txt');
  const [replacement, setReplacement] = useState('$1_old.txt');
  const [results, setResults] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleRun = async () => {
    if (!currentPath) return;
    setLoading(true);
    setError(null);
    try {
      const res = await invoke<string[]>('bulk_rename', { path: currentPath, pattern, replacement });
      setResults(res);
    } catch (e) {
      setError(String(e));
    } finally {
      setLoading(false);
    }
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div 
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-md"
          onClick={onClose}
        >
          <motion.div 
            initial={{ scale: 0.9, y: 20 }}
            animate={{ scale: 1, y: 0 }}
            exit={{ scale: 0.9, y: 20 }}
            transition={{ type: "spring", stiffness: 300, damping: 25 }}
            className="w-[600px] liquid-glass rounded-3xl p-8 border border-white/20 shadow-[0_0_50px_rgba(255,0,255,0.2)] relative flex flex-col gap-6"
            onClick={e => e.stopPropagation()}
          >
            <div className="flex justify-between items-center">
              <div>
                <h2 className="text-2xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-pink-500 to-purple-500">Bulk Regex Renamer</h2>
                <p className="text-sm text-gray-400 font-mono mt-1">{currentPath}</p>
              </div>
              <button onClick={onClose} className="text-gray-400 hover:text-white transition-colors">ESC</button>
            </div>

            <div className="flex flex-col gap-4">
              <div>
                <label className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-1 block">Regex Pattern</label>
                <input 
                  type="text" 
                  value={pattern}
                  onChange={(e) => setPattern(e.target.value)}
                  className="w-full bg-black/50 border border-white/10 rounded-lg px-4 py-2 text-sm font-mono focus:outline-none focus:border-pink-500 transition-colors text-pink-400"
                  placeholder="(.*)\.txt"
                />
              </div>
              
              <div>
                <label className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-1 block">Replacement (use $1, $2 for capture groups)</label>
                <input 
                  type="text" 
                  value={replacement}
                  onChange={(e) => setReplacement(e.target.value)}
                  className="w-full bg-black/50 border border-white/10 rounded-lg px-4 py-2 text-sm font-mono focus:outline-none focus:border-cyan transition-colors text-cyan"
                  placeholder="$1_old.txt"
                />
              </div>

              <button 
                onClick={handleRun}
                disabled={loading || !currentPath}
                className="mt-2 w-full py-3 bg-pink-500/20 hover:bg-pink-500/30 text-pink-400 font-bold tracking-widest rounded-lg border border-pink-500/50 transition-all uppercase disabled:opacity-50"
              >
                {loading ? 'Executing...' : 'Execute Rename'}
              </button>
            </div>

            {error && <div className="text-red-400 text-xs font-mono bg-red-500/10 p-3 rounded-lg border border-red-500/20">{error}</div>}

            {results.length > 0 && (
              <div className="flex flex-col gap-2 mt-2">
                <h3 className="text-xs font-bold text-green-400 uppercase tracking-wider">Successfully Renamed {results.length} Files:</h3>
                <div className="max-h-48 overflow-y-auto bg-black/30 rounded-lg border border-white/5 p-3">
                  {results.map((r, i) => (
                    <div key={i} className="text-xs font-mono text-gray-300 py-1 border-b border-white/5 last:border-0 truncate">
                      {r}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};
