import { useState, useEffect, useCallback } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import { QRCodeSVG } from 'qrcode.react';
import { useToast } from '../store/store';

interface TunnelInfo {
  local_port: number;
  public_url: string;
  status: string;
}

export const PortTunnel = () => {
  const [tunnels, setTunnels] = useState<TunnelInfo[]>([]);
  const [portInput, setPortInput] = useState('');
  const [logs, setLogs] = useState<string[]>([]);
  const [isConnecting, setIsConnecting] = useState(false);
  const toast = useToast();

  const fetchTunnels = useCallback(async () => {
    try {
      const t = await invoke<TunnelInfo[]>('list_tunnels');
      setTunnels(t);
    } catch (e: unknown) {
      toast.error('Failed to fetch tunnels', e instanceof Error ? e.message : String(e));
    }
  }, [toast]);

  useEffect(() => {
    fetchTunnels();
    const interval = setInterval(fetchTunnels, 5000);
    return () => clearInterval(interval);
  }, [fetchTunnels]);

  useEffect(() => {
    const unlisten = listen<string>('tunnel-log', (event) => {
      setLogs((prev) => [...prev, event.payload].slice(-50)); // keep last 50
    });
    return () => {
      unlisten.then((fn) => fn()).catch(e => {
        toast.error('Tunnel Log Error', e instanceof Error ? e.message : String(e));
      });
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleExpose = async () => {
    const port = parseInt(portInput);
    if (isNaN(port) || port <= 0 || port > 65535) {
      toast.error('Invalid port', 'Port must be between 1 and 65535');
      return;
    }

    setIsConnecting(true);
    setLogs((prev) => [...prev, `Connecting to relay server for port ${port}...`]);

    try {
      await invoke('start_tunnel', { localPort: port });
      toast.success('Tunnel Started', `Port ${port} is now exposed.`);
      setPortInput('');
      await fetchTunnels();
    } catch (e: unknown) {
      toast.error('Failed to start tunnel', e instanceof Error ? e.message : String(e));
    } finally {
      setIsConnecting(false);
    }
  };

  const handleStop = async (port: number) => {
    try {
      await invoke('stop_tunnel', { localPort: port });
      toast.success('Tunnel Stopped', `Port ${port} is no longer exposed.`);
      await fetchTunnels();
    } catch (e: unknown) {
      toast.error('Failed to stop tunnel', e instanceof Error ? e.message : String(e));
    }
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    toast.success('Copied', 'URL copied to clipboard');
  };

  return (
    <div className="flex flex-col h-full w-full bg-[#0a0f18] text-white p-6 gap-6">
      <div className="flex justify-between items-center border-b border-white/10 pb-4">
        <div>
          <h2 className="font-bold text-teal-400 text-2xl mb-1">Local Port Tunneling</h2>
          <p className="text-sm text-gray-400">
            Instantly expose your local development servers to the internet securely.
          </p>
        </div>
        <div className="flex items-center gap-2 text-sm font-mono bg-black px-4 py-2 rounded-full border border-white/10">
          <div className="w-2 h-2 rounded-full bg-teal-500 animate-pulse" />
          CodexOS Relay Network Active
        </div>
      </div>

      <div className="flex gap-4">
        <input
          type="number"
          placeholder="Local Port (e.g. 3000)"
          value={portInput}
          onChange={(e) => setPortInput(e.target.value)}
          disabled={isConnecting}
          className="w-1/3 bg-black/50 border border-white/10 rounded p-3 text-white font-mono text-sm focus:border-teal-500 focus:outline-none disabled:opacity-50"
        />
        <button
          onClick={handleExpose}
          disabled={isConnecting}
          className="px-6 py-3 bg-teal-600 hover:bg-teal-500 text-black font-bold rounded shadow-[0_0_15px_rgba(20,184,166,0.3)] transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center min-w-[150px]"
        >
          {isConnecting ? (
            <div className="w-5 h-5 border-2 border-black border-t-transparent rounded-full animate-spin" />
          ) : (
            'Expose Port'
          )}
        </button>
      </div>

      <div className="flex-1 overflow-y-auto grid grid-cols-1 md:grid-cols-2 gap-6 mt-4">
        <div className="flex flex-col gap-4">
          <h3 className="font-bold text-teal-300">Active Tunnels</h3>
          {tunnels.map((t) => (
            <div
              key={t.local_port}
              className="bg-black border border-teal-500/30 rounded-xl p-6 flex flex-col gap-4 shadow-lg"
            >
              <div className="flex justify-between items-center border-b border-white/10 pb-2">
                <span className="font-bold text-lg text-white">localhost:{t.local_port}</span>
                <span className="px-2 py-1 bg-teal-500/20 text-teal-400 text-xs font-bold rounded uppercase tracking-wider">
                  {t.status}
                </span>
              </div>

              <div className="flex flex-col gap-1">
                <span className="text-xs font-bold text-gray-500 uppercase tracking-widest">
                  Public URL
                </span>
                <div className="flex justify-between items-center bg-white/5 p-2 rounded">
                  <a
                    href={t.public_url}
                    target="_blank"
                    rel="noreferrer"
                    className="font-mono text-sm text-teal-300 truncate hover:underline"
                  >
                    {t.public_url}
                  </a>
                  <button
                    onClick={() => copyToClipboard(t.public_url)}
                    className="text-xs bg-white/10 hover:bg-white/20 px-2 py-1 rounded ml-2 whitespace-nowrap"
                  >
                    Copy
                  </button>
                </div>
              </div>

              <div className="flex justify-center py-2">
                <div className="bg-white p-2 rounded-lg">
                  <QRCodeSVG value={t.public_url} size={100} />
                </div>
              </div>

              <div className="flex justify-end items-center mt-auto pt-4 border-t border-white/10">
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
            <div className="flex flex-col items-center justify-center p-12 border border-dashed border-white/10 rounded-xl text-gray-500">
              <span className="text-4xl mb-2">🌐</span>
              <span className="font-bold">No active tunnels</span>
              <span className="text-sm">Enter a local port above to expose it securely.</span>
            </div>
          )}
        </div>

        <div className="flex flex-col h-full bg-black/80 border border-white/10 rounded-xl overflow-hidden">
          <div className="bg-black/90 border-b border-white/10 p-3">
            <span className="font-bold text-sm text-gray-300">SSH Log Output</span>
          </div>
          <div className="flex-1 p-4 overflow-y-auto font-mono text-xs text-gray-400 whitespace-pre-wrap">
            {logs.map((log, i) => (
              <div key={i} className="mb-1">
                {log}
              </div>
            ))}
            {logs.length === 0 && (
              <div className="text-gray-600 italic">Waiting for tunnel activity...</div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
