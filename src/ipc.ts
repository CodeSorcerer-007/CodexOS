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
