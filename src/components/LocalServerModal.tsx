import { useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { QRCodeSVG } from 'qrcode.react';

interface LocalServerModalProps {
  isOpen: boolean;
  onClose: () => void;
  serverUrl: string | null;
  path: string | null;
}

export const LocalServerModal = ({ isOpen, onClose, serverUrl, path }: LocalServerModalProps) => {
  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);
  return (
    <AnimatePresence>
      {isOpen && serverUrl && (
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
            className="w-[450px] liquid-glass rounded-3xl p-8 border border-white/20 shadow-[0_0_50px_rgba(0,229,255,0.2)] relative overflow-hidden flex flex-col gap-6 items-center text-center"
            onClick={e => e.stopPropagation()}
          >
            <div className="absolute top-4 right-4">
              <button onClick={onClose} className="text-gray-400 hover:text-white transition-colors">ESC</button>
            </div>

            <div>
              <h2 className="text-2xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-cyan to-blue-500 mb-2">Server Running</h2>
              <p className="text-sm text-gray-400 font-mono break-all">{path}</p>
            </div>

            <div className="bg-white p-4 rounded-xl shadow-inner">
              <QRCodeSVG value={serverUrl} size={200} />
            </div>

            <div className="w-full bg-black/30 rounded-lg p-3 border border-white/5 flex items-center justify-between">
              <span className="font-mono text-cyan text-sm">{serverUrl}</span>
              <button 
                onClick={() => navigator.clipboard.writeText(serverUrl)}
                className="text-xs bg-white/10 hover:bg-white/20 px-3 py-1.5 rounded transition-colors"
              >
                Copy
              </button>
            </div>
            
            <p className="text-xs text-gray-500">Scan to preview on your mobile device instantly.</p>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};
