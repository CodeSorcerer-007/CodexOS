import { motion } from 'framer-motion';
import { useState, useEffect, useRef } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';
import { invoke } from '@tauri-apps/api/core';
import { GitContextMenu } from './GitContextMenu';
import { Breadcrumb } from './Breadcrumb';
import { FilePlus, FolderPlus, Grid, List, Trash2, Edit2 } from 'lucide-react';
import { useToast } from '../store/store';

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
  onOptimizeAsset,
  onFileDoubleClicked
}: { 
  currentPath: string; 
  onNavigate: (path: string) => void;
  selectedFile: string | null; 
  onSelect: (path: string) => void;
  onHashVerify?: (path: string) => void;
  onFormatConvert?: (path: string, targetFormat: string) => void;
  onAddToShelf?: (path: string) => void;
  onOptimizeAsset?: (path: string) => void;
  onFileDoubleClicked?: (path: string) => void;
}) => {
  const [files, setFiles] = useState<FileInfo[]>([]);
  const [gitStatus, setGitStatus] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');
  const [search, setSearch] = useState('');
  
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; path: string } | null>(null);
  
  // New File/Folder state
  const [isCreating, setIsCreating] = useState<'file' | 'folder' | null>(null);
  const [newItemName, setNewItemName] = useState('');
  
  // Inline rename state
  const [renamingPath, setRenamingPath] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState('');

  const [deleteConfirmTarget, setDeleteConfirmTarget] = useState<{ path: string; isDir: boolean } | null>(null);

  const parentRef = useRef<HTMLDivElement>(null);

  const { success, error } = useToast();

  useEffect(() => {
    loadFiles();
    setIsCreating(null);
    setRenamingPath(null);
  }, [currentPath]);

  useEffect(() => {
    if (!contextMenu) return;
    const handleClickOutside = () => setContextMenu(null);
    document.addEventListener('click', handleClickOutside);
    return () => document.removeEventListener('click', handleClickOutside);
  }, [contextMenu]);

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
          setGitStatus({});
        }
      }
    } catch (e: any) {
      console.error(e);
      error('Directory Load Failed', String(e));
    }
    setLoading(false);
  };

  const handleCreate = async () => {
    if (!newItemName.trim()) {
      setIsCreating(null);
      return;
    }
    
    const newPath = currentPath + (currentPath.endsWith('\\') || currentPath.endsWith('/') ? '' : '\\') + newItemName;
    try {
      if (isCreating === 'file') {
        await invoke('create_file', { path: newPath });
        success(`Created file ${newItemName}`);
      } else {
        await invoke('create_directory', { path: newPath });
        success(`Created folder ${newItemName}`);
      }
      loadFiles();
    } catch (e: any) {
      error(`Failed to create ${isCreating}`, String(e));
    }
    
    setIsCreating(null);
    setNewItemName('');
  };

  const handleRename = async (oldPath: string) => {
    if (!renameValue.trim() || renameValue === oldPath.split(/[\\/]/).pop()) {
      setRenamingPath(null);
      return;
    }
    
    const oldName = oldPath.split(/[\\/]/).pop();
    const newPath = oldPath.substring(0, oldPath.length - oldName!.length) + renameValue;
    
    try {
      await invoke('rename_path', { oldPath, newPath });
      success(`Renamed to ${renameValue}`);
      loadFiles();
    } catch (e: any) {
      error('Failed to rename', String(e));
    }
    
    setRenamingPath(null);
  };

  const handleDelete = (path: string) => {
    const isDir = files.find(f => f.path === path)?.is_dir || false;
    setDeleteConfirmTarget({ path, isDir });
  };

  const confirmDeleteFile = async (path: string) => {
    try {
      await invoke('delete_file', { path });
      success('Deleted successfully');
      loadFiles();
    } catch (e: any) {
      error('Failed to delete', String(e));
    } finally {
      setDeleteConfirmTarget(null);
    }
  };

  const handleDrop = async (e: React.DragEvent, targetDir: string) => {
    e.preventDefault();
    const sourcePath = e.dataTransfer.getData('text/plain');
    if (!sourcePath || sourcePath === targetDir) return;
    
    const fileName = sourcePath.split(/[\\/]/).pop();
    const newPath = targetDir + (targetDir.endsWith('\\') || targetDir.endsWith('/') ? '' : '\\') + fileName;
    
    try {
      await invoke('move_file', { source: sourcePath, dest: newPath });
      success(`Moved ${fileName}`);
      loadFiles();
    } catch (err: any) {
      error('Failed to move file', String(err));
    }
  };

  const filteredFiles = files.filter(f => f.name.toLowerCase().includes(search.toLowerCase()));

  const rowVirtualizer = useVirtualizer({
    count: filteredFiles.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => 64, // approximate height of list item
    overscan: 5,
  });

  return (
    <div className="flex flex-col h-full w-full bg-[#0a0f18]">
      <Breadcrumb />
      
      {/* Toolbar */}
      <div className="flex justify-between items-center px-4 py-2 border-b border-white/5">
        <div className="flex gap-2">
          <button 
            onClick={() => { setIsCreating('file'); setNewItemName(''); }}
            className="flex items-center gap-1 px-3 py-1 text-sm rounded-md bg-white/5 hover:bg-white/10 text-gray-300 transition-colors"
          >
            <FilePlus size={14} /> New File
          </button>
          <button 
            onClick={() => { setIsCreating('folder'); setNewItemName(''); }}
            className="flex items-center gap-1 px-3 py-1 text-sm rounded-md bg-white/5 hover:bg-white/10 text-gray-300 transition-colors"
          >
            <FolderPlus size={14} /> New Folder
          </button>
        </div>
        
        <div className="flex gap-4 items-center">
          <input 
            type="text" 
            placeholder="Search..." 
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="bg-black/50 border border-white/10 rounded px-2 py-1 text-sm text-white focus:outline-none focus:border-cyan"
          />
          <div className="flex gap-1 bg-black/40 rounded p-1 border border-white/5">
            <button 
              onClick={() => setViewMode('grid')}
              className={`p-1 rounded ${viewMode === 'grid' ? 'bg-white/20 text-white' : 'text-gray-500 hover:text-gray-300'}`}
              title="Grid View"
            >
              <Grid size={16} />
            </button>
            <button 
              onClick={() => setViewMode('list')}
              className={`p-1 rounded ${viewMode === 'list' ? 'bg-white/20 text-white' : 'text-gray-500 hover:text-gray-300'}`}
              title="List View"
            >
              <List size={16} />
            </button>
          </div>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-4" ref={parentRef}>
        {loading ? (
          <div className="flex-1 flex items-center justify-center animate-pulse text-cyan py-12">Loading Files...</div>
        ) : (
          <motion.div 
            variants={staggerContainer} 
            initial="hidden" 
            animate="show"
            className={viewMode === 'grid' 
              ? "grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4"
              : "relative w-full"
            }
            style={viewMode === 'list' ? { height: `${rowVirtualizer.getTotalSize()}px` } : {}}
          >
            {/* Inline Creation Input */}
            {isCreating && (
              <div className={`flex items-center gap-2 p-3 rounded-lg border border-cyan/50 bg-cyan/10 ${viewMode === 'grid' ? 'col-span-full md:col-span-1' : ''}`}>
                <span className="text-xl">{isCreating === 'folder' ? '📁' : '📄'}</span>
                <input 
                  autoFocus
                  type="text" 
                  value={newItemName}
                  onChange={e => setNewItemName(e.target.value)}
                  onKeyDown={e => {
                    if (e.key === 'Enter') handleCreate();
                    if (e.key === 'Escape') setIsCreating(null);
                  }}
                  onBlur={() => setIsCreating(null)}
                  className="bg-transparent text-white text-sm outline-none w-full"
                  placeholder={`New ${isCreating} name...`}
                />
              </div>
            )}

            {filteredFiles.length === 0 && !isCreating && (
              <div className="col-span-full py-12 text-center text-gray-500 italic">
                {search ? "No files match your search." : "This directory is empty. Click 'New File' or 'New Folder' to get started."}
              </div>
            )}

            {viewMode === 'grid' ? (
              filteredFiles.map(file => {
                const status = gitStatus[file.name];
                const isModified = status?.includes('M');
                const isUntracked = status?.includes('?');
                const isAdded = status?.includes('A');
                const isSelected = selectedFile === file.path;
                const isRenaming = renamingPath === file.path;

                const FileIcon = () => (
                  <span className="text-xl">{file.is_dir ? '📁' : '📄'}</span>
                );
                
                const FileName = () => {
                  if (isRenaming) {
                    return (
                      <input 
                        autoFocus
                        type="text"
                        value={renameValue}
                        onChange={e => setRenameValue(e.target.value)}
                        onKeyDown={e => {
                          if (e.key === 'Enter') handleRename(file.path);
                          if (e.key === 'Escape') setRenamingPath(null);
                        }}
                        onBlur={() => handleRename(file.path)}
                        onClick={e => e.stopPropagation()}
                        className="bg-black/50 text-white text-sm px-1 outline-none border border-cyan/50 rounded flex-1"
                      />
                    );
                  }
                  return (
                    <span 
                      onDoubleClick={(e) => {
                        e.stopPropagation();
                        setRenamingPath(file.path);
                        setRenameValue(file.name);
                      }}
                      className="font-mono text-sm text-gray-300 group-hover:text-white transition-colors truncate" 
                      title={file.name}
                    >
                      {file.name}
                    </span>
                  );
                };

                return (
                  <motion.div 
                    key={file.path}
                    variants={slideUpItem}
                    draggable
                    onDragStart={(e: any) => e.dataTransfer.setData('text/plain', file.path)}
                    onDragOver={(e: any) => file.is_dir && e.preventDefault()}
                    onDrop={(e: any) => file.is_dir && handleDrop(e, file.path)}
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
                      if (isRenaming) return;
                      if (file.is_dir) onNavigate(file.path);
                      else if (onFileDoubleClicked) onFileDoubleClicked(file.path);
                    }}
                    whileHover={{ scale: 1.02, y: -2 }}
                    className={`
                      relative p-4 rounded-xl border cursor-pointer overflow-hidden group transition-all
                      ${isSelected ? 'bg-cyan/10 border-cyan shadow-[0_0_15px_rgba(0,229,255,0.1)]' : file.is_dir ? 'border-cyan/20 bg-cyan/5 hover:bg-cyan/10' : 'border-white/10 bg-black/40 hover:bg-white/5'}
                    `}
                  >
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
                      <FileIcon />
                      <FileName />
                    </div>
                    
                    <div className="flex justify-between items-center text-xs text-gray-500">
                      <span>{file.is_dir ? 'Directory' : formatSize(file.size_bytes)}</span>
                    </div>
                  </motion.div>
                );
              })
            ) : (
              rowVirtualizer.getVirtualItems().map((virtualRow) => {
                const file = filteredFiles[virtualRow.index];
                const status = gitStatus[file.name];
                const isModified = status?.includes('M');
                const isUntracked = status?.includes('?');
                const isAdded = status?.includes('A');
                const isSelected = selectedFile === file.path;
                const isRenaming = renamingPath === file.path;

                const FileIcon = () => (
                  <span className="text-xl">{file.is_dir ? '📁' : '📄'}</span>
                );
                
                const FileName = () => {
                  if (isRenaming) {
                    return (
                      <input 
                        autoFocus
                        type="text"
                        value={renameValue}
                        onChange={e => setRenameValue(e.target.value)}
                        onKeyDown={e => {
                          if (e.key === 'Enter') handleRename(file.path);
                          if (e.key === 'Escape') setRenamingPath(null);
                        }}
                        onBlur={() => handleRename(file.path)}
                        onClick={e => e.stopPropagation()}
                        className="bg-black/50 text-white text-sm px-1 outline-none border border-cyan/50 rounded flex-1"
                      />
                    );
                  }
                  return (
                    <span 
                      onDoubleClick={(e) => {
                        e.stopPropagation();
                        setRenamingPath(file.path);
                        setRenameValue(file.name);
                      }}
                      className="font-mono text-sm text-gray-300 group-hover:text-white transition-colors truncate" 
                      title={file.name}
                    >
                      {file.name}
                    </span>
                  );
                };

                return (
                  <motion.div
                    key={file.path}
                    variants={slideUpItem}
                    draggable
                    onDragStart={(e: any) => e.dataTransfer.setData('text/plain', file.path)}
                    onDragOver={(e: any) => file.is_dir && e.preventDefault()}
                    onDrop={(e: any) => file.is_dir && handleDrop(e, file.path)}
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
                      if (isRenaming) return;
                      if (file.is_dir) onNavigate(file.path);
                      else if (onFileDoubleClicked) onFileDoubleClicked(file.path);
                    }}
                    className={`absolute top-0 left-0 w-full flex items-center justify-between p-3 rounded-lg border cursor-pointer group transition-all
                      ${isSelected ? 'bg-cyan/10 border-cyan shadow-[0_0_15px_rgba(0,229,255,0.1)]' : 'border-white/5 hover:bg-white/10'}
                    `}
                    style={{
                      height: `${virtualRow.size - 8}px`, // 8px for gap equivalent
                      transform: `translateY(${virtualRow.start}px)`,
                    }}
                  >
                    <div className="flex items-center gap-3 flex-1 overflow-hidden">
                      <FileIcon />
                      <FileName />
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
              })
            )}
          </motion.div>
        )}
      </div>
      
      {contextMenu && (
        <div 
          className="fixed z-50 bg-[#1e1e1e] border border-white/10 rounded-lg shadow-xl overflow-hidden min-w-[200px] text-sm"
          style={{ top: contextMenu.y, left: contextMenu.x }}
        >
          <div 
            className="px-4 py-2 hover:bg-cyan/20 cursor-pointer text-gray-300 hover:text-white flex items-center gap-2"
            onClick={() => {
              setRenamingPath(contextMenu.path);
              setRenameValue(contextMenu.path.split(/[\\/]/).pop() || '');
              setContextMenu(null);
            }}
          >
            <Edit2 size={14} /> Rename
          </div>
          <div 
            className="px-4 py-2 hover:bg-red-500/20 cursor-pointer text-red-400 hover:text-red-300 flex items-center gap-2"
            onClick={() => {
              handleDelete(contextMenu.path);
              setContextMenu(null);
            }}
          >
            <Trash2 size={14} /> Delete
          </div>
          
          <div className="border-t border-white/5 my-1"></div>
          
          <div 
            className="px-4 py-2 hover:bg-cyan/20 cursor-pointer text-gray-300 hover:text-white"
            onClick={() => {
              if (onAddToShelf) onAddToShelf(contextMenu.path);
              setContextMenu(null);
            }}
          >
            🗃️ Add to Shelf
          </div>
          
          {(!files.find(f => f.path === contextMenu.path)?.is_dir) && (
             <div 
               className="px-4 py-2 hover:bg-cyan/20 cursor-pointer text-gray-300 hover:text-white"
               onClick={() => {
                 if (onFileDoubleClicked) onFileDoubleClicked(contextMenu.path);
                 setContextMenu(null);
               }}
             >
               📄 Preview
             </div>
          )}
          
          <div className="border-t border-white/5 my-1"></div>
          
          {(contextMenu.path.toLowerCase().endsWith('.png') || contextMenu.path.toLowerCase().endsWith('.jpg') || contextMenu.path.toLowerCase().endsWith('.svg')) && (
            <div 
              className="px-4 py-2 hover:bg-green-500/20 cursor-pointer text-gray-300 hover:text-green-400"
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
              className="px-4 py-2 hover:bg-cyan/20 cursor-pointer text-gray-300 hover:text-white"
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
            className="px-4 py-2 hover:bg-cyan/20 cursor-pointer text-gray-300 hover:text-white"
            onClick={() => {
              if (onHashVerify) onHashVerify(contextMenu.path);
              setContextMenu(null);
            }}
          >
            #️⃣ Verify Checksum
          </div>

          <div className="border-t border-white/5 my-1"></div>

          <div 
            className="px-4 py-2 hover:bg-cyan/20 cursor-pointer text-gray-300 hover:text-white"
            onClick={() => {
              navigator.clipboard.writeText(contextMenu.path);
              setContextMenu(null);
            }}
          >
            📋 Copy Absolute Path
          </div>

          <div 
            className="px-4 py-2 hover:bg-cyan/20 cursor-pointer text-gray-300 hover:text-white"
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
            onActionComplete={loadFiles} 
          />
        </div>
      )}

      {deleteConfirmTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
          <div className="bg-panel border border-white/10 rounded-xl p-6 max-w-md w-full flex flex-col gap-4 shadow-2xl">
            <h3 className="text-xl font-bold text-white">Confirm Deletion</h3>
            <p className="text-gray-300 text-sm">
              {deleteConfirmTarget.isDir 
                ? "Are you sure you want to delete this folder and all its contents?" 
                : "Are you sure you want to delete this file?"}
            </p>
            <p className="text-xs font-mono text-red-400 bg-black/50 p-2 rounded break-all border border-red-500/20">
              {deleteConfirmTarget.path}
            </p>
            <div className="flex justify-end gap-3 mt-2">
              <button
                onClick={() => setDeleteConfirmTarget(null)}
                className="px-4 py-2 bg-white/10 hover:bg-white/20 text-white rounded-lg text-sm transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={() => confirmDeleteFile(deleteConfirmTarget.path)}
                className="px-4 py-2 bg-red-600 hover:bg-red-500 text-white font-bold rounded-lg text-sm transition-colors"
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
