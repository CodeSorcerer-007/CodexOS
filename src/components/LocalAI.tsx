import { useState, useRef, useEffect } from 'react';
import { invoke } from '@tauri-apps/api/core';

interface Message {
  role: 'user' | 'assistant';
  content: string;
  sources?: string[];
}

export const LocalAI = ({ currentPath }: { currentPath: string | null }) => {
  const [messages, setMessages] = useState<Message[]>([
    { role: 'assistant', content: 'Hello! I am your deterministic local code assistant. Ask me to find logic or keywords in your codebase.' }
  ]);
  const [input, setInput] = useState('');
  const [isSearching, setIsSearching] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  const extractKeywords = (query: string) => {
    // Very simple stopword removal for deterministic keyword extraction
    const stopwords = ['where', 'is', 'the', 'how', 'do', 'i', 'find', 'auth', 'logic', 'what', 'does', 'in', 'of', 'and', 'to', 'a'];
    return query.toLowerCase()
      .replace(/[^\w\s]/gi, '')
      .split(' ')
      .filter(w => w.length > 2 && !stopwords.includes(w));
  };

  const handleSend = async () => {
    if (!input.trim() || !currentPath) return;

    const userMsg = input.trim();
    setInput('');
    setMessages(prev => [...prev, { role: 'user', content: userMsg }]);
    setIsSearching(true);

    const keywords = extractKeywords(userMsg);
    
    if (keywords.length === 0) {
      setMessages(prev => [...prev, { role: 'assistant', content: "I couldn't identify specific keywords to search for. Try asking for specific variable names or concepts." }]);
      setIsSearching(false);
      return;
    }

    try {
      // We use the existing Rust backend 'search_contents' command
      // We'll search for the first keyword as a primary anchor
      const anchor = keywords[0];
      const results = await invoke<string[]>('search_contents', { path: currentPath, query: anchor });
      
      if (results.length === 0) {
        setMessages(prev => [...prev, { role: 'assistant', content: `I couldn't find any files mentioning "${anchor}".` }]);
      } else {
        setMessages(prev => [...prev, { 
          role: 'assistant', 
          content: `I found ${results.length} files matching your query for "${anchor}". Here are the most relevant ones based on deterministic search:`,
          sources: results.slice(0, 5) // top 5
        }]);
      }
    } catch (e) {
      setMessages(prev => [...prev, { role: 'assistant', content: `Error searching codebase: ${e}` }]);
    } finally {
      setIsSearching(false);
    }
  };

  return (
    <div className="flex h-full w-full bg-[#0a0f18] text-white flex-col max-w-4xl mx-auto border-x border-white/10 shadow-2xl">
      <div className="p-4 border-b border-white/10 bg-black/40 flex justify-between items-center">
        <div>
          <h2 className="font-bold text-blue-400">Local Code Assistant</h2>
          <p className="text-xs text-gray-500">Deterministic Keyword Engine (0MB RAM)</p>
        </div>
      </div>
      
      <div className="flex-1 overflow-y-auto p-6 flex flex-col gap-6" ref={scrollRef}>
        {messages.map((msg, i) => (
          <div key={i} className={`flex flex-col ${msg.role === 'user' ? 'items-end' : 'items-start'}`}>
            <div className={`max-w-[80%] rounded-2xl p-4 ${msg.role === 'user' ? 'bg-blue-600 text-white rounded-br-none' : 'bg-white/10 border border-white/5 text-gray-200 rounded-bl-none'}`}>
              <div className="text-sm">{msg.content}</div>
              {msg.sources && msg.sources.length > 0 && (
                <div className="mt-4 pt-4 border-t border-white/10 flex flex-col gap-2">
                  <div className="text-xs font-bold text-gray-400 uppercase tracking-widest">Sources</div>
                  {msg.sources.map(s => (
                    <div key={s} className="text-xs font-mono text-blue-300 bg-black/40 p-2 rounded truncate border border-blue-500/20">
                      {s.replace(currentPath || '', '')}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        ))}
        {isSearching && (
          <div className="flex items-start">
            <div className="bg-white/5 border border-white/5 rounded-2xl rounded-bl-none p-4 flex gap-2 items-center">
              <div className="w-2 h-2 bg-blue-400 rounded-full animate-bounce" />
              <div className="w-2 h-2 bg-blue-400 rounded-full animate-bounce delay-75" />
              <div className="w-2 h-2 bg-blue-400 rounded-full animate-bounce delay-150" />
            </div>
          </div>
        )}
      </div>

      <div className="p-4 bg-black/40 border-t border-white/10">
        <div className="flex gap-2">
          <input 
            type="text"
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && handleSend()}
            placeholder="E.g., Where is the vault encryption logic?"
            className="flex-1 bg-black/60 border border-white/10 focus:border-blue-500 rounded-xl px-4 py-3 text-sm outline-none transition-colors"
          />
          <button 
            onClick={handleSend}
            disabled={!input.trim() || isSearching || !currentPath}
            className="px-6 py-3 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 rounded-xl font-bold transition-colors shadow-[0_0_15px_rgba(37,99,235,0.3)]"
          >
            Send
          </button>
        </div>
      </div>
    </div>
  );
};
