import { useState, useEffect } from 'react';
import { invoke } from '@tauri-apps/api/core';

interface ProcessMemInfo {
  pid: number;
  name: string;
  memory_bytes: number;
}

export const MemoryProfiler = () => {
  const [processes, setProcesses] = useState<ProcessMemInfo[]>([]);
  const [totalMem, setTotalMem] = useState(1);

  useEffect(() => {
    const fetchMem = async () => {
      try {
        const result = await invoke<ProcessMemInfo[]>('get_top_processes_memory');
        setProcesses(result);
        const total = result.reduce((acc, p) => acc + p.memory_bytes, 0);
        setTotalMem(total > 0 ? total : 1);
      } catch (e) {
        console.error(e);
      }
    };
    
    fetchMem();
    const interval = setInterval(fetchMem, 2000);
    return () => clearInterval(interval);
  }, []);

  const formatBytes = (bytes: number) => {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  // Generate a distinct color based on process name
  const getColor = (name: string) => {
    let hash = 0;
    for (let i = 0; i < name.length; i++) {
      hash = name.charCodeAt(i) + ((hash << 5) - hash);
    }
    const h = Math.abs(hash) % 360;
    return `hsl(${h}, 70%, 50%)`;
  };

  return (
    <div className="flex flex-col h-full w-full bg-[#0a0f18] text-white p-6 gap-4">
      <div>
        <h2 className="font-bold text-rose-400 text-xl mb-1">Live Memory Profiler</h2>
        <p className="text-sm text-gray-400">Real-time memory heat-map of running processes on your local system.</p>
      </div>

      <div className="flex-1 bg-black rounded-xl border border-white/10 overflow-hidden flex flex-wrap p-2 gap-1 content-start">
        {processes.map(p => {
          // Calculate relative size (minimum visual size for very small processes)
          const percentage = (p.memory_bytes / totalMem) * 100;
          if (percentage < 0.1) return null; // hide negligible processes

          const isLarge = percentage > 5;
          const bg = getColor(p.name);

          return (
            <div 
              key={p.pid}
              className="rounded flex flex-col justify-center items-center text-center overflow-hidden transition-all duration-300 hover:opacity-80 cursor-pointer shadow-lg"
              style={{
                width: `${Math.max(percentage, 1)}%`,
                height: `${Math.max(percentage * 2, 40)}px`,
                backgroundColor: bg,
                minWidth: '40px'
              }}
              title={`${p.name} (PID: ${p.pid}) - ${formatBytes(p.memory_bytes)}`}
            >
              {isLarge && (
                <>
                  <span className="font-bold text-white text-xs truncate w-full px-1 drop-shadow-md">{p.name}</span>
                  <span className="text-white/80 text-[10px] font-mono drop-shadow-md">{formatBytes(p.memory_bytes)}</span>
                </>
              )}
            </div>
          );
        })}
      </div>

      <div className="flex justify-between items-center text-sm font-mono text-gray-400">
        <div>Total Tracked Memory: <span className="text-white font-bold">{formatBytes(totalMem)}</span></div>
        <div>Processes: <span className="text-white font-bold">{processes.length}</span></div>
      </div>
    </div>
  );
};
