import { useState } from 'react';
import { invoke } from '@tauri-apps/api/core';

export const PluginManager = ({ currentPath }: { currentPath: string | null }) => {
  const [logs, setLogs] = useState<string[]>([]);
  const [pluginPath, setPluginPath] = useState('');

  const executePlugin = async () => {
    if (!pluginPath) return;
    try {
      setLogs(prev => [...prev, `Loading WASM from: ${pluginPath}`]);
      const result = await invoke<string>('run_wasm_plugin', { path: pluginPath });
      setLogs(prev => [...prev, result]);
    } catch (e) {
      setLogs(prev => [...prev, `Error: ${e}`]);
    }
  };

  return (
    <div className="flex h-full w-full bg-[#0a0f18] text-white">
      <div className="w-1/3 border-r border-white/10 p-6 flex flex-col gap-6">
        <div>
          <h2 className="font-bold text-yellow-400 text-xl mb-2">WASM Plugins</h2>
          <p className="text-sm text-gray-400">Load and execute WebAssembly modules natively inside CodexOS's secure sandbox.</p>
        </div>

        <div>
          <label className="text-xs font-bold text-gray-500 uppercase tracking-widest mb-2 block">Plugin Path (.wasm)</label>
          <input 
            type="text"
            value={pluginPath}
            onChange={e => setPluginPath(e.target.value)}
            placeholder={currentPath ? `${currentPath}\\my_plugin.wasm` : "C:\\path\\to\\plugin.wasm"}
            className="w-full bg-black/50 border border-white/10 rounded p-3 text-white font-mono text-sm focus:border-yellow-500 focus:outline-none transition-colors mb-2"
          />
          <button 
            onClick={executePlugin}
            disabled={!pluginPath}
            className="w-full px-4 py-3 bg-yellow-600 hover:bg-yellow-500 disabled:opacity-50 disabled:hover:bg-yellow-600 rounded font-bold transition-colors shadow-[0_0_15px_rgba(202,138,4,0.3)]"
          >
            Execute Plugin
          </button>
        </div>
      </div>

      <div className="flex-1 p-6 bg-black/40 flex flex-col">
        <h3 className="font-bold text-gray-300 mb-4 uppercase tracking-widest text-xs">Sandbox Execution Logs</h3>
        <div className="flex-1 bg-black border border-white/10 rounded-lg p-4 font-mono text-xs text-yellow-400 overflow-y-auto flex flex-col gap-2">
          {logs.map((log, i) => (
            <div key={i} className={log.startsWith('Error') ? 'text-red-400' : ''}>
              &gt; {log}
            </div>
          ))}
          {logs.length === 0 && (
            <div className="text-gray-600">Waiting for execution...</div>
          )}
        </div>
      </div>
    </div>
  );
};
