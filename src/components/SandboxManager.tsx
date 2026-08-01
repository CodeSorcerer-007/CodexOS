import { useState } from 'react';
import { invoke } from '@tauri-apps/api/core';

export const SandboxManager = ({ currentPath }: { currentPath: string | null }) => {
  const [logs, setLogs] = useState<string[]>([]);
  const [pluginPath, setPluginPath] = useState('');
  const [mountPath, setMountPath] = useState(currentPath || 'C:\\');

  const executeSandbox = async () => {
    if (!pluginPath) return;
    try {
      setLogs(prev => [...prev, `Booting Nano-VM (WASI) from: ${pluginPath}`]);
      setLogs(prev => [...prev, `Mounting isolated host directory: ${mountPath} -> /mnt`]);
      
      const result = await invoke<string>('run_wasi_nano_vm', { 
        path: pluginPath,
        mountedDir: mountPath
      });
      
      setLogs(prev => [...prev, result]);
    } catch (e) {
      setLogs(prev => [...prev, `Sandbox Violation / Error: ${e}`]);
    }
  };

  return (
    <div className="flex h-full w-full bg-[#0a0f18] text-white">
      <div className="w-1/3 border-r border-white/10 p-6 flex flex-col gap-6">
        <div>
          <h2 className="font-bold text-emerald-400 text-xl mb-2">Nano-VM Sandbox</h2>
          <p className="text-sm text-gray-400">Instantly boot lightweight WebAssembly VMs with strictly isolated host filesystem access.</p>
        </div>

        <div>
          <label className="text-xs font-bold text-gray-500 uppercase tracking-widest mb-2 block">VM Image Path (.wasm)</label>
          <input 
            type="text"
            value={pluginPath}
            onChange={e => setPluginPath(e.target.value)}
            placeholder={currentPath ? `${currentPath}\\app.wasm` : "C:\\path\\to\\app.wasm"}
            className="w-full bg-black/50 border border-white/10 rounded p-3 text-white font-mono text-sm focus:border-emerald-500 focus:outline-none transition-colors mb-4"
          />

          <label className="text-xs font-bold text-gray-500 uppercase tracking-widest mb-2 block">Mount Host Directory (to /mnt)</label>
          <input 
            type="text"
            value={mountPath}
            onChange={e => setMountPath(e.target.value)}
            className="w-full bg-black/50 border border-white/10 rounded p-3 text-emerald-300 font-mono text-sm focus:border-emerald-500 focus:outline-none transition-colors mb-6"
          />

          <button 
            onClick={executeSandbox}
            disabled={!pluginPath || !mountPath}
            className="w-full px-4 py-3 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 disabled:hover:bg-emerald-600 rounded font-bold transition-colors shadow-[0_0_15px_rgba(16,185,129,0.3)]"
          >
            Boot Nano-VM
          </button>
        </div>
      </div>

      <div className="flex-1 p-6 bg-black/40 flex flex-col">
        <h3 className="font-bold text-gray-300 mb-4 uppercase tracking-widest text-xs">Sandbox Execution Logs</h3>
        <div className="flex-1 bg-black border border-white/10 rounded-lg p-4 font-mono text-xs text-emerald-400 overflow-y-auto flex flex-col gap-2">
          {logs.map((log, i) => (
            <div key={i} className={log.startsWith('Sandbox Violation') || log.startsWith('Error') ? 'text-red-400' : ''}>
              &gt; {log}
            </div>
          ))}
          {logs.length === 0 && (
            <div className="text-gray-600">VM Offline. Ready to boot.</div>
          )}
        </div>
      </div>
    </div>
  );
};
