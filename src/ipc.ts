/**
 * Type-safe Tauri IPC wrappers with runtime Zod validation.
 *
 * Why: `invoke<T>(...)` trusts the Rust type contract at compile time only.
 * If the Rust side evolves (renamed field, changed type), TypeScript won't
 * catch the mismatch — the value is silently wrong at runtime. These wrappers
 * parse IPC responses through Zod schemas so mismatches throw immediately
 * with a clear error rather than surfacing as subtle data corruption.
 */

import { invoke } from '@tauri-apps/api/core';
import { z } from 'zod';

// ── Schemas ────────────────────────────────────────────────────────────────

const DriveSchema = z.object({
  name:            z.string(),
  mount_point:     z.string(),
  total_space:     z.number(),
  available_space: z.number(),
});

export const SysStatsSchema = z.object({
  cpu_usage: z.number(),
  mem_total: z.number(),
  mem_used:  z.number(),
  drives:    z.array(DriveSchema),
});
export type SysStats = z.infer<typeof SysStatsSchema>;

export const GitStatusSchema = z.object({
  staged:    z.array(z.string()),
  unstaged:  z.array(z.string()),
  untracked: z.array(z.string()),
  branch:    z.string(),
});
export type GitStatus = z.infer<typeof GitStatusSchema>;

export const DiagnosisSchema = z.object({
  cause:         z.string(),
  confidence:    z.enum(['high', 'medium', 'low']),
  explanation:   z.string(),
  suggested_fix: z.string(),
  related_files: z.array(z.string()),
});
export type Diagnosis = z.infer<typeof DiagnosisSchema>;

// ── Typed invoke helpers ───────────────────────────────────────────────────

/** Fetches real-time CPU, memory, and disk stats from the Rust backend. */
export async function getSysStats(): Promise<SysStats> {
  const raw = await invoke<unknown>('get_sys_stats');
  return SysStatsSchema.parse(raw);
}

/** Fetches the backend API semver version. */
export async function getApiVersion(): Promise<string> {
  return await invoke<string>('get_api_version');
}

/** Returns the current git status for the given repository path. */
export async function getGitStatus(path: string): Promise<GitStatus> {
  const raw = await invoke<unknown>('get_git_status', { path });
  return GitStatusSchema.parse(raw);
}

/** Workspace sandbox: adds an allowed path root */
export async function addAllowedPath(path: string): Promise<void> {
  await invoke('add_allowed_path', { path });
}

/** Workspace sandbox: removes an allowed path root */
export async function removeAllowedPath(path: string): Promise<void> {
  await invoke('remove_allowed_path', { path });
}

/** Workspace sandbox: lists all allowed roots */
export async function getAllowedPaths(): Promise<string[]> {
  return await invoke<string[]>('get_allowed_paths');
}

/** Resizes a multiplexed PTY session */
export async function resizeMultiplexPty(id: string, rows: number, cols: number): Promise<void> {
  await invoke('resize_multiplex_pty', { id, rows, cols });
}

/** Configures the proxy SSRF whitelist */
export async function setProxyWhitelist(hosts: string[]): Promise<void> {
  await invoke('set_proxy_whitelist', { hosts });
}

/** Gets the proxy SSRF whitelist */
export async function getProxyWhitelist(): Promise<string[]> {
  return await invoke<string[]>('get_proxy_whitelist');
}

/** Persistent SQLite KV store: write */
export async function kvSet(key: string, value: string): Promise<void> {
  await invoke('kv_set', { key, value });
}

/** Persistent SQLite KV store: read */
export async function kvGet(key: string): Promise<string | null> {
  return await invoke<string | null>('kv_get', { key });
}

export type DiagnosticTrigger =
  | { type: 'terminal_error'; session_id: string; exit_code: number; last_n_lines?: number }
  | { type: 'memory_spike'; process_name: string; delta_mb: number; threshold_mb: number }
  | { type: 'proxy_error'; request_id: number; status_code: number; url: string; method: string };

/**
 * Calls the AI copilot backend and returns a validated Diagnosis.
 * Accepts the same `trigger` payload shape that the Rust `diagnose_issue`
 * command expects.
 */
export async function diagnoseIssue(
  trigger: DiagnosticTrigger,
  repoPath: string | null,
): Promise<Diagnosis> {
  const raw = await invoke<unknown>('diagnose_issue', { trigger, repoPath });
  return DiagnosisSchema.parse(raw);
}

// ── File Operations & Journal Schemas ─────────────────────────────────────

export const UndoResultSchema = z.object({
  success: z.boolean(),
  description: z.string(),
  undone_type: z.string(),
});
export type UndoResult = z.infer<typeof UndoResultSchema>;

export const JournalEntrySchema = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('Rename'),
    old_path: z.string(),
    new_path: z.string(),
    timestamp: z.number(),
  }),
  z.object({
    type: z.literal('Move'),
    source: z.string(),
    original_source: z.string(),
    timestamp: z.number(),
  }),
  z.object({
    type: z.literal('Copy'),
    destination: z.string(),
    is_dir: z.boolean().optional(),
    size_bytes: z.number().optional(),
    sha256: z.string().nullable().optional(),
    timestamp: z.number(),
  }),
  z.object({
    type: z.literal('DeleteTrash'),
    path: z.string(),
    timestamp: z.number(),
  }),
]);
export type JournalEntry = z.infer<typeof JournalEntrySchema>;

/**
 * Undoes the last reversible file operation from the in-memory journal.
 */
export async function undoLastFileOperation(): Promise<UndoResult> {
  const raw = await invoke<unknown>('undo_last_file_operation');
  return UndoResultSchema.parse(raw);
}

/**
 * Retrieves the recent in-memory file operation journal history.
 */
export async function getFileOperationHistory(limit = 30): Promise<JournalEntry[]> {
  const raw = await invoke<unknown>('get_file_operation_history', { limit });
  return z.array(JournalEntrySchema).parse(raw);
}

/**
 * Permanently deletes a file or directory bypassing the Recycle Bin with explicit confirmation.
 */
export async function permanentDeleteFile(path: string, confirm = true): Promise<void> {
  await invoke('permanent_delete_file', { path, confirm });
}

export interface FormattedFileError {
  title: string;
  message: string;
}

/**
 * Transforms raw backend OS/filesystem error messages into user-friendly actionable guidance.
 */
export function formatFileError(err: unknown): FormattedFileError {
  const rawMsg = err instanceof Error ? err.message : String(err);

  if (/read-only|readonly/i.test(rawMsg)) {
    return {
      title: 'Read-Only Attribute',
      message: 'The target file or folder is marked read-only. Remove the read-only attribute in Windows file properties and retry.',
    };
  }
  if (/access( is)? denied|permission denied|os error 5/i.test(rawMsg)) {
    const isSystemPath = /windows[\\/]system32|program files|windows[\\/]system|system-protected/i.test(rawMsg);
    if (isSystemPath) {
      return {
        title: 'System Access Denied',
        message: 'Your current Windows user account lacks permission to modify this system-protected location. Modifying Windows system directories requires elevated administrator privileges, which may impact system stability.',
      };
    }
    return {
      title: 'Access Denied',
      message: 'Your current Windows user account lacks write permissions for this location, or the destination folder is set to read-only. Check file permissions or ensure another process is not locking the file.',
    };
  }
  if (/sharing violation|in use|locked|used by another|os error 32/i.test(rawMsg)) {
    return {
      title: 'File in Use',
      message: 'The file is currently open or locked by another application. Please close the other program and retry.',
    };
  }
  if (/cannot undo deletetrash|recycle bin manual/i.test(rawMsg)) {
    return {
      title: 'Manual Recovery Required',
      message: 'Items moved to the Recycle Bin cannot be restored automatically. Please open the Windows Recycle Bin to restore this file.',
    };
  }
  if (/already exists|already occupied|os error 183/i.test(rawMsg)) {
    return {
      title: 'Item Already Exists',
      message: 'A file or folder with this name already exists in the destination.',
    };
  }
  if (/recycle ?bin|trash|recyclebinfailed/i.test(rawMsg)) {
    return {
      title: 'Recycle Bin Not Supported',
      message: 'This drive or network location does not support the Recycle Bin. You can permanently delete this item instead.',
    };
  }
  if (/not found|no longer exists|cannot find|os error 2/i.test(rawMsg)) {
    return {
      title: 'Item Not Found',
      message: 'The specified file or folder no longer exists at this location.',
    };
  }
  if (/space|disk full|not enough storage|os error 112/i.test(rawMsg)) {
    return {
      title: 'Disk Full',
      message: 'There is insufficient free disk space to complete this operation.',
    };
  }
  if (/fingerprint mismatch|destination modified|modified since|sha256 mismatch|destinationmodified/i.test(rawMsg)) {
    return {
      title: 'Destination Modified',
      message: 'The destination file was modified after it was copied. Undo was aborted to prevent accidental data loss.',
    };
  }
  if (/symlink|reparse point/i.test(rawMsg)) {
    return {
      title: 'Security Protection',
      message: 'Symlinks and reparse points cannot be deleted via undo.',
    };
  }
  if (/destructive operation rejected/i.test(rawMsg)) {
    return {
      title: 'Operation Blocked',
      message: 'Cannot delete or modify Windows system directories or drive roots.',
    };
  }

  if (/circular|cannot copy a folder into itself|recursive/i.test(rawMsg)) {
    return {
      title: 'Invalid Destination',
      message: 'Cannot copy or move a folder into itself or one of its subdirectories.',
    };
  }
  if (/type mismatch/i.test(rawMsg)) {
    return {
      title: 'Type Conflict',
      message: 'Cannot replace a file with a folder, or a folder with a file.',
    };
  }

  return {
    title: 'File Operation Error',
    message: rawMsg.replace(/^Error:\s*/i, '').trim(),
  };
}

// ── File Conflict Resolution Engine Schemas & Wrappers ──────────────────────

export const ConflictActionSchema = z.enum(['replace', 'skip', 'rename', 'cancel']);
export type ConflictAction = z.infer<typeof ConflictActionSchema>;

export const ConflictInfoSchema = z.object({
  source_path: z.string(),
  dest_path: z.string(),
  item_name: z.string(),
  is_dir: z.boolean(),
  source_size_bytes: z.number().nullable().optional(),
  dest_size_bytes: z.number().nullable().optional(),
  source_mtime: z.number().nullable().optional(),
  dest_mtime: z.number().nullable().optional(),
  is_same_size: z.boolean(),
  is_same_mtime: z.boolean(),
  type_mismatch: z.boolean(),
  dest_is_dir: z.boolean(),
});
export type ConflictInfo = z.infer<typeof ConflictInfoSchema>;

export const ConflictCheckResultSchema = z.object({
  conflicts: z.array(ConflictInfoSchema),
  safe_count: z.number(),
  total_count: z.number(),
});
export type ConflictCheckResult = z.infer<typeof ConflictCheckResultSchema>;

export const TransferItemSpecSchema = z.object({
  source: z.string(),
  dest: z.string(),
  action: ConflictActionSchema.nullable().optional(),
});
export type TransferItemSpec = z.infer<typeof TransferItemSpecSchema>;

export const FileTransferRecordSchema = z.object({
  source: z.string(),
  dest: z.string(),
  final_path: z.string().nullable().optional(),
  status: z.string(),
  error: z.string().nullable().optional(),
});
export type FileTransferRecord = z.infer<typeof FileTransferRecordSchema>;

export const BatchTransferResultSchema = z.object({
  operation: z.string(),
  total_items: z.number(),
  success_count: z.number(),
  replaced_count: z.number(),
  renamed_count: z.number(),
  skipped_count: z.number(),
  failed_count: z.number(),
  records: z.array(FileTransferRecordSchema),
});
export type BatchTransferResult = z.infer<typeof BatchTransferResultSchema>;

export const CompareResultSchema = z.object({
  source_sha256: z.string().nullable().optional(),
  dest_sha256: z.string().nullable().optional(),
  is_identical_content: z.boolean().nullable().optional(),
  is_identical_size: z.boolean(),
  is_identical_mtime: z.boolean(),
  is_identical_metadata: z.boolean(),
});
export type CompareResult = z.infer<typeof CompareResultSchema>;

export const TransferProgressEventSchema = z.object({
  transfer_id: z.string(),
  source: z.string(),
  dest: z.string(),
  operation: z.string(),
  status: z.enum(['queued', 'preparing', 'running', 'completed', 'failed', 'cancelled']),
  total_files: z.number(),
  completed_files: z.number(),
  total_bytes: z.number(),
  transferred_bytes: z.number(),
  current_file: z.string().nullable().optional(),
  bytes_per_sec: z.number(),
  estimated_remaining_secs: z.number().nullable().optional(),
  error_count: z.number(),
  skipped_count: z.number(),
  error_message: z.string().nullable().optional(),
});
export type TransferProgressEvent = z.infer<typeof TransferProgressEventSchema>;

/**
 * Checks for destination name and type conflicts before initiating copy or move.
 */
export async function checkFileConflicts(
  sources: string[],
  targetDir: string,
  operation: 'copy' | 'move',
): Promise<ConflictCheckResult> {
  const raw = await invoke<unknown>('check_file_conflicts', {
    sources,
    targetDir,
    operation,
  });
  return ConflictCheckResultSchema.parse(raw);
}

/**
 * Executes a batch file transfer with per-item or default conflict resolution actions.
 */
export async function executeFileTransfer(
  operation: 'copy' | 'move',
  items: TransferItemSpec[],
  defaultAction?: ConflictAction | null,
  transferId?: string | null,
): Promise<BatchTransferResult> {
  const payload: Record<string, unknown> = {
    operation,
    items,
    defaultAction: defaultAction ?? null,
  };
  if (transferId !== undefined && transferId !== null) {
    payload.transferId = transferId;
  }
  const raw = await invoke<unknown>('execute_file_transfer', payload);
  return BatchTransferResultSchema.parse(raw);
}

/**
 * Requests cooperative cancellation of an active file transfer by its ID.
 */
export async function cancelFileTransfer(transferId: string): Promise<boolean> {
  return await invoke<boolean>('cancel_file_transfer', { transferId });
}

/**
 * Retrieves the real-time status of all active transfers currently managed by the backend.
 */
export async function getActiveTransfers(): Promise<TransferProgressEvent[]> {
  const raw = await invoke<unknown>('get_active_transfers');
  return z.array(TransferProgressEventSchema).parse(raw);
}

/**
 * Compares metadata and SHA-256 hashes (files < 100MB) of two files.
 */
export async function compareFileContents(
  source: string,
  dest: string,
): Promise<CompareResult> {
  const raw = await invoke<unknown>('compare_file_contents', {
    source,
    dest,
  });
  return CompareResultSchema.parse(raw);
}

/**
 * Computes an collision-free unique destination path using Windows numbering.
 */
export async function generateUniqueName(
  dest: string,
): Promise<string> {
  return await invoke<string>('generate_unique_name', { dest });
}

// ============================================================================
// Search Engine & Indexing Types & Functions
// ============================================================================

export const SearchQuerySchema = z.object({
  raw_query: z.string(),
  name_terms: z.array(z.string()),
  extensions: z.array(z.string()),
  file_types: z.array(z.string()),
  min_size: z.number().nullable().optional(),
  max_size: z.number().nullable().optional(),
  modified_after: z.number().nullable().optional(),
  modified_before: z.number().nullable().optional(),
  path_patterns: z.array(z.string()),
  content_query: z.string().nullable().optional(),
  case_sensitive: z.boolean(),
});
export type SearchQuery = z.infer<typeof SearchQuerySchema>;

export const SearchExecutionOptionsSchema = z.object({
  search_content: z.boolean(),
  max_results: z.number().optional(),
  max_file_size_bytes: z.number().optional(),
  custom_exclusions: z.array(z.string()).optional(),
  include_hidden: z.boolean().optional(),
});
export type SearchExecutionOptions = z.infer<typeof SearchExecutionOptionsSchema>;

export const SearchMatchSchema = z.object({
  path: z.string(),
  filename: z.string(),
  is_dir: z.boolean(),
  size_bytes: z.number(),
  modified_secs: z.number(),
  line_number: z.number().nullable().optional(),
  snippet: z.string().nullable().optional(),
  match_indices: z.array(z.tuple([z.number(), z.number()])),
  relevance_score: z.number(),
});
export type SearchMatch = z.infer<typeof SearchMatchSchema>;

export const SearchBatchEventSchema = z.object({
  search_id: z.string(),
  matches: z.array(SearchMatchSchema),
  total_scanned: z.number(),
});
export type SearchBatchEvent = z.infer<typeof SearchBatchEventSchema>;

export const SearchDoneEventSchema = z.object({
  search_id: z.string(),
  total_matches: z.number(),
  total_scanned: z.number(),
  duration_ms: z.number(),
  cancelled: z.boolean(),
});
export type SearchDoneEvent = z.infer<typeof SearchDoneEventSchema>;

export const WorkspaceIndexStatusSchema = z.object({
  workspace_path: z.string(),
  last_indexed: z.number(),
  file_count: z.number(),
  status: z.string(),
});
export type WorkspaceIndexStatus = z.infer<typeof WorkspaceIndexStatusSchema>;

/**
 * Initiates a streaming recursive search across a designated folder or workspace.
 */
export async function startFileSearch(
  searchId: string,
  scopePath: string,
  query: string,
  options?: SearchExecutionOptions,
): Promise<string> {
  return await invoke<string>('start_file_search', {
    searchId,
    scopePath,
    query,
    options: options ?? null,
  });
}

/**
 * Cancels an active background file search.
 */
export async function cancelFileSearch(searchId: string): Promise<boolean> {
  return await invoke<boolean>('cancel_file_search', { searchId });
}

/**
 * Validates and parses a query string into a structured query preview.
 */
export async function parseQueryPreview(query: string): Promise<SearchQuery> {
  const raw = await invoke<unknown>('parse_query_preview', { query });
  return SearchQuerySchema.parse(raw);
}

/**
 * Retrieves the current SQLite index status for a workspace root.
 */
export async function getSearchIndexStatus(
  workspacePath: string,
): Promise<WorkspaceIndexStatus | null> {
  const raw = await invoke<unknown>('get_search_index_status', { workspacePath });
  if (!raw) return null;
  return WorkspaceIndexStatusSchema.parse(raw);
}

/**
 * Re-indexes a workspace into the persistent SQLite index.
 */
export async function reindexWorkspace(
  workspacePath: string,
  customExclusions?: string[],
): Promise<WorkspaceIndexStatus> {
  const raw = await invoke<unknown>('reindex_workspace', {
    workspacePath,
    customExclusions: customExclusions ?? null,
  });
  return WorkspaceIndexStatusSchema.parse(raw);
}

/**
 * Clears the persistent SQLite index for a workspace root.
 */
export async function clearSearchIndex(workspacePath: string): Promise<void> {
  await invoke<void>('clear_search_index', { workspacePath });
}
