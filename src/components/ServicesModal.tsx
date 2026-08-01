import { useState, useEffect, useMemo } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { motion, AnimatePresence } from 'framer-motion';

interface WindowsService {
  name: string;
  display_name: string;
  status: string;
  start_type: string;
}

interface ServicesModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const ServicesModal = ({ isOpen, onClose }: ServicesModalProps) => {
  const [services, setServices] = useState<WindowsService[]>([]);
  const [loading, setLoading] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen) {
      loadServices();
    }
  }, [isOpen]);

  const loadServices = async () => {
    setLoading(true);
    try {
      const result = await invoke<WindowsService[]>('get_services');
      setServices(result);
    } catch (e) {
      console.error("Failed to load services:", e);
    }
    setLoading(false);
  };

  const filteredServices = useMemo(() => {
    const query = searchQuery.toLowerCase();
    return services.filter(s => 
      s.name.toLowerCase().includes(query) || 
      s.display_name.toLowerCase().includes(query)
    ).sort((a, b) => {
      // Sort running services first, then alphabetically
      if (a.status === 'Running' && b.status !== 'Running') return -1;
      if (b.status === 'Running' && a.status !== 'Running') return 1;
      return a.display_name.localeCompare(b.display_name);
    });
  }, [services, searchQuery]);

  const handleAction = async (name: string, action: 'Start' | 'Stop' | 'Restart') => {
    if (!confirm(`Are you sure you want to ${action.toLowerCase()} the service '${name}'?`)) return;
    
    setActionLoading(name);
    try {
      await invoke('manage_service', { name, action });
      await loadServices(); // Refresh list to get new status
    } catch (e) {
      alert(e);
    }
    setActionLoading(null);
  };

  if (!isOpen) return null;

  return (
    <AnimatePresence>
      <motion.div 
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm"
      >
        <motion.div 
          initial={{ scale: 0.9, y: 20 }}
          animate={{ scale: 1, y: 0 }}
          exit={{ scale: 0.9, y: 20 }}
          className="bg-[#0a0a0a] border border-white/10 rounded-2xl w-full max-w-5xl max-h-[85vh] flex flex-col shadow-2xl overflow-hidden liquid-glass"
        >
          {/* Header */}
          <div className="flex flex-col gap-4 p-6 border-b border-white/10 bg-black/40">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-2xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-purple-400 to-pink-400">
                  System Services Manager
                </h2>
                <p className="text-gray-400 font-mono text-sm mt-1">Manage Windows Services directly</p>
              </div>
              <div className="flex items-center gap-4">
                <button 
                  onClick={loadServices}
                  className="text-gray-400 hover:text-white p-2 rounded-lg hover:bg-white/10 transition-colors"
                  title="Refresh"
                >
                  ↻
                </button>
                <button 
                  onClick={onClose}
                  className="text-gray-400 hover:text-white p-2 rounded-lg hover:bg-white/10 transition-colors"
                >
                  ✕
                </button>
              </div>
            </div>
            
            <input 
              type="text"
              placeholder="Search services by name..."
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              className="w-full bg-black/50 border border-white/10 rounded-lg px-4 py-2 text-white placeholder-gray-500 focus:border-purple-500 outline-none font-mono"
            />
          </div>

          {/* Content */}
          <div className="flex-1 overflow-y-auto p-4">
            {loading && services.length === 0 ? (
              <div className="flex items-center justify-center h-40 text-purple-400 animate-pulse">Scanning Windows Services...</div>
            ) : (
              <div className="grid grid-cols-1 gap-2">
                {filteredServices.map(service => {
                  const isRunning = service.status === 'Running';
                  const isProcessing = actionLoading === service.name;
                  
                  return (
                    <div 
                      key={service.name} 
                      className="flex items-center justify-between bg-black/30 border border-white/5 rounded-xl p-4 hover:bg-black/50 hover:border-white/10 transition-all group"
                    >
                      <div className="flex items-center gap-4 flex-1 overflow-hidden">
                        <div className={`w-3 h-3 rounded-full shadow-[0_0_10px_currentColor] flex-shrink-0 ${isRunning ? 'bg-green-500 text-green-500' : 'bg-gray-500 text-gray-500'}`} />
                        <div className="flex flex-col flex-1 min-w-0">
                          <h3 className="font-bold text-white truncate" title={service.display_name}>{service.display_name}</h3>
                          <div className="flex items-center gap-3 text-xs font-mono text-gray-500 truncate">
                            <span>{service.name}</span>
                            <span className="text-gray-700">•</span>
                            <span>{service.start_type}</span>
                          </div>
                        </div>
                      </div>
                      
                      <div className="flex gap-2 opacity-0 group-hover:opacity-100 transition-opacity ml-4">
                        {isProcessing ? (
                          <div className="px-4 py-1.5 text-xs text-purple-400 animate-pulse font-bold">Processing...</div>
                        ) : (
                          <>
                            {!isRunning && (
                              <button 
                                onClick={() => handleAction(service.name, 'Start')}
                                className="px-3 py-1.5 bg-green-500/20 text-green-400 border border-green-500/30 rounded hover:bg-green-500/40 text-xs font-bold transition-colors"
                              >
                                ▶ Start
                              </button>
                            )}
                            {isRunning && (
                              <>
                                <button 
                                  onClick={() => handleAction(service.name, 'Stop')}
                                  className="px-3 py-1.5 bg-red-500/20 text-red-400 border border-red-500/30 rounded hover:bg-red-500/40 text-xs font-bold transition-colors"
                                >
                                  ■ Stop
                                </button>
                                <button 
                                  onClick={() => handleAction(service.name, 'Restart')}
                                  className="px-3 py-1.5 bg-blue-500/20 text-blue-400 border border-blue-500/30 rounded hover:bg-blue-500/40 text-xs font-bold transition-colors"
                                >
                                  ↻ Restart
                                </button>
                              </>
                            )}
                          </>
                        )}
                      </div>
                    </div>
                  );
                })}
                {filteredServices.length === 0 && !loading && (
                  <div className="text-center text-gray-500 py-10">No services found matching your search.</div>
                )}
              </div>
            )}
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
};
