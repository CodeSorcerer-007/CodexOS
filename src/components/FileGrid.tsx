import { motion } from 'framer-motion';
import { useState, useEffect } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { GitContextMenu } from './GitContextMenu';

interface FileInfo {
  name: string;
  path: string;
  is_dir: boolean;
  size_bytes: number;
}

const staggerContainer = {
  hidden: { opacity: 0 },
  show: { opacity: 1, transition: { staggerChildren: 0.05 } }
};

const slideUpItem = {
  hidden: { opacity: 0, y: 20 },
  show: { opacity: 1, y: 0, transition: { type: "spring" as const, stiffness: 300, damping: 25 } }
};

const formatSize = (bytes: number) => {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
};

export const FileGrid = ({ 
  currentPath, 
  onNavigate, 
  selectedFile, 
  onSelect,
  onHashVerify,
  onFormatConvert,
  onAddToShelf,
  onOptimizeAsset
}: { 
  currentPath: string; 
  onNavigate: (path: string) => void;
  selectedFile: string | null; 
  onSelect: (path: string) => void;
  onHashVerify?: (path: string) => void;
  onFormatConvert?: (path: string, targetFormat: string) => void;
  onAddToShelf?: (path: string) => void;
  onOptimizeAsset?: (path: string) => void;
}) => {
  const [files, setFiles] = useState<FileInfo[]>([]);
  const [gitStatus, setGitStatus] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');
  
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; path: string } | null>(null);

  useEffect(() => {
    loadFiles();
  }, [currentPath]);

  const loadFiles = async () => {
    setLoading(true);
    try {
      if (currentPath.startsWith('ssh://')) {
        const withoutPrefix = currentPath.replace('ssh://', '');
        const firstSlash = withoutPrefix.indexOf('/');
        if (firstSlash !== -1) {
          const connection = withoutPrefix.substring(0, firstSlash);
          const path = withoutPrefix.substring(firstSlash);
          const result = await invoke<FileInfo[]>('ssh_list_dir', { connection, path });
          // Ensure the path in FileInfo objects retains the ssh:// prefix so click navigation works
          const mappedResult = result.map(f => ({
            ...f,
            path: `ssh://${connection}${f.path}`
          }));
          setFiles(mappedResult);
          setGitStatus({});
        }
      } else {
        const result = await invoke<FileInfo[]>('get_files_in_dir', { path: currentPath });
        setFiles(result);
        
        try {
          const statuses = await invoke<Record<string, string>>('get_git_status', { path: currentPath });
          setGitStatus(statuses);
        } catch (e) {
          // Not a git repo, or git not installed, gracefully ignore
          setGitStatus({});
        }
      }
    } catch (e) {
      console.error(e);
    }
    setLoading(false);
  };

  if (loading) {
    return <div className="flex-1 flex items-center justify-center animate-pulse text-cyan">Loading Files...</div>;
  }

  return (
    <div className="flex flex-col gap-4 h-full">
      {/* Toolbar */}
      <div className="flex justify-end gap-2 px-2">
        <button 
          onClick={() => setViewMode('grid')}
          className={`px-3 py-1 text-sm rounded-md transition-colors ${viewMode === 'grid' ? 'bg-cyan/20 text-cyan border border-cyan/50' : 'bg-white/5 text-gray-400 hover:text-white'}`}
        >
          Grid
        </button>
        <button 
          onClick={() => setViewMode('list')}
          className={`px-3 py-1 text-sm rounded-md transition-colors ${viewMode === 'list' ? 'bg-cyan/20 text-cyan border border-cyan/50' : 'bg-white/5 text-gray-400 hover:text-white'}`}
        >
          List (Dual Pane)
        </button>
      </div>

      <motion.div 
        variants={staggerContainer} 
        initial="hidden" 
        animate="show"
        className={viewMode === 'grid' 
          ? "grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4"
          : "flex flex-col gap-2"
        }
      >
        {files.map(file => {
          const status = gitStatus[file.name];
          const isModified = status?.includes('M');
          const isUntracked = status?.includes('?');
          const isAdded = status?.includes('A');

          if (viewMode === 'list') {
            const isSelected = selectedFile === file.path;
            return (
              <motion.div
                key={file.name}
                variants={slideUpItem}
                onClick={() => {
                  onSelect(file.path);
                  setContextMenu(null);
                }}
                onContextMenu={(e) => {
                  e.preventDefault();
                  onSelect(file.path);
                  setContextMenu({ x: e.clientX, y: e.clientY, path: file.path });
                }}
                onDoubleClick={() => {
                  if (file.is_dir) onNavigate(file.path);
                }}
                className={`flex items-center justify-between p-3 rounded-lg liquid-glass border cursor-pointer group transition-all
                  ${isSelected ? 'bg-cyan/20 border-cyan shadow-[0_0_15px_rgba(0,229,255,0.2)]' : 'border-white/5 hover:bg-white/10'}
                `}
              >
                <div className="flex items-center gap-4 flex-1">
                  <span className="text-xl">{file.is_dir ? '📁' : '📄'}</span>
                  <span className="font-mono text-sm text-gray-300 group-hover:text-white transition-colors">{file.name}</span>
                </div>
                
                <div className="flex items-center gap-8 text-xs text-gray-500 font-mono">
                  {status && (
                    <span className={`px-2 py-0.5 rounded-md font-bold
                      ${isModified ? 'bg-amber-500/20 text-amber-400 border border-amber-500/50' : ''}
                      ${isUntracked ? 'bg-green-500/20 text-green-400 border border-green-500/50' : ''}
                      ${isAdded ? 'bg-blue-500/20 text-blue-400 border border-blue-500/50' : ''}
                    `}>
                      {status.trim()}
                    </span>
                  )}
                  <span className="w-24 text-right">{file.is_dir ? '--' : formatSize(file.size_bytes)}</span>
                </div>
              </motion.div>
            );
          }

          const isSelected = selectedFile === file.path;
          return (
            <motion.div 
              key={file.name}
              variants={slideUpItem}
              onClick={() => {
                onSelect(file.path);
                setContextMenu(null);
              }}
              onContextMenu={(e) => {
                e.preventDefault();
                onSelect(file.path);
                setContextMenu({ x: e.clientX, y: e.clientY, path: file.path });
              }}
              onDoubleClick={() => {
                if (file.is_dir) onNavigate(file.path);
              }}
              whileHover={{ scale: 1.02, y: -5 }}
              className={`
                relative p-4 rounded-xl liquid-glass border cursor-pointer overflow-hidden group transition-all
                ${isSelected ? 'bg-cyan/20 border-cyan shadow-[0_0_15px_rgba(0,229,255,0.2)]' : file.is_dir ? 'border-cyan/30 hover:bg-cyan/10' : 'border-white/10 hover:bg-white/5'}
              `}
            >
              {/* Git Status Overlay Badge */}
              {status && (
                <div className={`absolute top-2 right-2 px-2 py-0.5 rounded-md text-xs font-bold shadow-lg
                  ${isModified ? 'bg-amber-500/20 text-amber-400 border border-amber-500/50 shadow-amber-500/20' : ''}
                  ${isUntracked ? 'bg-green-500/20 text-green-400 border border-green-500/50 shadow-green-500/20' : ''}
                  ${isAdded ? 'bg-blue-500/20 text-blue-400 border border-blue-500/50 shadow-blue-500/20' : ''}
                `}>
                  {status.trim()}
                </div>
              )}

              <div className="flex items-center gap-3 mb-2">
                <span className="text-2xl">
                  {file.is_dir ? '📁' : '📄'}
                </span>
                <h3 className="font-bold truncate text-gray-200 group-hover:text-white transition-colors" title={file.name}>
                  {file.name}
                </h3>
              </div>
              
              <div className="flex justify-between items-center text-xs text-gray-500">
                <span>{file.is_dir ? 'Directory' : formatSize(file.size_bytes)}</span>
              </div>
            </motion.div>
          );
        })}
      </motion.div>
      
      {contextMenu && (
        <div 
          className="fixed z-50 bg-[#1e1e1e] border border-white/10 rounded-lg shadow-xl overflow-hidden min-w-[200px]"
          style={{ top: contextMenu.y, left: contextMenu.x }}
        >
          <div 
            className="px-4 py-2 hover:bg-cyan/20 cursor-pointer text-sm text-gray-300 hover:text-white"
            onClick={() => {
              if (onAddToShelf) onAddToShelf(contextMenu.path);
              setContextMenu(null);
            }}
          >
            🗃️ Add to Shelf
          </div>
          <div className="border-t border-white/5 my-1"></div>
          
          {(contextMenu.path.toLowerCase().endsWith('.png') || contextMenu.path.toLowerCase().endsWith('.jpg') || contextMenu.path.toLowerCase().endsWith('.svg')) && (
            <div 
              className="px-4 py-2 hover:bg-green-500/20 cursor-pointer text-sm text-gray-300 hover:text-green-400"
              onClick={() => {
                if (onOptimizeAsset) onOptimizeAsset(contextMenu.path);
                setContextMenu(null);
              }}
            >
              ⚡ Optimize Asset (oxipng)
            </div>
          )}
          
          {(contextMenu.path.toLowerCase().endsWith('.json') || contextMenu.path.toLowerCase().endsWith('.yaml') || contextMenu.path.toLowerCase().endsWith('.yml')) && (
            <div 
              className="px-4 py-2 hover:bg-cyan/20 cursor-pointer text-sm text-gray-300 hover:text-white"
              onClick={() => {
                const target = contextMenu.path.toLowerCase().endsWith('.json') ? 'yaml' : 'json';
                if (onFormatConvert) onFormatConvert(contextMenu.path, target);
                setContextMenu(null);
              }}
            >
              🔄 Convert to {contextMenu.path.toLowerCase().endsWith('.json') ? 'YAML' : 'JSON'}
            </div>
          )}
          
          <div 
            className="px-4 py-2 hover:bg-cyan/20 cursor-pointer text-sm text-gray-300 hover:text-white"
            onClick={() => {
              if (onHashVerify) onHashVerify(contextMenu.path);
              setContextMenu(null);
            }}
          >
            #️⃣ Verify Checksum (MD5/SHA256)
          </div>

          <div 
            className="px-4 py-2 hover:bg-cyan/20 cursor-pointer text-sm text-gray-300 hover:text-white"
            onClick={() => {
              navigator.clipboard.writeText(contextMenu.path);
              setContextMenu(null);
            }}
          >
            📋 Copy Absolute Path
          </div>

          <div 
            className="px-4 py-2 hover:bg-cyan/20 cursor-pointer text-sm text-gray-300 hover:text-white"
            onClick={() => {
              const uri = `file:///${contextMenu.path.replace(/\\/g, '/')}`;
              navigator.clipboard.writeText(uri);
              setContextMenu(null);
            }}
          >
            🌐 Copy File URI
          </div>

          <div className="border-t border-white/5 my-1"></div>
          <GitContextMenu 
            x={contextMenu.x} 
            y={contextMenu.y} 
            filePath={contextMenu.path} 
            repoPath={currentPath}
            onClose={() => setContextMenu(null)}
            onActionComplete={loadFiles} // Refresh statuses after git action
          />
        </div>
      )}
    </div>
  );
};
