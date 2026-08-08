import { useState, useEffect } from 'react';
import { useStore, useToast } from '../store/store';
import { useDiagnosisStore } from '../store/diagnosisStore';
import { invoke } from '@tauri-apps/api/core';

export const SettingsPage = () => {
  const settings = useStore(s => s.settings);
  const updateSettings = useStore(s => s.updateSettings);
  const store = useStore();
  const [pathValid, setPathValid] = useState<boolean | null>(null);
  const { error: toastError } = useToast();

  // AI Copilot state
  const [copilotConfigured, setCopilotConfigured] = useState<boolean | null>(null);
  const [thresholdError, setThresholdError] = useState<string | null>(null);
  const [windowError, setWindowError] = useState<string | null>(null);

  useEffect(() => {
    invoke<boolean>('is_copilot_configured')
      .then(configured => setCopilotConfigured(configured))
      .catch(() => setCopilotConfigured(false));
  }, []);

  const handlePathChange = async (pathStr: string) => {
    updateSettings({ defaultPath: pathStr });
    if (!pathStr.trim()) {
      setPathValid(null);
      toastError('Invalid Path', 'Please enter a valid directory path');
      return;
    }
    try {
      await invoke('get_files_in_dir', { path: pathStr });
      setPathValid(true);
    } catch {
      setPathValid(false);
      toastError('Invalid Default Path', `Directory '${pathStr}' does not exist on disk.`);
    }
  };

  const handleCopilotToggle = (value: boolean) => {
    store.setAiCopilotEnabled(value);
    useDiagnosisStore.getState().setEnabled(value);
  };

  const handleThresholdChange = (raw: string) => {
    const value = Number(raw);
    if (value < 1) {
      setThresholdError('Must be ≥ 1 MB');
    } else {
      setThresholdError(null);
      store.setMemorySpikeThresholdMb(value);
    }
  };

  const handleWindowChange = (raw: string) => {
    const value = Number(raw);
    if (value < 1) {
      setWindowError('Must be ≥ 1 second');
    } else {
      setWindowError(null);
      store.setMemorySpikeWindowSec(value);
    }
  };

  return (
    <div className="flex h-full w-full bg-[#0a0f18] text-white p-8">
      <div className="max-w-3xl w-full">
        <h1 className="text-2xl font-bold mb-6 text-indigo-400">Settings</h1>
        
        <div className="bg-black/50 border border-white/10 rounded-xl p-6 space-y-6">
          
          <div>
            <div className="flex justify-between items-center mb-2">
              <label className="block text-sm font-bold text-gray-400">Default Startup Path</label>
              {pathValid === true && <span className="text-xs font-bold text-green-400">✓ Path Exists</span>}
              {pathValid === false && <span className="text-xs font-bold text-red-400">✕ Path Not Found</span>}
            </div>
            <input 
              type="text" 
              value={settings.defaultPath || ''}
              onChange={e => handlePathChange(e.target.value)}
              className={`w-full bg-black/40 border rounded p-2 text-sm outline-none transition-colors ${pathValid === false ? 'border-red-500 focus:border-red-500' : pathValid === true ? 'border-green-500 focus:border-green-500' : 'border-white/10 focus:border-indigo-500'}`}
              placeholder="e.g. C:\Projects or /Users/me/code"
            />
          </div>

          <div>
            <label className="block text-sm font-bold text-gray-400 mb-2">Terminal Shell</label>
            <select 
              value={settings.terminalShell || 'powershell'}
              onChange={e => updateSettings({ terminalShell: e.target.value as 'powershell' | 'cmd' | 'wsl' })}
              className="w-full bg-black/40 border border-white/10 rounded p-2 text-sm focus:border-indigo-500 outline-none"
            >
              <option value="powershell">PowerShell</option>
              <option value="cmd">Command Prompt</option>
              <option value="wsl">WSL (bash)</option>
            </select>
          </div>

          <div>
            <label className="block text-sm font-bold text-gray-400 mb-2">Theme</label>
            <select 
              value={settings.theme || 'dark'}
              onChange={e => updateSettings({ theme: e.target.value as 'dark' | 'light' })}
              className="w-full bg-black/40 border border-white/10 rounded p-2 text-sm focus:border-indigo-500 outline-none"
            >
              <option value="dark">Dark</option>
              <option value="light">Light (Experimental)</option>
            </select>
          </div>

        </div>

        {/* AI Root-Cause Copilot */}
        <div className="mt-6 bg-black/50 border border-white/10 rounded-xl p-6 space-y-6">
          <h2 className="text-base font-bold text-indigo-400">AI Root-Cause Copilot</h2>

          {/* Enable / disable toggle */}
          <div className="flex items-center justify-between">
            <div>
              <label className="block text-sm font-bold text-gray-400">Enable AI Copilot</label>
              <p className="text-xs text-gray-500 mt-0.5">Automatically diagnose terminal errors, memory spikes, and network failures</p>
            </div>
            <button
              role="switch"
              aria-checked={settings.aiCopilotEnabled}
              onClick={() => handleCopilotToggle(!settings.aiCopilotEnabled)}
              className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none ${
                settings.aiCopilotEnabled ? 'bg-indigo-600' : 'bg-white/10'
              }`}
            >
              <span
                className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${
                  settings.aiCopilotEnabled ? 'translate-x-6' : 'translate-x-1'
                }`}
              />
            </button>
          </div>

          {/* API key status indicator */}
          <div className="flex items-center justify-between">
            <label className="block text-sm font-bold text-gray-400">Mistral API Key</label>
            {copilotConfigured === null ? null : copilotConfigured ? (
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-bold bg-green-500/20 text-green-400 border border-green-500/30">
                ✓ API Key Configured
              </span>
            ) : (
              <button
                onClick={() => store.setActiveApp('secrets')}
                className="text-xs font-bold text-amber-400 hover:text-amber-300 transition-colors"
              >
                Set up API Key →
              </button>
            )}
          </div>

          {/* Memory spike threshold */}
          <div>
            <label className="block text-sm font-bold text-gray-400 mb-2">
              Memory Spike Threshold (MB)
            </label>
            <input
              type="number"
              min={1}
              defaultValue={settings.memorySpikeThresholdMb}
              onChange={e => handleThresholdChange(e.target.value)}
              className={`w-full bg-black/40 border rounded p-2 text-sm outline-none transition-colors ${
                thresholdError ? 'border-red-500 focus:border-red-500' : 'border-white/10 focus:border-indigo-500'
              }`}
            />
            {thresholdError && (
              <p className="mt-1 text-xs text-red-400">{thresholdError}</p>
            )}
          </div>

          {/* Memory spike window */}
          <div>
            <label className="block text-sm font-bold text-gray-400 mb-2">
              Memory Spike Window (seconds)
            </label>
            <input
              type="number"
              min={1}
              defaultValue={settings.memorySpikeWindowSec}
              onChange={e => handleWindowChange(e.target.value)}
              className={`w-full bg-black/40 border rounded p-2 text-sm outline-none transition-colors ${
                windowError ? 'border-red-500 focus:border-red-500' : 'border-white/10 focus:border-indigo-500'
              }`}
            />
            {windowError && (
              <p className="mt-1 text-xs text-red-400">{windowError}</p>
            )}
          </div>
        </div>

        {/* Keyboard Shortcuts & Quick Actions Section */}
        <ShortcutEditorSection />
      </div>
    </div>
  );
};

const MODULE_OPTIONS = [
  { id: 'home', label: 'Dashboard' },
  { id: 'files', label: 'Vaults (File Manager)' },
  { id: 'editor', label: 'Code Editor' },
  { id: 'process', label: 'Processes' },
  { id: 'env', label: 'Env Manager' },
  { id: 'ssh', label: 'SSH Remote' },
  { id: 'git', label: 'Git Client' },
  { id: 'terminal', label: 'Terminal' },
  { id: 'secrets', label: 'Secrets Manager' },
  { id: 'tunnel', label: 'Relay Tunnel' },
  { id: 'network', label: 'Proxy Interceptor' },
  { id: 'httpclient', label: 'HTTP Client' },
  { id: 'docker', label: 'Docker' },
  { id: 'database', label: 'Databases' },
  { id: 'automation', label: 'Automation Studio' },
  { id: 'ai', label: 'Local AI' },
  { id: 'ast', label: 'AST Engine' },
  { id: 'sandbox', label: 'Nano-VMs' },
  { id: 'memory', label: 'Memory Profiler' },
  { id: 'zkp', label: 'ZKP Vault' },
  { id: 'crdt', label: 'Collab Editor' },
  { id: 'gpu', label: 'GPU Cluster' },
  { id: 'market', label: 'Marketplace' },
];

const ShortcutEditorSection = () => {
  const customShortcuts = useStore(s => s.settings.customShortcuts || []);
  const updateShortcut = useStore(s => s.updateShortcut);
  const deleteShortcut = useStore(s => s.deleteShortcut);
  const addShortcut = useStore(s => s.addShortcut);
  const resetShortcuts = useStore(s => s.resetShortcuts);
  const { success } = useToast();

  const [isCreating, setIsCreating] = useState(false);
  const [newKeyCombo, setNewKeyCombo] = useState('Ctrl+Shift+E');
  const [newLabel, setNewLabel] = useState('My Action');
  const [newActionType, setNewActionType] = useState<'palette' | 'new_tab' | 'close_tab' | 'help' | 'nav_app'>('nav_app');
  const [newTargetApp, setNewTargetApp] = useState<any>('editor');

  const handleCreate = () => {
    if (!newKeyCombo.trim() || !newLabel.trim()) return;
    addShortcut({
      keyCombo: newKeyCombo.trim(),
      label: newLabel.trim(),
      actionType: newActionType,
      targetApp: newActionType === 'nav_app' ? newTargetApp : undefined,
    });
    setIsCreating(false);
    setNewKeyCombo('Ctrl+Shift+E');
    setNewLabel('My Action');
    success('Shortcut Created', `Added ${newKeyCombo} for ${newLabel}`);
  };

  return (
    <div className="mt-6 bg-black/50 border border-white/10 rounded-xl p-6 space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-base font-bold text-indigo-400">Keyboard Shortcuts & Quick Actions</h2>
          <p className="text-xs text-gray-500 mt-0.5">Customize key combinations, edit labels, or add custom task shortcuts</p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => setIsCreating(true)}
            className="px-3 py-1.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded text-xs font-semibold transition-colors flex items-center gap-1"
          >
            + Add Shortcut
          </button>
          <button
            onClick={() => {
              resetShortcuts();
              success('Shortcuts Reset', 'Restored default key bindings');
            }}
            className="px-3 py-1.5 bg-white/10 hover:bg-white/20 text-gray-300 rounded text-xs transition-colors"
          >
            Reset Defaults
          </button>
        </div>
      </div>

      {/* New Shortcut Inline Form */}
      {isCreating && (
        <div className="bg-indigo-950/40 border border-indigo-500/30 rounded-xl p-4 space-y-4">
          <h3 className="text-xs font-bold uppercase tracking-wider text-indigo-300">Create New Shortcut</h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3">
            <div>
              <label className="block text-[11px] font-semibold text-gray-400 mb-1">Key Combination</label>
              <input
                type="text"
                value={newKeyCombo}
                onChange={e => setNewKeyCombo(e.target.value)}
                placeholder="e.g. Ctrl+Alt+S"
                className="w-full bg-black/60 border border-white/15 rounded p-1.5 text-xs font-mono text-cyan-300 outline-none focus:border-indigo-400"
              />
            </div>
            <div>
              <label className="block text-[11px] font-semibold text-gray-400 mb-1">Shortcut Label</label>
              <input
                type="text"
                value={newLabel}
                onChange={e => setNewLabel(e.target.value)}
                placeholder="e.g. Code Editor"
                className="w-full bg-black/60 border border-white/15 rounded p-1.5 text-xs text-white outline-none focus:border-indigo-400"
              />
            </div>
            <div>
              <label className="block text-[11px] font-semibold text-gray-400 mb-1">Action Type</label>
              <select
                value={newActionType}
                onChange={e => setNewActionType(e.target.value as any)}
                className="w-full bg-black/60 border border-white/15 rounded p-1.5 text-xs text-white outline-none focus:border-indigo-400"
              >
                <option value="nav_app">Navigate to Module</option>
                <option value="palette">Open Command Palette</option>
                <option value="new_tab">Create New Tab</option>
                <option value="close_tab">Close Current Tab</option>
                <option value="help">Show Shortcuts Help</option>
              </select>
            </div>
            {newActionType === 'nav_app' && (
              <div>
                <label className="block text-[11px] font-semibold text-gray-400 mb-1">Target Module</label>
                <select
                  value={newTargetApp}
                  onChange={e => setNewTargetApp(e.target.value as any)}
                  className="w-full bg-black/60 border border-white/15 rounded p-1.5 text-xs text-white outline-none focus:border-indigo-400"
                >
                  {MODULE_OPTIONS.map(m => (
                    <option key={m.id} value={m.id}>{m.label}</option>
                  ))}
                </select>
              </div>
            )}
          </div>
          <div className="flex justify-end gap-2 pt-1">
            <button
              onClick={() => setIsCreating(false)}
              className="px-3 py-1 bg-white/10 hover:bg-white/20 text-gray-300 rounded text-xs transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={handleCreate}
              className="px-3 py-1 bg-indigo-600 hover:bg-indigo-500 text-white rounded text-xs font-semibold transition-colors"
            >
              Save Shortcut
            </button>
          </div>
        </div>
      )}

      {/* Shortcuts List */}
      <div className="space-y-2 max-h-96 overflow-y-auto pr-1 no-scrollbar">
        {customShortcuts.map((sc) => (
          <div
            key={sc.id}
            className="flex items-center gap-3 p-2.5 bg-black/40 border border-white/5 rounded-lg hover:border-white/15 transition-all"
          >
            {/* Key Combo Input */}
            <input
              type="text"
              value={sc.keyCombo}
              onChange={e => updateShortcut(sc.id, { keyCombo: e.target.value })}
              className="w-32 bg-black/60 border border-white/10 rounded px-2 py-1 font-mono text-xs text-cyan-300 font-bold outline-none focus:border-cyan-400"
            />

            {/* Label Input */}
            <input
              type="text"
              value={sc.label}
              onChange={e => updateShortcut(sc.id, { label: e.target.value })}
              className="flex-1 bg-black/60 border border-white/10 rounded px-2 py-1 text-xs text-white outline-none focus:border-indigo-400"
            />

            {/* Action Type Dropdown */}
            <select
              value={sc.actionType}
              onChange={e => {
                const at = e.target.value as any;
                updateShortcut(sc.id, { 
                  actionType: at,
                  targetApp: at === 'nav_app' ? (sc.targetApp || 'home') : undefined
                });
              }}
              className="w-40 bg-black/60 border border-white/10 rounded px-2 py-1 text-xs text-gray-300 outline-none focus:border-indigo-400"
            >
              <option value="nav_app">Navigate to Module</option>
              <option value="palette">Command Palette</option>
              <option value="new_tab">New Tab</option>
              <option value="close_tab">Close Tab</option>
              <option value="help">Shortcuts Help</option>
            </select>

            {/* Target Module Dropdown if nav_app */}
            {sc.actionType === 'nav_app' && (
              <select
                value={sc.targetApp || 'home'}
                onChange={e => updateShortcut(sc.id, { targetApp: e.target.value as any })}
                className="w-36 bg-black/60 border border-white/10 rounded px-2 py-1 text-xs text-indigo-300 font-medium outline-none focus:border-indigo-400"
              >
                {MODULE_OPTIONS.map(m => (
                  <option key={m.id} value={m.id}>{m.label}</option>
                ))}
              </select>
            )}

            {/* Delete button */}
            <button
              onClick={() => deleteShortcut(sc.id)}
              title="Delete shortcut"
              className="p-1 text-gray-500 hover:text-red-400 hover:bg-red-500/10 rounded transition-all"
            >
              ✕
            </button>
          </div>
        ))}
      </div>
    </div>
  );
};

