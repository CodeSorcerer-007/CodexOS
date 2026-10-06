import { useState, useEffect, useCallback } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { open } from '@tauri-apps/plugin-dialog';
import { FolderOpen, Play, Trash2, Cpu, ShieldCheck, Power, AlertCircle } from 'lucide-react';
import { useToast } from '../store/store';
import type { InstalledPlugin } from '../types/plugin';
import {
  loadInstalledPlugins,
  toggleInstalledPluginEnabled,
  removeInstalledPlugin,
  INSTALLED_PLUGINS_STORAGE_KEY,
} from '../utils/pluginCrypto';

export const PluginManager = ({ currentPath }: { currentPath: string | null }) => {
  const [logs, setLogs] = useState<string[]>([]);
  const [pluginPath, setPluginPath] = useState('');
  const [executing, setExecuting] = useState(false);
  const [installedPlugins, setInstalledPlugins] = useState<InstalledPlugin[]>([]);
  const { success: toastSuccess, error: toastError } = useToast();

  const refreshInstalled = useCallback(() => {
    try {
      const plugins = loadInstalledPlugins();
      setInstalledPlugins(plugins);
    } catch {
      // Ignore storage read error
    }
  }, []);

  useEffect(() => {
    refreshInstalled();

    const handleCustomChange = () => refreshInstalled();
    const handleStorageChange = (e: StorageEvent) => {
      if (e.key === INSTALLED_PLUGINS_STORAGE_KEY) {
        refreshInstalled();
      }
    };

    window.addEventListener('codexos_installed_plugins_changed', handleCustomChange);
    window.addEventListener('storage', handleStorageChange);

    return () => {
      window.removeEventListener('codexos_installed_plugins_changed', handleCustomChange);
      window.removeEventListener('storage', handleStorageChange);
    };
  }, [refreshInstalled]);

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

  const executeManualPlugin = async () => {
    if (!pluginPath) return;
    setExecuting(true);
    try {
      setLogs((prev) => [...prev, `Loading WASM from: ${pluginPath}`]);
      const result = await invoke<string>('run_wasm_plugin', { path: pluginPath });
      setLogs((prev) => [...prev, result]);
      toastSuccess('Plugin Executed', pluginPath.split(/[/\\]/).pop() || pluginPath);
    } catch (e) {
      const errMsg = e instanceof Error ? e.message : String(e);
      setLogs((prev) => [...prev, `Error: ${errMsg}`]);
      toastError('Execution Failed', errMsg);
    } finally {
      setExecuting(false);
    }
  };

  const handleRunInstalledPlugin = async (plugin: InstalledPlugin) => {
    if (!plugin.enabled) {
      toastError('Plugin Disabled', `${plugin.name} is currently disabled. Enable it to execute.`);
      return;
    }

    setExecuting(true);
    try {
      setLogs((prev) => [
        ...prev,
        `[${new Date().toLocaleTimeString()}] Executing verified plugin: ${plugin.name} v${plugin.version}...`,
      ]);

      const result = await invoke<string>('execute_marketplace_plugin', {
        pluginId: plugin.id,
        inputText: `Execution request for ${plugin.name}`,
      });

      setLogs((prev) => [
        ...prev,
        `[SUCCESS] Result for ${plugin.name}:`,
        result || '(Execution succeeded with empty output)',
      ]);
      toastSuccess('Plugin Executed', `${plugin.name} ran successfully.`);
    } catch (e) {
      const errMsg = e instanceof Error ? e.message : String(e);
      setLogs((prev) => [...prev, `Error executing ${plugin.name}: ${errMsg}`]);
      toastError('Execution Error', errMsg);
    } finally {
      setExecuting(false);
    }
  };

  const handleToggleEnabled = (pluginId: string) => {
    const updated = toggleInstalledPluginEnabled(pluginId);
    setInstalledPlugins(updated);
  };

  const handleUninstall = (pluginId: string) => {
    const updated = removeInstalledPlugin(pluginId);
    setInstalledPlugins(updated);
    toastSuccess('Plugin Uninstalled', 'Plugin has been removed from your local registry.');
  };

  return (
    <div className="flex h-full w-full bg-[#0a0f18] text-white">
      {/* Left Column: Management & Loader */}
      <div className="w-1/2 md:w-5/12 border-r border-white/10 p-6 flex flex-col gap-6 overflow-y-auto">
        <div>
          <div className="flex items-center gap-2 text-yellow-400 mb-2">
            <Cpu className="w-6 h-6" />
            <h2 className="font-bold text-xl">WASM Plugins</h2>
          </div>
          <p className="text-sm text-gray-400">
            Manage cryptographically verified P2P plugins and load WebAssembly modules natively inside CodexOS's fuel-metered sandbox.
          </p>
        </div>

        {/* Installed Plugins Section */}
        <div className="flex flex-col gap-3">
          <div className="flex items-center justify-between">
            <h3 className="text-xs font-bold text-gray-400 uppercase tracking-widest">
              Installed Plugins ({installedPlugins.length})
            </h3>
            <span className="text-[11px] text-emerald-400 flex items-center gap-1 font-mono">
              <ShieldCheck className="w-3.5 h-3.5" />
              <span>SHA-256 Verified</span>
            </span>
          </div>

          {installedPlugins.length === 0 ? (
            <div className="p-4 bg-black/40 border border-white/5 rounded-xl text-center text-xs text-gray-500">
              <AlertCircle className="w-5 h-5 mx-auto mb-1 text-gray-600" />
              No marketplace plugins installed. Visit the P2P Marketplace to discover and install verified extensions.
            </div>
          ) : (
            <div className="flex flex-col gap-2.5">
              {installedPlugins.map((plugin) => (
                <div
                  key={plugin.id}
                  className={`p-3.5 rounded-xl border transition-all ${
                    plugin.enabled
                      ? 'bg-black/50 border-white/10 hover:border-yellow-500/40'
                      : 'bg-black/30 border-white/5 opacity-60'
                  }`}
                >
                  <div className="flex justify-between items-start gap-2 mb-1.5">
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-sm text-white">{plugin.name}</span>
                        {plugin.verified && (
                          <span title="SHA-256 Checksum Verified">
                            <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
                          </span>
                        )}
                      </div>
                      <div className="text-[11px] text-gray-400 font-mono">
                        v{plugin.version} • {plugin.author}
                      </div>
                    </div>

                    {/* Enable / Disable Toggle */}
                    <button
                      onClick={() => handleToggleEnabled(plugin.id)}
                      title={plugin.enabled ? 'Disable Plugin' : 'Enable Plugin'}
                      className={`px-2 py-0.5 rounded text-[11px] font-bold flex items-center gap-1 transition-colors ${
                        plugin.enabled
                          ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 hover:bg-emerald-500/30'
                          : 'bg-gray-800 text-gray-400 border border-gray-700 hover:bg-gray-700'
                      }`}
                    >
                      <Power className="w-3 h-3" />
                      <span>{plugin.enabled ? 'Enabled' : 'Disabled'}</span>
                    </button>
                  </div>

                  <p className="text-xs text-gray-400 line-clamp-2 mb-3">{plugin.description}</p>

                  <div className="flex items-center justify-between border-t border-white/5 pt-2">
                    <span className="text-[10px] font-mono text-gray-500">{plugin.category}</span>

                    <div className="flex items-center gap-2">
                      <button
                        disabled={!plugin.enabled || executing}
                        onClick={() => handleRunInstalledPlugin(plugin)}
                        className="px-2.5 py-1 bg-yellow-500 hover:bg-yellow-400 disabled:opacity-40 text-black rounded text-xs font-bold flex items-center gap-1 shadow transition-colors"
                      >
                        <Play className="w-3 h-3 fill-current" />
                        <span>Run</span>
                      </button>
                      <button
                        onClick={() => handleUninstall(plugin.id)}
                        title="Uninstall Plugin"
                        className="p-1 text-gray-400 hover:text-red-400 hover:bg-red-500/10 rounded transition-colors"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Manual WASM Loader Section */}
        <div className="border-t border-white/10 pt-5">
          <label className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-2 block">
            Manual Plugin Loader (.wasm)
          </label>
          <div className="flex gap-2 mb-3">
            <input
              type="text"
              value={pluginPath}
              onChange={(e) => setPluginPath(e.target.value)}
              placeholder={currentPath ? `${currentPath}\\my_plugin.wasm` : 'C:\\path\\to\\plugin.wasm'}
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
            onClick={executeManualPlugin}
            disabled={!pluginPath || executing}
            className="w-full px-4 py-3 bg-yellow-600 hover:bg-yellow-500 disabled:opacity-50 disabled:hover:bg-yellow-600 rounded font-bold transition-colors shadow-[0_0_15px_rgba(202,138,4,0.3)] flex items-center justify-center gap-2 text-sm"
          >
            <Play className="w-4 h-4 fill-current" />
            <span>{executing ? 'Executing...' : 'Execute Plugin'}</span>
          </button>
        </div>
      </div>

      {/* Right Column: Sandbox Execution Logs */}
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
            <div key={i} className={log.includes('Error') || log.startsWith('[ERROR]') ? 'text-red-400' : ''}>
              &gt; {log}
            </div>
          ))}
          {logs.length === 0 && <div className="text-gray-600">Waiting for execution...</div>}
        </div>
      </div>
    </div>
  );
};
