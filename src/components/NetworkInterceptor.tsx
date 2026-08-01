import { useState, useEffect } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';

interface RequestLog {
  id: number;
  time: string;
  raw: string;
}

export const NetworkInterceptor = () => {
  const [isRunning, setIsRunning] = useState(false);
  const [requests, setRequests] = useState<RequestLog[]>([]);
  const [selectedReq, setSelectedReq] = useState<RequestLog | null>(null);

  useEffect(() => {
    let unlisten: (() => void) | undefined;
    
    const initListener = async () => {
      unlisten = await listen<string>('proxy-request', (event) => {
        setRequests(prev => [{
          id: Date.now(),
          time: new Date().toLocaleTimeString(),
          raw: event.payload
        }, ...prev]);
      });
    };
    
    initListener();
    
    return () => {
      if (unlisten) unlisten();
      invoke('stop_proxy').catch(console.error);
    };
  }, []);

  const toggleProxy = async () => {
    try {
      if (isRunning) {
        await invoke('stop_proxy');
        setIsRunning(false);
      } else {
        await invoke('start_proxy');
        setIsRunning(true);
      }
    } catch (e) {
      alert(e);
      setIsRunning(false);
    }
  };

  return (
    <div className="flex h-full w-full bg-[#0a0f18] text-white">
      <div className="w-1/3 border-r border-white/10 flex flex-col">
        <div className="p-4 border-b border-white/10 flex justify-between items-center">
          <div>
            <h2 className="font-bold text-purple-400">Network Interceptor</h2>
            <p className="text-xs text-gray-400">Listening on 127.0.0.1:8080</p>
          </div>
          <button 
            onClick={toggleProxy}
            className={`px-4 py-2 rounded font-bold text-sm transition-colors ${isRunning ? 'bg-red-500/20 text-red-400 hover:bg-red-500/30' : 'bg-green-500/20 text-green-400 hover:bg-green-500/30'}`}
          >
            {isRunning ? 'Stop' : 'Start'}
          </button>
        </div>
        
        <div className="flex-1 overflow-y-auto">
          {requests.map(req => {
            // Very simple parser for the first line
            const firstLine = req.raw.split('\n')[0] || '';
            const isSelected = selectedReq?.id === req.id;
            
            return (
              <div 
                key={req.id} 
                onClick={() => setSelectedReq(req)}
                className={`p-3 border-b border-white/5 cursor-pointer text-sm ${isSelected ? 'bg-purple-500/20 border-purple-500/50' : 'hover:bg-white/5'}`}
              >
                <div className="flex justify-between items-center mb-1">
                  <span className="font-bold font-mono text-purple-300 truncate">{firstLine.split(' ')[0]} {firstLine.split(' ')[1]}</span>
                  <span className="text-xs text-gray-500">{req.time}</span>
                </div>
              </div>
            );
          })}
          {requests.length === 0 && (
            <div className="p-8 text-center text-gray-500 text-sm">
              No requests captured yet. Make a request to localhost:8080.
            </div>
          )}
        </div>
      </div>
      
      <div className="flex-1 p-6 relative overflow-hidden bg-black/40">
        {selectedReq ? (
          <div className="h-full flex flex-col">
            <h3 className="font-bold text-gray-300 mb-4">Raw Request Payload</h3>
            <div className="flex-1 overflow-y-auto bg-black border border-white/10 rounded-lg p-4 font-mono text-xs text-green-400 whitespace-pre-wrap">
              {selectedReq.raw}
            </div>
          </div>
        ) : (
          <div className="h-full flex items-center justify-center text-gray-500">
            Select a request to inspect
          </div>
        )}
      </div>
    </div>
  );
};
