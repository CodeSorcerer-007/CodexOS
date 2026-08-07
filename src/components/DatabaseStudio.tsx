import { useState } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { Database, Table, Columns, Play, Search, AlertCircle, ChevronLeft, ChevronRight } from 'lucide-react';
import { useToast } from '../store/store';

export const DatabaseStudio = () => {
  const [dbPath, setDbPath] = useState('');
  const [tables, setTables] = useState<string[]>([]);
  const [selectedTable, setSelectedTable] = useState<string | null>(null);
  
  // Schema view
  const [schema, setSchema] = useState<{name: string, type: string, pk: boolean}[]>([]);
  
  // Data view
  const [columns, setColumns] = useState<string[]>([]);
  const [rows, setRows] = useState<string[][]>([]);
  
  // Query view
  const [customQuery, setCustomQuery] = useState('');
  const [queryError, setQueryError] = useState<string | null>(null);
  
  // Pagination
  const [page, setPage] = useState(0);
  const rowsPerPage = 50;

  const { error } = useToast();

  const connectDb = async (path: string) => {
    try {
      const res = await invoke<any>('query_sqlite', { 
        path, 
        query: "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%';" 
      });
      setTables(res.rows.map((r: string[]) => r[0]));
      setDbPath(path);
      setQueryError(null);
    } catch (e: unknown) {
      error("Failed to connect to SQLite", String(e));
    }
  };

  const loadTableData = async (table: string, pageNum: number) => {
    try {
      // Load Schema
      const schemaRes = await invoke<any>('query_sqlite', { 
        path: dbPath, 
        query: `PRAGMA table_info('${table}');` 
      });
      setSchema(schemaRes.rows.map((r: string[]) => ({
        name: r[1],
        type: r[2],
        pk: r[5] === '1'
      })));
      
      // Load Data
      const offset = pageNum * rowsPerPage;
      const dataRes = await invoke<any>('query_sqlite', { 
        path: dbPath, 
        query: `SELECT * FROM "${table}" LIMIT ${rowsPerPage} OFFSET ${offset};` 
      });
      
      setColumns(dataRes.columns);
      setRows(dataRes.rows);
      setSelectedTable(table);
      setPage(pageNum);
      setQueryError(null);
    } catch (e: unknown) {
      error(`Failed to load table ${table}`, String(e));
    }
  };

  const runCustomQuery = async () => {
    if (!customQuery.trim()) return;
    try {
      const dataRes = await invoke<any>('query_sqlite', { 
        path: dbPath, 
        query: customQuery 
      });
      setColumns(dataRes.columns);
      setRows(dataRes.rows);
      setQueryError(null);
    } catch (e: unknown) {
      setQueryError(String(e));
      error("Query Execution Failed", String(e));
    }
  };

  return (
    <div className="flex h-full w-full bg-[#0a0f18] text-white">
      
      {/* Sidebar - Tables List */}
      <div className="w-64 border-r border-white/10 bg-black/40 flex flex-col">
        <div className="p-4 border-b border-white/10">
          <h2 className="font-bold flex items-center gap-2 text-indigo-400 mb-4">
            <Database size={18} /> DB Studio
          </h2>
          <input 
            type="text" 
            placeholder="SQLite file path..." 
            value={dbPath}
            onChange={e => setDbPath(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && connectDb(dbPath)}
            className="w-full bg-black/50 border border-white/10 p-2 rounded text-xs outline-none focus:border-indigo-500"
          />
          <button 
            onClick={() => connectDb(dbPath)}
            className="w-full mt-2 bg-indigo-600 hover:bg-indigo-500 py-1.5 rounded text-xs font-bold transition-colors"
          >
            Connect
          </button>
        </div>
        
        <div className="flex-1 overflow-y-auto p-2">
          {tables.length > 0 && <div className="text-xs font-bold text-gray-500 uppercase tracking-widest px-2 mb-2 mt-2">Tables</div>}
          {tables.map(t => (
            <button 
              key={t}
              onClick={() => loadTableData(t, 0)}
              className={`w-full text-left px-3 py-2 rounded text-sm flex items-center gap-2 transition-colors
                ${selectedTable === t ? 'bg-indigo-500/20 text-indigo-300' : 'text-gray-400 hover:bg-white/5 hover:text-gray-200'}
              `}
            >
              <Table size={14} /> {t}
            </button>
          ))}
          {dbPath && tables.length === 0 && <div className="text-gray-500 text-xs text-center mt-8">No tables found</div>}
        </div>
      </div>

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col min-w-0">
        
        {/* Top Pane - Query Editor & Schema Info */}
        <div className="h-64 border-b border-white/10 flex">
          {/* Query Editor */}
          <div className="flex-1 flex flex-col p-4 border-r border-white/10">
            <div className="flex justify-between items-center mb-2">
              <span className="text-xs font-bold text-gray-500 uppercase tracking-widest">SQL Editor</span>
              <button 
                onClick={runCustomQuery}
                className="flex items-center gap-1 bg-green-600/20 hover:bg-green-600/40 text-green-400 px-3 py-1 rounded text-xs font-bold transition-colors"
              >
                <Play size={12} /> Run Query
              </button>
            </div>
            <textarea 
              value={customQuery}
              onChange={e => setCustomQuery(e.target.value)}
              placeholder="SELECT * FROM table_name;"
              className="flex-1 bg-black/50 border border-white/10 p-3 rounded font-mono text-sm outline-none focus:border-indigo-500 resize-none"
            />
            {queryError && (
              <div className="mt-2 text-xs text-red-400 bg-red-400/10 p-2 rounded flex items-start gap-2">
                <AlertCircle size={14} className="shrink-0 mt-0.5" />
                <span className="font-mono">{queryError}</span>
              </div>
            )}
          </div>
          
          {/* Schema Viewer */}
          <div className="w-80 p-4 flex flex-col bg-black/20">
            <span className="text-xs font-bold text-gray-500 uppercase tracking-widest mb-4 flex items-center gap-2">
              <Columns size={14} /> Schema: {selectedTable || 'None'}
            </span>
            <div className="flex-1 overflow-y-auto pr-2">
              {schema.length > 0 ? schema.map(col => (
                <div key={col.name} className="flex justify-between items-center py-1.5 border-b border-white/5 last:border-0">
                  <div className="flex items-center gap-2">
                    {col.pk && <span className="text-yellow-500" title="Primary Key">🔑</span>}
                    <span className="font-mono text-sm text-gray-300">{col.name}</span>
                  </div>
                  <span className="text-xs text-indigo-400 bg-indigo-400/10 px-1.5 rounded">{col.type}</span>
                </div>
              )) : (
                <div className="text-gray-600 text-xs italic">Select a table to view its schema.</div>
              )}
            </div>
          </div>
        </div>

        {/* Bottom Pane - Data Grid */}
        <div className="flex-1 flex flex-col p-4 overflow-hidden">
          <div className="flex justify-between items-center mb-4">
            <span className="text-xs font-bold text-gray-500 uppercase tracking-widest flex items-center gap-2">
              <Search size={14} /> Results
            </span>
            
            {/* Pagination Controls */}
            {selectedTable && (
              <div className="flex items-center gap-4 bg-black/40 rounded px-2 border border-white/10">
                <button 
                  disabled={page === 0}
                  onClick={() => loadTableData(selectedTable, page - 1)}
                  className="p-1 hover:text-indigo-400 disabled:opacity-30"
                >
                  <ChevronLeft size={16} />
                </button>
                <span className="text-xs font-mono text-gray-400">Page {page + 1}</span>
                <button 
                  disabled={rows.length < rowsPerPage}
                  onClick={() => loadTableData(selectedTable, page + 1)}
                  className="p-1 hover:text-indigo-400 disabled:opacity-30"
                >
                  <ChevronRight size={16} />
                </button>
              </div>
            )}
          </div>
          
          <div className="flex-1 overflow-auto rounded-lg border border-white/10 bg-black/40">
            <table className="w-full text-left border-collapse">
              <thead className="sticky top-0 bg-[#121826] shadow-sm z-10">
                <tr>
                  {columns.map((col, i) => (
                    <th key={i} className="p-3 text-xs font-bold text-gray-400 border-b border-white/10 whitespace-nowrap bg-[#121826]">
                      {col}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map((row, i) => (
                  <tr key={i} className="hover:bg-white/5 group">
                    {row.map((cell, j) => (
                      <td key={j} className="p-3 text-sm font-mono text-gray-300 border-b border-white/5 truncate max-w-[300px]">
                        {cell === 'NULL' ? <span className="text-gray-600 italic">NULL</span> : cell}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
            {columns.length === 0 && (
              <div className="h-full flex items-center justify-center text-gray-500 italic">
                Run a query or select a table to view data.
              </div>
            )}
          </div>
        </div>
        
      </div>
    </div>
  );
};
