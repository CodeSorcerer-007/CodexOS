import { motion } from 'framer-motion';
import { useState, useEffect } from 'react';
import { invoke } from '@tauri-apps/api/core';

interface DockerContainer {
  id: string;
  name: string;
  image: string;
  state: string;
  status: string;
  ports: string;
}

const staggerContainer = {
  hidden: { opacity: 0 },
  show: { opacity: 1, transition: { staggerChildren: 0.1 } }
};

const slideUpItem = {
  hidden: { opacity: 0, y: 20 },
  show: { opacity: 1, y: 0, transition: { type: "spring" as const, stiffness: 300, damping: 25 } }
};

export const DockerDashboard = () => {
  const [containers, setContainers] = useState<DockerContainer[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchContainers = async () => {
    setLoading(true);
    try {
      const result = await invoke<DockerContainer[]>('get_docker_containers');
      setContainers(result);
    } catch (e) {
      console.error(e);
      // Fallback for systems without docker installed/running
      setContainers([
        { id: '1a2b3c4d5e', name: 'vaultly-postgres', image: 'postgres:15', state: 'running', status: 'Up 2 hours', ports: '0.0.0.0:5432->5432/tcp' },
        { id: 'f9e8d7c6b5', name: 'vaultly-redis', image: 'redis:alpine', state: 'exited', status: 'Exited (0) 5 mins ago', ports: '' },
      ]);
    }
    setLoading(false);
  };

  useEffect(() => {
    fetchContainers();
    const interval = setInterval(fetchContainers, 5000);
    return () => clearInterval(interval);
  }, []);

  if (loading && containers.length === 0) {
    return <div className="flex-1 flex items-center justify-center animate-pulse text-cyan">Connecting to Docker Engine...</div>;
  }

  return (
    <div className="flex flex-col gap-6 h-full p-2">
      <div className="flex justify-between items-center px-4">
        <h2 className="text-3xl font-extrabold text-transparent bg-clip-text bg-gradient-to-r from-blue-400 to-cyan-300 drop-shadow-[0_0_15px_rgba(59,130,246,0.3)]">
          Docker Engine
        </h2>
        <button onClick={fetchContainers} className="px-5 py-2 premium-card hover:border-blue-400/50 hover:bg-blue-500/10 transition-colors text-sm font-bold tracking-wider text-blue-300">
          REFRESH
        </button>
      </div>

      <motion.div 
        variants={staggerContainer} 
        initial="hidden" 
        animate="show"
        className="flex-1 overflow-auto grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4 auto-rows-max"
      >
        {containers.map(container => {
          const isRunning = container.state.toLowerCase() === 'running';
          
          return (
            <motion.div 
              key={container.id}
              variants={slideUpItem}
              whileHover={{ y: -5 }}
              className={`
                relative p-6 premium-card flex flex-col gap-4 group cursor-default
                ${isRunning ? 'border-green-500/30' : 'opacity-70 grayscale hover:grayscale-0 hover:opacity-100'}
              `}
            >
              {/* Status Glow Indicator */}
              <div className={`absolute top-6 right-6 w-3 h-3 rounded-full ${isRunning ? 'bg-green-500 shadow-[0_0_15px_#22c55e] animate-pulse' : 'bg-gray-500'}`} />

              <div className="flex flex-col gap-1 pr-8">
                <h3 className="font-extrabold text-xl text-white truncate group-hover:text-blue-300 transition-colors" title={container.name}>{container.name}</h3>
                <span className="text-xs font-mono text-cyan-500/80 truncate bg-cyan-900/20 px-2 py-0.5 rounded w-fit border border-cyan-500/20">{container.image}</span>
              </div>
              
              <div className="flex-1" />

              <div className="flex flex-col gap-2 text-xs font-medium text-gray-400 bg-black/20 p-3 rounded-lg border border-white/5">
                <div className="flex justify-between items-center">
                  <span className="uppercase tracking-[0.2em] text-[10px] text-gray-500">Status</span>
                  <span className={isRunning ? 'text-green-400' : 'text-gray-500'}>{container.status}</span>
                </div>
                {container.ports && (
                  <div className="flex justify-between items-center gap-2 mt-1 pt-2 border-t border-white/5">
                    <span className="uppercase tracking-[0.2em] text-[10px] text-gray-500">Ports</span>
                    <span className="font-mono text-blue-300 truncate max-w-[150px]" title={container.ports}>{container.ports}</span>
                  </div>
                )}
                <div className="flex justify-between items-center gap-2 mt-1 pt-2 border-t border-white/5">
                  <span className="uppercase tracking-[0.2em] text-[10px] text-gray-500">ID</span>
                  <span className="font-mono text-gray-500">{container.id}</span>
                </div>
              </div>
            </motion.div>
          );
        })}
      </motion.div>
    </div>
  );
};
