import { useState, useEffect } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { useStore, useToast } from '../store/store';
import { Settings, Save, Key, FileText, Eye, EyeOff, Plus, Trash2 } from 'lucide-react';

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
  const [newFileName, setNewFileName] = useState('');
  const [showNewFileModal, setShowNewFileModal] = useState(false);
  const { error: toastError, success: toastSuccess } = useToast();

  const loadEnvFiles = async () => {
    if (!currentPath) return;
    try {
      const allFiles = await invoke<FileInfo[]>('get_files_in_dir', { path: currentPath });
      setEnvFiles(allFiles.filter(f => !f.is_dir && f.name.startsWith('.env')));
    } catch (e) {
      console.error('Failed to list workspace files in EnvManager:', e);
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
      .catch(e => {
        console.error(e);
        toastError('Read Failed', String(e));
      });
  }, [selectedFile, toastError]);

  const handleSave = async () => {
    if (!selectedFile) return;
    setIsSaving(true);
    try {
      await invoke('write_file_text', { path: selectedFile, content });
      toastSuccess('Env Saved', `${selectedFile.split(/[/\\]/).pop()} saved successfully.`);
    } catch (e: unknown) {
      toastError('Save Failed', e instanceof Error ? e.message : String(e));
    } finally {
      setIsSaving(false);
    }
  };

  const handleAddVariable = () => {
    const trimmed = content.trim();
    const updated = trimmed ? `${trimmed}\nNEW_KEY=value` : 'NEW_KEY=value';
    setContent(updated);
  };

  const handleDeleteLine = (index: number) => {
    const lines = content.split('\n');
    lines.splice(index, 1);
    setContent(lines.join('\n'));
  };

  const handleCreateFile = async () => {
    if (!currentPath || !newFileName.trim()) return;
    const cleanName = newFileName.trim().startsWith('.env') ? newFileName.trim() : `.env.${newFileName.trim()}`;
    const separator = currentPath.includes('/') ? '/' : '\\';
    const filePath = `${currentPath}${separator}${cleanName}`;

    try {
      await invoke('create_file', { path: filePath });
      await invoke('write_file_text', { path: filePath, content: '# Environment Variables\n' });
      toastSuccess('Created File', `Created ${cleanName}`);
      setNewFileName('');
      setShowNewFileModal(false);
      await loadEnvFiles();
      setSelectedFile(filePath);
    } catch (e: unknown) {
      toastError('Create Error', e instanceof Error ? e.message : String(e));
    }
  };

  // Parse .env content into key/value pairs
  const lines = content.split('\n');

  return (
    <div className="flex h-full w-full bg-[#050505] text-white">
      {/* Sidebar List */}
      <div className="w-64 border-r border-white/10 bg-[#0a0f18] flex flex-col p-4">
        <div className="flex items-center justify-between mb-4">
          <h2 className="font-bold text-teal-400 flex items-center gap-2">
            <Key className="w-4 h-4" />
            Env Manager
          </h2>
          <button
            onClick={() => setShowNewFileModal(true)}
            className="p-1 text-teal-400 hover:bg-teal-500/20 rounded border border-teal-500/30 transition-colors"
            title="Create new .env file"
          >
            <Plus className="w-3.5 h-3.5" />
          </button>
        </div>

        {showNewFileModal && (
          <div className="mb-4 p-3 bg-black/60 border border-teal-500/40 rounded-xl space-y-2">
            <input
              type="text"
              placeholder=".env.local"
              value={newFileName}
              onChange={e => setNewFileName(e.target.value)}
              className="w-full bg-black/40 border border-white/10 rounded px-2 py-1 text-xs font-mono outline-none focus:border-teal-500"
            />
            <div className="flex gap-2 justify-end">
              <button
                onClick={() => setShowNewFileModal(false)}
                className="px-2 py-1 text-xs text-gray-400 hover:text-white"
              >
                Cancel
              </button>
              <button
                onClick={handleCreateFile}
                disabled={!newFileName.trim()}
                className="px-2 py-1 bg-teal-600 hover:bg-teal-500 disabled:opacity-50 text-xs text-white rounded font-medium"
              >
                Create
              </button>
            </div>
          </div>
        )}

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
                  onClick={handleAddVariable}
                  className="flex items-center gap-1.5 px-3 py-1.5 bg-white/5 hover:bg-white/10 text-teal-300 rounded border border-white/10 transition-colors text-sm"
                >
                  <Plus className="w-4 h-4" /> Add Variable
                </button>
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
                      <div key={i} className="flex items-center gap-2">
                        <input 
                          type="text"
                          value={line}
                          onChange={(e) => {
                            const newLines = [...lines];
                            newLines[i] = e.target.value;
                            setContent(newLines.join('\n'));
                          }}
                          className="flex-1 bg-transparent text-gray-500 font-mono text-sm px-2 py-1 outline-none focus:bg-white/5 rounded"
                        />
                        <button onClick={() => handleDeleteLine(i)} className="p-1 text-gray-600 hover:text-red-400">
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
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
                      <button onClick={() => handleDeleteLine(i)} className="p-1.5 text-gray-500 hover:text-red-400 hover:bg-red-500/10 rounded">
                        <Trash2 className="w-4 h-4" />
                      </button>
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
