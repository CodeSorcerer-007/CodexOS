import { useState, useEffect } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { useToast } from '../store/store';

interface PortInfo {
  port: string;
  pid: string;
  process_name: string;
  state: string;
}

export const PortKillerDashboard = () => {
  const [ports, setPorts] = useState<PortInfo[]>([]);
  const [loading, setLoading] = useState(false);
  const { success: toastSuccess, error: toastError } = useToast();

  const fetchPorts = async () => {
    setLoading(true);
    try {
      const data = await invoke<PortInfo[]>('get_active_ports');
      setPorts(data);
    } catch (e: any) {
      console.error(e);
      toastError('Failed to fetch active ports', String(e));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchPorts();
    const interval = setInterval(fetchPorts, 5000);
    return () => clearInterval(interval);
  }, []);

  const handleKill = async (pid: string) => {
    try {
      await invoke('kill_process', { pid });
      toastSuccess('Process Terminated', `Killed process PID ${pid}`);
      fetchPorts(); // refresh after kill
    } catch (e: any) {
      toastError('Failed to kill process', String(e));
    }
  };

  return (
    <div className="h-full flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-white neon-glow">The Port Killer</h2>
          <p className="text-sm text-gray-400">View active TCP ports and forcefully terminate hoarding processes.</p>
        </div>
        <button 
          onClick={fetchPorts}
          className="px-4 py-2 bg-white/5 hover:bg-white/10 rounded-lg text-sm border border-white/10 transition-colors"
        >
          {loading ? 'Scanning...' : 'Refresh'}
        </button>
      </div>

      <div className="flex-1 premium-card overflow-hidden flex flex-col">
        <div className="grid grid-cols-4 gap-4 p-5 border-b border-white/5 text-[10px] font-bold text-gray-500 uppercase tracking-[0.2em] bg-black/20">
          <div>Port</div>
          <div>Process Name</div>
          <div>PID</div>
          <div className="text-right">Action</div>
        </div>
        
        <div className="flex-1 overflow-y-auto">
          {ports.length === 0 ? (
            <div className="flex items-center justify-center h-32 text-gray-500 italic">No listening ports found</div>
          ) : (
            ports.map((p, idx) => (
              <div key={idx} className="grid grid-cols-4 gap-4 p-4 border-b border-white/5 items-center hover:bg-white/5 transition-colors group">
                <div className="font-mono text-cyan-400 group-hover:text-cyan-300 transition-colors">{p.port}</div>
                <div className="text-gray-300 font-medium">{p.process_name}</div>
                <div className="font-mono text-gray-500 text-sm">{p.pid}</div>
                <div className="text-right">
                  <button 
                    onClick={() => handleKill(p.pid)}
                    className="px-5 py-2 bg-red-500/10 text-red-400 border border-red-500/30 rounded-lg hover:bg-red-500 hover:text-white hover:border-red-400 hover:shadow-[0_0_15px_rgba(239,68,68,0.6)] transition-all text-xs font-bold tracking-[0.1em]"
                  >
                    KILL
                  </button>
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
};
