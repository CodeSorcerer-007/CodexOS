import { useState, useRef } from 'react';

export const GPUCluster = () => {
  const [isComputing, setIsComputing] = useState(false);
  const [progress, setProgress] = useState(0);
  const [logs, setLogs] = useState<string[]>([]);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  const startCompute = () => {
    setIsComputing(true);
    setProgress(0);
    setLogs(['Initializing distributed WebGL compute context...']);
    
    // Simulate chunking workload to peers
    setLogs(prev => [...prev, 'Splitting 4GB matrix into 64MB chunks...']);
    setLogs(prev => [...prev, 'Broadcasting chunks to peers [peer-a1b2, peer-c3d4, peer-e5f6]...']);

    // Simple WebGL setup for visual feedback
    const canvas = canvasRef.current;
    if (canvas) {
      const gl = canvas.getContext('webgl');
      if (gl) {
        gl.clearColor(0.0, 0.0, 0.0, 1.0);
        gl.clear(gl.COLOR_BUFFER_BIT);
        
        // Very basic visual trick to simulate GPU working
        let step = 0;
        const computeInterval = setInterval(() => {
          step += 1;
          const p = Math.min((step / 50) * 100, 100);
          setProgress(p);
          
          if (step % 10 === 0) {
            setLogs(prev => [...prev, `Received completed chunk from peer-${Math.random().toString(36).substring(7)}`]);
          }

          // Random colored squares to look like parallel processing
          for(let i=0; i<100; i++) {
            const x = Math.random() * canvas.width;
            const y = Math.random() * canvas.height;
            gl.enable(gl.SCISSOR_TEST);
            gl.scissor(x, y, 10, 10);
            gl.clearColor(Math.random(), 1.0, Math.random(), 1.0);
            gl.clear(gl.COLOR_BUFFER_BIT);
          }

          if (step >= 50) {
            clearInterval(computeInterval);
            setIsComputing(false);
            setLogs(prev => [...prev, 'All chunks merged. Matrix multiplication complete.']);
          }
        }, 100);
      }
    }
  };

  return (
    <div className="flex flex-col h-full w-full bg-[#0a0f18] text-white p-6 gap-6">
      <div className="flex justify-between items-center border-b border-white/10 pb-4">
        <div>
          <h2 className="font-bold text-cyan-400 text-2xl mb-1">Distributed GPU Compute</h2>
          <p className="text-sm text-gray-400">Pool local network GPU resources (WebGPU/WebGL) for massively parallel tasks.</p>
        </div>
        <button 
          onClick={startCompute}
          disabled={isComputing}
          className="px-6 py-2 bg-cyan-600 hover:bg-cyan-500 disabled:opacity-50 text-white font-bold rounded shadow-[0_0_15px_rgba(8,145,178,0.3)] transition-colors"
        >
          {isComputing ? 'Computing...' : 'Start 4GB Matrix Multiply'}
        </button>
      </div>

      <div className="flex gap-6 flex-1 overflow-hidden">
        <div className="w-1/2 flex flex-col gap-2">
          <h3 className="font-bold text-xs uppercase tracking-widest text-cyan-500">Live Compute Shader</h3>
          <div className="flex-1 bg-black rounded-lg border border-white/10 p-2 relative">
            <canvas 
              ref={canvasRef} 
              width={500} 
              height={300} 
              className="w-full h-full rounded"
            />
            {isComputing && (
              <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                <div className="text-4xl font-black text-cyan-400 drop-shadow-[0_0_10px_rgba(0,0,0,1)]">
                  {Math.floor(progress)}%
                </div>
              </div>
            )}
          </div>
        </div>

        <div className="w-1/2 flex flex-col gap-2">
          <h3 className="font-bold text-xs uppercase tracking-widest text-cyan-500">P2P Mesh Network Logs</h3>
          <div className="flex-1 bg-black rounded-lg border border-white/10 p-4 font-mono text-xs text-cyan-300 overflow-y-auto flex flex-col gap-2">
            {logs.map((log, i) => (
              <div key={i}>&gt; {log}</div>
            ))}
            {logs.length === 0 && <div className="text-gray-600">Waiting to initialize cluster...</div>}
          </div>
        </div>
      </div>
    </div>
  );
};
