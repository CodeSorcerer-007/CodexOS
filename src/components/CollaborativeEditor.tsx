import { useEffect, useRef, useState } from 'react';
import * as Y from 'yjs';
import { WebrtcProvider } from 'y-webrtc';
import Editor from '@monaco-editor/react';
import { MonacoBinding } from 'y-monaco';
import { invoke } from '@tauri-apps/api/core';
import { useToast } from '../store/store';
import type { editor } from 'monaco-editor';

export const CollaborativeEditor = ({ currentPath }: { currentPath: string | null }) => {
  const editorRef = useRef<editor.IStandaloneCodeEditor | null>(null);
  const ydocRef = useRef<Y.Doc | null>(null);
  const providerRef = useRef<WebrtcProvider | null>(null);
  const bindingRef = useRef<MonacoBinding | null>(null);
  
  const [roomId, setRoomId] = useState(() => 'codexos-' + crypto.randomUUID().slice(0, 8));
  const [roomPassword, setRoomPassword] = useState('');
  const [peers, setPeers] = useState(0);
  const [isConnected, setIsConnected] = useState(false);
  const fileContentRef = useRef('');
  
  const setFileContent = (val: string) => {
    fileContentRef.current = val;
  };
  const [language, setLanguage] = useState('typescript');
  const { error: toastError, success: toastSuccess, info: toastInfo } = useToast();

  useEffect(() => {
    if (currentPath && !currentPath.endsWith('/')) {
      invoke<string>('read_file_text', { path: currentPath })
        .then(content => {
          setFileContent(content);
          const ext = currentPath.split('.').pop() || '';
          const langMap: Record<string, string> = {
            ts: 'typescript', tsx: 'typescript', js: 'javascript',
            jsx: 'javascript', rs: 'rust', py: 'python', md: 'markdown',
            json: 'json', yaml: 'yaml', yml: 'yaml', css: 'css', html: 'html',
          };
          setLanguage(langMap[ext] || 'plaintext');
          // Join room AFTER content is loaded to avoid race condition
          joinRoom(roomId, roomPassword);
        })
        .catch(e => toastError('Failed to load file', e instanceof Error ? e.message : String(e)));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentPath]);

  const joinRoom = (id: string, pwd: string = roomPassword) => {
    if (bindingRef.current) bindingRef.current.destroy();
    if (providerRef.current) providerRef.current.destroy();
    if (ydocRef.current) ydocRef.current.destroy();

    const ydoc = new Y.Doc();
    ydocRef.current = ydoc;
    
    const ytext = ydoc.getText('monaco');
    
    if (fileContentRef.current && ytext.toString() === '') {
      ytext.insert(0, fileContentRef.current);
    }

    const webrtcOpts: Record<string, unknown> = {
      signaling: ['wss://signaling.yjs.dev', 'wss://y-webrtc-signaling-eu.herokuapp.com'],
    };
    if (pwd && pwd.trim()) {
      webrtcOpts.password = pwd.trim();
    }

    const provider = new WebrtcProvider(id, ydoc, webrtcOpts);
    providerRef.current = provider;

    provider.on('synced', (arg0: { synced: boolean }) => {
      setIsConnected(arg0.synced);
    });

    provider.awareness.on('change', () => {
      const states = provider.awareness.getStates();
      setPeers(states.size > 0 ? states.size - 1 : 0);
    });

    provider.awareness.setLocalStateField('user', {
      name: 'You',
      color: '#6366f1',
    });

    if (editorRef.current) {
      bindToEditor(ytext);
    }
    
    setIsConnected(true);
  };

  const generateNewRoom = () => {
    const newId = 'codexos-' + crypto.randomUUID().slice(0, 8);
    setRoomId(newId);
    joinRoom(newId, roomPassword);
    toastInfo('New Room Created', `Connected to private room: ${newId}`);
  };

  const copyRoomInvite = () => {
    const invite = `CodexOS Collab Room: ${roomId}${roomPassword ? ` (Password: ${roomPassword})` : ''}`;
    navigator.clipboard.writeText(invite);
    toastSuccess('Invite Copied', 'Room details copied to clipboard');
  };

  const bindToEditor = (ytext: Y.Text) => {
    if (!editorRef.current || !providerRef.current) return;
    const model = editorRef.current.getModel();
    if (!model) return;
    
    if (bindingRef.current) bindingRef.current.destroy();
    
    bindingRef.current = new MonacoBinding(
      ytext,
      model,
      new Set([editorRef.current]),
      providerRef.current.awareness,
    );
  };

  const handleEditorMount = (editor: editor.IStandaloneCodeEditor) => {
    editorRef.current = editor;
    
    if (ydocRef.current) {
      const ytext = ydocRef.current.getText('monaco');
      bindToEditor(ytext);
    }
  };

  const saveFile = async () => {
    if (!currentPath) {
      toastError('Save Failed', 'No file path set. Open a file from the File Manager first.');
      return;
    }
    if (!editorRef.current) return;
    try {
      const content = editorRef.current.getValue();
      await invoke('write_file_text', { path: currentPath, content });
      toastSuccess('File saved', currentPath);
    } catch (e) {
      toastError('Save failed', e instanceof Error ? e.message : String(e));
    }
  };

  useEffect(() => {
    // Only auto-join if no currentPath (blank editor session)
    if (!currentPath) {
      joinRoom(roomId, roomPassword);
    }
    return () => {
      bindingRef.current?.destroy();
      providerRef.current?.destroy();
      ydocRef.current?.destroy();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="flex flex-col h-full w-full bg-[#0a0f18] text-white p-6 gap-6">
      <div className="flex flex-wrap justify-between items-center border-b border-white/10 pb-4 gap-4">
        <div>
          <h2 className="font-bold text-indigo-400 text-2xl mb-1">CRDT Collaborative Editor</h2>
          <p className="text-sm text-gray-400">Encrypted Yjs + WebRTC peer-to-peer editing.</p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-2 bg-black px-3 py-1.5 rounded-md border border-white/10">
            <span className="text-xs text-gray-400">Room:</span>
            <input
              type="text"
              value={roomId}
              onChange={(e) => setRoomId(e.target.value)}
              onBlur={() => joinRoom(roomId, roomPassword)}
              onKeyDown={(e) => e.key === 'Enter' && joinRoom(roomId, roomPassword)}
              className="bg-transparent text-sm text-white focus:outline-none w-28 font-mono"
            />
          </div>

          <div className="flex items-center gap-2 bg-black px-3 py-1.5 rounded-md border border-white/10">
            <span className="text-xs text-gray-400">Password:</span>
            <input
              type="password"
              placeholder="Optional E2EE"
              value={roomPassword}
              onChange={(e) => setRoomPassword(e.target.value)}
              onBlur={() => joinRoom(roomId, roomPassword)}
              onKeyDown={(e) => e.key === 'Enter' && joinRoom(roomId, roomPassword)}
              className="bg-transparent text-sm text-white focus:outline-none w-28 font-mono"
            />
          </div>

          <button
            onClick={generateNewRoom}
            className="text-xs bg-white/10 hover:bg-white/20 text-gray-200 px-3 py-2 rounded-md transition-colors font-medium"
          >
            New Room
          </button>

          <button
            onClick={copyRoomInvite}
            className="text-xs bg-white/10 hover:bg-white/20 text-gray-200 px-3 py-2 rounded-md transition-colors font-medium"
          >
            Share
          </button>
          
          <button 
            onClick={saveFile}
            className="flex items-center gap-2 text-sm font-medium bg-indigo-600 hover:bg-indigo-700 px-4 py-2 rounded-md transition-colors"
          >
            Save to Disk
          </button>
          
          <div className="flex items-center gap-2 text-sm font-mono bg-black px-4 py-2 rounded-full border border-white/10">
            <div className={`w-2 h-2 rounded-full ${isConnected ? 'bg-green-500 animate-pulse' : 'bg-red-500'}`} />
            {peers} Peers
          </div>
        </div>
      </div>

      <div className="flex-1 bg-black rounded-xl border border-white/10 overflow-hidden flex flex-col relative">
        <div className="bg-white/5 border-b border-white/10 p-2 flex justify-between items-center text-xs font-mono text-gray-400">
          <span>{currentPath || 'Untitled'}</span>
          <div className="flex items-center gap-3">
            <span className="bg-white/10 px-2 py-0.5 rounded text-indigo-300">{language}</span>
            <span>Yjs WebRTC Active</span>
          </div>
        </div>
        
        <Editor
          height="100%"
          language={language}
          theme="vs-dark"
          onMount={handleEditorMount}
          options={{
            fontSize: 14,
            minimap: { enabled: false },
            scrollBeyondLastLine: false,
            wordWrap: 'on',
            padding: { top: 16 }
          }}
        />
      </div>
    </div>
  );
};
