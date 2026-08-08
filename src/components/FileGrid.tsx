import { motion, AnimatePresence } from 'framer-motion';
import { useState, useEffect, useRef, useMemo } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';
import { invoke } from '@tauri-apps/api/core';
import { 
  FilePlus, FolderPlus, Grid, List, Trash2, Edit2, 
  ArrowLeft, ArrowRight, ArrowUp, RotateCw, Search,
  Scissors, Copy, Share2, Filter, Star, Clock, Cloud,
  Monitor, Download, FileText, Image as ImageIcon, Music, Video, HardDrive, Usb, ChevronRight,
  Folder, FileCode, Archive, File as FileIconLucide
} from 'lucide-react';
import { GitContextMenu } from './GitContextMenu';
import { useToast, useStore } from '../store/store';

interface FileInfo {
  name: string;
  path: string;
  is_dir: boolean;
  size_bytes: number;
}

interface DriveInfo {
  name: string;
  mount_point: string;
  total_space: number;
  available_space: number;
}

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
  
  const [drives, setDrives] = useState<DriveInfo[]>([]);

  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; path: string } | null>(null);
  
  const [isCreating, setIsCreating] = useState<'file' | 'folder' | null>(null);
  const [newItemName, setNewItemName] = useState('');
  
  const [renamingPath, setRenamingPath] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState('');

  const [deleteConfirmTarget, setDeleteConfirmTarget] = useState<{ path: string; isDir: boolean } | null>(null);

  const [selectedFiles, setSelectedFiles] = useState<Set<string>>(new Set());
  const [lastSelected, setLastSelected] = useState<string | null>(null);

  const parentRef = useRef<HTMLDivElement>(null);
  const { success, error } = useToast();

  const goBack = useStore(s => s.goBack);
  const goForward = useStore(s => s.goForward);
  const canGoBack = useStore(s => s.canGoBack);
  const canGoForward = useStore(s => s.canGoForward);

  useEffect(() => {
    loadFiles();
    setIsCreating(null);
    setRenamingPath(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentPath]);

  useEffect(() => {
    // Sync external selectedFile to local set if it changes externally
    if (selectedFile && !selectedFiles.has(selectedFile)) {
      setSelectedFiles(new Set([selectedFile]));
      setLastSelected(selectedFile);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedFile]);

  useEffect(() => {
    if (!contextMenu) return;
    const handleClickOutside = () => setContextMenu(null);
    document.addEventListener('click', handleClickOutside);
    return () => document.removeEventListener('click', handleClickOutside);
  }, [contextMenu]);

  useEffect(() => {
    invoke<any>('get_sys_stats')
      .then(stats => {
        if (stats && stats.drives) {
          setDrives(stats.drives);
        }
      })
      .catch(console.error);
  }, []);

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
        } catch {
          setGitStatus({});
        }
      }
    } catch (e: unknown) {
      console.error(e);
      error('Directory Load Failed', e instanceof Error ? e.message : String(e));
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
    } catch (e: unknown) {
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
    } catch (e: unknown) {
      error('Failed to rename', e instanceof Error ? e.message : String(e));
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
      // Remove from selected set
      const newSelected = new Set(selectedFiles);
      newSelected.delete(path);
      setSelectedFiles(newSelected);
    } catch (e: unknown) {
      error('Failed to delete', e instanceof Error ? e.message : String(e));
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

  const handleItemSelect = (e: React.MouseEvent, path: string) => {
    e.stopPropagation();
    
    const isMac = navigator.platform.toUpperCase().indexOf('MAC') >= 0;
    const isCmdOrCtrl = isMac ? e.metaKey : e.ctrlKey;

    let newSelected = new Set(selectedFiles);

    if (e.shiftKey && lastSelected !== null) {
      const allPaths = filteredFiles.map(f => f.path);
      const startIdx = allPaths.indexOf(lastSelected);
      const endIdx = allPaths.indexOf(path);
      
      if (startIdx !== -1 && endIdx !== -1) {
        newSelected = new Set();
        const min = Math.min(startIdx, endIdx);
        const max = Math.max(startIdx, endIdx);
        for (let i = min; i <= max; i++) {
          newSelected.add(allPaths[i]);
        }
      }
    } else if (isCmdOrCtrl) {
      if (newSelected.has(path)) {
        newSelected.delete(path);
      } else {
        newSelected.add(path);
      }
      setLastSelected(path);
    } else {
      newSelected = new Set([path]);
      setLastSelected(path);
    }
    
    setSelectedFiles(newSelected);
    onSelect(path); // Update parent store
    setContextMenu(null);
  };

  const filteredFiles = files.filter(f => f.name.toLowerCase().includes(search.toLowerCase()));

  const rowVirtualizer = useVirtualizer({
    count: filteredFiles.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => 36, // height of list row
    overscan: 5,
  });

  const getFileIcon = (file: FileInfo) => {
    if (file.is_dir) return <Folder className="text-[#ffd32a] fill-[#ffd32a]/20" strokeWidth={1} />;
    
    const name = file.name.toLowerCase();
    if (name.endsWith('.png') || name.endsWith('.jpg') || name.endsWith('.jpeg') || name.endsWith('.svg') || name.endsWith('.gif')) {
      return <ImageIcon className="text-[#0fb9b1]" strokeWidth={1.5} />;
    }
    if (name.endsWith('.js') || name.endsWith('.ts') || name.endsWith('.jsx') || name.endsWith('.tsx') || name.endsWith('.json') || name.endsWith('.css') || name.endsWith('.html')) {
      return <FileCode className="text-[#eb3b5a]" strokeWidth={1.5} />;
    }
    if (name.endsWith('.zip') || name.endsWith('.tar') || name.endsWith('.gz') || name.endsWith('.rar')) {
      return <Archive className="text-[#f7b731]" strokeWidth={1.5} />;
    }
    if (name.endsWith('.mp3') || name.endsWith('.wav')) {
      return <Music className="text-[#a55eea]" strokeWidth={1.5} />;
    }
    if (name.endsWith('.mp4') || name.endsWith('.mkv')) {
      return <Video className="text-[#fd9644]" strokeWidth={1.5} />;
    }
    
    return <FileIconLucide className="text-[#a4b0be]" strokeWidth={1.5} />;
  };

  const navigateUp = () => {
    const parts = currentPath.split(/[\\/]/).filter(Boolean);
    if (parts.length > 1) {
      parts.pop();
      let newPath = parts.join('\\');
      if (!newPath.includes(':') && currentPath.includes(':')) {
         newPath = parts[0] + '\\';
      }
      onNavigate(newPath);
    }
  };

  const segments = currentPath ? currentPath.replace(/\\/g, '/').split('/').filter(Boolean) : [];
  const navigateToSegment = (index: number) => {
    let newPath = segments.slice(0, index + 1).join('\\');
    if (!newPath.includes(':')) {
      newPath = '\\' + newPath; // Linux root fallback
    } else if (index === 0 && !newPath.endsWith('\\')) {
      newPath += '\\'; // Drive root
    }
    onNavigate(newPath);
  };

  const selectedSize = useMemo(() => {
    let total = 0;
    files.forEach(f => {
      if (selectedFiles.has(f.path)) total += f.size_bytes;
    });
    return total;
  }, [files, selectedFiles]);

  return (
    <div className="flex flex-col h-full w-full bg-[#121212] text-[#f1f2f6] font-sans selection:bg-[#3867d6]/30" onClick={() => { setSelectedFiles(new Set()); setLastSelected(null); }}>
      
      {/* Top Toolbar */}
      <header className="flex flex-col bg-[#1e1e1e] border-b border-[#333]" onClick={e => e.stopPropagation()}>
        {/* Primary Row */}
        <div className="flex items-center px-4 py-2 gap-4">
          {/* Nav Controls */}
          <div className="flex gap-0.5">
            <button onClick={goBack} disabled={!canGoBack} className="w-8 h-8 rounded flex items-center justify-center text-[#a4b0be] hover:bg-[#2d2d2d] hover:text-[#f1f2f6] disabled:opacity-40 transition-colors" title="Back"><ArrowLeft size={18}/></button>
            <button onClick={goForward} disabled={!canGoForward} className="w-8 h-8 rounded flex items-center justify-center text-[#a4b0be] hover:bg-[#2d2d2d] hover:text-[#f1f2f6] disabled:opacity-40 transition-colors" title="Forward"><ArrowRight size={18}/></button>
            <button onClick={navigateUp} className="w-8 h-8 rounded flex items-center justify-center text-[#a4b0be] hover:bg-[#2d2d2d] hover:text-[#f1f2f6] transition-colors" title="Up"><ArrowUp size={18}/></button>
            <button onClick={loadFiles} className="w-8 h-8 rounded flex items-center justify-center text-[#a4b0be] hover:bg-[#2d2d2d] hover:text-[#f1f2f6] transition-colors" title="Refresh"><RotateCw size={18}/></button>
          </div>
          
          {/* Breadcrumb */}
          <div className="flex-1 flex items-center bg-[#252525] border border-[#333] rounded-md px-2 h-9 overflow-x-auto no-scrollbar">
            {segments.map((seg, i) => (
              <div key={i} className="flex items-center">
                {i > 0 && <ChevronRight size={14} className="text-[#747d8c] mx-0.5 flex-shrink-0" />}
                <button
                  onClick={() => navigateToSegment(i)}
                  className={`text-[13px] px-2 py-1 rounded transition-colors whitespace-nowrap leading-none ${i === segments.length - 1 ? 'text-[#f1f2f6] font-medium' : 'text-[#a4b0be] hover:bg-[#2d2d2d] hover:text-[#f1f2f6]'}`}
                >
                  {seg}
                </button>
              </div>
            ))}
          </div>

          {/* Search */}
          <div className="flex items-center bg-[#252525] border border-[#333] rounded-md px-2.5 h-9 w-[250px] focus-within:border-[#4b7bec] focus-within:bg-[#121212] transition-colors">
            <Search size={16} className="text-[#747d8c] mr-2 flex-shrink-0"/>
            <input 
              type="text" 
              placeholder="Search..." 
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="bg-transparent border-none outline-none text-[13px] text-[#f1f2f6] flex-1 min-w-0" 
            />
          </div>
        </div>
        
        {/* Secondary Row (Context Actions) */}
        <div className="flex items-center justify-between px-4 py-1.5 bg-[#121212] border-t border-[#333]">
          <div className="flex items-center gap-1">
             <button onClick={() => { setIsCreating('file'); setNewItemName(''); }} className="flex items-center gap-2 px-2.5 py-1.5 rounded text-[#f1f2f6] bg-[#3867d6] hover:bg-[#4b7bec] text-[13px] transition-colors"><FilePlus size={16}/> New File</button>
             <button onClick={() => { setIsCreating('folder'); setNewItemName(''); }} className="flex items-center gap-2 px-2.5 py-1.5 rounded text-[#f1f2f6] bg-[#3867d6] hover:bg-[#4b7bec] text-[13px] transition-colors"><FolderPlus size={16}/> New Folder</button>
             <div className="w-px h-5 bg-[#333] mx-1.5"></div>
             
             {/* Dynamic actions based on selection */}
             <button className="flex items-center gap-2 px-2.5 py-1.5 rounded text-[#a4b0be] hover:bg-[#2d2d2d] hover:text-[#f1f2f6] text-[13px] disabled:opacity-40" disabled={selectedFiles.size === 0}><Scissors size={16}/> Cut</button>
             <button className="flex items-center gap-2 px-2.5 py-1.5 rounded text-[#a4b0be] hover:bg-[#2d2d2d] hover:text-[#f1f2f6] text-[13px] disabled:opacity-40" disabled={selectedFiles.size === 0}><Copy size={16}/> Copy</button>
             <button onClick={() => { if (selectedFiles.size === 1) { setRenamingPath(Array.from(selectedFiles)[0]); setRenameValue(Array.from(selectedFiles)[0].split(/[\\/]/).pop() || ''); } }} className="flex items-center gap-2 px-2.5 py-1.5 rounded text-[#a4b0be] hover:bg-[#2d2d2d] hover:text-[#f1f2f6] text-[13px] disabled:opacity-40" disabled={selectedFiles.size !== 1}><Edit2 size={16}/> Rename</button>
             <button className="flex items-center gap-2 px-2.5 py-1.5 rounded text-[#a4b0be] hover:bg-[#2d2d2d] hover:text-[#f1f2f6] text-[13px] disabled:opacity-40" disabled={selectedFiles.size === 0}><Share2 size={16}/> Share</button>
             <button onClick={() => { if (selectedFiles.size > 0) handleDelete(Array.from(selectedFiles)[0]); }} className="flex items-center gap-2 px-2.5 py-1.5 rounded text-[#a4b0be] hover:bg-[#eb3b5a] hover:text-white text-[13px] disabled:opacity-40" disabled={selectedFiles.size === 0}><Trash2 size={16}/> Delete</button>
          </div>
          <div className="flex items-center gap-1">
            <button className="w-8 h-8 rounded flex items-center justify-center text-[#a4b0be] hover:bg-[#2d2d2d] hover:text-[#f1f2f6] transition-colors"><Filter size={18}/></button>
            <div className="w-px h-5 bg-[#333] mx-1.5"></div>
            <button onClick={() => setViewMode('grid')} className={`w-8 h-8 rounded flex items-center justify-center transition-colors ${viewMode === 'grid' ? 'bg-[#2d3b55] text-[#f1f2f6]' : 'text-[#a4b0be] hover:bg-[#2d2d2d] hover:text-[#f1f2f6]'}`} title="Grid View"><Grid size={18}/></button>
            <button onClick={() => setViewMode('list')} className={`w-8 h-8 rounded flex items-center justify-center transition-colors ${viewMode === 'list' ? 'bg-[#2d3b55] text-[#f1f2f6]' : 'text-[#a4b0be] hover:bg-[#2d2d2d] hover:text-[#f1f2f6]'}`} title="List View"><List size={18}/></button>
          </div>
        </div>
      </header>
      
      {/* Body */}
      <div className="flex-1 flex overflow-hidden">
        {/* Left Sidebar */}
        <nav className="w-[220px] shrink-0 bg-[#1e1e1e] border-r border-[#333] flex flex-col py-3 overflow-y-auto no-scrollbar" onClick={e => e.stopPropagation()}>
          <div className="mb-5">
            <h3 className="text-[11px] uppercase font-semibold text-[#747d8c] px-5 mb-2 tracking-wide">Quick Access</h3>
            <ul className="list-none px-2 space-y-0.5">
              <li>
                <button className="w-full flex items-center gap-3 px-3 py-1.5 rounded text-[#a4b0be] hover:bg-[#2d2d2d] hover:text-[#f1f2f6] text-[13px] transition-colors">
                  <Star size={16} /> Favorites
                </button>
              </li>
              <li>
                <button className="w-full flex items-center gap-3 px-3 py-1.5 rounded text-[#a4b0be] hover:bg-[#2d2d2d] hover:text-[#f1f2f6] text-[13px] transition-colors">
                  <Clock size={16} /> Recent
                </button>
              </li>
              <li>
                <button className="w-full flex items-center gap-3 px-3 py-1.5 rounded text-[#a4b0be] hover:bg-[#2d2d2d] hover:text-[#f1f2f6] text-[13px] transition-colors">
                  <Cloud size={16} /> Cloud Drive
                </button>
              </li>
            </ul>
          </div>
          
          <div className="mb-5">
            <h3 className="text-[11px] uppercase font-semibold text-[#747d8c] px-5 mb-2 tracking-wide">This PC</h3>
            <ul className="list-none px-2 space-y-0.5">
              <li>
                <button className="w-full flex items-center gap-3 px-3 py-1.5 rounded text-[#a4b0be] hover:bg-[#2d2d2d] hover:text-[#f1f2f6] text-[13px] transition-colors">
                  <Monitor size={16} /> Desktop
                </button>
              </li>
              <li>
                <button className="w-full flex items-center gap-3 px-3 py-1.5 rounded text-[#a4b0be] hover:bg-[#2d2d2d] hover:text-[#f1f2f6] text-[13px] transition-colors">
                  <Download size={16} /> Downloads
                </button>
              </li>
              <li>
                <button className="w-full flex items-center gap-3 px-3 py-1.5 rounded text-[#a4b0be] hover:bg-[#2d2d2d] hover:text-[#f1f2f6] text-[13px] transition-colors">
                  <FileText size={16} /> Documents
                </button>
              </li>
              <li>
                <button className="w-full flex items-center gap-3 px-3 py-1.5 rounded text-[#a4b0be] hover:bg-[#2d2d2d] hover:text-[#f1f2f6] text-[13px] transition-colors">
                  <ImageIcon size={16} /> Pictures
                </button>
              </li>
              <li>
                <button className="w-full flex items-center gap-3 px-3 py-1.5 rounded text-[#a4b0be] hover:bg-[#2d2d2d] hover:text-[#f1f2f6] text-[13px] transition-colors">
                  <Music size={16} /> Music
                </button>
              </li>
              <li>
                <button className="w-full flex items-center gap-3 px-3 py-1.5 rounded text-[#a4b0be] hover:bg-[#2d2d2d] hover:text-[#f1f2f6] text-[13px] transition-colors">
                  <Video size={16} /> Videos
                </button>
              </li>
            </ul>
          </div>

          <div className="mb-2">
            <h3 className="text-[11px] uppercase font-semibold text-[#747d8c] px-5 mb-2 tracking-wide">Drives</h3>
            <ul className="list-none px-2 space-y-0.5">
              {drives.map(d => {
                 const isRemovable = d.mount_point.includes('E:') || d.mount_point.includes('F:');
                 return (
                   <li key={d.mount_point}>
                    <button 
                      onClick={() => onNavigate(d.mount_point)}
                      className={`w-full flex items-center gap-3 px-3 py-1.5 rounded text-[13px] transition-colors ${currentPath.startsWith(d.mount_point) ? 'bg-[#2d3b55] text-[#f1f2f6]' : 'text-[#a4b0be] hover:bg-[#2d2d2d] hover:text-[#f1f2f6]'}`}
                    >
                      {isRemovable ? <Usb size={16} /> : <HardDrive size={16} />} 
                      <span className="truncate">{d.name || d.mount_point.replace('\\','')}</span>
                    </button>
                   </li>
                 );
              })}
            </ul>
          </div>
        </nav>
        
        {/* Main Content Area */}
        <main className="flex-1 flex flex-col relative bg-[#121212]">
           {viewMode === 'list' && !loading && (
             <div className="flex px-4 py-2 bg-[#1e1e1e] border-b border-[#333] text-[12px] font-semibold text-[#747d8c]">
               <div className="flex-[2] min-w-[200px] pl-10">Name</div>
               <div className="flex-1 min-w-[100px]">Type</div>
               <div className="w-[100px] text-right">Size</div>
             </div>
           )}

           <div className="flex-1 overflow-y-auto custom-scrollbar relative p-4" ref={parentRef}>
             {loading ? (
                <div className="flex-1 flex items-center justify-center animate-pulse text-[#3867d6] py-12">Loading Files...</div>
             ) : (
                <div 
                  className={viewMode === 'grid' ? "grid grid-cols-[repeat(auto-fill,minmax(110px,1fr))] gap-3" : "relative w-full"}
                  style={viewMode === 'list' ? { height: `${rowVirtualizer.getTotalSize()}px` } : {}}
                >
                  {/* Inline Creation */}
                  {isCreating && (
                    <div className={`flex items-center gap-3 p-3 rounded-md border border-[#4b7bec] bg-[#3867d6]/10 ${viewMode === 'grid' ? 'col-span-full md:col-span-1 flex-col' : ''}`}>
                      <div className="flex items-center justify-center w-10 h-10">
                        {isCreating === 'folder' ? <Folder className="text-[#ffd32a] fill-[#ffd32a]/20" strokeWidth={1} /> : <FileIconLucide className="text-[#a4b0be]" strokeWidth={1.5} />}
                      </div>
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
                        className={`bg-transparent text-[#f1f2f6] text-[13px] outline-none ${viewMode === 'grid' ? 'w-full text-center mt-2' : 'flex-1'}`}
                        placeholder={`New ${isCreating}...`}
                      />
                    </div>
                  )}

                  {filteredFiles.length === 0 && !isCreating && (
                    <div className="col-span-full py-12 text-center text-[#747d8c] italic text-[13px]">
                      {search ? "No files match your search." : "This directory is empty."}
                    </div>
                  )}

                  {viewMode === 'grid' ? (
                    filteredFiles.map(file => {
                      const isSelected = selectedFiles.has(file.path);
                      const isRenaming = renamingPath === file.path;
                      const status = gitStatus[file.name];
                      
                      return (
                        <div
                          key={file.path}
                          draggable
                          onDragStart={(e: any) => e.dataTransfer.setData('text/plain', file.path)}
                          onDragOver={(e: any) => file.is_dir && e.preventDefault()}
                          onDrop={(e: any) => file.is_dir && handleDrop(e, file.path)}
                          onClick={(e) => handleItemSelect(e, file.path)}
                          onContextMenu={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            if (!selectedFiles.has(file.path)) {
                               setSelectedFiles(new Set([file.path]));
                            }
                            setContextMenu({ x: e.clientX, y: e.clientY, path: file.path });
                          }}
                          onDoubleClick={(e) => {
                            e.stopPropagation();
                            if (isRenaming) return;
                            if (file.is_dir) onNavigate(file.path);
                            else if (onFileDoubleClicked) onFileDoubleClicked(file.path);
                          }}
                          className={`flex flex-col items-center p-3 rounded-md cursor-pointer transition-colors border border-transparent ${isSelected ? 'bg-[#2d3b55] border-[#4b7bec]' : 'hover:bg-[#252525] hover:border-[#333]'}`}
                        >
                          <div className="relative w-12 h-12 flex items-center justify-center mb-2">
                             {getFileIcon(file)}
                             {status && (
                                <div className={`absolute -top-1 -right-1 px-1 rounded text-[9px] font-bold shadow-lg
                                  ${status.includes('M') ? 'bg-amber-500/20 text-amber-400 border border-amber-500/50' : ''}
                                  ${status.includes('?') ? 'bg-green-500/20 text-green-400 border border-green-500/50' : ''}
                                  ${status.includes('A') ? 'bg-blue-500/20 text-blue-400 border border-blue-500/50' : ''}
                                `}>
                                  {status.trim()}
                                </div>
                             )}
                          </div>
                          
                          {isRenaming ? (
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
                              className="bg-black/50 text-[#f1f2f6] text-[13px] px-1 outline-none border border-[#3867d6] rounded w-full text-center"
                            />
                          ) : (
                            <div className={`text-[13px] text-center break-words line-clamp-2 w-full ${isSelected ? 'text-white' : 'text-[#f1f2f6]'}`} title={file.name}>
                              {file.name}
                            </div>
                          )}
                        </div>
                      )
                    })
                  ) : (
                    rowVirtualizer.getVirtualItems().map((virtualRow) => {
                      const file = filteredFiles[virtualRow.index];
                      const isSelected = selectedFiles.has(file.path);
                      const isRenaming = renamingPath === file.path;
                      const status = gitStatus[file.name];

                      return (
                        <div
                          key={file.path}
                          draggable
                          onDragStart={(e: any) => e.dataTransfer.setData('text/plain', file.path)}
                          onDragOver={(e: any) => file.is_dir && e.preventDefault()}
                          onDrop={(e: any) => file.is_dir && handleDrop(e, file.path)}
                          onClick={(e) => handleItemSelect(e, file.path)}
                          onContextMenu={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            if (!selectedFiles.has(file.path)) {
                               setSelectedFiles(new Set([file.path]));
                            }
                            setContextMenu({ x: e.clientX, y: e.clientY, path: file.path });
                          }}
                          onDoubleClick={(e) => {
                            e.stopPropagation();
                            if (isRenaming) return;
                            if (file.is_dir) onNavigate(file.path);
                            else if (onFileDoubleClicked) onFileDoubleClicked(file.path);
                          }}
                          className={`absolute top-0 left-0 w-full flex items-center px-4 py-1.5 cursor-pointer rounded-md transition-colors border border-transparent ${isSelected ? 'bg-[#2d3b55] border-[#4b7bec]' : 'hover:bg-[#252525]'}`}
                          style={{
                            height: `${virtualRow.size - 2}px`,
                            transform: `translateY(${virtualRow.start}px)`,
                          }}
                        >
                          <div className="w-6 h-6 flex items-center justify-center mr-3 shrink-0">
                            {getFileIcon(file)}
                          </div>
                          
                          <div className="flex-[2] min-w-[200px] flex items-center gap-2 overflow-hidden">
                            {isRenaming ? (
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
                                className="bg-black/50 text-[#f1f2f6] text-[13px] px-1 outline-none border border-[#3867d6] rounded flex-1"
                              />
                            ) : (
                              <span className={`text-[13px] truncate ${isSelected ? 'text-white' : 'text-[#f1f2f6]'}`} title={file.name}>{file.name}</span>
                            )}
                            
                            {status && (
                              <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold
                                ${status.includes('M') ? 'bg-amber-500/20 text-amber-400 border border-amber-500/50' : ''}
                                ${status.includes('?') ? 'bg-green-500/20 text-green-400 border border-green-500/50' : ''}
                                ${status.includes('A') ? 'bg-blue-500/20 text-blue-400 border border-blue-500/50' : ''}
                              `}>
                                {status.trim()}
                              </span>
                            )}
                          </div>
                          
                          <div className="flex-1 min-w-[100px] text-[13px] text-[#747d8c] truncate pr-2">
                            {file.is_dir ? 'File folder' : 'File'}
                          </div>
                          <div className="w-[100px] text-right text-[13px] text-[#747d8c]">
                            {file.is_dir ? '--' : formatSize(file.size_bytes)}
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>
             )}
           </div>
        </main>
      </div>
      
      {/* Status Bar */}
      <footer className="h-[28px] shrink-0 bg-[#1e1e1e] border-t border-[#333] flex items-center px-4 text-[12px] text-[#747d8c]" onClick={e => e.stopPropagation()}>
        <div className="flex items-center gap-2">
          <span>{files.length} items</span>
          {selectedFiles.size > 0 && (
            <>
              <span className="text-[#444]">|</span>
              <span className="text-[#a4b0be]">{selectedFiles.size} item{selectedFiles.size > 1 ? 's' : ''} selected</span>
              {selectedSize > 0 && (
                 <>
                   <span className="text-[#444]">|</span>
                   <span className="text-[#a4b0be]">{formatSize(selectedSize)}</span>
                 </>
              )}
            </>
          )}
        </div>
      </footer>

      {/* Context Menu Modal & Delete Confirm modal are unchanged but style-updated slightly */}
      {contextMenu && (
        <div 
          className="fixed z-50 bg-[#252525] border border-[#444] rounded-md shadow-2xl min-w-[200px] text-[13px] text-[#f1f2f6] py-1"
          style={{ top: contextMenu.y, left: contextMenu.x }}
          onClick={e => e.stopPropagation()}
        >
          <div 
            className="px-3 py-2 hover:bg-[#3867d6] cursor-pointer flex items-center gap-2 transition-colors"
            onClick={() => {
              setRenamingPath(contextMenu.path);
              setRenameValue(contextMenu.path.split(/[\\/]/).pop() || '');
              setContextMenu(null);
            }}
          >
            <Edit2 size={14} /> Rename
          </div>
          <div 
            className="px-3 py-2 hover:bg-[#eb3b5a] hover:text-white cursor-pointer text-[#eb3b5a] flex items-center gap-2 transition-colors"
            onClick={() => {
              handleDelete(contextMenu.path);
              setContextMenu(null);
            }}
          >
            <Trash2 size={14} /> Delete
          </div>
          
          <div className="border-t border-[#333] my-0.5"></div>
          
          <div 
            className="px-3 py-2 hover:bg-[#3867d6] cursor-pointer transition-colors"
            onClick={() => {
              if (onAddToShelf) onAddToShelf(contextMenu.path);
              setContextMenu(null);
            }}
          >
            🗃️ Add to Shelf
          </div>
          
          {(!files.find(f => f.path === contextMenu.path)?.is_dir) && (
             <div 
               className="px-3 py-2 hover:bg-[#3867d6] cursor-pointer transition-colors"
               onClick={() => {
                 if (onFileDoubleClicked) onFileDoubleClicked(contextMenu.path);
                 setContextMenu(null);
               }}
             >
               📄 Preview
             </div>
          )}
          
          <div className="border-t border-[#333] my-0.5"></div>
          
          {(contextMenu.path.toLowerCase().endsWith('.png') || contextMenu.path.toLowerCase().endsWith('.jpg') || contextMenu.path.toLowerCase().endsWith('.svg')) && (
            <div 
              className="px-3 py-2 hover:bg-[#3867d6] cursor-pointer transition-colors"
              onClick={() => {
                if (onOptimizeAsset) onOptimizeAsset(contextMenu.path);
                setContextMenu(null);
              }}
            >
              ⚡ Optimize Asset
            </div>
          )}
          
          <div className="border-t border-[#333] my-0.5"></div>
          
          <div 
            className="px-3 py-2 hover:bg-[#3867d6] cursor-pointer transition-colors"
            onClick={() => {
              navigator.clipboard.writeText(contextMenu.path);
              setContextMenu(null);
            }}
          >
            📋 Copy Absolute Path
          </div>

          <div className="border-t border-[#333] my-0.5"></div>
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
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 p-4" onClick={e => e.stopPropagation()}>
          <div className="bg-[#1e1e1e] border border-[#333] rounded-lg p-6 max-w-md w-full flex flex-col gap-4 shadow-2xl">
            <h3 className="text-lg font-semibold text-[#f1f2f6]">Confirm Deletion</h3>
            <p className="text-[#a4b0be] text-[13px]">
              {deleteConfirmTarget.isDir 
                ? "Are you sure you want to delete this folder and all its contents?" 
                : "Are you sure you want to delete this file?"}
            </p>
            <p className="text-[12px] text-[#eb3b5a] bg-[#eb3b5a]/10 p-2 rounded break-all border border-[#eb3b5a]/20">
              {deleteConfirmTarget.path}
            </p>
            <div className="flex justify-end gap-3 mt-2">
              <button
                onClick={() => setDeleteConfirmTarget(null)}
                className="px-4 py-2 bg-[#252525] hover:bg-[#2d2d2d] text-[#f1f2f6] rounded text-[13px] transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={() => confirmDeleteFile(deleteConfirmTarget.path)}
                className="px-4 py-2 bg-[#eb3b5a] hover:bg-[#fc5c65] text-white rounded text-[13px] transition-colors"
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
