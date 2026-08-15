import { memo } from 'react';
import { ReactFlow, Background, Controls } from '@xyflow/react';
import '@xyflow/react/dist/style.css';

export interface GitCommitInfo {
  hash: string;
  message: string;
  date: string;
}

interface GitCommitGraphProps {
  history: GitCommitInfo[];
}

export const GitCommitGraph = memo(({ history }: GitCommitGraphProps) => {
  return (
    <div className="w-full h-full border border-white/10 rounded-lg overflow-hidden bg-black/50 relative">
      <ReactFlow
        nodes={history.map((commit, i) => ({
          id: commit.hash,
          position: { x: 50, y: i * 100 + 50 },
          data: {
            label: (
              <div className="flex flex-col text-left">
                <div className="font-bold text-sm text-cyan-400 max-w-[200px] truncate">
                  {commit.message}
                </div>
                <div className="text-xs text-gray-400 mt-1">
                  {commit.hash.substring(0, 7)} &bull; {commit.date}
                </div>
              </div>
            ),
          },
          type: 'default',
          style: {
            background: 'rgba(0,0,0,0.8)',
            border: '1px solid rgba(6,182,212,0.5)',
            color: 'white',
            borderRadius: '8px',
            padding: '10px',
            width: 250,
          },
        }))}
        edges={history.slice(0, -1).map((commit, i) => ({
          id: `e-${commit.hash}-${history[i + 1].hash}`,
          source: history[i + 1].hash,
          target: commit.hash,
          animated: true,
          style: { stroke: 'rgba(6,182,212,0.8)', strokeWidth: 2 },
        }))}
        fitView
      >
        <Background color="#ffffff" gap={16} size={1} />
        <Controls className="bg-black/80 border border-white/10 fill-white" />
      </ReactFlow>
      {history.length === 0 && (
        <div className="absolute inset-0 flex items-center justify-center text-gray-500 pointer-events-none">
          No commits found.
        </div>
      )}
    </div>
  );
});
