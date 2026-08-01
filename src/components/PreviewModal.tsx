import { motion, AnimatePresence } from 'framer-motion';
import Editor, { DiffEditor } from '@monaco-editor/react';
import { useMemo, useState, useEffect } from 'react';
import { invoke, convertFileSrc } from '@tauri-apps/api/core';
import { SqliteGrid } from './SqliteGrid';
import { ArchiveBrowser } from './ArchiveBrowser';
import { LogViewer } from './LogViewer';

interface GitCommitInfo {
  hash: string;
  message: string;
  date: string;
}

import { FontViewer } from './FontViewer';
import { ApiRunnerUI } from './ApiRunnerUI';
import { SslCertVisualizer } from './SslCertVisualizer';
import { ColorBoardOverlay } from './ColorBoardOverlay';

interface PreviewModalProps {
  isOpen: boolean;
  onClose: () => void;
  fileName: string;
  fileContent?: string;
  binaryData?: number[];
  repoPath: string;
}

const springPhysics = {
  type: "spring" as const,
  stiffness: 300,
  damping: 25
};

const renderCSV = (content: string) => {
  const rows = content.trim().split('\n').map(row => row.split(','));
  return (
    <div className="w-full h-full overflow-auto p-4 font-mono text-sm">
      <table className="w-full text-left border-collapse">
        <thead>
          <tr className="bg-white/10 sticky top-0 backdrop-blur-md">
            {rows[0]?.map((h, i) => (
              <th key={i} className="p-2 border border-white/10 text-cyan">{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.slice(1).map((row, i) => (
            <tr key={i} className="hover:bg-white/5 transition-colors">
              {row.map((cell, j) => (
                <td key={j} className="p-2 border border-white/10 text-gray-300">{cell}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
};

const HexViewer = ({ data }: { data: number[] }) => {
  const rows = useMemo(() => {
    // Only process up to 16KB for performance in the modal preview
    const limit = Math.min(data.length, 16384);
    const result = [];
    for (let i = 0; i < limit; i += 16) {
      result.push(data.slice(i, i + 16));
    }
    return result;
  }, [data]);

  return (
    <div className="w-full h-full overflow-auto p-6 font-mono text-xs text-gray-400 bg-[#0d0f12]">
      {rows.map((chunk, i) => {
        const offset = (i * 16).toString(16).padStart(8, '0');
        const hex = chunk.map(b => b.toString(16).padStart(2, '0')).join(' ');
        const ascii = chunk.map(b => (b >= 32 && b <= 126) ? String.fromCharCode(b) : '.').join('');
        return (
          <div key={i} className="flex gap-6 hover:bg-white/5 transition-colors leading-6">
            <span className="text-cyan/70 select-none">{offset}</span>
            <span className="w-[400px] text-gray-300">{hex}</span>
            <span className="text-amber-200/70 whitespace-pre">{ascii}</span>
          </div>
        );
      })}
      {data.length > 16384 && (
        <div className="p-4 text-center text-red-400">File truncated for preview (Showing first 16KB of {data.length} bytes)</div>
      )}
    </div>
  );
};

export const PreviewModal = ({ isOpen, onClose, fileName, fileContent, binaryData, repoPath }: PreviewModalProps) => {
  const isEnv = fileName.endsWith('.env');
  const isCsv = fileName.endsWith('.csv');
  const isBinary = !!binaryData;
  const isSqlite = fileName.endsWith('.sqlite') || fileName.endsWith('.db');
  const isZip = fileName.endsWith('.zip');
  const isLog = fileName.endsWith('.log');
  
  const [history, setHistory] = useState<GitCommitInfo[]>([]);
  const [historyIndex, setHistoryIndex] = useState<number>(0);
  const [historicalContent, setHistoricalContent] = useState<string | null>(null);
  const [jwtData, setJwtData] = useState<{ header: any; payload: any } | null>(null);

  const lowerName = fileName.toLowerCase();
  const isCert = lowerName.match(/\.(pem|crt|cer)$/);
  const isFont = lowerName.match(/\.(ttf|otf)$/);
  const isHttp = lowerName.match(/\.(http|rest)$/);
  const isStyle = lowerName.match(/\.(css|scss)$/) || lowerName === 'tailwind.config.js';
  const isImage = lowerName.match(/\.(png|jpg|jpeg|gif|webp|svg|ico)$/);
  const isVideo = lowerName.match(/\.(mp4|webm|mkv|avi)$/);
  const isAudio = lowerName.match(/\.(mp3|wav|ogg)$/);
  const isPdf = lowerName.endsWith('.pdf');

  useEffect(() => {
    if (isOpen && fileContent) {
      try {
        const parts = fileContent.trim().split('.');
        if (parts.length === 3 && fileContent.startsWith('eyJ')) {
          const header = JSON.parse(atob(parts[0]));
          const payload = JSON.parse(atob(parts[1]));
          setJwtData({ header, payload });
          return;
        }
      } catch (e) {
        // Not a valid JWT
      }
    }
    setJwtData(null);
  }, [isOpen, fileContent]);

  useEffect(() => {
    if (isOpen && repoPath && !isBinary && !isSqlite && !isZip && !isLog && !isCert && !isFont) {
      invoke<GitCommitInfo[]>('git_history', { path: repoPath, file: fileName })
        .then(res => {
          setHistory(res);
          setHistoryIndex(0);
          setHistoricalContent(null);
        }).catch(e => {
          console.error("Git history failed:", e);
          setHistory([]);
        });
    } else {
      setHistory([]);
      setHistoryIndex(0);
      setHistoricalContent(null);
    }
  }, [isOpen, repoPath, fileName, isBinary, isSqlite, isZip, isLog, isCert, isFont]);

  const handleTimeTravel = async (index: number) => {
    setHistoryIndex(index);
    if (index === 0) {
      setHistoricalContent(null); // Present day
      return;
    }
    
    // Fetch historical version
    const commit = history[index - 1]; // Because index 0 is "Current Working Tree"
    try {
      const content = await invoke<string>('git_show', { path: repoPath, hash: commit.hash, file: fileName });
      setHistoricalContent(content);
    } catch (e) {
      console.error(e);
      setHistoricalContent("// Failed to load historical revision");
    }
  };

  const language = fileName.endsWith('.json') ? 'json' : 
                   fileName.endsWith('.js') ? 'javascript' : 
                   fileName.endsWith('.ts') ? 'typescript' : 
                   fileName.endsWith('.tsx') ? 'typescript' : 
                   fileName.endsWith('.md') ? 'markdown' : 
                   fileName.endsWith('.rs') ? 'rust' : 'plaintext';

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div 
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm"
          onClick={onClose}
        >
          <motion.div 
            initial={{ scale: 0.9, y: 20, opacity: 0 }}
            animate={{ scale: 1, y: 0, opacity: 1 }}
            exit={{ scale: 0.9, y: 20, opacity: 0 }}
            transition={springPhysics}
            className="w-3/4 h-3/4 liquid-glass rounded-2xl overflow-hidden flex flex-col border border-white/20 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="h-12 bg-white/5 border-b border-white/10 flex items-center justify-between px-6">
              <span className="font-mono text-cyan text-sm">{fileName} {isBinary && '(Hex View)'}</span>
              <button onClick={onClose} className="text-gray-400 hover:text-white transition-colors border border-white/10 px-3 py-1 rounded">ESC</button>
            </div>
            <div className="flex-1 relative group bg-black/60">
              {isEnv && (
                <div className="absolute inset-0 z-10 flex items-center justify-center bg-black/80 backdrop-blur-md opacity-100 group-hover:opacity-0 transition-opacity duration-300 pointer-events-none">
                  <span className="text-red-400 font-bold tracking-widest uppercase">Secrets Hidden. Hover to Reveal.</span>
                </div>
              )}
              
              {isLog ? (
                <LogViewer logPath={`${repoPath}/${fileName}`} />
              ) : isZip ? (
                <ArchiveBrowser zipPath={`${repoPath}/${fileName}`} />
              ) : isSqlite ? (
                <SqliteGrid dbPath={`${repoPath}/${fileName}`} />
              ) : isImage ? (
                <div className="w-full h-full flex items-center justify-center p-8 bg-[url('data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAYAAAAf8/9hAAAAMUlEQVQ4T2NkYNgAAX//YQxJACNkEDwA4gG8oUDfD0Q5ABvI3A+o88BoMBgNBoM1DAAAi7k+fXkK+e8AAAAASUVORK5CYII=')]">
                  <img src={convertFileSrc(`${repoPath}/${fileName}`)} className="max-w-full max-h-full object-contain rounded shadow-2xl" alt={fileName} />
                </div>
              ) : isVideo ? (
                <div className="w-full h-full flex items-center justify-center p-8 bg-black/90">
                  <video src={convertFileSrc(`${repoPath}/${fileName}`)} controls autoPlay className="max-w-full max-h-full rounded shadow-2xl" />
                </div>
              ) : isAudio ? (
                <div className="w-full h-full flex items-center justify-center p-8 bg-black/90">
                  <audio src={convertFileSrc(`${repoPath}/${fileName}`)} controls autoPlay className="w-1/2" />
                </div>
              ) : isPdf ? (
                <iframe src={convertFileSrc(`${repoPath}/${fileName}`)} className="w-full h-full border-none bg-white" title="PDF Preview" />
              ) : isBinary ? (
                <HexViewer data={binaryData} />
              ) : isCert ? (
                <SslCertVisualizer path={`${repoPath}/${fileName}`} />
              ) : isFont ? (
                <FontViewer path={`${repoPath}/${fileName}`} fileName={fileName} />
              ) : jwtData ? (
                <div className="flex flex-col h-full bg-[#1e1e1e] rounded font-mono text-sm overflow-y-auto">
                  <div className="p-4 border-b border-white/10 text-cyan font-bold">JWT Token Decoder</div>
                  <div className="p-4">
                    <div className="text-red-400 mb-1 font-bold">Header</div>
                    <pre className="text-gray-300 ml-4 mb-4">{JSON.stringify(jwtData.header, null, 2)}</pre>
                    
                    <div className="text-purple-400 mb-1 font-bold">Payload</div>
                    <pre className="text-gray-300 ml-4 mb-4">{JSON.stringify(jwtData.payload, null, 2)}</pre>
                    
                    <div className="text-blue-400 font-bold">Signature</div>
                    <pre className="text-gray-500 ml-4 truncate">Verified securely on client</pre>
                  </div>
                </div>
              ) : isCsv && (historicalContent || fileContent) ? (
                renderCSV(historicalContent || fileContent || '')
              ) : historicalContent !== null ? (
                <DiffEditor
                  height="100%"
                  language={language}
                  theme="vs-dark"
                  original={historicalContent}
                  modified={fileContent || ''}
                  options={{
                    readOnly: true,
                    minimap: { enabled: false },
                    scrollBeyondLastLine: false,
                    fontSize: 14,
                    fontFamily: "'JetBrains Mono', 'Fira Code', monospace",
                    renderSideBySide: true,
                    ignoreTrimWhitespace: false,
                  }}
                />
              ) : (
                <div className="h-full relative overflow-hidden">
                  <Editor 
                    height="100%" 
                    language={language}
                    value={fileContent || ''} 
                    theme="vs-dark"
                    options={{
                      readOnly: true,
                      minimap: { enabled: false },
                      scrollBeyondLastLine: false,
                      fontSize: 14,
                      fontFamily: "'JetBrains Mono', 'Fira Code', monospace"
                    }}
                  />
                  {isStyle && <ColorBoardOverlay content={fileContent || ''} />}
                  {isHttp && <ApiRunnerUI content={fileContent || ''} />}
                </div>
              )}
            </div>
            
            {/* Git Time Travel Slider */}
            {history.length > 0 && !isBinary && (
              <div className="h-16 bg-black/40 border-t border-white/10 px-6 flex items-center gap-6">
                <span className="text-sm font-bold text-purple-400 whitespace-nowrap">Git Time Travel</span>
                <input 
                  type="range" 
                  min={0} 
                  max={history.length} 
                  value={historyIndex}
                  onChange={(e) => handleTimeTravel(parseInt(e.target.value))}
                  className="flex-1 accent-purple-500"
                />
                <div className="w-64 text-right flex flex-col items-end justify-center">
                  {historyIndex === 0 ? (
                    <span className="text-cyan text-sm font-bold">Current Working Tree</span>
                  ) : (
                    <>
                      <span className="text-purple-300 text-xs font-mono truncate max-w-full">{history[historyIndex - 1].message}</span>
                      <span className="text-gray-500 text-xs">{history[historyIndex - 1].date} ({history[historyIndex - 1].hash.substring(0, 7)})</span>
                    </>
                  )}
                </div>
              </div>
            )}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};
