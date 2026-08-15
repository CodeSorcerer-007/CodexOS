import { Grid24Regular, List24Regular } from '@fluentui/react-icons';
import { useFileGridContext } from './FileGridContext';
import { formatSize } from './utils';
import { useMemo } from 'react';

export const FileGridFooter = () => {
  const {
    isThisPC, drives, files, selectedFiles, viewMode, setViewMode
  } = useFileGridContext();

  const selectedSize = useMemo(() => {
    let total = 0;
    files.forEach(f => {
      if (selectedFiles.has(f.path)) total += f.size_bytes;
    });
    return total;
  }, [files, selectedFiles]);

  return (
    <footer className="h-[26px] shrink-0 bg-[#202020] border-t border-[rgba(255,255,255,0.08)] flex items-center justify-between px-3 text-[12px] text-[#ababab]" onClick={e => e.stopPropagation()}>
      <div className="flex items-center gap-2">
        <span>{isThisPC ? `${drives.length} items` : `${files.length} items`}</span>
        {selectedFiles.size > 0 && !isThisPC && (
          <>
            <span className="text-[rgba(255,255,255,0.2)]">|</span>
            <span className="text-[#e0e0e0]">{selectedFiles.size} item{selectedFiles.size > 1 ? 's' : ''} selected</span>
            {selectedSize > 0 && (
               <>
                 <span className="text-[rgba(255,255,255,0.2)]">|</span>
                 <span className="text-[#e0e0e0]">{formatSize(selectedSize)}</span>
               </>
            )}
          </>
        )}
      </div>

      <div className="flex items-center gap-1">
        <button 
          onClick={() => setViewMode('grid')}
          className={`p-1 rounded transition-colors ${viewMode === 'grid' ? 'bg-[rgba(255,255,255,0.12)] text-white' : 'hover:bg-[rgba(255,255,255,0.06)] text-[#767676]'}`}
          title="Large icons grid"
        >
          <Grid24Regular />
        </button>
        <button 
          onClick={() => setViewMode('list')}
          className={`p-1 rounded transition-colors ${viewMode === 'list' ? 'bg-[rgba(255,255,255,0.12)] text-white' : 'hover:bg-[rgba(255,255,255,0.06)] text-[#767676]'}`}
          title="Details list"
        >
          <List24Regular />
        </button>
      </div>
    </footer>
  );
};
