import { useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useStore, Toast } from '../store/store';
import { CheckCircle2, XCircle, AlertTriangle, Info, X } from 'lucide-react';

const ICONS = {
  success: CheckCircle2,
  error: XCircle,
  warning: AlertTriangle,
  info: Info,
};

const BORDERS = {
  success: 'border-l-green-500 shadow-green-500/20',
  error: 'border-l-red-500 shadow-red-500/20',
  warning: 'border-l-amber-500 shadow-amber-500/20',
  info: 'border-l-blue-500 shadow-blue-500/20',
};

const COLORS = {
  success: 'text-green-500',
  error: 'text-red-500',
  warning: 'text-amber-500',
  info: 'text-blue-500',
};

const PROGRESS = {
  success: 'bg-green-500',
  error: 'bg-red-500',
  warning: 'bg-amber-500',
  info: 'bg-blue-500',
};

function ToastItem({ toast, onRemove }: { toast: Toast; onRemove: (id: string) => void }) {
  const Icon = ICONS[toast.type];
  
  useEffect(() => {
    if (toast.duration && toast.duration > 0) {
      const timer = setTimeout(() => {
        onRemove(toast.id);
      }, toast.duration);
      return () => clearTimeout(timer);
    }
  }, [toast.id, toast.duration, onRemove]);

  return (
    <motion.div
      layout
      initial={{ opacity: 0, x: 100, scale: 0.9 }}
      animate={{ opacity: 1, x: 0, scale: 1 }}
      exit={{ opacity: 0, x: 100, scale: 0.9 }}
      transition={{ type: 'spring', stiffness: 400, damping: 30 }}
      className={`relative w-80 bg-[#0f0f0f]/90 backdrop-blur-xl border-y border-r border-white/10 border-l-4 rounded-2xl shadow-2xl overflow-hidden cursor-pointer group ${BORDERS[toast.type]}`}
      onClick={() => onRemove(toast.id)}
    >
      <div className="flex items-start p-4 pr-8">
        <Icon className={`w-5 h-5 shrink-0 mt-0.5 mr-3 ${COLORS[toast.type]}`} />
        <div className="flex flex-col gap-1">
          <span className="text-sm font-bold text-white">{toast.title}</span>
          {toast.message && (
            <span className="text-xs text-gray-400 leading-relaxed">{toast.message}</span>
          )}
        </div>
      </div>
      
      <button 
        onClick={(e) => { e.stopPropagation(); onRemove(toast.id); }}
        className="absolute top-4 right-3 text-white/40 hover:text-white/80 transition-colors opacity-0 group-hover:opacity-100"
      >
        <X className="w-4 h-4" />
      </button>

      {toast.duration && toast.duration > 0 && (
        <div className="absolute bottom-0 left-0 h-1 w-full bg-white/5">
          <motion.div
            initial={{ width: '100%' }}
            animate={{ width: '0%' }}
            transition={{ duration: toast.duration / 1000, ease: 'linear' }}
            className={`h-full ${PROGRESS[toast.type]}`}
          />
        </div>
      )}
    </motion.div>
  );
}

export function ToastContainer() {
  const toasts = useStore((s) => s.toasts);
  const removeToast = useStore((s) => s.removeToast);

  return (
    <div className="fixed bottom-6 right-6 z-[9999] flex flex-col gap-3 items-end pointer-events-none">
      <div className="pointer-events-auto flex flex-col gap-3 items-end">
        <AnimatePresence mode="popLayout">
          {toasts.map((toast) => (
            <ToastItem key={toast.id} toast={toast} onRemove={removeToast} />
          ))}
        </AnimatePresence>
      </div>
    </div>
  );
}
