import { useState } from 'react';
import { motion } from 'framer-motion';
import {
  X,
  AlertTriangle,
  Sparkles,
  ChevronDown,
  ChevronUp,
  FileText,
  RotateCcw,
} from 'lucide-react';
import { useDiagnosisStore } from '../store/diagnosisStore';

interface DiagnosisCardProps {
  triggerId: string;
  onNavigateToFile?: (path: string) => void;
  onRetry?: () => void;
}

const confidenceBadgeClasses: Record<'high' | 'medium' | 'low', string> = {
  high: 'bg-red-500/20 text-red-400 border-red-500/30',
  medium: 'bg-amber-500/20 text-amber-400 border-amber-500/30',
  low: 'bg-gray-500/20 text-gray-400 border-gray-500/30',
};

export const DiagnosisCard = ({ triggerId, onNavigateToFile, onRetry }: DiagnosisCardProps) => {
  const [explanationOpen, setExplanationOpen] = useState(false);

  const entry = useDiagnosisStore((s) => s.entries[triggerId]);
  const dismissedIds = useDiagnosisStore((s) => s.dismissedIds);
  const dismiss = useDiagnosisStore((s) => s.dismiss);

  // Render null when dismissed or no entry
  if (dismissedIds.has(triggerId) || !entry) {
    return null;
  }

  // ── Loading state ──────────────────────────────────────────────────────────
  if (entry.status === 'loading') {
    return (
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        className="bg-black/60 backdrop-blur-xl border border-white/10 rounded-2xl p-5 space-y-3"
        role="status"
        aria-label="Loading diagnosis"
      >
        {[['100%', 'h-4'], ['75%', 'h-3'], ['50%', 'h-3']].map(([w, h], i) => (
          <div
            key={i}
            className={`${h} rounded bg-white/5 animate-pulse`}
            style={{ width: w }}
          />
        ))}
      </motion.div>
    );
  }

  // ── Error state ────────────────────────────────────────────────────────────
  if (entry.status === 'error') {
    return (
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        className="bg-black/60 backdrop-blur-xl border border-white/10 rounded-2xl p-5"
      >
        {/* Header row */}
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-2 text-amber-400">
            <AlertTriangle size={16} aria-hidden="true" />
            <span className="text-sm font-semibold">
              Diagnosis unavailable —{' '}
              <span className="text-gray-300 font-normal">{entry.errorMessage ?? 'Unknown error'}</span>
            </span>
          </div>
          <button
            onClick={() => dismiss(triggerId)}
            className="p-1 rounded-lg text-gray-500 hover:text-white hover:bg-white/10 transition-colors shrink-0"
            aria-label="Dismiss diagnosis card"
          >
            <X size={14} />
          </button>
        </div>

        {onRetry && (
          <button
            onClick={onRetry}
            className="mt-3 flex items-center gap-2 px-3 py-1.5 text-xs font-bold rounded-lg bg-white/5 hover:bg-white/10 border border-white/10 text-gray-300 transition-colors"
          >
            <RotateCcw size={12} aria-hidden="true" />
            Retry
          </button>
        )}
      </motion.div>
    );
  }

  // ── Success state ──────────────────────────────────────────────────────────
  const { diagnosis } = entry;
  if (!diagnosis) return null;

  const badgeClass = confidenceBadgeClasses[diagnosis.confidence];

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className="bg-black/60 backdrop-blur-xl border border-white/10 rounded-2xl p-5 space-y-3"
    >
      {/* ── Card header ── */}
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-start gap-2 min-w-0">
          <Sparkles size={16} className="text-violet-400 shrink-0 mt-0.5" aria-hidden="true" />
          <span className="text-sm font-semibold text-white leading-snug">{diagnosis.cause}</span>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          {/* Confidence badge */}
          <span
            className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wide border ${badgeClass}`}
          >
            {diagnosis.confidence}
          </span>

          {/* Dismiss button */}
          <button
            onClick={() => dismiss(triggerId)}
            className="p-1 rounded-lg text-gray-500 hover:text-white hover:bg-white/10 transition-colors"
            aria-label="Dismiss diagnosis card"
          >
            <X size={14} />
          </button>
        </div>
      </div>

      {/* ── Collapsible explanation ── */}
      <div>
        <button
          onClick={() => setExplanationOpen((v) => !v)}
          className="flex items-center gap-1.5 text-xs font-medium text-gray-400 hover:text-white transition-colors"
          aria-expanded={explanationOpen}
        >
          {explanationOpen ? (
            <ChevronUp size={14} aria-hidden="true" />
          ) : (
            <ChevronDown size={14} aria-hidden="true" />
          )}
          {explanationOpen ? 'Hide explanation' : 'Show explanation'}
        </button>

        {explanationOpen && (
          <p className="mt-2 text-xs text-gray-300 leading-relaxed">{diagnosis.explanation}</p>
        )}
      </div>

      {/* ── Suggested fix ── */}
      <div>
        <p className="text-[10px] font-bold uppercase tracking-widest text-gray-500 mb-1.5">
          Suggested Fix
        </p>
        <pre className="bg-black/50 border border-white/10 rounded-xl p-3 overflow-x-auto">
          <code className="font-mono text-xs text-green-300 whitespace-pre-wrap">
            {diagnosis.suggested_fix}
          </code>
        </pre>
      </div>

      {/* ── Related file chips ── */}
      {diagnosis.related_files.length > 0 && (
        <div>
          <p className="text-[10px] font-bold uppercase tracking-widest text-gray-500 mb-1.5">
            Related Files
          </p>
          <div className="flex flex-wrap gap-1.5">
            {diagnosis.related_files.map((path) => (
              <button
                key={path}
                onClick={() => onNavigateToFile?.(path)}
                disabled={!onNavigateToFile}
                className="flex items-center gap-1.5 px-2 py-1 rounded-lg bg-white/5 hover:bg-white/10 border border-white/10 text-xs font-mono text-gray-300 transition-colors disabled:cursor-default disabled:opacity-70"
                title={path}
              >
                <FileText size={11} className="shrink-0 text-gray-500" aria-hidden="true" />
                <span className="max-w-[200px] truncate">{path}</span>
              </button>
            ))}
          </div>
        </div>
      )}
    </motion.div>
  );
};

export default DiagnosisCard;
