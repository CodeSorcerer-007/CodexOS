import { useEffect } from 'react';
import { useStore } from '../store/store';
import type { ShortcutItem } from '../store/store';
import type { Tab } from '../App';

const matchKeyCombo = (e: KeyboardEvent, comboStr: string): boolean => {
  const parts = comboStr.toLowerCase().split('+').map(p => p.trim());
  const needsCtrl = parts.includes('ctrl') || parts.includes('cmd');
  const needsAlt = parts.includes('alt');
  const needsShift = parts.includes('shift');
  
  const hasCtrl = e.ctrlKey || e.metaKey;
  const hasAlt = e.altKey;
  const hasShift = e.shiftKey;

  if (needsCtrl !== hasCtrl) return false;
  if (needsAlt !== hasAlt) return false;
  if (needsShift !== hasShift) return false;

  const mainKey = parts.find(p => !['ctrl', 'cmd', 'alt', 'shift'].includes(p));
  if (!mainKey) return false;

  const pressedKey = e.key.toLowerCase();
  return pressedKey === mainKey;
};

export const useKeyboardShortcuts = () => {
  const setActiveApp = useStore(s => s.setActiveApp);
  const addTab = useStore(s => s.addTab);
  const closeTab = useStore(s => s.closeTab);
  const activeTabId = useStore(s => s.activeTabId);
  const isVaultLocked = useStore(s => s.isVaultLocked);
  const customShortcuts = useStore(s => s.settings.customShortcuts || []);
  
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      // Don't trigger shortcuts if user is typing in an input/textarea
      const target = e.target as HTMLElement;
      if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable) {
        return;
      }

      if (isVaultLocked) return;

      // Check dynamic user shortcuts
      for (const sc of customShortcuts) {
        if (matchKeyCombo(e, sc.keyCombo)) {
          e.preventDefault();
          executeShortcut(sc);
          return;
        }
      }
    };

    const executeShortcut = (sc: ShortcutItem) => {
      if (sc.actionType === 'palette') {
        // Toggle command palette
        window.dispatchEvent(new KeyboardEvent('keydown', { key: 'k', ctrlKey: true, bubbles: true }));
      } else if (sc.actionType === 'new_tab') {
        addTab();
      } else if (sc.actionType === 'close_tab') {
        closeTab(activeTabId);
      } else if (sc.actionType === 'help') {
        window.dispatchEvent(new CustomEvent('codexos-show-shortcuts'));
      } else if (sc.actionType === 'nav_app' && sc.targetApp) {
        setActiveApp(sc.targetApp as Tab['activeApp']);
      }
    };
    
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [setActiveApp, addTab, closeTab, activeTabId, isVaultLocked, customShortcuts]);
};

