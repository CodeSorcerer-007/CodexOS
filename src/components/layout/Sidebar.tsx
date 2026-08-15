import React, { useState } from 'react';
import { motion } from 'framer-motion';
import { Settings, Pin, PinOff } from 'lucide-react';
import { useStore } from '../../store/store';
import type { Tab } from '../../types/tabs';
import { SIDEBAR_ITEMS } from '../../config/navigation';

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
      } transition-all duration-300 ease-in-out bg-black/60 backdrop-blur-xl border-r border-white/5 flex flex-col items-center hover:items-start group z-50 absolute h-full top-0 left-0 hover:shadow-2xl hover:shadow-black/50`}
    >
      {/* Logo Area */}
      <div className="h-16 w-full flex items-center justify-between px-4 mb-4 border-b border-white/5">
        <div className="flex items-center">
          <img src="/logo.png" alt="CodexOS" className="w-8 h-8 shrink-0 object-contain rounded-lg shadow-sm" />
          <motion.span
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className={`ml-3 font-black tracking-widest uppercase text-transparent bg-clip-text bg-gradient-to-r from-gray-100 to-gray-500 whitespace-nowrap ${
              pinned ? 'block' : 'hidden group-hover:block'
            }`}
          >
            CodexOS
          </motion.span>
        </div>
        <button
          onClick={() => setPinned(!pinned)}
          title={pinned ? 'Unpin sidebar' : 'Pin sidebar'}
          className={`text-gray-500 hover:text-white transition-colors ${
            pinned ? 'block' : 'hidden group-hover:block'
          }`}
        >
          {pinned ? <PinOff size={16} /> : <Pin size={16} />}
        </button>
      </div>

      {/* Scrollable Nav Items */}
      <div className="flex-1 w-full overflow-y-auto overflow-x-hidden no-scrollbar pb-6 flex flex-col gap-1 px-2 group-hover:px-4">
        {SIDEBAR_ITEMS.map((item, index) => {
          const isActive = activeApp === item.id;
          return (
            <button
              id={`sidebar-item-${index}`}
              key={item.id}
              onClick={() => setActiveApp(item.id as Tab['activeApp'])}
              onKeyDown={(e) => handleKeyDown(e, index)}
              aria-label={item.label}
              aria-current={isActive ? 'page' : undefined}
              className={`w-full flex items-center h-12 rounded-xl transition-all duration-200 shrink-0 relative focus:outline-none focus:ring-2 focus:ring-indigo-500/50 ${
                isActive
                  ? 'bg-white/10 text-white'
                  : 'text-gray-500 hover:bg-white/5 hover:text-gray-300'
              }`}
            >
              {isActive && (
                <motion.div
                  layoutId="activeTabIndicator"
                  className="absolute left-0 top-1/2 -translate-y-1/2 w-1 h-6 bg-indigo-500 rounded-r-full"
                />
              )}
              <div className="w-12 h-12 flex items-center justify-center shrink-0">
                {item.icon}
              </div>
              <span
                className={`font-medium text-sm whitespace-nowrap transition-opacity duration-200 ${
                  pinned ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'
                }`}
                title={`${item.label} (Ctrl+${index + 1})`}
              >
                {item.label}
              </span>
            </button>
          );
        })}
      </div>

      {/* Settings at Bottom */}
      <div className="mt-auto w-full p-2 group-hover:p-4 border-t border-white/5 bg-black/40">
        <button
          onClick={() => setActiveApp('settings')}
          aria-label="Settings"
          aria-current={activeApp === 'settings' ? 'page' : undefined}
          className={`w-full flex items-center h-12 rounded-xl transition-all duration-200 relative focus:outline-none focus:ring-2 focus:ring-indigo-500/50 ${
            activeApp === 'settings'
              ? 'bg-white/10 text-white'
              : 'text-gray-500 hover:bg-white/5 hover:text-gray-300'
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
