import React, { useEffect, useState } from 'react';
import {
  ArrowUpDown,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  Loader2,
  Minimize2,
  Maximize2,
  X,
  FileText,
  Clock,
  Zap,
} from 'lucide-react';
import { useTransferStore } from '../../store/transferStore';
import type { TransferProgressEvent } from '../../ipc';

function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  if (i >= sizes.length) return `${(bytes / Math.pow(k, sizes.length - 1)).toFixed(1)} ${sizes[sizes.length - 1]}`;
  return `${(bytes / Math.pow(k, i)).toFixed(1)} ${sizes[i]}`;
}

function formatDuration(secs: number): string {
  if (secs <= 0) return '< 1s';
  if (secs < 60) return `${secs}s`;
  const m = Math.floor(secs / 60);
  const s = secs % 60;
  if (m < 60) return `${m}m ${s}s`;
  const h = Math.floor(m / 60);
  const remM = m % 60;
  return `${h}h ${remM}m`;
}

export const TransferCenter: React.FC = () => {
  const {
    transfers,
    isMinimized,
    isOpen,
    toggleMinimized,
    setOpen,
    dismissTransfer,
    clearCompleted,
    cancelTransfer,
    initTransferListeners,
  } = useTransferStore();

  const [confirmCancelId, setConfirmCancelId] = useState<string | null>(null);

  useEffect(() => {
    const cleanup = initTransferListeners();
    return () => {
      cleanup();
    };
  }, [initTransferListeners]);

  const transferList = Object.values(transfers);
  if (!isOpen || transferList.length === 0) {
    return null;
  }

  const activeTransfers = transferList.filter(
    (t) => t.status === 'running' || t.status === 'queued' || t.status === 'preparing'
  );
  const hasCompleted = transferList.some(
    (t) => t.status === 'completed' || t.status === 'failed' || t.status === 'cancelled'
  );

  // Minimized Floating Pill
  if (isMinimized) {
    const totalBytes = activeTransfers.reduce((acc, t) => acc + t.total_bytes, 0);
    const transferredBytes = activeTransfers.reduce((acc, t) => acc + t.transferred_bytes, 0);
    const overallPercent = totalBytes > 0 ? Math.min(100, Math.round((transferredBytes / totalBytes) * 100)) : 0;

    return (
      <div
        data-testid="transfer-center-minimized"
        className="fixed bottom-10 right-6 z-50 flex items-center gap-3 px-3.5 py-2 rounded-full shadow-2xl border border-indigo-500/40 bg-[#18181b]/95 backdrop-blur-md text-white text-xs select-none transition-all hover:border-indigo-400"
      >
        {activeTransfers.length > 0 ? (
          <>
            <Loader2 className="w-3.5 h-3.5 text-indigo-400 animate-spin" />
            <span className="font-medium">
              {activeTransfers.length} {activeTransfers.length === 1 ? 'transfer' : 'transfers'} ({overallPercent}%)
            </span>
          </>
        ) : (
          <>
            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
            <span className="font-medium">All transfers finished</span>
          </>
        )}

        <div className="flex items-center gap-1 border-l border-zinc-700 pl-2">
          <button
            onClick={toggleMinimized}
            aria-label="Expand Transfers"
            title="Expand Transfers"
            className="p-1 hover:bg-white/10 rounded text-zinc-400 hover:text-white transition-colors cursor-pointer"
          >
            <Maximize2 className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={() => setOpen(false)}
            aria-label="Close Transfer Center"
            title="Close"
            className="p-1 hover:bg-white/10 rounded text-zinc-400 hover:text-white transition-colors cursor-pointer"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>
    );
  }

  // Expanded Floating Transfer Panel
  return (
    <div
      data-testid="transfer-center-expanded"
      className="fixed bottom-10 right-6 z-50 w-96 max-h-[520px] flex flex-col shadow-2xl rounded-xl border border-app-border bg-[#18181b]/95 backdrop-blur-md text-[#f4f4f5] overflow-hidden select-none"
    >
      {/* Header */}
      <div className="flex items-center justify-between px-3.5 py-2.5 bg-black/30 border-b border-app-border">
        <div className="flex items-center gap-2">
          <ArrowUpDown className="w-4 h-4 text-indigo-400" />
          <span className="font-semibold text-xs tracking-wide">File Transfers</span>
          {activeTransfers.length > 0 && (
            <span className="px-1.5 py-0.5 rounded-full text-[10px] bg-indigo-500/20 text-indigo-300 font-mono">
              {activeTransfers.length} active
            </span>
          )}
        </div>

        <div className="flex items-center gap-1">
          {hasCompleted && (
            <button
              onClick={clearCompleted}
              className="text-[11px] text-zinc-400 hover:text-zinc-200 px-1.5 py-0.5 rounded hover:bg-white/5 transition-colors cursor-pointer"
              title="Clear completed and cancelled transfers"
            >
              Clear Finished
            </button>
          )}
          <button
            onClick={toggleMinimized}
            aria-label="Minimize Transfers"
            title="Minimize"
            className="p-1 hover:bg-white/10 rounded text-zinc-400 hover:text-white transition-colors cursor-pointer"
          >
            <Minimize2 className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={() => setOpen(false)}
            aria-label="Close Transfer Center"
            title="Close Panel"
            className="p-1 hover:bg-white/10 rounded text-zinc-400 hover:text-white transition-colors cursor-pointer"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Transfer List */}
      <div className="overflow-y-auto p-3 space-y-3 max-h-[440px]">
        {transferList.map((transfer) => (
          <TransferCard
            key={transfer.transfer_id}
            transfer={transfer}
            isConfirmingCancel={confirmCancelId === transfer.transfer_id}
            onRequestCancel={() => setConfirmCancelId(transfer.transfer_id)}
            onAbortCancel={() => setConfirmCancelId(null)}
            onConfirmCancel={async () => {
              await cancelTransfer(transfer.transfer_id);
              setConfirmCancelId(null);
            }}
            onDismiss={() => dismissTransfer(transfer.transfer_id)}
          />
        ))}
      </div>
    </div>
  );
};

interface TransferCardProps {
  transfer: TransferProgressEvent;
  isConfirmingCancel: boolean;
  onRequestCancel: () => void;
  onAbortCancel: () => void;
  onConfirmCancel: () => void;
  onDismiss: () => void;
}

const TransferCard: React.FC<TransferCardProps> = ({
  transfer,
  isConfirmingCancel,
  onRequestCancel,
  onAbortCancel,
  onConfirmCancel,
  onDismiss,
}) => {
  const {
    transfer_id,
    source,
    dest,
    operation,
    status,
    total_files,
    completed_files,
    total_bytes,
    transferred_bytes,
    current_file,
    bytes_per_sec,
    estimated_remaining_secs,
    error_count,
    skipped_count,
    error_message,
  } = transfer;

  // Percentage calculation
  const percent =
    total_bytes > 0
      ? Math.min(100, Math.round((transferred_bytes / total_bytes) * 100))
      : total_files > 0
      ? Math.min(100, Math.round((completed_files / total_files) * 100))
      : 0;

  const displayName = source.split(/[\\/]/).filter(Boolean).pop() || source;
  const isRunning = status === 'running' || status === 'queued' || status === 'preparing';
  const isCompleted = status === 'completed';
  const isFailed = status === 'failed';
  const isCancelled = status === 'cancelled';

  // Badge color for operation
  const opColor =
    operation.toLowerCase() === 'move'
      ? 'bg-amber-500/20 text-amber-300 border-amber-500/30'
      : operation.toLowerCase() === 'replace'
      ? 'bg-purple-500/20 text-purple-300 border-purple-500/30'
      : 'bg-sky-500/20 text-sky-300 border-sky-500/30';

  return (
    <div
      data-testid={`transfer-card-${transfer_id}`}
      className="p-2.5 rounded-lg bg-black/20 border border-zinc-800 hover:border-zinc-700 transition-colors flex flex-col gap-2"
    >
      {/* Title & Status */}
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-1.5 min-w-0 flex-1">
          <span className={`px-1.5 py-0.5 rounded text-[10px] font-mono border uppercase shrink-0 ${opColor}`}>
            {operation}
          </span>
          <span className="text-xs font-medium text-zinc-200 truncate" title={`${source} -> ${dest}`}>
            {displayName}
          </span>
        </div>

        <div className="flex items-center gap-1 shrink-0">
          {status === 'queued' && (
            <span className="flex items-center gap-1 text-[11px] text-amber-400/80 font-mono">
              <Clock className="w-3 h-3" />
              <span>Queued</span>
            </span>
          )}
          {status === 'preparing' && (
            <span className="flex items-center gap-1 text-[11px] text-indigo-400 font-mono">
              <Loader2 className="w-3 h-3 animate-spin" />
              <span>Prep</span>
            </span>
          )}
          {status === 'running' && (
            <span className="flex items-center gap-1 text-[11px] text-indigo-400 font-mono">
              <Loader2 className="w-3 h-3 animate-spin" />
              <span>{percent}%</span>
            </span>
          )}
          {isCompleted && (
            <span className="flex items-center gap-1 text-[11px] text-emerald-400 font-mono">
              <CheckCircle2 className="w-3 h-3" />
              <span>Done</span>
            </span>
          )}
          {isFailed && (
            <span className="flex items-center gap-1 text-[11px] text-red-400 font-mono">
              <XCircle className="w-3 h-3" />
              <span>Failed</span>
            </span>
          )}
          {isCancelled && (
            <span className="flex items-center gap-1 text-[11px] text-amber-400 font-mono">
              <AlertTriangle className="w-3 h-3" />
              <span>Cancelled</span>
            </span>
          )}

          {!isRunning && (
            <button
              onClick={onDismiss}
              aria-label="Dismiss Transfer"
              title="Dismiss"
              className="p-1 hover:bg-white/10 rounded text-zinc-400 hover:text-white transition-colors cursor-pointer"
            >
              <X className="w-3 h-3" />
            </button>
          )}
        </div>
      </div>

      {/* Progress Bar */}
      <div className="w-full bg-zinc-800 rounded-full h-1.5 overflow-hidden">
        <div
          data-testid="transfer-progress-bar"
          className={`h-full transition-all duration-200 ${
            isCompleted
              ? 'bg-emerald-500'
              : isFailed
              ? 'bg-red-500'
              : isCancelled
              ? 'bg-amber-500'
              : 'bg-indigo-500'
          }`}
          style={{ width: `${percent}%` }}
        />
      </div>

      {/* Real-time Metrics */}
      <div className="flex items-center justify-between text-[11px] text-zinc-400 font-mono">
        <span>
          {formatBytes(transferred_bytes)} / {formatBytes(total_bytes)}
        </span>
        <span>
          {completed_files} of {total_files} {total_files === 1 ? 'file' : 'files'}
        </span>
      </div>

      {/* Speed & ETA when actively running */}
      {isRunning && (
        <div className="flex items-center justify-between text-[10px] text-zinc-400 font-mono">
          <div className="flex items-center gap-1">
            <Zap className="w-3 h-3 text-amber-400" />
            <span>{formatBytes(bytes_per_sec)}/s</span>
          </div>
          <div className="flex items-center gap-1">
            <Clock className="w-3 h-3 text-sky-400" />
            <span>
              {estimated_remaining_secs != null
                ? `${formatDuration(estimated_remaining_secs)} left`
                : 'Estimating...'}
            </span>
          </div>
        </div>
      )}

      {/* Current File */}
      {isRunning && current_file && (
        <div className="flex items-center gap-1 text-[10px] text-zinc-400 truncate italic">
          <FileText className="w-3 h-3 text-zinc-400 shrink-0" />
          <span className="truncate">{current_file}</span>
        </div>
      )}

      {/* Error or Skipped warnings */}
      {(error_count > 0 || skipped_count > 0 || error_message) && (
        <div className="flex flex-wrap items-center gap-2 text-[10px] pt-0.5">
          {error_count > 0 && (
            <span className="text-red-400 font-mono">{error_count} failed</span>
          )}
          {skipped_count > 0 && (
            <span className="text-amber-400 font-mono">{skipped_count} skipped</span>
          )}
          {error_message && (
            <span className="text-red-300 truncate w-full" title={error_message}>
              {error_message}
            </span>
          )}
        </div>
      )}

      {/* Cancellation controls */}
      {isRunning && (
        <div className="pt-1 flex justify-end">
          {isConfirmingCancel ? (
            <div className="flex items-center gap-2 bg-red-950/40 border border-red-500/30 px-2 py-1 rounded">
              <span className="text-[10px] text-red-300">Cancel transfer?</span>
              <button
                onClick={onConfirmCancel}
                className="px-1.5 py-0.5 rounded bg-red-600 hover:bg-red-500 text-white text-[10px] font-semibold transition-colors cursor-pointer"
              >
                Yes
              </button>
              <button
                onClick={onAbortCancel}
                className="px-1.5 py-0.5 rounded bg-zinc-700 hover:bg-zinc-600 text-zinc-200 text-[10px] transition-colors cursor-pointer"
              >
                No
              </button>
            </div>
          ) : (
            <button
              onClick={onRequestCancel}
              className="text-[10px] text-zinc-400 hover:text-red-400 px-2 py-0.5 rounded hover:bg-red-500/10 transition-colors cursor-pointer"
            >
              Cancel Transfer
            </button>
          )}
        </div>
      )}
    </div>
  );
};
