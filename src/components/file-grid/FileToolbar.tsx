import React from 'react';
import {
  ArrowLeft24Regular,
  ArrowRight24Regular,
  ArrowUp24Regular,
  ArrowClockwise24Regular,
  Search24Regular,
  Grid24Regular,
  List24Regular,
  Add24Regular,
} from '@fluentui/react-icons';

interface FileToolbarProps {
  currentPath: string;
  canGoBack: boolean;
  canGoForward: boolean;
  onGoBack: () => void;
  onGoForward: () => void;
  onGoUp: () => void;
  onRefresh: () => void;
  searchQuery: string;
  onSearchChange: (query: string) => void;
  viewMode: 'grid' | 'list';
  onToggleViewMode: (mode: 'grid' | 'list') => void;
  onNewFolder: () => void;
}

export const FileToolbar: React.FC<FileToolbarProps> = ({
  currentPath,
  canGoBack,
  canGoForward,
  onGoBack,
  onGoForward,
  onGoUp,
  onRefresh,
  searchQuery,
  onSearchChange,
  viewMode,
  onToggleViewMode,
  onNewFolder,
}) => {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 p-4 border-b border-white/10 bg-black/40 backdrop-blur-md">
      {/* Navigation Buttons & Path Bar */}
      <div className="flex items-center gap-2 flex-1 min-w-[300px]">
        <button
          disabled={!canGoBack}
          onClick={onGoBack}
          className="p-2 rounded-lg bg-white/5 hover:bg-white/10 disabled:opacity-30 disabled:pointer-events-none transition-colors text-white"
          title="Back"
        >
          <ArrowLeft24Regular />
        </button>
        <button
          disabled={!canGoForward}
          onClick={onGoForward}
          className="p-2 rounded-lg bg-white/5 hover:bg-white/10 disabled:opacity-30 disabled:pointer-events-none transition-colors text-white"
          title="Forward"
        >
          <ArrowRight24Regular />
        </button>
        <button
          onClick={onGoUp}
          className="p-2 rounded-lg bg-white/5 hover:bg-white/10 transition-colors text-white"
          title="Up directory"
        >
          <ArrowUp24Regular />
        </button>
        <button
          onClick={onRefresh}
          className="p-2 rounded-lg bg-white/5 hover:bg-white/10 transition-colors text-white"
          title="Refresh"
        >
          <ArrowClockwise24Regular />
        </button>

        {/* Path Bar */}
        <div className="flex-1 bg-black/50 border border-white/10 rounded-xl px-3 py-1.5 text-xs font-mono text-cyan truncate">
          {currentPath || '/'}
        </div>
      </div>

      {/* Action Controls */}
      <div className="flex items-center gap-2">
        {/* Search */}
        <div className="relative">
          <Search24Regular className="absolute left-3 top-2.5 text-gray-400 w-4 h-4" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => onSearchChange(e.target.value)}
            placeholder="Filter files..."
            className="bg-black/50 border border-white/10 rounded-xl pl-9 pr-3 py-1.5 text-xs text-white placeholder:text-gray-500 focus:outline-none focus:border-cyan w-48"
          />
        </div>

        {/* New Folder */}
        <button
          onClick={onNewFolder}
          className="flex items-center gap-1.5 px-3 py-1.5 bg-cyan/20 border border-cyan/40 hover:bg-cyan/30 text-cyan rounded-xl text-xs font-bold transition-all"
        >
          <Add24Regular />
          <span>New Folder</span>
        </button>

        {/* View Mode Toggle */}
        <div className="flex bg-white/5 border border-white/10 rounded-xl p-0.5">
          <button
            onClick={() => onToggleViewMode('grid')}
            className={`p-1.5 rounded-lg transition-colors ${
              viewMode === 'grid' ? 'bg-cyan text-black' : 'text-gray-400 hover:text-white'
            }`}
            title="Grid View"
          >
            <Grid24Regular />
          </button>
          <button
            onClick={() => onToggleViewMode('list')}
            className={`p-1.5 rounded-lg transition-colors ${
              viewMode === 'list' ? 'bg-cyan text-black' : 'text-gray-400 hover:text-white'
            }`}
            title="List View"
          >
            <List24Regular />
          </button>
        </div>
      </div>
    </div>
  );
};
