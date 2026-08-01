import { useState, useEffect } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { motion, AnimatePresence } from 'framer-motion';
import { Play } from 'lucide-react';

interface ProjectTasksSidebarProps {
  currentPath: string;
  onExecuteTask: (taskName: string, taskCommand: string) => void;
}

export const ProjectTasksSidebar = ({ currentPath, onExecuteTask }: ProjectTasksSidebarProps) => {
  const [tasks, setTasks] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(false);
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    loadTasks();
  }, [currentPath]);

  const loadTasks = async () => {
    setLoading(true);
    try {
      const result = await invoke<Record<string, string>>('get_project_tasks', { path: currentPath });
      setTasks(result);
      setIsVisible(Object.keys(result).length > 0);
    } catch (e) {
      console.error("Failed to load project tasks:", e);
      setIsVisible(false);
    }
    setLoading(false);
  };

  if (!isVisible && !loading) return null;

  return (
    <AnimatePresence>
      <motion.div 
        initial={{ x: 300, opacity: 0 }}
        animate={{ x: 0, opacity: 1 }}
        exit={{ x: 300, opacity: 0 }}
        className="w-80 border-l border-white/10 bg-black/40 backdrop-blur-md flex flex-col liquid-glass"
      >
        <div className="p-4 border-b border-white/10">
          <h2 className="text-lg font-bold text-transparent bg-clip-text bg-gradient-to-r from-blue-400 to-indigo-400 flex items-center gap-2">
            🚀 Project Tasks
          </h2>
          <p className="text-xs text-gray-500 font-mono mt-1">Found in package.json</p>
        </div>

        <div className="flex-1 overflow-y-auto p-4 flex flex-col gap-2">
          {loading ? (
            <div className="text-sm text-gray-500 animate-pulse text-center mt-4">Scanning project...</div>
          ) : (
            Object.entries(tasks).map(([name, command]) => (
              <div 
                key={name} 
                className="bg-black/30 border border-white/5 rounded-xl p-3 flex flex-col gap-2 hover:bg-black/50 hover:border-white/20 transition-all group"
              >
                <div className="flex justify-between items-center">
                  <h3 className="font-bold text-white text-sm">{name}</h3>
                  <button 
                    onClick={() => onExecuteTask(name, `npm run ${name}`)}
                    className="p-1.5 bg-green-500/10 text-green-400 rounded-lg opacity-0 group-hover:opacity-100 transition-opacity hover:bg-green-500/30"
                    title="Run Task"
                  >
                    <Play size={14} fill="currentColor" />
                  </button>
                </div>
                <div className="text-xs text-gray-500 font-mono truncate" title={command}>
                  {command}
                </div>
              </div>
            ))
          )}
        </div>
      </motion.div>
    </AnimatePresence>
  );
};
