import { useState, useEffect } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { motion, AnimatePresence } from 'framer-motion';
import { Treemap, ResponsiveContainer, Tooltip } from 'recharts';
import { useToast } from '../store/store';

interface TreeMapOverlayProps {
  isOpen: boolean;
  onClose: () => void;
  currentPath: string | null;
}

interface TreeMapNode {
  name: string;
  size: number;
  children?: TreeMapNode[];
  [key: string]: any;
}

const COLORS = ['#8884d8', '#83a6ed', '#8dd1e1', '#82ca9d', '#a4de6c', '#d0ed57', '#ffc658', '#ff7300', '#ff0000', '#d0ed57'];

const formatBytes = (bytes: number) => {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
};

const CustomizedContent = (props: any) => {
  const { root, depth, x, y, width, height, index, name, size } = props;
  const childrenLen = root?.children?.length || 1;

  return (
    <g>
      <rect
        x={x}
        y={y}
        width={width}
        height={height}
        style={{
          fill: depth < 2 ? COLORS[Math.floor((index / childrenLen) * 6) % COLORS.length] : '#ffffff11',
          stroke: '#fff',
          strokeWidth: 2 / (depth + 1e-10),
          strokeOpacity: 1 / (depth + 1e-10),
        }}
        className="transition-all hover:opacity-80 cursor-pointer"
      />
      {width > 50 && height > 30 && (
        <>
          <text x={x + 4} y={y + 18} fill="#fff" fontSize={14} fontWeight="bold" className="drop-shadow-md truncate max-w-full">
            {name}
          </text>
          <text x={x + 4} y={y + 34} fill="#fff" fontSize={12} fillOpacity={0.9} className="drop-shadow-md">
            {formatBytes(size)}
          </text>
        </>
      )}
    </g>
  );
};

export const TreeMapOverlay = ({ isOpen, onClose, currentPath }: TreeMapOverlayProps) => {
  const [data, setData] = useState<TreeMapNode[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { error: toastError } = useToast();

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
      loadData(currentPath);
    }
  }, [isOpen, currentPath]);

  const loadData = async (path: string) => {
    setLoading(true);
    setError(null);
    try {
      const result = await invoke<TreeMapNode[]>('get_treemap_data', { path, maxDepth: 2 });
      setData(result);
    } catch (e: any) {
      setError(e.toString());
      toastError('TreeMap Scan Failed', String(e));
    }
    setLoading(false);
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
          initial={{ scale: 0.9, y: 20 }}
          animate={{ scale: 1, y: 0 }}
          exit={{ scale: 0.9, y: 20 }}
          className="bg-[#0a0a0a] border border-white/10 rounded-2xl w-full h-full max-w-7xl max-h-[90vh] flex flex-col shadow-2xl overflow-hidden liquid-glass"
        >
          {/* Header */}
          <div className="flex items-center justify-between p-6 border-b border-white/10 bg-black/40">
            <div>
              <h2 className="text-2xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-blue-400 to-emerald-400">
                Disk Space Analyzer
              </h2>
              <p className="text-gray-400 font-mono text-sm mt-1">{currentPath}</p>
            </div>
            <button 
              onClick={onClose}
              className="text-gray-400 hover:text-white p-2 rounded-lg hover:bg-white/10 transition-colors"
            >
              ✕
            </button>
          </div>

          {/* Content */}
          <div className="flex-1 p-6 relative">
            {loading ? (
              <div className="absolute inset-0 flex flex-col items-center justify-center">
                <div className="w-16 h-16 border-4 border-emerald-500/20 border-t-emerald-500 rounded-full animate-spin mb-4" />
                <p className="text-emerald-400 font-mono animate-pulse">Scanning Drive...</p>
              </div>
            ) : error ? (
              <div className="absolute inset-0 flex items-center justify-center text-red-500 font-bold p-8 text-center">
                {error}
              </div>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <Treemap
                  data={data}
                  dataKey="size"
                  aspectRatio={4 / 3}
                  stroke="#fff"
                  fill="#8884d8"
                  content={<CustomizedContent />}
                >
                  <Tooltip 
                    formatter={(value: any) => formatBytes(Number(value))}
                    contentStyle={{ backgroundColor: '#111', borderColor: '#333', borderRadius: '8px' }}
                    itemStyle={{ color: '#fff' }}
                  />
                </Treemap>
              </ResponsiveContainer>
            )}
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
};
