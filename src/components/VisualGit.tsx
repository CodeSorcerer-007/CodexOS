import { useState, useEffect, useCallback } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import { useToast } from '../store/store';
import { ReactFlow, Background, Controls } from '@xyflow/react';
import '@xyflow/react/dist/style.css';

interface GitStatus {
  staged: string[];
  unstaged: string[];
  untracked: string[];
  branch: string;
}

interface GitCommitInfo {
  hash: string;
  message: string;
  date: string;
}

interface BranchInfo {
  name: string;
  hash: string;
  is_current: boolean;
  is_remote: boolean;
}

const renderDiff = (diff: string) => {
  return diff.split('\n').map((line, i) => {
    if (line.startsWith('+') && !line.startsWith('+++')) return <div key={i} className="bg-green-500/10 text-green-400 font-mono text-xs px-2">{line}</div>;
    if (line.startsWith('-') && !line.startsWith('---')) return <div key={i} className="bg-red-500/10 text-red-400 font-mono text-xs px-2">{line}</div>;
    if (line.startsWith('@@')) return <div key={i} className="bg-blue-500/10 text-blue-400 font-mono text-xs px-2">{line}</div>;
    return <div key={i} className="text-gray-500 font-mono text-xs px-2">{line}</div>;
  });
};

export const VisualGit = ({ currentPath }: { currentPath: string | null }) => {
  const [status, setStatus] = useState<GitStatus | null>(null);
  const [history, setHistory] = useState<GitCommitInfo[]>([]);
  const [branches, setBranches] = useState<BranchInfo[]>([]);
  const [commitMsg, setCommitMsg] = useState('');
  const [loading, setLoading] = useState(false);
  
  const [activeTab, setActiveTab] = useState<'diff' | 'history' | 'branches'>('history');
  const [selectedFile, setSelectedFile] = useState<string | null>(null);
  const [diffContent, setDiffContent] = useState<string>('');
  
  const [cloneUrl, setCloneUrl] = useState('');
  const [cloneDest, setCloneDest] = useState('');
  const [cloneProgress, setCloneProgress] = useState<string[]>([]);
  
  const [newBranchName, setNewBranchName] = useState('');
  const { success: toastSuccess, error: toastError } = useToast();

  const refreshGit = useCallback(async () => {
    if (!currentPath) return;
    setLoading(true);
    try {
      const s = await invoke<GitStatus>('get_git_status', { path: currentPath });
      setStatus(s);
      const h = await invoke<GitCommitInfo[]>('git_history', { path: currentPath, file: '' });
      setHistory(h);
      const b = await invoke<BranchInfo[]>('get_branches', { path: currentPath });
      setBranches(b);
    } catch (e: unknown) {
      console.error(e);
      setStatus(null);
    } finally {
      setLoading(false);
    }
  }, [currentPath]);

  useEffect(() => {
    refreshGit();
  }, [refreshGit]);

  useEffect(() => {
    const unlisten = listen<string>('git-progress', (event) => {
      setCloneProgress(prev => [...prev, event.payload]);
    });
    return () => { unlisten.then(fn => fn()); };
  }, []);

  const handleAction = async (args: string[]) => {
    if (!currentPath) return;
    setLoading(true);
    try {
      await invoke('git_action', { path: currentPath, args });
      setCommitMsg('');
      toastSuccess('Git Action', `Executed git ${args.join(' ')}`);
      await refreshGit();
    } catch (e: unknown) {
      toastError('Git Action Failed', e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  };

  const handlePull = async () => {
    if (!currentPath) return;
    setLoading(true);
    try {
      await invoke('git_pull', { path: currentPath });
      toastSuccess('Git Pull', 'Successfully pulled remote changes');
      await refreshGit();
    } catch (e: unknown) {
      toastError('Git Pull Failed', e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  };

  const handleFetch = async () => {
    if (!currentPath) return;
    setLoading(true);
    try {
      await invoke('git_fetch', { path: currentPath });
      toastSuccess('Git Fetch', 'Successfully fetched remote branches');
      await refreshGit();
    } catch (e: unknown) {
      toastError('Git Fetch Failed', e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  };

  const handleCheckout = async (branch: string) => {
    if (!currentPath) return;
    setLoading(true);
    try {
      let b = branch;
      if (b.startsWith('remotes/origin/')) {
        b = b.replace('remotes/origin/', '');
      }
      await invoke('git_checkout', { path: currentPath, branch: b });
      toastSuccess('Git Checkout', `Checked out branch ${b}`);
      await refreshGit();
    } catch (e: unknown) {
      toastError('Git Checkout Failed', e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  };

  const handleCreateBranch = async () => {
    if (!currentPath || !newBranchName) return;
    setLoading(true);
    try {
      await invoke('git_create_branch', { path: currentPath, branch: newBranchName });
      toastSuccess('Branch Created', `Created and checked out ${newBranchName}`);
      setNewBranchName('');
      await refreshGit();
    } catch (e: unknown) {
      toastError('Create Branch Failed', e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  };

  const loadDiff = async (file: string, isStaged: boolean = false) => {
    if (!currentPath) return;
    setSelectedFile(file);
    setActiveTab('diff');
    try {
      const diff = await invoke<string>(isStaged ? 'get_staged_diff' : 'get_file_diff', { path: currentPath, file });
      setDiffContent(diff);
    } catch (e: unknown) {
      setDiffContent('Error loading diff: ' + String(e));
      toastError('Load Diff Failed', e instanceof Error ? e.message : String(e));
    }
  };

  const handleClone = async () => {
    if (!cloneUrl || !cloneDest) return;
    setLoading(true);
    setCloneProgress([]);
    try {
      await invoke('git_clone', { url: cloneUrl, destination: cloneDest });
      toastSuccess('Git Clone', `Cloned repository to ${cloneDest}`);
    } catch (e: unknown) {
      toastError('Git Clone Failed', e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  };
  
  const handleStash = async () => {
    if (!currentPath) return;
    setLoading(true);
    try {
      await invoke('git_stash', { path: currentPath });
      toastSuccess('Git Stash', 'Stashed changes');
      await refreshGit();
    } catch (e: unknown) {
      toastError('Git Stash Failed', e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  };
  
  const handleStashPop = async () => {
    if (!currentPath) return;
    setLoading(true);
    try {
      await invoke('git_stash_pop', { path: currentPath });
      toastSuccess('Git Stash Pop', 'Popped latest stash');
      await refreshGit();
    } catch (e: unknown) {
      toastError('Stash Pop Failed', e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  };

  if (!currentPath) {
    return (
      <div className="flex flex-col h-full items-center justify-center text-gray-500 bg-[#0a0f18] p-4">
        <h2 className="text-xl text-white mb-4">Open a folder or Clone Repository</h2>
        <div className="flex flex-col gap-2 w-96">
          <input type="text" placeholder="Git URL" value={cloneUrl} onChange={e => setCloneUrl(e.target.value)} className="w-full bg-black/40 border border-white/10 rounded p-2 text-sm focus:border-cyan-500 outline-none" />
          <input type="text" placeholder="Destination path" value={cloneDest} onChange={e => setCloneDest(e.target.value)} className="w-full bg-black/40 border border-white/10 rounded p-2 text-sm focus:border-cyan-500 outline-none" />
          <button onClick={handleClone} disabled={loading} className="w-full py-2 bg-cyan-600 hover:bg-cyan-500 text-white rounded font-bold disabled:opacity-50">Clone Repository</button>
        </div>
        <div className="mt-4 w-96 h-40 bg-black/50 overflow-y-auto text-xs font-mono p-2">
          {cloneProgress.map((p, i) => <div key={i}>{p}</div>)}
        </div>
      </div>
    );
  }

  if (!status) {
    return (
      <div className="flex flex-col h-full items-center justify-center text-gray-500 bg-[#0a0f18]">
        <p>Not a Git repository.</p>
        <button 
          onClick={() => handleAction(['init'])}
          className="mt-4 px-4 py-2 bg-cyan-600 text-white rounded hover:bg-cyan-500 transition-colors"
        >
          Initialize Repository
        </button>
      </div>
    );
  }

  return (
    <div className="flex h-full w-full bg-[#0a0f18] text-white">
      {/* Left Panel: Branch & Status */}
      <div className="w-1/3 min-w-[300px] flex flex-col border-r border-white/10 p-4">
        
        {/* Branch Info & Controls */}
        <div className="flex flex-col gap-2 mb-4">
          <div className="flex items-center justify-between">
            <h2 className="font-bold text-cyan-400">Source Control</h2>
            <select 
              className="text-xs bg-white/10 px-2 py-1 rounded font-mono outline-none border border-white/20 focus:border-cyan-500 max-w-[150px]"
              value={status.branch}
              onChange={(e) => handleCheckout(e.target.value)}
            >
              <option value={status.branch}>{status.branch}</option>
              {branches.filter(b => b.name !== status.branch).map(b => (
                <option key={b.name} value={b.name}>{b.name}</option>
              ))}
            </select>
          </div>
          <div className="flex gap-2">
            <input type="text" placeholder="New branch..." value={newBranchName} onChange={e => setNewBranchName(e.target.value)} className="flex-1 bg-black/40 border border-white/10 rounded px-2 py-1 text-xs outline-none focus:border-cyan-500" />
            <button onClick={handleCreateBranch} disabled={!newBranchName || loading} className="px-2 py-1 bg-cyan-600/50 hover:bg-cyan-500/80 rounded text-xs disabled:opacity-50">+</button>
          </div>
          <div className="flex gap-2 text-xs">
            <button onClick={handlePull} disabled={loading} className="flex-1 py-1 bg-white/10 hover:bg-white/20 rounded">Pull</button>
            <button onClick={handleFetch} disabled={loading} className="flex-1 py-1 bg-white/10 hover:bg-white/20 rounded">Fetch</button>
          </div>
          <div className="flex gap-2 text-xs">
            <button onClick={handleStash} disabled={loading} className="flex-1 py-1 bg-orange-600/50 hover:bg-orange-500/80 rounded">Stash</button>
            <button onClick={handleStashPop} disabled={loading} className="flex-1 py-1 bg-orange-600/50 hover:bg-orange-500/80 rounded">Pop Stash</button>
          </div>
        </div>

        {/* Changes List */}
        <div className="flex-1 overflow-y-auto mb-4 border border-white/5 rounded p-2">
          {status.staged.length > 0 && (
            <div className="mb-4">
              <div className="text-xs text-gray-400 uppercase tracking-widest font-bold mb-2 flex justify-between">
                Staged Changes
                <button onClick={() => handleAction(['restore', '--staged', '.'])} className="hover:text-cyan-400">- Unstage All</button>
              </div>
              {status.staged.map(f => (
                <div key={f} className="text-sm font-mono text-green-400 flex items-center justify-between p-1 hover:bg-white/5 rounded group cursor-pointer" onClick={() => loadDiff(f, true)}>
                  <span className="truncate flex-1">{f}</span>
                  <button onClick={(e) => { e.stopPropagation(); handleAction(['restore', '--staged', f]); }} className="text-gray-500 hover:text-white px-2 opacity-0 group-hover:opacity-100">-</button>
                </div>
              ))}
            </div>
          )}

          {(status.unstaged.length > 0 || status.untracked.length > 0) && (
            <div className="mb-4">
              <div className="text-xs text-gray-400 uppercase tracking-widest font-bold mb-2 flex justify-between">
                Changes
                <button onClick={() => handleAction(['add', '.'])} className="hover:text-cyan-400">+ Stage All</button>
              </div>
              {status.unstaged.map(f => (
                <div key={f} className="text-sm font-mono text-orange-400 flex items-center justify-between p-1 hover:bg-white/5 rounded group cursor-pointer" onClick={() => loadDiff(f, false)}>
                  <span className="truncate flex-1">{f}</span>
                  <button onClick={(e) => { e.stopPropagation(); handleAction(['add', f]); }} className="text-gray-500 hover:text-white px-2 opacity-0 group-hover:opacity-100">+</button>
                </div>
              ))}
              {status.untracked.map(f => (
                <div key={f} className="text-sm font-mono text-gray-500 flex items-center justify-between p-1 hover:bg-white/5 rounded group cursor-pointer" onClick={() => loadDiff(f, false)}>
                  <span className="truncate flex-1">{f}</span>
                  <button onClick={(e) => { e.stopPropagation(); handleAction(['add', f]); }} className="text-gray-500 hover:text-white px-2 opacity-0 group-hover:opacity-100">+</button>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Commit Input */}
        <div className="flex flex-col gap-2">
          <textarea 
            value={commitMsg}
            onChange={e => setCommitMsg(e.target.value)}
            placeholder="Commit message"
            className="w-full bg-black/40 border border-white/10 rounded p-2 text-sm focus:border-cyan-500 outline-none resize-none h-20"
          />
          <div className="flex gap-2">
            <button 
              onClick={() => handleAction(['commit', '-m', commitMsg || 'Update'])}
              disabled={status.staged.length === 0 || loading}
              className="flex-1 py-2 bg-cyan-600 hover:bg-cyan-500 text-white rounded font-bold disabled:opacity-50 transition-colors"
            >
              Commit
            </button>
            <button 
              onClick={() => handleAction(['push'])}
              disabled={loading}
              className="flex-1 py-2 bg-purple-600 hover:bg-purple-500 text-white rounded font-bold disabled:opacity-50 transition-colors"
            >
              Push
            </button>
          </div>
        </div>
      </div>

      {/* Right Panel: Tabs */}
      <div className="flex-1 flex flex-col bg-black/20 overflow-hidden">
        <div className="flex border-b border-white/10">
          <button 
            onClick={() => setActiveTab('history')}
            className={`px-4 py-3 text-sm font-bold border-b-2 transition-colors ${activeTab === 'history' ? 'border-cyan-500 text-cyan-400' : 'border-transparent text-gray-400 hover:text-white'}`}
          >
            History
          </button>
          <button 
            onClick={() => setActiveTab('diff')}
            className={`px-4 py-3 text-sm font-bold border-b-2 transition-colors ${activeTab === 'diff' ? 'border-cyan-500 text-cyan-400' : 'border-transparent text-gray-400 hover:text-white'}`}
          >
            Diff {selectedFile ? `(${selectedFile})` : ''}
          </button>
          <button 
            onClick={() => setActiveTab('branches')}
            className={`px-4 py-3 text-sm font-bold border-b-2 transition-colors ${activeTab === 'branches' ? 'border-cyan-500 text-cyan-400' : 'border-transparent text-gray-400 hover:text-white'}`}
          >
            Branches
          </button>
        </div>
        
        <div className="flex-1 overflow-y-auto p-4 relative">
          {loading && <div className="absolute inset-0 bg-black/50 flex items-center justify-center z-10"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-cyan-500"></div></div>}
          
          {activeTab === 'history' && (
            <div className="w-full h-full border border-white/10 rounded-lg overflow-hidden bg-black/50">
              <ReactFlow
                nodes={history.map((commit, i) => ({
                  id: commit.hash,
                  position: { x: 50, y: i * 100 + 50 },
                  data: {
                    label: (
                      <div className="flex flex-col text-left">
                        <div className="font-bold text-sm text-cyan-400 max-w-[200px] truncate">{commit.message}</div>
                        <div className="text-xs text-gray-400 mt-1">{commit.hash.substring(0, 7)} &bull; {commit.date}</div>
                      </div>
                    )
                  },
                  type: 'default',
                  style: {
                    background: 'rgba(0,0,0,0.8)',
                    border: '1px solid rgba(6,182,212,0.5)',
                    color: 'white',
                    borderRadius: '8px',
                    padding: '10px',
                    width: 250,
                  }
                }))}
                edges={history.slice(0, -1).map((commit, i) => ({
                  id: `e-${commit.hash}-${history[i+1].hash}`,
                  source: history[i+1].hash,
                  target: commit.hash,
                  animated: true,
                  style: { stroke: 'rgba(6,182,212,0.8)', strokeWidth: 2 }
                }))}
                fitView
              >
                <Background color="#ffffff" gap={16} size={1} />
                <Controls className="bg-black/80 border border-white/10 fill-white" />
              </ReactFlow>
              {history.length === 0 && <div className="absolute inset-0 flex items-center justify-center text-gray-500 pointer-events-none">No commits found.</div>}
            </div>
          )}

          {activeTab === 'diff' && (
            <div className="h-full flex flex-col">
              {!selectedFile ? (
                <div className="flex-1 flex items-center justify-center text-gray-500">
                  Select a file from the Changes list to view its diff
                </div>
              ) : (
                <div className="flex-1 overflow-y-auto bg-black border border-white/10 rounded p-4 font-mono text-xs whitespace-pre-wrap">
                  {diffContent ? renderDiff(diffContent) : <span className="text-gray-500">No diff available</span>}
                </div>
              )}
            </div>
          )}

          {activeTab === 'branches' && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {branches.map(b => (
                <div key={b.name} className={`p-4 rounded-lg border ${b.is_current ? 'border-cyan-500 bg-cyan-500/10' : 'border-white/10 bg-black/40 hover:border-white/30'} flex justify-between items-center`}>
                  <div>
                    <div className="font-mono text-sm font-bold text-white flex items-center gap-2">
                      {b.name} {b.is_current && <span className="text-[10px] bg-cyan-500 text-black px-1 rounded uppercase">Current</span>}
                    </div>
                    <div className="text-xs text-gray-500 mt-1">{b.hash.substring(0, 7)} {b.is_remote ? '(Remote)' : '(Local)'}</div>
                  </div>
                  {!b.is_current && (
                    <button onClick={() => handleCheckout(b.name)} className="text-xs bg-white/10 hover:bg-white/20 px-3 py-1 rounded transition-colors">
                      Checkout
                    </button>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
