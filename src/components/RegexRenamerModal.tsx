import { motion, AnimatePresence } from 'framer-motion';
import { useState, useEffect } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { useToast } from '../store/store';

interface RegexRenamerModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentPath: string | null;
}

interface PreviewItem {
  oldName: string;
  newName: string;
}

export const RegexRenamerModal = ({ isOpen, onClose, currentPath }: RegexRenamerModalProps) => {
  const [pattern, setPattern] = useState('(.*)\\.txt');
  const [replacement, setReplacement] = useState('$1_old.txt');
  const [results, setResults] = useState<string[]>([]);
  const [previews, setPreviews] = useState<PreviewItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [previewing, setPreviewing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { success: toastSuccess, error: toastError } = useToast();

  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  const handlePreview = async () => {
    if (!currentPath) return;
    setPreviewing(true);
    setError(null);
    try {
      const files = await invoke<Array<{ name: string }>>('get_files_in_dir', { path: currentPath });
      const reg = new RegExp(pattern);
      const matches: PreviewItem[] = [];
      for (const f of files) {
        if (reg.test(f.name)) {
          matches.push({
            oldName: f.name,
            newName: f.name.replace(reg, replacement)
          });
        }
      }
      setPreviews(matches);
      if (matches.length === 0) {
        toastError('Preview Warning', 'No files in current folder match regex pattern');
      }
    } catch (e: any) {
      setError(String(e));
      toastError('Preview Failed', String(e));
    } finally {
      setPreviewing(false);
    }
  };

  const handleRun = async () => {
    if (!currentPath) return;
    setLoading(true);
    setError(null);
    try {
      const res = await invoke<string[]>('bulk_rename', { path: currentPath, pattern, replacement });
      setResults(res);
      toastSuccess('Bulk Rename Complete', `Successfully renamed ${res.length} files`);
    } catch (e: any) {
      setError(String(e));
      toastError('Rename Execution Failed', String(e));
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

              <div className="flex gap-3 mt-2">
                <button 
                  onClick={handlePreview}
                  disabled={previewing || loading || !currentPath}
                  className="flex-1 py-3 bg-purple-500/20 hover:bg-purple-500/30 text-purple-300 font-bold tracking-wider rounded-lg border border-purple-500/50 transition-all uppercase disabled:opacity-50"
                >
                  {previewing ? 'Previewing...' : 'Preview Matches'}
                </button>
                <button 
                  onClick={handleRun}
                  disabled={loading || !currentPath}
                  className="flex-1 py-3 bg-pink-500/20 hover:bg-pink-500/30 text-pink-400 font-bold tracking-wider rounded-lg border border-pink-500/50 transition-all uppercase disabled:opacity-50"
                >
                  {loading ? 'Executing...' : 'Execute Rename'}
                </button>
              </div>
            </div>

            {previews.length > 0 && results.length === 0 && (
              <div className="flex flex-col gap-2 mt-2">
                <h3 className="text-xs font-bold text-purple-300 uppercase tracking-wider">Dry-Run Preview ({previews.length} matches):</h3>
                <div className="max-h-40 overflow-y-auto bg-black/40 rounded-lg border border-purple-500/20 p-3 flex flex-col gap-1">
                  {previews.map((item, i) => (
                    <div key={i} className="text-xs font-mono flex items-center justify-between border-b border-white/5 py-1 last:border-0">
                      <span className="text-gray-400 truncate max-w-[240px]">{item.oldName}</span>
                      <span className="text-purple-400">→</span>
                      <span className="text-cyan-300 font-bold truncate max-w-[240px]">{item.newName}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

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
