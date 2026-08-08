/* eslint-disable react/only-export-components */
import { useState, lazy, Suspense } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { motion, AnimatePresence } from 'framer-motion';
import { LayoutDashboard, HardDrive, Network, GitBranch, TerminalSquare, Settings, Workflow, Box, ShieldAlert, Zap, Layers, MonitorPlay, Key, Webhook, Activity, Users, Cpu, Store, FileCode2, FileText, Server } from 'lucide-react';

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
const CodexOSDashboard = lazy(() => import('./components/CodexOSDashboard').then(m => ({ default: m.CodexOSDashboard })));
const SettingsPage = lazy(() => import('./components/SettingsPage').then(m => ({ default: m.SettingsPage })));
const LocalCodeEditor = lazy(() => import('./components/LocalCodeEditor').then(m => ({ default: m.LocalCodeEditor })));
const HttpRequestBuilder = lazy(() => import('./components/HttpRequestBuilder').then(m => ({ default: m.HttpRequestBuilder })));
const ProcessManager = lazy(() => import('./components/ProcessManager').then(m => ({ default: m.ProcessManager })));
const EnvManager = lazy(() => import('./components/EnvManager').then(m => ({ default: m.EnvManager })));
const SshManager = lazy(() => import('./components/SshManager').then(m => ({ default: m.SshManager })));

import { TabBar } from './components/TabBar';
import { useKeyboardShortcuts } from './hooks/useKeyboardShortcuts';
import { KeyboardHelp } from './components/KeyboardHelp';
import { OnboardingWizard } from './components/OnboardingWizard';
import { VaultUnlock } from './components/VaultUnlock';
import { CommandPalette } from './components/CommandPalette';

export interface Tab {
  id: string;
  name: string;
  activeApp: 'home' | 'files' | 'editor' | 'docker' | 'network' | 'httpclient' | 'database' | 'git' | 'devdocs' | 'terminal' | 'automation' | 'plugins' | 'sandbox' | 'ai' | 'memory' | 'market' | 'ast' | 'zkp' | 'gpu' | 'crdt' | 'secrets' | 'tunnel' | 'settings' | 'process' | 'env' | 'ssh';
  currentPath: string | null;
}

export const SIDEBAR_ITEMS = [
  { id: 'home', icon: <LayoutDashboard size={20} />, label: 'Dashboard' },
  { id: 'files', icon: <HardDrive size={20} />, label: 'Vaults' },
  { id: 'editor', icon: <FileCode2 size={20} />, label: 'Code Editor' },
  { id: 'process', icon: <Activity size={20} />, label: 'Processes' },
  { id: 'env', icon: <FileText size={20} />, label: 'Env Manager' },
  { id: 'ssh', icon: <Server size={20} />, label: 'SSH Remote' },
  { id: 'git', icon: <GitBranch size={20} />, label: 'Git Client' },
  { id: 'terminal', icon: <TerminalSquare size={20} />, label: 'Terminal' },
  { id: 'secrets', icon: <Key size={20} />, label: 'Secrets' },
  { id: 'tunnel', icon: <Webhook size={20} />, label: 'Relay Tunnel' },
  { id: 'network', icon: <Network size={20} />, label: 'Proxy Interceptor' },
  { id: 'httpclient', icon: <Network size={20} />, label: 'HTTP Client' },
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



function App() {
  const [showOnboarding, setShowOnboarding] = useState(
    localStorage.getItem('codexos-onboarded') !== 'true'
  );
  
  useKeyboardShortcuts();
  
  const activeApp = useStore(state => state.activeApp);
  const setActiveApp = useStore(state => state.setActiveApp);
  const currentPath = useStore(state => state.currentPath);
  const setCurrentPath = useStore(state => state.setCurrentPath);
  const selectedFile = useStore(state => state.selectedFile);
  const setSelectedFile = useStore(state => state.setSelectedFile);
  const openFile = useStore(state => state.openFile);
  const theme = useStore(state => state.settings.theme);

  // Simple render map for animations
  const renderApp = () => {
    switch(activeApp) {
      case 'home': return <CodexOSDashboard onOpenApp={setActiveApp} />;
      case 'files': return <FileGrid currentPath={currentPath || ""} onNavigate={setCurrentPath} selectedFile={selectedFile} onSelect={setSelectedFile} onFileDoubleClicked={(path) => { openFile(path); setActiveApp('editor'); }} />;
      case 'editor': return <LocalCodeEditor />;
      case 'docker': return <DockerDashboard />;
      case 'network': return <NetworkInterceptor />;
      case 'httpclient': return <HttpRequestBuilder />;
      case 'database': return <DatabaseStudio />;
      case 'git': return <VisualGit currentPath={currentPath} />;
      case 'devdocs': return <DevDocsViewer />;
      case 'terminal': return <TerminalMultiplexer />;
      case 'process': return <ProcessManager />;
      case 'env': return <EnvManager />;
      case 'ssh': return <SshManager />;
      case 'automation': return <AutomationStudio />;
      case 'plugins': return <PluginManager currentPath={currentPath} />;
      case 'sandbox': return <SandboxManager currentPath={currentPath} />;
      case 'ai': return <LocalAI />;
      case 'memory': return <MemoryProfiler />;
      case 'market': return <PluginMarketplace />;
      case 'ast': return <ASTRefactor currentPath={currentPath} />;
      case 'zkp': return <ZKPVault />;
      case 'gpu': return <GPUCluster />;
      case 'crdt': return <CollaborativeEditor currentPath={currentPath} />;
      case 'secrets': return <SecretsManager />;
      case 'tunnel': return <PortTunnel />;
      case 'settings': return <SettingsPage />;
      default: return <CodexOSDashboard onOpenApp={setActiveApp} />;
    }
  };

  return (
    <div className={`flex h-screen w-screen bg-[#1a1a1a] text-white font-sans overflow-hidden selection:bg-indigo-500/30 ${theme === 'light' ? 'light-theme' : ''}`}>
      
      {/* Fixed Left Navigation Sidebar */}
      <nav aria-label="Main navigation" className="w-[220px] shrink-0 bg-[#202020] border-r border-[rgba(255,255,255,0.06)] flex flex-col h-full z-50">
        
        {/* Logo Area */}
        <div className="h-12 w-full flex items-center px-4 mb-2 border-b border-[rgba(255,255,255,0.06)]">
          <img src="/favicon.svg" alt="CodexOS" className="w-6 h-6 shrink-0" />
          <span className="ml-3 font-semibold text-[13px] text-[#e0e0e0] whitespace-nowrap tracking-wide">
            CodexOS
          </span>
        </div>

        {/* Scrollable Nav Items */}
        <div className="flex-1 w-full overflow-y-auto no-scrollbar pb-4 flex flex-col gap-0.5 px-3">
          {SIDEBAR_ITEMS.map((item, index) => {
            const isActive = activeApp === item.id;
            return (
              <button
                key={item.id}
                onClick={() => setActiveApp(item.id as Tab['activeApp'])}
                aria-label={item.label}
                aria-current={isActive ? 'page' : undefined}
                className={`w-full flex items-center h-9 rounded px-2 transition-all duration-150 shrink-0 relative
                  ${isActive 
                    ? 'bg-[rgba(255,255,255,0.1)] text-white font-medium' 
                    : 'text-[#ababab] hover:bg-[rgba(255,255,255,0.06)] hover:text-[#e0e0e0]'
                  }`}
              >
                <div className="w-8 h-9 flex items-center justify-center shrink-0 mr-2">
                  {item.icon}
                </div>
                <span className="font-normal text-[13px] whitespace-nowrap" title={`${item.label} (Ctrl+${index + 1})`}>
                  {item.label}
                </span>
              </button>
            );
          })}
        </div>

        {/* Settings at Bottom */}
        <div className="mt-auto w-full p-2 px-3 border-t border-[rgba(255,255,255,0.06)] bg-[#202020]">
          <button 
            onClick={() => setActiveApp('settings')}
            aria-label="Settings"
            aria-current={activeApp === 'settings' ? 'page' : undefined}
            className={`w-full flex items-center h-9 rounded px-2 transition-all duration-150 relative
              ${activeApp === 'settings' 
                ? 'bg-[rgba(255,255,255,0.1)] text-white font-medium' 
                : 'text-[#ababab] hover:bg-[rgba(255,255,255,0.06)] hover:text-[#e0e0e0]'
              }`}
          >
            <div className="w-8 h-9 flex items-center justify-center shrink-0 mr-2"><Settings size={20} /></div>
            <span className="font-normal text-[13px] whitespace-nowrap">Settings</span>
          </button>
        </div>
      </nav>

      {/* Main Content Area */}
      <main className="flex-1 h-full relative bg-[#202020]">
        
        {/* Native Custom Title Bar */}
        <div data-tauri-drag-region className="h-8 w-full absolute top-0 left-0 z-40 flex justify-end items-center px-4 select-none bg-[#202020]">
          <button onClick={() => invoke('plugin:window|close')} aria-label="Close window" className="w-3 h-3 rounded-full bg-red-500 hover:bg-red-400 cursor-pointer ml-2" />
          <button onClick={() => invoke('plugin:window|minimize')} aria-label="Minimize window" className="w-3 h-3 rounded-full bg-yellow-500 hover:bg-yellow-400 cursor-pointer ml-2" />
          <button onClick={() => invoke('plugin:window|maximize')} aria-label="Maximize window" className="w-3 h-3 rounded-full bg-green-500 hover:bg-green-400 cursor-pointer ml-2" />
        </div>

        <div className="absolute top-8 left-0 w-full z-30">
          <TabBar />
        </div>

        <AnimatePresence mode="wait">
          <motion.div
            key={activeApp}
            initial={{ opacity: 0, y: 10, scale: 0.99 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -10, scale: 0.99 }}
            transition={{ duration: 0.2, ease: "easeInOut" }}
            className="w-full h-full absolute inset-0 pt-[68px]"
          >
            <ErrorBoundary>
              <Suspense fallback={
                <div className="w-full h-full flex flex-col items-center justify-center">
                  <div className="w-8 h-8 border-4 border-[#0078d4] border-t-transparent rounded-full animate-spin"></div>
                  <div className="mt-4 text-[#0078d4] font-mono text-xs uppercase tracking-widest animate-pulse">Loading Module...</div>
                </div>
              }>
                <ErrorBoundary>
                  {renderApp()}
                </ErrorBoundary>
              </Suspense>
            </ErrorBoundary>
          </motion.div>
        </AnimatePresence>
      </main>
      <KeyboardHelp />
      <VaultUnlock />
      <CommandPalette />
      <ToastContainer />
      {showOnboarding && (
        <OnboardingWizard onComplete={() => {
          localStorage.setItem('codexos-onboarded', 'true');
          setShowOnboarding(false);
        }} />
      )}
    </div>
  );
}

export default App;
