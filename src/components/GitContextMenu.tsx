import { motion, AnimatePresence } from 'framer-motion';
import { invoke } from '@tauri-apps/api/core';

interface GitContextMenuProps {
  x: number;
  y: number;
  filePath: string;
  repoPath: string;
  onClose: () => void;
  onActionComplete: () => void;
}

export const GitContextMenu = ({ x, y, filePath, repoPath, onClose, onActionComplete }: GitContextMenuProps) => {
  const fileName = filePath.split('\\').pop()?.split('/').pop() || filePath;

  const handleGitAction = async (action: string) => {
    try {
      if (action === 'commit') {
        const msg = prompt('Enter commit message:');
        if (!msg) return onClose();
        await invoke('git_action', { path: repoPath, action, file: fileName, message: msg });
      } else {
        await invoke('git_action', { path: repoPath, action, file: fileName, message: '' });
      }
      onActionComplete();
    } catch (e) {
      console.error(e);
      alert('Git Action Failed: ' + e);
    }
    onClose();
  };

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.95 }}
        transition={{ type: "spring", stiffness: 400, damping: 25 }}
        style={{ left: x, top: y }}
        className="fixed z-[100] w-48 liquid-glass rounded-xl border border-white/10 shadow-2xl py-2 flex flex-col backdrop-blur-xl"
        onMouseLeave={onClose}
      >
        <div className="px-4 py-2 border-b border-white/10 text-xs font-mono text-cyan truncate mb-1">
          {fileName}
        </div>
        <button 
          onClick={() => handleGitAction('add')}
          className="px-4 py-2 text-sm text-left hover:bg-cyan/20 transition-colors text-white flex justify-between"
        >
          <span>Stage File</span>
          <span className="text-gray-500 font-mono text-xs">+</span>
        </button>
        <button 
          onClick={() => handleGitAction('commit')}
          className="px-4 py-2 text-sm text-left hover:bg-cyan/20 transition-colors text-white flex justify-between"
        >
          <span>Commit File</span>
          <span className="text-gray-500 font-mono text-xs">C</span>
        </button>
        <button 
          onClick={() => handleGitAction('push')}
          className="px-4 py-2 text-sm text-left hover:bg-purple-500/20 transition-colors text-purple-200 flex justify-between"
        >
          <span>Git Push</span>
          <span className="text-gray-500 font-mono text-xs">↑</span>
        </button>
      </motion.div>
    </AnimatePresence>
  );
};
