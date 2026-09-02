import { useState, useEffect } from 'react';
import * as Parser from 'web-tree-sitter';
const ParserClass: any = Parser;

import { invoke } from '@tauri-apps/api/core';
import { Layers, FileCode, CheckCircle, Code, ShieldAlert } from 'lucide-react';
import { useToast } from '../store/store';

export const ASTRefactor = ({ currentPath }: { currentPath: string | null }) => {
  const [isReady, setIsReady] = useState(false);
  const [parser, setParser] = useState<any>(null);
  const [code, setCode] = useState('function hello() {\n  var x = 1;\n  console.log(x);\n}');
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const { error, success: toastSuccess } = useToast();

  useEffect(() => {
    const initParser = async () => {
      try {
        await ParserClass.init({
          locateFile: (scriptName: string) => {
            return `/${scriptName}`;
          }
        });
        const p = new ParserClass();
        
        try {
          const Lang = await ParserClass.Language.load('/tree-sitter-javascript.wasm');
          p.setLanguage(Lang);
          setParser(p);
          setIsReady(true);
        } catch (langError) {
          console.warn("Tree-sitter language WASM not available. Fallback engine activated.", langError);
        }
      } catch (e: unknown) {
        console.warn("Using built-in static analysis engine:", e);
      }
    };
    initParser();
  }, []);

  const runStaticAnalysisFallback = (src: string): string[] => {
    const sugs: string[] = [];
    const lines = src.split('\n');

    lines.forEach((line, idx) => {
      const lineNum = idx + 1;
      const trimmed = line.trim();

      // Rule 1: var usage
      if (/\bvar\s+[a-zA-Z_$]/.test(trimmed)) {
        sugs.push(`Line ${lineNum}: Use 'let' or 'const' instead of legacy 'var'.`);
      }

      // Rule 2: Loose equality
      if (/[^!=]==[^=]/.test(trimmed) || /!=[^=]/.test(trimmed)) {
        sugs.push(`Line ${lineNum}: Use strict equality ('===' or '!==') instead of loose equality.`);
      }

      // Rule 3: console.log left in code
      if (/console\.(log|debug|info)\(/.test(trimmed)) {
        sugs.push(`Line ${lineNum}: Found debug statement '${trimmed.slice(0, 30)}...'. Remove before production.`);
      }

      // Rule 4: debugger keyword
      if (/\bdebugger\b/.test(trimmed)) {
        sugs.push(`Line ${lineNum}: 'debugger' statement found. Remove before production.`);
      }

      // Rule 5: PascalCase standard function declaration
      const funcMatch = trimmed.match(/function\s+([A-Z][a-zA-Z0-9_]*)\s*\(/);
      if (funcMatch) {
        sugs.push(`Line ${lineNum}: Function '${funcMatch[1]}' uses PascalCase. Standard functions should use camelCase.`);
      }

      // Rule 6: eval usage
      if (/\beval\s*\(/.test(trimmed)) {
        sugs.push(`Line ${lineNum}: [CRITICAL SECURITY] Avoid using 'eval()' as it introduces code injection vulnerabilities.`);
      }
    });

    if (sugs.length === 0) {
      sugs.push("Looks good! No issues or code smells found.");
    }
    return sugs;
  };

  const analyzeCode = () => {
    if (!code.trim()) {
      setSuggestions(["No code provided to analyze."]);
      return;
    }

    if (parser) {
      try {
        const tree = parser.parse(code);
        const rootNode = tree.rootNode;
        const sugs: string[] = [];

        interface SyntaxNode {
          type: string;
          startPosition: { row: number; column: number };
          childCount: number;
          child(index: number): SyntaxNode | null;
          childForFieldName(fieldName: string): { text: string } | null;
        }

        // Static analysis via AST traversal
        const walk = (node: SyntaxNode) => {
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
        if (sugs.length === 0) sugs.push("Looks good! No issues found via AST.");
        setSuggestions(sugs);
        toastSuccess('Analysis Complete', `Found ${sugs.length} rule evaluation(s).`);
        return;
      } catch (e: unknown) {
        console.warn("Tree-sitter parser failed, falling back to heuristics:", e);
      }
    }

    // Built-in fallback engine
    const fallbackResults = runStaticAnalysisFallback(code);
    setSuggestions(fallbackResults);
    toastSuccess('Analysis Complete', `Evaluated ${fallbackResults.length} rule check(s).`);
  };

  const loadFile = async () => {
    if (!currentPath) {
      error("No file selected", "Please select a file from the workspace first.");
      return;
    }
    try {
      const content = await invoke<string>('read_file_text', { path: currentPath });
      setCode(content);
      toastSuccess('File Loaded', currentPath.split(/[/\\]/).pop());
    } catch (e: unknown) {
      error("Failed to read file", String(e));
    }
  };

  const applyAutoFix = () => {
    let fixed = code;
    // Replace var with let
    fixed = fixed.replace(/\bvar\s+([a-zA-Z_$])/g, 'let $1');
    // Replace loose equality with strict equality
    fixed = fixed.replace(/([^!=])==([^=])/g, '$1===$2');
    fixed = fixed.replace(/([^!])!=([^=])/g, '$1!==$2');
    // Remove debugger
    fixed = fixed.replace(/^\s*debugger;\s*$/gm, '');
    // Comment out console.logs
    fixed = fixed.replace(/^\s*(console\.(log|debug|info)\([^)]*\);?)/gm, '// [codexos-refactor] $1');

    if (fixed === code) {
      toastSuccess('Already Optimized', 'No automated refactoring transforms needed.');
      return;
    }
    setCode(fixed);
    toastSuccess('Auto-Refactor Applied', 'Tightened equality, var->let, sanitized debug statements.');
    const remaining = runStaticAnalysisFallback(fixed);
    setSuggestions(remaining);
  };

  const saveToFile = async () => {
    if (!currentPath) {
      error("No workspace file", "Please select a file from the workspace first.");
      return;
    }
    try {
      await invoke('write_file_text', { path: currentPath, content: code });
      toastSuccess('File Saved', `Saved refactored code to ${currentPath.split(/[/\\]/).pop()}`);
    } catch (e: unknown) {
      error("Failed to save file", String(e));
    }
  };

  const addStrictMode = () => {
    if (code.includes('"use strict";') || code.includes("'use strict';")) {
      toastSuccess('Strict Mode', 'Already enabled in this file.');
      return;
    }
    setCode(`"use strict";\n\n${code}`);
    toastSuccess('Strict Mode Enabled', 'Prepended "use strict"; to top of file.');
  };

  return (
    <div className="flex flex-col h-full w-full bg-[#0a0f18] text-white">
      {/* Header */}
      <div className="flex justify-between items-center px-6 py-4 border-b border-white/10 bg-black/40">
        <div className="flex items-center gap-3">
          <Layers className="text-pink-500" size={24} />
          <h2 className="font-bold text-xl text-pink-400">AST Refactor & Code Engine</h2>
          {isReady ? (
            <span className="bg-green-500/20 text-green-400 border border-green-500/30 px-2 py-0.5 rounded text-xs font-bold ml-2 flex items-center gap-1">
              <CheckCircle size={12} /> Tree-Sitter WASM
            </span>
          ) : (
            <span className="bg-cyan-500/20 text-cyan-400 border border-cyan-500/30 px-2 py-0.5 rounded text-xs font-bold ml-2 flex items-center gap-1">
              <ShieldAlert size={12} /> Static Rules Engine
            </span>
          )}
        </div>
        
        <div className="flex items-center gap-3">
          <button 
            onClick={addStrictMode}
            className="px-3 py-1.5 bg-white/5 hover:bg-white/10 border border-white/10 rounded text-xs font-medium text-gray-300 transition-colors"
          >
            + Strict Mode
          </button>
          <button 
            onClick={loadFile}
            className="flex items-center gap-2 px-3 py-1.5 bg-white/5 hover:bg-white/10 border border-white/10 rounded text-xs font-medium transition-colors"
          >
            <FileCode size={14} /> Load File
          </button>
          <button 
            onClick={saveToFile}
            className="flex items-center gap-2 px-3 py-1.5 bg-emerald-600/30 hover:bg-emerald-600/50 text-emerald-300 border border-emerald-500/30 rounded text-xs font-bold transition-colors"
          >
            Save to Disk
          </button>
        </div>
      </div>

      <div className="flex-1 flex min-h-0">
        {/* Editor Area */}
        <div className="w-1/2 flex flex-col border-r border-white/10">
          <div className="px-4 py-2 bg-black/60 border-b border-white/5 text-xs font-bold text-gray-500 uppercase tracking-widest flex items-center justify-between">
            <span className="flex items-center gap-2"><Code size={14} /> Source Code</span>
            <span className="text-[11px] text-gray-500">{code.split('\n').length} lines</span>
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
            <span className="text-xs font-bold text-gray-500 uppercase tracking-widest">Code Quality & AST Analysis</span>
            <div className="flex items-center gap-2">
              <button 
                onClick={applyAutoFix}
                className="px-3 py-1 bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 border border-amber-500/30 rounded text-xs font-bold transition-colors"
              >
                Auto-Fix All
              </button>
              <button 
                onClick={analyzeCode}
                className="px-3 py-1 bg-pink-600/20 hover:bg-pink-600/40 text-pink-400 border border-pink-500/30 rounded text-xs font-bold transition-colors"
              >
                Analyze Code
              </button>
            </div>
          </div>
          
          <div className="flex-1 overflow-y-auto p-4 space-y-2">
            {suggestions.map((sug, i) => (
              <div key={i} className="bg-black/50 border border-white/10 rounded-lg p-3 font-mono text-sm text-gray-300 flex items-start gap-2">
                <span className="text-pink-400 font-bold">•</span>
                <span>{sug}</span>
              </div>
            ))}
            {suggestions.length === 0 && (
              <div className="h-full flex items-center justify-center text-gray-600 italic">
                Click "Analyze Code" or "Auto-Fix All" to evaluate and refactor your code.
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
