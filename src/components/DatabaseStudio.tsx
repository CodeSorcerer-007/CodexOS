import { useState } from 'react';
import { invoke } from '@tauri-apps/api/core';
import Editor from '@monaco-editor/react';

export const DatabaseStudio = () => {
  const [url, setUrl] = useState('sqlite://test.db');
  const [query, setQuery] = useState('SELECT * FROM sqlite_master;');
  const [results, setResults] = useState<any[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const runQuery = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await invoke<any[]>('query_database', { url, query });
      setResults(res);
    } catch (e: any) {
      setError(e.toString());
      setResults(null);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex flex-col h-full w-full bg-[#0a0f18] text-white p-6 overflow-hidden">
      <div className="flex gap-4 mb-4">
        <input 
          type="text" 
          value={url} 
          onChange={e => setUrl(e.target.value)} 
          placeholder="Database URL (sqlite://, postgres://, mysql://)"
          className="flex-1 bg-black/40 border border-white/10 rounded-lg px-4 py-2 text-sm focus:outline-none focus:border-cyan-500 font-mono"
        />
        <button 
          onClick={runQuery} 
          disabled={loading}
          className="px-6 py-2 bg-cyan-600 hover:bg-cyan-500 disabled:opacity-50 text-white font-bold rounded-lg transition-colors shadow-[0_0_15px_rgba(8,145,178,0.5)]"
        >
          {loading ? 'Running...' : 'Run Query'}
        </button>
      </div>

      <div className="h-64 border border-white/10 rounded-lg overflow-hidden mb-4">
        <Editor 
          height="100%" 
          language="sql" 
          theme="vs-dark" 
          value={query} 
          onChange={(v) => setQuery(v || '')}
          options={{ minimap: { enabled: false }, fontSize: 14 }}
        />
      </div>

      <div className="flex-1 border border-white/10 rounded-lg bg-black/40 overflow-auto p-4 relative">
        {error ? (
          <div className="text-red-400 font-mono text-sm whitespace-pre-wrap">{error}</div>
        ) : results ? (
          results.length === 0 ? (
            <div className="text-gray-500 italic text-center mt-10">Query returned 0 rows.</div>
          ) : (
            <table className="w-full text-left border-collapse text-sm whitespace-nowrap">
              <thead>
                <tr className="bg-white/5">
                  {Object.keys(results[0]).map((key, i) => (
                    <th key={i} className="p-3 border-b border-white/10 text-cyan-400 font-mono">{key}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {results.map((row, i) => (
                  <tr key={i} className="hover:bg-white/5 border-b border-white/5 transition-colors">
                    {Object.values(row).map((val: any, j) => (
                      <td key={j} className="p-3 text-gray-300 font-mono">
                        {val === null ? <span className="text-gray-600 italic">null</span> : 
                         typeof val === 'object' ? JSON.stringify(val) : 
                         String(val)}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          )
        ) : (
          <div className="text-gray-600 italic text-center mt-10">Enter a query and run to see results.</div>
        )}
      </div>
    </div>
  );
};
