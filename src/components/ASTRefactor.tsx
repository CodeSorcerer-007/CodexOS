// @ts-nocheck
import { useState, useEffect, useRef } from 'react';
import * as ParserModule from 'web-tree-sitter';
const Parser = ParserModule.default || ParserModule;
import { invoke } from '@tauri-apps/api/core';
import { Layers, FileCode, CheckCircle, Code } from 'lucide-react';
import { useToast } from '../store/store';

export const ASTRefactor = ({ currentPath }: { currentPath: string | null }) => {
  const [isReady, setIsReady] = useState(false);
  const [parser, setParser] = useState<Parser | null>(null);
  const [code, setCode] = useState('function hello() {\n  var x = 1;\n  console.log(x);\n}');
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const { error } = useToast();

  useEffect(() => {
    const initParser = async () => {
      try {
        await Parser.init({
          locateFile: (scriptName: string) => {
            // Assumes tree-sitter.wasm is in public/
            return `/${scriptName}`;
          }
        });
        const p = new Parser();
        
        // Assumes tree-sitter-javascript.wasm or tsx is in public/
        // We catch the error gracefully if it's missing so the UI doesn't crash completely.
        try {
          const Lang = await Parser.Language.load('/tree-sitter-javascript.wasm');
          p.setLanguage(Lang);
          setParser(p);
          setIsReady(true);
        } catch (langError) {
          console.warn("Could not load tree-sitter language WASM. Ensure it is in the public directory.", langError);
        }
      } catch (e: any) {
        console.error("Failed to init web-tree-sitter:", e);
      }
    };
    initParser();
  }, []);

  const analyzeCode = () => {
    if (!parser) return;
    try {
      const tree = parser.parse(code);
      const rootNode = tree.rootNode;
      const sugs: string[] = [];

      // Simple static analysis via AST traversal
      const walk = (node: Parser.SyntaxNode) => {
        if (node.type === 'variable_declaration') {
          const kind = node.child(0)?.type;
          if (kind === 'var') {
            sugs.push(`Line ${node.startPosition.row + 1}: Use 'let' or 'const' instead of 'var'.`);
          }
        }
        if (node.type === 'function_declaration') {
          const name = node.childForFieldName('name')?.text;
          if (name && name[0] === name[0].toUpperCase()) {
            sugs.push(`Line ${node.startPosition.row + 1}: Function '${name}' should start with a lowercase letter (camelCase).`);
          }
        }
        for (let i = 0; i < node.childCount; i++) {
          const child = node.child(i);
          if (child) walk(child);
        }
      };

      walk(rootNode);
      if (sugs.length === 0) sugs.push("Looks good! No issues found.");
      setSuggestions(sugs);
    } catch (e: any) {
      error("AST Parse Error", String(e));
    }
  };

  const loadFile = async () => {
    if (!currentPath) {
      error("No file selected", "Please open a file from the Vaults tab first.");
      return;
    }
    try {
      const content = await invoke<string>('read_file_text', { path: currentPath });
      setCode(content);
    } catch (e: any) {
      error("Failed to read file", String(e));
    }
  };

  return (
    <div className="flex flex-col h-full w-full bg-[#0a0f18] text-white">
      {/* Header */}
      <div className="flex justify-between items-center px-6 py-4 border-b border-white/10 bg-black/40">
        <div className="flex items-center gap-3">
          <Layers className="text-pink-500" size={24} />
          <h2 className="font-bold text-xl text-pink-400">AST Engine</h2>
          {isReady ? (
            <span className="bg-green-500/20 text-green-400 border border-green-500/30 px-2 py-0.5 rounded text-xs font-bold ml-2 flex items-center gap-1">
              <CheckCircle size={12} /> WASM Ready
            </span>
          ) : (
            <span className="bg-red-500/20 text-red-400 border border-red-500/30 px-2 py-0.5 rounded text-xs font-bold ml-2 flex items-center gap-1">
              WASM Missing (add to public/)
            </span>
          )}
        </div>
        
        <div className="flex items-center gap-4">
          <button 
            onClick={loadFile}
            className="flex items-center gap-2 px-3 py-1.5 bg-white/5 hover:bg-white/10 border border-white/10 rounded text-sm transition-colors"
          >
            <FileCode size={16} /> Load Current File
          </button>
        </div>
      </div>

      <div className="flex-1 flex min-h-0">
        {/* Editor Area */}
        <div className="w-1/2 flex flex-col border-r border-white/10">
          <div className="px-4 py-2 bg-black/60 border-b border-white/5 text-xs font-bold text-gray-500 uppercase tracking-widest flex items-center gap-2">
            <Code size={14} /> Source Code
          </div>
          <textarea 
            value={code}
            onChange={e => setCode(e.target.value)}
            className="flex-1 w-full bg-black/40 p-4 font-mono text-sm text-gray-300 outline-none resize-none focus:bg-black/60 transition-colors"
            spellCheck={false}
          />
        </div>

        {/* Analysis Area */}
        <div className="w-1/2 flex flex-col bg-black/20">
          <div className="px-4 py-2 bg-black/60 border-b border-white/5 flex justify-between items-center">
            <span className="text-xs font-bold text-gray-500 uppercase tracking-widest">AST Analysis</span>
            <button 
              disabled={!isReady}
              onClick={analyzeCode}
              className="px-4 py-1 bg-pink-600/20 hover:bg-pink-600/40 text-pink-400 border border-pink-500/30 rounded text-xs font-bold transition-colors disabled:opacity-50"
            >
              Analyze Tree
            </button>
          </div>
          
          <div className="flex-1 overflow-y-auto p-4 space-y-2">
            {suggestions.map((sug, i) => (
              <div key={i} className="bg-black/50 border border-white/10 rounded-lg p-3 font-mono text-sm text-gray-300">
                {sug}
              </div>
            ))}
            {suggestions.length === 0 && (
              <div className="h-full flex items-center justify-center text-gray-600 italic">
                Click "Analyze Tree" to generate refactoring suggestions.
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
