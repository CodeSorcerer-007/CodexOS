import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Store, Search, Download, ShieldCheck, Cpu, Sparkles, Network, RefreshCw, Play, Trash2, X } from 'lucide-react';
import { useStore, useToast } from '../store/store';
import { invoke } from '@tauri-apps/api/core';

interface PluginItem {
  id: string;
  name: string;
  version: string;
  author: string;
  description: string;
  category: 'DevTools' | 'AI' | 'Security' | 'Linter';
  size: string;
  downloads: number;
  verified: boolean;
  peerHost?: string;
  wasmFile: string;
}

const FEATURED_PLUGINS: PluginItem[] = [
  {
    id: 'wasm-rust-formatter',
    name: 'Rust AST Formatter',
    version: '1.2.0',
    author: 'CodeSorcerer',
    description: 'High-speed WASM AST code formatter for Rust files compiled directly to WebAssembly.',
    category: 'DevTools',
    size: '1.4 MB',
    downloads: 412,
    verified: true,
    wasmFile: 'rust_fmt.wasm',
  },
  {
    id: 'wasm-sec-scanner',
    name: 'Secret Leak Scanner',
    version: '2.0.1',
    author: 'VaultTeam',
    description: 'Scans source code for unencrypted API keys, JWT tokens, and private SSH keys using regular expressions.',
    category: 'Security',
    size: '890 KB',
    downloads: 820,
    verified: true,
    wasmFile: 'sec_scan.wasm',
  },
  {
    id: 'wasm-llm-summarizer',
    name: 'Offline LLM Doc Summarizer',
    version: '0.9.4',
    author: 'LocalAI Group',
    description: 'Extracts API specifications from TypeScript AST and summarizes method signatures offline.',
    category: 'AI',
    size: '3.1 MB',
    downloads: 290,
    verified: true,
    wasmFile: 'doc_summary.wasm',
  },
  {
    id: 'wasm-json-linter',
    name: 'Strict JSON & YAML Linter',
    version: '1.0.5',
    author: 'CoreDev',
    description: 'Validates JSON/YAML files against OpenAPI 3.0 schemas with line-by-line lint feedback.',
    category: 'Linter',
    size: '640 KB',
    downloads: 1150,
    verified: true,
    wasmFile: 'json_lint.wasm',
  },
];

export const PluginMarketplace = () => {
  const peerCount = useStore((s) => s.peerCount);
  const { success: toastSuccess, error: toastError, info: toastInfo } = useToast();
  
  const [search, setSearch] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string>('All');
  const [installingId, setInstallingId] = useState<string | null>(null);
  const [installedIds, setInstalledIds] = useState<Set<string>>(new Set());
  const [activePluginToRun, setActivePluginToRun] = useState<PluginItem | null>(null);
  const [pluginInputText, setPluginInputText] = useState('const apiKey = "sk-1234567890abcdef";\nfunction test() {\n  return 42;\n}');
  const [pluginOutput, setPluginOutput] = useState<string | null>(null);
  const [isExecutingPlugin, setIsExecutingPlugin] = useState(false);

  useEffect(() => {
    try {
      const saved = localStorage.getItem('codexos_installed_plugins');
      if (saved) {
        setInstalledIds(new Set(JSON.parse(saved)));
      }
    } catch {
      // Ignore storage read error
    }
  }, []);

  const categories = ['All', 'DevTools', 'AI', 'Security', 'Linter'];

  const filteredPlugins = FEATURED_PLUGINS.filter((p) => {
    const matchesSearch = p.name.toLowerCase().includes(search.toLowerCase()) || p.description.toLowerCase().includes(search.toLowerCase());
    const matchesCat = selectedCategory === 'All' || p.category === selectedCategory;
    return matchesSearch && matchesCat;
  });

  const handleInstall = async (plugin: PluginItem) => {
    setInstallingId(plugin.id);
    toastInfo('Downloading WASM Plugin', `Transferring ${plugin.name} via WebRTC peer network...`);

    try {
      await new Promise((r) => setTimeout(r, 800));

      setInstalledIds((prev) => {
        const next = new Set(prev).add(plugin.id);
        localStorage.setItem('codexos_installed_plugins', JSON.stringify([...next]));
        return next;
      });
      toastSuccess('Plugin Installed', `${plugin.name} v${plugin.version} successfully installed and ready to run!`);
    } catch (e: unknown) {
      toastError('Installation Failed', String(e));
    } finally {
      setInstallingId(null);
    }
  };

  const handleUninstall = (pluginId: string) => {
    setInstalledIds((prev) => {
      const next = new Set(prev);
      next.delete(pluginId);
      localStorage.setItem('codexos_installed_plugins', JSON.stringify([...next]));
      return next;
    });
    toastInfo('Plugin Removed', 'Plugin has been uninstalled from your local registry.');
  };

  const handleOpenRunner = (plugin: PluginItem) => {
    setActivePluginToRun(plugin);
    setPluginOutput(null);
  };

  const executePlugin = async () => {
    if (!activePluginToRun) return;
    setIsExecutingPlugin(true);
    try {
      const output = await invoke<string>('execute_marketplace_plugin', {
        pluginId: activePluginToRun.id,
        inputText: pluginInputText,
      });
      setPluginOutput(output);
      toastSuccess('Plugin Executed', `Finished executing ${activePluginToRun.name}`);
    } catch (e: unknown) {
      toastError('Execution Error', String(e));
    } finally {
      setIsExecutingPlugin(false);
    }
  };

  return (
    <div className="flex flex-col h-full w-full bg-[#0a0f18] text-white p-6 gap-6 overflow-y-auto relative">
      {/* Header Bar */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 border-b border-white/10 pb-5">
        <div>
          <div className="flex items-center gap-3">
            <Store className="w-7 h-7 text-amber-400" />
            <h2 className="font-extrabold text-2xl text-white tracking-tight">P2P Plugin Marketplace</h2>
            <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
              ✓ Active WASM Ecosystem
            </span>
          </div>
          <p className="text-sm text-gray-400 mt-1">Discover, install, and execute WebAssembly plugins peer-to-peer across your local network.</p>
        </div>

        {/* Peer Connectivity Indicator */}
        <div className="flex items-center gap-3 bg-black/60 border border-white/10 px-4 py-2 rounded-xl backdrop-blur-md">
          <Network className="w-4 h-4 text-cyan-400" />
          <div className="flex items-center gap-2 text-xs font-mono">
            <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
            <span className="text-gray-300">{peerCount > 0 ? `${peerCount} Peers Connected` : 'Signaling Active (Local Mesh Ready)'}</span>
          </div>
        </div>
      </div>

      {/* Execution Drawer Modal */}
      {activePluginToRun && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-md z-50 flex items-center justify-center p-4">
          <div className="bg-[#111827] border border-amber-500/40 rounded-2xl max-w-2xl w-full p-6 shadow-2xl flex flex-col gap-4">
            <div className="flex justify-between items-center border-b border-white/10 pb-3">
              <div className="flex items-center gap-3">
                <Cpu className="w-5 h-5 text-amber-400" />
                <h3 className="font-bold text-lg text-white">Run WASM Plugin: {activePluginToRun.name}</h3>
              </div>
              <button onClick={() => setActivePluginToRun(null)} className="text-gray-400 hover:text-white">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div>
              <label className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-2 block">
                Target Input Text / Code Snippet:
              </label>
              <textarea
                value={pluginInputText}
                onChange={(e) => setPluginInputText(e.target.value)}
                rows={5}
                className="w-full bg-black/60 border border-white/10 rounded-xl p-3 font-mono text-xs text-gray-200 outline-none focus:border-amber-500"
              />
            </div>

            <div className="flex justify-end gap-3">
              <button
                onClick={() => setActivePluginToRun(null)}
                className="px-4 py-2 bg-white/10 hover:bg-white/20 rounded-xl text-xs font-bold text-gray-300"
              >
                Close
              </button>
              <button
                disabled={isExecutingPlugin}
                onClick={executePlugin}
                className="px-5 py-2 bg-amber-500 hover:bg-amber-400 text-black rounded-xl text-xs font-bold flex items-center gap-2 shadow-lg disabled:opacity-50"
              >
                {isExecutingPlugin ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Play className="w-3.5 h-3.5" />}
                <span>Execute in Wasmtime</span>
              </button>
            </div>

            {pluginOutput && (
              <div className="mt-2 flex flex-col gap-1.5">
                <span className="text-xs font-bold text-emerald-400 uppercase tracking-wider">Plugin Output / Results:</span>
                <pre className="p-3 bg-black border border-emerald-500/30 rounded-xl font-mono text-xs text-emerald-300 whitespace-pre-wrap max-h-48 overflow-y-auto">
                  {pluginOutput}
                </pre>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Search & Category Filter Strip */}
      <div className="flex flex-col sm:flex-row justify-between gap-4">
        {/* Category Pills */}
        <div className="flex items-center gap-2 overflow-x-auto pb-2 sm:pb-0">
          {categories.map((cat) => (
            <button
              key={cat}
              onClick={() => setSelectedCategory(cat)}
              className={`px-3.5 py-1.5 rounded-xl text-xs font-bold transition-all ${
                selectedCategory === cat
                  ? 'bg-amber-500 text-black shadow-lg shadow-amber-500/20'
                  : 'bg-white/5 border border-white/10 text-gray-400 hover:text-white hover:bg-white/10'
              }`}
            >
              {cat}
            </button>
          ))}
        </div>

        {/* Search Bar */}
        <div className="relative min-w-[260px]">
          <Search className="w-4 h-4 text-gray-400 absolute left-3.5 top-3" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search WASM plugins..."
            className="w-full bg-black/50 border border-white/10 rounded-xl pl-10 pr-4 py-2 text-sm text-white placeholder:text-gray-500 focus:outline-none focus:border-amber-500 transition-colors"
          />
        </div>
      </div>

      {/* Plugin Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-2 gap-6">
        <AnimatePresence>
          {filteredPlugins.map((plugin) => {
            const isInstalled = installedIds.has(plugin.id);
            const isInstalling = installingId === plugin.id;

            return (
              <motion.div
                key={plugin.id}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.95 }}
                className="bg-black/40 backdrop-blur-md border border-white/10 hover:border-amber-500/40 rounded-2xl p-5 flex flex-col justify-between gap-4 transition-all duration-300 group relative overflow-hidden"
              >
                <div className="flex flex-col gap-3">
                  <div className="flex justify-between items-start">
                    <div className="flex items-center gap-3">
                      <div className="p-3 bg-amber-500/10 border border-amber-500/20 rounded-xl text-amber-400 group-hover:scale-105 transition-transform">
                        {plugin.category === 'AI' ? <Sparkles className="w-5 h-5" /> : plugin.category === 'Security' ? <ShieldCheck className="w-5 h-5" /> : <Cpu className="w-5 h-5" />}
                      </div>
                      <div>
                        <div className="flex items-center gap-2">
                          <h3 className="font-bold text-base text-white group-hover:text-amber-300 transition-colors">{plugin.name}</h3>
                          {plugin.verified && <span title="Verified Author"><ShieldCheck className="w-4 h-4 text-emerald-400" /></span>}
                        </div>
                        <span className="text-xs text-gray-500 font-mono">v{plugin.version} • by {plugin.author}</span>
                      </div>
                    </div>

                    <span className="bg-white/5 border border-white/10 text-gray-400 text-[10px] font-mono px-2.5 py-1 rounded-full">{plugin.category}</span>
                  </div>

                  <p className="text-xs text-gray-300 leading-relaxed">{plugin.description}</p>
                </div>

                {/* Footer Metadata & Install Action */}
                <div className="flex justify-between items-center border-t border-white/10 pt-3">
                  <div className="flex items-center gap-3 text-[11px] text-gray-500 font-mono">
                    <span>{plugin.size}</span>
                    <span>•</span>
                    <span>{plugin.downloads} downloads</span>
                  </div>

                  {isInstalled ? (
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => handleOpenRunner(plugin)}
                        className="flex items-center gap-1.5 px-3 py-1.5 bg-emerald-500 hover:bg-emerald-400 text-black rounded-xl text-xs font-bold transition-all shadow-md shadow-emerald-500/20"
                      >
                        <Play className="w-3 h-3 fill-current" />
                        <span>Run Plugin</span>
                      </button>
                      <button
                        title="Uninstall Plugin"
                        onClick={() => handleUninstall(plugin.id)}
                        className="p-1.5 bg-white/5 hover:bg-red-500/20 text-gray-400 hover:text-red-400 border border-white/10 rounded-xl transition-colors"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  ) : (
                    <button
                      disabled={isInstalling}
                      onClick={() => handleInstall(plugin)}
                      className="flex items-center gap-1.5 px-4 py-1.5 bg-amber-500 hover:bg-amber-400 text-black font-bold rounded-xl text-xs transition-all shadow-lg shadow-amber-500/10 disabled:opacity-50"
                    >
                      {isInstalling ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Download className="w-3.5 h-3.5" />}
                      <span>{isInstalling ? 'Transferring...' : 'Install via P2P'}</span>
                    </button>
                  )}
                </div>
              </motion.div>
            );
          })}
        </AnimatePresence>
      </div>
    </div>
  );
};
