import { useState, useEffect } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { motion, AnimatePresence } from 'framer-motion';

interface HashVerifyModalProps {
  isOpen: boolean;
  onClose: () => void;
  filePath: string | null;
}

export const HashVerifyModal = ({ isOpen, onClose, filePath }: HashVerifyModalProps) => {
  const [algorithm, setAlgorithm] = useState<'md5' | 'sha256'>('sha256');
  const [hash, setHash] = useState<string | null>(null);
  const [expectedHash, setExpectedHash] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen && filePath) {
      calculateHash();
    } else {
      setHash(null);
      setExpectedHash('');
      setError(null);
    }
  }, [isOpen, filePath, algorithm]);

  const calculateHash = async () => {
    if (!filePath) return;
    setLoading(true);
    setError(null);
    try {
      const result = await invoke<string>('calculate_hash', { path: filePath, algorithm });
      setHash(result);
    } catch (e) {
      setError(String(e));
    }
    setLoading(false);
  };

  const getMatchStatus = () => {
    if (!hash || !expectedHash) return null;
    return hash.toLowerCase() === expectedHash.toLowerCase().trim();
  };

  const matchStatus = getMatchStatus();

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
          className="bg-[#0a0a0a] border border-white/10 rounded-2xl w-full max-w-2xl shadow-2xl overflow-hidden liquid-glass flex flex-col"
        >
          <div className="p-6 border-b border-white/10 bg-black/40 flex justify-between items-center">
            <div>
              <h2 className="text-xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-orange-400 to-red-400">
                File Integrity Checker
              </h2>
              <p className="text-gray-400 font-mono text-xs mt-1 truncate max-w-lg" title={filePath || ''}>
                {filePath}
              </p>
            </div>
            <button onClick={onClose} className="text-gray-400 hover:text-white p-2">✕</button>
          </div>

          <div className="p-6 flex flex-col gap-6">
            <div className="flex gap-4">
              <button 
                onClick={() => setAlgorithm('md5')}
                className={`flex-1 py-2 rounded-lg font-bold transition-all ${algorithm === 'md5' ? 'bg-orange-500/20 text-orange-400 border border-orange-500/50' : 'bg-black/30 text-gray-500 border border-white/5 hover:bg-black/50'}`}
              >
                MD5
              </button>
              <button 
                onClick={() => setAlgorithm('sha256')}
                className={`flex-1 py-2 rounded-lg font-bold transition-all ${algorithm === 'sha256' ? 'bg-orange-500/20 text-orange-400 border border-orange-500/50' : 'bg-black/30 text-gray-500 border border-white/5 hover:bg-black/50'}`}
              >
                SHA-256
              </button>
            </div>

            <div className="flex flex-col gap-2">
              <label className="text-xs text-gray-400 font-bold uppercase tracking-wider">Calculated Hash</label>
              <div className="bg-black/50 border border-white/10 rounded-lg p-4 font-mono text-sm break-all text-white relative">
                {loading ? (
                  <span className="text-orange-400 animate-pulse">Streaming file natively & calculating...</span>
                ) : error ? (
                  <span className="text-red-400">{error}</span>
                ) : (
                  hash
                )}
              </div>
            </div>

            <div className="flex flex-col gap-2">
              <label className="text-xs text-gray-400 font-bold uppercase tracking-wider">Expected Hash (Paste to compare)</label>
              <input 
                type="text" 
                value={expectedHash}
                onChange={e => setExpectedHash(e.target.value)}
                placeholder={`Paste expected ${algorithm.toUpperCase()} hash here...`}
                className="bg-black/50 border border-white/10 rounded-lg p-4 font-mono text-sm text-white w-full focus:border-orange-500 outline-none transition-colors"
              />
            </div>

            {matchStatus !== null && (
              <motion.div 
                initial={{ opacity: 0, y: -10 }}
                animate={{ opacity: 1, y: 0 }}
                className={`p-4 rounded-lg flex items-center justify-center font-bold gap-2 ${matchStatus ? 'bg-green-500/20 text-green-400 border border-green-500/30' : 'bg-red-500/20 text-red-400 border border-red-500/30'}`}
              >
                {matchStatus ? '✅ HASH MATCHES PERFECTLY' : '❌ HASH MISMATCH DETECTED'}
              </motion.div>
            )}
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
};
