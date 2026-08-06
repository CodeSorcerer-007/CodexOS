import { useState, useEffect } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { motion, AnimatePresence } from 'framer-motion';
import { useToast } from '../store/store';

interface EnvVarModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const EnvVarModal = ({ isOpen, onClose }: EnvVarModalProps) => {
  const [envVars, setEnvVars] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(false);
  
  // Edit state
  const [editingKey, setEditingKey] = useState<string | null>(null);
  const [editValue, setEditValue] = useState<string>('');
  
  // Path list editor state
  const [isPathEditor, setIsPathEditor] = useState(false);
  const [pathList, setPathList] = useState<string[]>([]);

  // Create state
  const [isCreating, setIsCreating] = useState(false);
  const [newKey, setNewKey] = useState('');
  const [newVal, setNewVal] = useState('');

  // Delete state
  const [deleteKeyTarget, setDeleteKeyTarget] = useState<string | null>(null);

  const { error: toastError, success: toastSuccess } = useToast();
  const isWindows = typeof navigator !== 'undefined' && navigator.userAgent.includes('Windows');
  const pathSep = isWindows ? ';' : ':';

  useEffect(() => {
    if (isOpen) {
      loadEnvVars();
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

  const loadEnvVars = async () => {
    setLoading(true);
    try {
      const vars = await invoke<Record<string, string>>('get_env_vars');
      // Sort alphabetically
      const sorted = Object.keys(vars).sort().reduce((acc, key) => {
        acc[key] = vars[key];
        return acc;
      }, {} as Record<string, string>);
      
      setEnvVars(sorted);
    } catch (e: any) {
      console.error("Failed to load env vars:", e);
      toastError("Failed to load env vars", String(e));
    }
    setLoading(false);
  };

  const handleEdit = (key: string, value: string) => {
    setEditingKey(key);
    if (key.toUpperCase() === 'PATH') {
      setIsPathEditor(true);
      setPathList(value.split(pathSep).filter(p => p.trim() !== ''));
    } else {
      setIsPathEditor(false);
      setEditValue(value);
    }
  };

  const handleSave = async () => {
    if (!editingKey) return;
    
    const finalValue = isPathEditor ? pathList.join(pathSep) : editValue;
    
    try {
      await invoke('set_env_var', { name: editingKey, value: finalValue });
      toastSuccess('Variable Saved', editingKey);
      await loadEnvVars();
      setEditingKey(null);
    } catch (e: any) {
      toastError("Failed to save variable", String(e));
    }
  };

  const confirmDelete = async (key: string) => {
    try {
      await invoke('delete_env_var', { name: key });
      toastSuccess('Variable Deleted', key);
      await loadEnvVars();
    } catch (e: any) {
      toastError("Failed to delete variable", String(e));
    } finally {
      setDeleteKeyTarget(null);
    }
  };

  const handleCreateSubmit = async () => {
    if (!newKey.trim()) {
      toastError("Validation Error", "Variable name cannot be empty");
      return;
    }
    try {
      await invoke('set_env_var', { name: newKey.trim(), value: newVal });
      toastSuccess('Variable Created', newKey.trim());
      setIsCreating(false);
      setNewKey('');
      setNewVal('');
      await loadEnvVars();
    } catch (e: any) {
      toastError("Failed to create variable", String(e));
    }
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
          className="bg-[#0a0a0a] border border-white/10 rounded-2xl w-full max-w-4xl max-h-[85vh] flex flex-col shadow-2xl overflow-hidden liquid-glass"
        >
          {/* Header */}
          <div className="flex items-center justify-between p-6 border-b border-white/10 bg-black/40">
            <div>
              <h2 className="text-2xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-emerald-400 to-cyan-400">
                User Environment Variables
              </h2>
              <p className="text-gray-400 font-mono text-sm mt-1">Safely manage your PATHs without fighting the Windows Registry</p>
            </div>
            <div className="flex items-center gap-4">
              <button 
                onClick={() => setIsCreating(true)}
                className="bg-emerald-500/20 text-emerald-400 border border-emerald-500/50 hover:bg-emerald-500/30 px-4 py-2 rounded-lg text-sm font-bold transition-colors"
              >
                + New Variable
              </button>
              <button 
                onClick={onClose}
                className="text-gray-400 hover:text-white p-2 rounded-lg hover:bg-white/10 transition-colors"
              >
                ✕
              </button>
            </div>
          </div>

          {/* Content */}
          <div className="flex-1 overflow-y-auto p-6">
            {loading ? (
              <div className="flex items-center justify-center h-40 text-cyan animate-pulse">Loading...</div>
            ) : (
              <div className="flex flex-col gap-2">
                {Object.entries(envVars).map(([key, value]) => (
                  <div key={key} className="bg-black/30 border border-white/5 rounded-xl p-4 flex flex-col gap-2 group hover:border-white/20 transition-all">
                    <div className="flex justify-between items-start">
                      <h3 className="font-bold text-emerald-300 font-mono text-lg">{key}</h3>
                      <div className="flex gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                        <button 
                          onClick={() => handleEdit(key, value)}
                          className="px-3 py-1 bg-blue-500/20 text-blue-400 rounded hover:bg-blue-500/40 text-sm font-bold"
                        >
                          Edit
                        </button>
                        <button 
                          onClick={() => setDeleteKeyTarget(key)}
                          className="px-3 py-1 bg-red-500/20 text-red-400 rounded hover:bg-red-500/40 text-sm font-bold"
                        >
                          Delete
                        </button>
                      </div>
                    </div>
                    
                    {/* View Mode */}
                    {editingKey !== key && (
                      <div className="text-gray-400 font-mono text-sm break-all">
                        {key.toUpperCase() === 'PATH' ? (
                          <div className="flex flex-col gap-1 mt-2">
                            {value.split(pathSep).filter(p => p).map((p, i) => (
                              <div key={i} className="bg-white/5 px-2 py-1 rounded truncate hover:bg-white/10">
                                {p}
                              </div>
                            ))}
                          </div>
                        ) : (
                          value
                        )}
                      </div>
                    )}

                    {/* Edit Mode */}
                    {editingKey === key && (
                      <div className="mt-4 p-4 bg-black/50 border border-cyan/30 rounded-lg">
                        {isPathEditor ? (
                          <div className="flex flex-col gap-2">
                            <p className="text-xs text-cyan mb-2">Smart Path Editor: No delimiters ({pathSep}) needed!</p>
                            {pathList.map((p, i) => (
                              <div key={i} className="flex gap-2">
                                <input 
                                  type="text" 
                                  value={p} 
                                  onChange={(e) => {
                                    const newList = [...pathList];
                                    newList[i] = e.target.value;
                                    setPathList(newList);
                                  }}
                                  className="flex-1 bg-black/50 border border-white/20 rounded px-3 py-1.5 text-white font-mono text-sm focus:border-cyan outline-none"
                                />
                                <button 
                                  onClick={() => setPathList(pathList.filter((_, idx) => idx !== i))}
                                  className="px-3 py-1 bg-red-500/20 text-red-400 rounded hover:bg-red-500/40"
                                >✕</button>
                              </div>
                            ))}
                            <button 
                              onClick={() => setPathList([...pathList, ''])}
                              className="w-full py-2 border border-dashed border-white/20 text-gray-400 hover:text-white hover:border-white/50 rounded mt-2 transition-colors font-bold"
                            >
                              + Add Path Entry
                            </button>
                          </div>
                        ) : (
                          <textarea 
                            value={editValue}
                            onChange={(e) => setEditValue(e.target.value)}
                            className="w-full bg-black/50 border border-white/20 rounded p-3 text-white font-mono text-sm min-h-[100px] focus:border-cyan outline-none"
                          />
                        )}
                        
                        <div className="flex justify-end gap-3 mt-4">
                          <button 
                            onClick={() => setEditingKey(null)}
                            className="px-4 py-2 text-gray-400 hover:text-white font-bold"
                          >
                            Cancel
                          </button>
                          <button 
                            onClick={handleSave}
                            className="px-6 py-2 bg-cyan text-black rounded-lg font-bold hover:bg-cyan/80 shadow-[0_0_15px_rgba(0,229,255,0.4)]"
                          >
                            Save Changes
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </motion.div>
      </motion.div>

      {/* Create Variable Modal */}
      {isCreating && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
          <div className="bg-[#0a0a0a] border border-white/10 rounded-xl p-6 max-w-md w-full flex flex-col gap-4 shadow-2xl">
            <h3 className="text-xl font-bold text-emerald-400">Create Environment Variable</h3>
            <div className="flex flex-col gap-3">
              <div>
                <label className="text-xs text-gray-400 font-bold block mb-1">Variable Name</label>
                <input
                  type="text"
                  value={newKey}
                  onChange={e => setNewKey(e.target.value)}
                  placeholder="e.g. MY_API_KEY"
                  className="w-full bg-black/50 border border-white/20 rounded px-3 py-2 text-white font-mono text-sm focus:border-emerald-400 outline-none"
                />
              </div>
              <div>
                <label className="text-xs text-gray-400 font-bold block mb-1">Variable Value</label>
                <input
                  type="text"
                  value={newVal}
                  onChange={e => setNewVal(e.target.value)}
                  placeholder="Value..."
                  className="w-full bg-black/50 border border-white/20 rounded px-3 py-2 text-white font-mono text-sm focus:border-emerald-400 outline-none"
                />
              </div>
            </div>
            <div className="flex justify-end gap-3 mt-2">
              <button
                onClick={() => setIsCreating(false)}
                className="px-4 py-2 bg-white/10 hover:bg-white/20 text-white rounded-lg text-sm transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleCreateSubmit}
                className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white font-bold rounded-lg text-sm transition-colors"
              >
                Create
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete Variable Confirm Modal */}
      {deleteKeyTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
          <div className="bg-[#0a0a0a] border border-white/10 rounded-xl p-6 max-w-md w-full flex flex-col gap-4 shadow-2xl">
            <h3 className="text-xl font-bold text-white">Delete Environment Variable</h3>
            <p className="text-gray-300 text-sm">
              Are you sure you want to delete <span className="font-mono text-emerald-300 font-bold">{deleteKeyTarget}</span>?
            </p>
            <div className="flex justify-end gap-3 mt-2">
              <button
                onClick={() => setDeleteKeyTarget(null)}
                className="px-4 py-2 bg-white/10 hover:bg-white/20 text-white rounded-lg text-sm transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={() => confirmDelete(deleteKeyTarget)}
                className="px-4 py-2 bg-red-600 hover:bg-red-500 text-white font-bold rounded-lg text-sm transition-colors"
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      )}
    </AnimatePresence>
  );
};
