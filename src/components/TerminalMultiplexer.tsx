import { useEffect, useRef, useState } from 'react';
import { Terminal } from 'xterm';
import { FitAddon } from 'xterm-addon-fit';
import 'xterm/css/xterm.css';
import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import { v4 as uuidv4 } from 'uuid';

interface Pane {
  id: string;
}

export const TerminalMultiplexer = () => {
  const [panes, setPanes] = useState<Pane[]>([{ id: uuidv4() }]);
  const [layout, setLayout] = useState<'1x1' | '1x2' | '2x1' | '2x2'>('1x1');

  const splitVertical = () => {
    if (panes.length < 4) {
      setPanes([...panes, { id: uuidv4() }]);
      setLayout(panes.length === 1 ? '1x2' : '2x2');
    }
  };

  const splitHorizontal = () => {
    if (panes.length < 4) {
      setPanes([...panes, { id: uuidv4() }]);
      setLayout(panes.length === 1 ? '2x1' : '2x2');
    }
  };

  const closePane = (id: string) => {
    if (panes.length === 1) return;
    setPanes(panes.filter(p => p.id !== id));
    if (panes.length === 2) setLayout('1x1');
    else if (panes.length === 3) setLayout('1x2'); // fallback
    
    invoke('kill_multiplex_pty', { id }).catch(console.error);
  };

  const gridClass = {
    '1x1': 'grid-cols-1 grid-rows-1',
    '1x2': 'grid-cols-2 grid-rows-1',
    '2x1': 'grid-cols-1 grid-rows-2',
    '2x2': 'grid-cols-2 grid-rows-2',
  }[layout];

  return (
    <div className="flex flex-col h-full w-full bg-[#0a0f18] p-4 text-white">
      <div className="flex justify-between items-center mb-4">
        <h2 className="font-bold text-cyan-400">Terminal Multiplexer</h2>
        <div className="flex gap-2">
          <button onClick={splitVertical} className="px-3 py-1 bg-white/5 hover:bg-white/10 rounded border border-white/10 text-xs">Split Vertical |</button>
          <button onClick={splitHorizontal} className="px-3 py-1 bg-white/5 hover:bg-white/10 rounded border border-white/10 text-xs">Split Horizontal -</button>
        </div>
      </div>
      
      <div className={`flex-1 grid gap-2 ${gridClass}`}>
        {panes.map(pane => (
          <TerminalPane key={pane.id} id={pane.id} onClose={() => closePane(pane.id)} showClose={panes.length > 1} />
        ))}
      </div>
    </div>
  );
};

const TerminalPane = ({ id, onClose, showClose }: { id: string, onClose: () => void, showClose: boolean }) => {
  const terminalRef = useRef<HTMLDivElement>(null);
  const termRef = useRef<Terminal | null>(null);

  useEffect(() => {
    if (!terminalRef.current) return;

    const term = new Terminal({
      theme: {
        background: '#0a0f18',
        foreground: '#e2e8f0',
        cursor: '#06b6d4',
        selectionBackground: '#06b6d440',
      },
      fontFamily: "'JetBrains Mono', 'Fira Code', monospace",
      fontSize: 13,
      cursorBlink: true,
    });
    
    const fitAddon = new FitAddon();
    term.loadAddon(fitAddon);
    term.open(terminalRef.current);
    fitAddon.fit();
    termRef.current = term;

    let unlisten: (() => void) | undefined;

    const init = async () => {
      // Listen for output routed to this specific terminal ID
      const unlistener = await listen<string>(`pty-output-${id}`, (event) => {
        term.write(event.payload);
      });
      unlisten = unlistener;

      // Send input to the specific terminal ID
      term.onData((data) => {
        invoke('write_multiplex_pty', { id, data }).catch(console.error);
      });

      // Start the PTY backend for this ID
      await invoke('start_multiplex_pty', { id, command: null }).catch(console.error);
    };

    init();

    const handleResize = () => fitAddon.fit();
    window.addEventListener('resize', handleResize);

    return () => {
      window.removeEventListener('resize', handleResize);
      if (unlisten) unlisten();
      invoke('kill_multiplex_pty', { id }).catch(console.error);
      term.dispose();
    };
  }, [id]);

  return (
    <div className="relative border border-white/10 rounded overflow-hidden bg-black flex flex-col group">
      <div className="absolute top-0 right-0 z-10 opacity-0 group-hover:opacity-100 transition-opacity bg-black/80 px-2 py-1 flex items-center">
        {showClose && (
          <button onClick={onClose} className="text-red-400 hover:text-red-300 text-xs font-bold px-2 py-1">X</button>
        )}
      </div>
      <div ref={terminalRef} className="flex-1 w-full h-full p-2" />
    </div>
  );
};
