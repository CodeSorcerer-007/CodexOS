import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Unlock, ShieldAlert } from 'lucide-react';
import { invoke } from '@tauri-apps/api/core';
import { useStore } from '../store/store';

export const VaultUnlock = () => {
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [isLocked, setIsLocked] = useState(false);

  const { setVaultLocked } = useStore();

  useEffect(() => {
    const checkLock = async () => {
      try {
        const locked = await invoke<boolean>('is_vault_locked');
        setIsLocked(locked);
        setVaultLocked(locked);
      } catch (e: unknown) {
        console.error('Vault lock check failed', e);
      }
    };
    checkLock();
    // Re-check periodically just in case it locks from backend
    const interval = setInterval(checkLock, 5000);
    return () => clearInterval(interval);
  }, [setVaultLocked]);

  const handleUnlock = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const success = await invoke<boolean>('unlock_vault', { password });
      if (success) {
        setIsLocked(false);
        setVaultLocked(false);
        setPassword('');
      } else {
        setError('Invalid password');
      }
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  };

  return (
    <AnimatePresence>
      {isLocked && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-[100] flex items-center justify-center bg-black/80 backdrop-blur-sm"
          role="dialog"
          aria-modal="true"
          aria-labelledby="vault-unlock-title"
          aria-describedby="vault-unlock-desc"
        >
          <motion.div
            initial={{ scale: 0.9, y: 20 }}
            animate={{ scale: 1, y: 0 }}
            className="w-full max-w-md bg-[#0a0f18] border border-white/10 rounded-2xl p-8 shadow-2xl relative overflow-hidden"
          >
            <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-red-500 via-yellow-500 to-red-500" />
            <div className="flex justify-center mb-6">
              <div className="w-16 h-16 rounded-full bg-red-500/10 flex items-center justify-center" aria-hidden="true">
                <ShieldAlert className="w-8 h-8 text-red-500" />
              </div>
            </div>
            
            <h2 id="vault-unlock-title" className="text-2xl font-bold text-center text-white mb-2">Vault is Locked</h2>
            <p id="vault-unlock-desc" className="text-gray-400 text-center mb-6 text-sm">
              Enter your master password to decrypt your secrets and access sensitive modules. If this is your first time, the password you enter will be set as your master password.
            </p>
            
            <form onSubmit={handleUnlock} className="space-y-4">
              <div>
                <label htmlFor="vault-password" className="sr-only">Master Password</label>
                <input
                  id="vault-password"
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Master Password"
                  autoComplete="new-password"
                  spellCheck={false}
                  className="w-full bg-black/50 border border-white/10 rounded-lg px-4 py-3 text-white placeholder:text-gray-600 focus:outline-none focus:border-red-500 focus:ring-1 focus:ring-red-500 transition-all"
                  autoFocus
                />
              </div>
              
              {error && (
                <div role="alert" className="text-red-400 text-sm text-center">
                  {error}
                </div>
              )}
              
              <button
                type="submit"
                disabled={loading || !password}
                className="w-full bg-red-500 hover:bg-red-600 disabled:opacity-50 text-white rounded-lg px-4 py-3 font-medium transition-colors flex items-center justify-center gap-2"
              >
                {loading ? (
                  <>
                    <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" aria-hidden="true" />
                    <span>Unlocking…</span>
                  </>
                ) : (
                  <>
                    <Unlock className="w-4 h-4" aria-hidden="true" />
                    Unlock Vault
                  </>
                )}
              </button>
            </form>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};
