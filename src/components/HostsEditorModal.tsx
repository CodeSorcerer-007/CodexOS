import { useState, useEffect } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { motion, AnimatePresence } from 'framer-motion';
import { useToast } from '../store/store';

interface HostsEditorModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const HostsEditorModal = ({ isOpen, onClose }: HostsEditorModalProps) => {
  const [content, setContent] = useState('');
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const { success: toastSuccess, error: toastError } = useToast();

  const isWindows = typeof navigator !== 'undefined' && navigator.userAgent.includes('Windows');
  const hostsPath = isWindows ? 'C:\\Windows\\System32\\drivers\\etc\\hosts' : '/etc/hosts';

  useEffect(() => {
    if (isOpen) {
      loadHosts();
    }
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  const loadHosts = async () => {
    setLoading(true);
    try {
      const data = await invoke<string>('read_hosts');
      setContent(data);
    } catch (e: any) {
      toastError('Failed to read hosts file', String(e));
    }
    setLoading(false);
  };

  const saveHosts = async () => {
    setSaving(true);
    try {
      await invoke('write_hosts', { content });
      toastSuccess('Hosts Saved', 'System hosts file updated successfully');
      onClose();
    } catch (e: any) {
      toastError('Failed to save hosts file', String(e));
    }
    setSaving(false);
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
              <h2 className="text-xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-blue-400 to-cyan-400">
                System Hosts Editor
              </h2>
              <p className="text-gray-400 text-sm mt-1">{hostsPath}</p>
            </div>
            <button onClick={onClose} className="text-gray-400 hover:text-white p-2">✕</button>
          </div>

          <div className="flex-1 p-6 flex flex-col relative">
            {loading ? (
              <div className="absolute inset-0 flex items-center justify-center text-cyan animate-pulse">Loading hosts file...</div>
            ) : (
              <textarea
                value={content}
                onChange={e => setContent(e.target.value)}
                className="w-full h-full bg-black/50 border border-white/10 rounded-xl p-4 font-mono text-sm text-gray-300 focus:border-cyan focus:ring-1 focus:ring-cyan outline-none resize-none"
                spellCheck={false}
              />
            )}
          </div>

          <div className="p-6 border-t border-white/10 bg-black/40 flex justify-end gap-4">
            <button 
              onClick={onClose}
              className="px-6 py-2 rounded-lg font-bold text-gray-400 hover:text-white hover:bg-white/5 transition-colors"
            >
              Cancel
            </button>
            <button 
              onClick={saveHosts}
              disabled={saving || loading}
              className="px-6 py-2 rounded-lg font-bold bg-cyan/20 text-cyan border border-cyan/50 hover:bg-cyan/30 transition-all shadow-[0_0_15px_rgba(34,211,238,0.3)] disabled:opacity-50"
            >
              {saving ? 'Saving...' : 'Save & Elevate (UAC)'}
            </button>
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
};
