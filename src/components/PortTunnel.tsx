import { useState, useEffect } from 'react';
import { invoke } from '@tauri-apps/api/core';

interface TunnelInfo {
  local_port: number;
  public_url: string;
  status: string;
  bytes_transferred: string;
}

export const PortTunnel = () => {
  const [tunnels, setTunnels] = useState<TunnelInfo[]>([]);
  const [portInput, setPortInput] = useState('');
  const [error, setError] = useState<string | null>(null);

  const fetchTunnels = async () => {
    try {
      const t = await invoke<TunnelInfo[]>('list_tunnels');
      setTunnels(t);
    } catch (e) {
      console.error(e);
    }
  };

  useEffect(() => {
    fetchTunnels();
    const interval = setInterval(fetchTunnels, 5000);
    return () => clearInterval(interval);
  }, []);

  const handleExpose = async () => {
    setError(null);
    const port = parseInt(portInput);
    if (isNaN(port) || port <= 0 || port > 65535) {
      setError('Invalid port number');
      return;
    }

    try {
      await invoke('start_tunnel', { localPort: port });
      setPortInput('');
      fetchTunnels();
    } catch (e: any) {
      setError(e.toString());
    }
  };

  const handleStop = async (port: number) => {
    try {
      await invoke('stop_tunnel', { localPort: port });
      fetchTunnels();
    } catch (e) {
      console.error(e);
    }
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    alert('Copied to clipboard!');
  };

  return (
    <div className="flex flex-col h-full w-full bg-[#0a0f18] text-white p-6 gap-6">
      <div className="flex justify-between items-center border-b border-white/10 pb-4">
        <div>
          <h2 className="font-bold text-teal-400 text-2xl mb-1">Local Port Tunneling</h2>
          <p className="text-sm text-gray-400">Instantly expose your local development servers to the internet securely.</p>
        </div>
        <div className="flex items-center gap-2 text-sm font-mono bg-black px-4 py-2 rounded-full border border-white/10">
          <div className="w-2 h-2 rounded-full bg-teal-500 animate-pulse" />
          Vaultly Relay Network Active
        </div>
      </div>

      <div className="flex gap-4">
        <input 
          type="number"
          placeholder="Local Port (e.g. 3000)"
          value={portInput}
          onChange={e => setPortInput(e.target.value)}
          className="w-1/3 bg-black/50 border border-white/10 rounded p-3 text-white font-mono text-sm focus:border-teal-500 focus:outline-none"
        />
        <button 
          onClick={handleExpose}
          className="px-6 py-3 bg-teal-600 hover:bg-teal-500 text-black font-bold rounded shadow-[0_0_15px_rgba(20,184,166,0.3)] transition-colors"
        >
          Expose Port
        </button>
      </div>
      
      {error && <div className="text-red-400 text-sm font-bold bg-red-900/20 p-3 rounded border border-red-500/50">{error}</div>}

      <div className="flex-1 overflow-y-auto grid grid-cols-1 md:grid-cols-2 gap-6 mt-4">
        {tunnels.map(t => (
          <div key={t.local_port} className="bg-black border border-teal-500/30 rounded-xl p-6 flex flex-col gap-4 shadow-lg">
            <div className="flex justify-between items-center border-b border-white/10 pb-2">
              <span className="font-bold text-lg text-white">localhost:{t.local_port}</span>
              <span className="px-2 py-1 bg-teal-500/20 text-teal-400 text-xs font-bold rounded uppercase tracking-wider">{t.status}</span>
            </div>
            
            <div className="flex flex-col gap-1">
              <span className="text-xs font-bold text-gray-500 uppercase tracking-widest">Public URL</span>
              <div className="flex justify-between items-center bg-white/5 p-2 rounded">
                <span className="font-mono text-sm text-teal-300 truncate mr-4">{t.public_url}</span>
                <button 
                  onClick={() => copyToClipboard(t.public_url)}
                  className="text-xs bg-white/10 hover:bg-white/20 px-2 py-1 rounded"
                >
                  Copy
                </button>
              </div>
            </div>

            <div className="flex justify-between items-center mt-auto pt-4 border-t border-white/10">
              <span className="text-xs font-mono text-gray-500">{t.bytes_transferred} In/Out</span>
              <button 
                onClick={() => handleStop(t.local_port)}
                className="text-red-400 hover:text-red-300 text-xs font-bold px-3 py-1 bg-red-500/10 rounded border border-red-500/20"
              >
                Close Tunnel
              </button>
            </div>
          </div>
        ))}
        {tunnels.length === 0 && (
          <div className="col-span-full flex flex-col items-center justify-center p-12 border border-dashed border-white/10 rounded-xl text-gray-500">
            <span className="text-4xl mb-2">🌐</span>
            <span className="font-bold">No active tunnels</span>
            <span className="text-sm">Enter a local port above to expose it securely.</span>
          </div>
        )}
      </div>
    </div>
  );
};
