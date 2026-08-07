import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { invoke } from '@tauri-apps/api/core';
import { CheckCircle2, XCircle, ChevronRight, Download, Box, GitBranch, Search, Zap, Code2 } from 'lucide-react';
import { open } from '@tauri-apps/plugin-dialog';
import { useStore } from '../store/store';

interface ToolStatus {
  name: string;
  command: string;
  icon: any;
  version: string | null;
  loading: boolean;
  installUrl: string;
}

export const OnboardingWizard = ({ onComplete }: { onComplete: () => void }) => {
  const [step, setStep] = useState(1);
  const [tools, setTools] = useState<ToolStatus[]>([
    { name: 'Git', command: 'git', icon: GitBranch, version: null, loading: true, installUrl: 'https://git-scm.com/downloads' },
    { name: 'Docker', command: 'docker', icon: Box, version: null, loading: true, installUrl: 'https://docs.docker.com/get-docker/' },
    { name: 'Ripgrep', command: 'rg', icon: Search, version: null, loading: true, installUrl: 'https://github.com/BurntSushi/ripgrep' },
    { name: 'Node.js', command: 'node', icon: Code2, version: null, loading: true, installUrl: 'https://nodejs.org/' },
  ]);
  const [ollamaVersion, setOllamaVersion] = useState<string | null>(null);
  const [ollamaLoading, setOllamaLoading] = useState(true);

  const updateSettings = useStore(s => s.updateSettings);
  const defaultPath = useStore(s => s.settings.defaultPath);

  useEffect(() => {
    if (step === 3) {
      // Detect CLI tools
      Promise.all(tools.map(async (tool, i) => {
        try {
          const version = await invoke<string>('detect_tool', { tool: tool.command });
          setTools(prev => {
            const next = [...prev];
            next[i].version = version || null;
            next[i].loading = false;
            return next;
          });
        } catch {
          setTools(prev => {
            const next = [...prev];
            next[i].loading = false;
            return next;
          });
        }
      }));

      // Detect Ollama (running locally)
      fetch('http://127.0.0.1:11434/')
        .then(res => {
          if (res.ok) setOllamaVersion('Running');
          setOllamaLoading(false);
        })
        .catch(() => {
          setOllamaVersion(null);
          setOllamaLoading(false);
        });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step]);

  const handlePickDirectory = async () => {
    const selected = await open({
      directory: true,
      multiple: false,
    });
    if (selected && typeof selected === 'string') {
      updateSettings({ defaultPath: selected });
    }
  };

  return (
    <div className="fixed inset-0 z-[100] bg-black flex items-center justify-center p-4">
      {/* Background gradients */}
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,_var(--tw-gradient-stops))] from-indigo-900/20 via-black to-black"></div>
      
      <motion.div 
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="relative bg-black/50 backdrop-blur-2xl border border-white/10 p-8 rounded-3xl w-full max-w-2xl shadow-2xl flex flex-col min-h-[500px]"
      >
        <AnimatePresence mode="wait">
          
          {step === 1 && (
            <motion.div key="step1" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="flex-1 flex flex-col items-center justify-center text-center">
              <div className="w-20 h-20 rounded-2xl bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center shadow-lg shadow-indigo-500/20 mb-8">
                <span className="font-black text-white text-4xl">V</span>
              </div>
              <h1 className="text-4xl font-black mb-4 text-transparent bg-clip-text bg-gradient-to-r from-white to-gray-400">Welcome to CodexOS v2</h1>
              <p className="text-gray-400 text-lg mb-12">The Ultimate Developer Toolkit.<br/>Let's set up your workspace in 60 seconds.</p>
              <button 
                onClick={() => setStep(2)}
                className="bg-white text-black px-8 py-3 rounded-xl font-bold hover:bg-gray-200 transition-colors flex items-center gap-2"
              >
                Get Started <ChevronRight size={20} />
              </button>
            </motion.div>
          )}

          {step === 2 && (
            <motion.div key="step2" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }} className="flex-1 flex flex-col justify-center">
              <h2 className="text-2xl font-bold mb-2">Set Working Directory</h2>
              <p className="text-gray-400 mb-8">Where do you usually keep your code? This will be your default dashboard view.</p>
              
              <div className="bg-white/5 border border-white/10 rounded-xl p-6 flex flex-col items-center gap-4 mb-8">
                <button 
                  onClick={handlePickDirectory}
                  className="bg-indigo-600 hover:bg-indigo-500 text-white px-6 py-2 rounded-lg font-medium transition-colors"
                >
                  Choose Folder
                </button>
                {defaultPath && (
                  <div className="text-sm font-mono text-gray-300 bg-black/50 px-4 py-2 rounded-lg border border-white/5 truncate max-w-full">
                    {defaultPath}
                  </div>
                )}
              </div>

              <div className="mt-auto flex justify-between items-center pt-8">
                <button onClick={() => setStep(3)} className="text-gray-500 hover:text-white transition-colors">Skip</button>
                <button 
                  onClick={() => setStep(3)}
                  className="bg-white text-black px-6 py-2 rounded-xl font-bold hover:bg-gray-200 transition-colors flex items-center gap-2"
                >
                  Continue <ChevronRight size={18} />
                </button>
              </div>
            </motion.div>
          )}

          {step === 3 && (
            <motion.div key="step3" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }} className="flex-1 flex flex-col">
              <h2 className="text-2xl font-bold mb-2">Environment Check</h2>
              <p className="text-gray-400 mb-6">Detecting tools on your system to enable CodexOS features.</p>
              
              <div className="grid grid-cols-2 gap-4 flex-1">
                {tools.map((t, i) => (
                  <div key={i} className="bg-white/5 border border-white/10 rounded-xl p-4 flex items-center gap-4">
                    <div className="p-2 bg-black/50 rounded-lg"><t.icon size={20} className="text-gray-400" /></div>
                    <div className="flex-1 min-w-0">
                      <div className="font-medium text-sm text-gray-200">{t.name}</div>
                      {t.loading ? (
                        <div className="text-xs text-gray-500 animate-pulse">Detecting...</div>
                      ) : t.version ? (
                        <div className="text-xs text-green-400 font-mono truncate" title={t.version}>{t.version}</div>
                      ) : (
                        <a href={t.installUrl} target="_blank" rel="noreferrer" className="text-xs text-indigo-400 hover:text-indigo-300 flex items-center gap-1 mt-0.5">
                          Not found <Download size={10} />
                        </a>
                      )}
                    </div>
                    <div>
                      {t.loading ? null : t.version ? <CheckCircle2 size={18} className="text-green-500" /> : <XCircle size={18} className="text-red-500" />}
                    </div>
                  </div>
                ))}

                <div className="bg-white/5 border border-white/10 rounded-xl p-4 flex items-center gap-4">
                  <div className="p-2 bg-black/50 rounded-lg"><Zap size={20} className="text-gray-400" /></div>
                  <div className="flex-1 min-w-0">
                    <div className="font-medium text-sm text-gray-200">Ollama (AI)</div>
                    {ollamaLoading ? (
                      <div className="text-xs text-gray-500 animate-pulse">Detecting...</div>
                    ) : ollamaVersion ? (
                      <div className="text-xs text-green-400 font-mono">Ready</div>
                    ) : (
                      <a href="https://ollama.com" target="_blank" rel="noreferrer" className="text-xs text-indigo-400 hover:text-indigo-300 flex items-center gap-1 mt-0.5">
                        Not running <Download size={10} />
                      </a>
                    )}
                  </div>
                  <div>
                    {ollamaLoading ? null : ollamaVersion ? <CheckCircle2 size={18} className="text-green-500" /> : <XCircle size={18} className="text-red-500" />}
                  </div>
                </div>
              </div>

              <div className="mt-8 flex justify-between items-center">
                <button onClick={() => setStep(4)} className="text-gray-500 hover:text-white transition-colors">Skip</button>
                <button 
                  onClick={() => setStep(4)}
                  className="bg-white text-black px-6 py-2 rounded-xl font-bold hover:bg-gray-200 transition-colors flex items-center gap-2"
                >
                  Almost done <ChevronRight size={18} />
                </button>
              </div>
            </motion.div>
          )}

          {step === 4 && (
            <motion.div key="step4" initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} className="flex-1 flex flex-col items-center justify-center text-center relative">
              <div className="w-24 h-24 rounded-full bg-green-500/20 flex items-center justify-center mb-6">
                <CheckCircle2 size={48} className="text-green-400" />
              </div>
              <h2 className="text-3xl font-bold mb-4">You're all set!</h2>
              <p className="text-gray-400 mb-12">CodexOS is ready to superpower your workflow.</p>
              
              <button 
                onClick={onComplete}
                className="bg-indigo-600 text-white px-12 py-4 rounded-xl font-bold text-lg hover:bg-indigo-500 transition-all hover:scale-105 active:scale-95 shadow-lg shadow-indigo-500/25"
              >
                Open CodexOS
              </button>
            </motion.div>
          )}

        </AnimatePresence>
      </motion.div>
    </div>
  );
};
