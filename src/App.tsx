import { useState, useEffect, Suspense, useRef, useCallback } from 'react';

import { getCurrentWindow } from '@tauri-apps/api/window';
import { listen } from '@tauri-apps/api/event';
import { invoke } from '@tauri-apps/api/core';
import { motion, AnimatePresence } from 'framer-motion';

import { ErrorBoundary } from './components/ErrorBoundary';
import { useStore, hydrateStore } from './store/store';
import { kvSet, getApiVersion, addAllowedPath } from './ipc';
import { ToastContainer } from './components/ToastContainer';
import { Sidebar } from './components/layout/Sidebar';
import { AppRouter } from './components/layout/AppRouter';
import { startMetricsPolling } from './store/metricsStore';

import { DeveloperStatusBar } from './components/layout/DeveloperStatusBar';

import { TabBar } from './components/TabBar';
import { useKeyboardShortcuts } from './hooks/useKeyboardShortcuts';
import { KeyboardHelp } from './components/KeyboardHelp';
import { OnboardingWizard } from './components/OnboardingWizard';
import { VaultUnlock } from './components/VaultUnlock';
import { CommandPalette } from './components/CommandPalette';
import { TransferCenter } from './components/TransferCenter/TransferCenter';

import { Minus, Square, Copy, X, Search, Sun, Moon, HelpCircle, FolderGit2, GitBranch } from 'lucide-react';

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
  const updateSettings = useStore(state => state.updateSettings);
  const setShowKeyboardHelp = useStore(state => state.setShowKeyboardHelp);
  const currentPath = useStore(state => state.currentPath);
  // Read addToast directly from the store for a stable reference that never
  // changes between renders, avoiding spurious effect re-runs.
  const addToast = useStore(state => state.addToast);

  // Centralized system telemetry lifecycle
  useEffect(() => {
    const stopMetrics = startMetricsPolling();
    return () => {
      stopMetrics();
    };
  }, []);

  // Single-instance and CLI folder navigation
  useEffect(() => {
    let active = true;
    let unlistenFn: (() => void) | undefined;

    listen<string[]>('open-cli-paths', (event) => {
      const paths = event.payload;
      if (!Array.isArray(paths) || paths.length === 0) return;

      const { openPathInTab, addToast } = useStore.getState();
      for (const p of paths) {
        openPathInTab(p);
      }
      addToast({
        type: 'info',
        title: 'Folder Opened',
        message: paths.length === 1 ? paths[0] : `${paths.length} folders opened in tabs`,
      });
    }).then((fn) => {
      if (active) {
        unlistenFn = fn;
      } else {
        fn();
      }
    });

    return () => {
      active = false;
      unlistenFn?.();
    };
  }, []);

  useEffect(() => {
    const root = document.documentElement;
    if (theme === 'light') {
      root.classList.remove('dark');
      root.classList.add('light', 'light-theme');
    } else {
      root.classList.remove('light', 'light-theme');
      root.classList.add('dark');
    }
  }, [theme]);

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
  }, [currentPath]);

  const handleOnboardingComplete = useCallback(() => {
    // Dual-write: localStorage for instant next-launch check,
    // SQLite KV for durability across localStorage clears.
    localStorage.setItem('codexos-onboarded', 'true');
    kvSet('codexos-onboarded', 'true').catch(() => {});
    setShowOnboarding(false);
  }, []);

  return (
    <div className={`flex h-screen w-screen bg-app-bg text-app-text font-sans overflow-hidden selection:bg-indigo-500/30 ${theme === 'light' ? 'light-theme light' : 'dark'}`}>
      
      <a href="#main-content" className="sr-only focus:not-sr-only focus:absolute focus:z-[100] focus:p-4 focus:bg-indigo-600 focus:text-white">Skip to content</a>
      {/* Modern Floating Sidebar Component */}
      <Sidebar />

      {/* Main Content Area - offset by sidebar width */}
      <main id="main-content" role="main" className="flex-1 h-full relative ml-16 bg-[radial-gradient(ellipse_at_top_right,_var(--tw-gradient-stops))] from-app-glow via-app-bg to-app-bg">
        
        {/* Native Windows Title Bar with Drag Region & Windows 11 Controls */}
        <div className="h-8 w-full absolute top-0 left-0 z-50 flex items-center justify-between select-none bg-app-surface/60 backdrop-blur-md border-b border-app-border px-1">
          {/* Draggable header strip with subtle branding and double-click to maximize */}
          <div
            data-tauri-drag-region
            onDoubleClick={handleToggleMaximize}
            className="flex-1 h-full flex items-center px-3 gap-2 cursor-default overflow-hidden"
          >
            <span className="text-[11px] font-bold text-app-text-muted tracking-wider uppercase shrink-0">CodexOS</span>
            <span className="hidden sm:inline-flex px-1.5 py-0.5 rounded text-[9px] bg-indigo-500/15 text-indigo-400 font-mono font-semibold border border-indigo-500/20 shrink-0">
              v2.3.0
            </span>
            {currentPath && (
              <span className="hidden md:flex items-center gap-1 px-2 py-0.5 rounded bg-black/10 dark:bg-white/5 border border-app-border text-[10px] text-app-text-muted font-mono truncate max-w-xs">
                <FolderGit2 className="w-3 h-3 text-indigo-400 shrink-0" />
                <span className="truncate">{currentPath.split(/[/\\]/).filter(Boolean).pop() || currentPath}</span>
              </span>
            )}
            <span className="hidden xl:flex items-center gap-1 px-1.5 py-0.5 rounded bg-black/10 dark:bg-white/5 border border-app-border text-[10px] text-emerald-400 font-mono shrink-0">
              <GitBranch className="w-2.5 h-2.5" />
              <span>MZ-branch</span>
            </span>
          </div>

          {/* Centered Command Palette Search Bar Pill */}
          <div
            onClick={() => window.dispatchEvent(new KeyboardEvent('keydown', { key: 'k', ctrlKey: true, bubbles: true }))}
            className="h-6 px-3 rounded-md bg-black/10 dark:bg-white/5 hover:bg-black/15 dark:hover:bg-white/10 border border-app-border hover:border-indigo-500/40 text-app-text-muted hover:text-app-text flex items-center justify-between gap-3 text-[11px] cursor-pointer transition-all w-56 sm:w-64 md:w-80 shrink-0 mx-2"
            title="Search commands, files, and modules (Ctrl+K)"
          >
            <div className="flex items-center gap-1.5 truncate">
              <Search className="w-3 h-3 text-app-text-muted shrink-0" />
              <span className="truncate">Search commands & tools...</span>
            </div>
            <kbd className="hidden sm:inline-flex items-center text-[9px] font-mono bg-black/20 dark:bg-white/10 px-1 rounded border border-app-border text-app-text-muted">
              Ctrl+K
            </kbd>
          </div>
          
          {/* Windows 11 Standard Window Controls + Quick Tools */}
          <div className="flex items-center h-full gap-0.5">
            <button
              onClick={() => updateSettings({ theme: theme === 'light' ? 'dark' : 'light' })}
              aria-label="Toggle theme"
              title={theme === 'light' ? 'Switch to Dark Mode' : 'Switch to Light Mode'}
              className="h-7 w-7 flex items-center justify-center hover:bg-black/5 dark:hover:bg-white/10 text-app-text-muted hover:text-app-text rounded transition-colors cursor-pointer"
            >
              {theme === 'light' ? <Moon className="w-3.5 h-3.5" /> : <Sun className="w-3.5 h-3.5" />}
            </button>
            <button
              onClick={() => setShowKeyboardHelp(true)}
              aria-label="Keyboard Shortcuts"
              title="Keyboard Shortcuts (Ctrl+?)"
              className="h-7 w-7 flex items-center justify-center hover:bg-black/5 dark:hover:bg-white/10 text-app-text-muted hover:text-app-text rounded transition-colors cursor-pointer"
            >
              <HelpCircle className="w-3.5 h-3.5" />
            </button>

            <div className="h-4 w-px bg-app-border mx-1" />

            <button
              onClick={handleMinimize}
              aria-label="Minimize window"
              title="Minimize"
              className="h-8 w-11 flex items-center justify-center hover:bg-black/5 dark:hover:bg-white/10 text-app-text-muted hover:text-app-text transition-colors cursor-pointer"
            >
              <Minus className="w-3.5 h-3.5" />
            </button>
            <button
              onClick={handleToggleMaximize}
              aria-label="Maximize window"
              title={isMaximized ? "Restore" : "Maximize"}
              className="h-8 w-11 flex items-center justify-center hover:bg-black/5 dark:hover:bg-white/10 text-app-text-muted hover:text-app-text transition-colors cursor-pointer"
            >
              {isMaximized ? <Copy className="w-3 h-3 rotate-180" /> : <Square className="w-3 h-3" />}
            </button>
            <button
              onClick={handleClose}
              aria-label="Close window"
              title="Close"
              className="h-8 w-11 flex items-center justify-center hover:bg-[#e81123] hover:text-white text-app-text-muted transition-colors cursor-pointer"
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
            className="w-full h-full absolute inset-0 pt-[68px] pb-6"
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

        <DeveloperStatusBar />
      </main>
      <KeyboardHelp />
      <VaultUnlock />
      <CommandPalette />
      <ToastContainer />
      <TransferCenter />
      {showOnboarding && (
        <OnboardingWizard onComplete={handleOnboardingComplete} />
      )}
    </div>
  );
}

export default App;
