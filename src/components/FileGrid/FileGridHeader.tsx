import {
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
  Navigation24Regular,
  CheckmarkCircle24Filled,
  Grid24Regular,
  ChevronRight24Regular,
  ChevronDown24Regular,
  MoreHorizontal24Regular,
  PanelRight24Regular,
  Add24Regular,
  ArrowSort24Regular,
  Desktop24Regular,
  Document24Regular,
  Folder24Filled
} from '@fluentui/react-icons';
import { useFileGridContext } from './FileGridContext';

export const FileGridHeader = () => {
  const {
    goBack, canGoBack, goForward, canGoForward, navigateUp, isThisPC,
    loadFiles, onNavigate, segments, navigateToSegment, search, setSearch,
    showNewMenu, setShowNewMenu, showSortMenu, setShowSortMenu,
    showViewMenu, setShowViewMenu, setIsCreating, setNewItemName,
    selectedFiles, setRenamingPath, setRenameValue, handleDelete,
    viewMode, setViewMode, sidebarCollapsed, setSidebarCollapsed
  } = useFileGridContext();

  return (
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
      
      {/* Command Bar (Action Buttons) */}
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
  );
};
