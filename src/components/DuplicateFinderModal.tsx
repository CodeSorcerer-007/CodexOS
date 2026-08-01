import { useState, useEffect } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { motion, AnimatePresence } from 'framer-motion';

interface DuplicateGroup {
  hash: string;
  files: string[];
  size: number;
}

interface DuplicateFinderModalProps {
  isOpen: boolean;
  onClose: () => void;
  targetPath: string;
}

export const DuplicateFinderModal = ({ isOpen, onClose, targetPath }: DuplicateFinderModalProps) => {
  const [duplicates, setDuplicates] = useState<DuplicateGroup[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  
  useEffect(() => {
    if (isOpen) {
      scanForDuplicates();
    }
  }, [isOpen, targetPath]);

  const scanForDuplicates = async () => {
    if (!targetPath) return;
    setLoading(true);
    setError(null);
    try {
      const result = await invoke<DuplicateGroup[]>('find_duplicates', { path: targetPath });
      setDuplicates(result);
    } catch (e) {
      setError(String(e));
    }
    setLoading(false);
  };

  const handleDelete = async (file: string) => {
    if (!confirm(`Are you sure you want to permanently delete:\n${file}`)) return;
    try {
      await invoke('delete_file', { path: file });
      // Remove from UI manually to avoid full re-scan
      setDuplicates(prev => prev.map(group => ({
        ...group,
        files: group.files.filter(f => f !== file)
      })).filter(group => group.files.length > 1));
    } catch (e) {
      alert(`Failed to delete: ${e}`);
    }
  };

  const formatSize = (bytes: number) => {
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    if (bytes === 0) return '0 B';
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  if (!isOpen) return null;

  return (
    <AnimatePresence>
      <motion.div 
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm"
      >
        <motion.div 
          initial={{ scale: 0.95, y: 20 }}
          animate={{ scale: 1, y: 0 }}
          exit={{ scale: 0.95, y: 20 }}
          className="bg-[#0a0a0a] border border-white/10 rounded-2xl w-full max-w-4xl h-[80vh] shadow-2xl overflow-hidden liquid-glass flex flex-col"
        >
          <div className="p-6 border-b border-white/10 bg-black/40 flex justify-between items-center">
            <div>
              <h2 className="text-xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-red-400 to-orange-400 flex items-center gap-2">
                👯 Duplicate Asset Finder
              </h2>
              <p className="text-gray-400 text-sm mt-1">Scanning: {targetPath}</p>
            </div>
            <button onClick={onClose} className="text-gray-400 hover:text-white p-2">✕</button>
          </div>

          <div className="flex-1 overflow-y-auto p-6 flex flex-col gap-6">
            {loading ? (
              <div className="flex flex-col items-center justify-center h-full text-orange-400 animate-pulse">
                <div className="text-4xl mb-4">🔍</div>
                <p>Hashing files in background...</p>
                <p className="text-xs text-gray-500 mt-2">This may take a while depending on folder size</p>
              </div>
            ) : error ? (
              <div className="text-red-400 text-center">{error}</div>
            ) : duplicates.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-full text-green-400">
                <div className="text-4xl mb-4">✨</div>
                <p>No identical files found!</p>
              </div>
            ) : (
              duplicates.map((group, idx) => (
                <div key={idx} className="bg-black/30 border border-white/10 rounded-xl overflow-hidden">
                  <div className="p-4 bg-black/50 border-b border-white/5 flex justify-between items-center">
                    <div className="flex items-center gap-3">
                      <span className="bg-orange-500/20 text-orange-400 px-2 py-1 rounded text-xs font-bold font-mono">
                        {group.hash.substring(0, 8)}...
                      </span>
                      <span className="text-gray-300 text-sm">{group.files.length} identical copies</span>
                    </div>
                    <span className="text-gray-400 text-sm font-bold">{formatSize(group.size)} each</span>
                  </div>
                  <div className="p-2">
                    {group.files.map((file, fidx) => (
                      <div key={fidx} className="flex justify-between items-center p-2 hover:bg-white/5 rounded-lg group transition-colors">
                        <span className="text-gray-400 text-sm font-mono truncate mr-4" title={file}>{file}</span>
                        <button 
                          onClick={() => handleDelete(file)}
                          className="px-3 py-1 rounded bg-red-500/20 text-red-400 hover:bg-red-500/40 opacity-0 group-hover:opacity-100 transition-opacity text-xs font-bold whitespace-nowrap"
                        >
                          Delete
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              ))
            )}
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
};
