import { useState } from 'react';
import { useStore } from '../store/store';
import { X, Plus } from 'lucide-react';
import { SIDEBAR_ITEMS } from '../App';

export const TabBar = () => {
  const tabs = useStore(s => s.tabs);
  const activeTabId = useStore(s => s.activeTabId);
  const addTab = useStore(s => s.addTab);
  const closeTab = useStore(s => s.closeTab);
  const setActiveTab = useStore(s => s.setActiveTab);
  const reorderTabs = useStore(s => s.reorderTabs);
  
  const [draggedIdx, setDraggedIdx] = useState<number | null>(null);
  
  const getTabLabel = (app: string) => {
    return SIDEBAR_ITEMS.find(i => i.id === app)?.label || app;
  };
  
  return (
    <div className="flex items-center h-9 bg-black/50 border-b border-white/5 overflow-x-auto no-scrollbar px-2 gap-1 z-30 shrink-0" role="tablist" aria-label="Open tabs">
      {tabs.map((tab, index) => (
        <div
          key={tab.id}
          role="tab"
          tabIndex={0}
          aria-selected={tab.id === activeTabId}
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
          className={`flex items-center gap-2 px-3 h-7 rounded-lg text-xs cursor-pointer transition-all shrink-0 group select-none
            ${tab.id === activeTabId
              ? 'bg-white/10 text-white'
              : 'text-gray-500 hover:bg-white/5 hover:text-gray-300'
            }`}
        >
          <span>{getTabLabel(tab.activeApp)}</span>
          {tabs.length > 1 && (
            <X
              size={12}
              role="button"
              aria-label={`Close ${getTabLabel(tab.activeApp)} tab`}
              tabIndex={0}
              className="opacity-0 group-hover:opacity-100 hover:text-red-400 p-0.5 rounded-full hover:bg-white/10 transition-all"
              onClick={(e) => { e.stopPropagation(); closeTab(tab.id); }}
              onKeyDown={(e) => { if (e.key === 'Enter') { e.stopPropagation(); closeTab(tab.id); } }}
            />
          )}
        </div>
      ))}
      
      {tabs.length < 8 && (
        <button
          onClick={addTab}
          aria-label="Add new tab"
          className="w-7 h-7 flex items-center justify-center text-gray-600 hover:text-gray-400 hover:bg-white/5 rounded-lg transition-all ml-1 shrink-0"
        >
          <Plus size={14} aria-hidden="true" />
        </button>
      )}
    </div>
  );
};
