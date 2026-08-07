import { useState, useEffect } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { useStore } from '../store/store';
import { Settings, Save, Key, FileText, Eye, EyeOff } from 'lucide-react';

interface FileInfo {
  name: string;
  path: string;
  is_dir: boolean;
  size_bytes: number;
}

export const EnvManager = () => {
  const currentPath = useStore(s => s.currentPath);
  const [envFiles, setEnvFiles] = useState<FileInfo[]>([]);
  const [selectedFile, setSelectedFile] = useState<string | null>(null);
  const [content, setContent] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [showValues, setShowValues] = useState(false);
  const { addToast } = useStore.getState();

  const loadEnvFiles = async () => {
    if (!currentPath) return;
    try {
      const allFiles = await invoke<FileInfo[]>('list_dir', { path: currentPath });
      setEnvFiles(allFiles.filter(f => !f.is_dir && f.name.startsWith('.env')));
    } catch (e) {
      console.error(e);
    }
  };

  useEffect(() => {
    loadEnvFiles();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentPath]);

  useEffect(() => {
    if (!selectedFile) {
      setContent('');
      return;
    }
    invoke<string>('read_file_text', { path: selectedFile })
      .then(setContent)
      .catch(e => console.error(e));
  }, [selectedFile]);

  const handleSave = async () => {
    if (!selectedFile) return;
    setIsSaving(true);
    try {
      await invoke('write_file_text', { path: selectedFile, content });
      addToast({ type: 'success', title: 'Env file saved' });
    } catch (e: unknown) {
      addToast({ type: 'error', title: 'Save failed', message: String(e) });
    } finally {
      setIsSaving(false);
    }
  };

  // Parse .env content into key/value pairs
  const lines = content.split('\n');

  return (
    <div className="flex h-full w-full bg-[#050505] text-white">
      {/* Sidebar List */}
      <div className="w-64 border-r border-white/10 bg-[#0a0f18] flex flex-col p-4">
        <h2 className="font-bold text-teal-400 mb-4 flex items-center gap-2">
          <Key className="w-4 h-4" />
          Env Manager
        </h2>
        <div className="flex-1 flex flex-col gap-2 overflow-y-auto no-scrollbar">
          {envFiles.map(f => (
            <div 
              key={f.path}
              onClick={() => setSelectedFile(f.path)}
              className={`flex items-center gap-3 p-3 rounded-xl border cursor-pointer transition-all
                ${selectedFile === f.path ? 'bg-teal-500/20 border-teal-500/50 text-teal-300' : 'bg-black/40 border-white/10 hover:border-white/30 text-gray-400'}
              `}
            >
              <FileText className="w-4 h-4 shrink-0" />
              <span className="font-medium text-sm truncate">{f.name}</span>
            </div>
          ))}
          {envFiles.length === 0 && (
            <div className="text-gray-500 text-sm text-center mt-10">No .env files found in current workspace.</div>
          )}
        </div>
      </div>

      {/* Main Content */}
      <div className="flex-1 flex flex-col bg-[#0a0f18]">
        {selectedFile ? (
          <>
            <div className="p-4 border-b border-white/10 shrink-0 flex items-center justify-between">
              <h3 className="font-bold text-lg text-white">{selectedFile.split(/[/\\]/).pop()}</h3>
              <div className="flex gap-2">
                <button
                  onClick={() => setShowValues(!showValues)}
                  className="flex items-center gap-2 px-3 py-1.5 bg-white/5 hover:bg-white/10 text-gray-300 rounded border border-white/10 transition-colors text-sm"
                >
                  {showValues ? <><EyeOff className="w-4 h-4" /> Hide Values</> : <><Eye className="w-4 h-4" /> Show Values</>}
                </button>
                <button
                  onClick={handleSave}
                  disabled={isSaving}
                  className="flex items-center gap-2 px-3 py-1.5 bg-teal-500/20 hover:bg-teal-500/40 text-teal-300 rounded border border-teal-500/30 transition-colors text-sm shadow-lg backdrop-blur-md"
                >
                  <Save className="w-4 h-4" />
                  {isSaving ? 'Saving...' : 'Save'}
                </button>
              </div>
            </div>

            <div className="flex-1 overflow-y-auto p-4 bg-[#050505]">
              <div className="max-w-4xl mx-auto space-y-2">
                {lines.map((line, i) => {
                  const isComment = line.trim().startsWith('#');
                  if (isComment || !line.includes('=')) {
                    return (
                      <input 
                        key={i}
                        type="text"
                        value={line}
                        onChange={(e) => {
                          const newLines = [...lines];
                          newLines[i] = e.target.value;
                          setContent(newLines.join('\n'));
                        }}
                        className="w-full bg-transparent text-gray-500 font-mono text-sm px-2 py-1 outline-none focus:bg-white/5 rounded"
                      />
                    );
                  }
                  
                  const splitIdx = line.indexOf('=');
                  const key = line.substring(0, splitIdx);
                  const val = line.substring(splitIdx + 1);
                  
                  return (
                    <div key={i} className="flex items-center gap-2">
                      <input 
                        type="text"
                        value={key}
                        onChange={(e) => {
                          const newLines = [...lines];
                          newLines[i] = `${e.target.value}=${val}`;
                          setContent(newLines.join('\n'));
                        }}
                        className="w-1/3 bg-black/40 text-teal-300 font-bold font-mono text-sm px-3 py-2 rounded border border-white/10 outline-none focus:border-teal-500"
                      />
                      <span className="text-gray-500">=</span>
                      <input 
                        type={showValues ? "text" : "password"}
                        value={val}
                        onChange={(e) => {
                          const newLines = [...lines];
                          newLines[i] = `${key}=${e.target.value}`;
                          setContent(newLines.join('\n'));
                        }}
                        className="flex-1 bg-black/40 text-green-400 font-mono text-sm px-3 py-2 rounded border border-white/10 outline-none focus:border-green-500"
                      />
                    </div>
                  );
                })}
              </div>
            </div>
          </>
        ) : (
          <div className="flex flex-col items-center justify-center h-full text-gray-600">
            <Settings className="w-16 h-16 mb-4 opacity-20" />
            <p>Select a .env file to configure</p>
          </div>
        )}
      </div>
    </div>
  );
};
