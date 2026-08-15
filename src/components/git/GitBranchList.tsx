import { memo } from 'react';

export interface BranchInfo {
  name: string;
  hash: string;
  is_current: boolean;
  is_remote: boolean;
}

interface GitBranchListProps {
  branches: BranchInfo[];
  onCheckout: (branch: string) => void;
}

export const GitBranchList = memo(({ branches, onCheckout }: GitBranchListProps) => {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
      {branches.map((b) => (
        <div
          key={b.name}
          className={`p-4 rounded-lg border ${
            b.is_current
              ? 'border-cyan-500 bg-cyan-500/10'
              : 'border-white/10 bg-black/40 hover:border-white/30'
          } flex justify-between items-center`}
        >
          <div>
            <div className="font-mono text-sm font-bold text-white flex items-center gap-2">
              {b.name}{' '}
              {b.is_current && (
                <span className="text-[10px] bg-cyan-500 text-black px-1 rounded uppercase">Current</span>
              )}
            </div>
            <div className="text-xs text-gray-500 mt-1">
              {b.hash.substring(0, 7)} {b.is_remote ? '(Remote)' : '(Local)'}
            </div>
          </div>
          {!b.is_current && (
            <button
              onClick={() => onCheckout(b.name)}
              className="text-xs bg-white/10 hover:bg-white/20 px-3 py-1 rounded transition-colors"
            >
              Checkout
            </button>
          )}
        </div>
      ))}
    </div>
  );
});
