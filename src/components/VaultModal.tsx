import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { invoke } from '@tauri-apps/api/core';

interface VaultModalProps {
  isOpen: boolean;
  onClose: () => void;
  targetPath: string | null;
}

export const VaultModal = ({ isOpen, onClose, targetPath }: VaultModalProps) => {
  const [mode, setMode] = useState<'encrypt' | 'decrypt'>('encrypt');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [status, setStatus] = useState<'idle' | 'working' | 'success' | 'error'>('idle');
  const [errorMsg, setErrorMsg] = useState('');

  if (!targetPath) return null;

  const isVaultFile = targetPath.endsWith('.vaultly');

  // Auto-switch mode based on file type
  if (isOpen && mode === 'encrypt' && isVaultFile) setMode('decrypt');
  if (isOpen && mode === 'decrypt' && !isVaultFile) setMode('encrypt');

  const handleAction = async () => {
    if (mode === 'encrypt' && password !== confirmPassword) {
      setErrorMsg("Passwords don't match");
      setStatus('error');
      return;
    }
    
    if (password.length < 4) {
      setErrorMsg("Password too short");
      setStatus('error');
      return;
    }

    setStatus('working');
    try {
      if (mode === 'encrypt') {
        const outPath = targetPath + '.vaultly';
        await invoke('encrypt_vault', { path: targetPath, password, outPath });
      } else {
        const outPath = targetPath.replace('.vaultly', '') + '_decrypted';
        await invoke('decrypt_vault', { path: targetPath, password, outPath });
      }
      setStatus('success');
      setTimeout(() => {
        onClose();
        setStatus('idle');
        setPassword('');
        setConfirmPassword('');
      }, 2000);
    } catch (e: any) {
      setStatus('error');
      setErrorMsg(e.toString());
    }
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div 
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-md"
        >
          <motion.div 
            initial={{ scale: 0.9, y: 20 }}
            animate={{ scale: 1, y: 0 }}
            exit={{ scale: 0.9, y: 20 }}
            className="w-[450px] bg-panel border border-white/10 rounded-2xl p-8 shadow-2xl relative overflow-hidden"
          >
            {/* Background glowing effects */}
            <div className={`absolute top-0 left-0 w-full h-1 ${mode === 'encrypt' ? 'bg-red-500 shadow-[0_0_20px_rgba(239,68,68,0.8)]' : 'bg-green-500 shadow-[0_0_20px_rgba(34,197,94,0.8)]'}`} />
            
            <h2 className="text-2xl font-bold text-white mb-2 tracking-tight">
              {mode === 'encrypt' ? 'Lock into Vault' : 'Unlock from Vault'}
            </h2>
            <p className="text-gray-400 text-sm mb-6 truncate" title={targetPath}>
              Target: <span className="text-gray-300 font-mono text-xs">{targetPath}</span>
            </p>

            <div className="flex flex-col gap-4 mb-6">
              <div>
                <label className="text-xs font-bold text-gray-500 uppercase tracking-widest mb-1 block">Password</label>
                <input 
                  type="password"
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  className="w-full bg-black/50 border border-white/10 rounded-lg p-3 text-white focus:outline-none focus:border-cyan-500 transition-colors"
                  placeholder="Enter vault password"
                />
              </div>
              
              {mode === 'encrypt' && (
                <div>
                  <label className="text-xs font-bold text-gray-500 uppercase tracking-widest mb-1 block">Confirm Password</label>
                  <input 
                    type="password"
                    value={confirmPassword}
                    onChange={e => setConfirmPassword(e.target.value)}
                    className="w-full bg-black/50 border border-white/10 rounded-lg p-3 text-white focus:outline-none focus:border-cyan-500 transition-colors"
                    placeholder="Confirm vault password"
                  />
                </div>
              )}
            </div>

            {status === 'error' && (
              <div className="bg-red-500/20 text-red-400 p-3 rounded-lg mb-6 text-sm border border-red-500/30">
                {errorMsg}
              </div>
            )}

            {status === 'success' && (
              <div className="bg-green-500/20 text-green-400 p-3 rounded-lg mb-6 text-sm border border-green-500/30 text-center font-bold">
                {mode === 'encrypt' ? 'Vault Sealed Successfully!' : 'Vault Unlocked Successfully!'}
              </div>
            )}

            <div className="flex justify-end gap-3 mt-4">
              <button 
                onClick={onClose}
                className="px-5 py-2.5 rounded-xl text-gray-400 hover:text-white transition-colors"
                disabled={status === 'working'}
              >
                Cancel
              </button>
              <button 
                onClick={handleAction}
                disabled={status === 'working'}
                className={`px-6 py-2.5 rounded-xl text-white font-medium transition-all ${
                  mode === 'encrypt' 
                    ? 'bg-red-500/20 border border-red-500/50 hover:bg-red-500/40 hover:shadow-[0_0_15px_rgba(239,68,68,0.4)] text-red-300' 
                    : 'bg-green-500/20 border border-green-500/50 hover:bg-green-500/40 hover:shadow-[0_0_15px_rgba(34,197,94,0.4)] text-green-300'
                } disabled:opacity-50 disabled:cursor-not-allowed`}
              >
                {status === 'working' ? 'Processing...' : mode === 'encrypt' ? 'Seal Vault (AES-256)' : 'Unlock Vault'}
              </button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};
