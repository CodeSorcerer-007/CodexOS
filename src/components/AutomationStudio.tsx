import { useState, useCallback, useEffect } from 'react';
import { type Node, type Edge, ReactFlow, Background, Controls, useNodesState, useEdgesState, addEdge, type Connection } from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { invoke } from '@tauri-apps/api/core';
import { useStore, useToast } from '../store/store';
import { Save, PlayCircle, Settings, Plus } from 'lucide-react';

type AutomationNode = Node<{ label: string }>;

const initialNodes: AutomationNode[] = [
  { id: '1', position: { x: 250, y: 50 }, data: { label: 'Start Pipeline' }, type: 'input' },
  { id: '2', position: { x: 250, y: 150 }, data: { label: 'Run: echo "Hello CodexOS"' } },
  { id: '3', position: { x: 250, y: 250 }, data: { label: 'Notify Success' }, type: 'output' },
];

const initialEdges: Edge[] = [
  { id: 'e1-2', source: '1', target: '2', animated: true },
  { id: 'e2-3', source: '2', target: '3', animated: true },
];

export const AutomationStudio = () => {
  const currentPath = useStore(s => s.currentPath);
  const [nodes, setNodes, onNodesChange] = useNodesState(initialNodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState(initialEdges);
  const [isRunning, setIsRunning] = useState(false);
  const [logs, setLogs] = useState<string[]>([]);
  const { error: toastError, success: toastSuccess } = useToast();

  const getDbPath = () => {
    if (!currentPath) return null;
    const separator = currentPath.includes('/') ? '/' : '\\';
    const cleanPath = currentPath.endsWith('/') || currentPath.endsWith('\\') ? currentPath.slice(0, -1) : currentPath;
    return `${cleanPath}${separator}.codexos-automation.db`;
  };

  const initDb = async () => {
    const dbPath = getDbPath();
    if (!dbPath) return;
    try {
      await invoke('query_sqlite', { 
        path: dbPath, 
        query: 'CREATE TABLE IF NOT EXISTS pipelines (id TEXT PRIMARY KEY, nodes TEXT, edges TEXT)' 
      });
    } catch (e) {
      console.error('Failed to init SQLite for AutomationStudio', e);
    }
  };

  const loadPipeline = async () => {
    const dbPath = getDbPath();
    if (!dbPath) return;
    try {
      const res = await invoke<any>('query_sqlite', { 
        path: dbPath, 
        query: "SELECT nodes, edges FROM pipelines WHERE id = 'default'" 
      });
      if (res && res.rows && res.rows.length > 0) {
        const row = res.rows[0];
        setNodes(JSON.parse(row[0]));
        setEdges(JSON.parse(row[1]));
        toastSuccess('Pipeline loaded from SQLite');
      }
    } catch (e) {
      console.warn('Could not load pipeline', e);
    }
  };

  const savePipeline = async () => {
    const dbPath = getDbPath();
    if (!dbPath) {
      toastError('Save Failed', 'No workspace selected');
      return;
    }
    try {
      const nodesStr = JSON.stringify(nodes).replace(/'/g, "''");
      const edgesStr = JSON.stringify(edges).replace(/'/g, "''");
      await invoke('query_sqlite', { 
        path: dbPath, 
        query: `INSERT OR REPLACE INTO pipelines (id, nodes, edges) VALUES ('default', '${nodesStr}', '${edgesStr}')` 
      });
      toastSuccess('Pipeline saved to SQLite');
    } catch (e: unknown) {
      toastError('Save Failed', String(e));
    }
  };

  useEffect(() => {
    initDb().then(() => loadPipeline());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentPath]);

  const onConnect = useCallback((params: Edge | Connection) => setEdges((eds) => addEdge(params, eds)), [setEdges]);

  const [activeNodeId, setActiveNodeId] = useState<string | null>(null);
  const [completedNodeIds, setCompletedNodeIds] = useState<Set<string>>(new Set());
  const [failedNodeIds, setFailedNodeIds] = useState<Set<string>>(new Set());

  const getTopologicalOrder = (): AutomationNode[] => {
    const inDegree: Record<string, number> = {};
    const adj: Record<string, string[]> = {};

    nodes.forEach(n => {
      inDegree[n.id] = 0;
      adj[n.id] = [];
    });

    edges.forEach(e => {
      if (adj[e.source]) adj[e.source].push(e.target);
      if (inDegree[e.target] !== undefined) inDegree[e.target]++;
    });

    const queue = nodes.filter(n => inDegree[n.id] === 0).map(n => n.id);
    const sortedIds: string[] = [];

    while (queue.length > 0) {
      const current = queue.shift()!;
      sortedIds.push(current);
      for (const neighbor of adj[current] || []) {
        inDegree[neighbor]--;
        if (inDegree[neighbor] === 0) queue.push(neighbor);
      }
    }

    const remaining = nodes.filter(n => !sortedIds.includes(n.id)).map(n => n.id);
    const allOrderedIds = [...sortedIds, ...remaining];
    return allOrderedIds.map(id => nodes.find(n => n.id === id)!).filter(Boolean);
  };

  const runPipeline = async () => {
    if (!currentPath) {
      toastError('Execution Failed', 'No workspace selected');
      return;
    }
    
    setIsRunning(true);
    setCompletedNodeIds(new Set());
    setFailedNodeIds(new Set());
    setLogs([`[${new Date().toLocaleTimeString()}] Initializing Directed Acyclic Graph (DAG) pipeline...`]);
    
    const orderedNodes = getTopologicalOrder();
    let hasFailure = false;

    for (const node of orderedNodes) {
      setActiveNodeId(node.id);
      setLogs(prev => [...prev, `[${new Date().toLocaleTimeString()}] ▶ Executing: ${node.data.label}`]);
      
      if (node.data.label.startsWith('Run:')) {
        const cmd = node.data.label.replace('Run:', '').trim();
        try {
           const result = await invoke<string>('execute_command', { command: cmd, cwd: currentPath });
           setLogs(prev => [...prev, result || '(Command executed successfully with empty output)']);
           setCompletedNodeIds(prev => new Set(prev).add(node.id));
        } catch (e: unknown) {
           const errStr = e instanceof Error ? e.message : String(e);
           setLogs(prev => [...prev, `[ERROR] ${errStr}`]);
           setFailedNodeIds(prev => new Set(prev).add(node.id));
           toastError('Pipeline Command Failed', errStr);
           hasFailure = true;
           break;
        }
      } else if (node.data.label.includes('Notify')) {
        setLogs(prev => [...prev, `✓ [NOTIFICATION] ${node.data.label}`]);
        setCompletedNodeIds(prev => new Set(prev).add(node.id));
        toastSuccess('Pipeline Notification', node.data.label);
      } else {
        setCompletedNodeIds(prev => new Set(prev).add(node.id));
      }

      await new Promise(r => setTimeout(r, 400));
    }

    setActiveNodeId(null);
    if (!hasFailure) {
      setLogs(prev => [...prev, `[${new Date().toLocaleTimeString()}] Pipeline completed successfully!`]);
      toastSuccess('Pipeline Complete', 'All nodes executed in DAG order.');
    } else {
      setLogs(prev => [...prev, `[${new Date().toLocaleTimeString()}] Pipeline stopped due to execution failure.`]);
    }
    setIsRunning(false);
  };

  const addNode = (label: string) => {
    const newNode = {
      id: `${Date.now()}`,
      data: { label },
      position: { x: 200 + Math.random() * 150, y: 100 + Math.random() * 200 },
    };
    setNodes((nds) => nds.concat(newNode));
  };

  const addCustomCommand = () => {
    const cmd = prompt('Enter shell command for new pipeline step:', 'npm test');
    if (cmd && cmd.trim()) {
      addNode(`Run: ${cmd.trim()}`);
    }
  };

  return (
    <div className="flex h-full w-full bg-[#050505] text-white relative">
      <div className="w-64 border-r border-white/10 p-4 flex flex-col gap-4 pt-4 bg-[#0a0f18] z-10 shrink-0">
        <h2 className="font-bold text-cyan-400 flex items-center gap-2">
          <Settings className="w-4 h-4" />
          Automation Studio
        </h2>
        
        <div className="flex flex-col gap-2 mt-4">
          <button onClick={addCustomCommand} className="flex items-center gap-2 bg-cyan-500/20 border border-cyan-500/30 text-cyan-300 p-2 rounded text-sm hover:bg-cyan-500/30 font-bold">
            <Plus className="w-3 h-3" /> Custom Shell Step
          </button>
          <button onClick={() => addNode('Run: npm run build')} className="flex items-center gap-2 bg-white/5 border border-white/10 p-2 rounded text-sm hover:bg-white/10">
            <Plus className="w-3 h-3" /> Run Build
          </button>
          <button onClick={() => addNode('Run: git status')} className="flex items-center gap-2 bg-white/5 border border-white/10 p-2 rounded text-sm hover:bg-white/10">
            <Plus className="w-3 h-3" /> Git Status
          </button>
          <button onClick={() => addNode('Run: cargo test')} className="flex items-center gap-2 bg-white/5 border border-white/10 p-2 rounded text-sm hover:bg-white/10">
            <Plus className="w-3 h-3" /> Cargo Test
          </button>
          <button onClick={() => addNode('Notify Pipeline Success')} className="flex items-center gap-2 bg-white/5 border border-white/10 p-2 rounded text-sm hover:bg-white/10">
            <Plus className="w-3 h-3" /> Notification
          </button>
        </div>
        
        <div className="mt-auto flex flex-col gap-2">
          <button 
            onClick={savePipeline}
            className="flex items-center justify-center gap-2 w-full font-bold py-2 rounded transition-colors bg-white/5 hover:bg-white/10 border border-white/10"
          >
            <Save className="w-4 h-4" /> Save to SQLite
          </button>
          <button 
            disabled={isRunning || !currentPath}
            onClick={runPipeline}
            className={`flex items-center justify-center gap-2 w-full font-bold py-2 rounded transition-colors ${isRunning || !currentPath ? 'bg-gray-600 text-gray-400 cursor-not-allowed' : 'bg-cyan-600 hover:bg-cyan-500 text-white shadow-[0_0_15px_rgba(6,182,212,0.3)]'}`}
          >
            <PlayCircle className="w-4 h-4" />
            {isRunning ? 'Executing DAG...' : 'Run Pipeline'}
          </button>
        </div>
      </div>

      <div className="flex-1 relative flex flex-col">
        <div className="flex-1" style={{ width: '100%', height: '100%' }}>
          <ReactFlow
            nodes={nodes.map((n) => {
              let borderClass = 'border-white/20';
              if (activeNodeId === n.id) {
                borderClass = 'border-cyan-400 ring-2 ring-cyan-400 animate-pulse';
              } else if (failedNodeIds.has(n.id)) {
                borderClass = 'border-red-500 ring-2 ring-red-500';
              } else if (completedNodeIds.has(n.id)) {
                borderClass = 'border-emerald-500 ring-1 ring-emerald-500';
              }
              return {
                ...n,
                className: `${borderClass} shadow-xl transition-all`,
              };
            })}
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
        <div className="h-48 bg-black border-t border-white/10 p-4 overflow-y-auto font-mono text-xs text-gray-400 flex flex-col gap-1 z-10">
          <div className="text-white font-bold mb-2 flex items-center justify-between">
            <span>Execution Logs</span>
            <button onClick={() => setLogs([])} className="text-gray-500 hover:text-white">Clear</button>
          </div>
          {logs.map((log, i) => (
            <div key={i} className={`whitespace-pre-wrap ${log.includes('[ERROR]') ? 'text-red-400' : ''}`}>
              {log}
            </div>
          ))}
          {logs.length === 0 && <div className="text-gray-600 italic">No logs yet...</div>}
        </div>
      </div>
    </div>
  );
};
