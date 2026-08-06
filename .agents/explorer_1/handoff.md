# Handoff Report — Explorer 1

**Agent ID:** `explorer_1`  
**Working Directory:** `e:/Github/CodexOS/Vaultly/.agents/explorer_1`  
**Target Scope:** Survey and analysis of Rust backend code (`src-tauri/`) for Requirements R1, R2, R5, R7.  

---

## 1. Observation

Direct observations from examining `src-tauri/` Rust backend files:

- **R1 - Missing Command Registration (`src-tauri/src/lib.rs`):**
  - Line 147: `sys::get_top_processes_memory` is defined in `src-tauri/src/sys.rs` (line 56) but missing from `tauri::generate_handler![...]` in `lib.rs` (lines 122–222).
- **R1 - Panic on Occupied Port 8080 (`src-tauri/src/ports.rs`):**
  - Line 93: `let server = Server::http(&server_addr).unwrap();` panics inside the thread spawned by `spawn_local_server` if port 8080 is occupied.
- **R1 - Panic in Git Clone Thread (`src-tauri/src/git.rs`):**
  - Line 296: `.spawn().expect("failed to execute child");` panics the thread spawned by `git_clone` if `git` executable is not in `PATH`.
- **R2 - Shell Injection Vulnerability (`src-tauri/src/ssh.rs`):**
  - Lines 6–7 & 57–59: Raw format string interpolation `format!("find \"{}\" ...", path)` and `format!("cat \"{}\"", path)`, plus unvalidated `.arg(&connection)` allows flag injection (e.g. `-oProxyCommand=...`) and shell command injection.
- **R2 - SQL Injection Vulnerability (`src-tauri/src/devdocs.rs`):**
  - Line 25: `let sql = format!("SELECT name, type, path FROM searchIndex WHERE name LIKE '%{}%' LIMIT 100", query.replace("'", "''"));` performs unparameterized string formatting on SQL queries.
- **R2 - Insecure SSH Host Key Verification (`src-tauri/src/tunnel.rs`):**
  - Line 48: `"-o", "StrictHostKeyChecking=no"` disables host key validation entirely.
- **R5 - Misleading ZKP Naming (`src-tauri/src/zkp.rs`):**
  - Lines 6 & 27: `generate_zk_proof` and `verify_zk_proof` use HMAC-SHA256 symmetric signature commitment rather than zero-knowledge proofs.
- **R5 - Stub Feature Returning Mock Success (`src-tauri/src/plugin.rs`):**
  - Line 32: `run_wasi_nano_vm` returns `Ok(format!("WASI Nano-VM successfully executed..."))` without executing any WASI runtime logic.
- **R7 - Hardcoded PTY Shell (`src-tauri/src/lib.rs` and `src-tauri/src/multiplexer.rs`):**
  - `lib.rs` Line 48: `CommandBuilder::new("powershell.exe")` hardcodes Windows PowerShell.
  - `multiplexer.rs` Line 36: `command.unwrap_or_else(|| "powershell.exe".to_string())` hardcodes Windows PowerShell.
- **R7 - Platform-Specific `netstat` and `kill` (`src-tauri/src/ports.rs`):**
  - Line 25: `Command::new("netstat").args(["-ano", "-p", "tcp"])` uses Windows-only flags.
  - Line 69: `Command::new("taskkill").args(["/F", "/PID", &pid])` is Windows-only.
- **R7 - Hardcoded Hosts File Path (`src-tauri/src/system_tools.rs`):**
  - Lines 127 & 133: `let path = "C:\\Windows\\System32\\drivers\\etc\\hosts";` hardcodes Windows path without fallback for Unix `/etc/hosts`.

---

## 2. Logic Chain

1. **R1 Analysis:**
   - Observing `MemoryProfiler.tsx` calling `invoke('get_top_processes_memory')` leads to Tauri throwing "command not found" because `lib.rs` macro registration was incomplete. Adding `sys::get_top_processes_memory` directly satisfies command invocation.
   - `spawn_local_server` panicking on line 93 of `ports.rs` happens because `Server::http` is evaluated inside `thread::spawn` with `.unwrap()`. Evaluating `Server::http` *before* `thread::spawn` allows returning `Err(String)` synchronously via `?` / `map_err`.
   - `git_clone` panics because `.spawn()` returns an `Err` if `git` is absent. Matching `spawn()` result inside the thread and emitting an error string via `git-progress` event prevents thread panics.
2. **R2 Analysis:**
   - Passing `connection` to `Command::new("ssh")` without checking for leading hyphens allows SSH flag injection (e.g., `-oProxyCommand`). Single-quoting the `path` argument (`'path'`) and escaping single quotes (`'\''`) prevents remote shell code execution.
   - SQLite string formatting in `devdocs.rs` is susceptible to SQL injection; replacing `sqlx::any` string queries with `rusqlite` parameterized queries (`WHERE name LIKE ?1`, `params![pattern]`) eliminates SQL injection.
   - `StrictHostKeyChecking=accept-new` accepts new host keys while rejecting changed keys, fixing MITM exposure caused by `StrictHostKeyChecking=no`.
3. **R5 Analysis:**
   - Cryptographic verification in `zkp.rs` relies on HMAC-SHA256 signature commitments. Renaming command names from `_zk_proof` to `_hmac_proof` correctly represents the underlying cryptographic primitive.
   - `run_wasi_nano_vm` returning `Ok("WASI Nano-VM successfully executed...")` misleads users; returning `Err("WASM Sandbox feature is not yet implemented...")` accurately reflects feature status.
4. **R7 Analysis:**
   - Spawning `powershell.exe` fails on macOS/Linux; wrapping shell selection in `if cfg!(target_os = "windows") { "powershell.exe" } else { "/bin/bash" }` ensures PTYs spawn correctly on Unix.
   - Running `netstat -ano -p tcp` on macOS/Linux causes `netstat` to fail; branching with `lsof -iTCP -sTCP:LISTEN -P -n` on Unix provides cross-platform port parsing.
   - Running `taskkill` on Unix fails; branching with `kill -9 {pid}` provides cross-platform process termination.
   - Hardcoding Windows `drivers/etc/hosts` breaks on Unix; branching path selection (`/etc/hosts` vs Windows path) provides cross-platform host file editing.

---

## 3. Caveats

- **No Code Modifications Made:** As `explorer_1` operates under a read-only investigation constraint, zero Rust source files in `src-tauri/` were edited. All implementation must be performed by an implementer agent.
- **Frontend Dependencies:** Renaming commands (e.g. `zkp` -> `hmac`) requires corresponding updates in frontend `.tsx` components (`ZKPVault.tsx` / `MemoryProfiler.tsx`).
- **Unix Permission Escalation for Hosts File:** Modifying `/etc/hosts` on Linux/macOS requires root privileges (`sudo`). `write_hosts` returns an explicit error if permission is denied.

---

## 4. Conclusion

All 10 target issues across R1, R2, R5, and R7 have been mapped to specific lines of code in `src-tauri/`. Complete code solutions, validation functions, and cross-platform abstractions are defined in `analysis.md`. The proposed fixes involve 10 files in `src-tauri/` and require zero extra Cargo crate dependencies beyond those already present in `Cargo.toml`.

---

## 5. Verification Method

To independently verify the survey and future implementation:

1. **Compilation Check:**
   Run `cargo check` in `src-tauri/`:
   ```powershell
   cd e:/Github/CodexOS/Vaultly/src-tauri
   cargo check
   ```
2. **Unit Tests:**
   Run `cargo test` in `src-tauri/`:
   ```powershell
   cd e:/Github/CodexOS/Vaultly/src-tauri
   cargo test
   ```
3. **Inspect Output Files:**
   Verify `e:/Github/CodexOS/Vaultly/.agents/explorer_1/analysis.md` and `e:/Github/CodexOS/Vaultly/.agents/explorer_1/handoff.md`.
