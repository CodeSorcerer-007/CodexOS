import { useState } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { useToast } from '../store/store';

export const ApiRunnerUI = ({ content }: { content: string }) => {
  const [response, setResponse] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const { error: toastError } = useToast();

  const lines = content.split('\n').map(l => l.trim()).filter(l => l && !l.startsWith('#'));
  let method = 'GET';
  let url = '';
  let body: string | undefined = undefined;

  if (lines.length > 0) {
    const parts = lines[0].split(' ');
    if (parts.length > 1) {
      method = parts[0];
      url = parts[1];
    } else {
      url = parts[0];
    }
  }

  // Very basic parser for REST client format, just extracts the JSON body
  const bodyIndex = lines.findIndex(l => l.startsWith('{') || l.startsWith('['));
  if (bodyIndex !== -1) {
    body = lines.slice(bodyIndex).join('\n');
  }

  const handleSend = async () => {
    setLoading(true);
    try {
      const res = await invoke<string>('execute_http_request', { url, method, body });
      setResponse(res);
    } catch (e: any) {
      setResponse(`Error: ${e}`);
      toastError('HTTP Request Failed', String(e));
    }
    setLoading(false);
  };

  if (!url) return null;

  return (
    <div className="absolute right-0 top-0 bottom-0 w-1/3 min-w-[350px] bg-[#0f0f0f]/95 backdrop-blur-2xl border-l border-white/10 flex flex-col liquid-glass shadow-2xl z-20">
      <div className="p-4 border-b border-white/10 bg-black/50 flex justify-between items-center">
        <h3 className="text-gray-300 font-bold text-sm flex items-center gap-2">
          <span>🚀</span> API Client
        </h3>
        <button 
          onClick={handleSend}
          disabled={loading}
          className="px-4 py-1.5 bg-green-500/20 text-green-400 font-bold rounded shadow-[0_0_10px_rgba(34,197,94,0.2)] hover:bg-green-500/30 transition-colors disabled:opacity-50"
        >
          {loading ? 'Sending...' : 'Send Request'}
        </button>
      </div>
      
      <div className="p-4 border-b border-white/10 bg-black/30">
        <div className="flex gap-2 text-sm font-mono text-gray-300">
          <span className="font-bold text-purple-400">{method}</span>
          <span className="truncate">{url}</span>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-4 relative">
        {!response && !loading && (
          <div className="absolute inset-0 flex items-center justify-center text-gray-600 font-mono text-sm">
            Hit 'Send Request' to execute
          </div>
        )}
        {response && (
          <pre className="text-xs font-mono text-gray-300 whitespace-pre-wrap break-all">
            {response}
          </pre>
        )}
      </div>
    </div>
  );
};
