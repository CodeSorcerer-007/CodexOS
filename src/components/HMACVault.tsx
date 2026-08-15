import { useState } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { useToast } from '../store/store';
import { Copy, ShieldCheck, Key } from 'lucide-react';

export const HMACVault = () => {
  const [vaultData, setVaultData] = useState('Secret Source Code 123');
  const [secretKey, setSecretKey] = useState('super_secret_key');
  const [proof, setProof] = useState<string | null>(null);
  
  const [verifyProof, setVerifyProof] = useState('');
  const [verifyData, setVerifyData] = useState('Secret Source Code 123');
  const [verifyKey, setVerifyKey] = useState('super_secret_key');
  const [isValid, setIsValid] = useState<boolean | null>(null);
  const { error: toastError, success: toastSuccess } = useToast();

  const generateProof = async () => {
    if (!secretKey.trim()) {
      toastError('Missing Secret Key', 'Please provide a non-empty HMAC secret key.');
      return;
    }
    try {
      const p = await invoke<string>('generate_hmac_proof', { vaultData, secretKey });
      setProof(p);
      setVerifyProof(p);
      toastSuccess('Proof Generated', 'Cryptographic HMAC proof generated successfully.');
    } catch (e: unknown) {
      console.error(e);
      toastError('HMAC Proof Generation Failed', e instanceof Error ? e.message : String(e));
    }
  };

  const handleVerify = async () => {
    try {
      const valid = await invoke<boolean>('verify_hmac_proof', { 
        proofHash: verifyProof, 
        expectedVaultData: verifyData,
        secretKey: verifyKey 
      });
      setIsValid(valid);
      if (valid) {
        toastSuccess('Proof Valid', 'Cryptographic commitment matches expected data.');
      } else {
        toastError('Verification Failed', 'Proof does not match expected data or key.');
      }
    } catch (e: unknown) {
      console.error(e);
      toastError('HMAC Verification Error', e instanceof Error ? e.message : String(e));
      setIsValid(false);
    }
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    toastSuccess('Copied', 'Proof copied to clipboard.');
  };

  return (
    <div className="flex h-full w-full bg-[#0a0f18] text-white">
      {/* Prover Section */}
      <div className="w-1/2 border-r border-white/10 p-6 flex flex-col gap-6">
        <div>
          <h2 className="font-bold text-fuchsia-400 text-xl mb-2 flex items-center gap-2">
            <Key className="w-5 h-5" /> HMAC Proof Generator
          </h2>
          <p className="text-sm text-gray-400 mb-4">Generate an HMAC-SHA256 proof that you possess data with a given key.</p>
          <div className="bg-blue-500/10 border border-blue-500/30 rounded-lg p-2 text-xs text-blue-300">
            Generate and verify cryptographic commitments for sensitive data using HMAC-SHA256.
          </div>
        </div>

        <div>
          <label className="text-xs font-bold text-gray-500 uppercase tracking-widest mb-2 block">Vault Payload (Simulated)</label>
          <textarea 
            value={vaultData}
            onChange={e => setVaultData(e.target.value)}
            className="w-full bg-black/50 border border-white/10 rounded p-3 text-white font-mono text-sm focus:border-fuchsia-500 focus:outline-none transition-colors mb-4 h-24"
          />

          <label className="text-xs font-bold text-gray-500 uppercase tracking-widest mb-2 block" htmlFor="hmac-secret-key">Secret HMAC Key</label>
          <input 
            id="hmac-secret-key"
            type="password"
            value={secretKey}
            onChange={e => setSecretKey(e.target.value)}
            className="w-full bg-black/50 border border-white/10 rounded p-3 text-white font-mono text-sm focus:border-fuchsia-500 focus:outline-none transition-colors mb-6"
          />

          <button 
            onClick={generateProof}
            className="w-full px-4 py-3 bg-fuchsia-600 hover:bg-fuchsia-500 rounded font-bold transition-colors shadow-[0_0_15px_rgba(192,38,211,0.3)]"
          >
            Generate HMAC Proof
          </button>
        </div>

        {proof && (
          <div className="mt-4 p-4 bg-black border border-white/10 rounded-lg">
            <div className="flex justify-between items-center mb-2">
              <h3 className="text-xs font-bold text-gray-500 uppercase tracking-widest">Generated HMAC Hash</h3>
              <button
                onClick={() => copyToClipboard(proof)}
                className="flex items-center gap-1 text-xs text-fuchsia-400 hover:text-fuchsia-300 bg-white/5 hover:bg-white/10 px-2 py-1 rounded border border-white/10 transition-colors"
              >
                <Copy className="w-3 h-3" /> Copy
              </button>
            </div>
            <div className="text-fuchsia-300 font-mono text-xs break-all">{proof}</div>
          </div>
        )}
      </div>

      {/* Verifier Section */}
      <div className="flex-1 p-6 flex flex-col gap-6 bg-black/40">
        <div>
          <h2 className="font-bold text-fuchsia-400 text-xl mb-2 flex items-center gap-2">
            <ShieldCheck className="w-5 h-5" /> HMAC Proof Verifier
          </h2>
          <p className="text-sm text-gray-400">Verify an HMAC-SHA256 proof matches the expected data and key.</p>
        </div>

        <div>
          <label className="text-xs font-bold text-gray-500 uppercase tracking-widest mb-2 block">Received Proof</label>
          <input 
            type="text"
            value={verifyProof}
            onChange={e => setVerifyProof(e.target.value)}
            className="w-full bg-black/50 border border-white/10 rounded p-3 text-fuchsia-300 font-mono text-sm focus:border-fuchsia-500 focus:outline-none transition-colors mb-4"
          />

          <label className="text-xs font-bold text-gray-500 uppercase tracking-widest mb-2 block">Expected Vault Data</label>
          <textarea 
            value={verifyData}
            onChange={e => setVerifyData(e.target.value)}
            className="w-full bg-black/50 border border-white/10 rounded p-3 text-white font-mono text-sm focus:border-fuchsia-500 focus:outline-none transition-colors mb-4 h-24"
          />

          <label className="text-xs font-bold text-gray-500 uppercase tracking-widest mb-2 block" htmlFor="hmac-verify-key">Verification Key</label>
          <input 
            id="hmac-verify-key"
            type="password"
            value={verifyKey}
            onChange={e => setVerifyKey(e.target.value)}
            className="w-full bg-black/50 border border-white/10 rounded p-3 text-white font-mono text-sm focus:border-fuchsia-500 focus:outline-none transition-colors mb-6"
          />

          <button 
            onClick={handleVerify}
            className="w-full px-4 py-3 bg-white/10 hover:bg-white/20 rounded font-bold transition-colors"
          >
            Verify Proof
          </button>
        </div>

        {isValid !== null && (
          <div className={`mt-4 p-4 rounded-lg border font-bold text-center ${isValid ? 'bg-green-500/20 border-green-500/50 text-green-400' : 'bg-red-500/20 border-red-500/50 text-red-400'}`}>
            {isValid ? '✅ CRYPTOGRAPHIC PROOF VERIFIED' : '❌ INVALID PROOF - TAMPERING DETECTED'}
          </div>
        )}
      </div>
    </div>
  );
};
