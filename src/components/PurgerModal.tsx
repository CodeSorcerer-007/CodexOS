import { motion, AnimatePresence } from 'framer-motion';
import { useState, useEffect } from 'react';
import { invoke } from '@tauri-apps/api/core';

interface BloatItem {
  path: string;
  size_mb: number;
}

const springPhysics = { type: "spring" as const, stiffness: 300, damping: 25 };

export const PurgerModal = ({ isOpen, onClose }: { isOpen: boolean, onClose: () => void }) => {
  const [items, setItems] = useState<BloatItem[]>([]);
  const [scanning, setScanning] = useState(false);
  const [selectedPaths, setSelectedPaths] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (isOpen) {
      scanBloat();
    }
  }, [isOpen]);

  const scanBloat = async () => {
    setScanning(true);
    setItems([]);
    try {
      const currentDir = await invoke<string>('get_current_dir');
      const result = await invoke<BloatItem[]>('scan_dev_bloat', { path: currentDir });
      setItems(result);
      setSelectedPaths(new Set(result.map(i => i.path)));
    } catch (e) {
      console.error(e);
    }
    setScanning(false);
  };

  const handleToggle = (path: string) => {
    const newPaths = new Set(selectedPaths);
    if (newPaths.has(path)) {
      newPaths.delete(path);
    } else {
      newPaths.add(path);
    }
    setSelectedPaths(newPaths);
  };

  const handlePurge = async () => {
    if (selectedPaths.size === 0) return;
    try {
      await invoke('purge_directories', { paths: Array.from(selectedPaths) });
      setItems(items.filter(i => !selectedPaths.has(i.path)));
      setSelectedPaths(new Set());
    } catch (e) {
      console.error(e);
    }
  };

  const totalSaved = items.filter(i => selectedPaths.has(i.path)).reduce((sum, i) => sum + i.size_mb, 0);

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div 
          initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm"
          onClick={onClose}
        >
          <motion.div 
            initial={{ scale: 0.9, y: 20, opacity: 0 }} animate={{ scale: 1, y: 0, opacity: 1 }} exit={{ scale: 0.9, y: 20, opacity: 0 }}
            transition={springPhysics}
            className="w-3/4 max-w-2xl h-[30rem] liquid-glass rounded-2xl overflow-hidden flex flex-col border border-white/20 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="h-14 bg-red-500/20 border-b border-red-500/30 flex items-center justify-between px-6">
              <span className="font-bold text-red-400 text-lg flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-red-400 animate-pulse"></span>
                Dependency Purger
              </span>
              <button onClick={onClose} className="text-gray-400 hover:text-white transition-colors">ESC</button>
            </div>
            
            <div className="flex-1 overflow-y-auto p-6 flex flex-col gap-3">
              {scanning ? (
                <div className="flex-1 flex flex-col items-center justify-center text-cyan animate-pulse">
                  <div className="text-xl font-bold mb-2">Scanning Drive for Bloat...</div>
                  <div className="text-sm text-gray-400">Searching for node_modules, target, bin, obj</div>
                </div>
              ) : items.length === 0 ? (
                <div className="flex-1 flex items-center justify-center text-gray-400">
                  No dev bloat found!
                </div>
              ) : (
                items.map(item => (
                  <label key={item.path} className="flex items-center justify-between p-4 bg-black/20 rounded-xl border border-white/5 cursor-pointer hover:bg-white/5 transition-colors">
                    <div className="flex items-center gap-4">
                      <input 
                        type="checkbox" 
                        checked={selectedPaths.has(item.path)} 
                        onChange={() => handleToggle(item.path)}
                        className="w-5 h-5 accent-red-500 bg-transparent border-gray-600 rounded"
                      />
                      <span className="font-mono text-sm text-gray-300 break-all">{item.path}</span>
                    </div>
                    <span className="font-bold text-red-400 ml-4 whitespace-nowrap">{item.size_mb} MB</span>
                  </label>
                ))
              )}
            </div>

            <div className="h-20 bg-black/40 border-t border-white/10 px-6 flex items-center justify-between">
              <div className="flex flex-col">
                <span className="text-sm text-gray-400">Total space to reclaim</span>
                <span className="text-xl font-bold text-red-400">{totalSaved} MB</span>
              </div>
              <button 
                onClick={handlePurge}
                disabled={selectedPaths.size === 0 || scanning}
                className="px-6 py-3 bg-red-500/20 hover:bg-red-500/40 text-red-400 border border-red-500/30 rounded-xl font-bold transition-all disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Move to Recycle Bin
              </button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};
