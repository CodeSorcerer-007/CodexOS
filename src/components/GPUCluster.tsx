import { useState, useEffect } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { useToast } from '../store/store';

interface GpuInfo {
  name: string;
  adapter_ram: string;
  driver_version: string;
  video_processor: string;
}

export const GPUCluster = () => {
  const [gpus, setGpus] = useState<GpuInfo[]>([]);
  const [utilization, setUtilization] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const { error: toastError } = useToast();

  useEffect(() => {
    invoke<GpuInfo[]>('get_gpu_info')
      .then(setGpus)
      .catch(e => {
        const errStr = String(e);
        setError(errStr);
        toastError('GPU Detection Failed', errStr);
      })
      .finally(() => setLoading(false));
    
    const poll = setInterval(async () => {
      try {
        const util = await invoke<number>('get_gpu_utilization');
        setUtilization(util);
      } catch (e: any) {
        console.warn("GPU utilization polling issue:", e);
      }
    }, 2000);
    
    return () => clearInterval(poll);
  }, [toastError]);

  return (
    <div className="flex flex-col h-full w-full bg-[#0a0f18] text-white p-6 gap-6">
      <div className="flex justify-between items-center border-b border-white/10 pb-4">
        <div>
          <h2 className="font-bold text-cyan-400 text-2xl mb-1">GPU Compute Cluster</h2>
          <p className="text-sm text-gray-400">Live GPU metrics and utilization across the system.</p>
        </div>
      </div>

      <div className="flex-1 overflow-auto">
        {loading ? (
          <div className="flex items-center justify-center h-full text-cyan-500">
            Scanning for GPUs...
          </div>
        ) : error ? (
          <div className="flex items-center justify-center h-full text-red-500">
            Error loading GPUs: {error}
          </div>
        ) : gpus.length === 0 ? (
          <div className="flex items-center justify-center h-full text-gray-400">
            No GPUs detected.
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {gpus.map((gpu, i) => (
              <div key={i} className="bg-black/50 border border-white/10 rounded-lg p-6 flex flex-col gap-4">
                <div className="flex justify-between items-start">
                  <div>
                    <h3 className="font-bold text-lg text-white mb-1">{gpu.name}</h3>
                    <p className="text-xs text-cyan-500 font-mono">{gpu.video_processor}</p>
                  </div>
                  <div className="text-right">
                    <div className="text-sm font-bold text-gray-300">VRAM</div>
                    <div className="text-lg text-cyan-400">{gpu.adapter_ram}</div>
                  </div>
                </div>
                
                <div className="flex gap-4 border-t border-white/5 pt-4">
                  <div className="flex-1">
                    <div className="text-xs text-gray-500 mb-1">Driver Version</div>
                    <div className="text-sm text-gray-300 font-mono">{gpu.driver_version}</div>
                  </div>
                </div>

                <div className="mt-4">
                  <div className="flex justify-between mb-2">
                    <span className="text-sm text-gray-400 font-bold">Utilization</span>
                    <span className="text-sm text-cyan-400 font-bold">{utilization}%</span>
                  </div>
                  <div className="w-full bg-gray-800 rounded-full h-3 overflow-hidden border border-white/5">
                    <div 
                      className="bg-cyan-500 h-full rounded-full transition-all duration-500 ease-out shadow-[0_0_10px_rgba(6,182,212,0.6)]"
                      style={{ width: `${utilization}%` }}
                    />
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};
