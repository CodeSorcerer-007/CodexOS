import { useState, useEffect } from 'react';
import { invoke } from '@tauri-apps/api/core';
import Editor from '@monaco-editor/react';
import { useToast } from '../store/store';

interface ZipEntryInfo {
  name: string;
  is_dir: boolean;
  size: number;
}

interface ArchiveBrowserProps {
  zipPath: string;
}

export const ArchiveBrowser = ({ zipPath }: ArchiveBrowserProps) => {
  const [entries, setEntries] = useState<ZipEntryInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const { error: toastError } = useToast();
  
  const [previewFile, setPreviewFile] = useState<string | null>(null);
  const [previewContent, setPreviewContent] = useState<string | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);

  useEffect(() => {
    setLoading(true);
    invoke<ZipEntryInfo[]>('list_zip_contents', { path: zipPath })
      .then(res => setEntries(res))
      .catch(e => {
        setError(String(e));
        toastError('Archive Read Error', String(e));
      })
      .finally(() => setLoading(false));
  }, [zipPath, toastError]);

  const handlePreview = async (entryName: string) => {
    setPreviewFile(entryName);
    setPreviewContent(null);
    setPreviewLoading(true);
    
    try {
      const content = await invoke<string>('read_zip_file', { zipPath, internalPath: entryName });
      setPreviewContent(content);
    } catch (e: any) {
      setPreviewContent(`// Failed to preview file: ${e}\n// Note: Vaultly currently supports previewing text/code files within archives.`);
      toastError('Preview Error', String(e));
    } finally {
      setPreviewLoading(false);
    }
  };

  const getLanguage = (fileName: string) => {
    if (fileName.endsWith('.js') || fileName.endsWith('.jsx')) return 'javascript';
    if (fileName.endsWith('.ts') || fileName.endsWith('.tsx')) return 'typescript';
    if (fileName.endsWith('.rs')) return 'rust';
    if (fileName.endsWith('.html')) return 'html';
    if (fileName.endsWith('.css')) return 'css';
    if (fileName.endsWith('.json')) return 'json';
    if (fileName.endsWith('.md')) return 'markdown';
    return 'plaintext';
  };

  return (
    <div className="h-full flex flex-col bg-black/40 text-gray-200">
      <div className="p-4 border-b border-white/10 flex items-center justify-between">
        <span className="text-sm font-bold text-blue-400">Virtual Archive Mounted</span>
        <span className="text-xs text-gray-500 font-mono truncate max-w-md">{zipPath}</span>
      </div>

      <div className="flex-1 flex overflow-hidden">
        {/* Sidebar: File List */}
        <div className="w-1/3 border-r border-white/10 flex flex-col">
          <div className="p-2 border-b border-white/5 text-xs font-bold text-gray-400 uppercase tracking-wider">
            Archive Contents ({entries.length})
          </div>
          <div className="flex-1 overflow-y-auto p-2">
            {loading ? (
              <div className="text-gray-500 text-sm p-4 animate-pulse">Mounting archive...</div>
            ) : error ? (
              <div className="text-red-400 text-sm p-4 font-mono">{error}</div>
            ) : entries.length === 0 ? (
              <div className="text-gray-500 text-sm p-4 italic">Empty archive</div>
            ) : (
              <div className="flex flex-col gap-1">
                {entries.map((entry, idx) => (
                  <div 
                    key={idx}
                    onClick={() => !entry.is_dir && handlePreview(entry.name)}
                    className={`flex items-center justify-between p-2 rounded text-sm transition-colors ${
                      entry.is_dir ? 'text-blue-300' : 'text-gray-300 hover:bg-white/10 cursor-pointer'
                    } ${previewFile === entry.name ? 'bg-blue-500/20 text-blue-400' : ''}`}
                  >
                    <span className="truncate">{entry.is_dir ? `📁 ${entry.name}` : `📄 ${entry.name}`}</span>
                    {!entry.is_dir && <span className="text-xs text-gray-600">{(entry.size / 1024).toFixed(1)}kb</span>}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Main Area: Preview */}
        <div className="flex-1 flex flex-col bg-black/60 relative">
          {previewFile ? (
            previewLoading ? (
              <div className="absolute inset-0 flex items-center justify-center text-blue-400 animate-pulse">
                Extracting stream to memory...
              </div>
            ) : (
              <div className="flex-1">
                <div className="p-2 border-b border-white/5 bg-white/5 flex items-center gap-2 text-xs font-mono text-gray-400">
                  <span>Streamed Preview:</span>
                  <span className="text-blue-300">{previewFile}</span>
                </div>
                <div className="h-[calc(100%-36px)]">
                  <Editor
                    height="100%"
                    language={getLanguage(previewFile)}
                    theme="vs-dark"
                    value={previewContent || ''}
                    options={{
                      readOnly: true,
                      minimap: { enabled: false },
                      scrollBeyondLastLine: false,
                      fontSize: 14,
                      fontFamily: "'JetBrains Mono', 'Fira Code', monospace"
                    }}
                  />
                </div>
              </div>
            )
          ) : (
            <div className="flex-1 flex items-center justify-center text-gray-500 text-sm">
              Select a file from the archive to preview its contents instantly.
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
