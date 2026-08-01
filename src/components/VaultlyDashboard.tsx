import { motion } from 'framer-motion';
import { HardDrive, Network, ShieldAlert, Cpu, TerminalSquare, GitBranch, Key, Activity, Layers, Webhook } from 'lucide-react';
import type { Tab } from '../App';

interface DashboardProps {
  onOpenApp: (app: Tab['activeApp']) => void;
}

export const VaultlyDashboard = ({ onOpenApp }: DashboardProps) => {
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

  const widgets = [
    { id: 'terminal', name: 'Terminal', icon: <TerminalSquare className="w-8 h-8 text-orange-400" />, desc: 'Multiplexed PTY Sessions', color: 'border-orange-500/30 hover:border-orange-500 hover:shadow-[0_0_20px_rgba(251,146,60,0.2)]' },
    { id: 'secrets', name: 'Secrets', icon: <Key className="w-8 h-8 text-yellow-500" />, desc: 'In-Memory Vault Injector', color: 'border-yellow-500/30 hover:border-yellow-500 hover:shadow-[0_0_20px_rgba(234,179,8,0.2)]' },
    { id: 'ast', name: 'AST Engine', icon: <Layers className="w-8 h-8 text-indigo-400" />, desc: 'Semantic Refactoring', color: 'border-indigo-500/30 hover:border-indigo-500 hover:shadow-[0_0_20px_rgba(129,140,248,0.2)]' },
    { id: 'git', name: 'Git Client', icon: <GitBranch className="w-8 h-8 text-rose-500" />, desc: 'Visual Version Control', color: 'border-rose-500/30 hover:border-rose-500 hover:shadow-[0_0_20px_rgba(244,63,94,0.2)]' },
    { id: 'memory', name: 'Profiler', icon: <Activity className="w-8 h-8 text-emerald-400" />, desc: 'Live Memory Heatmap', color: 'border-emerald-500/30 hover:border-emerald-500 hover:shadow-[0_0_20px_rgba(52,211,153,0.2)]' },
    { id: 'tunnel', name: 'Relay', icon: <Webhook className="w-8 h-8 text-teal-400" />, desc: 'Secure Port Tunneling', color: 'border-teal-500/30 hover:border-teal-500 hover:shadow-[0_0_20px_rgba(45,212,191,0.2)]' },
  ];

  return (
    <div className="flex flex-col h-full w-full p-8 overflow-y-auto">
      <motion.div 
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        className="mb-10"
      >
        <h1 className="text-4xl font-black text-transparent bg-clip-text bg-gradient-to-r from-blue-400 via-indigo-400 to-purple-400 mb-2 tracking-tight">
          Welcome to Vaultly v2
        </h1>
        <p className="text-gray-400 font-medium">The Ultimate Offline Developer OS.</p>
      </motion.div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-10">
        {/* System Vitals Widgets */}
        <motion.div initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} transition={{ delay: 0.1 }} className="bg-black/40 backdrop-blur-md border border-white/10 rounded-2xl p-6 flex items-center gap-4">
          <div className="p-4 bg-blue-500/10 rounded-xl"><Cpu className="w-8 h-8 text-blue-400" /></div>
          <div>
            <div className="text-sm text-gray-500 font-bold uppercase tracking-wider">System Load</div>
            <div className="text-2xl font-black text-white">4.2%</div>
          </div>
        </motion.div>

        <motion.div initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} transition={{ delay: 0.2 }} className="bg-black/40 backdrop-blur-md border border-white/10 rounded-2xl p-6 flex items-center gap-4">
          <div className="p-4 bg-fuchsia-500/10 rounded-xl"><ShieldAlert className="w-8 h-8 text-fuchsia-400" /></div>
          <div>
            <div className="text-sm text-gray-500 font-bold uppercase tracking-wider">ZKP Status</div>
            <div className="text-2xl font-black text-white">Active</div>
          </div>
        </motion.div>

        <motion.div initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} transition={{ delay: 0.3 }} className="bg-black/40 backdrop-blur-md border border-white/10 rounded-2xl p-6 flex items-center gap-4">
          <div className="p-4 bg-emerald-500/10 rounded-xl"><Network className="w-8 h-8 text-emerald-400" /></div>
          <div>
            <div className="text-sm text-gray-500 font-bold uppercase tracking-wider">P2P Mesh</div>
            <div className="text-2xl font-black text-white">3 Peers</div>
          </div>
        </motion.div>
      </div>

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
              onClick={() => onOpenApp(w.id as any)}
              className={`bg-black/40 backdrop-blur-sm border ${w.color} rounded-2xl p-6 flex flex-col items-start gap-4 transition-all duration-300 group text-left relative overflow-hidden`}
            >
              <div className="absolute inset-0 bg-gradient-to-br from-white/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
              {w.icon}
              <div>
                <h3 className="font-bold text-lg text-white group-hover:text-white transition-colors">{w.name}</h3>
                <p className="text-sm text-gray-400">{w.desc}</p>
              </div>
            </motion.button>
          ))}
        </div>
      </motion.div>
    </div>
  );
};
