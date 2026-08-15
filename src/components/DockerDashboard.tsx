import { useState, useEffect, useRef, useCallback, memo } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import { useToast } from '../store/store';

import type { DockerContainer } from '../types/bindings/DockerContainer';
import type { DockerImage } from '../types/bindings/DockerImage';
import type { ContainerStats } from '../types/bindings/ContainerStats';

// Import xterm
import { Terminal } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import '@xterm/xterm/css/xterm.css';

import { DockerContainerList } from './docker/DockerContainerList';
import { DockerContainerDetail } from './docker/DockerContainerDetail';
import { DockerImageList } from './docker/DockerImageList';

export const DockerDashboard = memo(() => {
  const [activeTab, setActiveTab] = useState<'containers' | 'images'>('containers');
  const [containers, setContainers] = useState<DockerContainer[]>([]);
  const [images, setImages] = useState<DockerImage[]>([]);
  const [loading, setLoading] = useState(true);
  const [dockerError, setDockerError] = useState<string | null>(null);

  const [selectedContainer, setSelectedContainer] = useState<DockerContainer | null>(null);
  const [containerStats, setContainerStats] = useState<ContainerStats | null>(null);
  const [containerEnv, setContainerEnv] = useState<string[]>([]);
  const [isStreaming, setIsStreaming] = useState(false);
  const terminalContainerRef = useRef<HTMLDivElement>(null);
  const termRef = useRef<Terminal | null>(null);

  const [pullImageName, setPullImageName] = useState('');
  const [confirmTarget, setConfirmTarget] = useState<{
    type: 'container' | 'image';
    id: string;
    name: string;
  } | null>(null);
  const { success: toastSuccess, error: toastError } = useToast();

  const fetchStats = useCallback(async (id: string) => {
    try {
      const stats = await invoke<ContainerStats>('get_container_stats', { containerId: id });
      setContainerStats(stats);
    } catch (e: unknown) {
      setContainerStats(null);
      toastError('Stats Error', e instanceof Error ? e.message : String(e));
    }
  }, [toastError]);

  const fetchEnv = useCallback(async (id: string) => {
    try {
      const inspectJson = await invoke<string>('docker_inspect', { containerId: id });
      const inspectObj = JSON.parse(inspectJson);
      const env = inspectObj[0]?.Config?.Env || [];
      setContainerEnv(env);
    } catch (e: unknown) {
      setContainerEnv([]);
      toastError('Env Fetch Error', e instanceof Error ? e.message : String(e));
    }
  }, [toastError]);

  const fetchContainers = useCallback(async () => {
    try {
      const result = await invoke<DockerContainer[]>('get_docker_containers');
      const safe = Array.isArray(result) ? result : [];
      setContainers(safe);
      setDockerError(null);
      if (selectedContainer) {
        const updated = safe.find((c) => c.id === selectedContainer.id);
        if (updated) setSelectedContainer(updated);
      }
    } catch (e: unknown) {
      console.error(e);
      setContainers([]);
      const msg = e instanceof Error ? e.message : String(e);
      setDockerError(msg);
      toastError('Failed to fetch containers', msg);
    }
  }, [selectedContainer, toastError]);

  const fetchImages = useCallback(async () => {
    try {
      const result = await invoke<DockerImage[]>('get_docker_images');
      setImages(Array.isArray(result) ? result : []);
      setDockerError(null);
    } catch (e: unknown) {
      console.error(e);
      setImages([]);
      const msg = e instanceof Error ? e.message : String(e);
      setDockerError(msg);
      toastError('Failed to fetch images', msg);
    }
  }, [toastError]);

  const initialLoad = useCallback(async () => {
    setLoading(true);
    await Promise.all([fetchContainers(), fetchImages()]);
    setLoading(false);
  }, [fetchContainers, fetchImages]);

  useEffect(() => {
    initialLoad();
    const interval = setInterval(() => {
      fetchContainers();
      if (activeTab === 'images') fetchImages();

      // Update stats if selected container is running
      if (selectedContainer && selectedContainer.state.toLowerCase() === 'running') {
        fetchStats(selectedContainer.id);
      }
    }, 5000);
    return () => clearInterval(interval);
  }, [activeTab, selectedContainer, initialLoad, fetchContainers, fetchImages, fetchStats]);

  useEffect(() => {
    if (selectedContainer) {
      fetchStats(selectedContainer.id);
      fetchEnv(selectedContainer.id);
      termRef.current?.clear();
      setIsStreaming(false);
    }
  }, [selectedContainer, fetchStats, fetchEnv]);

  const handleAction = async (containerId: string, action: string) => {
    try {
      await invoke('docker_action', { containerId, action });
      toastSuccess('Success', `Action '${action}' completed on container ${containerId}`);
      fetchContainers();
    } catch (e: unknown) {
      toastError('Action Failed', e instanceof Error ? e.message : String(e));
    }
  };

  const streamLogs = async (containerId: string) => {
    setIsStreaming(true);
    termRef.current?.clear();
    try {
      await invoke('stream_docker_logs', { containerId, tailLines: 100 });
    } catch (e: unknown) {
      toastError('Logs Error', e instanceof Error ? e.message : String(e));
      setIsStreaming(false);
    }
  };

  useEffect(() => {
    if (selectedContainer && isStreaming) {
      const eventName = `docker-log-${selectedContainer.id}`;
      let unlisten: () => void;
      listen<string>(eventName, (event) => {
        if (termRef.current) {
          termRef.current.writeln(event.payload);
        }
      }).then((fn) => {
        unlisten = fn;
      });
      return () => {
        if (unlisten) unlisten();
      };
    }
  }, [selectedContainer, isStreaming]);

  useEffect(() => {
    if (!terminalContainerRef.current) return;
    const term = new Terminal({
      theme: { background: '#000000', foreground: '#e2e8f0' },
      fontFamily: "'JetBrains Mono', 'Fira Code', monospace",
      fontSize: 13,
      convertEol: true,
    });
    const fitAddon = new FitAddon();
    term.loadAddon(fitAddon);
    term.open(terminalContainerRef.current);
    fitAddon.fit();
    termRef.current = term;

    const handleResize = () => fitAddon.fit();
    window.addEventListener('resize', handleResize);

    return () => {
      window.removeEventListener('resize', handleResize);
      term.dispose();
    };
  }, []);

  const handlePullImage = async () => {
    if (!pullImageName) return;
    try {
      toastSuccess('Pulling', `Started pulling ${pullImageName}...`);
      await invoke('docker_pull_image', { image: pullImageName });
      setTimeout(fetchImages, 5000);
    } catch (e: unknown) {
      toastError('Pull Failed', e instanceof Error ? e.message : String(e));
    }
  };

  const handleRemoveImage = async (imageId: string) => {
    try {
      await invoke('docker_remove_image', { imageId });
      toastSuccess('Success', `Removed image ${imageId}`);
      fetchImages();
    } catch (e: unknown) {
      toastError('Remove Failed', e instanceof Error ? e.message : String(e));
    }
  };

  if (loading && containers.length === 0) {
    return (
      <div className="flex-1 flex items-center justify-center animate-pulse text-cyan">
        Connecting to Docker Engine...
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6 h-full p-2">
      <div className="flex justify-between items-center px-4">
        <h2 className="text-3xl font-extrabold text-transparent bg-clip-text bg-gradient-to-r from-blue-400 to-cyan-300 drop-shadow-[0_0_15px_rgba(59,130,246,0.3)]">
          Docker Engine
        </h2>

        <div className="flex gap-2 bg-black/40 p-1 rounded-lg border border-white/10">
          <button
            onClick={() => setActiveTab('containers')}
            className={`px-4 py-2 rounded-md transition-colors font-bold text-sm ${
              activeTab === 'containers' ? 'bg-blue-600/50 text-white' : 'text-gray-400 hover:text-white'
            }`}
          >
            Containers
          </button>
          <button
            onClick={() => setActiveTab('images')}
            className={`px-4 py-2 rounded-md transition-colors font-bold text-sm ${
              activeTab === 'images' ? 'bg-blue-600/50 text-white' : 'text-gray-400 hover:text-white'
            }`}
          >
            Images
          </button>
        </div>
      </div>

      {dockerError && (
        <div className="mx-4 bg-amber-500/10 border border-amber-500/30 rounded-lg px-4 py-3 flex flex-wrap items-center justify-between text-amber-200 text-sm gap-2">
          <div className="flex items-center gap-2">
            <span className="font-semibold text-amber-400">Docker Status:</span>
            <span className="font-mono text-xs">{dockerError}</span>
          </div>
          <button
            onClick={initialLoad}
            className="px-3 py-1 bg-amber-500/20 hover:bg-amber-500/30 border border-amber-500/40 rounded text-xs text-white font-medium transition-colors"
          >
            Retry Connection
          </button>
        </div>
      )}

      {activeTab === 'containers' && (
        <div className="flex-1 overflow-hidden grid grid-cols-1 lg:grid-cols-3 gap-4">
          <DockerContainerList
            containers={containers}
            selectedContainer={selectedContainer}
            onSelect={setSelectedContainer}
          />
          <DockerContainerDetail
            selectedContainer={selectedContainer}
            containerStats={containerStats}
            containerEnv={containerEnv}
            isStreaming={isStreaming}
            terminalContainerRef={terminalContainerRef}
            termRef={termRef}
            onAction={handleAction}
            onStreamLogs={streamLogs}
            onStopStream={() => setIsStreaming(false)}
            onRequestRemove={(c) => setConfirmTarget({ type: 'container', id: c.id, name: c.name })}
          />
        </div>
      )}

      {activeTab === 'images' && (
        <DockerImageList
          images={images}
          pullImageName={pullImageName}
          onPullImageNameChange={setPullImageName}
          onPullImage={handlePullImage}
          onRequestRemove={(img) =>
            setConfirmTarget({ type: 'image', id: img.id, name: `${img.repository}:${img.tag}` })
          }
        />
      )}

      {confirmTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
          <div className="bg-panel border border-white/10 rounded-xl p-6 max-w-md w-full flex flex-col gap-4 shadow-2xl">
            <h3 className="text-xl font-bold text-white">Confirm Deletion</h3>
            <p className="text-gray-300 text-sm">
              Are you sure you want to remove {confirmTarget.type}{' '}
              <span className="font-mono text-cyan-400 font-bold">{confirmTarget.name}</span>?
            </p>
            <div className="flex justify-end gap-3 mt-2">
              <button
                onClick={() => setConfirmTarget(null)}
                className="px-4 py-2 bg-white/10 hover:bg-white/20 text-white rounded-lg text-sm transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={() => {
                  if (confirmTarget.type === 'container') {
                    handleAction(confirmTarget.id, 'rm');
                  } else {
                    handleRemoveImage(confirmTarget.id);
                  }
                  setConfirmTarget(null);
                }}
                className="px-4 py-2 bg-red-600 hover:bg-red-500 text-white font-bold rounded-lg text-sm transition-colors"
              >
                Remove
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
});
