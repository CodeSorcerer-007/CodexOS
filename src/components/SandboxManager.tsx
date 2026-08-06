import { motion } from 'framer-motion';

export const SandboxManager = ({ currentPath: _currentPath }: { currentPath: string | null }) => {
  return (
    <div className="flex h-full w-full bg-[#0a0f18] text-white">
      <div className="w-1/3 border-r border-white/10 p-6 flex flex-col gap-6">
        <div>
          <h2 className="font-bold text-emerald-400 text-xl mb-2">Nano-VM Sandbox</h2>
          <p className="text-sm text-gray-400">Lightweight WebAssembly VMs with strictly isolated host filesystem access.</p>
        </div>

        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          className="bg-yellow-500/10 border border-yellow-500/30 rounded-xl p-4 flex flex-col gap-2"
        >
          <div className="flex items-center gap-2">
            <span className="text-yellow-400 text-lg">⚠️</span>
            <span className="text-yellow-300 font-bold text-sm">Not Yet Implemented</span>
          </div>
          <p className="text-xs text-yellow-200/70 leading-relaxed">
            The WASI Nano-VM sandbox requires a full WASI runtime integration. This feature is under active development and will be available in a future release.
          </p>
        </motion.div>

        <div className="opacity-40 pointer-events-none flex flex-col gap-4">
          <div>
            <label className="text-xs font-bold text-gray-500 uppercase tracking-widest mb-2 block">VM Image Path (.wasm)</label>
            <input
              type="text"
              disabled
              placeholder="C:\path\to\app.wasm"
              className="w-full bg-black/50 border border-white/10 rounded p-3 text-white font-mono text-sm cursor-not-allowed"
            />
          </div>
          <div>
            <label className="text-xs font-bold text-gray-500 uppercase tracking-widest mb-2 block">Mount Host Directory (to /mnt)</label>
            <input
              type="text"
              disabled
              className="w-full bg-black/50 border border-white/10 rounded p-3 text-emerald-300 font-mono text-sm cursor-not-allowed"
            />
          </div>
          <button
            disabled
            className="w-full px-4 py-3 bg-emerald-600/30 text-emerald-500/60 rounded font-bold cursor-not-allowed border border-emerald-600/20"
          >
            Coming Soon — Boot Nano-VM
          </button>
        </div>
      </div>

      <div className="flex-1 p-6 bg-black/40 flex flex-col items-center justify-center gap-4">
        <div className="text-6xl">🔬</div>
        <h3 className="font-bold text-gray-300 text-xl">WASI Sandbox</h3>
        <p className="text-gray-500 text-sm text-center max-w-sm leading-relaxed">
          Execute isolated WebAssembly modules with controlled host directory access.
          Full WASI runtime coming in the next major release.
        </p>
        <div className="flex gap-2 mt-2">
          <span className="bg-white/5 border border-white/10 text-gray-400 text-xs px-3 py-1 rounded-full font-mono">WASI Preview 2</span>
          <span className="bg-white/5 border border-white/10 text-gray-400 text-xs px-3 py-1 rounded-full font-mono">wasmtime</span>
          <span className="bg-white/5 border border-white/10 text-gray-400 text-xs px-3 py-1 rounded-full font-mono">In Development</span>
        </div>
      </div>
    </div>
  );
};
