import { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import Peer, { DataConnection } from 'peerjs';
import { invoke } from '@tauri-apps/api/core';
import { useStore, useToast } from '../store/store';

interface P2PSyncModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentPath: string | null;
}

export const P2PSyncModal = ({ isOpen, onClose, currentPath }: P2PSyncModalProps) => {
  const [peerId, setPeerId] = useState<string>('');
  const [remoteId, setRemoteId] = useState<string>('');
  const [connection, setConnection] = useState<DataConnection | null>(null);
  const [logs, setLogs] = useState<string[]>([]);
  const [sendFileName, setSendFileName] = useState<string>('');
  const peerRef = useRef<Peer | null>(null);
  const setPeerCount = useStore(s => s.setPeerCount);
  const { success: toastSuccess, error: toastError } = useToast();

  const addLog = (msg: string) => setLogs(prev => [...prev, msg]);

  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  useEffect(() => {
    if (isOpen && !peerRef.current) {
      const peer = new Peer();
      
      peer.on('open', (id) => {
        setPeerId(id);
        addLog(`My Device ID is: ${id}`);
      });

      peer.on('connection', (conn) => {
        addLog(`Incoming connection from: ${conn.peer}`);
        setupConnection(conn);
      });

      peerRef.current = peer;
    }

    return () => {
      if (!isOpen && peerRef.current) {
        peerRef.current.destroy();
        peerRef.current = null;
        setConnection(null);
        setPeerCount(0);
        setPeerId('');
        setLogs([]);
      }
    };
  }, [isOpen]);

  const setupConnection = (conn: DataConnection) => {
    conn.on('open', () => {
      setConnection(conn);
      setPeerCount(1);
      addLog(`Secure connection established!`);
      toastSuccess('P2P Connected', `Connected to ${conn.peer}`);
    });

    conn.on('data', async (data: any) => {
      if (data.type === 'FILE_TRANSFER' && currentPath) {
        addLog(`Receiving file: ${data.name} (${Math.round(data.content.byteLength / 1024)} KB)`);
        
        // Use Tauri backend to save the file
        try {
          // data.content is an ArrayBuffer
          const bytes = Array.from(new Uint8Array(data.content));
          const separator = currentPath.includes('/') ? '/' : '\\';
          await invoke('write_file_binary_webrtc', { 
            path: `${currentPath}${separator}${data.name}`, 
            data: bytes 
          });
          addLog(`Saved successfully to: ${data.name}`);
          toastSuccess('P2P Transfer Complete', `Saved ${data.name}`);
        } catch (e: any) {
          addLog(`Failed to save: ${e}`);
          toastError('P2P Save Failed', String(e));
        }
      }
    });

    conn.on('close', () => {
      addLog('Connection closed.');
      setConnection(null);
      setPeerCount(0);
    });
  };

  const connectToPeer = () => {
    if (!peerRef.current || !remoteId) return;
    addLog(`Attempting to connect to ${remoteId}...`);
    const conn = peerRef.current.connect(remoteId);
    setupConnection(conn);
  };

  const sendFile = async () => {
    if (!connection || !currentPath) return;
    if (!sendFileName.trim()) {
      toastError('Validation Error', 'Please enter a filename to send');
      return;
    }
    
    const fileName = sendFileName.trim();

    try {
      addLog(`Reading ${fileName} from disk...`);
      const separator = currentPath.includes('/') ? '/' : '\\';
      const data = await invoke<number[]>('read_file_binary', { path: `${currentPath}${separator}${fileName}` });
      const buffer = new Uint8Array(data).buffer;
      
      addLog(`Sending ${fileName} over P2P network...`);
      connection.send({
        type: 'FILE_TRANSFER',
        name: fileName,
        content: buffer
      });
      addLog(`Transfer initiated.`);
      toastSuccess('P2P Transfer Started', `Sending ${fileName}...`);
      setSendFileName('');
    } catch (e: any) {
      addLog(`Error reading file: ${e}`);
      toastError('P2P Read Failed', String(e));
    }
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div 
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-md"
        >
          <motion.div 
            initial={{ scale: 0.9, y: 20 }}
            animate={{ scale: 1, y: 0 }}
            exit={{ scale: 0.9, y: 20 }}
            className="w-[500px] bg-panel border border-white/10 rounded-2xl p-6 shadow-2xl relative overflow-hidden"
          >
            <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-purple-500 to-pink-500 shadow-[0_0_20px_rgba(168,85,247,0.8)]" />
            
            <h2 className="text-2xl font-bold text-white mb-2 tracking-tight">P2P Encrypted Device Sync</h2>
            <p className="text-gray-400 text-sm mb-6">Connect directly to another instance of Vaultly anywhere in the world.</p>

            <div className="bg-black/50 p-4 rounded-xl border border-white/5 mb-6">
              <label className="text-xs font-bold text-gray-500 uppercase tracking-widest mb-1 block">Your Device ID</label>
              <div className="flex gap-2">
                <input 
                  type="text"
                  value={peerId}
                  readOnly
                  className="flex-1 bg-black/50 border border-white/10 rounded p-2 text-purple-400 font-mono text-sm focus:outline-none"
                />
                <button 
                  onClick={() => navigator.clipboard.writeText(peerId)}
                  className="px-3 py-2 bg-white/5 hover:bg-white/10 border border-white/10 rounded transition-colors text-sm"
                >
                  Copy
                </button>
              </div>
            </div>

            {!connection ? (
              <div className="mb-6">
                <label className="text-xs font-bold text-gray-500 uppercase tracking-widest mb-1 block">Connect to Device</label>
                <div className="flex gap-2">
                  <input 
                    type="text"
                    value={remoteId}
                    onChange={e => setRemoteId(e.target.value)}
                    placeholder="Enter peer ID..."
                    className="flex-1 bg-black/50 border border-purple-500/30 focus:border-purple-500 rounded p-2 text-white font-mono text-sm focus:outline-none transition-colors"
                  />
                  <button 
                    onClick={connectToPeer}
                    className="px-4 py-2 bg-purple-600 hover:bg-purple-500 rounded font-bold transition-colors text-sm shadow-[0_0_15px_rgba(168,85,247,0.4)]"
                  >
                    Connect
                  </button>
                </div>
              </div>
            ) : (
              <div className="mb-6 bg-green-500/10 border border-green-500/30 p-4 rounded-xl flex flex-col gap-3">
                <div className="text-green-400 font-bold text-center">Connected to Peer!</div>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={sendFileName}
                    onChange={e => setSendFileName(e.target.value)}
                    onKeyDown={e => e.key === 'Enter' && sendFile()}
                    placeholder="File name to send (e.g. secret.vaultly)..."
                    className="flex-1 bg-black/50 border border-green-500/30 focus:border-green-500 rounded p-2 text-white font-mono text-sm focus:outline-none transition-colors"
                  />
                  <button 
                    onClick={sendFile}
                    className="px-4 py-2 bg-green-600 hover:bg-green-500 text-white rounded font-bold transition-colors text-sm shadow-[0_0_15px_rgba(34,197,94,0.4)] whitespace-nowrap"
                  >
                    Send File
                  </button>
                </div>
              </div>
            )}

            <div className="h-32 bg-black/80 rounded-xl p-3 font-mono text-[10px] text-gray-400 overflow-y-auto border border-white/5 flex flex-col gap-1">
              {logs.map((log, i) => (
                <div key={i}>&gt; {log}</div>
              ))}
            </div>

            <div className="flex justify-end mt-4">
              <button 
                onClick={onClose}
                className="px-5 py-2.5 rounded-xl text-gray-400 hover:text-white transition-colors"
              >
                Close
              </button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};
