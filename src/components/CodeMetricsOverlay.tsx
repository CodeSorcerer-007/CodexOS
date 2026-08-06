import { motion, AnimatePresence } from 'framer-motion';
import { invoke } from '@tauri-apps/api/core';
import { useState, useEffect } from 'react';
import { useStore } from '../store/store';

interface CodeMetrics {
  total_files: number;
  total_lines: number;
  languages: Record<string, number>;
}

interface CodeMetricsOverlayProps {
  isOpen: boolean;
  onClose: () => void;
  currentPath: string | null;
}

const colorMap: Record<string, string> = {
  'ts': '#3178c6',
  'tsx': '#3178c6',
  'js': '#f7df1e',
  'jsx': '#f7df1e',
  'rs': '#dea584',
  'css': '#264de4',
  'html': '#e34f26',
  'json': '#f59e0b',
  'toml': '#9c4221',
};

export const CodeMetricsOverlay = ({ isOpen, onClose, currentPath }: CodeMetricsOverlayProps) => {
  const [metrics, setMetrics] = useState<CodeMetrics | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  useEffect(() => {
    if (isOpen && currentPath) {
      setLoading(true);
      invoke<CodeMetrics>('get_code_metrics', { path: currentPath })
        .then(res => setMetrics(res))
        .catch(e => {
          console.error(e);
          useStore.getState().addToast({ type: 'error', title: 'Metrics Scan Failed', message: String(e) });
        })
        .finally(() => setLoading(false));
    }
  }, [isOpen, currentPath]);

  const totalLines = metrics?.total_lines || 1; // Prevent div by zero
  const sortedLangs = metrics ? Object.entries(metrics.languages).sort((a, b) => b[1] - a[1]) : [];

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
            className="w-[600px] liquid-glass rounded-3xl p-8 border border-white/20 shadow-[0_0_50px_rgba(0,0,0,0.5)] relative overflow-hidden flex flex-col gap-6"
            onClick={e => e.stopPropagation()}
          >
            <div className="flex justify-between items-center">
              <h2 className="text-2xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-cyan to-purple-500">Project Telemetry</h2>
              <button onClick={onClose} className="text-gray-400 hover:text-white transition-colors">ESC</button>
            </div>

            {loading ? (
              <div className="h-64 flex items-center justify-center text-cyan animate-pulse">
                Scanning Project Files...
              </div>
            ) : !metrics ? (
              <div className="h-64 flex items-center justify-center text-red-400">
                Failed to load metrics.
              </div>
            ) : (
              <>
                <div className="grid grid-cols-2 gap-4">
                  <div className="bg-white/5 border border-white/10 rounded-xl p-6 flex flex-col items-center justify-center gap-2 shadow-inner">
                    <span className="text-5xl font-black text-cyan">{metrics.total_lines.toLocaleString()}</span>
                    <span className="text-xs text-gray-400 font-bold tracking-widest uppercase">Total Lines of Code</span>
                  </div>
                  <div className="bg-white/5 border border-white/10 rounded-xl p-6 flex flex-col items-center justify-center gap-2 shadow-inner">
                    <span className="text-5xl font-black text-purple-400">{metrics.total_files.toLocaleString()}</span>
                    <span className="text-xs text-gray-400 font-bold tracking-widest uppercase">Total Files</span>
                  </div>
                </div>

                <div className="flex flex-col gap-3 mt-4">
                  <h3 className="text-sm font-bold text-gray-300">Language Breakdown</h3>
                  
                  {/* Progress Bar Chart */}
                  <div className="h-4 w-full rounded-full overflow-hidden flex bg-white/5 shadow-inner">
                    {sortedLangs.map(([lang, lines]) => {
                      const percentage = (lines / totalLines) * 100;
                      return (
                        <div 
                          key={lang} 
                          style={{ width: `${percentage}%`, backgroundColor: colorMap[lang] || '#888' }}
                          className="h-full hover:brightness-125 transition-all"
                          title={`${lang}: ${percentage.toFixed(1)}%`}
                        />
                      );
                    })}
                  </div>
                  
                  {/* Legend */}
                  <div className="flex flex-wrap gap-4 mt-2">
                    {sortedLangs.map(([lang, lines]) => (
                      <div key={lang} className="flex items-center gap-2 text-xs font-mono">
                        <div className="w-3 h-3 rounded-full" style={{ backgroundColor: colorMap[lang] || '#888' }} />
                        <span className="text-gray-300">{lang}</span>
                        <span className="text-gray-500">{(lines / totalLines * 100).toFixed(1)}%</span>
                      </div>
                    ))}
                  </div>
                </div>
              </>
            )}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};
