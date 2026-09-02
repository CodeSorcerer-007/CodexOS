import { useState } from 'react';
import { motion } from 'framer-motion';
import { invoke } from '@tauri-apps/api/core';
import { useToast } from '../store/store';
import { Cpu, Play, Terminal, Shield, CheckCircle2, AlertCircle, RefreshCw, Folder, Zap } from 'lucide-react';

interface NanoVmResult {
  success: boolean;
  stdout: string;
  stderr: string;
  exit_code: number;
  fuel_consumed: number;
  execution_time_ms: number;
  exports: string[];
}

export const SandboxManager = ({ currentPath }: { currentPath: string | null }) => {
  const [vmPath, setVmPath] = useState(':demo:calc');
  const [mountedDir, setMountedDir] = useState(currentPath || '');
  const [isBooting, setIsBooting] = useState(false);
  const [result, setResult] = useState<NanoVmResult | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const { error: toastError, success: toastSuccess } = useToast();

  const handleBootVm = async () => {
    setIsBooting(true);
    setErrorMsg(null);
    try {
      const res = await invoke<NanoVmResult>('run_wasi_nano_vm', {
        path: vmPath.trim() || ':demo:calc',
        mountedDir: mountedDir.trim(),
      });
      setResult(res);
      if (res.success) {
        toastSuccess('Nano-VM Executed', `Finished in ${res.execution_time_ms}ms with ${res.fuel_consumed.toLocaleString()} fuel consumed.`);
      } else {
        toastError('Nano-VM Returned Error', `Exit code: ${res.exit_code}`);
      }
    } catch (e: unknown) {
      const errStr = e instanceof Error ? e.message : String(e);
      setErrorMsg(errStr);
      toastError('Nano-VM Boot Failed', errStr);
    } finally {
      setIsBooting(false);
    }
  };

  return (
    <div className="flex h-full w-full bg-[#0a0f18] text-white">
      {/* Left Control Panel */}
      <div className="w-96 border-r border-white/10 p-6 flex flex-col gap-6 bg-black/40 overflow-y-auto shrink-0">
        <div>
          <div className="flex items-center gap-2">
            <Cpu className="text-emerald-400 w-6 h-6" />
            <h2 className="font-bold text-emerald-400 text-xl">WASI Nano-VM Sandbox</h2>
          </div>
          <p className="text-xs text-gray-400 mt-1">
            Hardware-isolated WebAssembly VMs powered by Wasmtime with deterministic fuel compute limits.
          </p>
        </div>

        {/* Security & Sandbox Badges */}
        <div className="bg-emerald-950/30 border border-emerald-500/30 rounded-xl p-3 flex flex-col gap-2 text-xs">
          <div className="flex items-center gap-2 text-emerald-300 font-bold">
            <Shield className="w-4 h-4 text-emerald-400" />
            <span>Sandboxed Execution Active</span>
          </div>
          <p className="text-emerald-200/70 text-[11px] leading-relaxed">
            Module memory is isolated from the host process. Infinite loops are interrupted by compute fuel metering.
          </p>
        </div>

        {/* Configuration Form */}
        <div className="flex flex-col gap-4">
          <div>
            <label className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-1 block">
              VM Image (.wasm)
            </label>
            <div className="flex gap-2">
              <input
                type="text"
                value={vmPath}
                onChange={(e) => setVmPath(e.target.value)}
                placeholder=":demo:calc or C:\path\to\app.wasm"
                className="flex-1 bg-black/60 border border-white/10 rounded-lg px-3 py-2 text-xs font-mono text-white focus:outline-none focus:border-emerald-500"
              />
            </div>
            <div className="flex gap-2 mt-1.5">
              <button
                onClick={() => setVmPath(':demo:calc')}
                className="text-[11px] text-emerald-400/80 hover:text-emerald-300 underline"
              >
                Use Built-in Math VM
              </button>
            </div>
          </div>

          <div>
            <label className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-1 block">
              Mount Host Directory (to /mnt)
            </label>
            <div className="flex items-center gap-2 bg-black/60 border border-white/10 rounded-lg px-3 py-2">
              <Folder className="w-3.5 h-3.5 text-gray-500 shrink-0" />
              <input
                type="text"
                value={mountedDir}
                onChange={(e) => setMountedDir(e.target.value)}
                placeholder="Optional host folder path"
                className="w-full bg-transparent text-xs font-mono text-emerald-300 focus:outline-none"
              />
            </div>
          </div>

          <div className="bg-white/5 border border-white/10 rounded-lg p-3 text-xs flex flex-col gap-1.5">
            <div className="flex justify-between text-gray-400">
              <span>Compute Fuel Limit:</span>
              <span className="font-mono text-white">100,000,000 units</span>
            </div>
            <div className="flex justify-between text-gray-400">
              <span>Memory Table Page:</span>
              <span className="font-mono text-white">64 KB Baseline</span>
            </div>
            <div className="flex justify-between text-gray-400">
              <span>WASI ABI:</span>
              <span className="font-mono text-emerald-400">snapshot_preview1</span>
            </div>
          </div>

          <button
            onClick={handleBootVm}
            disabled={isBooting}
            className="w-full py-3 bg-emerald-600 hover:bg-emerald-500 text-black font-bold rounded-xl text-sm transition-all shadow-[0_0_20px_rgba(16,185,129,0.3)] flex items-center justify-center gap-2 disabled:opacity-50"
          >
            {isBooting ? (
              <>
                <RefreshCw className="w-4 h-4 animate-spin" />
                <span>Instantiating VM...</span>
              </>
            ) : (
              <>
                <Play className="w-4 h-4" />
                <span>Boot Nano-VM</span>
              </>
            )}
          </button>
        </div>
      </div>

      {/* Right Output & Diagnostics Panel */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Header telemetry */}
        <div className="p-4 border-b border-white/10 bg-black/30 flex justify-between items-center">
          <div className="flex items-center gap-2">
            <Terminal className="w-4 h-4 text-gray-400" />
            <span className="text-xs font-bold text-gray-400 uppercase tracking-wider">Nano-VM Telemetry & Console</span>
          </div>
          {result && (
            <div className="flex items-center gap-4 text-xs font-mono">
              <span className="flex items-center gap-1 text-emerald-400">
                <CheckCircle2 className="w-3.5 h-3.5" /> Exit: {result.exit_code}
              </span>
              <span className="flex items-center gap-1 text-cyan-300">
                <Zap className="w-3.5 h-3.5" /> {result.fuel_consumed.toLocaleString()} fuel
              </span>
              <span className="text-gray-400">{result.execution_time_ms} ms</span>
            </div>
          )}
        </div>

        {/* Terminal Screen */}
        <div className="flex-1 p-6 bg-black/90 font-mono text-xs overflow-y-auto flex flex-col gap-4">
          {errorMsg ? (
            <div className="p-4 bg-red-950/40 border border-red-500/30 rounded-xl text-red-300 flex items-start gap-3">
              <AlertCircle className="w-5 h-5 text-red-400 shrink-0 mt-0.5" />
              <div>
                <strong className="block font-bold">Nano-VM Execution Fault:</strong>
                <p className="mt-1">{errorMsg}</p>
              </div>
            </div>
          ) : result ? (
            <motion.div
              initial={{ opacity: 0, y: 5 }}
              animate={{ opacity: 1, y: 0 }}
              className="flex flex-col gap-4"
            >
              <div className="p-3 bg-white/5 border border-white/10 rounded-lg flex items-center justify-between">
                <span className="text-gray-400">Exported Module Functions:</span>
                <span className="text-emerald-400 font-bold">{result.exports.join(', ') || 'none'}</span>
              </div>

              <div>
                <span className="text-gray-500 block mb-2 font-bold">// STDOUT CONSOLE OUTPUT</span>
                <div className="p-4 bg-black border border-white/10 rounded-xl text-gray-200 whitespace-pre-wrap leading-relaxed shadow-inner">
                  {result.stdout || '(no stdout produced)'}
                </div>
              </div>

              {result.stderr && (
                <div>
                  <span className="text-amber-500 block mb-2 font-bold">// STDERR LOGS</span>
                  <div className="p-4 bg-amber-950/20 border border-amber-500/20 rounded-xl text-amber-200 whitespace-pre-wrap">
                    {result.stderr}
                  </div>
                </div>
              )}
            </motion.div>
          ) : (
            <div className="h-full flex flex-col items-center justify-center text-gray-600 gap-3">
              <div className="text-4xl">🔬</div>
              <p>Ready to boot. Select an image and click "Boot Nano-VM" to execute inside Wasmtime.</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
