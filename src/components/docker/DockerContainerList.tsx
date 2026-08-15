import { motion, AnimatePresence } from 'framer-motion';
import { memo } from 'react';
import type { DockerContainer } from '../../types/bindings/DockerContainer';

const slideUpItem = {
  hidden: { opacity: 0, y: 20 },
  show: { opacity: 1, y: 0, transition: { type: 'spring' as const, stiffness: 300, damping: 25 } },
};

interface DockerContainerListProps {
  containers: DockerContainer[];
  selectedContainer: DockerContainer | null;
  onSelect: (container: DockerContainer) => void;
}

export const DockerContainerList = memo(({
  containers,
  selectedContainer,
  onSelect,
}: DockerContainerListProps) => {
  return (
    <div className="lg:col-span-1 overflow-auto flex flex-col gap-3 pr-2">
      <h3 className="text-xl font-bold text-gray-300 mb-2">Containers</h3>
      <AnimatePresence>
        {(containers || []).map((container) => {
          const isRunning = container.state.toLowerCase() === 'running';
          const isSelected = selectedContainer?.id === container.id;

          return (
            <motion.div
              key={container.id}
              variants={slideUpItem}
              initial="hidden"
              animate="show"
              exit={{ opacity: 0, scale: 0.9 }}
              onClick={() => onSelect(container)}
              className={`
                relative p-4 premium-card flex flex-col gap-2 cursor-pointer transition-all
                ${isRunning ? 'border-green-500/30' : 'opacity-70 grayscale hover:grayscale-0 hover:opacity-100'}
                ${isSelected ? 'ring-2 ring-blue-500 bg-blue-900/20' : 'hover:bg-white/5'}
              `}
            >
              <div
                className={`absolute top-4 right-4 w-3 h-3 rounded-full ${
                  isRunning ? 'bg-green-500 shadow-[0_0_10px_#22c55e] animate-pulse' : 'bg-gray-500'
                }`}
              />

              <div className="flex flex-col gap-1 pr-6">
                <span className="font-bold text-lg text-white truncate">{container.name}</span>
                <span className="text-xs font-mono text-cyan-500/80 truncate">{container.image}</span>
              </div>

              {container.ports && (
                <span className="text-[10px] text-blue-300 truncate mt-1 bg-black/30 p-1 rounded font-mono">
                  {container.ports}
                </span>
              )}
            </motion.div>
          );
        })}
      </AnimatePresence>
    </div>
  );
});
