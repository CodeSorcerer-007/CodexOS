import { useState } from 'react';
import { invoke, convertFileSrc } from '@tauri-apps/api/core';

interface DocIndex {
  name: string;
  type: string;
  path: string;
}

export const DevDocsViewer = () => {
  const [docsetPath, setDocsetPath] = useState('');
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<DocIndex[]>([]);
  const [selectedDoc, setSelectedDoc] = useState<string | null>(null);

  const searchDocs = async () => {
    if (!docsetPath || !query) return;
    try {
      const res = await invoke<DocIndex[]>('query_docset', { docsetPath, query });
      setResults(res);
    } catch (e) {
      console.error(e);
      alert(e);
    }
  };

  return (
    <div className="flex h-full w-full bg-[#0a0f18] text-white">
      <div className="w-80 border-r border-white/10 flex flex-col p-4">
        <h2 className="font-bold mb-4 text-cyan-400">Offline DevDocs</h2>
        <input 
          type="text" 
          placeholder="Path to .docset folder"
          value={docsetPath}
          onChange={e => setDocsetPath(e.target.value)}
          className="mb-2 bg-black/40 border border-white/10 rounded px-3 py-2 text-sm focus:border-cyan-500 outline-none"
        />
        <div className="flex gap-2 mb-4">
          <input 
            type="text" 
            placeholder="Search API..."
            value={query}
            onChange={e => setQuery(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && searchDocs()}
            className="flex-1 bg-black/40 border border-white/10 rounded px-3 py-2 text-sm focus:border-cyan-500 outline-none"
          />
          <button 
            onClick={searchDocs}
            className="px-3 py-2 bg-cyan-600 rounded text-sm hover:bg-cyan-500 transition-colors"
          >
            Search
          </button>
        </div>
        <div className="flex-1 overflow-y-auto">
          {results.map((r, i) => (
            <div 
              key={i} 
              onClick={() => setSelectedDoc(docsetPath + '/Contents/Resources/Documents/' + r.path)}
              className="p-2 hover:bg-white/5 cursor-pointer text-sm truncate rounded flex justify-between items-center group"
            >
              <span>{r.name}</span>
              <span className="text-[10px] bg-white/10 text-gray-400 px-1 rounded opacity-0 group-hover:opacity-100">{r.type}</span>
            </div>
          ))}
        </div>
      </div>
      <div className="flex-1 bg-white relative">
        {selectedDoc ? (
          <iframe 
            src={convertFileSrc(selectedDoc)} 
            className="w-full h-full border-none"
            title="Doc Viewer"
          />
        ) : (
          <div className="absolute inset-0 flex items-center justify-center text-gray-500 bg-[#0a0f18]">
            Select an API reference to read
          </div>
        )}
      </div>
    </div>
  );
};
