import {
  ChevronRight24Regular,
  Folder24Filled,
  Desktop24Regular,
  HardDrive24Regular,
  Dismiss24Regular
} from '@fluentui/react-icons';
import { useFileGridContext } from './FileGridContext';

export const FileGridSidebar = () => {
  const {
    sidebarCollapsed, quickAccessExpanded, setQuickAccessExpanded,
    quickAccessItems, currentPath, onNavigate, handleUnpinQuickAccess,
    isThisPC, thisPcExpanded, setThisPcExpanded, drives
  } = useFileGridContext();

  return (
    <nav className={`${sidebarCollapsed ? 'w-[52px]' : 'w-[230px]'} shrink-0 bg-[#202020] border-r border-[rgba(255,255,255,0.08)] flex flex-col py-2 overflow-y-auto no-scrollbar transition-all duration-150`} onClick={e => e.stopPropagation()}>
      
      {/* Quick Access Section */}
      <div className="mb-3">
        {!sidebarCollapsed ? (
          <button 
            onClick={() => setQuickAccessExpanded(!quickAccessExpanded)}
            className="w-full flex items-center gap-2 px-3 py-1 text-[11px] font-semibold text-[#767676] hover:text-[#ababab] tracking-wide mb-1 uppercase"
          >
            <ChevronRight24Regular className={`w-3.5 h-3.5 transition-transform ${quickAccessExpanded ? 'rotate-90' : ''}`} />
            <span>Quick Access</span>
          </button>
        ) : (
          <div className="w-full flex justify-center text-[10px] font-bold text-[#767676] uppercase py-1">QA</div>
        )}

        {(quickAccessExpanded || sidebarCollapsed) && (
          <ul className="list-none px-2 space-y-0.5">
            {quickAccessItems.map(item => {
              const isActive = currentPath === item.path;
              return (
                <li key={item.path}>
                  <button 
                    onClick={() => onNavigate(item.path)}
                    title={item.label}
                    className={`w-full flex items-center ${sidebarCollapsed ? 'justify-center px-1' : 'justify-between px-2.5'} py-1.5 rounded text-[13px] transition-colors group ${isActive ? 'bg-[rgba(255,255,255,0.1)] text-white font-medium' : 'text-[#e0e0e0] hover:bg-[rgba(255,255,255,0.06)]'}`}
                  >
                    <div className="flex items-center gap-2.5 truncate min-w-0">
                      <Folder24Filled className={isActive ? "text-[#60cdff] flex-shrink-0" : "text-[#ababab] flex-shrink-0"} />
                      {!sidebarCollapsed && <span className="truncate">{item.label}</span>}
                    </div>
                    {!sidebarCollapsed && (
                      <span 
                        onClick={(e) => handleUnpinQuickAccess(e, item.path)}
                        title="Unpin from Quick Access"
                        className="p-0.5 rounded hover:bg-[rgba(255,255,255,0.15)] text-[#767676] hover:text-[#ff6b6b] opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0"
                      >
                        <Dismiss24Regular className="w-3.5 h-3.5" />
                      </span>
                    )}
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      <div className="w-full h-px bg-[rgba(255,255,255,0.08)] my-1"></div>

      {/* Hierarchical Tree Navigation: This PC & Drives */}
      <div className="px-2 mt-1">
        <div className="flex flex-col">
          <button 
            onClick={() => onNavigate('This PC')}
            title="This PC"
            className={`w-full flex items-center ${sidebarCollapsed ? 'justify-center px-1' : 'gap-2 px-2'} py-1.5 rounded text-[13px] transition-colors ${isThisPC ? 'bg-[rgba(255,255,255,0.1)] text-white font-medium' : 'text-[#e0e0e0] hover:bg-[rgba(255,255,255,0.06)]'}`}
          >
            {!sidebarCollapsed && (
              <span 
                onClick={(e) => { e.stopPropagation(); setThisPcExpanded(!thisPcExpanded); }}
                className="p-0.5 hover:bg-[rgba(255,255,255,0.1)] rounded"
              >
                <ChevronRight24Regular className={`text-[#ababab] transition-transform ${thisPcExpanded ? 'rotate-90' : ''}`} />
              </span>
            )}
            <Desktop24Regular className={isThisPC ? "text-[#60cdff]" : "text-[#ababab]"} />
            {!sidebarCollapsed && <span className="truncate">This PC</span>}
          </button>

          {/* Sub Tree under This PC */}
          {thisPcExpanded && (
            <div className="pl-6 space-y-0.5 mt-0.5">
              {drives.map(d => {
                const isDriveActive = currentPath.startsWith(d.mount_point);
                return (
                  <button 
                    key={d.mount_point}
                    onClick={() => onNavigate(d.mount_point)}
                    className={`w-full flex items-center gap-2 px-2 py-1 rounded text-[12px] transition-colors ${isDriveActive ? 'bg-[rgba(255,255,255,0.1)] text-white' : 'text-[#ababab] hover:bg-[rgba(255,255,255,0.06)] hover:text-[#e0e0e0]'}`}
                  >
                    <HardDrive24Regular className="text-[#767676]" />
                    <span className="truncate">{d.name ? `${d.name} (${d.mount_point})` : d.mount_point}</span>
                  </button>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </nav>
  );
};
