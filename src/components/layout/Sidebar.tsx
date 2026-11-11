import React, { useState } from 'react';
import { motion } from 'framer-motion';
import { Settings, Pin, PinOff } from 'lucide-react';
import { useStore } from '../../store/store';
import type { Tab } from '../../types/tabs';
import { SIDEBAR_ITEMS, GROUP_LABELS } from '../../config/navigation';

export { SIDEBAR_ITEMS };

export const Sidebar: React.FC = () => {
  const [pinned, setPinned] = useState(false);
  const activeApp = useStore((state) => state.activeApp);
  const setActiveApp = useStore((state) => state.setActiveApp);

  const handleKeyDown = (e: React.KeyboardEvent, index: number) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      const nextBtn = document.getElementById(`sidebar-item-${index + 1}`);
      nextBtn?.focus();
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      const prevBtn = document.getElementById(`sidebar-item-${index - 1}`);
      prevBtn?.focus();
    }
  };

  return (
    <nav
      aria-label="Main navigation"
      className={`${
        pinned ? 'w-64' : 'w-16 hover:w-64'
      } transition-all duration-300 ease-in-out bg-app-surface/90 backdrop-blur-xl border-r border-app-border flex flex-col items-center hover:items-start group z-50 absolute h-full top-0 left-0 hover:shadow-2xl hover:shadow-black/20`}
    >
      {/* Logo Area */}
      <div className="h-16 w-full flex items-center justify-between px-4 mb-2 border-b border-app-border shrink-0">
        <div className="flex items-center">
          <img src="/logo.png" alt="CodexOS" className="w-8 h-8 shrink-0 object-contain rounded-lg shadow-sm" />
          <motion.span
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className={`ml-3 font-black tracking-widest uppercase text-transparent bg-clip-text bg-gradient-to-r from-gray-900 to-gray-600 dark:from-gray-100 dark:to-gray-500 whitespace-nowrap ${
              pinned ? 'block' : 'hidden group-hover:block'
            }`}
          >
            CodexOS
          </motion.span>
        </div>
        <button
          onClick={() => setPinned(!pinned)}
          title={pinned ? 'Unpin sidebar' : 'Pin sidebar'}
          className={`text-app-text-muted hover:text-app-text transition-colors cursor-pointer ${
            pinned ? 'block' : 'hidden group-hover:block'
          }`}
        >
          {pinned ? <PinOff size={16} /> : <Pin size={16} />}
        </button>
      </div>

      {/* Scrollable Nav Items */}
      <div className="flex-1 w-full overflow-y-auto overflow-x-hidden no-scrollbar pb-6 flex flex-col gap-0.5 px-2 group-hover:px-3">
        {SIDEBAR_ITEMS.map((item, index) => {
          const isActive = activeApp === item.id;
          const isGroupStart = index === 0 || SIDEBAR_ITEMS[index - 1].group !== item.group;
          const groupName = GROUP_LABELS[item.group] || item.group;

          return (
            <React.Fragment key={item.id}>
              {isGroupStart && (
                <div className="w-full mt-2 mb-1 shrink-0">
                  <div className={`px-2 py-0.5 text-[9px] font-mono font-bold uppercase tracking-wider text-app-text-muted/60 ${
                    pinned ? 'block' : 'hidden group-hover:block'
                  }`}>
                    {groupName}
                  </div>
                  {index > 0 && (
                    <div className="w-6 h-px bg-app-border/40 mx-auto group-hover:hidden my-1" />
                  )}
                </div>
              )}
              <button
                id={`sidebar-item-${index}`}
                onClick={() => setActiveApp(item.id as Tab['activeApp'])}
                onKeyDown={(e) => handleKeyDown(e, index)}
                aria-label={item.label}
                aria-current={isActive ? 'page' : undefined}
                className={`w-full flex items-center h-10 rounded-xl transition-all duration-200 shrink-0 relative focus:outline-none focus:ring-2 focus:ring-indigo-500/50 cursor-pointer ${
                  isActive
                    ? 'bg-indigo-500/15 text-indigo-500 dark:text-white font-semibold'
                    : 'text-app-text-muted hover:bg-black/5 dark:hover:bg-white/5 hover:text-app-text'
                }`}
              >
                {isActive && (
                  <motion.div
                    layoutId="activeTabIndicator"
                    className="absolute left-0 top-1/2 -translate-y-1/2 w-1 h-5 bg-indigo-500 rounded-r-full"
                  />
                )}
                <div className="w-10 h-10 flex items-center justify-center shrink-0">
                  {item.icon}
                </div>
                <span
                  className={`font-medium text-xs whitespace-nowrap transition-opacity duration-200 ${
                    pinned ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'
                  }`}
                  title={`${item.label} (Ctrl+${index + 1})`}
                >
                  {item.label}
                </span>
                {index < 9 && (
                  <kbd className={`ml-auto mr-2 text-[9px] font-mono text-app-text-muted/50 bg-black/10 dark:bg-white/5 px-1 py-0.5 rounded border border-app-border/40 ${
                    pinned ? 'block' : 'hidden group-hover:block'
                  }`}>
                    ^{index + 1}
                  </kbd>
                )}
              </button>
            </React.Fragment>
          );
        })}
      </div>

      {/* Settings at Bottom */}
      <div className="mt-auto w-full p-2 group-hover:p-4 border-t border-app-border bg-app-surface/60">
        <button
          onClick={() => setActiveApp('settings')}
          aria-label="Settings"
          aria-current={activeApp === 'settings' ? 'page' : undefined}
          className={`w-full flex items-center h-12 rounded-xl transition-all duration-200 relative focus:outline-none focus:ring-2 focus:ring-indigo-500/50 ${
            activeApp === 'settings'
              ? 'bg-indigo-500/15 text-indigo-500 dark:text-white font-semibold'
              : 'text-app-text-muted hover:bg-black/5 dark:hover:bg-white/5 hover:text-app-text'
          }`}
        >
          {activeApp === 'settings' && (
            <motion.div
              layoutId="activeTabIndicator"
              className="absolute left-0 top-1/2 -translate-y-1/2 w-1 h-6 bg-indigo-500 rounded-r-full"
            />
          )}
          <div className="w-12 h-12 flex items-center justify-center shrink-0">
            <Settings size={20} />
          </div>
          <span
            className={`font-medium text-sm whitespace-nowrap transition-opacity duration-200 ${
              pinned ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'
            }`}
          >
            Settings
          </span>
        </button>
      </div>
    </nav>
  );
};
