import { useState, useMemo } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { open } from '@tauri-apps/plugin-dialog';
import { Database, Table, Columns, Play, Search, AlertCircle, ChevronLeft, ChevronRight, Download, Clock, ShieldCheck, FolderOpen } from 'lucide-react';
import { useToast } from '../store/store';

type DbEngine = 'sqlite' | 'postgres' | 'mysql';

export const DatabaseStudio = () => {
  const [engine, setEngine] = useState<DbEngine>('sqlite');
  const [dbPath, setDbPath] = useState('');
  const [tables, setTables] = useState<string[]>([]);
  const [tableSearch, setTableSearch] = useState('');
  const [selectedTable, setSelectedTable] = useState<string | null>(null);
  
  // Schema view
  const [schema, setSchema] = useState<{name: string, type: string, pk: boolean}[]>([]);
  
  // Data view
  const [columns, setColumns] = useState<string[]>([]);
  const [rows, setRows] = useState<string[][]>([]);
  
  // Query view
  const [customQuery, setCustomQuery] = useState('');
  const [queryError, setQueryError] = useState<string | null>(null);
  const [queryDurationMs, setQueryDurationMs] = useState<number | null>(null);
  
  // Pagination
  const [page, setPage] = useState(0);
  const rowsPerPage = 50;

  const { error: toastError, success: toastSuccess } = useToast();

  const handleBrowseSqlite = async () => {
    try {
      const selected = await open({
        multiple: false,
        directory: false,
        filters: [
          { name: 'SQLite Database', extensions: ['db', 'sqlite', 'sqlite3', 'db3'] },
          { name: 'All Files', extensions: ['*'] }
        ]
      });
      if (selected && typeof selected === 'string') {
        setDbPath(selected);
        connectDb(selected);
      }
    } catch (e: unknown) {
      console.warn("File picker failed:", e);
    }
  };

  const filteredTables = useMemo(() => {
    if (!tableSearch.trim()) return tables;
    const term = tableSearch.toLowerCase();
    return tables.filter(t => t.toLowerCase().includes(term));
  }, [tables, tableSearch]);

  const connectDb = async (path: string) => {
    try {
      if (engine === 'sqlite') {
        const res = await invoke<{ columns: string[]; rows: string[][] }>('query_sqlite', { 
          path, 
          query: "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name ASC;" 
        });
        setTables(res.rows.map((r: string[]) => r[0]));
      } else {
        // Postgres or MySQL
        const query = engine === 'postgres'
          ? "SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' ORDER BY table_name ASC;"
          : "SELECT table_name FROM information_schema.tables WHERE table_schema = DATABASE() ORDER BY table_name ASC;";
        const res = await invoke<Record<string, unknown>[]>('query_database', {
          url: path,
          query,
        });
        setTables(res.map(r => String(Object.values(r)[0])));
      }
      setDbPath(path);
      setQueryError(null);
      toastSuccess('Connected', `Database connected successfully via ${engine.toUpperCase()}`);
    } catch (e: unknown) {
      toastError(`Failed to connect to ${engine.toUpperCase()}`, String(e));
    }
  };

  const loadTableData = async (table: string, pageNum: number) => {
    try {
      const startTime = performance.now();
      const offset = pageNum * rowsPerPage;

      if (engine === 'sqlite') {
        // Safe identifier quoting to prevent injection via crafted table names
        const escapedForPragma = table.replace(/'/g, "''");
        const escapedForSelect = table.replace(/"/g, '""');

        // Load Schema
        const schemaRes = await invoke<{ columns: string[]; rows: string[][] }>('query_sqlite', { 
          path: dbPath, 
          query: `PRAGMA table_info('${escapedForPragma}');` 
        });
        setSchema(schemaRes.rows.map((r: string[]) => ({
          name: r[1],
          type: r[2],
          pk: r[5] === '1'
        })));
        
        // Load Data
        const dataRes = await invoke<{ columns: string[]; rows: string[][] }>('query_sqlite', { 
          path: dbPath, 
          query: `SELECT * FROM "${escapedForSelect}" LIMIT ${rowsPerPage} OFFSET ${offset};` 
        });
        
        setColumns(dataRes.columns);
        setRows(dataRes.rows);
      } else {
        const escapedTable = table.replace(/"/g, '""');
        const dataRes = await invoke<Record<string, unknown>[]>('query_database', {
          url: dbPath,
          query: `SELECT * FROM "${escapedTable}" LIMIT ${rowsPerPage} OFFSET ${offset};`,
        });

        if (dataRes.length > 0) {
          const cols = Object.keys(dataRes[0]);
          const rowData = dataRes.map(row => cols.map(c => row[c] === null ? 'NULL' : String(row[c])));
          setColumns(cols);
          setRows(rowData);
          setSchema(cols.map(c => ({ name: c, type: typeof dataRes[0][c], pk: false })));
        } else {
          setColumns([]);
          setRows([]);
        }
      }

      const elapsed = Math.round(performance.now() - startTime);
      setQueryDurationMs(elapsed);
      setSelectedTable(table);
      setPage(pageNum);
      setQueryError(null);
    } catch (e: unknown) {
      toastError(`Failed to load table ${table}`, String(e));
    }
  };

  const runCustomQuery = async () => {
    if (!customQuery.trim()) return;
    try {
      const startTime = performance.now();

      if (engine === 'sqlite') {
        const dataRes = await invoke<{ columns: string[]; rows: string[][] }>('query_sqlite', { 
          path: dbPath, 
          query: customQuery 
        });
        setColumns(dataRes.columns);
        setRows(dataRes.rows);
      } else {
        const dataRes = await invoke<Record<string, unknown>[]>('query_database', {
          url: dbPath,
          query: customQuery,
        });
        if (dataRes.length > 0) {
          const cols = Object.keys(dataRes[0]);
          const rowData = dataRes.map(row => cols.map(c => row[c] === null ? 'NULL' : String(row[c])));
          setColumns(cols);
          setRows(rowData);
        } else {
          setColumns([]);
          setRows([]);
        }
      }

      const elapsed = Math.round(performance.now() - startTime);
      setQueryDurationMs(elapsed);
      setQueryError(null);
    } catch (e: unknown) {
      const msg = String(e);
      setQueryError(msg);
      toastError("Query Execution Failed", msg);
    }
  };

  const exportCSV = () => {
    if (columns.length === 0 || rows.length === 0) return;
    const headerLine = columns.map(c => `"${c.replace(/"/g, '""')}"`).join(',');
    const rowLines = rows.map(r => r.map(cell => `"${(cell || '').replace(/"/g, '""')}"`).join(','));
    const csvContent = [headerLine, ...rowLines].join('\n');
    
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `${selectedTable || 'query_result'}_${Date.now()}.csv`;
    link.click();
    URL.revokeObjectURL(url);
    toastSuccess('Export Complete', 'Exported query results as CSV');
  };

  const exportJSON = () => {
    if (columns.length === 0 || rows.length === 0) return;
    const objects = rows.map(row => {
      const obj: Record<string, string> = {};
      columns.forEach((col, idx) => {
        obj[col] = row[idx];
      });
      return obj;
    });
    
    const jsonContent = JSON.stringify(objects, null, 2);
    const blob = new Blob([jsonContent], { type: 'application/json;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `${selectedTable || 'query_result'}_${Date.now()}.json`;
    link.click();
    URL.revokeObjectURL(url);
    toastSuccess('Export Complete', 'Exported query results as JSON');
  };

  return (
    <div className="flex h-full w-full bg-[#0a0f18] text-white">
      
      {/* Sidebar - Tables List */}
      <div className="w-64 border-r border-white/10 bg-black/40 flex flex-col">
        <div className="p-4 border-b border-white/10 flex flex-col gap-3">
          <div className="flex items-center justify-between">
            <h2 className="font-bold flex items-center gap-2 text-indigo-400">
              <Database size={18} /> DB Studio
            </h2>
            <select
              value={engine}
              onChange={e => setEngine(e.target.value as DbEngine)}
              className="bg-white/10 text-xs px-2 py-1 rounded text-indigo-300 font-mono outline-none border border-white/10 focus:border-indigo-500"
            >
              <option value="sqlite">SQLite</option>
              <option value="postgres">PostgreSQL</option>
              <option value="mysql">MySQL</option>
            </select>
          </div>

          <input 
            type="text" 
            placeholder={engine === 'sqlite' ? 'SQLite file path...' : `${engine}://user:pass@host/db`}
            value={dbPath}
            onChange={e => setDbPath(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && connectDb(dbPath)}
            className="w-full bg-black/50 border border-white/10 p-2 rounded text-xs outline-none focus:border-indigo-500 font-mono"
          />

          <div className="flex gap-2">
            <button 
              onClick={() => connectDb(dbPath)}
              className="flex-1 bg-indigo-600 hover:bg-indigo-500 py-1.5 rounded text-xs font-bold transition-colors shadow-sm"
            >
              Connect
            </button>
            {engine === 'sqlite' && (
              <button
                onClick={handleBrowseSqlite}
                className="px-3 bg-white/10 hover:bg-white/20 text-indigo-300 py-1.5 rounded text-xs font-bold transition-colors flex items-center gap-1 border border-white/10"
                title="Browse SQLite File"
              >
                <FolderOpen size={13} />
                Browse
              </button>
            )}
          </div>
        </div>
        
        <div className="p-2 border-b border-white/5">
          <div className="relative">
            <Search size={13} className="absolute left-2.5 top-2 text-gray-500" />
            <input
              type="text"
              placeholder="Search tables..."
              value={tableSearch}
              onChange={e => setTableSearch(e.target.value)}
              className="w-full bg-black/30 border border-white/10 pl-8 pr-2 py-1 rounded text-xs outline-none focus:border-indigo-500 text-gray-300"
            />
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-2">
          {filteredTables.length > 0 && (
            <div className="text-[11px] font-bold text-gray-500 uppercase tracking-widest px-2 mb-2 mt-1">
              Tables ({filteredTables.length})
            </div>
          )}
          {filteredTables.map(t => (
            <button 
              key={t}
              onClick={() => loadTableData(t, 0)}
              className={`w-full text-left px-3 py-2 rounded text-sm flex items-center gap-2 transition-colors truncate
                ${selectedTable === t ? 'bg-indigo-500/20 text-indigo-300 font-medium' : 'text-gray-400 hover:bg-white/5 hover:text-gray-200'}
              `}
            >
              <Table size={14} className="shrink-0" /> <span className="truncate">{t}</span>
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
              <div className="flex items-center gap-2">
                <span className="text-xs font-bold text-gray-500 uppercase tracking-widest">SQL Editor</span>
                <span className="flex items-center gap-1 text-[11px] text-green-400/80 bg-green-950/40 px-2 py-0.5 rounded border border-green-800/40 font-mono">
                  <ShieldCheck size={11} /> {engine.toUpperCase()}
                </span>
              </div>
              <button 
                onClick={runCustomQuery}
                className="flex items-center gap-1 bg-green-600/20 hover:bg-green-600/40 text-green-400 px-3 py-1 rounded text-xs font-bold transition-colors border border-green-500/20"
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
              <div className="mt-2 text-xs text-red-400 bg-red-400/10 p-2 rounded flex items-start gap-2 border border-red-500/20">
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
                  <div className="flex items-center gap-2 min-w-0">
                    {col.pk && <span className="text-yellow-500 text-xs shrink-0" title="Primary Key">🔑</span>}
                    <span className="font-mono text-sm text-gray-300 truncate">{col.name}</span>
                  </div>
                  <span className="text-xs text-indigo-400 bg-indigo-400/10 px-1.5 rounded font-mono shrink-0">{col.type}</span>
                </div>
              )) : (
                <div className="text-gray-600 text-xs italic">Select a table to view its schema.</div>
              )}
            </div>
          </div>
        </div>

        {/* Bottom Pane - Data Grid */}
        <div className="flex-1 flex flex-col p-4 overflow-hidden">
          <div className="flex flex-wrap justify-between items-center mb-3 gap-2">
            <div className="flex items-center gap-3">
              <span className="text-xs font-bold text-gray-500 uppercase tracking-widest flex items-center gap-2">
                <Search size={14} /> Results ({rows.length} rows)
              </span>
              {queryDurationMs !== null && (
                <span className="text-xs text-gray-400 flex items-center gap-1 font-mono bg-white/5 px-2 py-0.5 rounded">
                  <Clock size={11} className="text-cyan-400" /> {queryDurationMs}ms
                </span>
              )}
            </div>

            <div className="flex items-center gap-3">
              {rows.length > 0 && (
                <div className="flex items-center gap-1">
                  <button
                    onClick={exportCSV}
                    className="flex items-center gap-1 text-xs bg-white/10 hover:bg-white/20 text-gray-200 px-2.5 py-1 rounded transition-colors font-medium"
                    title="Export as CSV"
                  >
                    <Download size={12} /> CSV
                  </button>
                  <button
                    onClick={exportJSON}
                    className="flex items-center gap-1 text-xs bg-white/10 hover:bg-white/20 text-gray-200 px-2.5 py-1 rounded transition-colors font-medium"
                    title="Export as JSON"
                  >
                    <Download size={12} /> JSON
                  </button>
                </div>
              )}
              
              {/* Pagination Controls */}
              {selectedTable && (
                <div className="flex items-center gap-4 bg-black/40 rounded px-2 py-0.5 border border-white/10">
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
