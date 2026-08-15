import { useState } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { open } from '@tauri-apps/plugin-dialog';
import { FolderOpen, Play, Trash2, Cpu } from 'lucide-react';
import { useToast } from '../store/store';

export const PluginManager = ({ currentPath }: { currentPath: string | null }) => {
  const [logs, setLogs] = useState<string[]>([]);
  const [pluginPath, setPluginPath] = useState('');
  const [executing, setExecuting] = useState(false);
  const { success: toastSuccess, error: toastError } = useToast();

  const handleBrowse = async () => {
    try {
      const selected = await open({
        multiple: false,
        filters: [{ name: 'WebAssembly Module', extensions: ['wasm'] }],
        title: 'Select .wasm Plugin',
      });
      if (selected && typeof selected === 'string') {
        setPluginPath(selected);
      }
    } catch (e) {
      console.error(e);
    }
  };

  const executePlugin = async () => {
    if (!pluginPath) return;
    setExecuting(true);
    try {
      setLogs(prev => [...prev, `Loading WASM from: ${pluginPath}`]);
      const result = await invoke<string>('run_wasm_plugin', { path: pluginPath });
      setLogs(prev => [...prev, result]);
      toastSuccess('Plugin Executed', pluginPath.split(/[/\\]/).pop() || pluginPath);
    } catch (e) {
      const errMsg = e instanceof Error ? e.message : String(e);
      setLogs(prev => [...prev, `Error: ${errMsg}`]);
      toastError('Execution Failed', errMsg);
    } finally {
      setExecuting(false);
    }
  };

  return (
    <div className="flex h-full w-full bg-[#0a0f18] text-white">
      <div className="w-1/3 border-r border-white/10 p-6 flex flex-col gap-6">
        <div>
          <div className="flex items-center gap-2 text-yellow-400 mb-2">
            <Cpu className="w-6 h-6" />
            <h2 className="font-bold text-xl">WASM Plugins</h2>
          </div>
          <p className="text-sm text-gray-400">Load and execute WebAssembly modules natively inside CodexOS's fuel-metered sandbox.</p>
        </div>

        <div>
          <label className="text-xs font-bold text-gray-500 uppercase tracking-widest mb-2 block">Plugin Path (.wasm)</label>
          <div className="flex gap-2 mb-3">
            <input 
              type="text"
              value={pluginPath}
              onChange={e => setPluginPath(e.target.value)}
              placeholder={currentPath ? `${currentPath}\\my_plugin.wasm` : "C:\\path\\to\\plugin.wasm"}
              className="flex-1 bg-black/50 border border-white/10 rounded p-2.5 text-white font-mono text-xs focus:border-yellow-500 focus:outline-none transition-colors truncate"
            />
            <button
              onClick={handleBrowse}
              title="Browse WASM file"
              className="p-2.5 bg-white/10 hover:bg-white/20 rounded border border-white/10 text-gray-300 hover:text-white transition-colors"
            >
              <FolderOpen className="w-4 h-4" />
            </button>
          </div>
          <button 
            onClick={executePlugin}
            disabled={!pluginPath || executing}
            className="w-full px-4 py-3 bg-yellow-600 hover:bg-yellow-500 disabled:opacity-50 disabled:hover:bg-yellow-600 rounded font-bold transition-colors shadow-[0_0_15px_rgba(202,138,4,0.3)] flex items-center justify-center gap-2 text-sm"
          >
            <Play className="w-4 h-4 fill-current" />
            <span>{executing ? 'Executing...' : 'Execute Plugin'}</span>
          </button>
        </div>
      </div>

      <div className="flex-1 p-6 bg-black/40 flex flex-col">
        <div className="flex justify-between items-center mb-4">
          <h3 className="font-bold text-gray-300 uppercase tracking-widest text-xs">Sandbox Execution Logs</h3>
          {logs.length > 0 && (
            <button
              onClick={() => setLogs([])}
              className="text-xs text-gray-400 hover:text-red-400 flex items-center gap-1 transition-colors"
            >
              <Trash2 className="w-3.5 h-3.5" />
              <span>Clear Logs</span>
            </button>
          )}
        </div>
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
