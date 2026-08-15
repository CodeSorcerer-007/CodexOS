import { useState, useEffect, useMemo, memo } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import { useToast } from '../store/store';
import { RequestTable, type CapturedRequest } from './network/RequestTable';
import { RequestInspector } from './network/RequestInspector';

export const NetworkInterceptor = memo(() => {
  const [isRunning, setIsRunning] = useState(false);
  const [port, setPort] = useState(8082);
  const [acceptInvalidCerts, setAcceptInvalidCerts] = useState(true);
  const [requests, setRequests] = useState<CapturedRequest[]>([]);
  const [selectedReq, setSelectedReq] = useState<CapturedRequest | null>(null);
  const [showWarning, setShowWarning] = useState(true);

  const [filterMethod, setFilterMethod] = useState('');
  const [filterUrl, setFilterUrl] = useState('');
  const [filterStatus, setFilterStatus] = useState('');

  const { error: toastError, success: toastSuccess } = useToast();

  useEffect(() => {
    let unlisten: (() => void) | undefined;

    const init = async () => {
      try {
        const running = await invoke<boolean>('is_proxy_running').catch(() => false);
        setIsRunning(running);

        const existingReqs = await invoke<CapturedRequest[]>('get_captured_requests');
        setRequests(existingReqs);

        unlisten = await listen<CapturedRequest>('proxy-request', (event) => {
          setRequests((prev) => [event.payload, ...prev].slice(0, 100));
        });
      } catch (e) {
        toastError('Failed to initialize proxy listener', e instanceof Error ? e.message : String(e));
      }
    };

    init();

    return () => {
      if (unlisten) unlisten();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const toggleProxy = async () => {
    try {
      if (isRunning) {
        await invoke('stop_proxy');
        setIsRunning(false);
      } else {
        await invoke('start_proxy', { port, acceptInvalidCerts });
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
      toastError('Failed to clear logs', e instanceof Error ? e.message : String(e));
    }
  };

  const replayRequest = async (req: CapturedRequest) => {
    try {
      const response = await invoke<CapturedRequest>('replay_request', {
        url: req.url,
        method: req.method,
        headers: req.request_headers,
        body: req.request_body ? req.request_body : null,
      });
      setRequests((prev) => [response, ...prev].slice(0, 100));
      toastSuccess('Request Replayed', `Status ${response.response_status} in ${response.duration_ms}ms`);
    } catch (e) {
      toastError('Failed to replay request', e instanceof Error ? e.message : String(e));
    }
  };

  const filteredRequests = useMemo(() => {
    return requests.filter((req) => {
      if (filterMethod && req.method !== filterMethod) return false;
      if (filterUrl && !req.url.toLowerCase().includes(filterUrl.toLowerCase())) return false;
      if (filterStatus && req.response_status.toString() !== filterStatus) return false;
      return true;
    });
  }, [requests, filterMethod, filterUrl, filterStatus]);

  const getMethodColor = (method: string) => {
    switch (method) {
      case 'GET':
        return 'bg-blue-500/20 text-blue-400';
      case 'POST':
        return 'bg-green-500/20 text-green-400';
      case 'PUT':
        return 'bg-yellow-500/20 text-yellow-400';
      case 'DELETE':
        return 'bg-red-500/20 text-red-400';
      default:
        return 'bg-gray-500/20 text-gray-400';
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
    const contentType = headers.find((h) => h[0].toLowerCase() === 'content-type')?.[1] || '';
    if (contentType.includes('application/json')) {
      try {
        return JSON.stringify(JSON.parse(body), null, 2);
      } catch {
        return body;
      }
    }
    return body;
  };

  const hasSensitiveData = (req: CapturedRequest) => {
    return (
      req.request_headers.some((h) => ['authorization', 'cookie'].includes(h[0].toLowerCase())) ||
      req.response_headers.some((h) => ['set-cookie'].includes(h[0].toLowerCase()))
    );
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
              <label className="flex items-center space-x-2 text-xs text-gray-400 ml-4 cursor-pointer">
                <input
                  type="checkbox"
                  checked={acceptInvalidCerts}
                  onChange={(e) => setAcceptInvalidCerts(e.target.checked)}
                  disabled={isRunning}
                  className="rounded border-white/10 bg-black/40 text-indigo-500 focus:ring-indigo-500 cursor-pointer"
                />
                <span>Allow Invalid Certs</span>
              </label>
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
              className={`px-4 py-1.5 rounded font-bold text-sm transition-colors ${
                isRunning
                  ? 'bg-red-500/20 text-red-400 hover:bg-red-500/30'
                  : 'bg-green-500/20 text-green-400 hover:bg-green-500/30'
              }`}
            >
              {isRunning ? 'Stop Proxy' : 'Start Proxy'}
            </button>
          </div>
        </div>

        {/* Warning Banner */}
        {showWarning && (
          <div className="bg-yellow-500/10 border-b border-yellow-500/20 p-3 flex justify-between items-start text-xs text-yellow-200/90">
            <div>
              <span className="font-bold">⚠️ Warning:</span> Intercepted requests are stored unencrypted on
              disk. Sensitive data (auth tokens, cookies) may persist. Use &quot;Clear&quot; to purge.
            </div>
            <button onClick={() => setShowWarning(false)} className="text-yellow-400 hover:text-yellow-300 ml-2">
              ✕
            </button>
          </div>
        )}

        {/* Filter Bar */}
        <div className="p-2 border-b border-white/5 flex space-x-2 bg-black/10">
          <select
            value={filterMethod}
            onChange={(e) => setFilterMethod(e.target.value)}
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
            onChange={(e) => setFilterUrl(e.target.value)}
            className="bg-black/40 border border-white/10 text-xs px-2 py-1.5 rounded outline-none text-gray-300 flex-1"
          />
          <input
            type="text"
            placeholder="Status"
            value={filterStatus}
            onChange={(e) => setFilterStatus(e.target.value)}
            className="bg-black/40 border border-white/10 text-xs px-2 py-1.5 rounded outline-none text-gray-300 w-16"
          />
        </div>

        {/* Request List */}
        <RequestTable
          requests={filteredRequests}
          selectedReq={selectedReq}
          onSelect={setSelectedReq}
          getMethodColor={getMethodColor}
          getStatusColor={getStatusColor}
          hasSensitiveData={hasSensitiveData}
        />
      </div>

      {/* Right Panel - Details */}
      <RequestInspector
        selectedReq={selectedReq}
        onReplay={replayRequest}
        formatBody={formatBody}
        getStatusColor={getStatusColor}
      />
    </div>
  );
});
