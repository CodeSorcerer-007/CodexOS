import { useEffect } from 'react';
import { useStore } from '../store/store';
import type { Tab } from '../App';

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
        const numMap: Record<string, string> = {
          '1': 'home', '2': 'files', '3': 'git', '4': 'terminal',
          '5': 'secrets', '6': 'tunnel', '7': 'network', '8': 'docker',
          '9': 'database',
        };
        
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
