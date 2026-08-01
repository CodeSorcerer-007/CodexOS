import { useState, useEffect, useRef } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import type { UnlistenFn } from '@tauri-apps/api/event';

interface LogViewerProps {
  logPath: string;
}

export const LogViewer = ({ logPath }: LogViewerProps) => {
  const [lines, setLines] = useState<string[]>([]);
  const [isPaused, setIsPaused] = useState(false);
  const [autoScroll, setAutoScroll] = useState(true);
  const [filter, setFilter] = useState('');
  
  const containerRef = useRef<HTMLDivElement>(null);
  const isPausedRef = useRef(isPaused);
  const filterRef = useRef(filter);
  
  // Keep refs in sync for event listeners
  useEffect(() => {
    isPausedRef.current = isPaused;
  }, [isPaused]);

  useEffect(() => {
    filterRef.current = filter;
  }, [filter]);

  useEffect(() => {
    let unlistenLine: UnlistenFn | null = null;
    let unlistenError: UnlistenFn | null = null;

    const setup = async () => {
      // Clear lines on load
      setLines([`[Vaultly] Native Tail streaming started for: ${logPath}`]);

      // Start tailing backend
      await invoke('start_tail_log', { path: logPath });

      // Listen for lines
      unlistenLine = await listen<string>('log-line', (event) => {
        if (isPausedRef.current) return;
        
        const line = event.payload;
        
        // Simple regex or string filter
        if (filterRef.current) {
          try {
            const regex = new RegExp(filterRef.current, 'i');
            if (!regex.test(line)) return;
          } catch (e) {
            // invalid regex, fallback to includes
            if (!line.toLowerCase().includes(filterRef.current.toLowerCase())) return;
          }
        }

        setLines(prev => {
          const newLines = [...prev, line];
          // Keep only the last 1000 lines to prevent DOM/memory bloat
          if (newLines.length > 1000) {
            return newLines.slice(newLines.length - 1000);
          }
          return newLines;
        });
      });

      // Listen for errors
      unlistenError = await listen<string>('log-error', (event) => {
        setLines(prev => [...prev, `[Vaultly Error] ${event.payload}`]);
      });
    };

    setup();

    return () => {
      if (unlistenLine) unlistenLine();
      if (unlistenError) unlistenError();
      invoke('stop_tail_log').catch(console.error);
    };
  }, [logPath]);

  // Handle Auto-Scroll
  useEffect(() => {
    if (autoScroll && containerRef.current) {
      containerRef.current.scrollTop = containerRef.current.scrollHeight;
    }
  }, [lines, autoScroll]);

  return (
    <div className="h-full flex flex-col bg-black/80 font-mono text-gray-300">
      <div className="p-3 border-b border-white/10 bg-black flex items-center justify-between shadow-xl z-10">
        <div className="flex items-center gap-3">
          <span className="text-pink-500 font-bold tracking-widest uppercase text-xs animate-pulse">
            {isPaused ? 'PAUSED' : 'LIVE STREAM'}
          </span>
          <span className="text-gray-500 text-xs truncate max-w-sm">{logPath}</span>
        </div>

        <div className="flex items-center gap-4">
          <input 
            type="text" 
            placeholder="Regex Filter..." 
            value={filter}
            onChange={e => setFilter(e.target.value)}
            className="bg-white/5 border border-white/10 rounded px-3 py-1 text-xs focus:outline-none focus:border-pink-500 text-pink-300 w-48 transition-colors"
          />
          <button 
            onClick={() => setAutoScroll(!autoScroll)}
            className={`text-xs font-bold px-3 py-1 rounded border transition-colors ${
              autoScroll ? 'bg-cyan/20 border-cyan/50 text-cyan' : 'bg-white/5 border-white/10 text-gray-500'
            }`}
          >
            Auto-Scroll
          </button>
          <button 
            onClick={() => setIsPaused(!isPaused)}
            className={`text-xs font-bold px-3 py-1 rounded border transition-colors ${
              isPaused ? 'bg-yellow-500/20 border-yellow-500/50 text-yellow-500' : 'bg-pink-500/20 border-pink-500/50 text-pink-500'
            }`}
          >
            {isPaused ? 'Resume' : 'Pause'}
          </button>
        </div>
      </div>

      <div 
        ref={containerRef}
        className="flex-1 overflow-auto p-4 text-xs whitespace-pre-wrap break-all leading-relaxed"
        onScroll={() => {
          // Detect if user scrolls up manually to disable auto-scroll
          if (!containerRef.current) return;
          const { scrollTop, scrollHeight, clientHeight } = containerRef.current;
          const isAtBottom = Math.abs(scrollHeight - clientHeight - scrollTop) < 10;
          if (!isAtBottom && autoScroll) setAutoScroll(false);
          else if (isAtBottom && !autoScroll) setAutoScroll(true);
        }}
      >
        {lines.map((line, idx) => {
          const isError = line.toLowerCase().includes('error') || line.toLowerCase().includes('exception');
          const isWarn = line.toLowerCase().includes('warn');
          
          return (
            <div 
              key={idx} 
              className={`hover:bg-white/5 px-2 py-0.5 rounded transition-colors ${
                isError ? 'text-red-400' : isWarn ? 'text-yellow-400' : 'text-gray-300'
              }`}
            >
              {line}
            </div>
          );
        })}
      </div>
    </div>
  );
};
