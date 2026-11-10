# CODEXOS – FEATURE INVENTORY & MATRIX (PHASE 01)

**Version:** 2.2.0  
**Status:** Read-Only Architectural Inventory  
**Target:** CodexOS Desktop Developer Control Center  

---

## 1. Feature Status Summary

- **Total Registered Modules:** 28
- **Fully Implemented & Verified:** 18
- **Partially Implemented (Needs Performance/Integration Optimization):** 8
- **Broken / Vulnerable (Require Fixes):** 2 (Unvirtualized Grid View in large folders; Hardcoded Quick Access paths)
- **Missing Windows Integration Features:** 3 (Context Menu handler, CLI path arguments, Single-instance lock)

---

## 2. Comprehensive Module Feature Matrix

| Module | Route / Key | Current Status | Primary Files | Architectural Notes | Can Rewrite? |
|---|---|---|---|---|---|
| **File Explorer** | `files` | **Partially Implemented** | `src/components/FileGrid/`<br>`src-tauri/src/files.rs` | List view is virtualized, but **grid view uses raw `.map()`**, causing DOM explosion on >500 items. Quick access has hardcoded `sivak` path. | **DO NOT REWRITE CORE.** Optimize rendering & replace static path with dynamic OS user profile. |
| **Visual Git** | `git` | **Implemented** | `src/components/VisualGit.tsx`<br>`src-tauri/src/git.rs` | Full status parsing, staging, commits, branches, history, diffs. Option injection defended with `--`. | **DO NOT REWRITE.** Preserve git parser & visual UI. |
| **Terminal Multiplexer** | `terminal` | **Implemented** | `src/components/TerminalMultiplexer.tsx`<br>`src-tauri/src/multiplexer.rs` | 1x1, 1x2, 2x1, 2x2 grid layouts via `portable-pty`. Process cleanup via `kill_all_ptys` and child deduplication. | **DO NOT REWRITE.** Preserve PTY management. |
| **Docker Dashboard** | `docker` | **Partially Implemented** | `src/components/DockerDashboard.tsx`<br>`src-tauri/src/docker.rs` | Container listing, start/stop/restart/rm, image management, stats, log streaming with abort. Lacks adaptive polling backoff when Docker is closed. | **DO NOT REWRITE.** Add lazy xterm and daemon backoff. |
| **Local Code Editor** | `editor` | **Implemented** | `src/components/LocalCodeEditor.tsx`<br>`src-tauri/src/files.rs` | Monaco-based editor with syntax detection, multi-tab switching, split terminal pane. Eagerly loads xterm + Monaco together. | **DO NOT REWRITE.** Defer terminal pane until toggled. |
| **Database Studio** | `database` | **Implemented** | `src/components/DatabaseStudio.tsx`<br>`src-tauri/src/db.rs` | SQLite & generic SQL query executor with table viewer, 10k row protection, sandboxed file checks. | **DO NOT REWRITE.** |
| **Network Interceptor** | `network` | **Implemented** | `src/components/NetworkInterceptor.tsx`<br>`src-tauri/src/proxy.rs` | HTTP/HTTPS proxy, request/response capture, replay engine, SSRF IP range filtering. | **DO NOT REWRITE.** Verified secure by integration tests. |
| **HTTP Request Builder**| `httpclient` | **Implemented** | `src/components/HttpRequestBuilder.tsx`<br>`src-tauri/src/ports.rs` | Curl-like REST client with headers, JSON payload, timing breakdown. | **DO NOT REWRITE.** |
| **Offline DevDocs** | `devdocs` | **Implemented** | `src/components/DevDocsViewer.tsx`<br>`src-tauri/src/devdocs.rs` | Local SQLite documentation index search. | **DO NOT REWRITE.** |
| **System Tools / Process**| `process` | **Implemented** | `src/components/ProcessManager.tsx`<br>`src-tauri/src/system_tools.rs` | Windows Services control (start/stop/restart), WSL distro listing, user environment variable manager. | **DO NOT REWRITE.** |
| **Port Manager & Tail** | `ports` / status | **Implemented** | `src-tauri/src/ports.rs`<br>`src/components/PortTunnel.tsx` | Active TCP port lookup, PID termination with PID 0/4/self protections, file tailing. | **DO NOT REWRITE.** |
| **Port Tunneling** | `tunnel` | **Implemented** | `src/components/PortTunnel.tsx`<br>`src-tauri/src/tunnel.rs` | Local HTTP reverse proxy tunnels via `tiny_http`. | **DO NOT REWRITE.** |
| **SSH Remote Dev** | `ssh` | **Implemented** | `src/components/SshManager.tsx`<br>`src-tauri/src/ssh.rs` | SSH keypair generator, SFTP directory listing, remote file text editor. | **DO NOT REWRITE.** |
| **Secrets Vault** | `secrets` | **Implemented** | `src/components/SecretsManager.tsx`<br>`src-tauri/src/secrets.rs` | Argon2id + ChaCha20Poly1305 credentials vault with lock/unlock state and memory zeroization. | **DO NOT REWRITE.** |
| **ZKP / HMAC Vault** | `zkp` / `hmac` | **Implemented** | `src/components/HMACVault.tsx`<br>`src-tauri/src/hmac_vault.rs` | Cryptographic HMAC commitment generator and verification engine. | **DO NOT REWRITE.** |
| **Local AI & Copilot** | `ai` | **Implemented** | `src/components/LocalAI.tsx`<br>`src/components/DiagnosisCard.tsx`<br>`src-tauri/src/ai.rs` | Offline Ollama chat + Mistral root-cause diagnostics, prompt context budgeting, 8KB diff truncation. | **DO NOT REWRITE.** |
| **WASM Plugins** | `plugins` / `market` | **Implemented** | `src/components/PluginManager.tsx`<br>`src/components/PluginMarketplace.tsx`<br>`src-tauri/src/plugin.rs` | Wasmtime WASI engine, SHA-256 integrity verification, marketplace install/uninstall workflows. | **DO NOT REWRITE.** |
| **AST Refactor** | `ast` | **Partially Implemented** | `src/components/ASTRefactor.tsx` | Tree-sitter AST transformation. Uses `web-tree-sitter` which triggers `eval()` CSP warning in production. | **DO NOT REWRITE.** Isolate or delegate AST parsing safely. |
| **Memory Profiler** | `memory` | **Implemented** | `src/components/MemoryProfiler.tsx`<br>`src-tauri/src/sys.rs` | Working-set and private bytes visualization for top system processes. | **DO NOT REWRITE.** |
| **GPU Cluster** | `gpu` | **Implemented** | `src/components/GPUCluster.tsx`<br>`src-tauri/src/sys.rs` | NVIDIA/AMD GPU device detection and utilization telemetry. | **DO NOT REWRITE.** |
| **Collaborative Editor** | `crdt` | **Partially Implemented** | `src/components/CollaborativeEditor.tsx` | P2P WebRTC CRDT editor using Yjs. Contributes 4.12 MB to bundle. | **DO NOT REWRITE.** Ensure strict lazy boundary. |
| **Automation Studio** | `automation` | **Implemented** | `src/components/AutomationStudio.tsx`<br>`src-tauri/src/system_tools.rs` | Multi-step shell command pipeline runner with SQLite persistence. | **DO NOT REWRITE.** |
| **Settings & Theme** | `settings` | **Implemented** | `src/components/SettingsPage.tsx`<br>`src/store/store.ts` | Theme switching (Dark/Light), terminal shell picker, workspace history, SQLite KV backup. | **DO NOT REWRITE.** |
| **Auto-Updater** | System | **Implemented** | `src/services/updaterService.ts`<br>`src-tauri/tauri.conf.json` | Tauri official updater plugin with Minisign verification against GitHub Releases. | **DO NOT REWRITE.** |
| **Windows Context Menu**| Shell | **Missing** | `src-tauri/` | "Open with CodexOS" in Windows Explorer context menu for folders and drives. | **NEW FEATURE (Phase 03).** |
| **Single-Instance Lock**| Shell | **Missing** | `src-tauri/` | Focus existing window when user opens a new folder instead of launching second instance. | **NEW FEATURE (Phase 03).** |
| **CLI Folder Argument** | Shell | **Missing** | `src-tauri/` | Launching `codexos.exe <path>` navigates directly to folder. | **NEW FEATURE (Phase 03).** |
| **Production Bootstrapper**| Installer | **Missing** | Root | Standalone `.bat` bootstrapper that downloads installer from GitHub Releases with SHA-256 checks. | **NEW FEATURE (Phase 04).** |

---

## 3. Features That Must NOT Be Rewritten

To maintain stability, avoid regressions, and preserve working code:
1. **SSRF Firewall & Network Proxy (`proxy.rs`):** The comprehensive RFC 1918, CGNAT, link-local, and cloud metadata firewall is tested and verified. Do not modify its architecture.
2. **Secrets & Vault Cryptography (`vault.rs`, `secrets.rs`, `hmac_vault.rs`):** The Argon2id + ChaCha20Poly1305 encryption format, magic headers (`CDX1`), and zeroization procedures are mathematically verified.
3. **PTY Multiplexer Backend (`multiplexer.rs`):** Concurrency model with `portable-pty` and line ring-buffers handles multi-shell I/O reliably.
4. **Zustand Store & SQLite Hydration (`store.ts`, `kv.rs`):** Dual-write mechanism (memory + SQLite KV table `store_kv`) ensures persistent session state across restarts.
5. **AI Root-Cause Copilot (`ai.rs`):** Context-budgeting and token truncation algorithms prevent token explosion during Ollama/Mistral queries.
6. **WASM Plugin Runtime (`plugin.rs`):** Wasmtime sandboxing with SHA-256 package verification is sound and isolated.
