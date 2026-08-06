import { motion, AnimatePresence } from 'framer-motion';
import { useState } from 'react';
import { useToast } from '../store/store';

const springPhysics = {
  type: "spring" as const,
  stiffness: 300,
  damping: 25
};

export const FABMenu = ({ onOpenMetrics, onSpawnServer, onOpenRenamer, onOpenTreeMap, onOpenEnvVars, onOpenServices, onOpenHosts, onOpenDuplicates, onOpenTerminal, onOpenVault }: { onOpenMetrics: () => void, onSpawnServer?: () => void, onOpenRenamer?: () => void, onOpenTreeMap?: () => void, onOpenEnvVars?: () => void, onOpenServices?: () => void, onOpenHosts?: () => void, onOpenDuplicates?: () => void, onOpenTerminal?: () => void, onOpenVault?: () => void }) => {
  const [isOpen, setIsOpen] = useState(false);
  const { info: toastInfo } = useToast();

  return (
    <div className="absolute bottom-8 right-8 z-50 flex flex-col-reverse items-end gap-4">
      <motion.button
        onClick={() => setIsOpen(!isOpen)}
        animate={{ rotate: isOpen ? 135 : 0 }}
        transition={springPhysics}
        className="w-14 h-14 rounded-full bg-cyan text-black flex items-center justify-center neon-glow shadow-xl text-2xl font-bold"
      >
        +
      </motion.button>
      
      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ opacity: 0, y: 20, scale: 0.8 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 20, scale: 0.8 }}
            className="grid grid-cols-2 gap-3 origin-bottom-right"
          >
            <ActionItem label="Duplicate Asset Finder" onClick={onOpenDuplicates} onClose={() => setIsOpen(false)} />
            <ActionItem label="System Hosts Editor" onClick={onOpenHosts} onClose={() => setIsOpen(false)} />
            <ActionItem label="System Services" onClick={onOpenServices} onClose={() => setIsOpen(false)} />
            <ActionItem label="Environment Variables" onClick={onOpenEnvVars} onClose={() => setIsOpen(false)} />
            <ActionItem label="Disk Space TreeMap" onClick={onOpenTreeMap} onClose={() => setIsOpen(false)} />
            <ActionItem label="Bulk Regex Renamer" onClick={onOpenRenamer} onClose={() => setIsOpen(false)} />
            <ActionItem label="Spawn Local Server" onClick={onSpawnServer} onClose={() => setIsOpen(false)} />
            <ActionItem label="Project Metrics" onClick={onOpenMetrics} onClose={() => setIsOpen(false)} />
            <ActionItem label="New Terminal" onClick={onOpenTerminal} onClose={() => setIsOpen(false)} />
            <ActionItem label="AES-256 Vault" onClick={onOpenVault} onClose={() => setIsOpen(false)} />
            <ActionItem label="New Workspace" onClick={() => toastInfo("Multi-Workspace", "Arriving in v1.1")} onClose={() => setIsOpen(false)} />
            <ActionItem label="Clone Repo" onClick={() => toastInfo("Git Integration", "Arriving in v1.1")} onClose={() => setIsOpen(false)} />
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

const ActionItem = ({ label, onClick, onClose }: { label: string; onClick?: () => void; onClose: () => void }) => (
  <motion.button 
    whileHover={{ scale: 1.05 }} 
    onClick={() => { onClick?.(); onClose(); }}
    className="px-4 py-2 bg-[#0B0F19] liquid-glass rounded-xl text-sm font-medium whitespace-nowrap hover:text-cyan transition-colors border border-white/10 shadow-lg text-left"
  >
    {label}
  </motion.button>
);
