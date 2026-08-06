import { motion, AnimatePresence } from 'framer-motion';
import { useEffect, useRef } from 'react';
import { Terminal } from 'xterm';
import { FitAddon } from 'xterm-addon-fit';
import 'xterm/css/xterm.css';
import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';

import { useStore } from '../store/store';

const springPhysics = {
  type: "spring" as const,
  stiffness: 300,
  damping: 25
};

export const TerminalDrawer = ({ isOpen, onClose }: { isOpen: boolean, onClose: () => void }) => {
  const terminalRef = useRef<HTMLDivElement>(null);
  const termInstance = useRef<Terminal | null>(null);

  useEffect(() => {
    let unlisten: (() => void) | undefined;

    if (isOpen && terminalRef.current && !termInstance.current) {
      const term = new Terminal({
        theme: {
          background: 'rgba(13, 15, 18, 0.95)',
          foreground: '#A0AAB5',
          cursor: '#00E5FF',
          selectionBackground: 'rgba(0, 229, 255, 0.3)',
        },
        fontFamily: 'JetBrains Mono, monospace',
        fontSize: 14,
        cursorBlink: true,
      });
      const fitAddon = new FitAddon();
      term.loadAddon(fitAddon);
      term.open(terminalRef.current);
      fitAddon.fit();
      
      term.writeln('Vaultly Native Terminal (Powered by Rust PTY)');
      term.writeln('Connecting to shell...');
      
      termInstance.current = term;

      const setupPty = async () => {
        try {
          // Start the PTY backend process
          await invoke('start_pty');
        } catch (e: any) {
          useStore.getState().addToast({ type: 'error', title: 'PTY Connection Failed', message: String(e) });
        }
        
        try {
          // Listen for output from Rust
          unlisten = await listen<string>('pty-output', (event) => {
            term.write(event.payload);
          });
        } catch (e: any) {
          console.error("PTY listen error:", e);
        }

        // Send keystrokes to Rust
        term.onData((data) => {
          invoke('write_pty', { data }).catch(e => {
            console.error("PTY write error:", e);
          });
        });
      };

      setupPty();
    }

    return () => {
      if (unlisten) unlisten();
    };
  }, [isOpen]);

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          initial={{ y: "100%" }}
          animate={{ y: 0 }}
          exit={{ y: "100%" }}
          transition={springPhysics}
          className="absolute bottom-0 left-0 right-0 h-80 liquid-glass border-t border-white/20 z-40 flex flex-col"
        >
          <div className="h-10 bg-white/5 border-b border-white/10 flex items-center justify-between px-6 cursor-pointer" onClick={onClose}>
            <span className="font-mono text-cyan text-sm flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-green-400 animate-pulse"></span>
              Terminal (Native PTY)
            </span>
            <button className="text-gray-400 hover:text-white transition-colors">Hide [Ctrl+~]</button>
          </div>
          <div className="flex-1 p-4" ref={terminalRef} />
        </motion.div>
      )}
    </AnimatePresence>
  );
};
