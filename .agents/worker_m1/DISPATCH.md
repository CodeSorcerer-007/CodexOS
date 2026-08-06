## 2026-08-06T09:22:46Z
<USER_REQUEST>
You are worker_m1 (teamwork_preview_worker), the implementation worker for Milestone 1 (Backend Rust Fixes R1, R2, R7).
Your working directory is: e:/Github/CodexOS/Vaultly/.agents/worker_m1

First, initialize your directory e:/Github/CodexOS/Vaultly/.agents/worker_m1 with progress.md and BRIEFING.md.

Please read the following context files carefully:
- e:/Github/CodexOS/Vaultly/ORIGINAL_REQUEST.md
- e:/Github/CodexOS/Vaultly/PROJECT.md
- e:/Github/CodexOS/Vaultly/.agents/sub_orch_m1/SCOPE.md
- e:/Github/CodexOS/Vaultly/.agents/explorer_1/analysis.md
- e:/Github/CodexOS/Vaultly/.agents/explorer_1/handoff.md

Your task is to implement and verify all Milestone 1 backend Rust fixes in `src-tauri/src/`:

1. `src-tauri/src/lib.rs`: Register `sys::get_top_processes_memory` in the `invoke_handler![tauri::generate_handler![...]]` macro list.
2. `src-tauri/src/ports.rs`: In `spawn_local_server`, replace `.unwrap()` on `Server::http(&server_addr)` by binding `Server::http` synchronously *before* spawning the thread, returning any error back to caller using `?` / `map_err`.
3. `src-tauri/src/git.rs`: In `git_clone`, replace `.expect("failed to execute child")` in the background thread with error handling that emits an error message over `git-progress` (e.g., `let _ = app_handle.emit("git-progress", format!("Error: Failed to execute git: {}", e)); return;`).
4. `src-tauri/src/ssh.rs`: Sanitize SSH connection parameter (ensure no leading `-` or forbidden shell control characters) and shell-escape path parameter (wrap in single quotes, escaping internal single quotes) in `ssh_list_dir` and `ssh_read_file_text`.
5. `src-tauri/src/devdocs.rs`: Replace string-formatted SQL with parameterized `rusqlite` queries (`conn.prepare("SELECT name, type, path FROM searchIndex WHERE name LIKE ?1 LIMIT 100")` using `rusqlite::params![pattern]`).
6. `src-tauri/src/tunnel.rs`: Change `StrictHostKeyChecking=no` to `StrictHostKeyChecking=accept-new` in SSH arguments in `start_tunnel`.
7. `src-tauri/src/multiplexer.rs` & `src-tauri/src/lib.rs`: Add OS runtime detection (`cfg!(target_os = "windows")`) to use `"powershell.exe"` on Windows and `"/bin/bash"` (or `$SHELL`) on Unix/macOS for PTY sessions in `lib.rs` (`start_pty`) and `multiplexer.rs` (`start_multiplex_pty`).
8. `src-tauri/src/ports.rs`: Update `get_active_ports` (`netstat` on Windows vs `lsof` on Unix) and `kill_process` (`taskkill /F /PID` on Windows vs `kill -9` on Unix) using `cfg!(target_os = "windows")`.
9. `src-tauri/src/system_tools.rs`: Make hosts file path platform-aware (`/etc/hosts` on Unix vs `C:\Windows\System32\drivers\etc\hosts` on Windows) in `read_hosts` and `write_hosts`.

MANDATORY INTEGRITY WARNING:
DO NOT CHEAT. All implementations must be genuine. DO NOT hardcode test results, create dummy/facade implementations, or circumvent the intended task. A teamwork_preview_auditor will independently verify your work. Integrity violations WILL be detected and your work WILL be rejected.

Verification Requirements:
- Run `cargo check` (or `cargo test` / `cargo build`) inside `src-tauri/` to verify that the Rust codebase compiles cleanly with no errors.
- Document all modified files, exact changes, and verification commands/results in `e:/Github/CodexOS/Vaultly/.agents/worker_m1/handoff.md`.
- Send a completion message to the parent (sub_orch_m1) with a summary of changes and reference to your handoff.md.
</USER_REQUEST>
