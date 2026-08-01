import { motion } from 'framer-motion';
import { useState } from 'react';

const springPhysics = {
  type: "spring" as const,
  stiffness: 300,
  damping: 25
};

const slideUpItem = {
  hidden: { opacity: 0, y: 20 },
  show: { opacity: 1, y: 0, transition: springPhysics }
};

export const InteractiveDriveCard = ({ driveName, used, total }: { driveName: string, used: number, total: number }) => {
  const [isHovered, setIsHovered] = useState(false);
  const percentage = (used / total) * 100;

  return (
    <motion.div
      variants={slideUpItem}
      whileHover={{ scale: 1.02, rotateX: 2, rotateY: -2, z: 20 }}
      onHoverStart={() => setIsHovered(true)}
      onHoverEnd={() => setIsHovered(false)}
      className="relative p-6 rounded-2xl liquid-glass w-64 h-40 cursor-pointer border border-white/10 group overflow-hidden"
      style={{ perspective: 1000 }}
    >
      <h3 className="text-xl font-bold">{driveName}</h3>
      <p className="text-sm text-gray-400 mt-2">{used}GB / {total}GB</p>
      
      {/* Hidden Storage Map expanding on hover */}
      <motion.div 
        initial={{ height: 0, opacity: 0 }}
        animate={{ height: isHovered ? 24 : 0, opacity: isHovered ? 1 : 0 }}
        className="absolute bottom-6 left-6 right-6 bg-black/40 rounded-full overflow-hidden"
      >
        <motion.div 
          initial={{ width: 0 }}
          animate={{ width: isHovered ? `${percentage}%` : 0 }}
          transition={{ delay: 0.1, ...springPhysics }}
          className="h-full bg-cyan neon-glow rounded-full"
        />
      </motion.div>
    </motion.div>
  );
};
