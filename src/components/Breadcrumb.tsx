import { useStore } from '../store/store';
import { ChevronRight, Home, ArrowLeft, ArrowRight, RotateCw } from 'lucide-react';
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
    <div
      className="flex items-center gap-2 px-3 bg-[#272727] border-b border-[rgba(255,255,255,0.08)]"
      style={{ height: '40px', fontFamily: 'system-ui, sans-serif' }}
    >
      {/* Back / Forward navigation buttons */}
      <div className="flex items-center gap-0.5">
        <button
          disabled={!canGoBack}
          onClick={goBack}
          className="p-1.5 rounded text-[#ababab] hover:text-[#e0e0e0] hover:bg-[rgba(255,255,255,0.08)] disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
          title="Go Back"
        >
          <ArrowLeft size={16} />
        </button>
        <button
          disabled={!canGoForward}
          onClick={goForward}
          className="p-1.5 rounded text-[#ababab] hover:text-[#e0e0e0] hover:bg-[rgba(255,255,255,0.08)] disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
          title="Go Forward"
        >
          <ArrowRight size={16} />
        </button>
        {/* Home button */}
        <button
          onClick={() =>
            invoke<string>('get_current_dir')
              .then(pushPath)
              .catch(e =>
                useStore.getState().addToast({ type: 'error', title: 'Home Dir Error', message: String(e) })
              )
          }
          className="p-1.5 rounded text-[#ababab] hover:text-[#e0e0e0] hover:bg-[rgba(255,255,255,0.08)] transition-colors"
          title="Home Directory"
        >
          <Home size={16} />
        </button>
      </div>

      {/* Address bar pill */}
      <div className="flex items-center flex-1 min-w-0 bg-[rgba(255,255,255,0.05)] border border-[rgba(255,255,255,0.1)] rounded px-3 py-1 gap-1 hover:border-[rgba(255,255,255,0.2)] transition-colors" style={{ height: '28px' }}>
        {segments.map((seg, i) => (
          <div key={i} className="flex items-center">
            {i > 0 && <ChevronRight size={12} className="text-[#767676] mx-0.5 flex-shrink-0" />}
            <button
              onClick={() => navigateTo(i)}
              className="text-[13px] text-[#e0e0e0] hover:text-white hover:bg-[rgba(255,255,255,0.08)] px-1.5 py-0.5 rounded transition-colors whitespace-nowrap leading-none"
            >
              {seg}
            </button>
          </div>
        ))}
      </div>

      {/* Refresh button */}
      <button
        onClick={() => pushPath(currentPath)}
        className="p-1.5 rounded text-[#ababab] hover:text-[#e0e0e0] hover:bg-[rgba(255,255,255,0.08)] transition-colors flex-shrink-0"
        title="Refresh"
      >
        <RotateCw size={15} />
      </button>
    </div>
  );
};
