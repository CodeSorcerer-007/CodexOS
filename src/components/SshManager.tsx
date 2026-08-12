import { useState, useEffect } from 'react';
import { useStore, useToast } from '../store/store';
import { Server, Plus, Play, Trash2 } from 'lucide-react';
import { motion } from 'framer-motion';
import { VaultUnlock } from './VaultUnlock';

interface SshConnection {
  id: string;
  name: string;
  connectionStr: string;
  path: string;
}

export const SshManager = () => {
  const [connections, setConnections] = useState<SshConnection[]>([]);
  const { setCurrentPath, setActiveApp } = useStore.getState();
  const { success: toastSuccess } = useToast();

  useEffect(() => {
    const saved = localStorage.getItem('codexos-ssh');
    if (saved) {
      try {
        setConnections(JSON.parse(saved));
      } catch {}
    }
  }, []);

  useEffect(() => {
    localStorage.setItem('codexos-ssh', JSON.stringify(connections));
  }, [connections]);

  const handleAdd = () => {
    const id = crypto.randomUUID();
    setConnections([...connections, { id, name: 'Production Server', connectionStr: 'root@192.168.1.100', path: '/var/www' }]);
  };

  const handleConnect = (conn: SshConnection) => {
    const fullPath = `ssh://${conn.connectionStr}${conn.path}`;
    setCurrentPath(fullPath);
    setActiveApp('files');
    toastSuccess('Connecting to SSH', `Target: ${conn.connectionStr}`);
  };

  const handleDelete = (id: string) => {
    setConnections(connections.filter(c => c.id !== id));
  };

  const updateConn = (id: string, updates: Partial<SshConnection>) => {
    setConnections(prev => prev.map(c => c.id === id ? { ...c, ...updates } : c));
  };

  return (
    <div className="flex flex-col h-full w-full bg-[#050505] text-white p-8 overflow-y-auto">
      <VaultUnlock />
      <div className="max-w-4xl mx-auto w-full">
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-3xl font-bold bg-gradient-to-r from-blue-400 to-indigo-400 bg-clip-text text-transparent flex items-center gap-3">
              <Server className="w-8 h-8 text-blue-400" />
              SSH Remote Development
            </h1>
            <p className="text-gray-400 mt-2">Connect to remote servers and edit files natively</p>
          </div>
          <button 
            onClick={handleAdd}
            className="flex items-center gap-2 px-4 py-2 bg-blue-500/20 hover:bg-blue-500/30 text-blue-300 rounded border border-blue-500/30 transition-all"
          >
            <Plus className="w-4 h-4" /> Add Server
          </button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {connections.map((conn) => (
            <motion.div 
              key={conn.id}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              className="bg-[#0a0f18] border border-white/10 rounded-xl p-5 hover:border-blue-500/30 transition-all group"
            >
              <div className="flex items-start justify-between mb-4">
                <input 
                  type="text"
                  value={conn.name}
                  onChange={(e) => updateConn(conn.id, { name: e.target.value })}
                  className="bg-transparent text-xl font-bold text-white border-b border-transparent hover:border-white/20 focus:border-blue-500 outline-none w-2/3"
                />
                <button 
                  onClick={() => handleDelete(conn.id)}
                  className="p-2 text-gray-500 hover:text-red-400 bg-white/5 hover:bg-white/10 rounded opacity-0 group-hover:opacity-100 transition-opacity"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>

              <div className="space-y-3">
                <div>
                  <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Connection (user@host)</label>
                  <input 
                    type="text"
                    value={conn.connectionStr}
                    onChange={(e) => updateConn(conn.id, { connectionStr: e.target.value })}
                    className="w-full bg-black text-blue-300 font-mono text-sm px-3 py-2 rounded border border-white/10 outline-none focus:border-blue-500"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Starting Path</label>
                  <input 
                    type="text"
                    value={conn.path}
                    onChange={(e) => updateConn(conn.id, { path: e.target.value })}
                    className="w-full bg-black text-gray-300 font-mono text-sm px-3 py-2 rounded border border-white/10 outline-none focus:border-blue-500"
                  />
                </div>
              </div>

              <div className="mt-6 flex justify-end">
                <button 
                  onClick={() => handleConnect(conn)}
                  className="flex items-center gap-2 px-6 py-2 bg-blue-600 hover:bg-blue-500 text-white font-bold rounded shadow-[0_0_15px_rgba(59,130,246,0.3)] transition-all"
                >
                  <Play className="w-4 h-4 fill-current" /> Connect Workspace
                </button>
              </div>
            </motion.div>
          ))}
          {connections.length === 0 && (
            <div className="col-span-2 py-12 text-center text-gray-500 border border-dashed border-white/10 rounded-xl bg-black/20">
              <Server className="w-12 h-12 mx-auto mb-3 opacity-20" />
              <p>No remote servers configured.</p>
              <button onClick={handleAdd} className="mt-4 text-blue-400 hover:text-blue-300 text-sm">Create your first connection</button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
