import { useMemo } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';
import {
  ChevronRight24Regular,
  HardDrive24Regular,
  CheckmarkCircle24Filled,
  Folder24Filled,
  Document24Regular,
  Rename24Regular,
  Delete24Regular,
  Pin24Filled,
  ArrowUndo24Regular,
  History24Regular,
  Warning24Regular,
  Dismiss24Regular,
  ArrowClockwise24Regular,
  Cut24Regular,
  Copy24Regular,
  Clipboard24Regular
} from '@fluentui/react-icons';
import { useFileGridContext } from './FileGridContext';
import { getFileIcon, formatSize, formatGB } from './utils';
import { useDebounce } from '../../hooks/useDebounce';
import { GitContextMenu } from '../GitContextMenu';
import { useToast } from '../../store/store';
import { ConflictResolutionDialog } from './ConflictResolutionDialog';

export const FileGridMain = () => {
  const { success } = useToast();
  const {
    isThisPC, devicesExpanded, setDevicesExpanded, drives, onNavigate,
    viewMode, loading, files, search, parentRef, isCreating, setIsCreating,
    newItemName, setNewItemName, handleCreate, selectedFiles, setSelectedFiles,
    renamingPath, setRenamingPath, renameValue, setRenameValue, handleRename,
    handleDrop, handleItemSelect, contextMenu, setContextMenu, handleDelete,
    onAddToShelf, handlePinToQuickAccess, onFileDoubleClicked, onOptimizeAsset,
    gitStatus, deleteConfirmTarget, setDeleteConfirmTarget, confirmDeleteFile,
    permanentDeleteTarget, setPermanentDeleteTarget, confirmPermanentDelete, handlePermanentDelete,
    handleUndo, isUndoing, historyModalOpen, setHistoryModalOpen,
    operationHistory, loadOperationHistory,
    clipboard, handleCopySelected, handleCutSelected, handlePaste,
    activeConflictSession, resolveConflict, cancelConflict,
    currentPath, loadFiles
  } = useFileGridContext();

  const debouncedSearch = useDebounce(search, 300);
  const filteredFiles = useMemo(() => files.filter(f => f.name.toLowerCase().includes(debouncedSearch.toLowerCase())), [files, debouncedSearch]);

  const rowVirtualizer = useVirtualizer({
    count: filteredFiles.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => 36,
    overscan: 5,
  });

  return (
    <main className="flex-1 flex flex-col relative bg-[#191919] overflow-hidden">
      {isThisPC ? (
        <div className="flex-1 p-5 overflow-y-auto custom-scrollbar">
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
                      <div className="relative shrink-0 mt-0.5">
                        <HardDrive24Regular className="text-[#a0a0a0] w-9 h-9" />
                        <CheckmarkCircle24Filled className="text-[#2ed573] bg-[#202020] rounded-full absolute -bottom-1 -right-1 w-4 h-4" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="text-[13px] font-medium text-white truncate" title={label}>{label}</div>
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
                         onDragStart={(e: React.DragEvent) => {
                           const pathsToDrag = selectedFiles.has(file.path) ? Array.from(selectedFiles) : [file.path];
                           e.dataTransfer.setData('application/json', JSON.stringify(pathsToDrag));
                           e.dataTransfer.setData('text/plain', pathsToDrag.join('\n'));
                         }}
                         onDragOver={(e: React.DragEvent) => file.is_dir && e.preventDefault()}
                         onDrop={(e: React.DragEvent) => file.is_dir && handleDrop(e, file.path)}
                         onClick={(e) => handleItemSelect(e, file.path, filteredFiles)}
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
                         onDragStart={(e: React.DragEvent) => {
                           const pathsToDrag = selectedFiles.has(file.path) ? Array.from(selectedFiles) : [file.path];
                           e.dataTransfer.setData('application/json', JSON.stringify(pathsToDrag));
                           e.dataTransfer.setData('text/plain', pathsToDrag.join('\n'));
                         }}
                         onDragOver={(e: React.DragEvent) => file.is_dir && e.preventDefault()}
                         onDrop={(e: React.DragEvent) => file.is_dir && handleDrop(e, file.path)}
                         onClick={(e) => handleItemSelect(e, file.path, filteredFiles)}
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

      {/* Context Menu Modal */}
      {contextMenu && (
        <div 
          className="fixed z-50 bg-[#2c2c2c] border border-[rgba(255,255,255,0.12)] rounded-md shadow-2xl min-w-[210px] text-[13px] text-[#e0e0e0] py-1 select-none"
          style={{ top: contextMenu.y, left: contextMenu.x }}
          onClick={e => e.stopPropagation()}
        >
          {contextMenu.path ? (
            <>
              <div 
                className="px-3 py-2 hover:bg-[rgba(255,255,255,0.08)] cursor-pointer flex items-center gap-2 transition-colors"
                onClick={() => {
                  handleCutSelected([contextMenu.path]);
                  setContextMenu(null);
                }}
              >
                <Cut24Regular /> Cut (Ctrl+X)
              </div>
              <div 
                className="px-3 py-2 hover:bg-[rgba(255,255,255,0.08)] cursor-pointer flex items-center gap-2 transition-colors"
                onClick={() => {
                  handleCopySelected([contextMenu.path]);
                  setContextMenu(null);
                }}
              >
                <Copy24Regular /> Copy (Ctrl+C)
              </div>
              {(files.find(f => f.path === contextMenu.path)?.is_dir && clipboard && clipboard.paths.length > 0) && (
                <div 
                  className="px-3 py-2 hover:bg-[rgba(255,255,255,0.08)] cursor-pointer flex items-center gap-2 transition-colors text-blue-300"
                  onClick={() => {
                    handlePaste(contextMenu.path);
                    setContextMenu(null);
                  }}
                >
                  <Clipboard24Regular /> Paste into folder
                </div>
              )}
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
                <Delete24Regular /> Delete (Recycle Bin)
              </div>
              <div 
                className="px-3 py-2 hover:bg-[rgba(255,50,50,0.2)] cursor-pointer text-[#ff4d4d] flex items-center gap-2 transition-colors text-[13px]"
                onClick={() => {
                  handlePermanentDelete(contextMenu.path);
                  setContextMenu(null);
                }}
              >
                <Delete24Regular className="text-[#ff4d4d]" /> Permanently Delete (Shift+Del)
              </div>
              
              <div className="border-t border-[rgba(255,255,255,0.08)] my-0.5"></div>
              
              <div 
                className="px-3 py-2 hover:bg-[rgba(255,255,255,0.08)] cursor-pointer transition-colors flex items-center gap-2"
                onClick={() => {
                  if (onAddToShelf) onAddToShelf(contextMenu.path);
                  setContextMenu(null);
                }}
              >
                🗃️ Add to Shelf
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
                   📄 Preview
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
                  ⚡ Optimize Asset
                </div>
              )}
              
              <div 
                className="px-3 py-2 hover:bg-[rgba(255,255,255,0.08)] cursor-pointer flex items-center gap-2 transition-colors"
                onClick={() => {
                  handleUndo();
                  setContextMenu(null);
                }}
              >
                <ArrowUndo24Regular className={isUndoing ? "animate-spin text-[#0078d4]" : "text-[#60cdff]"} /> Undo Last Operation (Ctrl+Z)
              </div>
              <div 
                className="px-3 py-2 hover:bg-[rgba(255,255,255,0.08)] cursor-pointer flex items-center gap-2 transition-colors"
                onClick={() => {
                  setHistoryModalOpen(true);
                  loadOperationHistory();
                  setContextMenu(null);
                }}
              >
                <History24Regular className="text-[#ababab]" /> Operation History...
              </div>

              <div className="border-t border-[rgba(255,255,255,0.08)] my-0.5"></div>
              
              <div 
                className="px-3 py-2 hover:bg-[rgba(255,255,255,0.08)] cursor-pointer transition-colors"
                onClick={() => {
                  navigator.clipboard.writeText(contextMenu.path);
                  setContextMenu(null);
                }}
              >
                📋 Copy Absolute Path
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
            </>
          ) : (
            <>
              <div 
                className="px-3 py-2 hover:bg-[rgba(255,255,255,0.08)] cursor-pointer flex items-center gap-2 transition-colors"
                onClick={() => {
                  handleUndo();
                  setContextMenu(null);
                }}
              >
                <ArrowUndo24Regular className={isUndoing ? "animate-spin text-[#0078d4]" : "text-[#60cdff]"} /> Undo Last Operation (Ctrl+Z)
              </div>
              <div 
                className="px-3 py-2 hover:bg-[rgba(255,255,255,0.08)] cursor-pointer flex items-center gap-2 transition-colors"
                onClick={() => {
                  setHistoryModalOpen(true);
                  loadOperationHistory();
                  setContextMenu(null);
                }}
              >
                <History24Regular className="text-[#ababab]" /> Operation History...
              </div>
              <div 
                className={`px-3 py-2 flex items-center gap-2 transition-colors ${
                  clipboard && clipboard.paths.length > 0
                    ? 'hover:bg-[rgba(255,255,255,0.08)] cursor-pointer text-[#e0e0e0]'
                    : 'opacity-40 cursor-not-allowed text-[#777]'
                }`}
                onClick={() => {
                  if (clipboard && clipboard.paths.length > 0) {
                    handlePaste();
                    setContextMenu(null);
                  }
                }}
              >
                <Clipboard24Regular /> Paste (Ctrl+V)
              </div>
              <div className="border-t border-[rgba(255,255,255,0.08)] my-0.5"></div>
              <div 
                className="px-3 py-2 hover:bg-[rgba(255,255,255,0.08)] cursor-pointer flex items-center gap-2 transition-colors"
                onClick={() => {
                  loadFiles();
                  setContextMenu(null);
                }}
              >
                <ArrowClockwise24Regular /> Refresh
              </div>
              <div 
                className="px-3 py-2 hover:bg-[rgba(255,255,255,0.08)] cursor-pointer flex items-center gap-2 transition-colors"
                onClick={() => {
                  setIsCreating('folder');
                  setNewItemName('');
                  setContextMenu(null);
                }}
              >
                <Folder24Filled className="text-[#ffd32a]" /> New Folder
              </div>
              <div 
                className="px-3 py-2 hover:bg-[rgba(255,255,255,0.08)] cursor-pointer flex items-center gap-2 transition-colors"
                onClick={() => {
                  setIsCreating('file');
                  setNewItemName('');
                  setContextMenu(null);
                }}
              >
                <Document24Regular className="text-[#a4b0be]" /> New File
              </div>
              <div className="border-t border-[rgba(255,255,255,0.08)] my-0.5"></div>
              <div 
                className="px-3 py-2 hover:bg-[rgba(255,255,255,0.08)] cursor-pointer transition-colors"
                onClick={() => {
                  navigator.clipboard.writeText(currentPath);
                  setContextMenu(null);
                }}
              >
                📋 Copy Directory Path
              </div>
            </>
          )}
        </div>
      )}

      {/* Delete Confirmation Modal (Recycle Bin) */}
      {deleteConfirmTarget && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 p-4" onClick={e => e.stopPropagation()}>
          <div className="bg-[#2c2c2c] border border-[rgba(255,255,255,0.12)] rounded-lg p-6 max-w-md w-full flex flex-col gap-4 shadow-2xl">
            <h3 className="text-lg font-semibold text-[#f1f2f6]">Confirm Deletion</h3>
            <p className="text-[#ababab] text-[13px]">
              {deleteConfirmTarget.isDir 
                ? "Are you sure you want to move this folder and all its contents to the Recycle Bin?" 
                : "Are you sure you want to move this file to the Recycle Bin?"}
            </p>
            <p className="text-[12px] text-[#ff6b6b] bg-[rgba(255,100,100,0.1)] p-2 rounded break-all border border-[rgba(255,100,100,0.2)] font-mono">
              {deleteConfirmTarget.path}
            </p>
            <div className="flex justify-end gap-3 mt-2">
              <button
                type="button"
                onClick={() => setDeleteConfirmTarget(null)}
                className="px-4 py-2 bg-[rgba(255,255,255,0.08)] hover:bg-[rgba(255,255,255,0.12)] text-[#e0e0e0] rounded text-[13px] transition-colors"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => confirmDeleteFile(deleteConfirmTarget.path)}
                className="px-4 py-2 bg-[#d32f2f] hover:bg-[#c62828] text-white rounded text-[13px] transition-colors"
              >
                Move to Recycle Bin
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Permanent Delete Confirmation Modal */}
      {permanentDeleteTarget && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/75 p-4" onClick={e => e.stopPropagation()}>
          <div className="bg-[#242424] border border-[#d32f2f]/60 rounded-lg p-6 max-w-lg w-full flex flex-col gap-4 shadow-2xl animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-center gap-2 text-[#ff4d4d]">
              <Warning24Regular className="w-6 h-6 shrink-0" />
              <h3 className="text-lg font-bold">Permanently Delete?</h3>
            </div>
            <div className="text-[#e0e0e0] text-[13px] leading-relaxed">
              {permanentDeleteTarget.totalCount === 1 ? (
                <p>
                  Are you sure you want to permanently delete this {permanentDeleteTarget.hasFolders ? 'folder and all its contents' : 'file'}?
                </p>
              ) : (
                <p>
                  Are you sure you want to permanently delete these <strong>{permanentDeleteTarget.totalCount} items</strong> ({permanentDeleteTarget.fileCount} {permanentDeleteTarget.fileCount === 1 ? 'file' : 'files'}, {permanentDeleteTarget.dirCount} {permanentDeleteTarget.dirCount === 1 ? 'folder' : 'folders'})?
                </p>
              )}
            </div>

            {/* Representative Item Names Box */}
            <div className="bg-[#1e1515] border border-[#ff4d4d]/30 rounded p-3 text-[12px] space-y-1">
              <div className="text-[11px] font-semibold text-[#ff8080] uppercase tracking-wider mb-1">
                {permanentDeleteTarget.totalCount === 1 ? 'Target Path:' : 'Selected Items:'}
              </div>
              <ul className="space-y-1 font-mono text-[#ffb3b3] max-h-32 overflow-y-auto custom-scrollbar">
                {permanentDeleteTarget.representativeNames.map((name, i) => (
                  <li key={i} className="truncate flex items-center gap-1.5" title={name}>
                    <span className="text-[#ff4d4d]">•</span>
                    <span>{name}</span>
                  </li>
                ))}
              </ul>
              {permanentDeleteTarget.totalCount > permanentDeleteTarget.representativeNames.length && (
                <div className="text-[11px] text-[#ababab] pt-1 italic">
                  ...and {permanentDeleteTarget.totalCount - permanentDeleteTarget.representativeNames.length} more {permanentDeleteTarget.totalCount - permanentDeleteTarget.representativeNames.length === 1 ? 'item' : 'items'}
                </div>
              )}
            </div>

            {/* Nested Folder Warning */}
            {permanentDeleteTarget.hasFolders && (
              <div className="bg-red-950/40 border border-red-500/40 rounded p-2.5 text-[12px] text-red-200">
                ⚠️ <strong>Folder Contents Warning:</strong> Selected folders will be permanently deleted along with all nested subfolders, files, and contents.
              </div>
            )}

            <div className="bg-amber-950/40 border border-amber-500/30 rounded p-2.5 text-[12px] text-amber-200">
              ⚠️ <strong>Warning:</strong> This action permanently deletes items from disk without sending them to the Recycle Bin. It cannot be recovered or undone.
            </div>
            <div className="flex justify-end gap-3 mt-2">
              <button
                type="button"
                onClick={() => setPermanentDeleteTarget(null)}
                className="px-4 py-2 bg-[rgba(255,255,255,0.08)] hover:bg-[rgba(255,255,255,0.14)] text-[#e0e0e0] rounded text-[13px] font-medium transition-colors"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => confirmPermanentDelete()}
                className="px-4 py-2 bg-[#d32f2f] hover:bg-[#b71c1c] active:bg-[#9a0007] text-white rounded text-[13px] font-medium transition-colors shadow-lg shadow-red-900/40"
              >
                Permanently Delete
              </button>
            </div>
          </div>
        </div>
      )}

      {/* File Operation History Modal */}
      {historyModalOpen && (
        <div 
          className="fixed inset-0 z-[100] flex items-center justify-center bg-black/75 p-4" 
          onClick={() => setHistoryModalOpen(false)}
        >
          <div 
            className="bg-[#242424] border border-[rgba(255,255,255,0.15)] rounded-lg max-w-2xl w-full flex flex-col max-h-[85vh] shadow-2xl overflow-hidden"
            onClick={e => e.stopPropagation()}
          >
            {/* Header */}
            <div className="px-5 py-4 border-b border-[rgba(255,255,255,0.08)] flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <History24Regular className="text-[#60cdff] w-5 h-5" />
                <h3 className="text-base font-semibold text-white">File Operation History</h3>
              </div>
              <button 
                type="button"
                onClick={() => setHistoryModalOpen(false)}
                className="text-[#ababab] hover:text-white p-1 rounded hover:bg-[rgba(255,255,255,0.08)] transition-colors"
                title="Close"
              >
                <Dismiss24Regular className="w-5 h-5" />
              </button>
            </div>

            {/* Session Scope Notice Banner */}
            <div className="px-5 py-2.5 bg-[#1b2533] border-b border-[#0078d4]/30 text-[12px] text-[#80d8ff] flex items-center gap-2">
              <span className="font-semibold px-1.5 py-0.5 bg-[#0078d4]/30 rounded text-[10px] uppercase tracking-wider">Session Memory</span>
              <span>Operations are tracked in-memory for this session only. Closing or restarting CodexOS clears this history.</span>
            </div>

            {/* Action Bar */}
            <div className="px-5 py-2.5 bg-[#1c1c1c] border-b border-[rgba(255,255,255,0.06)] flex items-center justify-between text-[12px]">
              <div className="text-[#ababab]">
                {operationHistory.length === 0 ? "No recorded operations" : `${operationHistory.length} operation${operationHistory.length === 1 ? '' : 's'} recorded`}
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => loadOperationHistory()}
                  className="flex items-center gap-1.5 px-2.5 py-1 bg-[rgba(255,255,255,0.06)] hover:bg-[rgba(255,255,255,0.12)] text-[#e0e0e0] rounded transition-colors"
                  title="Refresh history"
                >
                  <ArrowClockwise24Regular className="w-3.5 h-3.5" />
                  <span>Refresh</span>
                </button>
                <button
                  type="button"
                  disabled={operationHistory.length === 0 || isUndoing}
                  onClick={async () => {
                    await handleUndo();
                    await loadOperationHistory();
                  }}
                  className={`flex items-center gap-1.5 px-3 py-1 rounded font-medium transition-colors ${
                    operationHistory.length === 0 || isUndoing
                      ? 'bg-[rgba(255,255,255,0.04)] text-[#666666] cursor-not-allowed'
                      : 'bg-[#0078d4] hover:bg-[#106ebe] text-white cursor-pointer'
                  }`}
                  title="Undo latest reversible operation (Ctrl+Z)"
                >
                  <ArrowUndo24Regular className={`w-3.5 h-3.5 ${isUndoing ? 'animate-spin' : ''}`} />
                  <span>{isUndoing ? 'Undoing...' : 'Undo Latest'}</span>
                </button>
              </div>
            </div>

            {/* List */}
            <div className="flex-1 overflow-y-auto p-4 space-y-2.5 custom-scrollbar min-h-[220px]">
              {operationHistory.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-12 text-center text-[#777777]">
                  <History24Regular className="w-10 h-10 mb-2 opacity-50" />
                  <p className="text-[13px] font-medium text-[#ababab]">No file operations recorded yet.</p>
                  <p className="text-[12px] mt-1 text-[#777777]">File actions like Rename, Move, Copy, and Delete will appear here.</p>
                </div>
              ) : (
                operationHistory.map((entry, index) => {
                  const isNextUndo = index === 0;
                  const timeStr = entry.timestamp 
                    ? new Date(entry.timestamp * 1000).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })
                    : 'Unknown time';

                  return (
                    <div 
                      key={`${entry.type}-${entry.timestamp}-${index}`}
                      className={`p-3 rounded-lg border transition-colors ${
                        isNextUndo 
                          ? 'bg-[#1e293b]/70 border-[#0078d4]/60 shadow-sm' 
                          : 'bg-[#282828] border-[rgba(255,255,255,0.06)] hover:border-[rgba(255,255,255,0.12)]'
                      }`}
                    >
                      <div className="flex items-center justify-between mb-2">
                        <div className="flex items-center gap-2">
                          {entry.type === 'Rename' && (
                            <span className="px-2 py-0.5 text-[11px] font-bold rounded bg-purple-500/20 text-purple-300 border border-purple-500/40">
                              RENAME
                            </span>
                          )}
                          {entry.type === 'Move' && (
                            <span className="px-2 py-0.5 text-[11px] font-bold rounded bg-blue-500/20 text-blue-300 border border-blue-500/40">
                              MOVE
                            </span>
                          )}
                          {entry.type === 'Copy' && (
                            <span className="px-2 py-0.5 text-[11px] font-bold rounded bg-teal-500/20 text-teal-300 border border-teal-500/40">
                              COPY
                            </span>
                          )}
                          {entry.type === 'DeleteTrash' && (
                            <span className="px-2 py-0.5 text-[11px] font-bold rounded bg-amber-500/20 text-amber-300 border border-amber-500/40">
                              RECYCLE BIN
                            </span>
                          )}

                          {(entry.type === 'Rename' || entry.type === 'Move') && (
                            <span className="text-[10px] text-emerald-400 bg-emerald-950/40 px-1.5 py-0.5 rounded border border-emerald-500/30">
                              Reversible
                            </span>
                          )}
                          {entry.type === 'Copy' && (
                            <span className="text-[10px] text-teal-400 bg-teal-950/40 px-1.5 py-0.5 rounded border border-teal-500/30">
                              Reversible (Fingerprint Verified)
                            </span>
                          )}
                          {entry.type === 'DeleteTrash' && (
                            <span className="text-[10px] text-amber-400 bg-amber-950/40 px-1.5 py-0.5 rounded border border-amber-500/30">
                              Manual Recovery (Recycle Bin)
                            </span>
                          )}

                          {isNextUndo && (
                            entry.type === 'DeleteTrash' ? (
                              <span className="text-[10px] font-semibold text-amber-300 bg-amber-500/20 px-2 py-0.5 rounded border border-amber-500/40 flex items-center gap-1">
                                ⚠️ Restore via Windows Recycle Bin
                              </span>
                            ) : (
                              <span className="text-[10px] font-semibold text-[#60cdff] bg-[#0078d4]/25 px-2 py-0.5 rounded border border-[#0078d4]/50 flex items-center gap-1">
                                ↵ Next Undo Target
                              </span>
                            )
                          )}
                        </div>

                        <span className="text-[11px] text-[#888888] font-mono">
                          {timeStr}
                        </span>
                      </div>

                      {/* Operation details */}
                      <div className="text-[12px] space-y-1 text-[#cccccc]">
                        {entry.type === 'Rename' && (
                          <div className="flex items-center gap-2 font-mono text-[11px]">
                            <span className="text-[#ababab] truncate max-w-[240px]" title={entry.old_path}>{entry.old_path.split(/[\\/]/).pop()}</span>
                            <span className="text-[#0078d4]">➔</span>
                            <span className="text-white font-medium truncate max-w-[240px]" title={entry.new_path}>{entry.new_path.split(/[\\/]/).pop()}</span>
                          </div>
                        )}
                        {entry.type === 'Move' && (
                          <div className="flex items-center gap-2 font-mono text-[11px]">
                            <span className="text-[#ababab] truncate max-w-[240px]" title={entry.original_source}>{entry.original_source}</span>
                            <span className="text-[#0078d4]">➔</span>
                            <span className="text-white font-medium truncate max-w-[240px]" title={entry.source}>{entry.source}</span>
                          </div>
                        )}
                        {entry.type === 'Copy' && (
                          <div className="font-mono text-[11px] space-y-0.5">
                            <div className="text-[#e0e0e0] truncate" title={entry.destination}>
                              Dest: {entry.destination}
                            </div>
                            <div className="text-[10px] text-[#888888]">
                              {entry.size_bytes !== undefined ? `${formatSize(entry.size_bytes)} • ` : ''}
                              {entry.sha256 ? `SHA-256: ${entry.sha256.substring(0, 12)}...` : 'Fingerprint verified'}
                            </div>
                          </div>
                        )}
                        {entry.type === 'DeleteTrash' && (
                          <div className="space-y-1.5 pt-0.5">
                            <div className="flex items-center justify-between gap-2">
                              <span className="font-mono text-[11px] text-[#ff8080] truncate" title={entry.path}>
                                {entry.path}
                              </span>
                              <button
                                type="button"
                                onClick={() => {
                                  if (navigator.clipboard?.writeText) {
                                    navigator.clipboard.writeText(entry.path);
                                    success('Path Copied', 'Original file path copied to clipboard.');
                                  }
                                }}
                                className="shrink-0 text-[11px] text-[#ababab] hover:text-white px-2 py-0.5 rounded bg-[rgba(255,255,255,0.06)] hover:bg-[rgba(255,255,255,0.12)] transition-colors"
                                title="Copy original path to clipboard"
                              >
                                Copy Path
                              </button>
                            </div>
                            <div className="p-2 rounded bg-amber-950/30 border border-amber-500/25 text-[11px] text-amber-200/90 leading-relaxed">
                              <strong>Manual Recovery:</strong> To restore this item, open the Windows Recycle Bin on your desktop, right-click &quot;{entry.path.split(/[\\/]/).pop() || entry.path}&quot;, and select <em>Restore</em>.
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })
              )}
            </div>

            {/* Footer */}
            <div className="px-5 py-3 border-t border-[rgba(255,255,255,0.08)] bg-[#202020] flex justify-end">
              <button
                type="button"
                onClick={() => setHistoryModalOpen(false)}
                className="px-4 py-1.5 bg-[rgba(255,255,255,0.08)] hover:bg-[rgba(255,255,255,0.14)] text-[#e0e0e0] rounded text-[13px] transition-colors"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* File Conflict Resolution Dialog */}
      {activeConflictSession && activeConflictSession.conflicts.length > 0 && (
        <ConflictResolutionDialog
          conflict={activeConflictSession.conflicts[activeConflictSession.currentIndex]}
          currentIndex={activeConflictSession.currentIndex}
          totalConflicts={activeConflictSession.conflicts.length}
          operation={activeConflictSession.operation}
          onResolve={resolveConflict}
          onCancel={cancelConflict}
        />
      )}
    </main>
  );
};
