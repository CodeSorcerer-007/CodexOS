import { useState, useEffect } from 'react';
import { invoke } from '@tauri-apps/api/core';

interface CertData {
  subject: string;
  issuer: string;
  valid_from: string;
  valid_to: string;
}

export const SslCertVisualizer = ({ path }: { path: string }) => {
  const [cert, setCert] = useState<CertData | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const parseCert = async () => {
      try {
        const result = await invoke<string>('inspect_ssl_cert', { path });
        setCert(JSON.parse(result));
      } catch (e) {
        setError(String(e));
      }
    };
    parseCert();
  }, [path]);

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-red-400 font-mono p-8 text-center">
        <span className="text-4xl mb-4">⚠️</span>
        <p>Could not parse certificate</p>
        <p className="text-xs mt-2 opacity-70">{error}</p>
      </div>
    );
  }

  if (!cert) return null;

  return (
    <div className="flex flex-col items-center justify-center h-full text-white p-8">
      <div className="w-full max-w-2xl bg-[#0a0a0a]/90 backdrop-blur-md border border-green-500/30 rounded-2xl p-8 liquid-glass shadow-[0_0_50px_rgba(34,197,94,0.1)]">
        <div className="flex items-center gap-4 mb-8 pb-4 border-b border-white/10">
          <div className="w-16 h-16 rounded-full bg-green-500/20 flex items-center justify-center border border-green-500/50 shadow-[0_0_20px_rgba(34,197,94,0.3)]">
            <span className="text-3xl text-green-400">🛡️</span>
          </div>
          <div>
            <h2 className="text-2xl font-bold text-green-400">Valid Certificate</h2>
            <p className="text-gray-400 font-mono text-sm">X.509 Cryptographic Identity</p>
          </div>
        </div>

        <div className="space-y-6">
          <div>
            <h3 className="text-xs uppercase tracking-wider text-gray-500 font-bold mb-1">Subject</h3>
            <div className="font-mono text-sm text-gray-300 break-words bg-black/40 p-3 rounded border border-white/5">{cert.subject}</div>
          </div>
          
          <div>
            <h3 className="text-xs uppercase tracking-wider text-gray-500 font-bold mb-1">Issuer</h3>
            <div className="font-mono text-sm text-gray-300 break-words bg-black/40 p-3 rounded border border-white/5">{cert.issuer}</div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <h3 className="text-xs uppercase tracking-wider text-gray-500 font-bold mb-1">Valid From</h3>
              <div className="font-mono text-sm text-cyan-400 bg-black/40 p-3 rounded border border-white/5">{cert.valid_from}</div>
            </div>
            <div>
              <h3 className="text-xs uppercase tracking-wider text-gray-500 font-bold mb-1">Valid To</h3>
              <div className="font-mono text-sm text-orange-400 bg-black/40 p-3 rounded border border-white/5">{cert.valid_to}</div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
