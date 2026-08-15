import { useEffect } from 'react';
import { useStore } from '../store/store';
import type { Tab } from '../types/tabs';
import { SIDEBAR_ITEMS } from '../components/layout/Sidebar';

export const useKeyboardShortcuts = () => {
  const setActiveApp = useStore(s => s.setActiveApp);
  const addTab = useStore(s => s.addTab);
  const closeTab = useStore(s => s.closeTab);
  const activeTabId = useStore(s => s.activeTabId);
  const isVaultLocked = useStore(s => s.isVaultLocked);
  
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      // Don't trigger shortcuts if user is typing in an input/textarea
      const target = e.target as HTMLElement;
      if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable) {
        return;
      }

      const ctrl = e.ctrlKey || e.metaKey;
      const shift = e.shiftKey;
      
      // Global navigation shortcuts (Ctrl+Number)
      if (ctrl && !shift) {
        const numMap: Record<string, string> = {};
        SIDEBAR_ITEMS.slice(0, 9).forEach((item, index) => {
          numMap[String(index + 1)] = item.id;
        });
        
        if (numMap[e.key] && !isVaultLocked) {
          e.preventDefault();
          setActiveApp(numMap[e.key] as Tab['activeApp']);
        }
        
        // Tab management
        if (e.key === 't' && !isVaultLocked) { 
          e.preventDefault(); 
          addTab(); 
        }
        if (e.key === 'w' && !isVaultLocked) { 
          e.preventDefault(); 
          closeTab(activeTabId); 
        }
        
        // Jump to settings
        if (e.key === ',' && !isVaultLocked) { 
          e.preventDefault(); 
          setActiveApp('settings'); 
        }
      }
      
      // Ctrl+Shift shortcuts
      if (ctrl && shift) {
        if (e.key.toLowerCase() === 'p' && !isVaultLocked) { 
          e.preventDefault(); 
          setActiveApp('files'); 
        }
        
        if (e.key === '?' && !isVaultLocked) {
          e.preventDefault();
          // We can dispatch a custom event to show the modal
          window.dispatchEvent(new CustomEvent('codexos-show-shortcuts'));
        }
      }
    };
    
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [setActiveApp, addTab, closeTab, activeTabId, isVaultLocked]);
};
