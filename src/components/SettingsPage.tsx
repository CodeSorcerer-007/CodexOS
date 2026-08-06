import { useState } from 'react';
import { useStore, useToast } from '../store/store';
import { invoke } from '@tauri-apps/api/core';

export const SettingsPage = () => {
  const settings = useStore(s => s.settings);
  const updateSettings = useStore(s => s.updateSettings);
  const [pathValid, setPathValid] = useState<boolean | null>(null);
  const { error: toastError } = useToast();

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
    } catch (e: any) {
      setPathValid(false);
      toastError('Invalid Default Path', `Directory '${pathStr}' does not exist on disk.`);
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
              onChange={e => updateSettings({ terminalShell: e.target.value as any })}
              className="w-full bg-black/40 border border-white/10 rounded p-2 text-sm focus:border-indigo-500 outline-none"
            >
              <option value="powershell">PowerShell</option>
              <option value="cmd">Command Prompt</option>
              <option value="wsl">WSL (bash)</option>
            </select>
          </div>

          <div>
            <label className="block text-sm font-bold text-gray-400 mb-2">Theme (Coming Soon)</label>
            <select 
              disabled
              value={settings.theme || 'dark'}
              className="w-full bg-white/5 border border-white/5 rounded p-2 text-sm text-gray-500 cursor-not-allowed"
            >
              <option value="dark">Dark</option>
              <option value="light">Light</option>
            </select>
          </div>

        </div>
      </div>
    </div>
  );
};
