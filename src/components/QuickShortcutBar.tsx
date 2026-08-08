import { useStore } from '../store/store';
import type { ShortcutItem } from '../store/store';
import { 
  Command, 
  Plus, 
  X, 
  LayoutDashboard, 
  HardDrive, 
  GitBranch, 
  TerminalSquare, 
  Settings, 
  HelpCircle,
  Zap
} from 'lucide-react';

export const QuickShortcutBar = () => {
  const customShortcuts = useStore(s => s.settings.customShortcuts || []);
  const setActiveApp = useStore(s => s.setActiveApp);
  const addTab = useStore(s => s.addTab);
  const closeTab = useStore(s => s.closeTab);
  const activeTabId = useStore(s => s.activeTabId);
  const isVaultLocked = useStore(s => s.isVaultLocked);

  const getIcon = (sc: ShortcutItem) => {
    if (sc.actionType === 'palette') return <Command size={12} className="text-[#60a5fa]" />;
    if (sc.actionType === 'new_tab') return <Plus size={12} className="text-[#34d399]" />;
    if (sc.actionType === 'close_tab') return <X size={12} className="text-[#f87171]" />;
    if (sc.actionType === 'help') return <HelpCircle size={12} className="text-[#f472b6]" />;
    
    switch (sc.targetApp) {
      case 'home': return <LayoutDashboard size={12} className="text-[#fbbf24]" />;
      case 'files': return <HardDrive size={12} className="text-[#38bdf8]" />;
      case 'git': return <GitBranch size={12} className="text-[#a78bfa]" />;
      case 'terminal': return <TerminalSquare size={12} className="text-[#4ade80]" />;
      case 'settings': return <Settings size={12} className="text-[#94a3b8]" />;
      default: return <Zap size={12} className="text-[#60a5fa]" />;
    }
  };

  const handleExecuteShortcut = (sc: ShortcutItem) => {
    if (sc.actionType === 'palette') {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'k', ctrlKey: true, bubbles: true }));
    } else if (sc.actionType === 'new_tab') {
      addTab();
    } else if (sc.actionType === 'close_tab') {
      closeTab(activeTabId);
    } else if (sc.actionType === 'help') {
      window.dispatchEvent(new CustomEvent('codexos-show-shortcuts'));
    } else if (sc.actionType === 'nav_app' && sc.targetApp) {
      setActiveApp(sc.targetApp);
    }
  };

  if (isVaultLocked) return null;

  return (
    <div className="flex items-center gap-1.5 px-2 py-1 bg-[rgba(255,255,255,0.03)] backdrop-blur-md border border-[rgba(255,255,255,0.07)] rounded-md shrink-0 overflow-x-auto no-scrollbar shadow-inner">
      <div className="text-[10px] uppercase font-semibold text-[#767676] tracking-wider px-1 shrink-0 select-none">
        Shortcuts
      </div>
      <div className="h-3 w-px bg-[rgba(255,255,255,0.1)] shrink-0" />
      {customShortcuts.map((sc) => (
        <button
          key={sc.id}
          onClick={() => handleExecuteShortcut(sc)}
          title={`Click or press ${sc.keyCombo} to ${sc.label}`}
          className="flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-medium bg-[rgba(255,255,255,0.05)] hover:bg-[rgba(255,255,255,0.12)] active:bg-[rgba(255,255,255,0.18)] border border-[rgba(255,255,255,0.08)] text-[#d0d0d0] hover:text-white transition-all cursor-pointer select-none shrink-0"
        >
          {getIcon(sc)}
          <span className="truncate max-w-[85px]">{sc.label}</span>
          <kbd className="ml-1 px-1 py-0.2 rounded bg-[rgba(0,120,212,0.18)] text-[#60a5fa] border border-[rgba(0,120,212,0.35)] font-mono text-[10px] font-bold">
            {sc.keyCombo}
          </kbd>
        </button>
      ))}
    </div>
  );
};
