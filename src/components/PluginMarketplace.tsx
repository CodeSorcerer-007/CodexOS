import { motion } from 'framer-motion';

export const PluginMarketplace = () => {
  return (
    <div className="flex flex-col h-full w-full bg-[#0a0f18] text-white p-6 gap-6">
      <div className="flex justify-between items-center border-b border-white/10 pb-4">
        <div>
          <h2 className="font-bold text-amber-500 text-2xl mb-1">P2P Plugin Marketplace</h2>
          <p className="text-sm text-gray-400">Discover and install WASM plugins directly from other developers on your local network.</p>
        </div>
        <div className="flex items-center gap-2 text-sm font-mono bg-black px-4 py-2 rounded-full border border-white/10">
          <div className="w-2 h-2 rounded-full bg-amber-400 animate-pulse" />
          Coming Soon
        </div>
      </div>

      <div className="flex-1 flex flex-col items-center justify-center gap-6">
        <motion.div
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ type: 'spring', stiffness: 300, damping: 25 }}
          className="text-center flex flex-col items-center gap-4 max-w-lg"
        >
          <div className="text-7xl mb-2">🛒</div>
          <h3 className="text-2xl font-bold text-white">Plugin Marketplace</h3>
          <p className="text-gray-400 text-sm leading-relaxed">
            The P2P Plugin Marketplace is coming in a future release. You'll be able to
            discover, install, and share WASM plugins directly with other CodexOS users
            on your local network via WebRTC — no central server needed.
          </p>

          <div className="mt-4 bg-amber-500/10 border border-amber-500/30 rounded-xl p-4 text-left w-full">
            <h4 className="text-amber-400 font-bold text-sm mb-3">Planned Features</h4>
            <ul className="flex flex-col gap-2">
              {[
                '🔌 Browse plugins from P2P network peers',
                '📦 One-click WASM plugin download via WebRTC',
                '🔐 Cryptographic author verification',
                '⭐ Community ratings and reviews',
                '🔄 Auto-update installed plugins',
              ].map((f, i) => (
                <li key={i} className="text-xs text-gray-300 flex items-start gap-2">{f}</li>
              ))}
            </ul>
          </div>

          <div className="flex gap-3 mt-2 flex-wrap justify-center">
            <span className="bg-white/5 border border-white/10 text-gray-400 text-xs px-3 py-1.5 rounded-full font-mono">WebRTC P2P</span>
            <span className="bg-white/5 border border-white/10 text-gray-400 text-xs px-3 py-1.5 rounded-full font-mono">WASM Plugins</span>
            <span className="bg-amber-500/20 border border-amber-500/40 text-amber-400 text-xs px-3 py-1.5 rounded-full font-mono">In Development</span>
          </div>
        </motion.div>
      </div>
    </div>
  );
};
