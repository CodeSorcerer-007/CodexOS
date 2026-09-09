import { useState, useEffect, Suspense, useRef, useCallback } from 'react';

import { getCurrentWindow } from '@tauri-apps/api/window';
import { invoke } from '@tauri-apps/api/core';
import { motion, AnimatePresence } from 'framer-motion';

import { ErrorBoundary } from './components/ErrorBoundary';
import { useStore, hydrateStore } from './store/store';
import { kvSet } from './ipc';
import { ToastContainer } from './components/ToastContainer';
import { Sidebar } from './components/layout/Sidebar';
import { AppRouter } from './components/layout/AppRouter';

import { TabBar } from './components/TabBar';
import { useKeyboardShortcuts } from './hooks/useKeyboardShortcuts';
import { KeyboardHelp } from './components/KeyboardHelp';
import { OnboardingWizard } from './components/OnboardingWizard';
import { VaultUnlock } from './components/VaultUnlock';
import { CommandPalette } from './components/CommandPalette';



import { Minus, Square, Copy, X } from 'lucide-react';

function App() {
  const appWindow = useRef(getCurrentWindow()).current;
  const [isMaximized, setIsMaximized] = useState(false);
  const [showOnboarding, setShowOnboarding] = useState(
    localStorage.getItem('codexos-onboarded') !== 'true'
  );

  useEffect(() => {
    let unlisten: (() => void) | undefined;
    appWindow.isMaximized().then(setIsMaximized).catch(() => {});
    appWindow.onResized(() => {
      appWindow.isMaximized().then(setIsMaximized).catch(() => {});
    }).then(u => { unlisten = u; }).catch(() => {});
    return () => {
      unlisten?.();
    };
  }, [appWindow]);

  useKeyboardShortcuts();

  const activeApp = useStore(state => state.activeApp);
  const theme = useStore(state => state.settings.theme);
  const currentPath = useStore(state => state.currentPath);
  // Read addToast directly from the store for a stable reference that never
  // changes between renders, avoiding spurious effect re-runs.
  const addToast = useStore(state => state.addToast);

  const handleMinimize = async (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    try {
      await invoke('window_minimize');
    } catch {
      await appWindow.minimize().catch(() => {});
    }
  };

  const handleToggleMaximize = async (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    try {
      await invoke('window_toggle_maximize');
    } catch {
      await appWindow.toggleMaximize().catch(() => {});
    }
  };

  const handleClose = async (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    try {
      await invoke('window_close');
    } catch {
      await appWindow.close().catch(() => {});
    }
  };

  const onHydrationError = useCallback((err: unknown) => {
    console.warn('[CodexOS] SQLite hydration warning:', err);
    addToast({
      type: 'warning',
      title: 'State Recovery',
      message: 'Could not load saved workspace state; using defaults.',
      duration: 5000,
    });
  }, [addToast]);

  useEffect(() => {
    // Hydrate store from SQLite backend. Dependency on `onHydrationError` is
    // stable (addToast is a Zustand action — same reference across renders).
    hydrateStore().catch(onHydrationError);
  }, [onHydrationError]);

  useEffect(() => {
    // Verify API version compatibility and register allowed path
    import('./ipc').then(({ getApiVersion, addAllowedPath }) => {
      getApiVersion()
        .then((version) => {
          if (!version.startsWith('2.')) {
            console.warn(`[CodexOS] Backend version mismatch: expected 2.x, got ${version}`);
          }
        })
        .catch(() => {});

      if (currentPath) {
        addAllowedPath(currentPath).catch(() => {});
      }
    });
  }, [currentPath]);

  const handleOnboardingComplete = useCallback(() => {
    // Dual-write: localStorage for instant next-launch check,
    // SQLite KV for durability across localStorage clears.
    localStorage.setItem('codexos-onboarded', 'true');
    kvSet('codexos-onboarded', 'true').catch(() => {});
    setShowOnboarding(false);
  }, []);

  return (
    <div className={`flex h-screen w-screen bg-app-bg text-white font-sans overflow-hidden selection:bg-indigo-500/30 ${theme === 'light' ? 'light-theme' : ''}`}>
      
      <a href="#main-content" className="sr-only focus:not-sr-only focus:absolute focus:z-[100] focus:p-4 focus:bg-indigo-600 focus:text-white">Skip to content</a>
      {/* Modern Floating Sidebar Component */}
      <Sidebar />

      {/* Main Content Area - offset by sidebar width */}
      <main id="main-content" role="main" className="flex-1 h-full relative ml-16 bg-[radial-gradient(ellipse_at_top_right,_var(--tw-gradient-stops))] from-app-glow via-app-bg to-app-bg">
        
        {/* Native Windows Title Bar with Drag Region & Windows 11 Controls */}
        <div className="h-8 w-full absolute top-0 left-0 z-50 flex items-center justify-between select-none bg-black/30 border-b border-white/5">
          {/* Draggable header strip with subtle branding and double-click to maximize */}
          <div
            data-tauri-drag-region
            onDoubleClick={handleToggleMaximize}
            className="flex-1 h-full flex items-center px-4 gap-2 cursor-default"
          >
            <span className="text-[11px] font-bold text-gray-500 tracking-wider uppercase">CodexOS</span>
            {currentPath && (
              <span className="text-[11px] text-gray-600 font-mono truncate max-w-md">
                — {currentPath}
              </span>
            )}
          </div>
          
          {/* Windows 11 Standard Window Controls (Minimize, Maximize/Restore, Close) */}
          <div className="flex items-center h-full">
            <button
              onClick={handleMinimize}
              aria-label="Minimize window"
              title="Minimize"
              className="h-8 w-11 flex items-center justify-center hover:bg-white/10 text-gray-400 hover:text-white transition-colors cursor-pointer"
            >
              <Minus className="w-3.5 h-3.5" />
            </button>
            <button
              onClick={handleToggleMaximize}
              aria-label="Maximize window"
              title={isMaximized ? "Restore" : "Maximize"}
              className="h-8 w-11 flex items-center justify-center hover:bg-white/10 text-gray-400 hover:text-white transition-colors cursor-pointer"
            >
              {isMaximized ? <Copy className="w-3 h-3 rotate-180" /> : <Square className="w-3 h-3" />}
            </button>
            <button
              onClick={handleClose}
              aria-label="Close window"
              title="Close"
              className="h-8 w-11 flex items-center justify-center hover:bg-[#e81123] hover:text-white text-gray-400 transition-colors cursor-pointer"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>

        <div className="absolute top-8 left-0 w-full z-30">
          <TabBar />
        </div>

        <AnimatePresence mode="wait">
          <motion.div
            key={activeApp}
            initial={{ opacity: 0, y: 10, scale: 0.99 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -10, scale: 0.99 }}
            transition={{ duration: 0.2, ease: "easeInOut" }}
            className="w-full h-full absolute inset-0 pt-[68px]"
          >
            <ErrorBoundary>
              <Suspense fallback={
                <div className="w-full h-full flex flex-col items-center justify-center">
                  <div className="w-8 h-8 border-4 border-indigo-500 border-t-transparent rounded-full animate-spin"></div>
                  <div className="mt-4 text-indigo-400 font-mono text-xs uppercase tracking-widest animate-pulse">Loading Module...</div>
                </div>
              }>
                <AppRouter />
              </Suspense>
            </ErrorBoundary>
          </motion.div>
        </AnimatePresence>
      </main>
      <KeyboardHelp />
      <VaultUnlock />
      <CommandPalette />
      <ToastContainer />
      {showOnboarding && (
        <OnboardingWizard onComplete={handleOnboardingComplete} />
      )}
    </div>
  );
}

export default App;
