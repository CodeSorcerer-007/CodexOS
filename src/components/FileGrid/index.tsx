import { FileGridProvider, useFileGridContext } from './FileGridContext';
import { FileGridHeader } from './FileGridHeader';
import { FileGridSidebar } from './FileGridSidebar';
import { FileGridMain } from './FileGridMain';
import { FileGridFooter } from './FileGridFooter';

const FileGridInner = () => {
  const { setSelectedFiles, setLastSelected } = useFileGridContext();
  return (
    <div 
      className="flex flex-col h-full w-full bg-[#191919] text-[#e0e0e0] font-['Segoe_UI_Variable_Text','Segoe_UI',sans-serif] select-none selection:bg-[#3867d6]/30" 
      onClick={() => { setSelectedFiles(new Set()); setLastSelected(null); }}
    >
      <FileGridHeader />
      <div className="flex-1 flex overflow-hidden">
        <FileGridSidebar />
        <FileGridMain />
      </div>
      <FileGridFooter />
    </div>
  );
};

export const FileGrid = (props: {
  currentPath: string;
  onNavigate: (path: string) => void;
  selectedFile: string | null;
  onSelect: (path: string) => void;
  onAddToShelf?: (path: string) => void;
  onOptimizeAsset?: (path: string) => void;
  onFileDoubleClicked?: (path: string) => void;
}) => {
  return (
    <FileGridProvider {...props}>
      <FileGridInner />
    </FileGridProvider>
  );
};
