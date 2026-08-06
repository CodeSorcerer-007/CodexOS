import { useState, useEffect, useCallback } from 'react';
import { invoke } from '@tauri-apps/api/core';

interface SqliteResult {
  columns: string[];
  rows: string[][];
}

interface SqliteGridProps {
  dbPath: string;
}

export const SqliteGrid = ({ dbPath }: SqliteGridProps) => {
  const [query, setQuery] = useState("SELECT name FROM sqlite_master WHERE type='table';");
  const [result, setResult] = useState<SqliteResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const executeQuery = useCallback(async (q: string = query) => {
    setLoading(true);
    setError(null);
    try {
      const result = await invoke<SqliteResult>('query_sqlite', { path: dbPath, query: q });
      setResult(result);
    } catch (e: any) {
      setError(e.toString());
      setResult(null);
    } finally {
      setLoading(false);
    }
  }, [dbPath, query]);

  useEffect(() => {
    executeQuery();
  }, [executeQuery]); // Auto run default query on open

  return (
    <div className="h-full flex flex-col bg-black/40 text-gray-200">
      <div className="p-4 border-b border-white/10 flex flex-col gap-3">
        <div className="flex items-center justify-between">
          <span className="text-sm font-bold text-cyan">SQLite DB Browser</span>
          <span className="text-xs text-gray-500 font-mono truncate max-w-md">{dbPath}</span>
        </div>
        <div className="flex gap-2">
          <input 
            type="text" 
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && executeQuery()}
            className="flex-1 bg-black/50 border border-white/10 rounded px-4 py-2 text-sm font-mono focus:outline-none focus:border-cyan transition-colors"
            placeholder="SELECT * FROM users LIMIT 50;"
          />
          <button 
            onClick={() => executeQuery()}
            className="px-6 py-2 bg-cyan/20 hover:bg-cyan/30 text-cyan rounded border border-cyan/30 transition-colors font-bold text-sm"
          >
            {loading ? 'Running...' : 'Run'}
          </button>
        </div>
        {error && <div className="text-red-400 text-xs font-mono">{error}</div>}
      </div>

      <div className="flex-1 overflow-auto p-4">
        {result ? (
          result.rows.length === 0 ? (
            <div className="text-gray-500 text-sm italic text-center mt-10">0 rows returned</div>
          ) : (
            <table className="w-full text-left text-sm whitespace-nowrap">
              <thead className="bg-white/5 text-cyan sticky top-0">
                <tr>
                  {result.columns.map((col, idx) => (
                    <th key={idx} className="px-4 py-2 border-b border-white/10 font-bold">{col}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {result.rows.map((row, rIdx) => (
                  <tr key={rIdx} className="hover:bg-white/5 border-b border-white/5 transition-colors">
                    {row.map((cell, cIdx) => (
                      <td key={cIdx} className="px-4 py-2 text-gray-300 font-mono border-r border-white/5 last:border-0">{cell}</td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          )
        ) : (
          !loading && !error && <div className="text-gray-500 text-sm text-center mt-10">Run a query to see results.</div>
        )}
      </div>
    </div>
  );
};
