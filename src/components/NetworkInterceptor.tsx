import { useState, useEffect, useMemo } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import { motion, AnimatePresence } from 'framer-motion';
import { useToast } from '../store/store';

interface CapturedRequest {
  id: number;
  method: string;
  url: string;
  request_headers: [string, string][];
  request_body: string;
  response_status: number;
  response_headers: [string, string][];
  response_body: string;
  timestamp: number;
  duration_ms: number;
}

export const NetworkInterceptor = () => {
  const [isRunning, setIsRunning] = useState(false);
  const [port, setPort] = useState(8082);
  const [requests, setRequests] = useState<CapturedRequest[]>([]);
  const [selectedReq, setSelectedReq] = useState<CapturedRequest | null>(null);
  
  const [filterMethod, setFilterMethod] = useState('');
  const [filterUrl, setFilterUrl] = useState('');
  const [filterStatus, setFilterStatus] = useState('');

  const { error: toastError, success: toastSuccess } = useToast();

  useEffect(() => {
    let unlisten: (() => void) | undefined;
    
    const init = async () => {
      try {
        const existingReqs = await invoke<CapturedRequest[]>('get_captured_requests');
        setRequests(existingReqs);
        
        unlisten = await listen<CapturedRequest>('proxy-request', (event) => {
          setRequests(prev => [event.payload, ...prev].slice(0, 100));
        });
      } catch (e) {
        toastError('Failed to initialize proxy listener', String(e));
      }
    };
    
    init();
    
    return () => {
      if (unlisten) unlisten();
      invoke('stop_proxy').catch(e => console.warn('Stop Proxy Error on unmount:', e));
    };
  }, []);

  const toggleProxy = async () => {
    try {
      if (isRunning) {
        await invoke('stop_proxy');
        setIsRunning(false);
      } else {
        await invoke('start_proxy', { port });
        setIsRunning(true);
      }
    } catch (e) {
      toastError(isRunning ? 'Failed to stop proxy' : 'Failed to start proxy', String(e));
    }
  };

  const clearLog = async () => {
    try {
      await invoke('clear_captured_requests');
      setRequests([]);
      setSelectedReq(null);
    } catch (e) {
      toastError('Failed to clear logs', String(e));
    }
  };

  const replayRequest = async (req: CapturedRequest) => {
    try {
      const response = await invoke<CapturedRequest>('replay_request', {
        url: req.url,
        method: req.method,
        headers: req.request_headers,
        body: req.request_body ? req.request_body : null
      });
      setRequests(prev => [response, ...prev].slice(0, 100));
      toastSuccess('Request Replayed', `Status ${response.response_status} in ${response.duration_ms}ms`);
    } catch (e) {
      toastError('Failed to replay request', String(e));
    }
  };

  const filteredRequests = useMemo(() => {
    return requests.filter(req => {
      if (filterMethod && req.method !== filterMethod) return false;
      if (filterUrl && !req.url.toLowerCase().includes(filterUrl.toLowerCase())) return false;
      if (filterStatus && req.response_status.toString() !== filterStatus) return false;
      return true;
    });
  }, [requests, filterMethod, filterUrl, filterStatus]);

  const getMethodColor = (method: string) => {
    switch (method) {
      case 'GET': return 'bg-blue-500/20 text-blue-400';
      case 'POST': return 'bg-green-500/20 text-green-400';
      case 'PUT': return 'bg-yellow-500/20 text-yellow-400';
      case 'DELETE': return 'bg-red-500/20 text-red-400';
      default: return 'bg-gray-500/20 text-gray-400';
    }
  };

  const getStatusColor = (status: number) => {
    if (status >= 200 && status < 300) return 'text-green-400';
    if (status >= 300 && status < 400) return 'text-blue-400';
    if (status >= 400 && status < 500) return 'text-yellow-400';
    if (status >= 500) return 'text-red-400';
    return 'text-gray-400';
  };

  const formatBody = (body: string, headers: [string, string][]) => {
    if (!body) return '';
    const contentType = headers.find(h => h[0].toLowerCase() === 'content-type')?.[1] || '';
    if (contentType.includes('application/json')) {
      try {
        return JSON.stringify(JSON.parse(body), null, 2);
      } catch {
        return body;
      }
    }
    return body;
  };

  return (
    <div className="flex h-full w-full bg-[#0a0f18] text-white">
      {/* Left Panel */}
      <div className="w-1/2 flex flex-col border-r border-white/10 z-10">
        <div className="p-4 border-b border-white/10 flex justify-between items-center bg-black/20">
          <div>
            <h2 className="font-bold text-indigo-400 text-lg">HTTP Proxy</h2>
            <div className="flex items-center space-x-2 mt-1">
              <span className="text-xs text-gray-400">Port:</span>
              <input 
                type="number" 
                value={port} 
                onChange={(e) => setPort(Number(e.target.value))}
                disabled={isRunning}
                className="bg-black/40 border border-white/10 text-xs px-2 py-1 rounded w-20 outline-none focus:border-indigo-500"
              />
            </div>
            {isRunning && (
              <p className="text-xs text-gray-400 mt-2">
                Set your browser/curl proxy to 127.0.0.1:{port}
              </p>
            )}
          </div>
          <div className="flex space-x-2">
            <button 
              onClick={clearLog}
              className="px-3 py-1.5 rounded text-xs transition-colors bg-white/5 text-gray-300 hover:bg-white/10"
            >
              Clear
            </button>
            <button 
              onClick={toggleProxy}
              className={`px-4 py-1.5 rounded font-bold text-sm transition-colors ${isRunning ? 'bg-red-500/20 text-red-400 hover:bg-red-500/30' : 'bg-green-500/20 text-green-400 hover:bg-green-500/30'}`}
            >
              {isRunning ? 'Stop Proxy' : 'Start Proxy'}
            </button>
          </div>
        </div>
        
        {/* Filter Bar */}
        <div className="p-2 border-b border-white/5 flex space-x-2 bg-black/10">
          <select 
            value={filterMethod} 
            onChange={e => setFilterMethod(e.target.value)}
            className="bg-black/40 border border-white/10 text-xs px-2 py-1.5 rounded outline-none text-gray-300"
          >
            <option value="">All Methods</option>
            <option value="GET">GET</option>
            <option value="POST">POST</option>
            <option value="PUT">PUT</option>
            <option value="DELETE">DELETE</option>
          </select>
          <input 
            type="text" 
            placeholder="Filter URL..." 
            value={filterUrl}
            onChange={e => setFilterUrl(e.target.value)}
            className="bg-black/40 border border-white/10 text-xs px-2 py-1.5 rounded outline-none text-gray-300 flex-1"
          />
          <input 
            type="text" 
            placeholder="Status" 
            value={filterStatus}
            onChange={e => setFilterStatus(e.target.value)}
            className="bg-black/40 border border-white/10 text-xs px-2 py-1.5 rounded outline-none text-gray-300 w-16"
          />
        </div>
        
        {/* Request List */}
        <div className="flex-1 overflow-y-auto">
          {filteredRequests.map(req => {
            const isSelected = selectedReq?.id === req.id;
            return (
              <div 
                key={req.id} 
                onClick={() => setSelectedReq(req)}
                className={`p-3 border-b border-white/5 cursor-pointer text-sm transition-colors ${isSelected ? 'bg-indigo-500/10 border-l-2 border-l-indigo-500' : 'hover:bg-white/5 border-l-2 border-l-transparent'}`}
              >
                <div className="flex justify-between items-center mb-1.5">
                  <div className="flex items-center space-x-2">
                    <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${getMethodColor(req.method)}`}>
                      {req.method}
                    </span>
                    <span className={`font-mono text-xs font-bold ${getStatusColor(req.response_status)}`}>
                      {req.response_status}
                    </span>
                  </div>
                  <div className="flex items-center space-x-3 text-xs text-gray-500">
                    <span>{req.duration_ms}ms</span>
                    <span>{new Date(req.timestamp).toLocaleTimeString()}</span>
                  </div>
                </div>
                <div className="font-mono text-xs text-gray-300 truncate opacity-80">
                  {req.url}
                </div>
              </div>
            );
          })}
          {filteredRequests.length === 0 && (
            <div className="p-8 text-center text-gray-500 text-sm">
              {requests.length === 0 
                ? "No requests captured yet. Start the proxy and make a request." 
                : "No requests match your filters."}
            </div>
          )}
        </div>
      </div>
      
      {/* Right Panel - Details */}
      <div className="w-1/2 relative bg-[#060910] overflow-hidden">
        <AnimatePresence mode="wait">
          {selectedReq ? (
            <motion.div 
              key={selectedReq.id}
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              transition={{ duration: 0.2 }}
              className="h-full flex flex-col p-4 overflow-y-auto"
            >
              <div className="flex justify-between items-start mb-6">
                <div>
                  <h3 className="font-bold text-gray-200 mb-1">Request Details</h3>
                  <div className="font-mono text-xs text-indigo-300 break-all">
                    {selectedReq.method} {selectedReq.url}
                  </div>
                </div>
                <button
                  onClick={() => replayRequest(selectedReq)}
                  className="px-3 py-1.5 rounded text-xs font-bold transition-colors bg-indigo-500/20 text-indigo-400 hover:bg-indigo-500/30 border border-indigo-500/30"
                >
                  ▶ Replay
                </button>
              </div>

              {/* Request Headers */}
              <div className="mb-6">
                <h4 className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-2">Request Headers</h4>
                <div className="bg-black/50 border border-white/5 rounded-lg p-3 font-mono text-xs text-gray-300 overflow-x-auto">
                  {selectedReq.request_headers.length > 0 ? (
                    <table className="w-full text-left border-collapse">
                      <tbody>
                        {selectedReq.request_headers.map((h, i) => (
                          <tr key={i} className="border-b border-white/5 last:border-0">
                            <td className="py-1 pr-4 text-blue-300 whitespace-nowrap align-top">{h[0]}:</td>
                            <td className="py-1 break-all">{h[1]}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  ) : (
                    <span className="text-gray-500 italic">No headers</span>
                  )}
                </div>
              </div>

              {/* Request Body */}
              {selectedReq.request_body && (
                <div className="mb-6">
                  <h4 className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-2">Request Body</h4>
                  <pre className="bg-black/50 border border-white/5 rounded-lg p-3 font-mono text-xs text-green-300 overflow-x-auto whitespace-pre-wrap">
                    {formatBody(selectedReq.request_body, selectedReq.request_headers)}
                  </pre>
                </div>
              )}

              {/* Response Headers */}
              <div className="mb-6">
                <h4 className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-2 flex items-center space-x-2">
                  <span>Response Headers</span>
                  <span className={`px-1.5 py-0.5 rounded text-[10px] bg-white/5 ${getStatusColor(selectedReq.response_status)}`}>
                    Status: {selectedReq.response_status}
                  </span>
                </h4>
                <div className="bg-black/50 border border-white/5 rounded-lg p-3 font-mono text-xs text-gray-300 overflow-x-auto">
                  {selectedReq.response_headers.length > 0 ? (
                    <table className="w-full text-left border-collapse">
                      <tbody>
                        {selectedReq.response_headers.map((h, i) => (
                          <tr key={i} className="border-b border-white/5 last:border-0">
                            <td className="py-1 pr-4 text-purple-300 whitespace-nowrap align-top">{h[0]}:</td>
                            <td className="py-1 break-all">{h[1]}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  ) : (
                    <span className="text-gray-500 italic">No headers</span>
                  )}
                </div>
              </div>

              {/* Response Body */}
              <div className="mb-4">
                <h4 className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-2">Response Body</h4>
                <pre className="bg-black/50 border border-white/5 rounded-lg p-3 font-mono text-xs text-orange-300 overflow-x-auto whitespace-pre-wrap min-h-[100px]">
                  {selectedReq.response_body ? formatBody(selectedReq.response_body, selectedReq.response_headers) : <span className="text-gray-500 italic">Empty body</span>}
                </pre>
              </div>
            </motion.div>
          ) : (
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="h-full flex items-center justify-center text-gray-500 text-sm"
            >
              Select a request to inspect
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
};
