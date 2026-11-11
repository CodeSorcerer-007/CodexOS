import { useState, useEffect } from 'react';
import { useStore, useToast } from '../store/store';
import { Server, Plus, Play, Trash2, Key, Radio, Copy, Check, RefreshCw, Search } from 'lucide-react';
import { motion } from 'framer-motion';
import { invoke } from '@tauri-apps/api/core';
import { VaultUnlock } from './VaultUnlock';

interface SshConnection {
  id: string;
  name: string;
  connectionStr: string;
  path: string;
}

export interface SshKeySummary {
  key_id: string;
  key_type: string;
  public_key: string;
  public_key_path: string;
  private_key_path: string;
  comment: string;
}

export interface SshKeypairInfo {
  key_id: string;
  key_type: string;
  public_key: string;
  public_key_path: string;
  private_key_path: string;
  comment: string;
  created_at: string;
}

export interface PortInfo {
  port: string;
  pid: string;
  process_name: string;
  state: string;
}

export const SshManager = () => {
  const [activeTab, setActiveTab] = useState<'servers' | 'keys' | 'ports'>('servers');
  const [connections, setConnections] = useState<SshConnection[]>([]);
  const { setCurrentPath, setActiveApp } = useStore.getState();
  const { success: toastSuccess, error: toastError } = useToast();

  // Keys tab state
  const [sshKeys, setSshKeys] = useState<SshKeySummary[]>([]);
  const [loadingKeys, setLoadingKeys] = useState(false);
  const [showGenModal, setShowGenModal] = useState(false);
  const [genKeyType, setGenKeyType] = useState<'ed25519' | 'rsa' | 'ecdsa'>('ed25519');
  const [genComment, setGenComment] = useState('codexos-dev');
  const [genRsaBits, setGenRsaBits] = useState(4096);
  const [copiedKeyId, setCopiedKeyId] = useState<string | null>(null);

  // Port scanner state
  const [ports, setPorts] = useState<PortInfo[]>([]);
  const [portFilter, setPortFilter] = useState('');
  const [loadingPorts, setLoadingPorts] = useState(false);

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

  const fetchKeys = async () => {
    setLoadingKeys(true);
    try {
      const keys = await invoke<SshKeySummary[]>('list_ssh_keys');
      setSshKeys(keys || []);
    } catch (err) {
      console.warn('Could not list SSH keys:', err);
    } finally {
      setLoadingKeys(false);
    }
  };

  const fetchPorts = async () => {
    setLoadingPorts(true);
    try {
      const active = await invoke<PortInfo[]>('get_active_ports');
      setPorts(active || []);
    } catch (err) {
      console.warn('Could not fetch active ports:', err);
    } finally {
      setLoadingPorts(false);
    }
  };

  useEffect(() => {
    if (activeTab === 'keys') {
      fetchKeys();
    } else if (activeTab === 'ports') {
      fetchPorts();
    }
  }, [activeTab]);

  const handleAdd = () => {
    const id = crypto.randomUUID();
    setConnections([
      ...connections,
      { id, name: 'Production Server', connectionStr: 'root@192.168.1.100', path: '/var/www' },
    ]);
  };

  const handleConnect = (conn: SshConnection) => {
    const trimmed = conn.connectionStr.trim();
    if (!trimmed || trimmed.startsWith('-') || /[;\s|&$`<>]/g.test(trimmed)) {
      toastError('Invalid SSH Target', 'Connection target must be in user@hostname format without flags or shell characters.');
      return;
    }
    const cleanPath = conn.path.trim().startsWith('/') ? conn.path.trim() : `/${conn.path.trim()}`;
    const fullPath = `ssh://${trimmed}${cleanPath}`;
    setCurrentPath(fullPath);
    setActiveApp('files');
    toastSuccess('Connecting to SSH', `Target: ${trimmed}`);
  };

  const handleDelete = (id: string) => {
    setConnections(connections.filter((c) => c.id !== id));
  };

  const updateConn = (id: string, updates: Partial<SshConnection>) => {
    setConnections((prev) => prev.map((c) => (c.id === id ? { ...c, ...updates } : c)));
  };

  const handleGenerateKey = async () => {
    try {
      const res = await invoke<SshKeypairInfo>('generate_ssh_keypair', {
        keyType: genKeyType,
        bits: genKeyType === 'rsa' ? genRsaBits : undefined,
        comment: genComment || 'codexos',
      });
      toastSuccess('SSH Key Generated', `Created ${res.key_id}`);
      setShowGenModal(false);
      await fetchKeys();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      toastError('Key Generation Failed', msg);
    }
  };

  const handleDeleteKey = async (keyId: string) => {
    try {
      await invoke('delete_ssh_key', { keyId });
      setSshKeys((prev) => prev.filter((k) => k.key_id !== keyId));
      toastSuccess('Key Removed', `Deleted ${keyId}`);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      toastError('Delete Failed', msg);
    }
  };

  const handleCopyPub = async (key: SshKeySummary) => {
    try {
      await navigator.clipboard.writeText(key.public_key);
      setCopiedKeyId(key.key_id);
      setTimeout(() => setCopiedKeyId(null), 2000);
      toastSuccess('Copied', 'Public key copied to clipboard');
    } catch {
      toastError('Copy Failed', 'Could not copy to clipboard');
    }
  };

  const filteredPorts = ports.filter(
    (p) =>
      p.port.toLowerCase().includes(portFilter.toLowerCase()) ||
      p.process_name.toLowerCase().includes(portFilter.toLowerCase()) ||
      p.state.toLowerCase().includes(portFilter.toLowerCase())
  );

  return (
    <div className="flex flex-col h-full w-full bg-app-bg text-app-text p-8 overflow-y-auto">
      <VaultUnlock />
      <div className="max-w-5xl mx-auto w-full">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-3xl font-bold bg-gradient-to-r from-blue-400 to-indigo-400 bg-clip-text text-transparent flex items-center gap-3">
              <Server className="w-8 h-8 text-blue-400" />
              SSH Remote Development
            </h1>
            <p className="text-app-text-muted mt-2">Connect to remote servers, manage SSH keys, and discover local service ports</p>
          </div>
          {activeTab === 'servers' && (
            <button
              onClick={handleAdd}
              className="flex items-center gap-2 px-4 py-2 bg-blue-500/20 hover:bg-blue-500/30 text-blue-300 rounded border border-blue-500/30 transition-all font-medium text-sm"
            >
              <Plus className="w-4 h-4" /> Add Server
            </button>
          )}
          {activeTab === 'keys' && (
            <button
              onClick={() => setShowGenModal(true)}
              className="flex items-center gap-2 px-4 py-2 bg-indigo-500/20 hover:bg-indigo-500/30 text-indigo-300 rounded border border-indigo-500/30 transition-all font-medium text-sm"
            >
              <Key className="w-4 h-4" /> Generate Keypair
            </button>
          )}
          {activeTab === 'ports' && (
            <button
              onClick={fetchPorts}
              disabled={loadingPorts}
              className="flex items-center gap-2 px-4 py-2 bg-cyan-500/20 hover:bg-cyan-500/30 text-cyan-300 rounded border border-cyan-500/30 transition-all font-medium text-sm"
            >
              <RefreshCw className={`w-4 h-4 ${loadingPorts ? 'animate-spin' : ''}`} /> Scan Ports
            </button>
          )}
        </div>

        {/* Tab Selection Navigation */}
        <div className="flex items-center gap-2 border-b border-app-border pb-3 mb-6">
          <button
            onClick={() => setActiveTab('servers')}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold transition-colors ${
              activeTab === 'servers'
                ? 'bg-blue-500/20 text-blue-400 border border-blue-500/30'
                : 'text-app-text-muted hover:text-app-text'
            }`}
          >
            <Server className="w-4 h-4" />
            <span>Servers ({connections.length})</span>
          </button>
          <button
            onClick={() => setActiveTab('keys')}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold transition-colors ${
              activeTab === 'keys'
                ? 'bg-indigo-500/20 text-indigo-400 border border-indigo-500/30'
                : 'text-app-text-muted hover:text-app-text'
            }`}
          >
            <Key className="w-4 h-4" />
            <span>SSH Keypairs ({sshKeys.length})</span>
          </button>
          <button
            onClick={() => setActiveTab('ports')}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold transition-colors ${
              activeTab === 'ports'
                ? 'bg-cyan-500/20 text-cyan-400 border border-cyan-500/30'
                : 'text-app-text-muted hover:text-app-text'
            }`}
          >
            <Radio className="w-4 h-4" />
            <span>Port Scanner ({ports.length})</span>
          </button>
        </div>

        {/* Tab 1: Servers */}
        {activeTab === 'servers' && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {connections.map((conn) => (
              <motion.div
                key={conn.id}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                className="bg-app-surface border border-app-border rounded-xl p-5 hover:border-blue-500/30 transition-all group"
              >
                <div className="flex items-start justify-between mb-4">
                  <input
                    type="text"
                    value={conn.name}
                    onChange={(e) => updateConn(conn.id, { name: e.target.value })}
                    className="bg-transparent text-xl font-bold text-app-text border-b border-transparent hover:border-app-border focus:border-blue-500 outline-none w-2/3"
                  />
                  <button
                    onClick={() => handleDelete(conn.id)}
                    className="p-2 text-app-text-muted hover:text-red-400 bg-app-surface-muted/50 hover:bg-app-surface-muted rounded opacity-0 group-hover:opacity-100 transition-opacity"
                    title="Delete connection"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>

                <div className="space-y-3">
                  <div>
                    <label className="block text-xs font-bold text-app-text-muted uppercase mb-1">
                      Connection (user@host)
                    </label>
                    <input
                      type="text"
                      value={conn.connectionStr}
                      onChange={(e) => updateConn(conn.id, { connectionStr: e.target.value })}
                      className="w-full bg-app-bg text-blue-300 font-mono text-sm px-3 py-2 rounded border border-app-border outline-none focus:border-blue-500"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-app-text-muted uppercase mb-1">
                      Starting Path
                    </label>
                    <input
                      type="text"
                      value={conn.path}
                      onChange={(e) => updateConn(conn.id, { path: e.target.value })}
                      className="w-full bg-app-bg text-app-text-muted font-mono text-sm px-3 py-2 rounded border border-app-border outline-none focus:border-blue-500"
                    />
                  </div>
                </div>

                <div className="mt-6 flex justify-end">
                  <button
                    onClick={() => handleConnect(conn)}
                    className="flex items-center gap-2 px-6 py-2 bg-blue-600 hover:bg-blue-500 text-white font-bold rounded shadow-[0_0_15px_rgba(59,130,246,0.3)] transition-all cursor-pointer"
                  >
                    <Play className="w-4 h-4 fill-current" /> Connect Workspace
                  </button>
                </div>
              </motion.div>
            ))}
            {connections.length === 0 && (
              <div className="col-span-2 py-12 text-center text-app-text-muted border border-dashed border-app-border rounded-xl bg-app-surface/40">
                <Server className="w-12 h-12 mx-auto mb-3 opacity-20" />
                <p>No remote servers configured.</p>
                <button onClick={handleAdd} className="mt-4 text-blue-400 hover:text-blue-300 text-sm font-medium">
                  Create your first connection
                </button>
              </div>
            )}
          </div>
        )}

        {/* Tab 2: SSH Keypairs */}
        {activeTab === 'keys' && (
          <div className="flex flex-col gap-4">
            <div className="flex items-center justify-between text-xs text-app-text-muted font-mono bg-app-surface px-4 py-2.5 rounded-lg border border-app-border">
              <span>Managed keys in ~/.ssh</span>
              <span>{sshKeys.length} keys found</span>
            </div>

            <div className="grid grid-cols-1 gap-3">
              {sshKeys.map((k) => (
                <div
                  key={k.key_id}
                  className="bg-app-surface border border-app-border rounded-xl p-4 flex flex-col md:flex-row items-start md:items-center justify-between gap-4 hover:border-indigo-500/30 transition-all"
                >
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-lg bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center text-indigo-400 font-bold shrink-0">
                      <Key className="w-5 h-5" />
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-app-text">{k.key_id}</span>
                        <span className="text-[10px] uppercase font-mono px-2 py-0.5 rounded bg-indigo-500/20 text-indigo-300 border border-indigo-500/30 font-bold">
                          {k.key_type}
                        </span>
                      </div>
                      <p className="text-xs text-app-text-muted font-mono mt-0.5 truncate max-w-md">
                        {k.comment ? `Comment: ${k.comment}` : k.public_key_path}
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 shrink-0">
                    <button
                      onClick={() => handleCopyPub(k)}
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-app-surface-muted border border-app-border hover:bg-indigo-600/20 text-app-text transition-colors"
                      title="Copy Public Key"
                    >
                      {copiedKeyId === k.key_id ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                      <span>{copiedKeyId === k.key_id ? 'Copied' : 'Copy Pubkey'}</span>
                    </button>
                    <button
                      onClick={() => handleDeleteKey(k.key_id)}
                      className="p-1.5 rounded-lg text-app-text-muted hover:text-red-400 hover:bg-red-500/10 transition-colors"
                      title="Delete SSH key"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              ))}

              {sshKeys.length === 0 && !loadingKeys && (
                <div className="py-12 text-center text-app-text-muted border border-dashed border-app-border rounded-xl bg-app-surface/40">
                  <Key className="w-12 h-12 mx-auto mb-3 opacity-20" />
                  <p>No SSH public keys detected in ~/.ssh</p>
                  <button
                    onClick={() => setShowGenModal(true)}
                    className="mt-4 text-indigo-400 hover:text-indigo-300 text-sm font-medium"
                  >
                    Generate an ed25519 keypair now
                  </button>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Tab 3: Port Scanner */}
        {activeTab === 'ports' && (
          <div className="flex flex-col gap-4">
            <div className="flex items-center justify-between gap-4">
              <div className="relative flex-1">
                <Search className="w-4 h-4 text-app-text-muted absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  placeholder="Filter by port, process name, or state..."
                  value={portFilter}
                  onChange={(e) => setPortFilter(e.target.value)}
                  className="w-full pl-9 pr-4 py-2 bg-app-surface border border-app-border rounded-lg text-sm text-app-text placeholder:text-app-text-muted outline-none focus:border-cyan-500"
                />
              </div>
              <div className="text-xs text-app-text-muted font-mono shrink-0">
                {filteredPorts.length} active ports
              </div>
            </div>

            <div className="bg-app-surface border border-app-border rounded-xl overflow-hidden">
              <table className="w-full text-left text-xs">
                <thead className="bg-app-surface-muted/60 border-b border-app-border text-app-text-muted uppercase tracking-wider font-mono">
                  <tr>
                    <th className="py-2.5 px-4">Port</th>
                    <th className="py-2.5 px-4">PID</th>
                    <th className="py-2.5 px-4">Process Name</th>
                    <th className="py-2.5 px-4">State</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-app-border font-mono">
                  {filteredPorts.map((p, idx) => (
                    <tr key={idx} className="hover:bg-app-surface-muted/30 transition-colors">
                      <td className="py-2.5 px-4 font-bold text-cyan-400">{p.port}</td>
                      <td className="py-2.5 px-4 text-app-text-muted">{p.pid || '—'}</td>
                      <td className="py-2.5 px-4 text-app-text font-sans">{p.process_name || 'System / Listening'}</td>
                      <td className="py-2.5 px-4">
                        <span
                          className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                            p.state === 'LISTENING' || p.state === 'Listen'
                              ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
                              : 'bg-app-surface-muted text-app-text-muted'
                          }`}
                        >
                          {p.state}
                        </span>
                      </td>
                    </tr>
                  ))}
                  {filteredPorts.length === 0 && !loadingPorts && (
                    <tr>
                      <td colSpan={4} className="py-8 text-center text-app-text-muted font-sans italic">
                        No active listening ports matched your search.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>

      {/* Generate Keypair Modal */}
      {showGenModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-xs flex items-center justify-center z-50 p-4">
          <div className="bg-app-surface border border-app-border rounded-xl p-6 max-w-md w-full shadow-2xl">
            <h3 className="text-lg font-bold text-app-text flex items-center gap-2 mb-4">
              <Key className="w-5 h-5 text-indigo-400" /> Generate SSH Keypair
            </h3>

            <div className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-app-text-muted uppercase mb-1">Key Type</label>
                <div className="grid grid-cols-3 gap-2">
                  {(['ed25519', 'rsa', 'ecdsa'] as const).map((type) => (
                    <button
                      key={type}
                      onClick={() => setGenKeyType(type)}
                      className={`py-2 rounded-lg text-xs font-bold uppercase transition-colors border ${
                        genKeyType === type
                          ? 'bg-indigo-600/30 border-indigo-500 text-indigo-300'
                          : 'bg-app-surface-muted border-app-border text-app-text-muted hover:text-app-text'
                      }`}
                    >
                      {type}
                    </button>
                  ))}
                </div>
              </div>

              {genKeyType === 'rsa' && (
                <div>
                  <label className="block text-xs font-bold text-app-text-muted uppercase mb-1">RSA Key Bits</label>
                  <select
                    value={genRsaBits}
                    onChange={(e) => setGenRsaBits(Number(e.target.value))}
                    className="w-full bg-app-bg text-app-text px-3 py-2 rounded-lg border border-app-border text-xs outline-none focus:border-indigo-500"
                  >
                    <option value={2048}>2048 bits</option>
                    <option value={4096}>4096 bits (Recommended)</option>
                    <option value={8192}>8192 bits</option>
                  </select>
                </div>
              )}

              <div>
                <label className="block text-xs font-bold text-app-text-muted uppercase mb-1">Key Comment</label>
                <input
                  type="text"
                  value={genComment}
                  onChange={(e) => setGenComment(e.target.value)}
                  placeholder="e.g. dev-laptop-2026"
                  className="w-full bg-app-bg text-app-text px-3 py-2 rounded-lg border border-app-border text-sm outline-none focus:border-indigo-500"
                />
              </div>
            </div>

            <div className="flex justify-end gap-3 mt-6">
              <button
                onClick={() => setShowGenModal(false)}
                className="px-4 py-2 rounded-lg text-sm text-app-text-muted hover:text-app-text transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleGenerateKey}
                className="px-5 py-2 rounded-lg text-sm font-bold bg-indigo-600 hover:bg-indigo-500 text-white transition-all shadow-md cursor-pointer"
              >
                Generate Key
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
