# CODEXOS – MASTER IMPLEMENTATION PLAN & AUDIT INDEX

**Target:** CodexOS v2.2.0 &rarr; v2.3.0 Production Upgrade  
**Repository:** https://github.com/CodeSorcerer-007/CodexOS (`MZ-branch`)  
**Architecture:** Rust (Tauri 2) + React 19 + TypeScript + Zustand + Vite 8.2 (Rolldown)  
**Date:** November 2026  
**Auditor / Architect:** Antigravity Senior Application Architect & Systems Engineer  

---

## 1. File Inspection Index

To satisfy Execution Rule #4 and Rule #5, this index records every inspected file, its functional category, findings, and whether modifications are planned in subsequent phases. **Unchanged files listed below must not be re-inspected unless directly affected by dependency changes.**

| File Path | Functional Category | Phase 01 Findings & Status | Planned Action in Subsequent Phases |
|---|---|---|---|
| `src-tauri/src/main.rs` | Application Boot | Initializes Tauri 2 builder, sets single-instance lock plugin. | **Phase 03**: Configure single-instance callback to focus existing window and forward folder CLI arguments. |
| `src-tauri/src/lib.rs` | Tauri Core & State | Instantiates state (`AllowedPathsState`, `SysState`, `FsWatcherState`, `MultiPtyState`). | **Phase 02/03**: Register new single-instance and context menu handlers. |
| `src-tauri/src/commands.rs` | IPC Router | Exports invoke handler macro for 75+ endpoints. | **Phase 02/03**: Add commands for registry context menu and single-instance messaging. |
| `src-tauri/src/files.rs` | Filesystem Engine | Sandboxed with `AllowedPathsState`, protected targets, UNC normalization. | **Phase 02**: Optimize `get_files_in_dir` with async directory metadata reading. |
| `src-tauri/src/git.rs` | Git Engine | CLI runner with `--` escaping, branch name validation. | **Phase 05**: Cache branch lists and status results to reduce CLI spawning frequency. |
| `src-tauri/src/docker.rs` | Docker Engine | Container/image inspection, abortable log streaming (`DockerLogStreamState`). | **Phase 02/05**: Add Docker daemon availability probe with exponential polling backoff. |
| `src-tauri/src/multiplexer.rs` | Terminal PTY | Multi-pane PTY allocator with `kill_all_ptys` cleanup and duplicate child prevention. | **Inspected & Clean.** No further architectural changes needed. |
| `src-tauri/src/ports.rs` | System Ports & Tail | PID 0, 4, self protection; sandboxed file tailing. | **Inspected & Clean.** Unit tests verified. |
| `src-tauri/src/vault.rs` | Encrypted Vaults | Argon2id + ChaCha20Poly1305, sandboxed output targets. | **Inspected & Clean.** Unit tests verified. |
| `src-tauri/src/secrets.rs` | Secrets Store | Memory zeroization, Argon2id derivation. | **Inspected & Clean.** Zeroize on lock verified. |
| `src-tauri/src/proxy.rs` | Network Proxy | SSRF firewall blocking private/metadata IPs. | **Inspected & Clean.** Integration tests verified. |
| `src-tauri/src/sys.rs` | System Telemetry | `Disks::new_with_refreshed_list()` called on every tick. | **Completed (Phase 02)**: Added `DiskCache` with 60-second TTL and lighter `get_cpu_mem_stats`. |
| `src-tauri/src/fs_cache.rs` | Filesystem Watcher | Uses `notify` with non-recursive directory watch. Lacks debouncing. | **Completed (Phase 02)**: Introduced 250ms debouncing loop buffering filesystem notifications. |
| `src-tauri/src/files.rs` | Filesystem Engine | Sandboxed with `AllowedPathsState`, protected targets, UNC normalization. | **Completed (Phase 02)**: Benchmark confirmed Win32 DirEntry metadata caching (0-14ms up to 50k items); added `get_user_home_dir`. |
| `src/store/metricsStore.ts` | Central Metrics Store | Centralized system telemetry store with single-flight guard. | **Completed (Phase 02)**: Adaptive intervals (8s / 4.5s / 2s), pauses on hidden window, unit tested. |
| `src/components/CodexOSDashboard.tsx`| Home Dashboard | 3 unthrottled intervals (2000ms): sys stats, docker, git status. | **Completed (Phase 02)**: Polling removed; consumes `metricsStore`, Docker queried on mount with backoff, Git on focus. |
| `src/components/layout/DeveloperStatusBar.tsx`| Status Bar | Polled `get_sys_stats` every 3000ms. | **Completed (Phase 02)**: Polling interval removed; consumes shared `metricsStore`. |
| `src/components/FileGrid/FileGridMain.tsx` | Explorer Grid/List | List view was virtualized; Grid view used raw `.map()`. | **Completed (Phase 02)**: Implemented 2D grid virtualization via `@tanstack/react-virtual` with dynamic column calculation & headless fallback. |
| `src/components/FileGrid/FileGridContext.tsx`| Quick Access | Hardcoded quick access paths `C:\Users\sivak\...`. | **Completed (Phase 02)**: Dynamically queries `get_user_home_dir` backend IPC; keys guaranteed unique. |
| `src/components/DockerDashboard.tsx` | Docker UI | Top-level static import of `@xterm/xterm` and `xterm.css`. | **Completed (Phase 02)**: Removed static imports; dynamically loads xterm on demand for log view, chunk size reduced to 16.14 kB. |
| `src/components/SettingsPage.tsx` | Settings Page | Added performance mode dropdown & telemetry toggle. | **Completed (Phase 02)**: Lightweight (8s), Balanced (4.5s), Developer (2s) modes with global disable switch. |
| `src/components/CollaborativeEditor.tsx` | CRDT Editor | Imports Yjs / WebRTC collab tools (`vendor-collab` = 4.12 MB). | **Inspected**: Isolated behind route lazy import. |
| `src/components/ASTRefactor.tsx` | AST Refactoring | Uses `web-tree-sitter` (triggers `eval()` CSP warning). | **Phase 05/06**: Review web-tree-sitter WASM initialization for strict CSP compliance. |
| `src/store/store.ts` | Zustand Store | Global state, dual-write to SQLite `store_kv`. | **Phase 02/06**: Add multi-tab path synchronization and settings flags. |
| `scripts/install.bat` | Installer Bootstrapper | Does not exist yet. | **Phase 04**: Create one-click lightweight Windows bootstrapper. |
| `scripts/install.ps1` | Installation Engine | Does not exist yet. | **Phase 04**: Create PowerShell engine for GitHub Releases discovery & SHA-256 verification. |

---

## 2. Phase-by-Phase Execution Roadmap

### Phase 01: Performance Baseline & Architecture Audit (COMPLETED)
- [x] Read-only architectural inspection of Rust backend and React frontend.
- [x] Feature inventory matrix completed (18 Implemented, 8 Partial, 2 Broken, 3 Missing).
- [x] Security verification of sandbox controls, PTY lifecycle, and option injection.
- [x] Real Windows 11 performance benchmarking:
  - Startup time: 3,584 ms (debug WebView2 launch).
  - Rust Host: 43.03 MB Working Set / 8.04 MB Private Bytes.
  - Process Tree: 530.16 MB Working Set / 250.78 MB Private Bytes.
  - Windows Explorer Baseline: 319.70 MB Working Set / 268.74 MB Private Bytes.
- [x] Creation of `CODEXOS_AUDIT.md`, `CODEXOS_FEATURE_MATRIX.md`, `CODEXOS_PERFORMANCE_BASELINE.md`, and `CODEXOS_IMPLEMENTATION_PLAN.md`.

---

### Phase 02: Performance Engineering & Optimization (COMPLETED)
**Goal:** Reduce memory footprint, eliminate idle CPU spikes, and ensure fluid 60fps file browsing on large directories.

1. **Virtualized File Grid View (`FileGridMain.tsx`):**
   - [x] Implemented 2D virtualization for grid cards using `@tanstack/react-virtual` with dynamic column calculation via `ResizeObserver`.
   - [x] Capped mounted DOM elements to visible viewport items (~30–50 items + 3-row buffer) regardless of folder size.
   - [x] Integrated headless geometry fallback so all unit and integration tests pass without browser layout engine mocks.
2. **Centralized Adaptive Telemetry & Polling Elimination:**
   - [x] Created centralized metrics store (`src/store/metricsStore.ts`) shared between Dashboard and DeveloperStatusBar.
   - [x] Added single-flight concurrency guard preventing overlapping telemetry requests.
   - [x] Configured adaptive polling intervals based on performance mode (Lightweight: 8s, Balanced: 4.5s, Developer: 2s).
   - [x] Added `visibilitychange` listener that halts all telemetry timers when window is hidden/minimized.
   - [x] Added user toggle in Settings to completely disable telemetry monitoring.
   - [x] In `src-tauri/src/sys.rs`, implemented `DiskCache` with 60-second TTL to eliminate repeated Win32 disk layout syscalls.
   - [x] In `CodexOSDashboard.tsx`, removed background polling loops; Docker is queried on mount with backoff, Git is scoped to active workspace on focus.
3. **Filesystem Scale Benchmarking & Windows DirEntry Analysis (`tests/fs_benchmark.rs`):**
   - [x] Benchmarked 1k, 10k, and 50k entries on Windows NTFS:
     - 1,000 files: 3ms enum, 0ms metadata, 10ms JSON IPC, 0.15 MB
     - 10,000 files: 47ms enum, 1ms metadata, 118ms JSON IPC, 1.47 MB
     - 50,000 files: 406ms enum, 14ms metadata, 1,723ms JSON IPC, 7.34 MB
   - [x] Confirmed Win32 `FindFirstFileW`/`FindNextFileW` caches DirEntry attributes; metadata syscalls are not the bottleneck. True bottleneck at >10k items is JSON IPC serialization.
4. **Debounced Filesystem Watcher (`fs_cache.rs`):**
   - [x] Replaced unbuffered event loop with 250ms debouncing loop in Rust backend, preventing IPC flooding during large file writes.
5. **Heavy Module Optimization & Lazy Loading:**
   - [x] Decoupled `@xterm/xterm` from `DockerDashboard.tsx` via dynamic import, reducing Docker dashboard production chunk to **16.14 kB**.
   - [x] Preserved clean code splitting for `vendor-xterm`, `vendor-monaco`, and `vendor-collab`.
6. **Dynamic User Profile Path:**
   - [x] Implemented `get_user_home_dir` backend IPC command.
   - [x] Replaced hardcoded `C:\Users\sivak` in `FileGridContext.tsx` with dynamic user profile resolution. Unique key fallback prevents React key collisions.

---

### Phase 03: Windows Integration & Shell Experience
**Goal:** Integrate CodexOS seamlessly into Windows 11 workflows without disrupting standard OS shell defaults.

1. **Single-Instance Mutex & Argument Forwarding:**
   - Integrate `tauri-plugin-single-instance`.
   - When a user launches CodexOS from the command line or file context menu while the app is already open, pass the target folder path to the existing window and bring it to the foreground.
2. **Command-Line Folder Launch:**
   - Support `codexos.exe [FOLDER_PATH]` CLI syntax.
   - Automatically navigate active tab to the specified path upon startup.
3. **Windows Explorer Context Menu Integration ("Open with CodexOS"):**
   - Provide safe registry registration scripts (`register-context-menu.reg` / `unregister-context-menu.reg`) and an in-app toggle under Settings.
   - Target keys:
     - `HKCU\Software\Classes\Directory\shell\CodexOS`
     - `HKCU\Software\Classes\Directory\Background\shell\CodexOS`
     - `HKCU\Software\Classes\Drive\shell\CodexOS`
   - Include icon extraction and rollback scripts in user profile (`HKCU` only—no admin elevation required).
4. **Windows Startup Configuration:**
   - Optional setting to launch CodexOS minimized on Windows startup using `tauri-plugin-autostart`.

---

### Phase 04: Production Installer & Distribution Workflow
**Goal:** Deliver a zero-dependency, one-click Windows installation experience.

1. **Lightweight BAT Bootstrapper (`install.bat`):**
   - Double-clickable batch file with ANSI color styling and error handling.
   - Launches PowerShell with bypassed execution policy: `powershell.exe -NoProfile -ExecutionPolicy Bypass -File install.ps1`.
   - No requirement for Git, Node.js, Rust, or Python on user machines.
2. **Robust PowerShell Installation Engine (`scripts/install.ps1`):**
   - Queries GitHub Releases API for `CodeSorcerer-007/CodexOS` latest stable release tag.
   - Detects system architecture (`x64` vs `ARM64`).
   - Downloads compiled `.exe` NSIS installer and its companion `.sha256` checksum.
   - Validates file integrity using native `Get-FileHash -Algorithm SHA256`.
   - Executes silent/interactive installer with progress indicators.
3. **NSIS & MSI Packaging Configuration:**
   - Ensure clean Start Menu shortcuts, optional Desktop shortcut, and registered uninstaller in Windows "Installed apps" settings.
   - Embed high-resolution application icons and metadata.

---

### Phase 05: Developer Integrations Hardening
**Goal:** Elevate Git, Docker, and GitHub features to production-grade reliability.

1. **Git Integration Polish:**
   - Stash management UI (stash create, stash pop, stash drop).
   - Conflict resolution marker detection and guided merge interface.
   - Caching for branch lists and commit history.
2. **GitHub API Client:**
   - Secure personal access token (PAT) storage via `secrets.rs`.
   - Repository issue viewer, pull request reviewer, and GitHub Actions workflow status monitor.
3. **Docker Improvements:**
   - Auto-detection of Docker Desktop / Rancher Desktop / WSL2 Docker daemon.
   - Graceful offline fallback with clear status badges when Docker is stopped.
   - Container resource limit telemetry (CPU/Memory caps).

---

### Phase 06: Product Experience & UI Polish
**Goal:** Maintain a native-feeling, responsive Windows 11 interface.

1. **File Explorer Navigation:**
   - Dual-pane split view support for side-by-side directory comparisons.
   - Comprehensive breadcrumb bar with direct path editing.
   - Smooth keyboard navigation (Arrow keys, Enter, Backspace, Ctrl+C/V/X).
2. **Global Command Palette:**
   - Quick file jump (`Ctrl+P`).
   - Action launcher (`Ctrl+Shift+P`) for switching routes, toggling terminal, and cloning repos.
3. **Accessibility & Contrast:**
   - Ensure Windows High Contrast and dark/light mode compatibility.

---

### Phase 07: Release Verification & Quality Gates
**Goal:** Rigorous end-to-end testing before tagging production releases.

1. **Test Matrix Execution:**
   - `cargo fmt --all -- --check` & `cargo clippy -- -D warnings`
   - `cargo test` (102 backend tests + integration suite)
   - `npm run lint` & `npx tsc -b`
   - `npm test` (279 Vitest frontend tests)
   - `npm run build` (Rolldown production bundle validation)
2. **Release Checklist & Packaging:**
   - Verify NSIS installer creation on Windows 11 runner.
   - Validate bootstrapper download and SHA-256 verification in a fresh VM environment.
   - Generate final Release Notes and Architecture Reports.
