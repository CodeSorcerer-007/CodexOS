import React, { lazy } from 'react';
import { useStore } from '../../store/store';
import type { AppId } from '../../types/apps';

const CodexOSDashboard = lazy(() => import('../CodexOSDashboard').then(m => ({ default: m.CodexOSDashboard })));
const FileGrid = lazy(() => import('../FileGrid').then(m => ({ default: m.FileGrid })));
const LocalCodeEditor = lazy(() => import('../LocalCodeEditor').then(m => ({ default: m.LocalCodeEditor })));
const DockerDashboard = lazy(() => import('../DockerDashboard').then(m => ({ default: m.DockerDashboard })));
const NetworkInterceptor = lazy(() => import('../NetworkInterceptor').then(m => ({ default: m.NetworkInterceptor })));
const HttpRequestBuilder = lazy(() => import('../HttpRequestBuilder').then(m => ({ default: m.HttpRequestBuilder })));
const DatabaseStudio = lazy(() => import('../DatabaseStudio').then(m => ({ default: m.DatabaseStudio })));
const VisualGit = lazy(() => import('../VisualGit').then(m => ({ default: m.VisualGit })));
const DevDocsViewer = lazy(() => import('../DevDocsViewer').then(m => ({ default: m.DevDocsViewer })));
const TerminalMultiplexer = lazy(() => import('../TerminalMultiplexer').then(m => ({ default: m.TerminalMultiplexer })));
const ProcessManager = lazy(() => import('../ProcessManager').then(m => ({ default: m.ProcessManager })));
const EnvManager = lazy(() => import('../EnvManager').then(m => ({ default: m.EnvManager })));
const SshManager = lazy(() => import('../SshManager').then(m => ({ default: m.SshManager })));
const AutomationStudio = lazy(() => import('../AutomationStudio').then(m => ({ default: m.AutomationStudio })));
const PluginManager = lazy(() => import('../PluginManager').then(m => ({ default: m.PluginManager })));
const SandboxManager = lazy(() => import('../SandboxManager').then(m => ({ default: m.SandboxManager })));
const LocalAI = lazy(() => import('../LocalAI').then(m => ({ default: m.LocalAI })));
const MemoryProfiler = lazy(() => import('../MemoryProfiler').then(m => ({ default: m.MemoryProfiler })));
const PluginMarketplace = lazy(() => import('../PluginMarketplace').then(m => ({ default: m.PluginMarketplace })));
const ASTRefactor = lazy(() => import('../ASTRefactor').then(m => ({ default: m.ASTRefactor })));
const HMACVault = lazy(() => import('../HMACVault').then(m => ({ default: m.HMACVault })));
const GPUCluster = lazy(() => import('../GPUCluster').then(m => ({ default: m.GPUCluster })));
const CollaborativeEditor = lazy(() => import('../CollaborativeEditor').then(m => ({ default: m.CollaborativeEditor })));
const SecretsManager = lazy(() => import('../SecretsManager').then(m => ({ default: m.SecretsManager })));
const PortTunnel = lazy(() => import('../PortTunnel').then(m => ({ default: m.PortTunnel })));
const SettingsPage = lazy(() => import('../SettingsPage').then(m => ({ default: m.SettingsPage })));
const GridlineDashboard = lazy(() => import('../../gridline-dashboard/demo'));

const ROUTE_REGISTRY: Partial<Record<AppId, React.ComponentType<any>>> = {
  home: CodexOSDashboard,
  gridline: GridlineDashboard,
  files: FileGrid,
  editor: LocalCodeEditor,
  docker: DockerDashboard,
  network: NetworkInterceptor,
  httpclient: HttpRequestBuilder,
  database: DatabaseStudio,
  git: VisualGit,
  devdocs: DevDocsViewer,
  terminal: TerminalMultiplexer,
  process: ProcessManager,
  env: EnvManager,
  ssh: SshManager,
  automation: AutomationStudio,
  plugins: PluginManager,
  sandbox: SandboxManager,
  ai: LocalAI,
  memory: MemoryProfiler,
  market: PluginMarketplace,
  ast: ASTRefactor,
  hmac: HMACVault,
  gpu: GPUCluster,
  crdt: CollaborativeEditor,
  secrets: SecretsManager,
  tunnel: PortTunnel,
  settings: SettingsPage,
};

/* eslint-disable react-refresh/only-export-components */
export const useAppRouter = () => {
  const activeApp = useStore(state => state.activeApp);
  const currentPath = useStore(state => state.currentPath);
  const selectedFile = useStore(state => state.selectedFile);
  const setCurrentPath = useStore(state => state.setCurrentPath);
  const setSelectedFile = useStore(state => state.setSelectedFile);
  const openFile = useStore(state => state.openFile);
  const setActiveApp = useStore(state => state.setActiveApp);

  const Component = ROUTE_REGISTRY[activeApp] || CodexOSDashboard;

  return {
    Component,
    activeApp,
    currentPath,
    selectedFile,
    setCurrentPath,
    setSelectedFile,
    openFile,
    setActiveApp
  };
};

export const AppRouter: React.FC = () => {
  const { 
    Component, 
    activeApp, 
    currentPath, 
    selectedFile, 
    setCurrentPath, 
    setSelectedFile, 
    openFile, 
    setActiveApp 
  } = useAppRouter();

  // Handle specific props mapping based on activeApp
  const getProps = () => {
    switch (activeApp) {
      case 'files':
        return {
          currentPath: currentPath || '',
          onNavigate: setCurrentPath,
          selectedFile,
          onSelect: setSelectedFile,
          onFileDoubleClicked: (path: string) => {
            openFile(path);
            setActiveApp('editor');
          }
        };
      case 'home':
        return { onOpenApp: setActiveApp };
      case 'git':
      case 'plugins':
      case 'sandbox':
      case 'ast':
      case 'crdt':
        return { currentPath };
      default:
        return {};
    }
  };

  return <Component {...(getProps() as any)} />;
};
