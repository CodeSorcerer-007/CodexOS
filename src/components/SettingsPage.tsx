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
              <label htmlFor="default-startup-path" className="block text-sm font-bold text-gray-400">Default Startup Path</label>
              {pathValid === true && <span className="text-xs font-bold text-green-400">✓ Path Exists</span>}
              {pathValid === false && <span className="text-xs font-bold text-red-400">✕ Path Not Found</span>}
            </div>
            <input 
              id="default-startup-path"
              type="text" 
              value={settings.defaultPath || ''}
              onChange={e => handlePathChange(e.target.value)}
              className={`w-full bg-black/40 border rounded p-2 text-sm outline-none transition-colors ${pathValid === false ? 'border-red-500 focus:border-red-500' : pathValid === true ? 'border-green-500 focus:border-green-500' : 'border-white/10 focus:border-indigo-500'}`}
              placeholder="e.g. C:\Projects or /Users/me/code"
            />
          </div>

          <div>
            <label htmlFor="terminal-shell-select" className="block text-sm font-bold text-gray-400 mb-2">Terminal Shell</label>
            <select 
              id="terminal-shell-select"
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
            <label htmlFor="theme-select" className="block text-sm font-bold text-gray-400 mb-2">Theme</label>
            <select 
              id="theme-select"
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
              <label id="enable-ai-copilot-label" className="block text-sm font-bold text-gray-400">Enable AI Copilot</label>
              <p className="text-xs text-gray-500 mt-0.5">Automatically diagnose terminal errors, memory spikes, and network failures</p>
            </div>
            <button
              id="enable-ai-copilot-toggle"
              role="switch"
              aria-labelledby="enable-ai-copilot-label"
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
            <span className="block text-sm font-bold text-gray-400">Mistral API Key</span>
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
            <label htmlFor="memory-spike-threshold" className="block text-sm font-bold text-gray-400 mb-2">
              Memory Spike Threshold (MB)
            </label>
            <input
              id="memory-spike-threshold"
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
            <label htmlFor="memory-spike-window" className="block text-sm font-bold text-gray-400 mb-2">
              Memory Spike Window (seconds)
            </label>
            <input
              id="memory-spike-window"
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
      </div>
    </div>
  );
};
