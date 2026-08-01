import { useState, useEffect } from 'react';
import { invoke } from '@tauri-apps/api/core';

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

export const VisualGit = ({ currentPath }: { currentPath: string | null }) => {
  const [status, setStatus] = useState<GitStatus | null>(null);
  const [history, setHistory] = useState<GitCommitInfo[]>([]);
  const [commitMsg, setCommitMsg] = useState('');
  const [loading, setLoading] = useState(false);

  const refreshGit = async () => {
    if (!currentPath) return;
    setLoading(true);
    try {
      const s = await invoke<GitStatus>('get_git_status', { path: currentPath });
      setStatus(s);
      const h = await invoke<GitCommitInfo[]>('git_history', { path: currentPath, file: '' });
      setHistory(h);
    } catch (e) {
      console.error(e);
      setStatus(null);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    refreshGit();
  }, [currentPath]);

  const handleAction = async (args: string[]) => {
    if (!currentPath) return;
    setLoading(true);
    try {
      await invoke('git_action', { path: currentPath, args });
      setCommitMsg('');
      await refreshGit();
    } catch (e) {
      alert(e);
    } finally {
      setLoading(false);
    }
  };

  if (!currentPath) {
    return <div className="flex h-full items-center justify-center text-gray-500">Open a folder to use Git</div>;
  }

  if (!status) {
    return (
      <div className="flex flex-col h-full items-center justify-center text-gray-500">
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
      <div className="w-1/3 flex flex-col border-r border-white/10 p-4">
        <div className="flex items-center justify-between mb-4">
          <h2 className="font-bold text-cyan-400">Source Control</h2>
          <span className="text-xs bg-white/10 px-2 py-1 rounded font-mono">{status.branch}</span>
        </div>

        <div className="flex-1 overflow-y-auto mb-4">
          {status.staged.length > 0 && (
            <div className="mb-4">
              <div className="text-xs text-gray-400 uppercase tracking-widest font-bold mb-2 flex justify-between">
                Staged Changes
                <button onClick={() => handleAction(['restore', '--staged', '.'])} className="hover:text-cyan">- Unstage All</button>
              </div>
              {status.staged.map(f => (
                <div key={f} className="text-sm font-mono text-green-400 flex justify-between p-1 hover:bg-white/5 rounded">
                  <span className="truncate">{f}</span>
                  <button onClick={() => handleAction(['restore', '--staged', f])} className="text-gray-500 hover:text-white">-</button>
                </div>
              ))}
            </div>
          )}

          {(status.unstaged.length > 0 || status.untracked.length > 0) && (
            <div className="mb-4">
              <div className="text-xs text-gray-400 uppercase tracking-widest font-bold mb-2 flex justify-between">
                Changes
                <button onClick={() => handleAction(['add', '.'])} className="hover:text-cyan">+ Stage All</button>
              </div>
              {status.unstaged.map(f => (
                <div key={f} className="text-sm font-mono text-orange-400 flex justify-between p-1 hover:bg-white/5 rounded">
                  <span className="truncate">{f}</span>
                  <button onClick={() => handleAction(['add', f])} className="text-gray-500 hover:text-white">+</button>
                </div>
              ))}
              {status.untracked.map(f => (
                <div key={f} className="text-sm font-mono text-gray-500 flex justify-between p-1 hover:bg-white/5 rounded">
                  <span className="truncate">{f}</span>
                  <button onClick={() => handleAction(['add', f])} className="text-gray-500 hover:text-white">+</button>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="flex flex-col gap-2">
          <textarea 
            value={commitMsg}
            onChange={e => setCommitMsg(e.target.value)}
            placeholder="Commit message"
            className="w-full bg-black/40 border border-white/10 rounded p-2 text-sm focus:border-cyan-500 outline-none resize-none h-20"
          />
          <button 
            onClick={() => handleAction(['commit', '-m', commitMsg || 'Update'])}
            disabled={status.staged.length === 0 || loading}
            className="w-full py-2 bg-cyan-600 hover:bg-cyan-500 text-white rounded font-bold disabled:opacity-50 transition-colors"
          >
            Commit
          </button>
        </div>
      </div>

      <div className="flex-1 flex flex-col p-6 bg-black/20">
        <h2 className="font-bold text-gray-300 mb-4">Commit History</h2>
        <div className="flex-1 overflow-y-auto relative border-l-2 border-white/10 pl-6 ml-2">
          {history.map((commit, i) => (
            <div key={commit.hash} className="mb-8 relative">
              <div className="absolute -left-[31px] top-1 w-3 h-3 bg-cyan-500 rounded-full shadow-[0_0_10px_rgba(6,182,212,0.8)]" />
              <div className="bg-black/40 border border-white/10 rounded-lg p-4 hover:border-cyan-500/50 transition-colors">
                <div className="flex justify-between items-start mb-2">
                  <h3 className="text-cyan-100 font-medium">{commit.message}</h3>
                  <span className="text-xs text-gray-500 font-mono bg-white/5 px-2 py-1 rounded">{commit.hash.substring(0, 7)}</span>
                </div>
                <div className="text-xs text-gray-400">{commit.date}</div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};
