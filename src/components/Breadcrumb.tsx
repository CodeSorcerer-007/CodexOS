import { useStore } from '../store/store';
import { ChevronRight, Home, ArrowLeft, ArrowRight } from 'lucide-react';
import { invoke } from '@tauri-apps/api/core';

export const Breadcrumb = () => {
  const currentPath = useStore(s => s.currentPath);
  const pushPath = useStore(s => s.pushPath);
  const canGoBack = useStore(s => s.canGoBack);
  const canGoForward = useStore(s => s.canGoForward);
  const goBack = useStore(s => s.goBack);
  const goForward = useStore(s => s.goForward);
  
  if (!currentPath) return null;
  
  const segments = currentPath.replace(/\\/g, '/').split('/').filter(Boolean);
  
  const navigateTo = (index: number) => {
    let newPath = segments.slice(0, index + 1).join('\\');
    if (!newPath.includes(':')) {
      newPath = '\\' + newPath;
    }
    pushPath(newPath);
  };
  
  return (
    <div className="flex items-center gap-2 px-4 py-3 bg-black/40 border-b border-white/5">
      <div className="flex items-center gap-1 mr-2">
        <button 
          disabled={!canGoBack} 
          onClick={goBack} 
          className="p-1 rounded text-gray-400 hover:text-white hover:bg-white/10 disabled:opacity-30 disabled:hover:bg-transparent transition-colors"
          title="Go Back"
        >
          <ArrowLeft size={16} />
        </button>
        <button 
          disabled={!canGoForward} 
          onClick={goForward} 
          className="p-1 rounded text-gray-400 hover:text-white hover:bg-white/10 disabled:opacity-30 disabled:hover:bg-transparent transition-colors"
          title="Go Forward"
        >
          <ArrowRight size={16} />
        </button>
      </div>
      
      <button 
        onClick={() => invoke<string>('get_current_dir').then(pushPath).catch(e => useStore.getState().addToast({ type: 'error', title: 'Home Dir Error', message: String(e) }))} 
        className="p-1.5 rounded text-gray-400 hover:text-yellow-400 hover:bg-white/10 transition-colors"
        title="Home Directory"
      >
        <Home size={16} />
      </button>
      
      <div className="flex items-center flex-wrap">
        {segments.map((seg, i) => (
          <div key={i} className="flex items-center">
            <ChevronRight size={14} className="text-gray-600 mx-1" />
            <button
              onClick={() => navigateTo(i)}
              className="text-sm font-mono text-gray-300 hover:text-white hover:bg-white/10 px-2 py-1 rounded transition-colors"
            >
              {seg}
            </button>
          </div>
        ))}
      </div>
    </div>
  );
};
