import { useState, useEffect, useRef } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import { Bot, Send, User, Zap, AlertCircle, Trash2, Copy } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { useStore, useToast } from '../store/store';

interface Message {
  role: 'user' | 'assistant';
  content: string;
}

export const LocalAI = () => {
  const [messages, setMessages] = useState<Message[]>([
    { role: 'assistant', content: 'Hello! I am connected to your local Ollama instance. How can I help you today?' }
  ]);
  const [input, setInput] = useState('');
  const [isGenerating, setIsGenerating] = useState(false);
  const [model, setModel] = useState('llama3.2:latest');
  const [error, setError] = useState<string | null>(null);
  const [useContext, setUseContext] = useState(true);
  const scrollRef = useRef<HTMLDivElement>(null);
  const { success: toastSuccess } = useToast();
  
  const selectedFile = useStore(state => state.selectedFile);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  useEffect(() => {
    let unlisten: (() => void) | undefined;
    
    const setupListener = async () => {
      const u = await listen<string>('ai-token', (event) => {
        setMessages(prev => {
          const last = prev[prev.length - 1];
          if (last.role === 'assistant') {
            return [
              ...prev.slice(0, -1),
              { role: 'assistant', content: last.content + event.payload }
            ];
          } else {
            return [...prev, { role: 'assistant', content: event.payload }];
          }
        });
      });
      unlisten = u;
    };
    
    setupListener();
    return () => { if (unlisten) unlisten(); };
  }, []);

  const sendMessage = async () => {
    if (!input.trim() || isGenerating) return;
    
    const userMsg = input;
    setInput('');
    setError(null);
    setMessages(prev => [...prev, { role: 'user', content: userMsg }, { role: 'assistant', content: '' }]);
    setIsGenerating(true);
    
    try {
      let finalPrompt = userMsg;
      if (useContext && selectedFile) {
        try {
          const fileContext = await invoke<string>('read_file_text', { path: selectedFile });
          finalPrompt = `Context from file ${selectedFile}:\n\n${fileContext}\n\n---\n\n${userMsg}`;
        } catch (e: unknown) {
          console.warn('Failed to read file context', e);
        }
      }
      
      await invoke('query_ollama', { model, prompt: finalPrompt });
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e));
      setMessages(prev => prev.slice(0, -1)); // Remove the empty assistant message
    } finally {
      setIsGenerating(false);
    }
  };

  const handleClearChat = () => {
    setMessages([
      { role: 'assistant', content: 'Conversation cleared. How can I assist you?' }
    ]);
  };

  const handleCopyMessage = (text: string) => {
    navigator.clipboard.writeText(text);
    toastSuccess('Copied', 'Message copied to clipboard.');
  };

  return (
    <div className="flex flex-col h-full w-full bg-[#0a0f18] text-white">
      {/* Header */}
      <div className="flex justify-between items-center px-6 py-4 border-b border-white/10 bg-black/40">
        <div className="flex items-center gap-3">
          <Zap className="text-yellow-400" size={24} />
          <h2 className="font-bold text-xl text-yellow-400">Local AI Assistant</h2>
          <span className="bg-green-500/20 text-green-400 border border-green-500/30 px-2 py-0.5 rounded text-xs font-bold ml-2">
            Ollama Backend
          </span>
        </div>
        
        <div className="flex items-center gap-3">
          <span className="text-xs text-gray-500 font-bold uppercase tracking-widest">Model</span>
          <select 
            value={model}
            onChange={e => setModel(e.target.value)}
            className="bg-black/50 border border-white/10 rounded px-3 py-1.5 text-sm outline-none focus:border-yellow-500"
          >
            <option value="llama3.2:latest">Llama 3.2</option>
            <option value="codellama">CodeLlama</option>
            <option value="mistral">Mistral</option>
          </select>
          <button
            onClick={handleClearChat}
            className="p-1.5 hover:bg-white/10 text-gray-400 hover:text-white rounded transition-colors"
            title="Clear Chat"
          >
            <Trash2 className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Chat Area */}
      <div 
        ref={scrollRef}
        className="flex-1 overflow-y-auto p-6 space-y-6"
      >
        <AnimatePresence>
          {messages.map((msg, i) => (
            <motion.div 
              key={`${msg.role}-${i}`}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              className={`flex gap-4 max-w-4xl mx-auto ${msg.role === 'user' ? 'flex-row-reverse' : ''}`}
            >
              <div className={`w-10 h-10 rounded-full flex items-center justify-center shrink-0 border
                ${msg.role === 'user' ? 'bg-indigo-600 border-indigo-400/50 text-white' : 'bg-black border-yellow-500/50 text-yellow-500'}`}
              >
                {msg.role === 'user' ? <User size={20} /> : <Bot size={20} />}
              </div>
              <div className={`group relative px-5 py-3 rounded-2xl whitespace-pre-wrap font-mono text-sm shadow-lg
                ${msg.role === 'user' ? 'bg-indigo-600/20 border border-indigo-500/30 text-indigo-100' : 'bg-black/50 border border-white/10 text-gray-300'}`}
              >
                {msg.content}
                {isGenerating && i === messages.length - 1 && msg.role === 'assistant' && (
                  <span className="inline-block w-2 h-4 ml-1 bg-yellow-500 animate-pulse align-middle" />
                )}
                {msg.content && (
                  <button
                    onClick={() => handleCopyMessage(msg.content)}
                    className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 p-1 bg-black/40 hover:bg-white/10 text-gray-400 hover:text-white rounded transition-opacity"
                    title="Copy message"
                  >
                    <Copy className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>
            </motion.div>
          ))}
        </AnimatePresence>
        
        {error && (
          <div className="max-w-4xl mx-auto bg-red-500/20 border border-red-500/50 text-red-200 p-4 rounded-lg flex items-start gap-3">
            <AlertCircle size={20} className="shrink-0 mt-0.5 text-red-400" />
            <div className="font-mono text-sm">
              <strong className="block mb-1">Connection Error</strong>
              {error}
              <p className="mt-2 text-xs text-red-300">Make sure Ollama is installed and running locally on port 11434.</p>
            </div>
          </div>
        )}
      </div>

      {/* Input Area */}
      <div className="border-t border-white/10 bg-black/40 p-4 shrink-0 flex flex-col gap-2">
        {selectedFile && (
          <label className="flex items-center gap-2 text-xs text-gray-400 cursor-pointer w-fit">
            <input type="checkbox" checked={useContext} onChange={e => setUseContext(e.target.checked)} className="accent-yellow-500 rounded border-white/10" />
            Include context from <span className="font-mono text-yellow-500/80">{selectedFile}</span>
          </label>
        )}
        <div className="max-w-4xl mx-auto relative">
          <textarea
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={e => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                sendMessage();
              }
            }}
            placeholder="Ask anything or paste code..."
            className="w-full bg-black/50 border border-white/20 rounded-xl pl-4 pr-14 py-4 text-sm font-mono text-white outline-none focus:border-yellow-500 resize-none"
            rows={3}
          />
          <button 
            disabled={isGenerating || !input.trim()}
            onClick={sendMessage}
            className="absolute bottom-4 right-4 p-2 bg-yellow-500 text-black rounded-lg hover:bg-yellow-400 transition-colors disabled:opacity-30 disabled:hover:bg-yellow-500"
          >
            <Send size={18} />
          </button>
        </div>
        <div className="max-w-4xl mx-auto mt-2 text-center text-xs text-gray-600 font-bold uppercase tracking-widest">
          Press Shift+Enter for new line
        </div>
      </div>
    </div>
  );
};
