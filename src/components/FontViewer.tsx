import { useState } from 'react';
import { invoke } from '@tauri-apps/api/core';

export const FontViewer = ({ path, fileName }: { path: string, fileName: string }) => {
  const [installing, setInstalling] = useState(false);
  
  // Since browser security prevents loading arbitrary local fonts without @font-face and object urls,
  // we'd normally create a blob URL, but for simplicity we'll just show the UI for installing.
  // In a real app we'd construct a css @font-face using the file URI.
  const fontUrl = `file:///${path.replace(/\\/g, '/')}`;

  const handleInstall = async () => {
    setInstalling(true);
    try {
      const result = await invoke<string>('install_font', { path });
      alert(result);
    } catch (e) {
      alert(`Failed to install font: ${e}`);
    }
    setInstalling(false);
  };

  return (
    <div className="flex flex-col items-center justify-center h-full text-white">
      <style>
        {`
          @font-face {
            font-family: 'PreviewFont';
            src: url('${fontUrl}');
          }
        `}
      </style>
      
      <div className="mb-8 p-8 border border-white/10 rounded-2xl bg-black/50 text-center w-3/4 liquid-glass">
        <h2 className="text-gray-400 mb-2 font-mono text-sm">{fileName}</h2>
        <div style={{ fontFamily: 'PreviewFont' }} className="text-6xl mb-6">
          The quick brown fox jumps over the lazy dog.
        </div>
        <div style={{ fontFamily: 'PreviewFont' }} className="text-3xl mb-6 text-gray-300">
          0123456789 !@#$%^&*()
        </div>
        <div style={{ fontFamily: 'PreviewFont' }} className="text-xl text-gray-400">
          Sphinx of black quartz, judge my vow.
        </div>
      </div>

      <button
        onClick={handleInstall}
        disabled={installing}
        className="px-8 py-3 bg-cyan/20 border border-cyan/50 text-cyan font-bold rounded-xl shadow-[0_0_15px_rgba(34,211,238,0.3)] hover:bg-cyan/30 hover:scale-105 transition-all disabled:opacity-50"
      >
        {installing ? 'Installing...' : '💾 Install Font to Windows'}
      </button>
    </div>
  );
};
