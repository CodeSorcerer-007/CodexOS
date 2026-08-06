import { lazy, Suspense } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { motion, AnimatePresence } from 'framer-motion';
import { LayoutDashboard, HardDrive, Network, GitBranch, TerminalSquare, Settings, Workflow, Box, ShieldAlert, Zap, Layers, MonitorPlay, Key, Webhook } from 'lucide-react';

import { ErrorBoundary } from './components/ErrorBoundary';
import { useStore } from './store/store';
import { ToastContainer } from './components/ToastContainer';

const FileGrid = lazy(() => import('./components/FileGrid').then(m => ({ default: m.FileGrid })));
const DockerDashboard = lazy(() => import('./components/DockerDashboard').then(m => ({ default: m.DockerDashboard })));
const NetworkInterceptor = lazy(() => import('./components/NetworkInterceptor').then(m => ({ default: m.NetworkInterceptor })));
const DatabaseStudio = lazy(() => import('./components/DatabaseStudio').then(m => ({ default: m.DatabaseStudio })));
const VisualGit = lazy(() => import('./components/VisualGit').then(m => ({ default: m.VisualGit })));
const DevDocsViewer = lazy(() => import('./components/DevDocsViewer').then(m => ({ default: m.DevDocsViewer })));
const TerminalMultiplexer = lazy(() => import('./components/TerminalMultiplexer').then(m => ({ default: m.TerminalMultiplexer })));
const AutomationStudio = lazy(() => import('./components/AutomationStudio').then(m => ({ default: m.AutomationStudio })));
const PluginManager = lazy(() => import('./components/PluginManager').then(m => ({ default: m.PluginManager })));
const SandboxManager = lazy(() => import('./components/SandboxManager').then(m => ({ default: m.SandboxManager })));
const LocalAI = lazy(() => import('./components/LocalAI').then(m => ({ default: m.LocalAI })));
const MemoryProfiler = lazy(() => import('./components/MemoryProfiler').then(m => ({ default: m.MemoryProfiler })));
const PluginMarketplace = lazy(() => import('./components/PluginMarketplace').then(m => ({ default: m.PluginMarketplace })));
const ASTRefactor = lazy(() => import('./components/ASTRefactor').then(m => ({ default: m.ASTRefactor })));
const ZKPVault = lazy(() => import('./components/ZKPVault').then(m => ({ default: m.ZKPVault })));
const GPUCluster = lazy(() => import('./components/GPUCluster').then(m => ({ default: m.GPUCluster })));
const CollaborativeEditor = lazy(() => import('./components/CollaborativeEditor').then(m => ({ default: m.CollaborativeEditor })));
const SecretsManager = lazy(() => import('./components/SecretsManager').then(m => ({ default: m.SecretsManager })));
const PortTunnel = lazy(() => import('./components/PortTunnel').then(m => ({ default: m.PortTunnel })));
const VaultlyDashboard = lazy(() => import('./components/VaultlyDashboard').then(m => ({ default: m.VaultlyDashboard })));

export interface Tab {
  id: string;
  name: string;
  activeApp: 'home' | 'files' | 'docker' | 'network' | 'database' | 'git' | 'devdocs' | 'terminal' | 'automation' | 'plugins' | 'sandbox' | 'ai' | 'memory' | 'market' | 'ast' | 'zkp' | 'gpu' | 'crdt' | 'secrets' | 'tunnel';
  currentPath: string | null;
}

const SIDEBAR_ITEMS = [
  { id: 'home', icon: <LayoutDashboard size={20} />, label: 'Dashboard' },
  { id: 'files', icon: <HardDrive size={20} />, label: 'Vaults' },
  { id: 'git', icon: <GitBranch size={20} />, label: 'Git Client' },
  { id: 'terminal', icon: <TerminalSquare size={20} />, label: 'Terminal' },
  { id: 'secrets', icon: <Key size={20} />, label: 'Secrets' },
  { id: 'tunnel', icon: <Webhook size={20} />, label: 'Relay Tunnel' },
  { id: 'network', icon: <Network size={20} />, label: 'Proxy Interceptor' },
  { id: 'docker', icon: <Box size={20} />, label: 'Docker' },
  { id: 'database', icon: <HardDrive size={20} />, label: 'Databases' },
  { id: 'automation', icon: <Workflow size={20} />, label: 'Automation' },
  { id: 'ai', icon: <Zap size={20} />, label: 'Local AI' },
  { id: 'ast', icon: <Layers size={20} />, label: 'AST Engine' },
  { id: 'sandbox', icon: <MonitorPlay size={20} />, label: 'Nano-VMs' },
  { id: 'memory', icon: <Activity size={20} />, label: 'Memory Profiler' },
  { id: 'zkp', icon: <ShieldAlert size={20} />, label: 'ZKP Vault' },
  { id: 'crdt', icon: <Users size={20} />, label: 'Collab Editor' },
  { id: 'gpu', icon: <Cpu size={20} />, label: 'GPU Cluster' },
  { id: 'market', icon: <Store size={20} />, label: 'Marketplace' },
];

// Reusable icons for the ones not in lucide import above
function Activity(props: any) { return <svg {...props} xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"></polyline></svg>; }
function Users(props: any) { return <svg {...props} xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"></path><circle cx="9" cy="7" r="4"></circle><path d="M22 21v-2a4 4 0 0 0-3-3.87"></path><path d="M16 3.13a4 4 0 0 1 0 7.75"></path></svg>; }
function Cpu(props: any) { return <svg {...props} xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="4" y="4" width="16" height="16" rx="2" ry="2"></rect><rect x="9" y="9" width="6" height="6"></rect><line x1="9" y1="1" x2="9" y2="4"></line><line x1="15" y1="1" x2="15" y2="4"></line><line x1="9" y1="20" x2="9" y2="23"></line><line x1="15" y1="20" x2="15" y2="23"></line><line x1="20" y1="9" x2="23" y2="9"></line><line x1="20" y1="14" x2="23" y2="14"></line><line x1="1" y1="9" x2="4" y2="9"></line><line x1="1" y1="14" x2="4" y2="14"></line></svg>; }
function Store(props: any) { return <svg {...props} xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m2 7 4.41-4.41A2 2 0 0 1 7.83 2h8.34a2 2 0 0 1 1.42.59L22 7"></path><path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8"></path><path d="M15 22v-4a2 2 0 0 0-2-2h-2a2 2 0 0 0-2 2v4"></path><path d="M2 7h20"></path><path d="M22 7v3a2 2 0 0 1-2 2v0a2.7 2.7 0 0 1-1.59-.63.7.7 0 0 0-.82 0A2.7 2.7 0 0 1 16 12a2.7 2.7 0 0 1-1.59-.63.7.7 0 0 0-.82 0A2.7 2.7 0 0 1 12 12a2.7 2.7 0 0 1-1.59-.63.7.7 0 0 0-.82 0A2.7 2.7 0 0 1 8 12a2.7 2.7 0 0 1-1.59-.63.7.7 0 0 0-.82 0A2.7 2.7 0 0 1 4 12v0a2 2 0 0 1-2-2V7"></path></svg>; }

function App() {
  const activeApp = useStore(state => state.activeApp);
  const setActiveApp = useStore(state => state.setActiveApp);
  const currentPath = useStore(state => state.currentPath);
  const setCurrentPath = useStore(state => state.setCurrentPath);
  const selectedFile = useStore(state => state.selectedFile);
  const setSelectedFile = useStore(state => state.setSelectedFile);
  const canGoBack = useStore(state => state.canGoBack);
  const canGoForward = useStore(state => state.canGoForward);
  const goBack = useStore(state => state.goBack);
  const goForward = useStore(state => state.goForward);

  // Simple render map for animations
  const renderApp = () => {
    switch(activeApp) {
      case 'home': return <VaultlyDashboard onOpenApp={setActiveApp} />;
      case 'files': return <FileGrid currentPath={currentPath || ""} onNavigate={setCurrentPath} selectedFile={selectedFile} onSelect={setSelectedFile} onBack={goBack} onForward={goForward} canGoBack={canGoBack} canGoForward={canGoForward} />;
      case 'docker': return <DockerDashboard />;
      case 'network': return <NetworkInterceptor />;
      case 'database': return <DatabaseStudio />;
      case 'git': return <VisualGit currentPath={currentPath} />;
      case 'devdocs': return <DevDocsViewer />;
      case 'terminal': return <TerminalMultiplexer />;
      case 'automation': return <AutomationStudio />;
      case 'plugins': return <PluginManager currentPath={currentPath} />;
      case 'sandbox': return <SandboxManager currentPath={currentPath} />;
      case 'ai': return <LocalAI currentPath={currentPath} />;
      case 'memory': return <MemoryProfiler />;
      case 'market': return <PluginMarketplace />;
      case 'ast': return <ASTRefactor currentPath={currentPath} />;
      case 'zkp': return <ZKPVault />;
      case 'gpu': return <GPUCluster />;
      case 'crdt': return <CollaborativeEditor currentPath={currentPath} />;
      case 'secrets': return <SecretsManager />;
      case 'tunnel': return <PortTunnel />;
      default: return <VaultlyDashboard onOpenApp={setActiveApp} />;
    }
  };

  return (
    <div className="flex h-screen w-screen bg-[#050505] text-white font-sans overflow-hidden selection:bg-indigo-500/30">
      
      {/* Modern Floating Sidebar */}
      <nav className="w-16 hover:w-64 transition-all duration-300 ease-in-out bg-black/60 backdrop-blur-xl border-r border-white/5 flex flex-col items-center hover:items-start group z-50 absolute h-full top-0 left-0 hover:shadow-2xl hover:shadow-black/50">
        
        {/* Logo Area */}
        <div className="h-16 w-full flex items-center justify-center group-hover:justify-start group-hover:px-6 mb-4 border-b border-white/5">
          <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center shadow-lg shadow-indigo-500/20 shrink-0">
            <span className="font-black text-white text-lg">V</span>
          </div>
          <motion.span 
            initial={{ opacity: 0 }} 
            animate={{ opacity: 1 }} 
            className="ml-4 font-black tracking-widest uppercase text-transparent bg-clip-text bg-gradient-to-r from-gray-100 to-gray-500 hidden group-hover:block whitespace-nowrap"
          >
            Vaultly
          </motion.span>
        </div>

        {/* Scrollable Nav Items */}
        <div className="flex-1 w-full overflow-y-auto overflow-x-hidden no-scrollbar pb-6 flex flex-col gap-1 px-2 group-hover:px-4">
          {SIDEBAR_ITEMS.map((item) => {
            const isActive = activeApp === item.id;
            return (
              <button
                key={item.id}
                onClick={() => setActiveApp(item.id as any)}
                className={`w-full flex items-center h-12 rounded-xl transition-all duration-200 shrink-0 relative
                  ${isActive 
                    ? 'bg-white/10 text-white' 
                    : 'text-gray-500 hover:bg-white/5 hover:text-gray-300'
                  }`}
              >
                {/* Active Indicator Strip */}
                {isActive && (
                  <motion.div 
                    layoutId="activeTabIndicator"
                    className="absolute left-0 top-1/2 -translate-y-1/2 w-1 h-6 bg-indigo-500 rounded-r-full" 
                  />
                )}
                
                <div className="w-12 h-12 flex items-center justify-center shrink-0">
                  {item.icon}
                </div>
                <span className="font-medium text-sm whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity duration-200">
                  {item.label}
                </span>
              </button>
            );
          })}
        </div>

        {/* Settings at Bottom */}
        <div className="mt-auto w-full p-2 group-hover:p-4 border-t border-white/5 bg-black/40">
          <button className="w-full flex items-center h-12 rounded-xl text-gray-500 hover:bg-white/5 hover:text-gray-300 transition-all duration-200">
            <div className="w-12 h-12 flex items-center justify-center shrink-0"><Settings size={20} /></div>
            <span className="font-medium text-sm whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity duration-200">Settings</span>
          </button>
        </div>
      </nav>

      {/* Main Content Area - offset by sidebar width (16 = 4rem) */}
      <main className="flex-1 h-full relative ml-16 bg-[radial-gradient(ellipse_at_top_right,_var(--tw-gradient-stops))] from-indigo-900/10 via-[#050505] to-[#050505]">
        
        {/* Native Custom Title Bar */}
        <div data-tauri-drag-region className="h-8 w-full absolute top-0 left-0 z-40 flex justify-end items-center px-4 select-none">
          <button onClick={() => invoke('plugin:window|close')} className="w-3 h-3 rounded-full bg-red-500 hover:bg-red-400 cursor-pointer ml-2" />
          <button onClick={() => invoke('plugin:window|minimize')} className="w-3 h-3 rounded-full bg-yellow-500 hover:bg-yellow-400 cursor-pointer ml-2" />
          <button onClick={() => invoke('plugin:window|maximize')} className="w-3 h-3 rounded-full bg-green-500 hover:bg-green-400 cursor-pointer ml-2" />
        </div>

        <AnimatePresence mode="wait">
          <motion.div
            key={activeApp}
            initial={{ opacity: 0, y: 10, scale: 0.99 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -10, scale: 0.99 }}
            transition={{ duration: 0.2, ease: "easeInOut" }}
            className="w-full h-full absolute inset-0 pt-8"
          >
            <ErrorBoundary>
              <Suspense fallback={
                <div className="w-full h-full flex flex-col items-center justify-center">
                  <div className="w-8 h-8 border-4 border-indigo-500 border-t-transparent rounded-full animate-spin"></div>
                  <div className="mt-4 text-indigo-400 font-mono text-xs uppercase tracking-widest animate-pulse">Loading Module...</div>
                </div>
              }>
                {renderApp()}
              </Suspense>
            </ErrorBoundary>
          </motion.div>
        </AnimatePresence>
      </main>
      <ToastContainer />
    </div>
  );
}

export default App;
