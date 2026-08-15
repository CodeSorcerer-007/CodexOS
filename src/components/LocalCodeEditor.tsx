import { useState, useEffect } from 'react';
import Editor from '@monaco-editor/react';
import { invoke } from '@tauri-apps/api/core';
import { useStore, useToast } from '../store/store';
import { Save, FileCode2, TerminalSquare, X, Folder, File } from 'lucide-react';
import { TerminalPane } from './TerminalMultiplexer';

interface FileInfo {
  name: string;
  path: string;
  is_dir: boolean;
  size_bytes: number;
}

export const LocalCodeEditor = () => {
  const currentPath = useStore(s => s.currentPath);
  const selectedFile = useStore(s => s.selectedFile);
  const openFiles = useStore(s => s.openFiles);
  const openFile = useStore(s => s.openFile);
  const closeFile = useStore(s => s.closeFile);
  const setSelectedFile = useStore(s => s.setSelectedFile);
  const shell = useStore(s => s.settings.terminalShell);
  const { success: toastSuccess, error: toastError } = useToast();
  
  const [content, setContent] = useState('');
  const [language, setLanguage] = useState('javascript');
  const [isSaving, setIsSaving] = useState(false);
  const [files, setFiles] = useState<FileInfo[]>([]);
  const [showTerminal, setShowTerminal] = useState(true);

  // Load left sidebar files
  useEffect(() => {
    if (!currentPath) return;
    
    if (currentPath.startsWith('ssh://')) {
      const withoutPrefix = currentPath.replace('ssh://', '');
      const firstSlash = withoutPrefix.indexOf('/');
      if (firstSlash !== -1) {
        const connection = withoutPrefix.substring(0, firstSlash);
        const path = withoutPrefix.substring(firstSlash);
        invoke<FileInfo[]>('ssh_list_dir', { connection, path })
          .then(setFiles)
          .catch(e => console.error(e));
      }
    } else {
      invoke<FileInfo[]>('get_files_in_dir', { path: currentPath })
        .then(setFiles)
        .catch(e => console.error(e));
    }
  }, [currentPath]);

  // Load selected file content
  useEffect(() => {
    if (!selectedFile) {
      setContent('');
      return;
    }
    
    // detect language
    const lower = selectedFile.toLowerCase();
    if (lower.endsWith('.ts') || lower.endsWith('.tsx')) setLanguage('typescript');
    else if (lower.endsWith('.js') || lower.endsWith('.jsx') || lower.endsWith('.mjs')) setLanguage('javascript');
    else if (lower.endsWith('.rs')) setLanguage('rust');
    else if (lower.endsWith('.py')) setLanguage('python');
    else if (lower.endsWith('.sql')) setLanguage('sql');
    else if (lower.endsWith('.sh') || lower.endsWith('.bash') || lower.endsWith('.zsh')) setLanguage('shell');
    else if (lower.endsWith('.yaml') || lower.endsWith('.yml')) setLanguage('yaml');
    else if (lower.endsWith('.toml')) setLanguage('ini');
    else if (lower.endsWith('.json')) setLanguage('json');
    else if (lower.endsWith('.md')) setLanguage('markdown');
    else if (lower.endsWith('.html') || lower.endsWith('.htm')) setLanguage('html');
    else if (lower.endsWith('.css') || lower.endsWith('.scss')) setLanguage('css');
    else if (lower.endsWith('.cpp') || lower.endsWith('.cc') || lower.endsWith('.c') || lower.endsWith('.h') || lower.endsWith('.hpp')) setLanguage('cpp');
    else if (lower.endsWith('.go')) setLanguage('go');
    else if (lower.endsWith('.xml') || lower.endsWith('.svg')) setLanguage('xml');
    else setLanguage('plaintext');

    if (selectedFile.startsWith('ssh://')) {
      const withoutPrefix = selectedFile.replace('ssh://', '');
      const firstSlash = withoutPrefix.indexOf('/');
      if (firstSlash !== -1) {
        const connection = withoutPrefix.substring(0, firstSlash);
        const path = withoutPrefix.substring(firstSlash);
        invoke<string>('ssh_read_file_text', { connection, path })
          .then(setContent)
          .catch(e => console.error(e.toString()));
      }
    } else {
      invoke<string>('read_file_text', { path: selectedFile })
        .then(setContent)
        .catch(e => console.error(e.toString()));
    }
  }, [selectedFile]);

  const handleSave = async () => {
    if (!selectedFile) return;
    setIsSaving(true);
    try {
      if (selectedFile.startsWith('ssh://')) {
        const withoutPrefix = selectedFile.replace('ssh://', '');
        const firstSlash = withoutPrefix.indexOf('/');
        if (firstSlash !== -1) {
          const connection = withoutPrefix.substring(0, firstSlash);
          const path = withoutPrefix.substring(firstSlash);
          await invoke('ssh_write_file_text', { connection, path, content });
        }
      } else {
        await invoke('write_file_text', { path: selectedFile, content });
      }
      toastSuccess('File saved', selectedFile.split(/[/\\]/).pop() || selectedFile);
    } catch (e: unknown) {
      toastError('Save failed', e instanceof Error ? e.message : String(e));
    } finally {
      setIsSaving(false);
    }
  };

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 's') {
        e.preventDefault();
        handleSave();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [content, selectedFile]);

  return (
    <div className="flex h-full w-full bg-[#050505] text-white">
      {/* File Tree Sidebar */}
      <div className="w-64 border-r border-white/10 bg-[#0a0f18] flex flex-col h-full overflow-y-auto pt-2 shrink-0">
        <div className="px-4 py-2 font-bold text-xs text-gray-500 uppercase tracking-widest border-b border-white/5 mb-2">
          EXPLORER
        </div>
        {files.map(file => (
          <button
            key={file.path}
            onClick={() => {
              if (file.is_dir) {
                useStore.getState().setCurrentPath(file.path);
              } else {
                openFile(file.path);
              }
            }}
            className={`flex items-center gap-2 px-4 py-1.5 text-sm text-left hover:bg-white/5 transition-colors
              ${selectedFile === file.path ? 'bg-indigo-500/20 text-indigo-300' : 'text-gray-400'}
            `}
          >
            {file.is_dir ? <Folder className="w-4 h-4 text-cyan-500 shrink-0" /> : <File className="w-4 h-4 shrink-0" />}
            <span className="truncate">{file.name}</span>
          </button>
        ))}
        {files.length === 0 && currentPath && (
          <div className="px-4 py-2 text-xs text-gray-600">Folder is empty</div>
        )}
        {!currentPath && (
          <div className="px-4 py-2 text-xs text-gray-600">No workspace selected</div>
        )}
      </div>

      {/* Main Editor Area */}
      <div className="flex-1 flex flex-col min-w-0">
        
        {/* Editor Tabs */}
        <div className="flex bg-[#0a0f18] border-b border-white/10 overflow-x-auto no-scrollbar shrink-0 h-10">
          {openFiles.map((path: string) => {
            const fileName = path.split(/[/\\]/).pop();
            const isActive = selectedFile === path;
            return (
              <div 
                key={path}
                className={`flex items-center gap-2 px-3 border-r border-white/10 cursor-pointer text-sm
                  ${isActive ? 'bg-[#1e1e1e] text-indigo-300 border-t-2 border-t-indigo-500' : 'text-gray-500 hover:bg-white/5'}
                `}
                onClick={() => setSelectedFile(path)}
              >
                <FileCode2 className="w-4 h-4" />
                <span className="whitespace-nowrap">{fileName}</span>
                <button 
                  onClick={(e) => { e.stopPropagation(); closeFile(path); }}
                  className="p-0.5 rounded-sm hover:bg-white/10 ml-2"
                >
                  <X className="w-3 h-3" />
                </button>
              </div>
            )
          })}
        </div>

        {/* Editor or Empty State */}
        <div className="flex-1 min-h-0 bg-[#1e1e1e] relative">
          {!selectedFile ? (
            <div className="flex flex-col items-center justify-center h-full text-gray-600">
              <FileCode2 className="w-16 h-16 mb-4 opacity-20" />
              <p>Select a file to edit</p>
            </div>
          ) : (
            <Editor
              height="100%"
              language={language}
              theme="vs-dark"
              value={content}
              onChange={(val) => setContent(val || '')}
              options={{
                minimap: { enabled: false },
                fontSize: 14,
                fontFamily: "'JetBrains Mono', 'Fira Code', monospace",
                wordWrap: 'on',
                padding: { top: 16 },
                automaticLayout: true,
              }}
            />
          )}
          
          {/* Quick Actions overlay */}
          {selectedFile && (
            <div className="absolute top-4 right-6 z-10 flex gap-2">
              <button
                onClick={handleSave}
                disabled={isSaving}
                className="flex items-center gap-2 px-3 py-1.5 bg-indigo-500/20 hover:bg-indigo-500/40 text-indigo-300 rounded border border-indigo-500/30 transition-colors text-sm shadow-lg backdrop-blur-md"
              >
                <Save className="w-4 h-4" />
                {isSaving ? 'Saving...' : 'Save'}
              </button>
            </div>
          )}
        </div>

        {/* Integrated Terminal */}
        {showTerminal && (
          <div className="h-64 border-t border-white/10 flex flex-col shrink-0">
            <div className="flex items-center justify-between px-4 py-1.5 bg-[#0a0f18] border-b border-white/10 shrink-0">
              <div className="flex items-center gap-2 text-xs font-bold text-gray-500 uppercase">
                <TerminalSquare className="w-4 h-4" />
                Integrated Terminal
              </div>
              <button onClick={() => setShowTerminal(false)} className="text-gray-500 hover:text-white">
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="flex-1 bg-black overflow-hidden relative">
              <TerminalPane id="ide-terminal" onClose={() => setShowTerminal(false)} showClose={false} shell={shell} cwd={currentPath} />
            </div>
          </div>
        )}

        {/* Status Bar */}
        <div className="h-6 bg-indigo-900/40 border-t border-indigo-500/30 flex items-center justify-between px-3 text-xs text-indigo-300 shrink-0">
          <div className="flex items-center gap-4">
            <button onClick={() => setShowTerminal(!showTerminal)} className="hover:text-white flex items-center gap-1">
              <TerminalSquare className="w-3 h-3" />
              Terminal
            </button>
            <span>Language: {language}</span>
          </div>
          <div>
            CodexOS IDE
          </div>
        </div>
      </div>
    </div>
  );
};
