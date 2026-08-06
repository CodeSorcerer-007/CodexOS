# Scope: Milestone 1 — Backend Fixes (R1, R2, R7)

## Mission
Fix all Rust backend critical bugs, security vulnerabilities, and cross-platform OS abstractions in `src-tauri/`.

## Assigned Work Items
1. `lib.rs`: Register `get_top_processes_memory` command in `invoke_handler![]` macro.
2. `ports.rs`: Replace `.unwrap()` on `Server::http()` with proper `?` error propagation in `start_mitm_proxy`.
3. `git.rs`: Replace `.expect("failed to execute child")` in background clone thread with graceful error event emission to frontend.
4. `ssh.rs`: Parameterize and escape shell metacharacters in SSH commands (`shell_escape` or argument vector).
5. `devdocs.rs`: Replace string-formatted SQL with parameterized `rusqlite` queries (`params![...]`).
6. `tunnel.rs`: Change `StrictHostKeyChecking=no` to `StrictHostKeyChecking=accept-new` in SSH arguments.
7. `multiplexer.rs` & `lib.rs`: Add OS runtime detection (`cfg!(target_os = "windows")` / `std::env::consts::OS`) to use `powershell.exe` on Windows and `/bin/bash` on Unix for PTY sessions.
8. `ports.rs` & `system_tools.rs`: Cross-platform active ports (`lsof` on Unix vs `netstat` on Windows) and process termination (`kill -9` on Unix vs `taskkill` on Windows).
9. `system_tools.rs`: Platform-aware hosts file path (`/etc/hosts` on Unix vs `C:\Windows\System32\drivers\etc\hosts` on Windows).

## Code Layout Ownership
- `src-tauri/src/lib.rs`
- `src-tauri/src/ports.rs`
- `src-tauri/src/git.rs`
- `src-tauri/src/ssh.rs`
- `src-tauri/src/devdocs.rs`
- `src-tauri/src/tunnel.rs`
- `src-tauri/src/multiplexer.rs`
- `src-tauri/src/system_tools.rs`

## References
- `e:/Github/CodexOS/Vaultly/ORIGINAL_REQUEST.md`
- `e:/Github/CodexOS/Vaultly/PROJECT.md`
- `e:/Github/CodexOS/Vaultly/.agents/explorer_1/analysis.md`
- `e:/Github/CodexOS/Vaultly/.agents/explorer_1/handoff.md`
