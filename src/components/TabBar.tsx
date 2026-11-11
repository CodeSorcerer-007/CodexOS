import { useState } from 'react';
import { useStore, type AppTab } from '../store/store';
import { X, Plus } from 'lucide-react';
import { SIDEBAR_ITEMS } from './layout/Sidebar';

export const TabBar = () => {
  const tabs = useStore(s => s.tabs);
  const activeTabId = useStore(s => s.activeTabId);
  const addTab = useStore(s => s.addTab);
  const closeTab = useStore(s => s.closeTab);
  const setActiveTab = useStore(s => s.setActiveTab);
  const reorderTabs = useStore(s => s.reorderTabs);
  
  const [draggedIdx, setDraggedIdx] = useState<number | null>(null);
  
  const getTabLabel = (tab: AppTab) => {
    if (tab.currentPath && tab.activeApp !== 'home' && tab.activeApp !== 'settings') {
      const segments = tab.currentPath.split(/[/\\]/);
      return segments.pop() || segments.pop() || tab.currentPath;
    }
    return SIDEBAR_ITEMS.find((i) => i.id === tab.activeApp)?.label || tab.activeApp;
  };
  
  return (
    <div className="flex items-center h-9 bg-app-surface/70 backdrop-blur-sm border-b border-app-border overflow-x-auto no-scrollbar px-2 gap-1 z-30 shrink-0" role="tablist" aria-label="Open tabs">
      {tabs.map((tab, index) => {
        const itemConfig = SIDEBAR_ITEMS.find((i) => i.id === tab.activeApp);
        const isActive = tab.id === activeTabId;
        return (
          <div
            key={tab.id}
            role="tab"
            tabIndex={0}
            aria-selected={isActive}
            draggable
            onDragStart={() => setDraggedIdx(index)}
            onDragOver={(e) => { e.preventDefault(); }}
            onDrop={() => {
              if (draggedIdx !== null && draggedIdx !== index) {
                reorderTabs(draggedIdx, index);
              }
              setDraggedIdx(null);
            }}
            onClick={() => setActiveTab(tab.id)}
            onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setActiveTab(tab.id); } }}
            className={`flex items-center gap-2 px-3 h-7.5 rounded-t-lg text-xs cursor-pointer transition-all shrink-0 group select-none relative
              ${isActive
                ? 'bg-indigo-500/15 dark:bg-white/10 text-app-text font-semibold border-b-2 border-indigo-500 shadow-xs'
                : 'text-app-text-muted hover:bg-black/5 dark:hover:bg-white/5 hover:text-app-text'
              }`}
          >
            {itemConfig && (
              <span className={`w-3.5 h-3.5 shrink-0 flex items-center justify-center ${isActive ? 'text-indigo-400' : 'text-app-text-muted/70'}`}>
                {itemConfig.icon}
              </span>
            )}
            <span className="truncate max-w-[140px]">{getTabLabel(tab)}</span>
            {tabs.length > 1 && (
              <X
                size={12}
                role="button"
                aria-label={`Close ${getTabLabel(tab)} tab`}
                tabIndex={0}
                className="opacity-0 group-hover:opacity-100 hover:text-red-400 p-0.5 rounded-full hover:bg-black/10 dark:hover:bg-white/10 transition-all shrink-0 ml-0.5"
                onClick={(e) => { e.stopPropagation(); closeTab(tab.id); }}
                onKeyDown={(e) => { if (e.key === 'Enter') { e.stopPropagation(); closeTab(tab.id); } }}
              />
            )}
          </div>
        );
      })}
      
      {tabs.length < 8 && (
        <button
          onClick={addTab}
          aria-label="Add new tab"
          title="New Tab (Ctrl+T)"
          className="w-7 h-7 flex items-center justify-center text-app-text-muted hover:text-app-text hover:bg-black/5 dark:hover:bg-white/5 rounded-lg transition-all ml-1 shrink-0 cursor-pointer"
        >
          <Plus size={14} aria-hidden="true" />
        </button>
      )}
    </div>
  );
};
