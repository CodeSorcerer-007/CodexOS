import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { invoke } from '@tauri-apps/api/core';
import { useToast } from '../store/store';

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
  const [isCommitting, setIsCommitting] = useState(false);
  const [commitMsg, setCommitMsg] = useState('');
  const { success: toastSuccess, error: toastError } = useToast();

  const handleGitAction = async (action: string, customMsg: string = '') => {
    try {
      if (action === 'commit' && !customMsg) {
        setIsCommitting(true);
        return;
      }
      await invoke('git_action', { path: repoPath, action, file: fileName, message: customMsg });
      toastSuccess('Git Action Succeeded', `Executed ${action} on ${fileName}`);
      onActionComplete();
      onClose();
    } catch (e: unknown) {
      console.error(e);
      toastError('Git Action Failed', e instanceof Error ? e.message : String(e));
      onClose();
    }
  };

  const handleCommitSubmit = async () => {
    if (!commitMsg.trim()) {
      toastError('Validation Error', 'Commit message cannot be empty');
      return;
    }
    await handleGitAction('commit', commitMsg.trim());
  };

  return (
    <AnimatePresence>
      {!isCommitting ? (
        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0, scale: 0.95 }}
          transition={{ type: "spring", stiffness: 400, damping: 25 }}
          style={{ left: x, top: y }}
          className="fixed z-[100] w-48 liquid-glass rounded-xl border border-white/10 shadow-2xl py-2 flex flex-col backdrop-blur-xl"
          onMouseLeave={() => !isCommitting && onClose()}
        >
          <div className="px-4 py-2 border-b border-white/10 text-xs font-mono text-cyan-400 truncate mb-1">
            {fileName}
          </div>
          <button 
            onClick={() => handleGitAction('add')}
            className="px-4 py-2 text-sm text-left hover:bg-cyan-500/20 transition-colors text-white flex justify-between"
          >
            <span>Stage File</span>
            <span className="text-gray-500 font-mono text-xs">+</span>
          </button>
          <button 
            onClick={() => setIsCommitting(true)}
            className="px-4 py-2 text-sm text-left hover:bg-cyan-500/20 transition-colors text-white flex justify-between"
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
      ) : (
        <div className="fixed inset-0 z-[110] flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
          <div className="bg-panel border border-white/10 rounded-xl p-6 max-w-md w-full flex flex-col gap-4 shadow-2xl">
            <h3 className="text-xl font-bold text-white">Commit File</h3>
            <p className="text-gray-400 text-xs font-mono">Target: {fileName}</p>
            <input
              type="text"
              autoFocus
              value={commitMsg}
              onChange={e => setCommitMsg(e.target.value)}
              onKeyDown={e => {
                if (e.key === 'Enter') handleCommitSubmit();
                if (e.key === 'Escape') onClose();
              }}
              placeholder="Enter commit message..."
              className="w-full bg-black/50 border border-white/20 rounded px-3 py-2 text-white font-mono text-sm focus:border-cyan-500 outline-none"
            />
            <div className="flex justify-end gap-3 mt-2">
              <button
                onClick={onClose}
                className="px-4 py-2 bg-white/10 hover:bg-white/20 text-white rounded-lg text-sm transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleCommitSubmit}
                className="px-4 py-2 bg-cyan-500 hover:bg-cyan-400 text-black font-bold rounded-lg text-sm transition-colors"
              >
                Commit
              </button>
            </div>
          </div>
        </div>
      )}
    </AnimatePresence>
  );
};
