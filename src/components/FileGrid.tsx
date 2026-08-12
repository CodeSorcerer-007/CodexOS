import { useState, useEffect, useRef, useMemo } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';
import { invoke } from '@tauri-apps/api/core';
import {
  Folder24Filled,
  HardDrive24Regular,
  Desktop24Regular,
  Document24Regular,
  Image24Regular,
  MusicNote124Regular,
  Video24Regular,
  ArrowLeft24Regular,
  ArrowRight24Regular,
  ArrowUp24Regular,
  ArrowClockwise24Regular,
  Search24Regular,
  Cut24Regular,
  Copy24Regular,
  Clipboard24Regular,
  Rename24Regular,
  Share24Regular,
  Delete24Regular,
  Pin24Filled,
  Dismiss24Regular,
  Navigation24Regular,
  CheckmarkCircle24Filled,
  Grid24Regular,
  List24Regular,
  ChevronRight24Regular,
  ChevronDown24Regular,
  MoreHorizontal24Regular,
  PanelRight24Regular,
  Add24Regular,
  ArrowSort24Regular,
  
  FolderZip24Regular,
  DocumentPdf24Regular
} from '@fluentui/react-icons';
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

const formatSize = (bytes: number) => {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
};

const formatGB = (bytes: number) => {
  if (!bytes || bytes <= 0) return '0 GB';
  const gb = bytes / (1024 * 1024 * 1024);
  if (gb >= 1000) {
    return `${(gb / 1024).toFixed(1)} TB`;
  }
  return `${gb.toFixed(1)} GB`;
};

export const FileGrid = ({ 
  currentPath, 
  onNavigate, 
  selectedFile, 
  onSelect,
  
  
  onAddToShelf,
  onOptimizeAsset,
  onFileDoubleClicked
}: { 
  currentPath: string; 
  onNavigate: (path: string) => void;
  selectedFile: string | null; 
  onSelect: (path: string) => void;
  _onHashVerify?: (path: string) => void;
  _onFormatConvert?: (path: string, targetFormat: string) => void;
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
  const [showNewMenu, setShowNewMenu] = useState(false);
  const [showSortMenu, setShowSortMenu] = useState(false);
  const [showViewMenu, setShowViewMenu] = useState(false);
  
  const [isCreating, setIsCreating] = useState<'file' | 'folder' | null>(null);
  const [newItemName, setNewItemName] = useState('');
  
  const [renamingPath, setRenamingPath] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState('');

  const [deleteConfirmTarget, setDeleteConfirmTarget] = useState<{ path: string; isDir: boolean } | null>(null);

  const [selectedFiles, setSelectedFiles] = useState<Set<string>>(new Set());
  const [lastSelected, setLastSelected] = useState<string | null>(null);

  const [devicesExpanded, setDevicesExpanded] = useState(true);
  const [thisPcExpanded, setThisPcExpanded] = useState(true);
  const [quickAccessExpanded, setQuickAccessExpanded] = useState(true);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);

  // Dynamic Quick Access Items (can be unpinned/pinned)
  const [quickAccessItems, setQuickAccessItems] = useState([
    { label: 'Desktop', path: 'C:\\Users\\sivak\\Desktop' },
    { label: 'Downloads', path: 'C:\\Users\\sivak\\Downloads' },
    { label: 'Documents', path: 'C:\\Users\\sivak\\Documents' },
    { label: 'Pictures', path: 'C:\\Users\\sivak\\Pictures' },
    { label: 'Music', path: 'C:\\Users\\sivak\\Music' },
    { label: 'Videos', path: 'C:\\Users\\sivak\\Videos' },
  ]);

  const handleUnpinQuickAccess = (e: React.MouseEvent, path: string) => {
    e.stopPropagation();
    setQuickAccessItems(prev => prev.filter(item => item.path !== path));
    success('Removed from Quick Access');
  };

  const handlePinToQuickAccess = (path: string) => {
    const name = path.split(/[\\/]/).pop() || path;
    if (quickAccessItems.some(item => item.path === path)) {
      error('Already in Quick Access');
      return;
    }
    setQuickAccessItems(prev => [...prev, { label: name, path }]);
    success(`Pinned ${name} to Quick Access`);
  };

  const parentRef = useRef<HTMLDivElement>(null);
  const { success, error } = useToast();

  const goBack = useStore(s => s.goBack);
  const goForward = useStore(s => s.goForward);
  const canGoBack = useStore(s => s.canGoBack);
  const canGoForward = useStore(s => s.canGoForward);

  const isThisPC = !currentPath || currentPath === 'This PC' || currentPath === 'thispc';

  useEffect(() => {
    loadFiles();
    setIsCreating(null);
    setRenamingPath(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentPath]);

  useEffect(() => {
    if (selectedFile && !selectedFiles.has(selectedFile)) {
      setSelectedFiles(new Set([selectedFile]));
      setLastSelected(selectedFile);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedFile]);

  useEffect(() => {
    const handleClickOutside = () => {
      setContextMenu(null);
      setShowNewMenu(false);
      setShowSortMenu(false);
      setShowViewMenu(false);
    };
    document.addEventListener('click', handleClickOutside);
    return () => document.removeEventListener('click', handleClickOutside);
  }, []);

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
    if (isThisPC) {
      setFiles([]);
      setLoading(false);
      return;
    }
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
    onSelect(path);
    setContextMenu(null);
  };

  const filteredFiles = files.filter(f => f.name.toLowerCase().includes(search.toLowerCase()));

  const rowVirtualizer = useVirtualizer({
    count: filteredFiles.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => 36,
    overscan: 5,
  });

  const getFileIcon = (file: FileInfo) => {
    if (file.is_dir) return <Folder24Filled className="text-[#e3a833]" />;
    
    const name = file.name.toLowerCase();
    if (name.endsWith('.png') || name.endsWith('.jpg') || name.endsWith('.jpeg') || name.endsWith('.svg') || name.endsWith('.gif')) {
      return <Image24Regular className="text-[#00b4d8]" />;
    }
    if (name.endsWith('.js') || name.endsWith('.ts') || name.endsWith('.jsx') || name.endsWith('.tsx') || name.endsWith('.json') || name.endsWith('.css') || name.endsWith('.html')) {
      return <Document24Regular className="text-[#ff4d6d]" />;
    }
    if (name.endsWith('.zip') || name.endsWith('.tar') || name.endsWith('.gz') || name.endsWith('.rar')) {
      return <FolderZip24Regular className="text-[#ffb703]" />;
    }
    if (name.endsWith('.pdf')) {
      return <DocumentPdf24Regular className="text-[#e63946]" />;
    }
    if (name.endsWith('.mp3') || name.endsWith('.wav')) {
      return <MusicNote124Regular className="text-[#7209b7]" />;
    }
    if (name.endsWith('.mp4') || name.endsWith('.mkv')) {
      return <Video24Regular className="text-[#f77f00]" />;
    }
    
    return <Document24Regular className="text-[#a4b0be]" />;
  };

  const navigateUp = () => {
    if (isThisPC) return;
    const parts = currentPath.split(/[\\/]/).filter(Boolean);
    if (parts.length <= 1) {
      onNavigate('This PC');
      return;
    }
    parts.pop();
    let newPath = parts.join('\\');
    if (!newPath.includes(':') && currentPath.includes(':')) {
       newPath = parts[0] + '\\';
    }
    onNavigate(newPath);
  };

  const segments = currentPath && !isThisPC ? currentPath.replace(/\\/g, '/').split('/').filter(Boolean) : [];
  const navigateToSegment = (index: number) => {
    let newPath = segments.slice(0, index + 1).join('\\');
    if (!newPath.includes(':')) {
      newPath = '\\' + newPath;
    } else if (index === 0 && !newPath.endsWith('\\')) {
      newPath += '\\';
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
    <div className="flex flex-col h-full w-full bg-[#191919] text-[#e0e0e0] font-['Segoe_UI_Variable_Text','Segoe_UI',sans-serif] select-none selection:bg-[#3867d6]/30" onClick={() => { setSelectedFiles(new Set()); setLastSelected(null); }}>
      
      {/* Top Navigation Toolbar (Fluent Icons) */}
      <header className="flex flex-col bg-[#202020] border-b border-[rgba(255,255,255,0.08)]" onClick={e => e.stopPropagation()}>
        
        {/* Navigation & Address Bar */}
        <div className="flex items-center px-3 py-1.5 gap-2">
          
          <div className="flex items-center gap-0.5">
            <button onClick={goBack} disabled={!canGoBack} className="w-7 h-7 rounded flex items-center justify-center text-[#ababab] hover:bg-[rgba(255,255,255,0.08)] hover:text-[#f1f2f6] disabled:opacity-30 disabled:cursor-not-allowed transition-colors" title="Back" aria-label="Back"><ArrowLeft24Regular/></button>
            <button onClick={goForward} disabled={!canGoForward} className="w-7 h-7 rounded flex items-center justify-center text-[#ababab] hover:bg-[rgba(255,255,255,0.08)] hover:text-[#f1f2f6] disabled:opacity-30 disabled:cursor-not-allowed transition-colors" title="Forward" aria-label="Forward"><ArrowRight24Regular/></button>
            <button onClick={navigateUp} disabled={isThisPC} className="w-7 h-7 rounded flex items-center justify-center text-[#ababab] hover:bg-[rgba(255,255,255,0.08)] hover:text-[#f1f2f6] disabled:opacity-30 disabled:cursor-not-allowed transition-colors" title="Up" aria-label="Up"><ArrowUp24Regular/></button>
            <button onClick={loadFiles} className="w-7 h-7 rounded flex items-center justify-center text-[#ababab] hover:bg-[rgba(255,255,255,0.08)] hover:text-[#f1f2f6] transition-colors" title="Refresh" aria-label="Refresh"><ArrowClockwise24Regular/></button>
          </div>
          
          {/* Windows 11 Breadcrumb / Address Bar */}
          <div className="flex-1 flex items-center bg-[#2c2c2c] border border-[rgba(255,255,255,0.1)] rounded-md px-2.5 h-8 overflow-x-auto no-scrollbar gap-1 text-[13px]">
            <button 
              onClick={() => onNavigate('This PC')}
              className="flex items-center gap-1.5 text-[#e0e0e0] hover:bg-[rgba(255,255,255,0.08)] px-1.5 py-0.5 rounded transition-colors whitespace-nowrap"
            >
              <Desktop24Regular className="text-[#60cdff]" />
              <span>This PC</span>
            </button>
            
            {!isThisPC && (
              <>
                <ChevronRight24Regular className="text-[#767676] flex-shrink-0" />
                {segments.map((seg, i) => (
                  <div key={i} className="flex items-center">
                    {i > 0 && <ChevronRight24Regular className="text-[#767676] mx-0.5 flex-shrink-0" />}
                    <button
                      onClick={() => navigateToSegment(i)}
                      className={`px-1.5 py-0.5 rounded transition-colors whitespace-nowrap leading-none ${i === segments.length - 1 ? 'text-white font-medium' : 'text-[#ababab] hover:bg-[rgba(255,255,255,0.08)] hover:text-[#e0e0e0]'}`}
                    >
                      {seg}
                    </button>
                  </div>
                ))}
              </>
            )}
          </div>

          {/* Search Box */}
          <div className="flex items-center bg-[#2c2c2c] border border-[rgba(255,255,255,0.1)] rounded-md px-2.5 h-8 w-[240px] focus-within:border-[#60cdff] focus-within:bg-[#1a1a1a] transition-colors">
            <input 
              type="text" 
              placeholder={isThisPC ? "Search This PC" : `Search ${segments[segments.length - 1] || 'folder'}`} 
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="bg-transparent border-none outline-none text-[13px] text-[#e0e0e0] placeholder-[#767676] flex-1 min-w-0" 
            />
            <Search24Regular className="text-[#767676] ml-1 flex-shrink-0"/>
          </div>
        </div>
        
        {/* Command Bar (Action Buttons: New, Cut, Copy, Paste, Rename, Share, Delete, Sort, View) */}
        <div className="flex items-center justify-between px-3 py-1 bg-[#202020] border-t border-[rgba(255,255,255,0.06)] text-[13px] relative">
          <div className="flex items-center gap-1">
             
             {/* New Dropdown */}
             <div className="relative">
               <button 
                 onClick={(e) => { e.stopPropagation(); setShowNewMenu(!showNewMenu); setShowSortMenu(false); setShowViewMenu(false); }} 
                 className="flex items-center gap-1.5 px-2.5 py-1 rounded text-[#e0e0e0] hover:bg-[rgba(255,255,255,0.08)] transition-colors font-medium"
               >
                 <Add24Regular className="text-[#60cdff]" />
                 <span>New</span>
                 <ChevronDown24Regular className="text-[#ababab]" />
               </button>

               {showNewMenu && (
                 <div className="absolute top-full left-0 mt-1 z-50 bg-[#2c2c2c] border border-[rgba(255,255,255,0.12)] rounded-md shadow-2xl py-1 min-w-[150px]">
                   <button 
                     onClick={() => { setIsCreating('file'); setNewItemName(''); setShowNewMenu(false); }}
                     className="w-full text-left px-3 py-1.5 hover:bg-[rgba(255,255,255,0.08)] flex items-center gap-2 text-[#e0e0e0]"
                   >
                     <Document24Regular /> File
                   </button>
                   <button 
                     onClick={() => { setIsCreating('folder'); setNewItemName(''); setShowNewMenu(false); }}
                     className="w-full text-left px-3 py-1.5 hover:bg-[rgba(255,255,255,0.08)] flex items-center gap-2 text-[#e0e0e0]"
                   >
                     <Folder24Filled className="text-[#ffd32a]" /> Folder
                   </button>
                 </div>
               )}
             </div>

             <div className="w-px h-4 bg-[rgba(255,255,255,0.1)] mx-1"></div>
             
             {/* Windows 11 Fluent Icon Actions */}
             <button className="p-1.5 rounded text-[#ababab] hover:bg-[rgba(255,255,255,0.08)] hover:text-[#e0e0e0] disabled:opacity-30 transition-colors" title="Cut (Ctrl+X)" disabled={selectedFiles.size === 0}><Cut24Regular/></button>
             <button className="p-1.5 rounded text-[#ababab] hover:bg-[rgba(255,255,255,0.08)] hover:text-[#e0e0e0] disabled:opacity-30 transition-colors" title="Copy (Ctrl+C)" disabled={selectedFiles.size === 0}><Copy24Regular/></button>
             <button className="p-1.5 rounded text-[#ababab] hover:bg-[rgba(255,255,255,0.08)] hover:text-[#e0e0e0] disabled:opacity-30 transition-colors" title="Paste (Ctrl+V)"><Clipboard24Regular/></button>
             <button onClick={() => { if (selectedFiles.size === 1) { setRenamingPath(Array.from(selectedFiles)[0]); setRenameValue(Array.from(selectedFiles)[0].split(/[\\/]/).pop() || ''); } }} className="p-1.5 rounded text-[#ababab] hover:bg-[rgba(255,255,255,0.08)] hover:text-[#e0e0e0] disabled:opacity-30 transition-colors" title="Rename (F2)" disabled={selectedFiles.size !== 1}><Rename24Regular/></button>
             <button className="p-1.5 rounded text-[#ababab] hover:bg-[rgba(255,255,255,0.08)] hover:text-[#e0e0e0] disabled:opacity-30 transition-colors" title="Share" disabled={selectedFiles.size === 0}><Share24Regular/></button>
             <button onClick={() => { if (selectedFiles.size > 0) handleDelete(Array.from(selectedFiles)[0]); }} className="p-1.5 rounded text-[#ababab] hover:bg-[rgba(255,100,100,0.15)] hover:text-[#ff6b6b] disabled:opacity-30 transition-colors" title="Delete (Del)" disabled={selectedFiles.size === 0}><Delete24Regular/></button>
          </div>
          
          <div className="flex items-center gap-1">
            
            {/* Sort Dropdown */}
            <div className="relative">
              <button 
                onClick={(e) => { e.stopPropagation(); setShowSortMenu(!showSortMenu); setShowNewMenu(false); setShowViewMenu(false); }}
                className="flex items-center gap-1 px-2 py-1 rounded text-[#ababab] hover:bg-[rgba(255,255,255,0.08)] hover:text-[#e0e0e0] transition-colors"
              >
                <ArrowSort24Regular />
                <span>Sort</span>
                <ChevronDown24Regular />
              </button>

              {showSortMenu && (
                <div className="absolute top-full right-0 mt-1 z-50 bg-[#2c2c2c] border border-[rgba(255,255,255,0.12)] rounded-md shadow-2xl py-1 min-w-[140px]">
                  <div className="px-3 py-1 hover:bg-[rgba(255,255,255,0.08)] cursor-pointer text-[#e0e0e0]">Name</div>
                  <div className="px-3 py-1 hover:bg-[rgba(255,255,255,0.08)] cursor-pointer text-[#e0e0e0]">Date modified</div>
                  <div className="px-3 py-1 hover:bg-[rgba(255,255,255,0.08)] cursor-pointer text-[#e0e0e0]">Type</div>
                  <div className="px-3 py-1 hover:bg-[rgba(255,255,255,0.08)] cursor-pointer text-[#e0e0e0]">Size</div>
                </div>
              )}
            </div>

            {/* View Dropdown */}
            <div className="relative">
              <button 
                onClick={(e) => { e.stopPropagation(); setShowViewMenu(!showViewMenu); setShowNewMenu(false); setShowSortMenu(false); }}
                className="flex items-center gap-1 px-2 py-1 rounded text-[#ababab] hover:bg-[rgba(255,255,255,0.08)] hover:text-[#e0e0e0] transition-colors"
              >
                <Grid24Regular />
                <span>View</span>
                <ChevronDown24Regular />
              </button>

              {showViewMenu && (
                <div className="absolute top-full right-0 mt-1 z-50 bg-[#2c2c2c] border border-[rgba(255,255,255,0.12)] rounded-md shadow-2xl py-1 min-w-[140px]">
                  <div 
                    onClick={() => { setViewMode('grid'); setShowViewMenu(false); }}
                    className={`px-3 py-1 hover:bg-[rgba(255,255,255,0.08)] cursor-pointer flex items-center justify-between ${viewMode === 'grid' ? 'text-[#60cdff] font-medium' : 'text-[#e0e0e0]'}`}
                  >
                    <span>Grid Icons</span>
                    {viewMode === 'grid' && <CheckmarkCircle24Filled className="text-[#60cdff]" />}
                  </div>
                  <div 
                    onClick={() => { setViewMode('list'); setShowViewMenu(false); }}
                    className={`px-3 py-1 hover:bg-[rgba(255,255,255,0.08)] cursor-pointer flex items-center justify-between ${viewMode === 'list' ? 'text-[#60cdff] font-medium' : 'text-[#e0e0e0]'}`}
                  >
                    <span>Details List</span>
                    {viewMode === 'list' && <CheckmarkCircle24Filled className="text-[#60cdff]" />}
                  </div>
                </div>
              )}
            </div>

            <div className="w-px h-4 bg-[rgba(255,255,255,0.1)] mx-1"></div>
            <button 
              onClick={() => setSidebarCollapsed(!sidebarCollapsed)}
              className={`p-1.5 rounded transition-colors ${sidebarCollapsed ? 'bg-[rgba(255,255,255,0.12)] text-[#60cdff]' : 'text-[#ababab] hover:bg-[rgba(255,255,255,0.08)] hover:text-[#e0e0e0]'}`} 
              title={sidebarCollapsed ? "Expand navigation pane" : "Collapse navigation pane"}
              aria-label="Toggle navigation pane"
            >
              <Navigation24Regular/>
            </button>
            <button className="p-1.5 rounded text-[#ababab] hover:bg-[rgba(255,255,255,0.08)] hover:text-[#e0e0e0] transition-colors" title="More options"><MoreHorizontal24Regular/></button>
            <button className="p-1.5 rounded text-[#ababab] hover:bg-[rgba(255,255,255,0.08)] hover:text-[#e0e0e0] transition-colors" title="Details pane"><PanelRight24Regular/></button>
          </div>
        </div>
      </header>
      
      {/* Body Area */}
      <div className="flex-1 flex overflow-hidden">
        
        {/* Windows Navigation Sidebar (Collapsible & Decluttered) */}
        <nav className={`${sidebarCollapsed ? 'w-[52px]' : 'w-[230px]'} shrink-0 bg-[#202020] border-r border-[rgba(255,255,255,0.08)] flex flex-col py-2 overflow-y-auto no-scrollbar transition-all duration-150`} onClick={e => e.stopPropagation()}>
          
          {/* Quick Access Section */}
          <div className="mb-3">
            {!sidebarCollapsed ? (
              <button 
                onClick={() => setQuickAccessExpanded(!quickAccessExpanded)}
                className="w-full flex items-center gap-2 px-3 py-1 text-[11px] font-semibold text-[#767676] hover:text-[#ababab] tracking-wide mb-1 uppercase"
              >
                <ChevronRight24Regular className={`w-3.5 h-3.5 transition-transform ${quickAccessExpanded ? 'rotate-90' : ''}`} />
                <span>Quick Access</span>
              </button>
            ) : (
              <div className="w-full flex justify-center text-[10px] font-bold text-[#767676] uppercase py-1">QA</div>
            )}

            {(quickAccessExpanded || sidebarCollapsed) && (
              <ul className="list-none px-2 space-y-0.5">
                {quickAccessItems.map(item => {
                  const isActive = currentPath === item.path;
                  return (
                    <li key={item.path}>
                      <button 
                        onClick={() => onNavigate(item.path)}
                        title={item.label}
                        className={`w-full flex items-center ${sidebarCollapsed ? 'justify-center px-1' : 'justify-between px-2.5'} py-1.5 rounded text-[13px] transition-colors group ${isActive ? 'bg-[rgba(255,255,255,0.1)] text-white font-medium' : 'text-[#e0e0e0] hover:bg-[rgba(255,255,255,0.06)]'}`}
                      >
                        <div className="flex items-center gap-2.5 truncate min-w-0">
                          <Folder24Filled className={isActive ? "text-[#60cdff] flex-shrink-0" : "text-[#ababab] flex-shrink-0"} />
                          {!sidebarCollapsed && <span className="truncate">{item.label}</span>}
                        </div>
                        {!sidebarCollapsed && (
                          <span 
                            onClick={(e) => handleUnpinQuickAccess(e, item.path)}
                            title="Unpin from Quick Access"
                            className="p-0.5 rounded hover:bg-[rgba(255,255,255,0.15)] text-[#767676] hover:text-[#ff6b6b] opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0"
                          >
                            <Dismiss24Regular className="w-3.5 h-3.5" />
                          </span>
                        )}
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>

          <div className="w-full h-px bg-[rgba(255,255,255,0.08)] my-1"></div>

          {/* Hierarchical Tree Navigation: This PC & Drives */}
          <div className="px-2 mt-1">
            <div className="flex flex-col">
              <button 
                onClick={() => onNavigate('This PC')}
                title="This PC"
                className={`w-full flex items-center ${sidebarCollapsed ? 'justify-center px-1' : 'gap-2 px-2'} py-1.5 rounded text-[13px] transition-colors ${isThisPC ? 'bg-[rgba(255,255,255,0.1)] text-white font-medium' : 'text-[#e0e0e0] hover:bg-[rgba(255,255,255,0.06)]'}`}
              >
                {!sidebarCollapsed && (
                  <span 
                    onClick={(e) => { e.stopPropagation(); setThisPcExpanded(!thisPcExpanded); }}
                    className="p-0.5 hover:bg-[rgba(255,255,255,0.1)] rounded"
                  >
                    <ChevronRight24Regular className={`text-[#ababab] transition-transform ${thisPcExpanded ? 'rotate-90' : ''}`} />
                  </span>
                )}
                <Desktop24Regular className={isThisPC ? "text-[#60cdff]" : "text-[#ababab]"} />
                {!sidebarCollapsed && <span className="truncate">This PC</span>}
              </button>

              {/* Sub Tree under This PC */}
              {thisPcExpanded && (
                <div className="pl-6 space-y-0.5 mt-0.5">
                  {drives.map(d => {
                    const isDriveActive = currentPath.startsWith(d.mount_point);
                    return (
                      <button 
                        key={d.mount_point}
                        onClick={() => onNavigate(d.mount_point)}
                        className={`w-full flex items-center gap-2 px-2 py-1 rounded text-[12px] transition-colors ${isDriveActive ? 'bg-[rgba(255,255,255,0.1)] text-white' : 'text-[#ababab] hover:bg-[rgba(255,255,255,0.06)] hover:text-[#e0e0e0]'}`}
                      >
                        <HardDrive24Regular className="text-[#767676]" />
                        <span className="truncate">{d.name ? `${d.name} (${d.mount_point})` : d.mount_point}</span>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>

          </div>
        </nav>
        
        {/* Main Content Area */}
        <main className="flex-1 flex flex-col relative bg-[#191919] overflow-hidden">
           
           {/* "This PC" View: Devices and Drives */}
           {isThisPC ? (
             <div className="flex-1 p-5 overflow-y-auto">
               
               <div className="mb-4">
                 <button 
                   onClick={() => setDevicesExpanded(!devicesExpanded)}
                   className="flex items-center gap-2 text-[13px] font-semibold text-[#e0e0e0] hover:text-white mb-3"
                 >
                   <ChevronRight24Regular className={`text-[#ababab] transition-transform ${devicesExpanded ? 'rotate-90' : ''}`} />
                   <span>Devices and drives</span>
                 </button>

                 {devicesExpanded && (
                   <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 pl-4">
                     {drives.map(drive => {
                       const usedBytes = drive.total_space - drive.available_space;
                       const usagePercent = drive.total_space > 0 ? Math.min(100, Math.max(0, (usedBytes / drive.total_space) * 100)) : 0;
                       const isLowSpace = drive.total_space > 0 ? (drive.available_space / drive.total_space) < 0.15 : false;
                       const label = drive.name ? `${drive.name} (${drive.mount_point})` : drive.mount_point;

                       return (
                         <div 
                           key={drive.mount_point}
                           onClick={() => onNavigate(drive.mount_point)}
                           className="flex items-start gap-3 p-3 bg-[#202020] border border-[rgba(255,255,255,0.08)] hover:bg-[#282828] hover:border-[rgba(255,255,255,0.18)] rounded-md cursor-pointer transition-all"
                         >
                           {/* Drive Icon with Sync Badge */}
                           <div className="relative shrink-0 mt-0.5">
                             <HardDrive24Regular className="text-[#a0a0a0] w-9 h-9" />
                             <CheckmarkCircle24Filled className="text-[#2ed573] bg-[#202020] rounded-full absolute -bottom-1 -right-1 w-4 h-4" />
                           </div>

                           {/* Drive Details & Progress Bar */}
                           <div className="flex-1 min-w-0">
                             <div className="text-[13px] font-medium text-white truncate" title={label}>
                               {label}
                             </div>
                             
                             {/* Progress Bar (Low space red, normal blue) */}
                             <div className="w-full h-3 bg-[#333333] rounded-sm overflow-hidden my-1.5 border border-[rgba(255,255,255,0.05)]">
                               <div 
                                 className={`h-full transition-all ${isLowSpace ? 'bg-[#e81123]' : 'bg-[#0078d4]'}`}
                                 style={{ width: `${usagePercent}%` }}
                               />
                             </div>

                             <div className="text-[11px] text-[#ababab]">
                               {formatGB(drive.available_space)} free of {formatGB(drive.total_space)}
                             </div>
                           </div>
                         </div>
                       );
                     })}
                   </div>
                 )}
               </div>

             </div>
           ) : (
             
             /* Standard Directory View */
             <>
               {viewMode === 'list' && !loading && (
                 <div className="flex px-4 py-1.5 bg-[#202020] border-b border-[rgba(255,255,255,0.08)] text-[12px] font-semibold text-[#ababab]">
                   <div className="flex-[2] min-w-[200px] pl-10">Name</div>
                   <div className="flex-1 min-w-[100px]">Type</div>
                   <div className="w-[100px] text-right">Size</div>
                 </div>
               )}

               <div className="flex-1 overflow-y-auto custom-scrollbar relative p-4" ref={parentRef}>
                 {loading ? (
                    <div className="flex-1 flex items-center justify-center animate-pulse text-[#60cdff] py-12">Loading Files...</div>
                 ) : (
                    <div 
                      className={viewMode === 'grid' ? "grid grid-cols-[repeat(auto-fill,minmax(110px,1fr))] gap-3" : "relative w-full"}
                      style={viewMode === 'list' ? { height: `${rowVirtualizer.getTotalSize()}px` } : {}}
                    >
                      {/* Inline Creation */}
                      {isCreating && (
                        <div className={`flex items-center gap-3 p-3 rounded-md border border-[#0078d4] bg-[rgba(0,120,212,0.1)] ${viewMode === 'grid' ? 'col-span-full md:col-span-1 flex-col' : ''}`}>
                          <div className="flex items-center justify-center w-10 h-10">
                            {isCreating === 'folder' ? <Folder24Filled className="text-[#ffd32a]" /> : <Document24Regular className="text-[#a4b0be]" />}
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
                            className={`bg-transparent text-[#e0e0e0] text-[13px] outline-none ${viewMode === 'grid' ? 'w-full text-center mt-2' : 'flex-1'}`}
                            placeholder={`New ${isCreating}...`}
                          />
                        </div>
                      )}

                      {filteredFiles.length === 0 && !isCreating && (
                        <div className="col-span-full py-12 text-center text-[#767676] italic text-[13px]">
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
                              className={`flex flex-col items-center p-3 rounded-md cursor-pointer transition-colors border border-transparent ${isSelected ? 'bg-[rgba(0,120,212,0.25)] border-[rgba(0,120,212,0.6)]' : 'hover:bg-[rgba(255,255,255,0.06)]'}`}
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
                                  className="bg-black/50 text-[#e0e0e0] text-[13px] px-1 outline-none border border-[#0078d4] rounded w-full text-center"
                                />
                              ) : (
                                <div className={`text-[13px] text-center break-words line-clamp-2 w-full ${isSelected ? 'text-white font-medium' : 'text-[#e0e0e0]'}`} title={file.name}>
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
                              className={`absolute top-0 left-0 w-full flex items-center px-4 py-1.5 cursor-pointer rounded-md transition-colors border border-transparent ${isSelected ? 'bg-[rgba(0,120,212,0.25)] border-[rgba(0,120,212,0.6)]' : 'hover:bg-[rgba(255,255,255,0.06)]'}`}
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
                                    className="bg-black/50 text-[#e0e0e0] text-[13px] px-1 outline-none border border-[#0078d4] rounded flex-1"
                                  />
                                ) : (
                                  <span className={`text-[13px] truncate ${isSelected ? 'text-white font-medium' : 'text-[#e0e0e0]'}`} title={file.name}>{file.name}</span>
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
                              
                              <div className="flex-1 min-w-[100px] text-[13px] text-[#ababab] truncate pr-2">
                                {file.is_dir ? 'File folder' : 'File'}
                              </div>
                              <div className="w-[100px] text-right text-[13px] text-[#ababab]">
                                {file.is_dir ? '--' : formatSize(file.size_bytes)}
                              </div>
                            </div>
                          );
                        })
                      )}
                    </div>
                 )}
               </div>
             </>
           )}
        </main>
      </div>
      
      {/* Bottom Windows 11 Status Bar */}
      <footer className="h-[26px] shrink-0 bg-[#202020] border-t border-[rgba(255,255,255,0.08)] flex items-center justify-between px-3 text-[12px] text-[#ababab]" onClick={e => e.stopPropagation()}>
        <div className="flex items-center gap-2">
          <span>{isThisPC ? `${drives.length} items` : `${files.length} items`}</span>
          {selectedFiles.size > 0 && !isThisPC && (
            <>
              <span className="text-[rgba(255,255,255,0.2)]">|</span>
              <span className="text-[#e0e0e0]">{selectedFiles.size} item{selectedFiles.size > 1 ? 's' : ''} selected</span>
              {selectedSize > 0 && (
                 <>
                   <span className="text-[rgba(255,255,255,0.2)]">|</span>
                   <span className="text-[#e0e0e0]">{formatSize(selectedSize)}</span>
                 </>
              )}
            </>
          )}
        </div>

        {/* View Mode Switcher Icons */}
        <div className="flex items-center gap-1">
          <button 
            onClick={() => setViewMode('grid')}
            className={`p-1 rounded transition-colors ${viewMode === 'grid' ? 'bg-[rgba(255,255,255,0.12)] text-white' : 'hover:bg-[rgba(255,255,255,0.06)] text-[#767676]'}`}
            title="Large icons grid"
          >
            <Grid24Regular />
          </button>
          <button 
            onClick={() => setViewMode('list')}
            className={`p-1 rounded transition-colors ${viewMode === 'list' ? 'bg-[rgba(255,255,255,0.12)] text-white' : 'hover:bg-[rgba(255,255,255,0.06)] text-[#767676]'}`}
            title="Details list"
          >
            <List24Regular />
          </button>
        </div>
      </footer>

      {/* Context Menu Modal */}
      {contextMenu && (
        <div 
          className="fixed z-50 bg-[#2c2c2c] border border-[rgba(255,255,255,0.12)] rounded-md shadow-2xl min-w-[200px] text-[13px] text-[#e0e0e0] py-1"
          style={{ top: contextMenu.y, left: contextMenu.x }}
          onClick={e => e.stopPropagation()}
        >
          <div 
            className="px-3 py-2 hover:bg-[rgba(255,255,255,0.08)] cursor-pointer flex items-center gap-2 transition-colors"
            onClick={() => {
              setRenamingPath(contextMenu.path);
              setRenameValue(contextMenu.path.split(/[\\/]/).pop() || '');
              setContextMenu(null);
            }}
          >
            <Rename24Regular /> Rename
          </div>
          <div 
            className="px-3 py-2 hover:bg-[rgba(255,100,100,0.15)] cursor-pointer text-[#ff6b6b] flex items-center gap-2 transition-colors"
            onClick={() => {
              handleDelete(contextMenu.path);
              setContextMenu(null);
            }}
          >
            <Delete24Regular /> Delete
          </div>
          
          <div className="border-t border-[rgba(255,255,255,0.08)] my-0.5"></div>
          
          <div 
            className="px-3 py-2 hover:bg-[rgba(255,255,255,0.08)] cursor-pointer transition-colors flex items-center gap-2"
            onClick={() => {
              if (onAddToShelf) onAddToShelf(contextMenu.path);
              setContextMenu(null);
            }}
          >
            ðŸ—ƒï¸ Add to Shelf
          </div>
          
          {(files.find(f => f.path === contextMenu.path)?.is_dir) && (
            <div 
              className="px-3 py-2 hover:bg-[rgba(255,255,255,0.08)] cursor-pointer transition-colors flex items-center gap-2"
              onClick={() => {
                handlePinToQuickAccess(contextMenu.path);
                setContextMenu(null);
              }}
            >
              <Pin24Filled className="text-[#60cdff]" /> Pin to Quick Access
            </div>
          )}
          
          {(!files.find(f => f.path === contextMenu.path)?.is_dir) && (
             <div 
               className="px-3 py-2 hover:bg-[rgba(255,255,255,0.08)] cursor-pointer transition-colors"
               onClick={() => {
                 if (onFileDoubleClicked) onFileDoubleClicked(contextMenu.path);
                 setContextMenu(null);
               }}
             >
               ðŸ“„ Preview
             </div>
          )}
          
          <div className="border-t border-[rgba(255,255,255,0.08)] my-0.5"></div>
          
          {(contextMenu.path.toLowerCase().endsWith('.png') || contextMenu.path.toLowerCase().endsWith('.jpg') || contextMenu.path.toLowerCase().endsWith('.svg')) && (
            <div 
              className="px-3 py-2 hover:bg-[rgba(255,255,255,0.08)] cursor-pointer transition-colors"
              onClick={() => {
                if (onOptimizeAsset) onOptimizeAsset(contextMenu.path);
                setContextMenu(null);
              }}
            >
              âš¡ Optimize Asset
            </div>
          )}
          
          <div className="border-t border-[rgba(255,255,255,0.08)] my-0.5"></div>
          
          <div 
            className="px-3 py-2 hover:bg-[rgba(255,255,255,0.08)] cursor-pointer transition-colors"
            onClick={() => {
              navigator.clipboard.writeText(contextMenu.path);
              setContextMenu(null);
            }}
          >
            ðŸ“‹ Copy Absolute Path
          </div>

          <div className="border-t border-[rgba(255,255,255,0.08)] my-0.5"></div>
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

      {/* Delete Confirmation Modal */}
      {deleteConfirmTarget && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 p-4" onClick={e => e.stopPropagation()}>
          <div className="bg-[#2c2c2c] border border-[rgba(255,255,255,0.12)] rounded-lg p-6 max-w-md w-full flex flex-col gap-4 shadow-2xl">
            <h3 className="text-lg font-semibold text-[#f1f2f6]">Confirm Deletion</h3>
            <p className="text-[#ababab] text-[13px]">
              {deleteConfirmTarget.isDir 
                ? "Are you sure you want to delete this folder and all its contents?" 
                : "Are you sure you want to delete this file?"}
            </p>
            <p className="text-[12px] text-[#ff6b6b] bg-[rgba(255,100,100,0.1)] p-2 rounded break-all border border-[rgba(255,100,100,0.2)]">
              {deleteConfirmTarget.path}
            </p>
            <div className="flex justify-end gap-3 mt-2">
              <button
                onClick={() => setDeleteConfirmTarget(null)}
                className="px-4 py-2 bg-[rgba(255,255,255,0.08)] hover:bg-[rgba(255,255,255,0.12)] text-[#e0e0e0] rounded text-[13px] transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={() => confirmDeleteFile(deleteConfirmTarget.path)}
                className="px-4 py-2 bg-[#d32f2f] hover:bg-[#c62828] text-white rounded text-[13px] transition-colors"
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
