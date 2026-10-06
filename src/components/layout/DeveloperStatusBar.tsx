import React, { useState, useEffect } from 'react';
import {
  GitBranch, CheckCircle2, Terminal, Cpu, Layers,
  Radio, Keyboard, Code2, AlertCircle, AlertTriangle
} from 'lucide-react';
import { useStore } from '../../store/store';
import { invoke } from '@tauri-apps/api/core';

interface SysStats {
  cpu_usage: number;
  mem_total: number;
  mem_used: number;
}

export const DeveloperStatusBar: React.FC = () => {
  const activeApp = useStore((s) => s.activeApp);
  const setActiveApp = useStore((s) => s.setActiveApp);
  const currentPath = useStore((s) => s.currentPath);
  const setShowKeyboardHelp = useStore((s) => s.setShowKeyboardHelp);
  const [cpuUsage, setCpuUsage] = useState<number | null>(null);
  const [memPercent, setMemPercent] = useState<number | null>(null);

  useEffect(() => {
    let isMounted = true;
    const fetchTelemetry = async () => {
      try {
        const stats = await invoke<SysStats>('get_sys_stats');
        if (isMounted && stats) {
          if (!isNaN(stats.cpu_usage)) {
            setCpuUsage(stats.cpu_usage);
          }
          if (stats.mem_total > 0 && stats.mem_used >= 0) {
            setMemPercent(Math.round((stats.mem_used / stats.mem_total) * 100));
          }
        }
      } catch {
        // Fallback for mocked or offline backend
      }
    };

    fetchTelemetry();
    const interval = setInterval(fetchTelemetry, 3000);
    return () => {
      isMounted = false;
      clearInterval(interval);
    };
  }, []);

  const workspaceName = currentPath
    ? currentPath.split(/[/\\]/).filter(Boolean).pop() || currentPath
    : 'CodexOS-Workspace';

  return (
    <footer
      aria-label="Developer status bar"
      className="h-6 w-full absolute bottom-0 left-0 z-40 bg-app-surface/90 backdrop-blur-md border-t border-app-border flex items-center justify-between px-3 text-[11px] font-mono text-app-text-muted select-none"
    >
      {/* Left side: Git, Sync, Diagnostics, Port, Terminal trigger */}
      <div className="flex items-center gap-3">
        <button
          onClick={() => setActiveApp('git')}
          className="flex items-center gap-1.5 hover:text-indigo-400 transition-colors cursor-pointer px-1 py-0.5 rounded hover:bg-black/5 dark:hover:bg-white/5"
          title="Open Git Client"
        >
          <GitBranch className="w-3 h-3 text-indigo-400" />
          <span className="font-semibold text-app-text">MZ-branch</span>
        </button>

        <span className="hidden sm:flex items-center gap-1 text-emerald-400" title="All local changes synced">
          <CheckCircle2 className="w-3 h-3 text-emerald-400" />
          <span>Synced</span>
        </span>

        <div className="hidden md:flex items-center gap-2 border-l border-app-border pl-2" title="Diagnostics Status">
          <span className="flex items-center gap-0.5 text-emerald-400">
            <AlertCircle className="w-3 h-3" />
            <span>0</span>
          </span>
          <span className="flex items-center gap-0.5 text-amber-400">
            <AlertTriangle className="w-3 h-3" />
            <span>0</span>
          </span>
        </div>

        <button
          onClick={() => setActiveApp('ssh')}
          className="hidden lg:flex items-center gap-1 text-cyan-400 hover:text-cyan-300 transition-colors cursor-pointer border-l border-app-border pl-2"
          title="Active Development Servers & Ports"
        >
          <Radio className="w-3 h-3 text-cyan-400 animate-pulse" />
          <span>Port 1420</span>
        </button>

        <button
          onClick={() => setActiveApp('terminal')}
          className="flex items-center gap-1 hover:text-app-text px-1.5 py-0.5 rounded hover:bg-black/5 dark:hover:bg-white/5 transition-colors cursor-pointer border-l border-app-border pl-2"
          title="Toggle Terminal Multiplexer (Ctrl+`)"
        >
          <Terminal className="w-3 h-3 text-indigo-400" />
          <span className="hidden sm:inline">Terminal</span>
          <kbd className="text-[9px] bg-black/20 dark:bg-white/10 px-1 rounded text-app-text-muted">Ctrl+`</kbd>
        </button>
      </div>

      {/* Center: Active breadcrumb */}
      <div className="hidden md:flex items-center gap-1 text-app-text-muted truncate max-w-xs lg:max-w-md">
        <Code2 className="w-3 h-3 text-indigo-400 shrink-0" />
        <span className="truncate">{workspaceName}</span>
        <span className="text-app-text-muted/50">›</span>
        <span className="text-app-text font-medium capitalize truncate">{activeApp}</span>
      </div>

      {/* Right side: Telemetry, Platform, Encoding, Help */}
      <div className="flex items-center gap-3">
        {(cpuUsage !== null || memPercent !== null) && (
          <div className="hidden sm:flex items-center gap-2" title="System Telemetry">
            {cpuUsage !== null && (
              <span className="flex items-center gap-1">
                <Cpu className="w-3 h-3 text-blue-400" />
                <span>{cpuUsage.toFixed(0)}%</span>
              </span>
            )}
            {memPercent !== null && (
              <span className="flex items-center gap-1">
                <span className="text-app-text-muted/60">RAM:</span>
                <span>{memPercent}%</span>
              </span>
            )}
          </div>
        )}

        <div className="hidden lg:flex items-center gap-1.5 border-l border-app-border pl-2" title="Runtime Engine">
          <Layers className="w-3 h-3 text-sky-400" />
          <span>Tauri 2 • Rust 1.85</span>
        </div>

        <span className="hidden sm:inline text-app-text-muted/80">UTF-8</span>

        <button
          onClick={() => setShowKeyboardHelp(true)}
          className="flex items-center gap-1 hover:text-app-text transition-colors cursor-pointer border-l border-app-border pl-2"
          title="Open Keyboard Shortcuts (Ctrl+?)"
        >
          <Keyboard className="w-3 h-3 text-indigo-400" />
          <span className="hidden xl:inline">Shortcuts</span>
        </button>
      </div>
    </footer>
  );
};
