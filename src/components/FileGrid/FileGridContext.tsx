import { createContext, useContext, useState, useEffect, useRef } from 'react';
import type { ReactNode } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { getGitStatus } from '../../ipc';
import { useToast, useStore } from '../../store/store';
import type { FileInfo, DriveInfo } from './types';

interface FileGridContextType {
  currentPath: string;
  onNavigate: (path: string) => void;
  selectedFile: string | null;
  onSelect: (path: string) => void;
  onAddToShelf?: (path: string) => void;
  onOptimizeAsset?: (path: string) => void;
  onFileDoubleClicked?: (path: string) => void;
  
  files: FileInfo[];
  gitStatus: Record<string, string>;
  loading: boolean;
  viewMode: 'grid' | 'list';
  setViewMode: (mode: 'grid' | 'list') => void;
  search: string;
  setSearch: (search: string) => void;
  drives: DriveInfo[];
  
  contextMenu: { x: number; y: number; path: string } | null;
  setContextMenu: (val: { x: number; y: number; path: string } | null) => void;
  showNewMenu: boolean;
  setShowNewMenu: (val: boolean) => void;
  showSortMenu: boolean;
  setShowSortMenu: (val: boolean) => void;
  showViewMenu: boolean;
  setShowViewMenu: (val: boolean) => void;
  
  isCreating: 'file' | 'folder' | null;
  setIsCreating: (val: 'file' | 'folder' | null) => void;
  newItemName: string;
  setNewItemName: (val: string) => void;
  
  renamingPath: string | null;
  setRenamingPath: (val: string | null) => void;
  renameValue: string;
  setRenameValue: (val: string) => void;
  
  deleteConfirmTarget: { path: string; isDir: boolean } | null;
  setDeleteConfirmTarget: (val: { path: string; isDir: boolean } | null) => void;
  
  selectedFiles: Set<string>;
  setSelectedFiles: (val: Set<string>) => void;
  lastSelected: string | null;
  setLastSelected: (val: string | null) => void;
  
  devicesExpanded: boolean;
  setDevicesExpanded: (val: boolean) => void;
  thisPcExpanded: boolean;
  setThisPcExpanded: (val: boolean) => void;
  quickAccessExpanded: boolean;
  setQuickAccessExpanded: (val: boolean) => void;
  sidebarCollapsed: boolean;
  setSidebarCollapsed: (val: boolean) => void;
  
  quickAccessItems: { label: string; path: string }[];
  handleUnpinQuickAccess: (e: React.MouseEvent, path: string) => void;
  handlePinToQuickAccess: (path: string) => void;
  
  parentRef: React.RefObject<HTMLDivElement | null>;
  
  goBack: () => void;
  goForward: () => void;
  canGoBack: boolean;
  canGoForward: boolean;
  isThisPC: boolean;
  
  loadFiles: () => Promise<void>;
  handleCreate: () => Promise<void>;
  handleRename: (oldPath: string) => Promise<void>;
  handleDelete: (path: string) => void;
  confirmDeleteFile: (path: string) => Promise<void>;
  handleDrop: (e: React.DragEvent, targetDir: string) => Promise<void>;
  handleItemSelect: (e: React.MouseEvent, path: string, filteredFiles: FileInfo[]) => void;
  
  navigateUp: () => void;
  segments: string[];
  navigateToSegment: (index: number) => void;
}

const FileGridContext = createContext<FileGridContextType | undefined>(undefined);

/* eslint-disable react-refresh/only-export-components */
export const useFileGridContext = () => {
  const context = useContext(FileGridContext);
  if (!context) throw new Error("useFileGridContext must be used within FileGridProvider");
  return context;
};

export const FileGridProvider = ({
  children,
  currentPath,
  onNavigate,
  selectedFile,
  onSelect,
  onAddToShelf,
  onOptimizeAsset,
  onFileDoubleClicked
}: {
  children: ReactNode;
  currentPath: string;
  onNavigate: (path: string) => void;
  selectedFile: string | null;
  onSelect: (path: string) => void;
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

  const [quickAccessItems, setQuickAccessItems] = useState([
    { label: 'Desktop', path: 'C:\\Users\\sivak\\Desktop' },
    { label: 'Downloads', path: 'C:\\Users\\sivak\\Downloads' },
    { label: 'Documents', path: 'C:\\Users\\sivak\\Documents' },
    { label: 'Pictures', path: 'C:\\Users\\sivak\\Pictures' },
    { label: 'Music', path: 'C:\\Users\\sivak\\Music' },
    { label: 'Videos', path: 'C:\\Users\\sivak\\Videos' },
  ]);

  const parentRef = useRef<HTMLDivElement>(null);
  const { success, error } = useToast();

  const goBack = useStore(s => s.goBack);
  const goForward = useStore(s => s.goForward);
  const activeTabId = useStore(s => s.activeTabId);
  const tabs = useStore(s => s.tabs);
  const activeTab = tabs.find(t => t.id === activeTabId);
  const canGoBack = activeTab ? activeTab.historyIndex > 0 : false;
  const canGoForward = activeTab ? activeTab.historyIndex < activeTab.pathHistory.length - 1 : false;

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
          const status = await getGitStatus(currentPath);
          const map: Record<string, string> = {};
          status.staged.forEach(f => {
            map[f] = 'staged';
            const base = f.split('/').pop() || f;
            map[base] = 'staged';
          });
          status.unstaged.forEach(f => {
            map[f] = 'modified';
            const base = f.split('/').pop() || f;
            map[base] = 'modified';
          });
          status.untracked.forEach(f => {
            map[f] = 'untracked';
            const base = f.split('/').pop() || f;
            map[base] = 'untracked';
          });
          setGitStatus(map);
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
    } catch (err: unknown) {
      error('Failed to move file', err instanceof Error ? err.message : String(err));
    }
  };

  const handleItemSelect = (e: React.MouseEvent, path: string, filteredFiles: FileInfo[]) => {
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

  return (
    <FileGridContext.Provider value={{
      currentPath, onNavigate, selectedFile, onSelect, onAddToShelf, onOptimizeAsset, onFileDoubleClicked,
      files, gitStatus, loading, viewMode, setViewMode, search, setSearch, drives,
      contextMenu, setContextMenu, showNewMenu, setShowNewMenu, showSortMenu, setShowSortMenu, showViewMenu, setShowViewMenu,
      isCreating, setIsCreating, newItemName, setNewItemName,
      renamingPath, setRenamingPath, renameValue, setRenameValue,
      deleteConfirmTarget, setDeleteConfirmTarget,
      selectedFiles, setSelectedFiles, lastSelected, setLastSelected,
      devicesExpanded, setDevicesExpanded, thisPcExpanded, setThisPcExpanded, quickAccessExpanded, setQuickAccessExpanded, sidebarCollapsed, setSidebarCollapsed,
      quickAccessItems, handleUnpinQuickAccess, handlePinToQuickAccess,
      parentRef,
      goBack, goForward, canGoBack, canGoForward, isThisPC,
      loadFiles, handleCreate, handleRename, handleDelete, confirmDeleteFile, handleDrop, handleItemSelect,
      navigateUp, segments, navigateToSegment
    }}>
      {children}
    </FileGridContext.Provider>
  );
};
