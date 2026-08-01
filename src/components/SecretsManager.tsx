import { useState, useEffect } from 'react';
import { invoke } from '@tauri-apps/api/core';

export const SecretsManager = () => {
  const [keys, setKeys] = useState<string[]>([]);
  const [newKey, setNewKey] = useState('');
  const [newVal, setNewVal] = useState('');
  const [cmd, setCmd] = useState('echo "My secret is: %MY_API_KEY%"');
  const [selectedKeys, setSelectedKeys] = useState<string[]>([]);
  const [cmdOutput, setCmdOutput] = useState('');

  const fetchKeys = async () => {
    try {
      const k = await invoke<string[]>('list_secret_keys');
      setKeys(k);
    } catch (e) {
      console.error(e);
    }
  };

  useEffect(() => {
    fetchKeys();
  }, []);

  const addSecret = async () => {
    if (!newKey || !newVal) return;
    try {
      await invoke('add_secret', { key: newKey, value: newVal });
      setNewKey('');
      setNewVal('');
      fetchKeys();
    } catch (e) {
      console.error(e);
    }
  };

  const removeSecret = async (key: string) => {
    try {
      await invoke('remove_secret', { key });
      setSelectedKeys(prev => prev.filter(k => k !== key));
      fetchKeys();
    } catch (e) {
      console.error(e);
    }
  };

  const toggleKeySelection = (key: string) => {
    if (selectedKeys.includes(key)) {
      setSelectedKeys(prev => prev.filter(k => k !== key));
    } else {
      setSelectedKeys(prev => [...prev, key]);
    }
  };

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
          <h2 className="font-bold text-yellow-500 text-xl mb-2">Secrets Manager</h2>
          <p className="text-sm text-gray-400">Store API keys safely in memory. No plaintext `.env` files.</p>
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
            <div key={k} className="flex justify-between items-center bg-black border border-white/10 rounded p-3">
              <span className="font-mono text-sm text-yellow-300">{k}</span>
              <div className="flex items-center gap-4">
                <span className="font-mono text-xs text-gray-500">****************</span>
                <button 
                  onClick={() => removeSecret(k)}
                  className="text-red-400 hover:text-red-300 text-xs font-bold"
                >
                  Delete
                </button>
              </div>
            </div>
          ))}
          {keys.length === 0 && <div className="text-gray-500 text-sm italic">No secrets in memory vault.</div>}
        </div>
      </div>

      {/* Script Injector */}
      <div className="w-1/2 p-6 flex flex-col gap-6 bg-black/40">
        <div>
          <h2 className="font-bold text-yellow-500 text-xl mb-2">Environment Injector</h2>
          <p className="text-sm text-gray-400">Run scripts with secrets injected at runtime.</p>
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
