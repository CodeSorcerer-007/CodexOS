import { useState, useEffect } from 'react';
import { TerminalPane } from './TerminalMultiplexer';
import { Play, Square, Plus, Settings, TerminalSquare, Trash2 } from 'lucide-react';
import { useStore } from '../store/store';
import { invoke } from '@tauri-apps/api/core';

interface Process {
  id: string;
  name: string;
  command: string;
  isRunning: boolean;
}

export const ProcessManager = () => {
  const currentPath = useStore(s => s.currentPath);
  const shell = useStore(s => s.settings.terminalShell);
  const [processes, setProcesses] = useState<Process[]>([]);
  const [selectedProcessId, setSelectedProcessId] = useState<string | null>(null);

  // Load from local storage for now (should be KV store ideally, but for Phase 2 this is quick)
  useEffect(() => {
    const saved = localStorage.getItem('codexos-processes');
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        setProcesses(parsed.map((p: { id: string; name: string; command: string }) => ({ ...p, isRunning: false })));
      } catch (_e) {
        console.error('Failed to parse saved processes', _e);
      }
    }
  }, []);

  // Save changes
  useEffect(() => {
    localStorage.setItem('codexos-processes', JSON.stringify(processes.map(p => ({ id: p.id, name: p.name, command: p.command }))));
  }, [processes]);

  const handleAdd = () => {
    const id = crypto.randomUUID();
    setProcesses([...processes, { id, name: 'New Task', command: 'npm run dev', isRunning: false }]);
    setSelectedProcessId(id);
  };

  const handleDelete = (id: string) => {
    if (processes.find(p => p.id === id)?.isRunning) {
      handleStop(id);
    }
    setProcesses(processes.filter(p => p.id !== id));
    if (selectedProcessId === id) setSelectedProcessId(null);
  };

  const handleStart = (id: string) => {
    setProcesses(prev => prev.map(p => p.id === id ? { ...p, isRunning: true } : p));
  };

  const handleStop = async (id: string) => {
    try {
      await invoke('kill_multiplex_pty', { id: `proc-${id}` });
    } catch (e) {
      console.warn("Kill failed", e);
    }
    setProcesses(prev => prev.map(p => p.id === id ? { ...p, isRunning: false } : p));
  };

  const updateProcess = (id: string, updates: Partial<Process>) => {
    setProcesses(prev => prev.map(p => p.id === id ? { ...p, ...updates } : p));
  };

  const selectedProcess = processes.find(p => p.id === selectedProcessId);

  return (
    <div className="flex h-full w-full bg-[#050505] text-white">
      {/* Sidebar List */}
      <div className="w-64 border-r border-white/10 bg-[#0a0f18] flex flex-col p-4">
        <div className="flex items-center justify-between mb-4">
          <h2 className="font-bold text-cyan-400">Processes</h2>
          <button onClick={handleAdd} className="p-1 hover:bg-white/10 rounded">
            <Plus className="w-4 h-4" />
          </button>
        </div>
        <div className="flex-1 flex flex-col gap-2 overflow-y-auto no-scrollbar">
          {processes.map(p => (
            <div 
              key={p.id}
              onClick={() => setSelectedProcessId(p.id)}
              className={`flex items-center justify-between p-3 rounded-xl border cursor-pointer transition-all
                ${selectedProcessId === p.id ? 'bg-cyan-500/20 border-cyan-500/50' : 'bg-black/40 border-white/10 hover:border-white/30'}
              `}
            >
              <div className="flex items-center gap-3">
                <div className={`w-2 h-2 rounded-full ${p.isRunning ? 'bg-green-500 animate-pulse' : 'bg-gray-500'}`} />
                <span className="font-medium text-sm truncate w-32">{p.name}</span>
              </div>
            </div>
          ))}
          {processes.length === 0 && (
            <div className="text-gray-500 text-sm text-center mt-10">No processes defined. Click + to add one.</div>
          )}
        </div>
      </div>

      {/* Main Content */}
      <div className="flex-1 flex flex-col">
        {selectedProcess ? (
          <>
            <div className="p-6 border-b border-white/10 bg-[#0a0f18] shrink-0">
              <div className="flex items-start justify-between">
                <div className="flex-1 max-w-xl">
                  <input 
                    type="text" 
                    value={selectedProcess.name}
                    onChange={(e) => updateProcess(selectedProcess.id, { name: e.target.value })}
                    className="bg-transparent text-2xl font-bold text-white border-b border-transparent hover:border-white/20 focus:border-cyan-500 outline-none w-full mb-2"
                  />
                  <div className="flex items-center gap-2">
                    <span className="text-gray-500 font-mono text-xs">$</span>
                    <input 
                      type="text"
                      value={selectedProcess.command}
                      onChange={(e) => updateProcess(selectedProcess.id, { command: e.target.value })}
                      disabled={selectedProcess.isRunning}
                      className="bg-black/50 text-emerald-400 font-mono text-sm px-3 py-1.5 rounded border border-white/10 w-full outline-none focus:border-emerald-500 disabled:opacity-50"
                    />
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <button onClick={() => handleDelete(selectedProcess.id)} className="p-2 text-gray-500 hover:text-red-400 bg-white/5 hover:bg-white/10 rounded mr-4">
                    <Trash2 className="w-5 h-5" />
                  </button>

                  {!selectedProcess.isRunning ? (
                    <button 
                      onClick={() => handleStart(selectedProcess.id)}
                      className="flex items-center gap-2 px-6 py-2 bg-emerald-600 hover:bg-emerald-500 text-white font-bold rounded shadow-[0_0_15px_rgba(52,211,153,0.3)] transition-all"
                    >
                      <Play className="w-4 h-4 fill-current" /> Start
                    </button>
                  ) : (
                    <button 
                      onClick={() => handleStop(selectedProcess.id)}
                      className="flex items-center gap-2 px-6 py-2 bg-red-600 hover:bg-red-500 text-white font-bold rounded shadow-[0_0_15px_rgba(239,68,68,0.3)] transition-all"
                    >
                      <Square className="w-4 h-4 fill-current" /> Stop
                    </button>
                  )}
                </div>
              </div>
            </div>

            <div className="flex-1 bg-black p-4 relative">
              <div className="absolute top-0 right-0 p-2 text-xs text-gray-600 font-mono">ID: {selectedProcess.id}</div>
              {selectedProcess.isRunning ? (
                // Use a unique ID based on the process ID
                // We add a key to force re-render when it starts
                <TerminalPane 
                  key={`term-${selectedProcess.id}-${Date.now()}`} 
                  id={`proc-${selectedProcess.id}`} 
                  onClose={() => {}} 
                  showClose={false} 
                  shell={shell} 
                  cwd={currentPath}
                  command={selectedProcess.command} 
                />
              ) : (
                <div className="flex flex-col items-center justify-center h-full text-gray-600">
                  <TerminalSquare className="w-16 h-16 mb-4 opacity-20" />
                  <p>Process is stopped</p>
                </div>
              )}
            </div>
          </>
        ) : (
          <div className="flex flex-col items-center justify-center h-full text-gray-600 bg-[#0a0f18]">
            <Settings className="w-16 h-16 mb-4 opacity-20" />
            <p>Select a process to configure</p>
          </div>
        )}
      </div>
    </div>
  );
};
