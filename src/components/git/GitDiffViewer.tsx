import { memo } from 'react';

const renderDiff = (diff: string) => {
  return diff.split('\n').map((line, i) => {
    if (line.startsWith('+') && !line.startsWith('+++')) {
      return (
        <div key={i} className="bg-green-500/10 text-green-400 font-mono text-xs px-2">
          {line}
        </div>
      );
    }
    if (line.startsWith('-') && !line.startsWith('---')) {
      return (
        <div key={i} className="bg-red-500/10 text-red-400 font-mono text-xs px-2">
          {line}
        </div>
      );
    }
    if (line.startsWith('@@')) {
      return (
        <div key={i} className="bg-blue-500/10 text-blue-400 font-mono text-xs px-2">
          {line}
        </div>
      );
    }
    return (
      <div key={i} className="text-gray-500 font-mono text-xs px-2">
        {line}
      </div>
    );
  });
};

interface GitDiffViewerProps {
  selectedFile: string | null;
  diffContent: string;
}

export const GitDiffViewer = memo(({ selectedFile, diffContent }: GitDiffViewerProps) => {
  return (
    <div className="h-full flex flex-col">
      {!selectedFile ? (
        <div className="flex-1 flex items-center justify-center text-gray-500">
          Select a file from the Changes list to view its diff
        </div>
      ) : (
        <div className="flex-1 overflow-y-auto bg-black border border-white/10 rounded p-4 font-mono text-xs whitespace-pre-wrap">
          {diffContent ? renderDiff(diffContent) : <span className="text-gray-500">No diff available</span>}
        </div>
      )}
    </div>
  );
});
