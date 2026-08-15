import { memo, type RefObject } from 'react';
import type { DockerContainer } from '../../types/bindings/DockerContainer';
import type { ContainerStats } from '../../types/bindings/ContainerStats';
import type { Terminal } from '@xterm/xterm';

interface DockerContainerDetailProps {
  selectedContainer: DockerContainer | null;
  containerStats: ContainerStats | null;
  containerEnv: string[];
  isStreaming: boolean;
  terminalContainerRef: RefObject<HTMLDivElement | null>;
  termRef: RefObject<Terminal | null>;
  onAction: (containerId: string, action: string) => void;
  onStreamLogs: (containerId: string) => void;
  onStopStream: () => void;
  onRequestRemove: (container: DockerContainer) => void;
}

export const DockerContainerDetail = memo(({
  selectedContainer,
  containerStats,
  containerEnv,
  isStreaming,
  terminalContainerRef,
  termRef,
  onAction,
  onStreamLogs,
  onStopStream,
  onRequestRemove,
}: DockerContainerDetailProps) => {
  if (!selectedContainer) {
    return (
      <div className="lg:col-span-2 flex flex-col gap-4 overflow-hidden h-full">
        <div className="premium-card p-6 flex-1 flex items-center justify-center text-gray-500">
          Select a container to view details
        </div>
      </div>
    );
  }

  const isRunning = selectedContainer.state.toLowerCase() === 'running';

  return (
    <div className="lg:col-span-2 flex flex-col gap-4 overflow-hidden h-full">
      {/* Top: Details & Actions */}
      <div className="premium-card p-6 flex flex-col gap-4">
        <div className="flex justify-between items-start border-b border-white/10 pb-4">
          <div>
            <h3 className="text-2xl font-bold text-white flex items-center gap-3">
              {selectedContainer.name}
              <span
                className={`text-xs px-2 py-1 rounded-full ${
                  isRunning ? 'bg-green-500/20 text-green-400' : 'bg-gray-500/20 text-gray-400'
                }`}
              >
                {selectedContainer.state}
              </span>
            </h3>
            <p className="text-sm text-gray-400 font-mono mt-1">{selectedContainer.id}</p>
          </div>

          <div className="flex gap-2">
            {!isRunning && (
              <button
                onClick={() => onAction(selectedContainer.id, 'start')}
                className="px-3 py-1.5 bg-green-500/20 text-green-400 border border-green-500/50 rounded hover:bg-green-500/30 text-sm font-bold transition-colors"
              >
                Start
              </button>
            )}
            {isRunning && (
              <>
                <button
                  onClick={() => onAction(selectedContainer.id, 'stop')}
                  className="px-3 py-1.5 bg-amber-500/20 text-amber-400 border border-amber-500/50 rounded hover:bg-amber-500/30 text-sm font-bold transition-colors"
                >
                  Stop
                </button>
                <button
                  onClick={() => onAction(selectedContainer.id, 'restart')}
                  className="px-3 py-1.5 bg-blue-500/20 text-blue-400 border border-blue-500/50 rounded hover:bg-blue-500/30 text-sm font-bold transition-colors"
                >
                  Restart
                </button>
              </>
            )}
            <button
              onClick={() => onRequestRemove(selectedContainer)}
              className="px-3 py-1.5 bg-red-500/20 text-red-400 border border-red-500/50 rounded hover:bg-red-500/30 text-sm font-bold transition-colors"
            >
              Remove
            </button>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="flex flex-col gap-2 bg-black/30 p-3 rounded-lg border border-white/5">
            <span className="text-xs uppercase text-gray-500 font-bold">Image</span>
            <span className="font-mono text-sm text-cyan-300 truncate">{selectedContainer.image}</span>
            <span className="text-xs uppercase text-gray-500 font-bold mt-2">Status</span>
            <span className="text-sm text-gray-300">{selectedContainer.status}</span>
          </div>

          {isRunning && containerStats && (
            <div className="flex flex-col gap-2 bg-black/30 p-3 rounded-lg border border-white/5">
              <span className="text-xs uppercase text-gray-500 font-bold">Live Stats</span>
              <div className="grid grid-cols-2 gap-2 text-sm">
                <div><span className="text-gray-500">CPU:</span> <span className="text-blue-300">{containerStats.cpu_perc}</span></div>
                <div><span className="text-gray-500">MEM:</span> <span className="text-green-300">{containerStats.mem_usage}</span></div>
                <div className="col-span-2"><span className="text-gray-500">NET IO:</span> <span className="text-purple-300">{containerStats.net_io}</span></div>
              </div>
            </div>
          )}
        </div>

        {containerEnv.length > 0 && (
          <div className="mt-2 h-32 overflow-auto bg-black/30 p-3 rounded-lg border border-white/5">
            <span className="text-xs uppercase text-gray-500 font-bold mb-2 block">Environment Variables</span>
            <div className="flex flex-col gap-1">
              {containerEnv.map((env, idx) => (
                <div key={idx} className="text-xs font-mono text-gray-400 bg-white/5 px-2 py-1 rounded truncate">{env}</div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Bottom: Logs */}
      <div className="premium-card flex-1 flex flex-col overflow-hidden min-h-[300px]">
        <div className="p-3 border-b border-white/10 flex justify-between items-center bg-black/20">
          <span className="font-bold text-gray-300">Container Logs</span>
          <div className="flex gap-2">
            <button
              onClick={() => termRef.current?.clear()}
              className="px-3 py-1 bg-white/5 hover:bg-white/10 text-xs rounded transition-colors text-gray-300"
            >
              Clear
            </button>
            {!isStreaming ? (
              <button
                onClick={() => onStreamLogs(selectedContainer.id)}
                className="px-3 py-1 bg-blue-500/20 text-blue-400 border border-blue-500/50 hover:bg-blue-500/30 text-xs rounded transition-colors"
              >
                Stream Logs
              </button>
            ) : (
              <button
                onClick={onStopStream}
                className="px-3 py-1 bg-amber-500/20 text-amber-400 border border-amber-500/50 hover:bg-amber-500/30 text-xs rounded transition-colors"
              >
                Stop Stream
              </button>
            )}
          </div>
        </div>

        <div className="flex-1 overflow-hidden bg-black relative">
          {!isStreaming && (
            <div className="absolute inset-0 z-10 pointer-events-none flex items-center justify-center text-gray-600 italic bg-black/50 backdrop-blur-sm">
              Click &quot;Stream Logs&quot; to start capturing.
            </div>
          )}
          <div ref={terminalContainerRef} className="w-full h-full p-2" />
        </div>
      </div>
    </div>
  );
});
