import { useState, useEffect, useCallback } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { open, save } from '@tauri-apps/plugin-dialog';
import { Lock, Download, Upload, Trash2 } from 'lucide-react';
import { useToast, useStore } from '../store/store';

export const SecretsManager = () => {
  const [keys, setKeys] = useState<string[]>([]);
  const [newKey, setNewKey] = useState('');
  const [newVal, setNewVal] = useState('');
  const [cmd, setCmd] = useState('echo "My secret is: %MY_API_KEY%"');
  const [selectedKeys, setSelectedKeys] = useState<string[]>([]);
  const [cmdOutput, setCmdOutput] = useState('');
  const { success, error } = useToast();
  const setSecretsCount = useStore(s => s.setSecretsCount);

  const fetchKeys = useCallback(async () => {
    try {
      const k = await invoke<string[]>('list_secret_keys');
      setKeys(k);
      setSecretsCount(k.length);
    } catch (e: any) {
      error('Failed to fetch keys', String(e));
    }
  }, [setSecretsCount, error]);

  useEffect(() => {
    fetchKeys();
  }, [fetchKeys]);

  const addSecret = async () => {
    if (!newKey || !newVal) return;
    try {
      await invoke('add_secret', { key: newKey, value: newVal });
      setNewKey('');
      setNewVal('');
      fetchKeys();
      success(`Secret ${newKey} stored in OS Keyring`);
    } catch (e: any) {
      error('Failed to add secret', String(e));
    }
  };

  const removeSecret = async (key: string) => {
    try {
      await invoke('remove_secret', { key });
      setSelectedKeys(prev => prev.filter(k => k !== key));
      fetchKeys();
      success(`Secret ${key} removed from OS Keyring`);
    } catch (e: any) {
      error('Failed to remove secret', String(e));
    }
  };

  const importEnvFile = async () => {
    try {
      const path = await open({ filters: [{ name: 'Env', extensions: ['env', 'txt'] }] });
      if (!path) return;
      
      const content = await invoke<string>('read_file_text', { path });
      const lines = content.split('\n').filter(l => l.includes('=') && !l.startsWith('#'));
      
      let imported = 0;
      for (const line of lines) {
        const [key, ...valueParts] = line.split('=');
        if (key && key.trim()) {
          await invoke('add_secret', { key: key.trim(), value: valueParts.join('=').trim() });
          imported++;
        }
      }
      
      fetchKeys();
      if (imported > 0) {
        success(`Imported ${imported} secrets from .env file`);
      } else {
        error('No valid secrets found in file', '');
      }
    } catch (e: any) {
      error('Failed to import .env file', String(e));
    }
  };

  const exportEnvFile = async () => {
    try {
      const path = await save({ defaultPath: '.env', filters: [{ name: 'Env', extensions: ['env'] }] });
      if (!path) return;
      
      await invoke('export_secrets_to_env', { outputPath: path });
      success('Secrets exported successfully');
    } catch (e: any) {
      error('Failed to export .env file', String(e));
    }
  };

  const toggleKeySelection = useCallback((key: string) => {
    setSelectedKeys(prev => {
      if (prev.includes(key)) {
        return prev.filter(k => k !== key);
      } else {
        return [...prev, key];
      }
    });
  }, []);

  const executeCmd = async () => {
    setCmdOutput('Executing...');
    try {
      const out = await invoke<string>('run_with_secrets', { 
        cmd, 
        requiredKeys: selectedKeys 
      });
      setCmdOutput(out);
    } catch (e: any) {
      setCmdOutput(`Error: ${e}`);
    }
  };

  return (
    <div className="flex h-full w-full bg-[#0a0f18] text-white">
      {/* Secrets Vault */}
      <div className="w-1/2 border-r border-white/10 p-6 flex flex-col gap-6">
        <div>
          <div className="flex items-center gap-2 mb-2">
            <h2 className="font-bold text-yellow-500 text-xl">Secrets Manager</h2>
            <div className="flex items-center gap-1 bg-green-500/20 text-green-400 border border-green-500/30 px-2 py-0.5 rounded text-xs font-bold">
              <Lock size={12} />
              Secured by OS Keyring
            </div>
          </div>
          <p className="text-sm text-gray-400">Store API keys safely using native OS persistence. No plaintext `.env` files lying around.</p>
        </div>

        <div className="flex gap-2">
          <button 
            onClick={importEnvFile}
            className="flex items-center gap-2 px-3 py-1.5 bg-blue-600/20 hover:bg-blue-600/30 text-blue-400 border border-blue-500/30 rounded text-xs font-bold transition-colors"
          >
            <Upload size={14} /> Import .env
          </button>
          <button 
            onClick={exportEnvFile}
            disabled={keys.length === 0}
            className="flex items-center gap-2 px-3 py-1.5 bg-purple-600/20 hover:bg-purple-600/30 disabled:opacity-50 text-purple-400 border border-purple-500/30 rounded text-xs font-bold transition-colors"
          >
            <Download size={14} /> Export .env
          </button>
        </div>

        <div className="flex gap-2">
          <input 
            type="text"
            placeholder="KEY_NAME (e.g. AWS_ACCESS_KEY)"
            value={newKey}
            onChange={e => setNewKey(e.target.value)}
            className="w-1/2 bg-black/50 border border-white/10 rounded p-2 text-white font-mono text-xs focus:border-yellow-500 focus:outline-none"
          />
          <input 
            type="password"
            placeholder="Super Secret Value..."
            value={newVal}
            onChange={e => setNewVal(e.target.value)}
            className="w-1/2 bg-black/50 border border-white/10 rounded p-2 text-white font-mono text-xs focus:border-yellow-500 focus:outline-none"
          />
          <button 
            onClick={addSecret}
            className="px-4 py-2 bg-yellow-600 hover:bg-yellow-500 text-black font-bold rounded transition-colors text-xs"
          >
            Add
          </button>
        </div>

        <div className="flex-1 overflow-y-auto flex flex-col gap-2">
          {keys.map(k => (
            <div key={k} className="flex justify-between items-center bg-black border border-white/10 rounded p-3 group hover:border-white/20 transition-colors">
              <div className="flex flex-col gap-1">
                <span className="font-mono text-sm text-yellow-300">{k}</span>
                <span className="text-[10px] text-green-500/70 uppercase tracking-wider font-bold">Persistent</span>
              </div>
              <div className="flex items-center gap-4">
                <span className="font-mono text-xs text-gray-500">****************</span>
                <button 
                  onClick={() => removeSecret(k)}
                  className="text-gray-500 hover:text-red-400 transition-colors"
                  title="Delete Secret"
                >
                  <Trash2 size={16} />
                </button>
              </div>
            </div>
          ))}
          {keys.length === 0 && <div className="text-gray-500 text-sm italic">No secrets in vault. Import a .env file or add one manually.</div>}
        </div>
      </div>

      {/* Script Injector */}
      <div className="w-1/2 p-6 flex flex-col gap-6 bg-black/40">
        <div>
          <h2 className="font-bold text-yellow-500 text-xl mb-2">Environment Injector</h2>
          <p className="text-sm text-gray-400">Run scripts with secrets securely injected into the environment at runtime.</p>
        </div>

        <div>
          <label className="text-xs font-bold text-gray-500 uppercase tracking-widest mb-2 block">Command / Script</label>
          <textarea 
            value={cmd}
            onChange={e => setCmd(e.target.value)}
            className="w-full bg-black/50 border border-white/10 rounded p-3 text-white font-mono text-sm focus:border-yellow-500 focus:outline-none h-24 mb-4"
          />

          <label className="text-xs font-bold text-gray-500 uppercase tracking-widest mb-2 block">Required Secrets (Will be injected)</label>
          <div className="flex flex-wrap gap-2 mb-6">
            {keys.map(k => (
              <button 
                key={k}
                onClick={() => toggleKeySelection(k)}
                className={`px-3 py-1 rounded-full text-xs font-mono font-bold transition-colors ${selectedKeys.includes(k) ? 'bg-yellow-500 text-black' : 'bg-white/10 text-gray-400 hover:bg-white/20'}`}
              >
                {k}
              </button>
            ))}
            {keys.length === 0 && <span className="text-xs text-gray-600">No secrets available</span>}
          </div>

          <button 
            onClick={executeCmd}
            className="w-full px-4 py-3 bg-yellow-600 hover:bg-yellow-500 text-black rounded font-bold transition-colors shadow-[0_0_15px_rgba(234,179,8,0.3)]"
          >
            Launch Command
          </button>
        </div>

        <div className="flex-1 flex flex-col gap-2">
          <label className="text-xs font-bold text-gray-500 uppercase tracking-widest block">Output</label>
          <div className="flex-1 bg-black rounded-lg border border-white/10 p-4 font-mono text-xs text-gray-300 overflow-y-auto whitespace-pre">
            {cmdOutput}
          </div>
        </div>
      </div>
    </div>
  );
};
