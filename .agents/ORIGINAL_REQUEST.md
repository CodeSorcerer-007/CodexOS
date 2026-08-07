# Original User Request

## Initial Request — 2026-08-06T14:46:16Z

Vaultly is a production-grade Tauri v2 desktop application (Rust backend + React/TypeScript frontend) that acts as an all-in-one developer toolkit. The goal of this project is to fix all critical bugs, security vulnerabilities, error handling failures, stub features, and UI/UX gaps identified in the production audit report — bringing the app from 58% to 90%+ production readiness.

Working directory: e:/Github/CodexOS/Vaultly

Integrity mode: development

---

## Requirements

### R1. Fix All Critical Bugs (App-Breaking)
Fix the 4 critical bugs that cause crashes or infinite render loops:
- `VaultModal.tsx`: Move `setMode()` call out of the render body and into a `useEffect` to stop the infinite re-render loop
- `lib.rs`: Register the `get_top_processes_memory` command in the `invoke_handler![]` macro so `MemoryProfiler` can call it
- `ports.rs` L93: Replace `.unwrap()` on `Server::http()` with proper `?` error propagation so the app doesn't panic when port 8080 is occupied
- `git.rs` L296: Replace `.expect("failed to execute child")` in the background clone thread with graceful error handling (send error event to frontend instead of panicking)

### R2. Fix All Security Vulnerabilities
Patch the 3 confirmed security issues:
- `ssh.rs`: Escape or validate all shell metacharacters in user-supplied paths and connection strings passed to SSH commands to prevent command injection
- `devdocs.rs` L25: Replace string-formatted SQL with parameterized rusqlite queries to prevent SQL injection
- `tunnel.rs` L48: Change `StrictHostKeyChecking=no` to `StrictHostKeyChecking=accept-new` or add a user-confirmation step before connecting to an unknown host

### R3. Replace All Native Browser Dialogs
Replace every native `alert()`, `confirm()`, and `prompt()` call with proper in-app UI components. All 8 occurrences must be replaced:
- `VisualGit.tsx`: Replace `alert(e)` with toast error notifications
- `EnvVarModal.tsx`: Replace `prompt()` with a proper modal input dialog
- `DuplicateFinderModal.tsx`: Replace `confirm()` for destructive delete with a styled confirmation modal or toast with undo
- Any other components using native dialogs

### R4. Fix Pervasive Error Handling
Every async `invoke()` call to the Tauri backend must have a `try/catch` block that, on failure, shows a user-visible toast notification. Fix all 28 components:
- Replace all empty `catch {}` blocks with `showToast('error', ...)` calls
- Replace all `catch (e) { console.error(e) }` patterns with user-visible toast errors
- Add missing `try/catch` around the 4 uncovered async invocations
- The app already has a working `ToastContainer` and toast system — use it

### R5. Fix Stub Features and Mislabeled Functionality
Clean up all features that are fake, stub, or misleadingly labeled:
- `AutomationStudio`: Either implement a real basic automation backend (record/replay simple shell commands) or show a clear "Coming Soon — not yet available" disabled state in the UI
- `SandboxManager` / `run_wasi_nano_vm`: Show a clear "WASM Sandbox not yet implemented" message instead of returning a fake success string. Update the UI to reflect this honestly
- `PluginMarketplace`: Show a "Plugin Marketplace — Coming Soon" banner instead of a static fake UI that implies it works
- `ZKPVault` / `zkp.rs`: Rename the feature from "ZKP Vault" to "HMAC Vault" or "Signed Proof Vault" everywhere in the UI and code, since it uses HMAC-SHA256 — not actual zero-knowledge proofs

### R6. Fix UI/UX Bugs and Polish
Fix all identified UI/UX issues:
- `FileGrid.tsx`: Add a `document` click listener to close the context menu when clicking outside it
- `CollaborativeEditor.tsx`: Fix the race condition — await the file content load before calling `joinRoom`, and show a toast when saving with no path set
- `TreeMapOverlay.tsx` L40: Add a null guard for `root.children` before passing to Recharts custom content renderer
- `CodeMetricsOverlay.tsx`: Fix the JSON color `#000000` (invisible on dark background) — change to a visible color
- `PurgerModal.tsx` L30: Change default item selection from checked to unchecked for destructive actions
- `RegexRenamerModal`: Add a dry-run preview showing what files would be renamed before executing
- Add Escape key dismiss to all 6 modals that are missing it
- Fix `SettingsPage`: Add path existence validation for the default path setting

### R7. Fix Cross-Platform Compatibility
Abstract all Windows-only hardcoded values to platform-aware logic:
- `multiplexer.rs` and `lib.rs`: Detect OS at runtime and use `powershell.exe` on Windows, `/bin/bash` on macOS/Linux for PTY sessions
- `ports.rs`: Replace `netstat -ano -p tcp` with a cross-platform alternative (use the `netstat` crate or runtime OS detection)
- `system_tools.rs`: Replace `taskkill /F /PID` with `kill -9 {pid}` on Unix
- `HostsEditorModal.tsx` and backend: Use platform-aware hosts file path (`/etc/hosts` on Unix, `C:\Windows\System32\drivers\etc\hosts` on Windows)
- `EnvVarModal.tsx`: Use `;` as PATH separator on Windows, `:` on Unix

---

## Acceptance Criteria

### Critical Bugs Fixed
- [ ] `VaultModal` loads without causing React infinite re-render (no "Maximum update depth exceeded" error in console)
- [ ] `MemoryProfiler` panel loads without Tauri "command not found" error
- [ ] Starting the MITM proxy when port 8080 is occupied returns a user-visible error instead of crashing the app
- [ ] Git clone of a repo when `git` is not in PATH returns an error toast instead of panicking the Rust backend

### Security
- [ ] SSH commands in `ssh.rs` use argument arrays or escaped strings — no raw string interpolation of user input into shell commands
- [ ] `devdocs.rs` SQL uses `rusqlite` parameterized queries (`.query_row("... WHERE x = ?1", params![user_input], ...)`)
- [ ] `tunnel.rs` no longer uses `StrictHostKeyChecking=no`

### Error Handling
- [ ] Opening any panel and triggering a backend error (e.g., disconnect network, remove a file) shows a toast notification — not just a console.error
- [ ] Zero empty `catch {}` blocks remain in the codebase
- [ ] Zero `alert()` / `confirm()` / `prompt()` calls remain in any `.tsx` file

### Stub Features
- [ ] `SandboxManager` UI shows "Not Implemented" state — it does NOT return a fake "success" message
- [ ] `PluginMarketplace` shows a "Coming Soon" state — it does NOT show fake plugin listings implying real data
- [ ] `ZKPVault` feature is either relabeled (UI text, headings, and backend command names changed from "ZKP/Zero-Knowledge" to "HMAC Proof") or replaced with a real ZKP implementation

### UI/UX
- [ ] Clicking outside the FileGrid context menu closes it
- [ ] CollaborativeEditor: switching to a new file and joining a room does not mix content from previous file
- [ ] TreeMapOverlay does not crash when a directory has no children
- [ ] All modals close on Escape key press

### Cross-Platform
- [ ] The Rust code compiles and the app runs on macOS/Linux without Windows-specific shell commands causing crashes (verified via `cfg!(target_os = "windows")` guards or equivalent)

### TypeScript Build
- [ ] `npx tsc --noEmit` exits with 0 errors after all changes
- [ ] `cargo build` in `src-tauri/` exits with 0 errors and 0 warnings about unused/unsafe code from the changed files
