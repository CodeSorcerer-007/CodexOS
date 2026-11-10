import { createContext, useContext, useState, useEffect, useRef } from 'react';
import type { ReactNode } from 'react';
import { invoke } from '@tauri-apps/api/core';
import {
  getGitStatus,
  undoLastFileOperation,
  getFileOperationHistory,
  permanentDeleteFile,
  formatFileError,
  checkFileConflicts,
  executeFileTransfer,
  type JournalEntry,
  type ConflictAction,
  type ConflictInfo,
  type TransferItemSpec,
  type BatchTransferResult,
} from '../../ipc';
import { useToast, useStore } from '../../store/store';
import { useSearchStore } from '../../store/searchStore';
import type { FileInfo, DriveInfo } from './types';

export interface ActiveConflictSession {
  operation: 'copy' | 'move';
  sources: string[];
  targetDir: string;
  conflicts: ConflictInfo[];
  currentIndex: number;
  recordedItems: TransferItemSpec[];
  nonConflictingItems: TransferItemSpec[];
}

export interface PermanentDeleteTarget {
  paths: string[];
  totalCount: number;
  fileCount: number;
  dirCount: number;
  representativeNames: string[];
  hasFolders: boolean;
}

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
  permanentDeleteTarget: PermanentDeleteTarget | null;
  setPermanentDeleteTarget: (val: PermanentDeleteTarget | null) => void;
  
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
  handlePermanentDelete: (path?: string) => void;
  confirmPermanentDelete: (customPaths?: string[]) => Promise<void>;
  handleDrop: (e: React.DragEvent, targetDir: string) => Promise<void>;
  handleItemSelect: (e: React.MouseEvent, path: string, filteredFiles: FileInfo[]) => void;
  
  clipboard: { paths: string[]; op: 'copy' | 'move' } | null;
  setClipboard: (val: { paths: string[]; op: 'copy' | 'move' } | null) => void;
  handleCopySelected: (customPaths?: string[]) => void;
  handleCutSelected: (customPaths?: string[]) => void;
  handlePaste: (targetDir?: string) => Promise<void>;

  activeConflictSession: ActiveConflictSession | null;
  resolveConflict: (action: ConflictAction, applyToAll: boolean) => Promise<void>;
  cancelConflict: () => void;
  initiateTransfer: (sources: string[], targetDir: string, op: 'copy' | 'move') => Promise<void>;

  handleUndo: () => Promise<void>;
  isUndoing: boolean;
  historyModalOpen: boolean;
  setHistoryModalOpen: (val: boolean) => void;
  operationHistory: JournalEntry[];
  loadOperationHistory: () => Promise<void>;

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
  const [permanentDeleteTarget, setPermanentDeleteTarget] = useState<PermanentDeleteTarget | null>(null);

  const [isUndoing, setIsUndoing] = useState(false);
  const [historyModalOpen, setHistoryModalOpen] = useState(false);
  const [operationHistory, setOperationHistory] = useState<JournalEntry[]>([]);
  const [clipboard, setClipboard] = useState<{ paths: string[]; op: 'copy' | 'move' } | null>(null);
  const [activeConflictSession, setActiveConflictSession] = useState<ActiveConflictSession | null>(null);

  const [selectedFiles, setSelectedFiles] = useState<Set<string>>(new Set());
  const [lastSelected, setLastSelected] = useState<string | null>(null);

  const [devicesExpanded, setDevicesExpanded] = useState(true);
  const [thisPcExpanded, setThisPcExpanded] = useState(true);
  const [quickAccessExpanded, setQuickAccessExpanded] = useState(true);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);

  const [quickAccessItems, setQuickAccessItems] = useState([
    { label: 'Desktop', path: '' },
    { label: 'Downloads', path: '' },
    { label: 'Documents', path: '' },
    { label: 'Pictures', path: '' },
    { label: 'Music', path: '' },
    { label: 'Videos', path: '' },
  ]);

  useEffect(() => {
    invoke<string>('get_user_home_dir')
      .then((home) => {
        if (!home) return;
        const sep = home.includes('/') ? '/' : '\\';
        setQuickAccessItems([
          { label: 'Desktop', path: `${home}${sep}Desktop` },
          { label: 'Downloads', path: `${home}${sep}Downloads` },
          { label: 'Documents', path: `${home}${sep}Documents` },
          { label: 'Pictures', path: `${home}${sep}Pictures` },
          { label: 'Music', path: `${home}${sep}Music` },
          { label: 'Videos', path: `${home}${sep}Videos` },
        ]);
      })
      .catch(() => {});
  }, []);

  const parentRef = useRef<HTMLDivElement>(null);
  const { success, error, info, warning } = useToast();

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
      const name = path.split(/[\\/]/).pop() || path;
      success('Moved to Recycle Bin', `${name} was moved to the Recycle Bin.`);
      loadFiles();
      const newSelected = new Set(selectedFiles);
      newSelected.delete(path);
      setSelectedFiles(newSelected);
      loadOperationHistory();
    } catch (e: unknown) {
      const formatted = formatFileError(e);
      error(formatted.title, formatted.message);
    } finally {
      setDeleteConfirmTarget(null);
    }
  };

  const handlePermanentDelete = (singlePath?: string) => {
    let targetPaths: string[] = [];
    if (singlePath) {
      if (selectedFiles.has(singlePath) && selectedFiles.size > 1) {
        targetPaths = Array.from(selectedFiles);
      } else {
        targetPaths = [singlePath];
      }
    } else {
      targetPaths = Array.from(selectedFiles);
    }

    if (targetPaths.length === 0) return;

    let dirCount = 0;
    let fileCount = 0;
    const representativeNames: string[] = [];

    for (const p of targetPaths) {
      const fileInfo = files.find(f => f.path === p);
      if (fileInfo?.is_dir) {
        dirCount++;
      } else {
        fileCount++;
      }
      if (representativeNames.length < 3) {
        representativeNames.push(p.split(/[\\/]/).pop() || p);
      }
    }

    setPermanentDeleteTarget({
      paths: targetPaths,
      totalCount: targetPaths.length,
      fileCount,
      dirCount,
      representativeNames,
      hasFolders: dirCount > 0,
    });
  };

  const confirmPermanentDelete = async (customPaths?: string[]) => {
    const pathsToDelete = customPaths || permanentDeleteTarget?.paths || [];
    if (pathsToDelete.length === 0) {
      setPermanentDeleteTarget(null);
      return;
    }

    let deletedCount = 0;
    const deletedPaths = new Set<string>();

    for (const p of pathsToDelete) {
      try {
        await permanentDeleteFile(p, true);
        deletedCount++;
        deletedPaths.add(p);
      } catch (e: unknown) {
        const formatted = formatFileError(e);
        error(formatted.title, formatted.message);
        break; // Stop on first failure to prevent partial cascade
      }
    }

    if (deletedCount > 0) {
      const msg = deletedCount === 1
        ? `${pathsToDelete[0].split(/[\\/]/).pop() || pathsToDelete[0]} was permanently removed from disk.`
        : `${deletedCount} items were permanently removed from disk.`;
      success('Permanently Deleted', msg);
      loadFiles();
      const newSelected = new Set(selectedFiles);
      for (const p of deletedPaths) {
        newSelected.delete(p);
      }
      setSelectedFiles(newSelected);
      loadOperationHistory();
    }

    setPermanentDeleteTarget(null);
  };

  const loadOperationHistory = async () => {
    try {
      const history = await getFileOperationHistory(30);
      setOperationHistory(history);
    } catch (e: unknown) {
      console.error('Failed to load operation history:', e);
    }
  };

  const handleUndo = async () => {
    if (isUndoing) return;
    setIsUndoing(true);
    try {
      let latestEntry = operationHistory[0];
      if (!latestEntry) {
        const history = await getFileOperationHistory(1);
        if (history.length > 0) {
          latestEntry = history[0];
        }
      }

      if (latestEntry && latestEntry.type === 'DeleteTrash') {
        const targetPath = latestEntry.path || 'Item';
        const fileName = targetPath.split(/[\\/]/).pop() || targetPath;
        info(
          'Manual Recovery Required',
          `"${fileName}" was moved to the Windows Recycle Bin. To restore it, open the Windows Recycle Bin on your desktop, right-click the item, and select "Restore".`
        );
        return;
      }

      const result = await undoLastFileOperation();
      if (result.success) {
        success('File Operation Undone', result.description);
        await loadFiles();
        await loadOperationHistory();
      } else {
        error('Cannot Undo Operation', result.description);
      }
    } catch (e: unknown) {
      const formatted = formatFileError(e);
      error(formatted.title, formatted.message);
    } finally {
      setIsUndoing(false);
    }
  };

  const handleCopySelected = (customPaths?: string[]) => {
    const paths = customPaths || Array.from(selectedFiles);
    if (paths.length === 0) return;
    setClipboard({ paths, op: 'copy' });
    info('Copied to Clipboard', paths.length === 1 ? '1 item ready to copy' : `${paths.length} items ready to copy`);
  };

  const handleCutSelected = (customPaths?: string[]) => {
    const paths = customPaths || Array.from(selectedFiles);
    if (paths.length === 0) return;
    setClipboard({ paths, op: 'move' });
    info('Cut to Clipboard', paths.length === 1 ? '1 item ready to move' : `${paths.length} items ready to move`);
  };

  const handleTransferResult = (result: BatchTransferResult, op: 'copy' | 'move') => {
    const isMove = op === 'move';
    if (result.failed_count === 0 && result.skipped_count === 0) {
      const msg = result.total_items === 1
        ? `Successfully ${isMove ? 'moved' : 'copied'} 1 item.`
        : `Successfully ${isMove ? 'moved' : 'copied'} ${result.total_items} items.`;
      success(isMove ? 'Move Complete' : 'Copy Complete', msg);
      if (isMove && clipboard && clipboard.op === 'move') {
        setClipboard(null);
      }
    } else if (result.success_count > 0) {
      warning(
        'Transfer Completed with Notices',
        `${result.success_count} transferred, ${result.skipped_count} skipped, ${result.failed_count} failed.`
      );
      if (isMove && clipboard && clipboard.op === 'move') {
        const succeeded = new Set(
          result.records
            .filter(r => r.status === 'copied' || r.status === 'moved' || r.status === 'replaced' || r.status === 'renamed')
            .map(r => r.source)
        );
        const remaining = clipboard.paths.filter(p => !succeeded.has(p));
        setClipboard(remaining.length > 0 ? { paths: remaining, op: 'move' } : null);
      }
    } else if (result.skipped_count > 0 && result.failed_count === 0) {
      info('Items Skipped', 'Existing items in destination were left unchanged.');
    } else {
      const firstErr = result.records.find(r => r.error)?.error || 'Transfer failed.';
      const formatted = formatFileError(firstErr);
      error(formatted.title, formatted.message);
    }
    loadFiles();
    loadOperationHistory();
  };

  const initiateTransfer = async (
    sources: string[],
    targetDir: string,
    op: 'copy' | 'move'
  ) => {
    if (!sources || sources.length === 0) return;
    if (isThisPC) {
      error('Transfer Not Supported', 'Cannot transfer files directly into "This PC". Open a folder or drive first.');
      return;
    }

    try {
      const check = await checkFileConflicts(sources, targetDir, op);
      const normalizedTarget = targetDir.endsWith('\\') || targetDir.endsWith('/')
        ? targetDir
        : targetDir + '\\';

      const conflictingSources = new Set(check.conflicts.map(c => c.source_path));
      const nonConflictingItems: TransferItemSpec[] = sources
        .filter(s => !conflictingSources.has(s))
        .map(s => {
          const name = s.split(/[\\/]/).pop() || s;
          return {
            source: s,
            dest: normalizedTarget + name,
            action: null,
          };
        });

      if (check.conflicts.length === 0) {
        if (nonConflictingItems.length === 0) return;
        const transferId = 'tx_' + Date.now() + '_' + Math.random().toString(36).substring(2, 7);
        const result = await executeFileTransfer(op, nonConflictingItems, null, transferId);
        handleTransferResult(result, op);
      } else {
        setActiveConflictSession({
          operation: op,
          sources,
          targetDir,
          conflicts: check.conflicts,
          currentIndex: 0,
          recordedItems: [],
          nonConflictingItems,
        });
      }
    } catch (err: unknown) {
      const formatted = formatFileError(err);
      error(formatted.title, formatted.message);
    }
  };

  const resolveConflict = async (action: ConflictAction, applyToAll: boolean) => {
    if (!activeConflictSession) return;
    const { operation, conflicts, currentIndex, recordedItems, nonConflictingItems } = activeConflictSession;
    const currentConflict = conflicts[currentIndex];

    if (applyToAll) {
      const allResolvedItems: TransferItemSpec[] = [
        ...nonConflictingItems,
        ...recordedItems,
        ...conflicts.slice(currentIndex).map(c => ({
          source: c.source_path,
          dest: c.dest_path,
          action,
        })),
      ];
      setActiveConflictSession(null);
      try {
        const transferId = 'tx_' + Date.now() + '_' + Math.random().toString(36).substring(2, 7);
        const result = await executeFileTransfer(operation, allResolvedItems, action, transferId);
        handleTransferResult(result, operation);
      } catch (err: unknown) {
        const formatted = formatFileError(err);
        error(formatted.title, formatted.message);
      }
      return;
    }

    const newRecorded: TransferItemSpec[] = [
      ...recordedItems,
      {
        source: currentConflict.source_path,
        dest: currentConflict.dest_path,
        action,
      },
    ];

    if (currentIndex + 1 < conflicts.length) {
      setActiveConflictSession({
        ...activeConflictSession,
        currentIndex: currentIndex + 1,
        recordedItems: newRecorded,
      });
    } else {
      const allItems: TransferItemSpec[] = [
        ...nonConflictingItems,
        ...newRecorded,
      ];
      setActiveConflictSession(null);
      try {
        const transferId = 'tx_' + Date.now() + '_' + Math.random().toString(36).substring(2, 7);
        const result = await executeFileTransfer(operation, allItems, null, transferId);
        handleTransferResult(result, operation);
      } catch (err: unknown) {
        const formatted = formatFileError(err);
        error(formatted.title, formatted.message);
      }
    }
  };

  const cancelConflict = () => {
    setActiveConflictSession(null);
    info('Transfer Cancelled', 'No destination files were modified.');
  };

  const handlePaste = async (targetDir?: string) => {
    if (!clipboard || clipboard.paths.length === 0) return;
    const destination = targetDir || currentPath;
    await initiateTransfer(clipboard.paths, destination, clipboard.op);
  };

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const isMac = typeof navigator !== 'undefined' && navigator.platform.toUpperCase().indexOf('MAC') >= 0;
      const isCmdOrCtrl = isMac ? e.metaKey : e.ctrlKey;

      // Global Search (Ctrl+Shift+F) - works from anywhere
      if (isCmdOrCtrl && e.shiftKey && e.key.toLowerCase() === 'f') {
        e.preventDefault();
        useSearchStore.getState().openSearch(currentPath, segments[segments.length - 1] || 'Workspace');
        return;
      }

      // Don't trigger standard shortcuts if user is typing in an input/textarea/editable
      const target = e.target as HTMLElement | null;
      if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable)) {
        return;
      }

      // Focus Current Folder Search (Ctrl+F)
      if (isCmdOrCtrl && !e.shiftKey && e.key.toLowerCase() === 'f') {
        e.preventDefault();
        const searchInput = document.getElementById('file-grid-folder-search') as HTMLInputElement | null;
        if (searchInput) {
          searchInput.focus();
          searchInput.select();
        }
        return;
      }

      // Ctrl+Z (Undo file operation)
      if (isCmdOrCtrl && e.key.toLowerCase() === 'z' && !e.shiftKey) {
        e.preventDefault();
        handleUndo();
        return;
      }

      // Ctrl+C (Copy)
      if (isCmdOrCtrl && e.key.toLowerCase() === 'c' && !e.shiftKey) {
        if (selectedFiles.size > 0) {
          e.preventDefault();
          handleCopySelected();
          return;
        }
      }

      // Ctrl+X (Cut)
      if (isCmdOrCtrl && e.key.toLowerCase() === 'x' && !e.shiftKey) {
        if (selectedFiles.size > 0) {
          e.preventDefault();
          handleCutSelected();
          return;
        }
      }

      // Ctrl+V (Paste)
      if (isCmdOrCtrl && e.key.toLowerCase() === 'v' && !e.shiftKey) {
        if (clipboard && clipboard.paths.length > 0) {
          e.preventDefault();
          handlePaste();
          return;
        }
      }

      // Shift+Delete (Permanent delete selected item)
      if (e.shiftKey && e.key === 'Delete') {
        if (selectedFiles.size > 0) {
          e.preventDefault();
          handlePermanentDelete();
          return;
        }
      }

      // Delete (Move to Recycle Bin)
      if (!e.shiftKey && e.key === 'Delete') {
        if (selectedFiles.size > 0) {
          e.preventDefault();
          const targetPath = Array.from(selectedFiles)[0];
          handleDelete(targetPath);
          return;
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedFiles, files, isUndoing, clipboard, currentPath]);

  useEffect(() => {
    const handleFileUndoEvent = () => {
      handleUndo();
    };
    const handleOpenHistoryEvent = () => {
      setHistoryModalOpen(true);
      loadOperationHistory();
    };

    window.addEventListener('codexos:file-undo', handleFileUndoEvent);
    window.addEventListener('codexos:open-history', handleOpenHistoryEvent);
    return () => {
      window.removeEventListener('codexos:file-undo', handleFileUndoEvent);
      window.removeEventListener('codexos:open-history', handleOpenHistoryEvent);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isUndoing, currentPath, isThisPC]);

  const handleDrop = async (e: React.DragEvent, targetDir: string) => {
    e.preventDefault();
    let sources: string[] = [];
    let isExternal = false;

    // 1. External Windows Explorer file drop via dataTransfer.files
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      const paths = Array.from(e.dataTransfer.files)
        .map(f => (f as unknown as { path?: string }).path)
        .filter((p): p is string => typeof p === 'string' && p.length > 0);
      if (paths.length > 0) {
        sources = paths;
        isExternal = true;
      }
    }

    // 2. JSON payload (multi-selection drag)
    if (sources.length === 0) {
      const json = e.dataTransfer.getData('application/json');
      if (json) {
        try {
          const parsed = JSON.parse(json);
          if (Array.isArray(parsed) && parsed.length > 0) {
            sources = parsed;
          }
        } catch {
          // ignore
        }
      }
    }

    // 3. Plain text payload
    if (sources.length === 0) {
      const plain = e.dataTransfer.getData('text/plain');
      if (plain) {
        sources = plain.split(/\r?\n/).map(s => s.trim()).filter(Boolean);
      }
    }

    if (sources.length === 0) return;

    // Filter out dropping onto itself
    const filtered = sources.filter(s => s !== targetDir);
    if (filtered.length === 0) return;

    const op: 'copy' | 'move' = isExternal ? 'copy' : 'move';
    await initiateTransfer(filtered, targetDir, op);
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
      permanentDeleteTarget, setPermanentDeleteTarget,
      selectedFiles, setSelectedFiles, lastSelected, setLastSelected,
      devicesExpanded, setDevicesExpanded, thisPcExpanded, setThisPcExpanded, quickAccessExpanded, setQuickAccessExpanded, sidebarCollapsed, setSidebarCollapsed,
      quickAccessItems, handleUnpinQuickAccess, handlePinToQuickAccess,
      parentRef,
      goBack, goForward, canGoBack, canGoForward, isThisPC,
      loadFiles, handleCreate, handleRename, handleDelete, confirmDeleteFile,
      handlePermanentDelete, confirmPermanentDelete,
      handleDrop, handleItemSelect,
      clipboard, setClipboard,
      handleCopySelected, handleCutSelected, handlePaste,
      activeConflictSession, resolveConflict, cancelConflict, initiateTransfer,
      handleUndo, isUndoing, historyModalOpen, setHistoryModalOpen,
      operationHistory, loadOperationHistory,
      navigateUp, segments, navigateToSegment
    }}>
      {children}
    </FileGridContext.Provider>
  );
};
