import { motion } from 'framer-motion';

const springPhysics = {
  type: "spring" as const,
  stiffness: 300,
  damping: 25
};

import { useState, useEffect } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { TelemetryOverlay } from './TelemetryOverlay';

export const AnimatedSidebar = ({ onOpenPurger, onNavigate }: { onOpenPurger: () => void, onNavigate: (path: string) => void }) => {
  const [wslDistros, setWslDistros] = useState<string[]>([]);

  useEffect(() => {
    invoke<string[]>('list_wsl_distros')
      .then(setWslDistros)
      .catch(console.error);
  }, []);

  return (
    <motion.aside 
      initial={{ x: -300, opacity: 0 }}
      animate={{ x: 0, opacity: 1 }}
      transition={springPhysics}
      className="w-72 h-full bg-[#0a0f18]/60 backdrop-blur-2xl border-r border-white/5 flex flex-col p-8 z-20 shadow-[10px_0_30px_-15px_rgba(0,0,0,0.5)]"
    >
      <h1 className="text-3xl font-extrabold text-transparent bg-clip-text bg-gradient-to-r from-cyan-400 to-blue-500 mb-10 drop-shadow-[0_0_15px_rgba(34,211,238,0.4)]">
        Vaultly
      </h1>
      
      <nav className="flex flex-col gap-3">
         <motion.div 
            onClick={() => onNavigate("C:\\")} 
            whileHover={{ x: 5 }} 
            transition={springPhysics} 
            className="p-3 cursor-pointer text-cyan-300 bg-cyan-400/10 rounded-xl transition-all border border-cyan-400/20 shadow-[inset_4px_0_0_0_rgba(34,211,238,1),0_0_15px_rgba(34,211,238,0.15)] font-medium"
         >
            C:\ Drive
         </motion.div>

         {wslDistros.length > 0 && (
           <>
             <div className="mt-6 mb-1 text-xs font-bold text-gray-500 uppercase tracking-[0.2em]">Linux (WSL)</div>
             {wslDistros.map(distro => (
               <motion.div 
                 key={distro}
                 onClick={() => onNavigate(`\\\\wsl.localhost\\${distro}`)}
                 whileHover={{ x: 5 }} 
                 transition={springPhysics} 
                 className="p-3 cursor-pointer text-gray-400 hover:text-green-400 hover:bg-green-500/10 border border-transparent hover:border-green-500/20 rounded-xl transition-all truncate hover:shadow-[0_0_15px_rgba(34,197,94,0.1)] font-medium flex items-center gap-3"
                 title={distro}
               >
                 <span className="text-xl">🐧</span> {distro}
               </motion.div>
             ))}
           </>
         )}
         <div className="mt-10 mb-1 text-xs font-bold text-gray-500 uppercase tracking-[0.2em]">Superpowers</div>
         <motion.div 
            onClick={onOpenPurger}
            whileHover={{ x: 5 }} 
            transition={springPhysics} 
            className="p-3 cursor-pointer text-gray-400 hover:text-red-400 hover:bg-red-500/10 border border-transparent hover:border-red-500/20 rounded-xl transition-all flex items-center gap-3 hover:shadow-[0_0_15px_rgba(239,68,68,0.1)] font-medium"
         >
            <span className="w-2.5 h-2.5 rounded-full bg-red-500 shadow-[0_0_8px_rgba(239,68,68,0.8)]"></span>
            Dependency Purger
         </motion.div>
      </nav>
      
      <div className="mt-auto pt-8">
        <TelemetryOverlay />
      </div>
    </motion.aside>
  );
};
