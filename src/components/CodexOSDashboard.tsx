import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { Database, Activity, HardDrive, Cpu, GitBranch, Key, Network, ShieldAlert, Box } from 'lucide-react';
import { invoke } from '@tauri-apps/api/core';
import { useStore } from '../store/store';
import { LineChart, Line, ResponsiveContainer } from 'recharts';
import type { AppId } from '../types/apps';
import { SIDEBAR_ITEMS } from './layout/Sidebar';

interface DashboardProps {
  onOpenApp: (app: AppId) => void;
}

interface SysStats {
  cpu_usage: number;
  mem_total: number;
  mem_used: number;
  drives: Array<{ name: string; mount_point: string; total_space: number; available_space: number }>;
}

interface GitStatus {
  staged: string[];
  unstaged: string[];
  untracked: string[];
  branch: string;
}

interface DockerContainerSummary {
  id: string;
  names: string[];
  image?: string;
  status?: string;
  state?: string;
}

export const CodexOSDashboard = ({ onOpenApp }: DashboardProps) => {
  const [sysStats, setSysStats] = useState<SysStats | null>(null);
  const secretsCount = useStore(s => s.secretsCount);
  const activeTunnelCount = useStore(s => s.activeTunnelCount);
  const currentPath = useStore(s => s.currentPath);
  const peerCount = useStore(s => s.peerCount);
  const recentWorkspaces = useStore(s => s.settings.recentWorkspaces || []);
  const openWorkspace = useStore(s => s.openWorkspace);
  
  const [gitModified, setGitModified] = useState(0);
  const [dockerCount, setDockerCount] = useState(0);

  useEffect(() => {
    const fetchStats = async () => {
      try {
        const stats = await invoke<SysStats>('get_sys_stats');
        setSysStats(stats);
      } catch (e: unknown) {
        console.warn("Failed to fetch sys stats:", e);
      }
    };
    fetchStats();
    const interval = setInterval(fetchStats, 2000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    if (currentPath) {
      invoke<GitStatus>('get_git_status', { path: currentPath })
        .then(status => setGitModified(status.staged.length + status.unstaged.length + status.untracked.length))
        .catch(() => setGitModified(0));
    } else {
      setGitModified(0);
    }
  }, [currentPath]);

  useEffect(() => {
    invoke<DockerContainerSummary[]>('get_docker_containers')
      .then(containers => setDockerCount(containers.length))
      .catch(() => setDockerCount(0));
  }, []);

  const formatBytes = (bytes: number) => {
    if (bytes === 0) return '0 B';
    const k = 1024 ** 3; // GB
    return `${(bytes / k).toFixed(1)} GB`;
  };

  const [cpuHistory, setCpuHistory] = useState<{ value: number }[]>([]);
  useEffect(() => {
    if (sysStats) {
      setCpuHistory(prev => [...prev.slice(-19), { value: sysStats.cpu_usage }]);
    }
  }, [sysStats]);

  const containerVariants = {
    hidden: { opacity: 0 },
    show: {
      opacity: 1,
      transition: { staggerChildren: 0.1 }
    }
  };

  const itemVariants = {
    hidden: { opacity: 0, y: 20 },
    show: { opacity: 1, y: 0, transition: { type: "spring" as const, stiffness: 300, damping: 24 } }
  };

  const colors = [
    'border-orange-500/30 hover:border-orange-500 hover:shadow-[0_0_20px_rgba(251,146,60,0.2)] text-orange-400',
    'border-yellow-500/30 hover:border-yellow-500 hover:shadow-[0_0_20px_rgba(234,179,8,0.2)] text-yellow-500',
    'border-indigo-500/30 hover:border-indigo-500 hover:shadow-[0_0_20px_rgba(129,140,248,0.2)] text-indigo-400',
    'border-rose-500/30 hover:border-rose-500 hover:shadow-[0_0_20px_rgba(244,63,94,0.2)] text-rose-500',
    'border-emerald-500/30 hover:border-emerald-500 hover:shadow-[0_0_20px_rgba(52,211,153,0.2)] text-emerald-400',
    'border-teal-500/30 hover:border-teal-500 hover:shadow-[0_0_20px_rgba(45,212,191,0.2)] text-teal-400',
    'border-cyan-500/30 hover:border-cyan-500 hover:shadow-[0_0_20px_rgba(34,211,238,0.2)] text-cyan-400',
    'border-purple-500/30 hover:border-purple-500 hover:shadow-[0_0_20px_rgba(168,85,247,0.2)] text-purple-400',
    'border-fuchsia-500/30 hover:border-fuchsia-500 hover:shadow-[0_0_20px_rgba(217,70,239,0.2)] text-fuchsia-400',
    'border-blue-500/30 hover:border-blue-500 hover:shadow-[0_0_20px_rgba(59,130,246,0.2)] text-blue-400',
  ];

  const widgets = SIDEBAR_ITEMS.filter((item) => item.id !== 'home').map((item, index: number) => {
    const colorClass = colors[index % colors.length];
    const borderColor = colorClass.split(' ')[0] + ' ' + colorClass.split(' ')[1] + ' ' + colorClass.split(' ')[2];
    
    let badge: string | number | null = null;
    if (item.id === 'secrets' && secretsCount > 0) badge = secretsCount;
    if (item.id === 'tunnel' && activeTunnelCount > 0) badge = activeTunnelCount;
    if (item.id === 'git' && gitModified > 0) badge = gitModified;
    
    return {
      id: item.id as AppId,
      name: item.label,
      icon: <div className={`w-8 h-8 ${colorClass.split(' ')[3]}`}>{item.icon}</div>,
      desc: `Open ${item.label}`,
      color: borderColor,
      badge
    };
  });

  const totalSpace = sysStats?.drives.reduce((acc, d) => acc + d.total_space, 0) || 0;
  const availableSpace = sysStats?.drives.reduce((acc, d) => acc + d.available_space, 0) || 0;

  return (
    <div className="flex flex-col h-full w-full p-8 overflow-y-auto">
      <motion.div 
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        className="mb-10 flex items-center gap-5"
      >
        <img src="/logo.png" alt="CodexOS Logo" className="w-16 h-16 object-contain rounded-2xl shadow-xl shadow-indigo-500/20 border border-white/10 shrink-0" />
        <div>
          <h1 className="text-4xl font-black text-transparent bg-clip-text bg-gradient-to-r from-blue-400 via-indigo-400 to-purple-400 mb-1 tracking-tight">
            Welcome to CodexOS v2
          </h1>
          <p className="text-gray-400 font-medium">The Ultimate Offline Developer OS.</p>
        </div>
      </motion.div>

      <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-5 gap-6 mb-6">
        <motion.div initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} transition={{ delay: 0.1 }} className="bg-black/40 backdrop-blur-md border border-white/10 rounded-2xl p-6 flex flex-col justify-center gap-4 relative overflow-hidden">
          <div className="flex items-center gap-4 z-10">
            <div className="p-4 bg-blue-500/10 rounded-xl"><Cpu className="w-8 h-8 text-blue-400" /></div>
            <div>
              <div className="text-xs text-gray-500 font-bold uppercase tracking-wider">CPU</div>
              <div className="text-xl font-black text-white">{sysStats ? sysStats.cpu_usage.toFixed(1) + '%' : '—'}</div>
            </div>
          </div>
          <div className="absolute bottom-0 left-0 right-0 h-16 opacity-30 pointer-events-none">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={cpuHistory}>
                <Line type="monotone" dataKey="value" stroke="#60a5fa" strokeWidth={2} dot={false} isAnimationActive={false} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </motion.div>

        <motion.div initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} transition={{ delay: 0.15 }} className="bg-black/40 backdrop-blur-md border border-white/10 rounded-2xl p-6 flex flex-col justify-center gap-4 relative overflow-hidden">
          <div className="flex items-center gap-4 z-10">
            <div className="p-4 bg-fuchsia-500/10 rounded-xl"><Activity className="w-8 h-8 text-fuchsia-400" /></div>
            <div>
              <div className="text-xs text-gray-500 font-bold uppercase tracking-wider">Memory</div>
              <div className="text-xl font-black text-white">{sysStats ? `${formatBytes(sysStats.mem_used)} / ${formatBytes(sysStats.mem_total)}` : '—'}</div>
            </div>
          </div>
        </motion.div>
        
        <motion.div initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} transition={{ delay: 0.2 }} className="bg-black/40 backdrop-blur-md border border-white/10 rounded-2xl p-6 flex flex-col justify-center gap-4 relative overflow-hidden">
          <div className="flex items-center gap-4 z-10">
            <div className="p-4 bg-yellow-500/10 rounded-xl"><Key className="w-8 h-8 text-yellow-400" /></div>
            <div>
              <div className="text-xs text-gray-500 font-bold uppercase tracking-wider">Secrets</div>
              <div className="text-xl font-black text-white">{secretsCount} Active</div>
            </div>
          </div>
        </motion.div>

        <motion.div initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} transition={{ delay: 0.25 }} className="bg-black/40 backdrop-blur-md border border-white/10 rounded-2xl p-6 flex flex-col justify-center gap-4 relative overflow-hidden">
          <div className="flex items-center gap-4 z-10">
            <div className="p-4 bg-pink-500/10 rounded-xl"><ShieldAlert className="w-8 h-8 text-pink-400" /></div>
            <div>
              <div className="text-xs text-gray-500 font-bold uppercase tracking-wider">HMAC Proof</div>
              <div className="text-xl font-black text-white">Initialized</div>
            </div>
          </div>
        </motion.div>

        <motion.div initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} transition={{ delay: 0.3 }} className="bg-black/40 backdrop-blur-md border border-white/10 rounded-2xl p-6 flex flex-col justify-center gap-4 relative overflow-hidden">
          <div className="flex items-center gap-4 z-10">
            <div className="p-4 bg-emerald-500/10 rounded-xl"><Network className="w-8 h-8 text-emerald-400" /></div>
            <div>
              <div className="text-xs text-gray-500 font-bold uppercase tracking-wider">P2P Mesh</div>
              <div className="text-xl font-black text-white">{peerCount} Peers</div>
            </div>
          </div>
        </motion.div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-10">
        <motion.div initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} transition={{ delay: 0.4 }} className="bg-black/40 backdrop-blur-md border border-white/10 rounded-2xl p-4 flex items-center gap-4">
          <div className="p-2 bg-indigo-500/10 rounded-lg"><HardDrive className="w-5 h-5 text-indigo-400" /></div>
          <div>
            <div className="text-xs text-gray-500 font-bold uppercase tracking-wider">Total Storage</div>
            <div className="text-sm font-bold text-white">{sysStats ? formatBytes(totalSpace) : '—'}</div>
          </div>
        </motion.div>

        <motion.div initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} transition={{ delay: 0.45 }} className="bg-black/40 backdrop-blur-md border border-white/10 rounded-2xl p-4 flex items-center gap-4">
          <div className="p-2 bg-teal-500/10 rounded-lg"><Database className="w-5 h-5 text-teal-400" /></div>
          <div>
            <div className="text-xs text-gray-500 font-bold uppercase tracking-wider">Available Storage</div>
            <div className="text-sm font-bold text-white">{sysStats ? formatBytes(availableSpace) : '—'}</div>
          </div>
        </motion.div>

        <motion.div initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} transition={{ delay: 0.5 }} className="bg-black/40 backdrop-blur-md border border-white/10 rounded-2xl p-4 flex items-center gap-4">
          <div className="p-2 bg-rose-500/10 rounded-lg"><GitBranch className="w-5 h-5 text-rose-400" /></div>
          <div>
            <div className="text-xs text-gray-500 font-bold uppercase tracking-wider">Git Modified</div>
            <div className="text-sm font-bold text-white">{currentPath ? gitModified : '—'}</div>
          </div>
        </motion.div>

        <motion.div initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} transition={{ delay: 0.55 }} className="bg-black/40 backdrop-blur-md border border-white/10 rounded-2xl p-4 flex items-center gap-4">
          <div className="p-2 bg-sky-500/10 rounded-lg"><Box className="w-5 h-5 text-sky-400" /></div>
          <div>
            <div className="text-xs text-gray-500 font-bold uppercase tracking-wider">Containers</div>
            <div className="text-sm font-bold text-white">{dockerCount} Active</div>
          </div>
        </motion.div>
      </div>

      {recentWorkspaces.length > 0 && (
        <motion.div 
          variants={containerVariants}
          initial="hidden"
          animate="show"
          className="mb-10"
        >
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-sm font-bold text-gray-500 uppercase tracking-widest">Recent Workspaces</h2>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {recentWorkspaces.slice(0, 3).map((w, i) => (
              <motion.button
                key={i}
                variants={itemVariants}
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
                onClick={() => {
                  openWorkspace(w.path, w.name);
                  onOpenApp('files');
                }}
                className="bg-black/40 backdrop-blur-md border border-white/10 hover:border-indigo-500/50 rounded-xl p-4 flex flex-col items-start gap-2 transition-all duration-300 text-left group"
              >
                <div className="flex items-center gap-2">
                  <div className="p-2 bg-indigo-500/10 rounded-lg group-hover:bg-indigo-500/20 transition-colors">
                    <HardDrive className="w-4 h-4 text-indigo-400" />
                  </div>
                  <span className="font-bold text-white group-hover:text-indigo-300 transition-colors">{w.name}</span>
                </div>
                <span className="text-xs text-gray-500 font-mono truncate w-full">{w.path}</span>
              </motion.button>
            ))}
          </div>
        </motion.div>
      )}

      <motion.div 
        variants={containerVariants}
        initial="hidden"
        animate="show"
      >
        <h2 className="text-sm font-bold text-gray-500 uppercase tracking-widest mb-4">Pinned Utilities</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
          {widgets.map((w) => (
            <motion.button
              key={w.id}
              variants={itemVariants}
              whileHover={{ scale: 1.02, y: -2 }}
              whileTap={{ scale: 0.98 }}
              onClick={() => onOpenApp(w.id)}
              className={`bg-black/40 backdrop-blur-sm border ${w.color} rounded-2xl p-6 flex flex-col items-start gap-4 transition-all duration-300 group text-left relative overflow-hidden`}
            >
              <div className="absolute inset-0 bg-gradient-to-br from-white/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
              {w.icon}
              <div className="flex-1">
                <h3 className="font-bold text-lg text-white group-hover:text-white transition-colors">{w.name}</h3>
                <p className="text-sm text-gray-400">{w.desc}</p>
              </div>
              {w.badge !== null && (
                <div className="absolute top-4 right-4 bg-white/10 border border-white/20 text-white text-xs font-bold px-2 py-1 rounded-full cx-badge-pulse">
                  {w.badge}
                </div>
              )}
            </motion.button>
          ))}
        </div>
      </motion.div>
    </div>
  );
};
