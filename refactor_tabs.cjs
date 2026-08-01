const fs = require('fs');

const path = 'E:/Vaultly/src/App.tsx';
let content = fs.readFileSync(path, 'utf-8');

const tab_interface = `
export interface Tab {
  id: string;
  name: string;
  activeApp: 'files' | 'docker' | 'network' | 'database' | 'git' | 'devdocs';
  currentPath: string | null;
}
`;
content = content.replace('interface DriveInfo {', tab_interface + '\ninterface DriveInfo {');

const old_state = `  const [currentPath, setCurrentPath] = useState<string | null>(null);
  const [activeApp, setActiveApp] = useState<'files' | 'docker' | 'network'>('files');`;

const new_state = `  const [tabs, setTabs] = useState<Tab[]>(() => {
    const saved = localStorage.getItem('vaultly-tabs');
    if (saved) return JSON.parse(saved);
    return [{ id: 'tab-1', name: 'Home', activeApp: 'files', currentPath: null }];
  });
  const [activeTabIndex, setActiveTabIndex] = useState(() => {
    const savedIdx = localStorage.getItem('vaultly-active-tab');
    return savedIdx ? parseInt(savedIdx, 10) : 0;
  });

  useEffect(() => {
    localStorage.setItem('vaultly-tabs', JSON.stringify(tabs));
    localStorage.setItem('vaultly-active-tab', activeTabIndex.toString());
  }, [tabs, activeTabIndex]);

  const activeTab = tabs[activeTabIndex] || tabs[0];
  const activeApp = activeTab.activeApp;
  const currentPath = activeTab.currentPath;

  const setActiveApp = (app: Tab['activeApp']) => {
    const newTabs = [...tabs];
    newTabs[activeTabIndex].activeApp = app;
    setTabs(newTabs);
  };
  
  const setCurrentPath = (path: string | null) => {
    const newTabs = [...tabs];
    newTabs[activeTabIndex].currentPath = path;
    if (path) {
       newTabs[activeTabIndex].name = path.split('\\\\').pop()?.split('/').pop() || 'Folder';
    } else {
       newTabs[activeTabIndex].name = 'Home';
    }
    setTabs(newTabs);
  };
  
  const addTab = () => {
    const newTabs = [...tabs, { id: \`tab-\${Date.now()}\`, name: 'Home', activeApp: 'files', currentPath: null }];
    setTabs(newTabs);
    setActiveTabIndex(newTabs.length - 1);
  };
  
  const closeTab = (idx: number, e: React.MouseEvent) => {
    e.stopPropagation();
    if (tabs.length === 1) return;
    const newTabs = tabs.filter((_, i) => i !== idx);
    setTabs(newTabs);
    if (activeTabIndex >= newTabs.length) {
      setActiveTabIndex(newTabs.length - 1);
    } else if (activeTabIndex > idx) {
      setActiveTabIndex(activeTabIndex - 1);
    }
  };`;

content = content.replace(old_state, new_state);

const tab_bar_ui = `      <main className="flex-1 flex flex-col relative z-10">
        {/* Tab Bar */}
        <div className="h-10 bg-black/60 border-b border-white/5 flex items-center px-2 overflow-x-auto no-scrollbar">
          {tabs.map((tab, idx) => (
            <div 
              key={tab.id}
              onClick={() => setActiveTabIndex(idx)}
              className={\`flex items-center gap-2 px-4 py-1.5 min-w-[120px] max-w-[200px] rounded-t-lg cursor-pointer transition-colors border-t border-x \${activeTabIndex === idx ? 'bg-panel border-white/10 text-white shadow-lg' : 'bg-transparent border-transparent text-gray-500 hover:bg-white/5'}\`}
            >
              <div className="w-2 h-2 rounded-full" style={{ backgroundColor: tab.activeApp === 'docker' ? '#3B82F6' : tab.activeApp === 'network' ? '#A855F7' : '#00E5FF' }}></div>
              <span className="text-xs font-medium truncate flex-1 select-none">{tab.name}</span>
              {tabs.length > 1 && (
                <button 
                  onClick={(e) => closeTab(idx, e)}
                  className="text-gray-500 hover:text-red-400 p-0.5 rounded-md hover:bg-white/10 transition-colors"
                >
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
                </button>
              )}
            </div>
          ))}
          <button 
            onClick={addTab}
            className="ml-2 w-8 h-8 rounded-lg flex items-center justify-center text-gray-500 hover:text-white hover:bg-white/10 transition-colors"
          >
            +
          </button>
        </div>

        <header className="h-20 liquid-glass flex items-center px-8 justify-between relative z-20 border-b border-white/5">`;

content = content.replace('      <main className="flex-1 flex flex-col relative z-10">\n        <header className="h-20 liquid-glass flex items-center px-8 justify-between relative z-20">', tab_bar_ui);

fs.writeFileSync(path, content);
