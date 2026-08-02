import { useState, useCallback } from 'react';
import ReactFlow, { 
  Controls, 
  Background, 
  useNodesState, 
  useEdgesState, 
  addEdge, 
  type Connection, 
  type Edge 
} from 'reactflow';
import 'reactflow/dist/style.css';
import { invoke } from '@tauri-apps/api/core';

const initialNodes = [
  { id: '1', position: { x: 250, y: 50 }, data: { label: 'Start Pipeline' }, type: 'input' },
  { id: '2', position: { x: 250, y: 150 }, data: { label: 'Run: npm test' } },
  { id: '3', position: { x: 250, y: 250 }, data: { label: 'Notify Success' }, type: 'output' },
];

const initialEdges = [
  { id: 'e1-2', source: '1', target: '2', animated: true },
  { id: 'e2-3', source: '2', target: '3', animated: true },
];

export const AutomationStudio = () => {
  const [nodes, setNodes, onNodesChange] = useNodesState(initialNodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState(initialEdges);
  const [isRunning, setIsRunning] = useState(false);
  const [logs, setLogs] = useState<string[]>([]);

  const onConnect = useCallback((params: Edge | Connection) => setEdges((eds) => addEdge(params, eds)), [setEdges]);

  const runPipeline = async () => {
    setIsRunning(true);
    setLogs(['Starting automation pipeline...']);
    
    // Simple mock execution engine
    for (const node of nodes) {
      setLogs(prev => [...prev, `Executing node: ${node.data.label}`]);
      
      if (node.data.label.startsWith('Run:')) {
        const cmd = node.data.label.replace('Run:', '').trim();
        try {
           // We can re-use the PTY backend to execute commands
           await invoke('write_pty', { data: `${cmd}\r\n` });
           setLogs(prev => [...prev, `Sent command to terminal: ${cmd}`]);
        } catch (e) {
           setLogs(prev => [...prev, `Error: ${e}`]);
        }
      }

      // simulate delay
      await new Promise(r => setTimeout(r, 1000));
    }

    setLogs(prev => [...prev, 'Pipeline completed successfully.']);
    setIsRunning(false);
  };

  const addNode = (label: string) => {
    const newNode = {
      id: `${nodes.length + 1}`,
      data: { label },
      position: { x: Math.random() * 300, y: Math.random() * 300 },
    };
    setNodes((nds) => nds.concat(newNode));
  };

  return (
    <div className="flex h-full w-full bg-[#0a0f18] text-white">
      <div className="w-64 border-r border-white/10 p-4 flex flex-col gap-4">
        <h2 className="font-bold text-cyan-400">Nodes</h2>
        <button onClick={() => addNode('Run: npm run build')} className="bg-white/5 hover:bg-white/10 border border-white/10 p-2 rounded text-sm text-left">
          + Run Build
        </button>
        <button onClick={() => addNode('Run: git status')} className="bg-white/5 hover:bg-white/10 border border-white/10 p-2 rounded text-sm text-left">
          + Git Status
        </button>
        <button onClick={() => addNode('Notify Success')} className="bg-white/5 hover:bg-white/10 border border-white/10 p-2 rounded text-sm text-left">
          + Notification
        </button>
        
        <div className="mt-auto">
          <button 
            onClick={runPipeline}
            disabled={isRunning}
            className="w-full bg-cyan-600 hover:bg-cyan-500 disabled:opacity-50 text-white font-bold py-2 rounded transition-colors"
          >
            {isRunning ? 'Running...' : 'Run Pipeline'}
          </button>
        </div>
      </div>

      <div className="flex-1 relative flex flex-col">
        <div className="flex-1" style={{ width: '100%', height: '100%' }}>
          <ReactFlow
            nodes={nodes}
            edges={edges}
            onNodesChange={onNodesChange}
            onEdgesChange={onEdgesChange}
            onConnect={onConnect}
            fitView
            className="dark-theme-flow"
          >
            <Controls />
            <Background color="#ffffff" gap={16} size={1} />
          </ReactFlow>
        </div>
        
        {/* Execution Logs */}
        <div className="h-48 bg-black border-t border-white/10 p-4 overflow-y-auto font-mono text-xs text-gray-400 flex flex-col gap-1">
          <div className="text-white font-bold mb-2">Execution Logs</div>
          {logs.map((log, i) => (
            <div key={i} className={log.includes('Error') ? 'text-red-400' : ''}>&gt; {log}</div>
          ))}
        </div>
      </div>
    </div>
  );
};
