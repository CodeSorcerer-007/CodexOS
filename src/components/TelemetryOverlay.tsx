import { useState, useEffect } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { motion } from 'framer-motion';

interface TelemetryData {
  cpu_usage: number;
  used_mem: number;
  total_mem: number;
  rx_bytes: number;
  tx_bytes: number;
}

const formatBytes = (bytes: number) => {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
};

export const TelemetryOverlay = () => {
  const [data, setData] = useState<TelemetryData | null>(null);

  useEffect(() => {
    const fetchTelemetry = async () => {
      try {
        const result = await invoke<TelemetryData>('get_system_telemetry');
        setData(result);
      } catch (e) {
        console.error("Telemetry error:", e);
      }
    };

    // Fetch immediately, then every second
    fetchTelemetry();
    const interval = setInterval(fetchTelemetry, 1000);
    return () => clearInterval(interval);
  }, []);

  if (!data) return null;

  const memPercent = (data.used_mem / data.total_mem) * 100;

  return (
    <motion.div 
      initial={{ opacity: 0, scale: 0.9 }}
      animate={{ opacity: 1, scale: 1 }}
      className="w-full mt-auto premium-card border border-white/10 rounded-xl p-3 pointer-events-none"
    >
      <div className="flex flex-col gap-2">
        {/* CPU */}
        <div>
          <div className="flex justify-between text-[10px] mb-1">
            <span className="text-gray-400 font-bold uppercase tracking-wider">CPU</span>
            <span className="text-cyan-400 font-mono">{data.cpu_usage.toFixed(1)}%</span>
          </div>
          <div className="w-full bg-black/50 rounded-full h-1 overflow-hidden">
            <div 
              className="bg-cyan-400 h-1 rounded-full transition-all duration-500 ease-out shadow-[0_0_8px_rgba(34,211,238,0.8)]"
              style={{ width: `${Math.min(data.cpu_usage, 100)}%` }}
            />
          </div>
        </div>

        {/* RAM */}
        <div>
          <div className="flex justify-between text-[10px] mb-1">
            <span className="text-gray-400 font-bold uppercase tracking-wider">RAM</span>
            <span className="text-purple-400 font-mono">{formatBytes(data.used_mem)} / {formatBytes(data.total_mem)}</span>
          </div>
          <div className="w-full bg-black/50 rounded-full h-1 overflow-hidden">
            <div 
              className="bg-purple-500 h-1 rounded-full transition-all duration-500 ease-out shadow-[0_0_8px_rgba(168,85,247,0.8)]"
              style={{ width: `${Math.min(memPercent, 100)}%` }}
            />
          </div>
        </div>

        {/* Network */}
        <div className="grid grid-cols-2 gap-1.5 mt-1">
          <div className="bg-black/30 rounded p-1.5 border border-white/5 flex flex-col items-center">
            <span className="text-[8px] text-gray-500 uppercase font-bold tracking-[0.2em] mb-0.5">Download</span>
            <span className="text-green-400 text-[10px] font-mono tracking-tighter">{formatBytes(data.rx_bytes)}/s</span>
          </div>
          <div className="bg-black/30 rounded p-1.5 border border-white/5 flex flex-col items-center">
            <span className="text-[8px] text-gray-500 uppercase font-bold tracking-[0.2em] mb-0.5">Upload</span>
            <span className="text-blue-400 text-[10px] font-mono tracking-tighter">{formatBytes(data.tx_bytes)}/s</span>
          </div>
        </div>
      </div>
    </motion.div>
  );
};
