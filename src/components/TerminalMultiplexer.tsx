import { useEffect, useRef, useState } from 'react';
import { Terminal } from 'xterm';
import { FitAddon } from 'xterm-addon-fit';
import 'xterm/css/xterm.css';
import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import { useDiagnosisStore, type Diagnosis } from '../store/diagnosisStore';
import { DiagnosisCard } from './DiagnosisCard';


interface Pane {
  id: string;
}

import { useStore, useToast } from '../store/store';

export const TerminalMultiplexer = () => {
  const [panes, setPanes] = useState<Pane[]>([{ id: crypto.randomUUID() }]);
  const [layout, setLayout] = useState<'1x1' | '1x2' | '2x1' | '2x2'>('1x1');
  const terminalShell = useStore(s => s.settings.terminalShell);
  const currentPath = useStore(s => s.currentPath);

  const splitVertical = () => {
    if (panes.length < 4) {
      setPanes([...panes, { id: crypto.randomUUID() }]);
      setLayout(panes.length === 1 ? '1x2' : '2x2');
    }
  };

  const splitHorizontal = () => {
    if (panes.length < 4) {
      setPanes([...panes, { id: crypto.randomUUID() }]);
      setLayout(panes.length === 1 ? '2x1' : '2x2');
    }
  };

  const closePane = (id: string) => {
    if (panes.length === 1) return;
    setPanes(panes.filter(p => p.id !== id));
    if (panes.length === 2) setLayout('1x1');
    else if (panes.length === 3) setLayout('1x2'); // fallback
    
    invoke('kill_multiplex_pty', { id }).catch(e => {
      useStore.getState().addToast({ type: 'error', title: 'Kill PTY Failed', message: String(e) });
    });
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
          <TerminalPane key={pane.id} id={pane.id} onClose={() => closePane(pane.id)} showClose={panes.length > 1} shell={terminalShell} cwd={currentPath} />
        ))}
      </div>
    </div>
  );
};

export const TerminalPane = ({ id, onClose, showClose, shell, cwd, command = null }: { id: string, onClose: () => void, showClose: boolean, shell: string, cwd: string | null, command?: string | null }) => {
  const { error: toastError } = useToast();
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
    let unlistenExit: (() => void) | undefined;

    const init = async () => {
      // Listen for output routed to this specific terminal ID
      const unlistener = await listen<string>(`pty-output-${id}`, (event) => {
        term.write(event.payload);
      });
      unlisten = unlistener;

      // Listen for PTY exit and trigger AI diagnosis on non-zero exit codes
      const unlistenerExit = await listen<number>(`pty-exit-${id}`, (event) => {
        const exitCode = event.payload;
        const triggerId = `terminal:${id}`;
        const diagnosisStore = useDiagnosisStore.getState();
        if (
          exitCode !== 0 &&
          diagnosisStore.enabled === true &&
          !diagnosisStore.dismissedIds.has(triggerId)
        ) {
          diagnosisStore.setLoading(triggerId);
          invoke<Diagnosis>('diagnose_issue', {
            trigger: { type: 'terminal_error', session_id: id, exit_code: exitCode },
            repoPath: cwd ?? null,
          })
            .then(d => useDiagnosisStore.getState().setDiagnosis(triggerId, d))
            .catch(e => useDiagnosisStore.getState().setError(triggerId, String(e)));
        }
      });
      unlistenExit = unlistenerExit;

      // Send input to the specific terminal ID
      term.onData((data) => {
        invoke('write_multiplex_pty', { id, data }).catch(e => {
          toastError('Terminal Error', e instanceof Error ? e.message : String(e));
        });
      });

      // Start the PTY backend for this ID
      try {
        await invoke('start_multiplex_pty', { id, shell, command, cwd });
      } catch (e: unknown) {
        useStore.getState().addToast({ type: 'error', title: 'Start PTY Failed', message: String(e) });
      }
    };

    init();

    const handleResize = () => fitAddon.fit();
    window.addEventListener('resize', handleResize);

    return () => {
      window.removeEventListener('resize', handleResize);
      if (unlisten) unlisten();
      if (unlistenExit) unlistenExit();
      invoke('kill_multiplex_pty', { id }).catch(e => {
        toastError('Terminal Error', e instanceof Error ? e.message : String(e));
      });
      term.dispose();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, shell]);

  return (
    <div className="relative border border-white/10 rounded overflow-hidden bg-black flex flex-col group">
      <div className="absolute top-0 right-0 z-10 opacity-0 group-hover:opacity-100 transition-opacity bg-black/80 px-2 py-1 flex items-center">
        {showClose && (
          <button onClick={onClose} className="text-red-400 hover:text-red-300 text-xs font-bold px-2 py-1">X</button>
        )}
      </div>
      <div ref={terminalRef} className="flex-1 w-full h-full p-2" />
      <DiagnosisCard triggerId={`terminal:${id}`} />
    </div>
  );
};
