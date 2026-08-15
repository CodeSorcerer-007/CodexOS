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
  Pin24Filled
} from '@fluentui/react-icons';
import { useFileGridContext } from './FileGridContext';
import { getFileIcon, formatSize, formatGB } from './utils';
import { useDebounce } from '../../hooks/useDebounce';
import { GitContextMenu } from '../GitContextMenu';

export const FileGridMain = () => {
  const {
    isThisPC, devicesExpanded, setDevicesExpanded, drives, onNavigate,
    viewMode, loading, files, search, parentRef, isCreating, setIsCreating,
    newItemName, setNewItemName, handleCreate, selectedFiles, setSelectedFiles,
    renamingPath, setRenamingPath, renameValue, setRenameValue, handleRename,
    handleDrop, handleItemSelect, contextMenu, setContextMenu, handleDelete,
    onAddToShelf, handlePinToQuickAccess, onFileDoubleClicked, onOptimizeAsset,
    gitStatus, deleteConfirmTarget, setDeleteConfirmTarget, confirmDeleteFile,
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
                         onDragStart={(e: React.DragEvent) => e.dataTransfer.setData('text/plain', file.path)}
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
                         onDragStart={(e: React.DragEvent) => e.dataTransfer.setData('text/plain', file.path)}
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
            ðŸ—ƒï¸  Add to Shelf
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
    </main>
  );
};
