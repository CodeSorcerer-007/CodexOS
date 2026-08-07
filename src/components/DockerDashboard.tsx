import { motion, AnimatePresence } from 'framer-motion';
import { useState, useEffect, useRef, useCallback } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import { useToast } from '../store/store';

interface DockerContainer {
  id: string;
  name: string;
  image: string;
  state: string;
  status: string;
  ports: string;
}

interface DockerImage {
  id: string;
  repository: string;
  tag: string;
  size: string;
}

interface ContainerStats {
  cpu_perc: string;
  mem_usage: string;
  net_io: string;
}

const slideUpItem = {
  hidden: { opacity: 0, y: 20 },
  show: { opacity: 1, y: 0, transition: { type: "spring" as const, stiffness: 300, damping: 25 } }
};

export const DockerDashboard = () => {
  const [activeTab, setActiveTab] = useState<'containers' | 'images'>('containers');
  const [containers, setContainers] = useState<DockerContainer[]>([]);
  const [images, setImages] = useState<DockerImage[]>([]);
  const [loading, setLoading] = useState(true);
  
  const [selectedContainer, setSelectedContainer] = useState<DockerContainer | null>(null);
  const [containerStats, setContainerStats] = useState<ContainerStats | null>(null);
  const [containerEnv, setContainerEnv] = useState<string[]>([]);
  const [logs, setLogs] = useState<string[]>([]);
  const [isStreaming, setIsStreaming] = useState(false);
  const logsEndRef = useRef<HTMLDivElement>(null);
  
  const [pullImageName, setPullImageName] = useState('');
  const [confirmTarget, setConfirmTarget] = useState<{ type: 'container' | 'image'; id: string; name: string } | null>(null);
  const { success: toastSuccess, error: toastError } = useToast();

  const fetchStats = useCallback(async (id: string) => {
    try {
      const stats = await invoke<ContainerStats>('get_container_stats', { containerId: id });
      setContainerStats(stats);
    } catch (e: unknown) {
      setContainerStats(null);
      toastError('Stats Error', e instanceof Error ? e.message : String(e));
    }
  }, [toastError]);
  
  const fetchEnv = useCallback(async (id: string) => {
     try {
        const inspectJson = await invoke<string>('docker_inspect', { containerId: id });
        const inspectObj = JSON.parse(inspectJson);
        const env = inspectObj[0]?.Config?.Env || [];
        setContainerEnv(env);
     } catch (e: unknown) {
        setContainerEnv([]);
        toastError('Env Fetch Error', e instanceof Error ? e.message : String(e));
     }
  }, [toastError]);

  const fetchContainers = useCallback(async () => {
    try {
      const result = await invoke<DockerContainer[]>('get_docker_containers');
      setContainers(result);
      if (selectedContainer) {
        const updated = result.find(c => c.id === selectedContainer.id);
        if (updated) setSelectedContainer(updated);
      }
    } catch (e: unknown) {
      console.error(e);
      toastError('Failed to fetch containers', e instanceof Error ? e.message : String(e));
    }
  }, [selectedContainer, toastError]);

  const fetchImages = useCallback(async () => {
    try {
      const result = await invoke<DockerImage[]>('get_docker_images');
      setImages(result);
    } catch (e: unknown) {
      console.error(e);
      toastError('Failed to fetch images', e instanceof Error ? e.message : String(e));
    }
  }, [toastError]);

  const initialLoad = useCallback(async () => {
    setLoading(true);
    await Promise.all([fetchContainers(), fetchImages()]);
    setLoading(false);
  }, [fetchContainers, fetchImages]);

  useEffect(() => {
    initialLoad();
    const interval = setInterval(() => {
      fetchContainers();
      if (activeTab === 'images') fetchImages();
      
      // Update stats if selected container is running
      if (selectedContainer && selectedContainer.state.toLowerCase() === 'running') {
         fetchStats(selectedContainer.id);
      }
    }, 5000);
    return () => clearInterval(interval);
  }, [activeTab, selectedContainer, initialLoad, fetchContainers, fetchImages, fetchStats]);
  
  useEffect(() => {
     if (selectedContainer) {
        fetchStats(selectedContainer.id);
        fetchEnv(selectedContainer.id);
        setLogs([]);
        setIsStreaming(false);
     }
  }, [selectedContainer, fetchStats, fetchEnv]);

  useEffect(() => {
    logsEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [logs]);

  const handleAction = async (containerId: string, action: string) => {
    try {
      await invoke('docker_action', { containerId, action });
      toastSuccess('Success', `Action '${action}' completed on container ${containerId}`);
      fetchContainers();
    } catch (e: unknown) {
      toastError('Action Failed', e instanceof Error ? e.message : String(e));
    }
  };

  const streamLogs = async (containerId: string) => {
    setIsStreaming(true);
    setLogs([]);
    try {
      await invoke('stream_docker_logs', { containerId, tailLines: 100 });
    } catch (e: unknown) {
      toastError('Logs Error', e instanceof Error ? e.message : String(e));
      setIsStreaming(false);
    }
  };

  useEffect(() => {
    if (selectedContainer && isStreaming) {
      const eventName = `docker-log-${selectedContainer.id}`;
      let unlisten: () => void;
      listen<string>(eventName, (event) => {
        setLogs(prev => [...prev.slice(-99), event.payload]);
      }).then(fn => { unlisten = fn; });
      return () => { if (unlisten) unlisten(); };
    }
  }, [selectedContainer, isStreaming]);

  const handlePullImage = async () => {
    if (!pullImageName) return;
    try {
      toastSuccess('Pulling', `Started pulling ${pullImageName}...`);
      await invoke('docker_pull_image', { image: pullImageName });
      setTimeout(fetchImages, 5000);
    } catch (e: unknown) {
      toastError('Pull Failed', e instanceof Error ? e.message : String(e));
    }
  };

  const handleRemoveImage = async (imageId: string) => {
    try {
      await invoke('docker_remove_image', { imageId });
      toastSuccess('Success', `Removed image ${imageId}`);
      fetchImages();
    } catch (e: unknown) {
      toastError('Remove Failed', e instanceof Error ? e.message : String(e));
    }
  };

  if (loading && containers.length === 0) {
    return <div className="flex-1 flex items-center justify-center animate-pulse text-cyan">Connecting to Docker Engine...</div>;
  }

  return (
    <div className="flex flex-col gap-6 h-full p-2">
      <div className="flex justify-between items-center px-4">
        <h2 className="text-3xl font-extrabold text-transparent bg-clip-text bg-gradient-to-r from-blue-400 to-cyan-300 drop-shadow-[0_0_15px_rgba(59,130,246,0.3)]">
          Docker Engine
        </h2>
        
        <div className="flex gap-2 bg-black/40 p-1 rounded-lg border border-white/10">
           <button 
             onClick={() => setActiveTab('containers')}
             className={`px-4 py-2 rounded-md transition-colors font-bold text-sm ${activeTab === 'containers' ? 'bg-blue-600/50 text-white' : 'text-gray-400 hover:text-white'}`}
           >
             Containers
           </button>
           <button 
             onClick={() => setActiveTab('images')}
             className={`px-4 py-2 rounded-md transition-colors font-bold text-sm ${activeTab === 'images' ? 'bg-blue-600/50 text-white' : 'text-gray-400 hover:text-white'}`}
           >
             Images
           </button>
        </div>
      </div>

      {activeTab === 'containers' && (
        <div className="flex-1 overflow-hidden grid grid-cols-1 lg:grid-cols-3 gap-4">
          
          {/* Left Panel: Container List */}
          <div className="lg:col-span-1 overflow-auto flex flex-col gap-3 pr-2">
            <h3 className="text-xl font-bold text-gray-300 mb-2">Containers</h3>
            <AnimatePresence>
               {containers.map(container => {
                 const isRunning = container.state.toLowerCase() === 'running';
                 const isSelected = selectedContainer?.id === container.id;
                 
                 return (
                   <motion.div 
                     key={container.id}
                     variants={slideUpItem}
                     initial="hidden"
                     animate="show"
                     exit={{ opacity: 0, scale: 0.9 }}
                     onClick={() => setSelectedContainer(container)}
                     className={`
                       relative p-4 premium-card flex flex-col gap-2 cursor-pointer transition-all
                       ${isRunning ? 'border-green-500/30' : 'opacity-70 grayscale hover:grayscale-0 hover:opacity-100'}
                       ${isSelected ? 'ring-2 ring-blue-500 bg-blue-900/20' : 'hover:bg-white/5'}
                     `}
                   >
                     <div className={`absolute top-4 right-4 w-3 h-3 rounded-full ${isRunning ? 'bg-green-500 shadow-[0_0_10px_#22c55e] animate-pulse' : 'bg-gray-500'}`} />
                     
                     <div className="flex flex-col gap-1 pr-6">
                       <span className="font-bold text-lg text-white truncate">{container.name}</span>
                       <span className="text-xs font-mono text-cyan-500/80 truncate">{container.image}</span>
                     </div>
                     
                     {container.ports && (
                       <span className="text-[10px] text-blue-300 truncate mt-1 bg-black/30 p-1 rounded font-mono">{container.ports}</span>
                     )}
                   </motion.div>
                 );
               })}
            </AnimatePresence>
          </div>
          
          {/* Right Panels: Details & Logs */}
          <div className="lg:col-span-2 flex flex-col gap-4 overflow-hidden h-full">
            
            {/* Top Right: Details & Actions */}
            {selectedContainer ? (
               <div className="premium-card p-6 flex flex-col gap-4">
                 <div className="flex justify-between items-start border-b border-white/10 pb-4">
                    <div>
                       <h3 className="text-2xl font-bold text-white flex items-center gap-3">
                          {selectedContainer.name}
                          <span className={`text-xs px-2 py-1 rounded-full ${selectedContainer.state.toLowerCase() === 'running' ? 'bg-green-500/20 text-green-400' : 'bg-gray-500/20 text-gray-400'}`}>
                             {selectedContainer.state}
                          </span>
                       </h3>
                       <p className="text-sm text-gray-400 font-mono mt-1">{selectedContainer.id}</p>
                    </div>
                    
                    <div className="flex gap-2">
                       {selectedContainer.state.toLowerCase() !== 'running' && (
                         <button onClick={() => handleAction(selectedContainer.id, 'start')} className="px-3 py-1.5 bg-green-500/20 text-green-400 border border-green-500/50 rounded hover:bg-green-500/30 text-sm font-bold transition-colors">Start</button>
                       )}
                       {selectedContainer.state.toLowerCase() === 'running' && (
                         <>
                           <button onClick={() => handleAction(selectedContainer.id, 'stop')} className="px-3 py-1.5 bg-amber-500/20 text-amber-400 border border-amber-500/50 rounded hover:bg-amber-500/30 text-sm font-bold transition-colors">Stop</button>
                           <button onClick={() => handleAction(selectedContainer.id, 'restart')} className="px-3 py-1.5 bg-blue-500/20 text-blue-400 border border-blue-500/50 rounded hover:bg-blue-500/30 text-sm font-bold transition-colors">Restart</button>
                         </>
                       )}
                       <button 
                         onClick={() => setConfirmTarget({ type: 'container', id: selectedContainer.id, name: selectedContainer.name })} 
                         className="px-3 py-1.5 bg-red-500/20 text-red-400 border border-red-500/50 rounded hover:bg-red-500/30 text-sm font-bold transition-colors"
                       >
                         Remove
                       </button>
                    </div>
                 </div>
                 
                 <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="flex flex-col gap-2 bg-black/30 p-3 rounded-lg border border-white/5">
                       <span className="text-xs uppercase text-gray-500 font-bold">Image</span>
                       <span className="font-mono text-sm text-cyan-300 truncate">{selectedContainer.image}</span>
                       <span className="text-xs uppercase text-gray-500 font-bold mt-2">Status</span>
                       <span className="text-sm text-gray-300">{selectedContainer.status}</span>
                    </div>
                    
                    {selectedContainer.state.toLowerCase() === 'running' && containerStats && (
                       <div className="flex flex-col gap-2 bg-black/30 p-3 rounded-lg border border-white/5">
                          <span className="text-xs uppercase text-gray-500 font-bold">Live Stats</span>
                          <div className="grid grid-cols-2 gap-2 text-sm">
                             <div><span className="text-gray-500">CPU:</span> <span className="text-blue-300">{containerStats.cpu_perc}</span></div>
                             <div><span className="text-gray-500">MEM:</span> <span className="text-green-300">{containerStats.mem_usage}</span></div>
                             <div className="col-span-2"><span className="text-gray-500">NET IO:</span> <span className="text-purple-300">{containerStats.net_io}</span></div>
                          </div>
                       </div>
                    )}
                 </div>
                 
                 {containerEnv.length > 0 && (
                    <div className="mt-2 h-32 overflow-auto bg-black/30 p-3 rounded-lg border border-white/5">
                       <span className="text-xs uppercase text-gray-500 font-bold mb-2 block">Environment Variables</span>
                       <div className="flex flex-col gap-1">
                          {containerEnv.map((env, idx) => (
                             <div key={idx} className="text-xs font-mono text-gray-400 bg-white/5 px-2 py-1 rounded truncate">{env}</div>
                          ))}
                       </div>
                    </div>
                 )}
               </div>
            ) : (
               <div className="premium-card p-6 flex-1 flex items-center justify-center text-gray-500">
                 Select a container to view details
               </div>
            )}
            
            {/* Bottom Right: Logs */}
            {selectedContainer && (
               <div className="premium-card flex-1 flex flex-col overflow-hidden min-h-[300px]">
                 <div className="p-3 border-b border-white/10 flex justify-between items-center bg-black/20">
                    <span className="font-bold text-gray-300">Container Logs</span>
                    <div className="flex gap-2">
                       <button onClick={() => setLogs([])} className="px-3 py-1 bg-white/5 hover:bg-white/10 text-xs rounded transition-colors text-gray-300">Clear</button>
                       {!isStreaming ? (
                         <button onClick={() => streamLogs(selectedContainer.id)} className="px-3 py-1 bg-blue-500/20 text-blue-400 border border-blue-500/50 hover:bg-blue-500/30 text-xs rounded transition-colors">Stream Logs</button>
                       ) : (
                         <button onClick={() => setIsStreaming(false)} className="px-3 py-1 bg-amber-500/20 text-amber-400 border border-amber-500/50 hover:bg-amber-500/30 text-xs rounded transition-colors">Stop Stream</button>
                       )}
                    </div>
                 </div>
                 
                 <div className="flex-1 overflow-auto bg-black p-4 font-mono text-sm">
                    {logs.length === 0 ? (
                       <div className="text-gray-600 italic">No logs currently available. Click "Stream Logs" to start capturing.</div>
                    ) : (
                       logs.map((log, idx) => (
                          <div key={idx} className={`${log.startsWith('[STDERR]') ? 'text-red-400' : 'text-green-300'} whitespace-pre-wrap break-all mb-1`}>
                             {log}
                          </div>
                       ))
                    )}
                    <div ref={logsEndRef} />
                 </div>
               </div>
            )}
          </div>
        </div>
      )}
      
      {activeTab === 'images' && (
        <div className="flex flex-col gap-4 flex-1 overflow-hidden">
           <div className="premium-card p-4 flex gap-4 items-center">
              <input 
                 type="text" 
                 value={pullImageName}
                 onChange={e => setPullImageName(e.target.value)}
                 placeholder="e.g. nginx:latest"
                 className="flex-1 bg-black/40 border border-white/10 rounded-lg px-4 py-2 text-white outline-none focus:border-blue-500 transition-colors"
              />
              <button onClick={handlePullImage} className="px-6 py-2 bg-blue-600 hover:bg-blue-500 text-white font-bold rounded-lg transition-colors shadow-[0_0_15px_rgba(37,99,235,0.4)]">
                 Pull Image
              </button>
           </div>
           
           <div className="premium-card flex-1 overflow-auto p-4 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 auto-rows-max">
              {images.map(image => (
                 <div key={image.id} className="bg-black/30 border border-white/5 rounded-lg p-4 flex flex-col gap-3 group hover:border-white/20 transition-colors">
                    <div className="flex justify-between items-start">
                       <span className="font-bold text-white truncate mr-2" title={image.repository}>{image.repository}</span>
                       <button onClick={() => setConfirmTarget({ type: 'image', id: image.id, name: `${image.repository}:${image.tag}` })} className="text-gray-500 hover:text-red-400 transition-colors opacity-0 group-hover:opacity-100">
                          <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 6h18"></path><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"></path><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"></path></svg>
                       </button>
                    </div>
                    
                    <div className="flex justify-between items-center text-xs">
                       <span className="bg-blue-900/30 text-blue-300 px-2 py-0.5 rounded font-mono border border-blue-500/20">{image.tag}</span>
                       <span className="text-gray-400 font-mono">{image.size}</span>
                    </div>
                    
                    <div className="text-xs text-gray-500 font-mono mt-2 truncate">ID: {image.id}</div>
                 </div>
              ))}
           </div>
        </div>
      )}

      {confirmTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
          <div className="bg-panel border border-white/10 rounded-xl p-6 max-w-md w-full flex flex-col gap-4 shadow-2xl">
            <h3 className="text-xl font-bold text-white">Confirm Deletion</h3>
            <p className="text-gray-300 text-sm">
              Are you sure you want to remove {confirmTarget.type} <span className="font-mono text-cyan-400 font-bold">{confirmTarget.name}</span>?
            </p>
            <div className="flex justify-end gap-3 mt-2">
              <button
                onClick={() => setConfirmTarget(null)}
                className="px-4 py-2 bg-white/10 hover:bg-white/20 text-white rounded-lg text-sm transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={() => {
                  if (confirmTarget.type === 'container') {
                    handleAction(confirmTarget.id, 'rm');
                  } else {
                    handleRemoveImage(confirmTarget.id);
                  }
                  setConfirmTarget(null);
                }}
                className="px-4 py-2 bg-red-600 hover:bg-red-500 text-white font-bold rounded-lg text-sm transition-colors"
              >
                Remove
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
