import { useState } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { Play, Plus, Trash2, Code2, Clock, Copy, Sparkles } from 'lucide-react';
import { useToast } from '../store/store';

interface Header {
  key: string;
  value: string;
}

interface HttpResponse {
  response_status: number;
  response_headers: [string, string][];
  response_body: string;
  duration_ms: number;
}

export const HttpRequestBuilder = () => {
  const [method, setMethod] = useState('GET');
  const [url, setUrl] = useState('https://api.github.com/zen');
  const [headers, setHeaders] = useState<Header[]>([{ key: 'Accept', value: '*/*' }]);
  const [body, setBody] = useState('');
  
  const [response, setResponse] = useState<HttpResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const { error: toastError, success: toastSuccess } = useToast();

  const handleSend = async () => {
    const trimmedUrl = url.trim();
    if (!trimmedUrl) {
      toastError('Missing URL', 'Please enter a target request URL.');
      return;
    }
    if (!trimmedUrl.startsWith('http://') && !trimmedUrl.startsWith('https://')) {
      toastError('Invalid Protocol', 'URL must start with http:// or https://');
      return;
    }

    setLoading(true);
    setResponse(null);
    try {
      const headerTuples = headers.filter(h => h.key.trim() !== '').map(h => [h.key.trim(), h.value]);
      const res = await invoke<HttpResponse>('replay_request', {
        url: trimmedUrl,
        method,
        headers: headerTuples,
        body: body || null
      });
      setResponse(res);
      toastSuccess('Request Sent', `Received ${res.response_status} in ${res.duration_ms}ms`);
    } catch (e: unknown) {
      toastError('Request Failed', e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  };

  const addHeader = () => setHeaders([...headers, { key: '', value: '' }]);
  const updateHeader = (index: number, key: string, value: string) => {
    const newHeaders = [...headers];
    newHeaders[index] = { key, value };
    setHeaders(newHeaders);
  };
  const removeHeader = (index: number) => {
    setHeaders(headers.filter((_, i) => i !== index));
  };

  const handlePrettifyBody = () => {
    if (!body.trim()) return;
    try {
      const parsed = JSON.parse(body);
      setBody(JSON.stringify(parsed, null, 2));
      toastSuccess('Formatted JSON');
    } catch {
      toastError('Format Error', 'Body contains invalid JSON syntax.');
    }
  };

  const handleCopyResponseBody = () => {
    if (!response?.response_body) return;
    navigator.clipboard.writeText(response.response_body);
    toastSuccess('Copied to Clipboard', 'Response body copied.');
  };

  return (
    <div className="flex h-full bg-[#0a0f18] text-white overflow-hidden">
      <div className="flex-1 flex flex-col min-w-[400px] border-r border-white/10">
        <div className="p-4 border-b border-white/10 flex items-center gap-2">
          <select
            value={method}
            onChange={e => setMethod(e.target.value)}
            className="bg-black/50 border border-white/10 rounded px-3 py-2 text-sm font-bold text-indigo-400 outline-none focus:border-indigo-500"
          >
            {['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS', 'HEAD'].map(m => (
              <option key={m} value={m}>{m}</option>
            ))}
          </select>
          <input
            type="text"
            value={url}
            onChange={e => setUrl(e.target.value)}
            placeholder="https://api.example.com/v1/users"
            className="flex-1 bg-black/50 border border-white/10 rounded px-3 py-2 text-sm outline-none focus:border-indigo-500 font-mono"
            onKeyDown={e => e.key === 'Enter' && handleSend()}
          />
          <button
            onClick={handleSend}
            disabled={loading || !url}
            className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white px-4 py-2 rounded font-medium transition-colors"
          >
            {loading ? <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white" /> : <Play className="w-4 h-4" />}
            Send
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-4 space-y-6">
          <div>
            <div className="flex items-center justify-between mb-2">
              <h3 className="font-bold text-gray-300 text-sm">Headers</h3>
              <button onClick={addHeader} className="text-xs text-indigo-400 hover:text-indigo-300 flex items-center gap-1">
                <Plus className="w-3 h-3" /> Add Header
              </button>
            </div>
            <div className="space-y-2">
              {headers.map((h, i) => (
                <div key={i} className="flex gap-2">
                  <input
                    type="text"
                    placeholder="Key"
                    value={h.key}
                    onChange={e => updateHeader(i, e.target.value, h.value)}
                    className="flex-1 bg-black/30 border border-white/10 rounded px-2 py-1.5 text-xs font-mono outline-none focus:border-indigo-500"
                  />
                  <input
                    type="text"
                    placeholder="Value"
                    value={h.value}
                    onChange={e => updateHeader(i, h.key, e.target.value)}
                    className="flex-1 bg-black/30 border border-white/10 rounded px-2 py-1.5 text-xs font-mono outline-none focus:border-indigo-500"
                  />
                  <button onClick={() => removeHeader(i)} className="p-1.5 text-red-400 hover:bg-red-500/20 rounded">
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              ))}
              {headers.length === 0 && <div className="text-xs text-gray-500 italic">No headers configured.</div>}
            </div>
          </div>

          <div>
            <div className="flex items-center justify-between mb-2">
              <h3 className="font-bold text-gray-300 text-sm">Request Body</h3>
              <button onClick={handlePrettifyBody} className="text-xs text-indigo-400 hover:text-indigo-300 flex items-center gap-1">
                <Sparkles className="w-3 h-3" /> Prettify JSON
              </button>
            </div>
            <textarea
              value={body}
              onChange={e => setBody(e.target.value)}
              placeholder={'{\n  "key": "value"\n}'}
              className="w-full h-48 bg-black/30 border border-white/10 rounded p-3 text-sm font-mono outline-none focus:border-indigo-500 resize-none"
            />
          </div>
        </div>
      </div>

      <div className="flex-1 flex flex-col min-w-[400px] bg-black/20">
        <div className="p-4 border-b border-white/10 flex items-center justify-between bg-black/40">
          <h3 className="font-bold text-gray-300 flex items-center gap-2">
            <Code2 className="w-4 h-4" /> Response
          </h3>
          {response && (
            <div className="flex items-center gap-4 text-xs font-mono">
              <span className={`px-2 py-0.5 rounded font-bold ${response.response_status < 400 ? 'bg-green-500/20 text-green-400' : 'bg-red-500/20 text-red-400'}`}>
                {response.response_status}
              </span>
              <span className="flex items-center gap-1 text-gray-400">
                <Clock className="w-3 h-3" /> {response.duration_ms} ms
              </span>
              <button 
                onClick={handleCopyResponseBody} 
                className="p-1 hover:bg-white/10 rounded text-gray-400 hover:text-white transition-colors"
                title="Copy response body"
              >
                <Copy className="w-3.5 h-3.5" />
              </button>
            </div>
          )}
        </div>
        
        <div className="flex-1 overflow-y-auto p-4">
          {!response ? (
            <div className="h-full flex items-center justify-center text-gray-500 text-sm">
              Enter a URL and click Send to get a response
            </div>
          ) : (
            <div className="space-y-4">
              {response.response_headers.length > 0 && (
                <div>
                  <h4 className="text-xs font-bold text-gray-500 mb-2 uppercase tracking-wider">Response Headers</h4>
                  <div className="bg-black/50 border border-white/10 rounded p-3 text-xs font-mono text-gray-300 space-y-1">
                    {response.response_headers.map((h, i) => (
                      <div key={i}><span className="text-indigo-400 font-bold">{h[0]}:</span> {h[1]}</div>
                    ))}
                  </div>
                </div>
              )}
              
              <div>
                <h4 className="text-xs font-bold text-gray-500 mb-2 uppercase tracking-wider">Response Body</h4>
                <pre className="bg-black/50 border border-white/10 rounded p-4 text-xs font-mono text-gray-300 overflow-x-auto whitespace-pre-wrap">
                  {response.response_body || <span className="text-gray-500 italic">Empty response body</span>}
                </pre>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
