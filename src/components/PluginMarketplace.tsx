import { useState, useEffect } from 'react';

interface PluginDescriptor {
  id: string;
  name: string;
  description: string;
  author: string;
  size: string;
  peerId: string;
}

const MOCK_P2P_PLUGINS: PluginDescriptor[] = [
  { id: '1', name: 'JSON Formatter', description: 'Blazing fast JSON formatter in WASM.', author: '0xVault', size: '42KB', peerId: 'peer-a1b2' },
  { id: '2', name: 'Log Analyzer', description: 'Parse apache logs and highlight errors.', author: 'sysadmin_joe', size: '128KB', peerId: 'peer-c3d4' },
  { id: '3', name: 'Hex Editor Plugin', description: 'Advanced hex viewing for binary files.', author: 'reverser99', size: '89KB', peerId: 'peer-e5f6' }
];

export const PluginMarketplace = () => {
  const [plugins, setPlugins] = useState<PluginDescriptor[]>([]);
  const [isScanning, setIsScanning] = useState(false);
  const [installed, setInstalled] = useState<string[]>([]);

  useEffect(() => {
    // Simulate discovering peers on the local network
    setIsScanning(true);
    const timer = setTimeout(() => {
      setPlugins(MOCK_P2P_PLUGINS);
      setIsScanning(false);
    }, 2000);
    return () => clearTimeout(timer);
  }, []);

  const handleInstall = (plugin: PluginDescriptor) => {
    setInstalled(prev => [...prev, plugin.id]);
    alert(`Successfully downloaded ${plugin.name} from peer ${plugin.peerId} over WebRTC!`);
  };

  return (
    <div className="flex flex-col h-full w-full bg-[#0a0f18] text-white p-6 gap-6">
      <div className="flex justify-between items-center border-b border-white/10 pb-4">
        <div>
          <h2 className="font-bold text-amber-500 text-2xl mb-1">P2P Plugin Marketplace</h2>
          <p className="text-sm text-gray-400">Discover and install WASM plugins directly from other developers on your local network.</p>
        </div>
        <div className="flex items-center gap-2 text-sm font-mono bg-black px-4 py-2 rounded-full border border-white/10">
          <div className={`w-2 h-2 rounded-full ${isScanning ? 'bg-amber-400 animate-pulse' : 'bg-green-500'}`} />
          {isScanning ? 'Scanning network...' : `${plugins.length} Plugins Found`}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {plugins.map(plugin => (
          <div key={plugin.id} className="bg-black border border-white/10 rounded-xl p-6 flex flex-col gap-4 hover:border-amber-500/50 transition-colors shadow-lg">
            <div className="flex justify-between items-start">
              <h3 className="font-bold text-lg text-white">{plugin.name}</h3>
              <span className="text-xs font-mono text-gray-500 bg-white/5 px-2 py-1 rounded">{plugin.size}</span>
            </div>
            
            <p className="text-sm text-gray-400 flex-1">{plugin.description}</p>
            
            <div className="text-xs text-amber-500/70 font-mono">
              Hosted by: {plugin.author} ({plugin.peerId})
            </div>

            <button 
              onClick={() => handleInstall(plugin)}
              disabled={installed.includes(plugin.id)}
              className={`w-full py-2 rounded font-bold transition-colors ${installed.includes(plugin.id) ? 'bg-green-600 text-white cursor-default' : 'bg-amber-600 hover:bg-amber-500 text-black'}`}
            >
              {installed.includes(plugin.id) ? 'Installed' : 'Download via WebRTC'}
            </button>
          </div>
        ))}
      </div>
    </div>
  );
};
