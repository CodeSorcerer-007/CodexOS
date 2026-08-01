import { useState, useEffect } from 'react';
import * as Y from 'yjs';

export const CollaborativeEditor = ({ currentPath }: { currentPath: string | null }) => {
  const [text, setText] = useState('// Welcome to the Vaultly CRDT Collaborative Editor.\n// Connecting to peers...');
  const [peers, setPeers] = useState(0);

  useEffect(() => {
    // In a real implementation, we would bind this to y-webrtc or y-websocket
    const ydoc = new Y.Doc();
    const ytext = ydoc.getText('monaco');
    
    // Simulate initial load and peer connection
    const timer1 = setTimeout(() => {
      setPeers(3);
      ytext.insert(0, '// Connected to 3 peers over WebRTC.\nfunction helloWorld() {\n  console.log("Hello CRDTs!");\n}\n');
      setText(ytext.toString());
    }, 1500);

    // Simulate another peer typing remotely
    const timer2 = setInterval(() => {
      if (Math.random() > 0.5) {
        ytext.insert(ytext.length, '\n// Peer added a comment');
        setText(ytext.toString());
      }
    }, 4000);

    return () => {
      clearTimeout(timer1);
      clearInterval(timer2);
      ydoc.destroy();
    };
  }, []);

  const handleChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    // In a real implementation, this would apply deltas to the Yjs doc
    setText(e.target.value);
  };

  return (
    <div className="flex flex-col h-full w-full bg-[#0a0f18] text-white p-6 gap-6">
      <div className="flex justify-between items-center border-b border-white/10 pb-4">
        <div>
          <h2 className="font-bold text-orange-400 text-2xl mb-1">CRDT Collaborative Editor</h2>
          <p className="text-sm text-gray-400">Google Docs-style real-time editing on local files over WebRTC.</p>
        </div>
        <div className="flex items-center gap-2 text-sm font-mono bg-black px-4 py-2 rounded-full border border-white/10">
          <div className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
          {peers} Peers Connected
        </div>
      </div>

      <div className="flex-1 bg-black rounded-xl border border-white/10 overflow-hidden flex flex-col relative">
        <div className="bg-white/5 border-b border-white/10 p-2 flex justify-between items-center text-xs font-mono text-gray-400">
          <span>{currentPath || 'Untitled-1.ts'}</span>
          <span>Yjs Engine Active</span>
        </div>
        
        {/* We use a simple textarea here to simulate a code editor */}
        <textarea 
          value={text}
          onChange={handleChange}
          className="flex-1 w-full bg-transparent text-gray-300 font-mono text-sm p-4 focus:outline-none resize-none"
          spellCheck={false}
        />
        
        {/* Simulate remote cursors */}
        <div className="absolute top-32 left-48 pointer-events-none flex flex-col items-center">
          <div className="w-3 h-4 bg-orange-500 rounded-sm skew-x-[-15deg]"></div>
          <div className="bg-orange-500 text-white text-[10px] px-1 rounded">Peer-1</div>
        </div>
        
        <div className="absolute top-64 left-16 pointer-events-none flex flex-col items-center">
          <div className="w-3 h-4 bg-fuchsia-500 rounded-sm skew-x-[-15deg]"></div>
          <div className="bg-fuchsia-500 text-white text-[10px] px-1 rounded">Peer-2</div>
        </div>
      </div>
    </div>
  );
};
