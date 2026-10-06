import { useState, useCallback, useEffect } from 'react';
import {
  type Node,
  type Edge,
  ReactFlow,
  Background,
  Controls,
  useNodesState,
  useEdgesState,
  addEdge,
  type Connection,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { invoke } from '@tauri-apps/api/core';
import { useStore, useToast } from '../store/store';
import {
  Save,
  PlayCircle,
  Settings,
  Plus,
  CheckCircle2,
  XCircle,
  Clock,
  Terminal,
  History,
  FileText,
} from 'lucide-react';
import type { StepResult, PipelineRun } from '../types/plugin';

export type { StepResult, PipelineRun };

export type AutomationNodeData = {
  label: string;
  command?: string;
  stepResult?: StepResult;
};

export type AutomationNode = Node<AutomationNodeData>;

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
  const currentPath = useStore((s) => s.currentPath);
  const theme = useStore((s) => s.settings.theme);
  const [nodes, setNodes, onNodesChange] = useNodesState(initialNodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState(initialEdges);
  const [isRunning, setIsRunning] = useState(false);
  const [logs, setLogs] = useState<string[]>([]);
  const [stepResultsList, setStepResultsList] = useState<StepResult[]>([]);
  const [activeTab, setActiveTab] = useState<'logs' | 'steps' | 'history'>('logs');
  const [pastRuns, setPastRuns] = useState<PipelineRun[]>([]);
  const { error: toastError, success: toastSuccess } = useToast();

  const getDbPath = () => {
    if (!currentPath) return null;
    const separator = currentPath.includes('/') ? '/' : '\\';
    const cleanPath = currentPath.endsWith('/') || currentPath.endsWith('\\') ? currentPath.slice(0, -1) : currentPath;
    return `${cleanPath}${separator}.codexos-automation.db`;
  };

  const loadPastRunsFromStorage = () => {
    try {
      const raw = localStorage.getItem('codexos_automation_runs');
      if (raw) {
        setPastRuns(JSON.parse(raw));
      }
    } catch {
      // Ignore storage read error
    }
  };

  const initDb = async () => {
    const dbPath = getDbPath();
    if (!dbPath) return;
    try {
      try {
        await invoke('create_file', { path: dbPath });
      } catch {
        // File might already exist
      }

      await invoke('query_sqlite', {
        path: dbPath,
        query: 'CREATE TABLE IF NOT EXISTS pipelines (id TEXT PRIMARY KEY, nodes TEXT, edges TEXT)',
      });

      await invoke('query_sqlite', {
        path: dbPath,
        query:
          'CREATE TABLE IF NOT EXISTS pipeline_runs (id TEXT PRIMARY KEY, pipeline_id TEXT NOT NULL, status TEXT NOT NULL, started_at TEXT NOT NULL, completed_at TEXT NOT NULL, duration_ms INTEGER NOT NULL, step_results TEXT NOT NULL, logs TEXT NOT NULL)',
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
        query: "SELECT nodes, edges FROM pipelines WHERE id = 'default'",
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
        query: `INSERT OR REPLACE INTO pipelines (id, nodes, edges) VALUES ('default', '${nodesStr}', '${edgesStr}')`,
      });
      toastSuccess('Pipeline saved to SQLite');
    } catch (e: unknown) {
      toastError('Save Failed', String(e));
    }
  };

  useEffect(() => {
    loadPastRunsFromStorage();
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

    nodes.forEach((n) => {
      inDegree[n.id] = 0;
      adj[n.id] = [];
    });

    edges.forEach((e) => {
      if (adj[e.source]) adj[e.source].push(e.target);
      if (inDegree[e.target] !== undefined) inDegree[e.target]++;
    });

    const queue = nodes.filter((n) => inDegree[n.id] === 0).map((n) => n.id);
    const sortedIds: string[] = [];

    while (queue.length > 0) {
      const current = queue.shift()!;
      sortedIds.push(current);
      for (const neighbor of adj[current] || []) {
        inDegree[neighbor]--;
        if (inDegree[neighbor] === 0) queue.push(neighbor);
      }
    }

    const remaining = nodes.filter((n) => !sortedIds.includes(n.id)).map((n) => n.id);
    const allOrderedIds = [...sortedIds, ...remaining];
    return allOrderedIds.map((id) => nodes.find((n) => n.id === id)!).filter(Boolean);
  };

  const runPipeline = async () => {
    if (!currentPath) {
      toastError('Execution Failed', 'No workspace selected');
      return;
    }

    setIsRunning(true);
    setCompletedNodeIds(new Set());
    setFailedNodeIds(new Set());
    setStepResultsList([]);
    const initLog = `[${new Date().toLocaleTimeString()}] Initializing Directed Acyclic Graph (DAG) pipeline...`;
    const runLogs: string[] = [initLog];
    setLogs([initLog]);

    const pipelineStart = performance.now();
    const startedAt = new Date().toISOString();
    const stepResults: StepResult[] = [];
    const orderedNodes = getTopologicalOrder();
    let hasFailure = false;

    // Clear previous step results on nodes
    setNodes((nds) =>
      nds.map((n) => ({
        ...n,
        data: {
          ...n.data,
          stepResult: undefined,
        },
      }))
    );

    for (const node of orderedNodes) {
      setActiveNodeId(node.id);
      const stepStart = performance.now();
      const executedAt = new Date().toISOString();
      const nodeLog = `[${new Date().toLocaleTimeString()}] ▶ Executing: ${node.data.label}`;
      runLogs.push(nodeLog);
      setLogs((prev) => [...prev, nodeLog]);

      if (node.data.label.startsWith('Run:') || node.data.command) {
        const cmd = node.data.command || node.data.label.replace(/^Run:\s*/, '').trim();

        // Mark node status as running
        setNodes((prevNodes) =>
          prevNodes.map((n) =>
            n.id === node.id
              ? {
                  ...n,
                  data: {
                    ...n.data,
                    stepResult: {
                      nodeId: node.id,
                      command: cmd,
                      exitCode: 0,
                      stdout: '',
                      stderr: '',
                      durationMs: 0,
                      status: 'running',
                      executedAt,
                    },
                  },
                }
              : n
          )
        );

        try {
          const result = await invoke<string>('execute_command', { command: cmd, cwd: currentPath });
          const durationMs = Math.max(1, Math.round(performance.now() - stepStart));
          const stepRes: StepResult = {
            nodeId: node.id,
            command: cmd,
            exitCode: 0,
            stdout: result || '',
            stderr: '',
            durationMs,
            status: 'success',
            executedAt,
          };
          stepResults.push(stepRes);
          setStepResultsList((prev) => [...prev, stepRes]);

          // Update node with success stepResult
          setNodes((prevNodes) =>
            prevNodes.map((n) =>
              n.id === node.id
                ? {
                    ...n,
                    data: {
                      ...n.data,
                      stepResult: stepRes,
                    },
                  }
                : n
            )
          );

          const successOutput = result || '(Command executed successfully with empty output)';
          runLogs.push(successOutput);
          setLogs((prev) => [...prev, successOutput]);
          setCompletedNodeIds((prev) => new Set(prev).add(node.id));
        } catch (e: unknown) {
          const durationMs = Math.max(1, Math.round(performance.now() - stepStart));
          const errStr = e instanceof Error ? e.message : String(e);
          const stepRes: StepResult = {
            nodeId: node.id,
            command: cmd,
            exitCode: 1,
            stdout: '',
            stderr: errStr,
            durationMs,
            status: 'failed',
            executedAt,
          };
          stepResults.push(stepRes);
          setStepResultsList((prev) => [...prev, stepRes]);

          // Update node with failed stepResult
          setNodes((prevNodes) =>
            prevNodes.map((n) =>
              n.id === node.id
                ? {
                    ...n,
                    data: {
                      ...n.data,
                      stepResult: stepRes,
                    },
                  }
                : n
            )
          );

          const errLog = `[ERROR] ${errStr}`;
          runLogs.push(errLog);
          setLogs((prev) => [...prev, errLog]);
          setFailedNodeIds((prev) => new Set(prev).add(node.id));
          toastError('Pipeline Command Failed', errStr);
          hasFailure = true;
          break; // Halt pipeline sequentially on failure
        }
      } else if (node.data.label.includes('Notify')) {
        const durationMs = Math.max(1, Math.round(performance.now() - stepStart));
        const stepRes: StepResult = {
          nodeId: node.id,
          command: 'notify',
          exitCode: 0,
          stdout: node.data.label,
          stderr: '',
          durationMs,
          status: 'success',
          executedAt,
        };
        stepResults.push(stepRes);
        setStepResultsList((prev) => [...prev, stepRes]);

        setNodes((prevNodes) =>
          prevNodes.map((n) =>
            n.id === node.id
              ? {
                  ...n,
                  data: {
                    ...n.data,
                    stepResult: stepRes,
                  },
                }
              : n
          )
        );

        const notifyLog = `✓ [NOTIFICATION] ${node.data.label}`;
        runLogs.push(notifyLog);
        setLogs((prev) => [...prev, notifyLog]);
        setCompletedNodeIds((prev) => new Set(prev).add(node.id));
        toastSuccess('Pipeline Notification', node.data.label);
      } else {
        setCompletedNodeIds((prev) => new Set(prev).add(node.id));
      }

      await new Promise((r) => setTimeout(r, 100));
    }

    setActiveNodeId(null);
    setStepResultsList(stepResults);
    const completedAt = new Date().toISOString();
    const totalDuration = Math.max(1, Math.round(performance.now() - pipelineStart));

    if (!hasFailure) {
      const finishLog = `[${new Date().toLocaleTimeString()}] Pipeline completed successfully in ${totalDuration}ms!`;
      runLogs.push(finishLog);
      setLogs((prev) => [...prev, finishLog]);
      toastSuccess('Pipeline Complete', 'All nodes executed in DAG order.');
    } else {
      const failLog = `[${new Date().toLocaleTimeString()}] Pipeline stopped due to execution failure.`;
      runLogs.push(failLog);
      setLogs((prev) => [...prev, failLog]);
    }

    const runRecord: PipelineRun = {
      id: `run-${Date.now()}`,
      pipelineId: 'default',
      status: hasFailure ? 'failed' : 'success',
      startedAt,
      completedAt,
      durationMs: totalDuration,
      stepResults,
      logs: runLogs,
    };

    // Save run record to localStorage
    try {
      const existingRunsRaw = localStorage.getItem('codexos_automation_runs');
      const existingRuns: PipelineRun[] = existingRunsRaw ? JSON.parse(existingRunsRaw) : [];
      const updatedRuns = [runRecord, ...existingRuns].slice(0, 30);
      localStorage.setItem('codexos_automation_runs', JSON.stringify(updatedRuns));
      setPastRuns(updatedRuns);
    } catch {
      // Ignore local storage error
    }

    // Persist run record to SQLite pipeline_runs table
    const dbPath = getDbPath();
    if (dbPath) {
      try {
        const stepResultsEscaped = JSON.stringify(stepResults).replace(/'/g, "''");
        const logsEscaped = JSON.stringify(runLogs).replace(/'/g, "''");
        await invoke('query_sqlite', {
          path: dbPath,
          query: `INSERT INTO pipeline_runs (id, pipeline_id, status, started_at, completed_at, duration_ms, step_results, logs) VALUES ('${runRecord.id}', '${runRecord.pipelineId}', '${runRecord.status}', '${runRecord.startedAt}', '${runRecord.completedAt}', ${runRecord.durationMs}, '${stepResultsEscaped}', '${logsEscaped}')`,
        });
      } catch (err) {
        console.warn('Failed to persist pipeline run to SQLite', err);
      }
    }

    setIsRunning(false);
  };

  const addNode = (label: string, command?: string) => {
    const newNode: AutomationNode = {
      id: `${Date.now()}`,
      data: { label, command },
      position: { x: 200 + Math.random() * 150, y: 100 + Math.random() * 200 },
    };
    setNodes((nds) => nds.concat(newNode));
  };

  const addCustomCommand = () => {
    const cmd = prompt('Enter shell command for new pipeline step:', 'npm test');
    if (cmd && cmd.trim()) {
      addNode(`Run: ${cmd.trim()}`, cmd.trim());
    }
  };

  // Extract all step results from state or current nodes
  const nodeStepResults = nodes
    .filter((n) => n.data.stepResult)
    .map((n) => n.data.stepResult!);

  const displayedStepResults = stepResultsList.length > 0 ? stepResultsList : nodeStepResults;

  return (
    <div className="flex h-full w-full bg-app-bg text-app-text relative">
      {/* Sidebar Controls */}
      <div className="w-64 border-r border-app-border p-4 flex flex-col gap-4 pt-4 bg-app-surface z-10 shrink-0">
        <h2 className="font-bold text-cyan-400 flex items-center gap-2">
          <Settings className="w-4 h-4" />
          Automation Studio
        </h2>

        <div className="flex flex-col gap-2 mt-4">
          <button
            onClick={addCustomCommand}
            className="flex items-center gap-2 bg-cyan-500/20 border border-cyan-500/30 text-cyan-400 dark:text-cyan-300 p-2 rounded text-sm hover:bg-cyan-500/30 font-bold"
          >
            <Plus className="w-3 h-3" /> Custom Shell Step
          </button>
          <button
            onClick={() => addNode('Run: npm run build', 'npm run build')}
            className="flex items-center gap-2 bg-app-surface border border-app-border hover:bg-app-surface-muted text-app-text p-2 rounded text-sm"
          >
            <Plus className="w-3 h-3" /> Run Build
          </button>
          <button
            onClick={() => addNode('Run: git status', 'git status')}
            className="flex items-center gap-2 bg-app-surface border border-app-border hover:bg-app-surface-muted text-app-text p-2 rounded text-sm"
          >
            <Plus className="w-3 h-3" /> Git Status
          </button>
          <button
            onClick={() => addNode('Run: cargo test', 'cargo test')}
            className="flex items-center gap-2 bg-app-surface border border-app-border hover:bg-app-surface-muted text-app-text p-2 rounded text-sm"
          >
            <Plus className="w-3 h-3" /> Cargo Test
          </button>
          <button
            onClick={() => addNode('Notify Pipeline Success')}
            className="flex items-center gap-2 bg-app-surface border border-app-border hover:bg-app-surface-muted text-app-text p-2 rounded text-sm"
          >
            <Plus className="w-3 h-3" /> Notification
          </button>
        </div>

        <div className="mt-auto flex flex-col gap-2">
          <button
            onClick={savePipeline}
            className="flex items-center justify-center gap-2 w-full font-bold py-2 rounded transition-colors bg-app-surface hover:bg-app-surface-muted border border-app-border text-app-text"
          >
            <Save className="w-4 h-4" /> Save to SQLite
          </button>
          <button
            disabled={isRunning || !currentPath}
            onClick={runPipeline}
            className={`flex items-center justify-center gap-2 w-full font-bold py-2 rounded transition-colors ${
              isRunning || !currentPath
                ? 'bg-gray-600 text-gray-400 cursor-not-allowed'
                : 'bg-cyan-600 hover:bg-cyan-500 text-white shadow-[0_0_15px_rgba(6,182,212,0.3)]'
            }`}
          >
            <PlayCircle className="w-4 h-4" />
            {isRunning ? 'Executing DAG...' : 'Run Pipeline'}
          </button>
        </div>
      </div>

      {/* Main Flow Canvas & Bottom Panels */}
      <div className="flex-1 relative flex flex-col">
        <div className="flex-1" style={{ width: '100%', height: '100%' }}>
          <ReactFlow
            nodes={nodes.map((n) => {
              let borderClass = 'border-app-border';
              if (activeNodeId === n.id) {
                borderClass = 'border-cyan-400 ring-2 ring-cyan-400 animate-pulse';
              } else if (failedNodeIds.has(n.id) || n.data.stepResult?.status === 'failed') {
                borderClass = 'border-red-500 ring-2 ring-red-500';
              } else if (completedNodeIds.has(n.id) || n.data.stepResult?.status === 'success') {
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
            className={theme === 'light' ? 'light-theme-flow' : 'dark-theme-flow'}
          >
            <Controls />
            <Background color={theme === 'light' ? '#94a3b8' : '#334155'} gap={16} size={1} />
          </ReactFlow>
        </div>

        {/* Execution Inspector & Run Persistence Pane */}
        <div className="h-56 bg-app-surface border-t border-app-border flex flex-col z-10 shrink-0">
          {/* Tab Bar */}
          <div className="flex items-center justify-between border-b border-app-border px-4 py-2 bg-app-bg/50">
            <div className="flex items-center gap-2">
              <button
                onClick={() => setActiveTab('logs')}
                className={`flex items-center gap-1.5 px-3 py-1 rounded text-xs font-bold transition-colors ${
                  activeTab === 'logs'
                    ? 'bg-cyan-500/20 text-cyan-400 border border-cyan-500/30'
                    : 'text-app-text-muted hover:text-app-text'
                }`}
              >
                <Terminal className="w-3.5 h-3.5" />
                <span>Execution Logs</span>
              </button>

              <button
                onClick={() => setActiveTab('steps')}
                className={`flex items-center gap-1.5 px-3 py-1 rounded text-xs font-bold transition-colors ${
                  activeTab === 'steps'
                    ? 'bg-cyan-500/20 text-cyan-400 border border-cyan-500/30'
                    : 'text-app-text-muted hover:text-app-text'
                }`}
              >
                <FileText className="w-3.5 h-3.5" />
                <span>Step Results ({displayedStepResults.length})</span>
              </button>

              <button
                onClick={() => setActiveTab('history')}
                className={`flex items-center gap-1.5 px-3 py-1 rounded text-xs font-bold transition-colors ${
                  activeTab === 'history'
                    ? 'bg-cyan-500/20 text-cyan-400 border border-cyan-500/30'
                    : 'text-app-text-muted hover:text-app-text'
                }`}
              >
                <History className="w-3.5 h-3.5" />
                <span>Runs History ({pastRuns.length})</span>
              </button>
            </div>

            {activeTab === 'logs' && logs.length > 0 && (
              <button
                onClick={() => setLogs([])}
                className="text-xs text-app-text-muted hover:text-app-text transition-colors"
              >
                Clear
              </button>
            )}
          </div>

          {/* Tab Content */}
          <div className="flex-1 p-3 overflow-y-auto font-mono text-xs text-app-text-muted">
            {activeTab === 'logs' && (
              <div className="flex flex-col gap-1">
                {logs.map((log, i) => (
                  <div
                    key={i}
                    className={`whitespace-pre-wrap ${log.includes('[ERROR]') ? 'text-red-400 font-bold' : ''}`}
                  >
                    {log}
                  </div>
                ))}
                {logs.length === 0 && <div className="text-app-text-muted/60 italic">No logs yet...</div>}
              </div>
            )}

            {activeTab === 'steps' && (
              <div className="flex flex-col gap-2">
                {displayedStepResults.length === 0 ? (
                  <div className="text-app-text-muted/60 italic">
                    Run the pipeline to inspect structured StepResults (exitCode, duration, stdout, stderr).
                  </div>
                ) : (
                  displayedStepResults.map((step, idx) => (
                    <div
                      key={idx}
                      className={`p-2.5 rounded-lg border ${
                        step.status === 'success'
                          ? 'bg-emerald-500/5 border-emerald-500/20'
                          : 'bg-red-500/5 border-red-500/20'
                      }`}
                    >
                      <div className="flex items-center justify-between mb-1">
                        <div className="flex items-center gap-2">
                          {step.status === 'success' ? (
                            <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                          ) : (
                            <XCircle className="w-4 h-4 text-red-400" />
                          )}
                          <span className="font-bold text-app-text">{step.command}</span>
                          <span className="text-[11px] text-gray-500 font-mono">(node: {step.nodeId})</span>
                        </div>
                        <div className="flex items-center gap-3 text-[11px]">
                          <span
                            className={`px-1.5 py-0.5 rounded font-bold ${
                              step.exitCode === 0 ? 'bg-emerald-500/20 text-emerald-400' : 'bg-red-500/20 text-red-400'
                            }`}
                          >
                            exit: {step.exitCode}
                          </span>
                          <span className="flex items-center gap-1 text-gray-400">
                            <Clock className="w-3 h-3" />
                            {step.durationMs}ms
                          </span>
                        </div>
                      </div>

                      {step.stdout && (
                        <div className="mt-1 p-1.5 bg-black/40 rounded border border-white/5 text-gray-300 whitespace-pre-wrap max-h-20 overflow-y-auto">
                          {step.stdout}
                        </div>
                      )}
                      {step.stderr && (
                        <div className="mt-1 p-1.5 bg-red-950/30 rounded border border-red-500/30 text-red-300 whitespace-pre-wrap max-h-20 overflow-y-auto">
                          {step.stderr}
                        </div>
                      )}
                    </div>
                  ))
                )}
              </div>
            )}

            {activeTab === 'history' && (
              <div className="flex flex-col gap-2">
                {pastRuns.length === 0 ? (
                  <div className="text-app-text-muted/60 italic">No past pipeline runs recorded yet.</div>
                ) : (
                  pastRuns.map((run) => (
                    <div
                      key={run.id}
                      className="p-2.5 rounded-lg border border-app-border bg-app-surface flex items-center justify-between"
                    >
                      <div className="flex items-center gap-2.5">
                        {run.status === 'success' ? (
                          <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                        ) : (
                          <XCircle className="w-4 h-4 text-red-400" />
                        )}
                        <div>
                          <div className="font-bold text-app-text">{run.id}</div>
                          <div className="text-[10px] text-app-text-muted">
                            Started: {new Date(run.startedAt).toLocaleTimeString()} • Completed:{' '}
                            {new Date(run.completedAt).toLocaleTimeString()}
                          </div>
                        </div>
                      </div>
                      <div className="flex items-center gap-3">
                        <span className="text-[11px] text-gray-400">{run.stepResults.length} steps</span>
                        <span className="text-[11px] text-cyan-400 font-bold">{run.durationMs}ms</span>
                        <span
                          className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase ${
                            run.status === 'success'
                              ? 'bg-emerald-500/20 text-emerald-300'
                              : 'bg-red-500/20 text-red-300'
                          }`}
                        >
                          {run.status}
                        </span>
                      </div>
                    </div>
                  ))
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
