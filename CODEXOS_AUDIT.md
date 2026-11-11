# CODEXOS – SYSTEM ARCHITECTURE & SECURITY AUDIT (PHASE 01)

**Date:** November 2026  
**Auditor:** Antigravity Senior Application Architect & Security Auditor  
**Target:** CodexOS v2.2.0 (`https://github.com/CodeSorcerer-007/CodexOS`, `MZ-branch`)  
**Environment:** Windows 11 x86_64, Rust 1.99.1, Tauri 2.11.3, React 19, Vite 8.2 (Rolldown)

---

## 1. Executive Summary

CodexOS is an offline-capable, developer-centric desktop file manager and control center engineered on Tauri 2, Rust, React 19, TypeScript, and Zustand. This read-only audit examines the existing codebase across 28 functional modules, identifies architectural bottlenecks, profiles memory consumption, and evaluates security boundaries.

### Key Audit Findings
1. **Startup Overhead & Polling Clutter:** The default landing page (`CodexOSDashboard`) initiates three unthrottled intervals every 2,000 ms (`get_sys_stats`, `get_docker_containers`, `get_git_status`), while `DeveloperStatusBar` polls `get_sys_stats` every 3,000 ms. Each `get_sys_stats` call triggers `Disks::new_with_refreshed_list()`, querying physical and logical disk drives constantly.
2. **Heavy Chunks Loaded Eagerly:** While `AppRouter` uses `React.lazy`, heavy assets such as `@xterm/xterm` are statically imported in `DockerDashboard.tsx`, and `vendor-collab` bundles 4.12 MB of minified code into production builds. Monaco Editor workers (`ts.worker` at 8.11 MB, `css.worker` at 1.35 MB) add significant footprint when triggered.
3. **Unvirtualized Grid File Listings:** In `FileGridMain.tsx`, list view is virtualized via `@tanstack/react-virtual`, but **grid view uses raw `.map()`**, causing thousands of DOM nodes to mount in large directories.
4. **Synchronous File I/O:** `get_files_in_dir` in `files.rs` runs synchronously on the Tauri command thread and calls `entry.metadata()` for every single file entry, generating thousands of individual `FindFirstFile` / `GetFileInformationByHandle` syscalls without caching Win32 attributes.
5. **Security Hardening Applied:** Workspace sandboxing (`AllowedPathsState`), destructive operation safeguards (`is_protected_target`), PTY leak prevention (`kill_all_ptys`), and option injection defenses (`--` escaping for Git and Ripgrep) have been validated and tested.

---

## 2. Architecture & Module Decomposition

### 2.1 Backend Architecture (Rust & Tauri 2)

```
                     +---------------------------------------+
                     |           CodexOS Desktop             |
                     |     React 19 + TypeScript + Vite      |
                     +-------------------+-------------------+
                                         | IPC (invoke/listen)
                     +-------------------v-------------------+
                     |          Tauri 2 IPC Core             |
                     | (commands.rs handler registration)    |
                     +-------------------+-------------------+
                                         |
     +-----------------------------------+-----------------------------------+
     |                   |                   |                   |               |
+----v-----+        +----v-----+        +----v-----+        +----v-----+    +----v-----+
| files.rs |        | git.rs   |        | docker.rs|        | ports.rs |    | vault.rs |
| Sandboxed|        | Escaped  |        | Stream   |        | PID      |    | Argon2id |
| I/O      |        | CLI      |        | Abort    |        | Guards   |    | ChaCha20 |
+----------+        +----------+        +----------+        +----------+    +----------+
     |                   |                   |                   |               |
+----v-----+        +----v-----+        +----v-----+        +----v-----+    +----v-----+
| multiplex|        | proxy.rs |        | db.rs    |        | sys.rs   |    | ai.rs    |
| PTY Pool |        | SSRF FW  |        | SQLite   |        | Sysinfo  |    | Ollama   |
+----------+        +----------+        +----------+        +----------+    +----------+
```

| Rust Backend Module | Primary Responsibility | Dependencies | State / Safety Checks |
|---|---|---|---|
| `commands.rs` | Central Tauri invoke handler registration for 75+ endpoints | `tauri` | Explicit imports; no wildcard shadowing |
| `files.rs` | Local filesystem operations, tree visualizer, metrics | `walkdir`, `trash`, `dunce` | `AllowedPathsState`, `is_protected_target`, 20MB text read cap |
| `git.rs` | Git CLI integration, status parsing, branch ops | `cli_runner` | `AllowedPathsState`, `--` argument escaping, branch name format checks |
| `docker.rs` | Container/image inspection, stats, log streaming | `cli_runner` | `DockerLogStreamState` with oneshot cancellation |
| `multiplexer.rs` | Multi-pane PTY shell sessions | `portable-pty` | Session deduplication, `kill_all_ptys` cleanup, `cwd` sandboxing |
| `ports.rs` | Local TCP port inspection, process termination | `sysinfo`, `tiny_http` | PID <= 4 and self-PID termination rejection |
| `vault.rs` | Encrypted zip vaults | `argon2`, `chacha20poly1305`, `zeroize` | Memory zeroization, 12-char min password, sandbox checks |
| `secrets.rs` | Key-value credentials & environment injection | `chacha20poly1305`, `argon2` | Argon2id derivation, zeroize on lock |
| `proxy.rs` | HTTP/HTTPS debugging proxy with SSRF firewall | `hyper`, `tokio` | RFC 1918, loopback, link-local, cloud metadata filtering |
| `hmac_vault.rs` | Cryptographic proof generation | `ring`, `hex` | SHA-256 HMAC proofs with timing-safe comparison |
| `db.rs` / `kv.rs` | Embedded SQLite storage & arbitrary DB queries | `rusqlite`, `sqlx` | 10k row limit, sandbox validation for file DBs |
| `fs_cache.rs` | Real-time filesystem watching | `notify` | NonRecursive per directory; lacks debouncing queue |
| `sys.rs` | Host telemetry (CPU, RAM, Disks, GPU) | `sysinfo` | `Disks::new_with_refreshed_list()` called on every tick |
| `system_tools.rs` | Task detection, WSL, Hosts file, font installation | Windows PowerShell | Sandbox validation on task paths and font targets |
| `ssh.rs` | Remote SFTP and SSH directory listing | SSH CLI / OpenSSH | Hostname & argument sanitization |
| `ai.rs` | Offline Ollama & Mistral root-cause copilot | `reqwest`, `serde_json` | Context budget trimming, 8KB diff cap, rate-limited |

---

### 2.2 Frontend Architecture (React 19 & Zustand)

The frontend uses Vite 8.2 with Rolldown bundling and React 19. State is managed via Zustand stores:
- `src/store/store.ts`: Main workspace store (tabs, active app, current path, settings, drive bookmarks, toasts, hydration from SQLite).
- `src/store/diagnosisStore.ts`: AI diagnostic state and history.

#### Component Hierarchy
- `App.tsx`: Framer Motion shell, custom Windows 11 title bar (drag region, window control buttons, command palette trigger), tab bar, main router container, developer status bar.
- `AppRouter.tsx`: `ROUTE_REGISTRY` mapping 28 `AppId`s to lazy-loaded components.
- `FileGrid`: Explorer UI decomposed into `FileGridHeader`, `FileGridSidebar`, `FileGridMain`, `FileGridFooter`, and `FileGridContext`.
- Heavy developer tools: `LocalCodeEditor` (Monaco), `TerminalMultiplexer` (xterm), `DockerDashboard` (xterm + stats), `VisualGit`, `DatabaseStudio`.

---

## 3. Startup Path & Background Process Audit

### 3.1 Initial Launch Timeline
1. **Rust Main (`main.rs` / `lib.rs`):**
   - Installs default SQLx drivers.
   - Initializes `AllowedPathsState`, `SysState`, `DockerLogStreamState`, `FsWatcherState`, `MultiPtyState`, `SecretsState`.
   - Runs database migrations via SQLite (`store_kv`).
   - Builds Tauri WebView2 window (`decorations: false`, 1280x800).
2. **Frontend Boot (`main.tsx` &rarr; `App.tsx`):**
   - Renders DOM shell and initializes Zustand store.
   - `useEffect` #1: Checks window maximize state and attaches `onResized` listener.
   - `useEffect` #2: Hydrates store from backend SQLite (`hydrateStore()`).
   - `useEffect` #3: Validates backend API version (`getApiVersion()`) and calls `addAllowedPath(currentPath)`.
   - Mounts `DeveloperStatusBar`: starts `setInterval(fetchTelemetry, 3000)`.
   - Mounts `CodexOSDashboard` (default route): starts `setInterval(fetchAll, 2000)`.

### 3.2 Idle Polling Hotspots
```
[Timer: 2000ms in CodexOSDashboard]
  |-- get_sys_stats          --> Disks::new_with_refreshed_list() (WMI/Win32 disk queries)
  |-- get_docker_containers  --> spawns "docker ps -a" CLI process
  \-- get_git_status         --> spawns "git status --porcelain=v2 --branch" CLI process

[Timer: 3000ms in DeveloperStatusBar]
  \-- get_sys_stats          --> Disks::new_with_refreshed_list()
```
**Total Idle Activity:** 4 IPC roundtrips and up to 2 OS child process spawns every 2 to 3 seconds while idling on the home screen.

---

## 4. Heavy Components & Resource Allocation

### 4.1 Production Bundle Breakdown (Vite Build Audit)
| Asset Chunk | Minified Size | Gzip Size | Impact Analysis |
|---|---|---|---|
| `vendor-collab-*.js` | **4,121.83 kB** | 1,080.14 kB | Yjs, WebRTC signaling, CRDT, Monaco collaboration. Eagerly referenced by collaborative editor. |
| `ts.worker-*.js` | **8,112.11 kB** | ~2,200 kB | Monaco TypeScript language worker. |
| `css.worker-*.js` | **1,355.36 kB** | ~380 kB | Monaco CSS/LESS/SCSS language worker. |
| `html.worker-*.js` | **904.07 kB** | ~250 kB | Monaco HTML language worker. |
| `json.worker-*.js` | **553.52 kB** | ~160 kB | Monaco JSON language worker. |
| `vendor-monaco-*.js` | **487.16 kB** | 124.09 kB | Monaco editor core wrapper. |
| `vendor-react-*.js` | **354.21 kB** | 114.11 kB | React 19 core + DOM runtime. |
| `vendor-xterm-*.js` | **342.83 kB** | 88.27 kB | Xterm.js terminal emulator and fit addon. |
| `vendor-charts-*.js` | **298.47 kB** | 92.05 kB | Recharts charting library. |
| `vendor-treesitter-*.js`| **78.41 kB** | 19.89 kB | Web-tree-sitter (uses `eval()`; triggers CSP warning). |
| `FileGrid-*.js` | **37.04 kB** | 9.45 kB | Primary explorer interface. |
| `index-*.js` (App entry)| **139.76 kB** | 37.34 kB | Main application shell and Zustand stores. |

### 4.2 Monaco & Xterm Initialization
- **LocalCodeEditor:** Imports `@monaco-editor/react` and `TerminalPane` at the file top-level. Navigating to the editor loads Monaco and Xterm simultaneously.
- **DockerDashboard:** Top-level import of `@xterm/xterm` and `@xterm/addon-fit`, plus static CSS import (`@xterm/xterm/css/xterm.css`). Even if the user never opens container logs, xterm is loaded into memory when viewing Docker.

---

## 5. Security & Sandbox Boundary Review

1. **Path Normalization & UNC Stripping:** Windows `canonicalize()` generates verbatim prefixes (`\\?\C:\...`). In `files.rs`, `strip_unc_prefix()` ensures canonical paths match user input strings without false sandbox rejections.
2. **Path Traversal Protection:** Non-existent nested paths (e.g. creating `C:\Workspace\deep\nested\file.txt`) walk upward to the nearest existing parent to verify workspace confinement.
3. **Destructive Operation Boundaries:** Critical targets (drive roots `C:\`, `/`, `C:\Windows`, `C:\Program Files`, and the active workspace root itself) are protected in `files.rs:is_protected_target()`.
4. **Command & Option Injection Safeguards:**
   - Git commands (`add`, `restore`, `checkout`, `clone`, `diff`) use `--` argument terminators.
   - Branch names starting with `-` or containing whitespace are rejected.
   - Clone URLs starting with `-` are rejected.
   - Ripgrep content searches use `--` before queries.
5. **Secrets & Vault Security:** Vault encryption uses Argon2id (`m_cost=65536`, `t_cost=3`, `p_cost=1`) + ChaCha20Poly1305 with zeroized plaintext memory buffers.
6. **SSRF Firewall:** HTTP/HTTPS proxy blocks loopback (`127.0.0.1`, `::1`), RFC 1918 private ranges, and cloud metadata endpoints (`169.254.169.254`, `metadata.google.internal`) unless explicitly whitelisted.

---

## 6. Windows Integration & Packaging Audit

1. **Window Customization:** Framer Motion + custom draggable title bar with Windows 11 minimize, maximize/restore, and close buttons.
2. **Current Packaging Configuration (`tauri.conf.json`):**
   - NSIS target with `currentUser` install mode and language selector disabled.
   - Auto-updater configured with GitHub Releases endpoint and Minisign public key.
3. **Identified Windows Integration Gaps:**
   - No Windows Explorer right-click context menu integration ("Open with CodexOS").
   - No single-instance mutex / named pipe lock (opening a folder launches a second complete app instance).
   - No command-line argument parsing for folder paths (e.g., `codexos.exe "D:\Projects"`).
   - No registry backup/recovery script for optional shell registration.
   - Missing one-click `install.bat` bootstrapper.
