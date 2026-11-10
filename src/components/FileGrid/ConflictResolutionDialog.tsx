import React, { useState, useEffect } from 'react';
import {
  Folder24Filled,
  Document24Regular,
  Warning24Filled,
  ArrowRight20Regular,
  Dismiss20Regular,
  ArrowSync20Regular,
  Checkmark20Filled,
} from '@fluentui/react-icons';
import { formatSize } from './utils';
import {
  compareFileContents,
  type ConflictInfo,
  type ConflictAction,
  type CompareResult,
} from '../../ipc';

interface ConflictResolutionDialogProps {
  conflict: ConflictInfo;
  currentIndex: number;
  totalConflicts: number;
  operation: 'copy' | 'move';
  onResolve: (action: ConflictAction, applyToAll: boolean) => void;
  onCancel: () => void;
}

export const ConflictResolutionDialog: React.FC<ConflictResolutionDialogProps> = ({
  conflict,
  currentIndex,
  totalConflicts,
  operation,
  onResolve,
  onCancel,
}) => {
  const [applyToAll, setApplyToAll] = useState(false);
  const [comparing, setComparing] = useState(false);
  const [compareResult, setCompareResult] = useState<CompareResult | null>(null);
  const [compareError, setCompareError] = useState<string | null>(null);

  // Reset comparison state when conflict changes
  useEffect(() => {
    setComparing(false);
    setCompareResult(null);
    setCompareError(null);
  }, [conflict.source_path, conflict.dest_path]);

  // Keyboard shortcut support: Escape to cancel, Enter to default rename or action
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onCancel();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onCancel]);

  const handleCompare = async () => {
    if (conflict.is_dir || conflict.dest_is_dir) return;
    setComparing(true);
    setCompareError(null);
    try {
      const res = await compareFileContents(conflict.source_path, conflict.dest_path);
      setCompareResult(res);
    } catch (err: unknown) {
      setCompareError(err instanceof Error ? err.message : String(err));
    } finally {
      setComparing(false);
    }
  };

  const formatDate = (timestampSec?: number | null) => {
    if (!timestampSec) return 'Unknown date';
    return new Date(timestampSec * 1000).toLocaleString();
  };

  const remaining = totalConflicts - currentIndex;
  const isTypeMismatch = conflict.type_mismatch;

  // Comparison labels
  const sizeDiff = (() => {
    if (conflict.is_dir || conflict.dest_is_dir) return null;
    const srcSize = conflict.source_size_bytes ?? 0;
    const dstSize = conflict.dest_size_bytes ?? 0;
    if (srcSize === dstSize) return 'Same size';
    if (srcSize > dstSize) return `Source is larger (+${formatSize(srcSize - dstSize)})`;
    return `Source is smaller (-${formatSize(dstSize - srcSize)})`;
  })();

  const dateDiff = (() => {
    const srcMtime = conflict.source_mtime ?? 0;
    const dstMtime = conflict.dest_mtime ?? 0;
    if (!srcMtime || !dstMtime) return null;
    if (srcMtime === dstMtime) return 'Same modified date';
    if (srcMtime > dstMtime) return 'Source is newer';
    return 'Source is older';
  })();

  return (
    <div
      className="fixed inset-0 z-[120] flex items-center justify-center bg-black/75 p-4 select-none backdrop-blur-sm"
      onClick={(e) => e.stopPropagation()}
      data-testid="conflict-resolution-dialog"
    >
      <div className="bg-[#242424] border border-[rgba(255,255,255,0.12)] rounded-xl p-6 max-w-2xl w-full flex flex-col gap-5 shadow-2xl animate-in fade-in zoom-in-95 duration-150">
        {/* Header */}
        <div className="flex items-center justify-between pb-3 border-b border-[rgba(255,255,255,0.08)]">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-[#d97706]/15 border border-[#d97706]/30 text-[#f59e0b]">
              <Warning24Filled />
            </div>
            <div>
              <h3 className="text-base font-semibold text-[#f1f2f6]">
                File Conflict Detected
              </h3>
              <p className="text-xs text-[#8f8f8f]">
                {operation === 'copy' ? 'Copying to' : 'Moving to'} a destination with an existing item ({currentIndex + 1} of {totalConflicts})
              </p>
            </div>
          </div>
          <button
            onClick={onCancel}
            className="text-[#8f8f8f] hover:text-white p-1.5 rounded-md hover:bg-[rgba(255,255,255,0.08)] transition-colors"
            title="Cancel transfer (Esc)"
          >
            <Dismiss20Regular />
          </button>
        </div>

        {/* Warning Banner if Type Mismatch */}
        {isTypeMismatch && (
          <div className="flex items-start gap-2.5 p-3 rounded-lg bg-red-950/40 border border-red-500/30 text-red-200 text-xs">
            <Warning24Filled className="text-red-400 shrink-0 mt-0.5" />
            <div>
              <span className="font-semibold text-red-100">Type Conflict:</span> Cannot replace a {conflict.is_dir ? 'folder' : 'file'} with a {conflict.dest_is_dir ? 'folder' : 'file'}. You can choose <strong>Rename</strong> to keep both or <strong>Skip</strong> this item.
            </div>
          </div>
        )}

        {/* Comparison Cards Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {/* Source Card */}
          <div className="bg-[#1c1c1c] border border-[rgba(255,255,255,0.08)] rounded-lg p-3.5 flex flex-col gap-2 relative">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-semibold tracking-wider uppercase text-[#38bdf8] flex items-center gap-1.5">
                Incoming Source
              </span>
              <span className="text-[10px] px-1.5 py-0.5 rounded bg-[rgba(255,255,255,0.06)] text-[#a3a3a3]">
                {conflict.is_dir ? 'Folder' : 'File'}
              </span>
            </div>

            <div className="flex items-start gap-3 mt-1">
              <div className="p-2 rounded bg-[rgba(255,255,255,0.04)] text-[#e3a833] shrink-0">
                {conflict.is_dir ? <Folder24Filled /> : <Document24Regular className="text-[#38bdf8]" />}
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium text-[#f1f2f6] truncate" title={conflict.item_name}>
                  {conflict.item_name}
                </p>
                <p className="text-[11px] text-[#737373] truncate mt-0.5" title={conflict.source_path}>
                  {conflict.source_path}
                </p>
              </div>
            </div>

            <div className="mt-2 pt-2 border-t border-[rgba(255,255,255,0.06)] flex flex-col gap-1 text-xs text-[#a3a3a3]">
              <div className="flex justify-between">
                <span>Size:</span>
                <span className="text-[#e5e5e5] font-mono">
                  {conflict.is_dir ? 'Folder' : formatSize(conflict.source_size_bytes ?? 0)}
                </span>
              </div>
              <div className="flex justify-between">
                <span>Modified:</span>
                <span className="text-[#e5e5e5]">{formatDate(conflict.source_mtime)}</span>
              </div>
            </div>
          </div>

          {/* Destination Card */}
          <div className="bg-[#1c1c1c] border border-[rgba(255,255,255,0.08)] rounded-lg p-3.5 flex flex-col gap-2 relative">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-semibold tracking-wider uppercase text-[#f59e0b] flex items-center gap-1.5">
                Existing in Destination
              </span>
              <span className="text-[10px] px-1.5 py-0.5 rounded bg-[rgba(255,255,255,0.06)] text-[#a3a3a3]">
                {conflict.dest_is_dir ? 'Folder' : 'File'}
              </span>
            </div>

            <div className="flex items-start gap-3 mt-1">
              <div className="p-2 rounded bg-[rgba(255,255,255,0.04)] text-[#e3a833] shrink-0">
                {conflict.dest_is_dir ? <Folder24Filled /> : <Document24Regular className="text-[#f59e0b]" />}
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium text-[#f1f2f6] truncate" title={conflict.item_name}>
                  {conflict.item_name}
                </p>
                <p className="text-[11px] text-[#737373] truncate mt-0.5" title={conflict.dest_path}>
                  {conflict.dest_path}
                </p>
              </div>
            </div>

            <div className="mt-2 pt-2 border-t border-[rgba(255,255,255,0.06)] flex flex-col gap-1 text-xs text-[#a3a3a3]">
              <div className="flex justify-between">
                <span>Size:</span>
                <span className="text-[#e5e5e5] font-mono">
                  {conflict.dest_is_dir ? 'Folder' : formatSize(conflict.dest_size_bytes ?? 0)}
                </span>
              </div>
              <div className="flex justify-between">
                <span>Modified:</span>
                <span className="text-[#e5e5e5]">{formatDate(conflict.dest_mtime)}</span>
              </div>
            </div>
          </div>
        </div>

        {/* Differences & Compare Section */}
        <div className="flex flex-col gap-2 bg-[#1f1f1f] rounded-lg p-3 border border-[rgba(255,255,255,0.05)] text-xs">
          <div className="flex items-center justify-between flex-wrap gap-2">
            <div className="flex items-center gap-2">
              <span className="text-[#8f8f8f]">Differences:</span>
              {sizeDiff && (
                <span className="px-2 py-0.5 rounded bg-[rgba(255,255,255,0.06)] text-[#e5e5e5]">
                  {sizeDiff}
                </span>
              )}
              {dateDiff && (
                <span className="px-2 py-0.5 rounded bg-[rgba(255,255,255,0.06)] text-[#e5e5e5]">
                  {dateDiff}
                </span>
              )}
            </div>

            {!conflict.is_dir && !conflict.dest_is_dir && (
              <button
                type="button"
                onClick={handleCompare}
                disabled={comparing}
                className="flex items-center gap-1.5 px-2.5 py-1 rounded bg-[rgba(255,255,255,0.08)] hover:bg-[rgba(255,255,255,0.14)] text-[#38bdf8] font-medium transition-colors disabled:opacity-50"
              >
                {comparing ? (
                  <>
                    <ArrowSync20Regular className="animate-spin text-xs" />
                    <span>Computing Hash...</span>
                  </>
                ) : (
                  <>
                    <ArrowRight20Regular />
                    <span>Compare Contents (SHA-256)</span>
                  </>
                )}
              </button>
            )}
          </div>

          {/* Comparison Results */}
          {compareResult && (
            <div className="mt-2 pt-2 border-t border-[rgba(255,255,255,0.06)] flex flex-col gap-1.5">
              <div className="flex items-center gap-2">
                {compareResult.is_identical_content === true ? (
                  <span className="flex items-center gap-1 text-emerald-400 font-semibold">
                    <Checkmark20Filled className="text-emerald-400 text-sm" /> Identical binary contents (SHA-256 match)
                  </span>
                ) : compareResult.is_identical_content === false ? (
                  <span className="flex items-center gap-1 text-amber-400 font-semibold">
                    <Warning24Filled className="text-amber-400 text-sm" /> File contents differ
                  </span>
                ) : (
                  <span className="text-[#a3a3a3]">
                    File exceeds 100MB; binary hash skipped for performance.
                  </span>
                )}
              </div>
              {compareResult.source_sha256 && compareResult.dest_sha256 && (
                <div className="grid grid-cols-1 gap-1 font-mono text-[10px] text-[#737373]">
                  <div className="truncate">Src: {compareResult.source_sha256}</div>
                  <div className="truncate">Dst: {compareResult.dest_sha256}</div>
                </div>
              )}
            </div>
          )}

          {compareError && (
            <div className="text-red-400 text-[11px] mt-1">
              Could not compare contents: {compareError}
            </div>
          )}
        </div>

        {/* Batch Apply To All Checkbox */}
        {remaining > 1 && (
          <label className="flex items-center gap-2.5 text-xs text-[#d4d4d4] cursor-pointer select-none">
            <input
              type="checkbox"
              checked={applyToAll}
              onChange={(e) => setApplyToAll(e.target.checked)}
              className="w-4 h-4 rounded bg-[#1c1c1c] border border-[rgba(255,255,255,0.2)] text-blue-600 focus:ring-0 focus:outline-none"
            />
            <span>
              Apply this decision to all remaining conflicts ({remaining})
            </span>
          </label>
        )}

        {/* Action Buttons */}
        <div className="flex items-center justify-between pt-3 border-t border-[rgba(255,255,255,0.08)]">
          <button
            type="button"
            onClick={onCancel}
            className="px-3.5 py-1.5 rounded-lg bg-[rgba(255,255,255,0.06)] hover:bg-[rgba(255,255,255,0.12)] text-[#e5e5e5] text-xs font-medium transition-colors"
          >
            Cancel
          </button>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => onResolve('skip', applyToAll)}
              className="px-3.5 py-1.5 rounded-lg bg-[rgba(255,255,255,0.08)] hover:bg-[rgba(255,255,255,0.15)] text-[#e5e5e5] text-xs font-medium transition-colors"
              title="Leave the existing destination item untouched"
            >
              Skip
            </button>

            <button
              type="button"
              onClick={() => onResolve('rename', applyToAll)}
              className="px-3.5 py-1.5 rounded-lg bg-blue-600/30 hover:bg-blue-600/40 border border-blue-500/40 text-blue-200 text-xs font-medium transition-colors"
              title="Keep both items by creating a uniquely numbered copy, e.g. file (1).txt"
            >
              Rename (Keep Both)
            </button>

            <button
              type="button"
              disabled={isTypeMismatch}
              onClick={() => onResolve('replace', applyToAll)}
              className={`px-3.5 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                isTypeMismatch
                  ? 'bg-[rgba(255,255,255,0.04)] text-[#666] cursor-not-allowed border border-transparent'
                  : 'bg-red-600/30 hover:bg-red-600/50 border border-red-500/40 text-red-200'
              }`}
              title={isTypeMismatch ? 'Cannot replace due to type conflict' : 'Overwrite the destination item with source'}
            >
              Replace
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
