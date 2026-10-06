import { useEffect, useRef, useState } from 'react';
import * as Y from 'yjs';
import { WebrtcProvider } from 'y-webrtc';
import Editor from '@monaco-editor/react';
import { MonacoBinding } from 'y-monaco';
import { invoke } from '@tauri-apps/api/core';
import { useStore, useToast } from '../store/store';
import { Globe, Shield, Save, X } from 'lucide-react';
import type { editor } from 'monaco-editor';

export interface WebRtcTraversalConfig {
  stunUrls: string[];
  turnUrl?: string;
  turnUsername?: string;
  turnCredential?: string;
}

const DEFAULT_TRAVERSAL: WebRtcTraversalConfig = {
  stunUrls: ['stun:stun.l.google.com:19302', 'stun:global.stun.twilio.com:3478'],
  turnUrl: '',
  turnUsername: '',
  turnCredential: '',
};

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
  const theme = useStore((s) => s.settings.theme);
  const { error: toastError, success: toastSuccess, info: toastInfo } = useToast();

  // WebRTC STUN/TURN Traversal Settings
  const [traversalConfig, setTraversalConfig] = useState<WebRtcTraversalConfig>(() => {
    try {
      const saved = localStorage.getItem('codexos_webrtc_traversal');
      return saved ? JSON.parse(saved) : DEFAULT_TRAVERSAL;
    } catch {
      return DEFAULT_TRAVERSAL;
    }
  });
  const [showTraversalModal, setShowTraversalModal] = useState(false);
  const [tempStun, setTempStun] = useState(() => traversalConfig.stunUrls.join('\n'));
  const [tempTurnUrl, setTempTurnUrl] = useState(() => traversalConfig.turnUrl || '');
  const [tempTurnUser, setTempTurnUser] = useState(() => traversalConfig.turnUsername || '');
  const [tempTurnCred, setTempTurnCred] = useState(() => traversalConfig.turnCredential || '');

  useEffect(() => {
    if (currentPath && !currentPath.endsWith('/')) {
      invoke<string>('read_file_text', { path: currentPath })
        .then((content) => {
          setFileContent(content);
          const ext = currentPath.split('.').pop() || '';
          const langMap: Record<string, string> = {
            ts: 'typescript',
            tsx: 'typescript',
            js: 'javascript',
            jsx: 'javascript',
            rs: 'rust',
            py: 'python',
            md: 'markdown',
            json: 'json',
            yaml: 'yaml',
            yml: 'yaml',
            css: 'css',
            html: 'html',
          };
          setLanguage(langMap[ext] || 'plaintext');
          // Join room AFTER content is loaded to avoid race condition
          joinRoom(roomId, roomPassword);
        })
        .catch((e) => toastError('Failed to load file', e instanceof Error ? e.message : String(e)));
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

    const iceServers: RTCIceServer[] = [
      { urls: traversalConfig.stunUrls.filter(Boolean) },
    ];
    if (traversalConfig.turnUrl && traversalConfig.turnUrl.trim()) {
      iceServers.push({
        urls: traversalConfig.turnUrl.trim(),
        username: traversalConfig.turnUsername?.trim() || undefined,
        credential: traversalConfig.turnCredential?.trim() || undefined,
      });
    }

    const webrtcOpts: Record<string, unknown> = {
      signaling: ['wss://signaling.yjs.dev', 'wss://y-webrtc-signaling-eu.herokuapp.com'],
      peerOpts: {
        config: {
          iceServers,
        },
      },
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
    
    toastInfo('Room Loaded', `Connected to room ${id}`);
  };

  const bindToEditor = (ytext: Y.Text) => {
    if (!editorRef.current || !providerRef.current) return;
    
    const model = editorRef.current.getModel();
    if (!model) return;

    bindingRef.current = new MonacoBinding(
      ytext,
      model,
      new Set([editorRef.current]),
      providerRef.current.awareness
    );
  };

  const handleEditorMount = (editorInstance: editor.IStandaloneCodeEditor) => {
    editorRef.current = editorInstance;
    if (ydocRef.current) {
      const ytext = ydocRef.current.getText('monaco');
      bindToEditor(ytext);
    }
  };

  const saveFile = async () => {
    if (!currentPath) {
      toastError('Save Error', 'No local file is bound to this collaborative session.');
      return;
    }
    
    try {
      const content = editorRef.current?.getValue() || '';
      await invoke('write_file_text', { path: currentPath, content });
      toastSuccess('Saved', 'File written to disk successfully.');
    } catch (e) {
      toastError('Failed to save file', e instanceof Error ? e.message : String(e));
    }
  };

  const copyRoomInvite = () => {
    const invitePayload = JSON.stringify({
      room: roomId,
      hasPassword: !!roomPassword.trim(),
    });
    navigator.clipboard.writeText(invitePayload);
    toastSuccess('Invite Copied', 'Share this room configuration with your peer.');
  };

  const generateNewRoom = () => {
    const newId = 'codexos-' + crypto.randomUUID().slice(0, 8);
    setRoomId(newId);
    joinRoom(newId, roomPassword);
  };

  const handleSaveTraversal = () => {
    const urls = tempStun.split('\n').map((s) => s.trim()).filter(Boolean);
    const updated: WebRtcTraversalConfig = {
      stunUrls: urls.length > 0 ? urls : DEFAULT_TRAVERSAL.stunUrls,
      turnUrl: tempTurnUrl.trim(),
      turnUsername: tempTurnUser.trim(),
      turnCredential: tempTurnCred.trim(),
    };
    setTraversalConfig(updated);
    try {
      localStorage.setItem('codexos_webrtc_traversal', JSON.stringify(updated));
    } catch {}
    setShowTraversalModal(false);
    toastSuccess('Traversal Updated', 'WebRTC ICE servers saved. Reconnecting room...');
    joinRoom(roomId, roomPassword);
  };

  useEffect(() => {
    joinRoom(roomId, roomPassword);
    return () => {
      if (bindingRef.current) bindingRef.current.destroy();
      if (providerRef.current) providerRef.current.destroy();
      if (ydocRef.current) ydocRef.current.destroy();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="flex flex-col h-full w-full bg-app-bg text-app-text p-6 gap-6">
      <div className="flex flex-wrap justify-between items-center border-b border-app-border pb-4 gap-4">
        <div>
          <h2 className="font-bold text-indigo-400 text-2xl mb-1">CRDT Collaborative Editor</h2>
          <p className="text-sm text-app-text-muted">Encrypted Yjs + WebRTC peer-to-peer editing.</p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-2 bg-app-surface px-3 py-1.5 rounded-md border border-app-border">
            <span className="text-xs text-app-text-muted">Room:</span>
            <input
              type="text"
              value={roomId}
              onChange={(e) => setRoomId(e.target.value)}
              onBlur={() => joinRoom(roomId, roomPassword)}
              onKeyDown={(e) => e.key === 'Enter' && joinRoom(roomId, roomPassword)}
              className="bg-transparent text-sm text-app-text focus:outline-none w-28 font-mono"
            />
          </div>

          <div className="flex items-center gap-2 bg-app-surface px-3 py-1.5 rounded-md border border-app-border">
            <span className="text-xs text-app-text-muted">Password:</span>
            <input
              type="password"
              placeholder="Optional E2EE"
              value={roomPassword}
              onChange={(e) => setRoomPassword(e.target.value)}
              onBlur={() => joinRoom(roomId, roomPassword)}
              onKeyDown={(e) => e.key === 'Enter' && joinRoom(roomId, roomPassword)}
              className="bg-transparent text-sm text-app-text focus:outline-none w-28 font-mono"
            />
          </div>

          <button
            onClick={generateNewRoom}
            className="text-xs bg-app-surface border border-app-border hover:bg-app-surface-muted text-app-text px-3 py-2 rounded-md transition-colors font-medium"
          >
            New Room
          </button>

          <button
            onClick={copyRoomInvite}
            className="text-xs bg-app-surface border border-app-border hover:bg-app-surface-muted text-app-text px-3 py-2 rounded-md transition-colors font-medium"
          >
            Share
          </button>

          <button
            onClick={() => setShowTraversalModal(true)}
            className="text-xs bg-app-surface border border-app-border hover:bg-app-surface-muted text-app-text px-3 py-2 rounded-md transition-colors font-medium flex items-center gap-1.5"
            title="Configure STUN/TURN ICE Traversal Servers"
          >
            <Globe className="w-3.5 h-3.5 text-indigo-400" />
            <span>Traversal (ICE)</span>
          </button>
          
          <button 
            onClick={saveFile}
            className="flex items-center gap-2 text-sm font-medium bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-2 rounded-md transition-colors cursor-pointer"
          >
            Save to Disk
          </button>
          
          <div className="flex items-center gap-2 text-sm font-mono bg-app-surface px-4 py-2 rounded-full border border-app-border text-app-text">
            <div className={`w-2 h-2 rounded-full ${isConnected ? 'bg-green-500 animate-pulse' : 'bg-red-500'}`} />
            {peers} Peers
          </div>
        </div>
      </div>

      {!roomPassword.trim() ? (
        <div className="bg-amber-950/40 border border-amber-500/30 px-4 py-2.5 rounded-lg flex items-center justify-between text-xs text-amber-200">
          <div className="flex items-center gap-2">
            <span>⚠️</span>
            <span>
              <strong>Unprotected Room:</strong> This room has no password. Anyone guessing this Room ID can view and edit your code. Add a password above to enable End-to-End Encryption (E2EE).
            </span>
          </div>
        </div>
      ) : (
        <div className="bg-teal-950/40 border border-teal-500/30 px-4 py-2 rounded-lg flex items-center gap-2 text-xs text-teal-200">
          <Shield className="w-4 h-4 text-teal-400" />
          <span>
            <strong>E2EE Active:</strong> Traffic is end-to-end encrypted with your room passphrase. Signaling servers cannot inspect editor content.
          </span>
        </div>
      )}

      <div className="flex-1 bg-app-surface rounded-xl border border-app-border overflow-hidden flex flex-col relative">
        <div className="bg-app-surface-muted/50 border-b border-app-border p-2 flex justify-between items-center text-xs font-mono text-app-text-muted">
          <span>{currentPath || 'Untitled'}</span>
          <div className="flex items-center gap-3">
            <span className="bg-indigo-500/10 border border-indigo-500/20 px-2 py-0.5 rounded text-indigo-400 font-medium">{language}</span>
            <span>Yjs WebRTC Active</span>
          </div>
        </div>
        <Editor
          height="100%"
          language={language}
          theme={theme === 'light' ? 'light' : 'vs-dark'}
          onMount={handleEditorMount}
          options={{
            fontSize: 14,
            minimap: { enabled: false },
            lineNumbers: 'on',
            scrollBeyondLastLine: false,
            wordWrap: 'on',
          }}
        />
      </div>

      {/* WebRTC STUN/TURN Traversal Modal */}
      {showTraversalModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-xs flex items-center justify-center z-50 p-4">
          <div className="bg-app-surface border border-app-border rounded-xl p-6 max-w-lg w-full shadow-2xl">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-bold text-app-text flex items-center gap-2">
                <Globe className="w-5 h-5 text-indigo-400" /> WebRTC ICE Traversal (STUN/TURN)
              </h3>
              <button
                onClick={() => setShowTraversalModal(false)}
                className="text-app-text-muted hover:text-app-text p-1 rounded"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <p className="text-xs text-app-text-muted mb-4">
              Configure custom STUN/TURN traversal servers for peer-to-peer editing across NAT and restrictive firewalls.
            </p>

            <div className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-app-text-muted uppercase mb-1">
                  STUN Servers (one per line)
                </label>
                <textarea
                  rows={3}
                  value={tempStun}
                  onChange={(e) => setTempStun(e.target.value)}
                  className="w-full bg-app-bg text-app-text font-mono text-xs p-3 rounded-lg border border-app-border outline-none focus:border-indigo-500"
                  placeholder="stun:stun.l.google.com:19302"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-app-text-muted uppercase mb-1">
                  TURN Server URL (optional)
                </label>
                <input
                  type="text"
                  value={tempTurnUrl}
                  onChange={(e) => setTempTurnUrl(e.target.value)}
                  className="w-full bg-app-bg text-app-text font-mono text-xs px-3 py-2 rounded-lg border border-app-border outline-none focus:border-indigo-500"
                  placeholder="turn:turn.example.com:3478"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-app-text-muted uppercase mb-1">
                    TURN Username
                  </label>
                  <input
                    type="text"
                    value={tempTurnUser}
                    onChange={(e) => setTempTurnUser(e.target.value)}
                    className="w-full bg-app-bg text-app-text font-mono text-xs px-3 py-2 rounded-lg border border-app-border outline-none focus:border-indigo-500"
                    placeholder="turn-user"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-app-text-muted uppercase mb-1">
                    TURN Credential
                  </label>
                  <input
                    type="password"
                    value={tempTurnCred}
                    onChange={(e) => setTempTurnCred(e.target.value)}
                    className="w-full bg-app-bg text-app-text font-mono text-xs px-3 py-2 rounded-lg border border-app-border outline-none focus:border-indigo-500"
                    placeholder="••••••••"
                  />
                </div>
              </div>
            </div>

            <div className="flex justify-end gap-3 mt-6">
              <button
                onClick={() => setShowTraversalModal(false)}
                className="px-4 py-2 rounded-lg text-sm text-app-text-muted hover:text-app-text transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleSaveTraversal}
                className="flex items-center gap-2 px-5 py-2 rounded-lg text-sm font-bold bg-indigo-600 hover:bg-indigo-500 text-white transition-all shadow-md cursor-pointer"
              >
                <Save className="w-4 h-4" /> Save & Reconnect
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
