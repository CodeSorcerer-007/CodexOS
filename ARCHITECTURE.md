<div align="center">
  <img src="./logo.png" width="100" height="100" alt="CodexOS Logo" />
  
  # CodexOS Architecture Guide
</div>

---

## 1. System Architecture Overview

```mermaid
graph TD
    subgraph Frontend ["Frontend (React 19 + TypeScript)"]
        UI[User Interface / 25+ App Modules]
        ZS[Zustand Multi-Slice Store]
        IPC_W[Type-Safe IPC Layer (Zod Validation)]
        LS[(Local Storage Cache)]
    end

    subgraph Backend ["Backend Core (Tauri 2 + Rust)"]
        CMDS[Command Handlers / IPC Dispatcher]
        VLT[Argon2id + ChaCha20-Poly1305 Vault]
        PRX[Network Interceptor / SSRF Firewall]
        PTY[PTY Multiplexer & Terminal Engine]
        FS[Filesystem Sandbox & Watcher]
        DB[(SQLite Engine: KV & Logs)]
        AI[Local Ollama / Mistral Diagnostic Engine]
        DOCKER[Docker Daemon Engine]
        GIT[Visual Git Subsystem]
        WASM[Wasmtime Nano Plugin VM]
    end

    UI --> ZS
    ZS <--> LS
    ZS --> IPC_W
    IPC_W <==>|Tauri IPC Bridge| CMDS
    CMDS --> VLT
    CMDS --> PRX
    CMDS --> PTY
    CMDS --> FS
    CMDS --> DB
    CMDS --> AI
    CMDS --> DOCKER
    CMDS --> GIT
    CMDS --> WASM
```

---

## 2. Layer Responsibilities

### 2.1 Presentation & State Layer (Frontend)
- **Framework**: React 19 with Vite, Tailwind CSS (v4), and Framer Motion.
- **Routing**: Lightweight dynamic lazy-loaded module router (`src/components/layout/AppRouter.tsx`).
- **State Management**: Zustand partitioned into domain slices:
  - `tabsSlice.ts`: Tab navigation, path history, and workspace context.
  - `settingsSlice.ts`: App settings, theme, terminal shell, and copilot config.
  - `uiSlice.ts`: Toast notification system and dialog states.
  - `diagnosisStore.ts`: Real-time AI diagnostic state and root-cause cache.
- **Data Durability**: Fast in-memory state with synchronous `localStorage` caching and asynchronous SQLite KV persistence via `kvSet`/`kvGet`.

### 2.2 IPC & Data Validation Layer
- **Type Safety**: Rust structs derive `serde::Serialize` / `serde::Deserialize`.
- **Runtime Validation**: `src/ipc.ts` parses incoming IPC responses through strict **Zod** schemas (`SysStatsSchema`, `GitStatusSchema`, `DiagnosisSchema`). This protects the frontend from silent contract drift.

### 2.3 Backend Subsystems (Rust Engine)
- **Security & Vault (`secrets.rs`, `vault.rs`, `hmac_vault.rs`)**:
  - Argon2id key derivation with versioned parameters (memory cost 64MB, time cost 3, parallelism 1, min password 12 chars).
  - Authenticated symmetric encryption using ChaCha20-Poly1305 and AES-256-GCM fallback.
  - Memory-safe master key management using `zeroize::Zeroizing<Vec<u8>>`.
  - Rate-limited brute-force lockout with SQLite persistence.
- **Key-Value Persistence Engine (`kv.rs`)**:
  - Dedicated, decoupled SQLite persistence subsystem for tab sessions and application settings.
  - SQLite WAL (Write-Ahead Logging) mode and `synchronous=NORMAL` for maximum concurrent throughput.
- **Shared Utilities & LRU Cache (`util.rs`)**:
  - Centralized `lock_poison_recover` helper preventing thread poisoning crashes across all Mutex states.
  - Deterministic `BoundedLruCache` powering AI diagnosis cache eviction (max 100 entries).
- **Network Interception & SSRF Firewall (`proxy.rs`)**:
  - Built-in HTTP/HTTPS intercepting proxy on loopback using Hyper.
  - Strict SSRF protection blocking private RFC-1918 ranges, loopback, CGNAT, IPv6 ULA/link-local, and cloud metadata endpoints (`169.254.169.254`, `metadata.google.internal`).
  - Panic-free SQLite storage and query engine with bounded log auto-eviction (capped at 500 recent records).
- **AI Diagnostic Engine (`ai.rs`)**:
  - Root-cause diagnostics combining PTY terminal logs, git diffs, process memory spikes, and network errors.
  - Token-budgeted context formatting (`MAX_CONTEXT_CHARS = 16,000`) and rate-limited API calls (1 per 10s).
- **PTY Terminal Multiplexer (`multiplexer.rs`)**:
  - Cross-platform pseudoterminal management via `portable-pty`.
  - Bidirectional streaming between backend PTY channels and frontend xterm.js instances with bounded circular buffers (`MAX_BUFFER_LINES = 200`).
- **Filesystem Sandbox (`files.rs`, `fs_cache.rs`)**:
  - `AllowedPathsState` enforcing path traversal boundaries and explicit workspace allowlists.
  - Poison-resilient file system watching via `notify`.
  - Asynchronous background execution using `tokio::task::spawn_blocking` for high-throughput scans, bloat detection, and metric aggregation.
- **Plugin Sandbox (`plugin.rs`)**:
  - Isolated WebAssembly execution environment powered by `wasmtime` and WASI capability boundaries.

---

## 3. Security Architecture & Threat Model

| Threat | Mitigation Mechanism |
| :--- | :--- |
| **Arbitrary File Access** | Canonicalized sandbox root enforcement via `AllowedPathsState::is_allowed`. |
| **SSRF via Network Proxy** | Layered `is_ssrf_blocked` blocking loopback, RFC-1918, CGNAT, link-local, and cloud metadata endpoints. |
| **Memory Dump of Master Key** | Sensitive keys wrapped in `Zeroizing` buffers, cleared on drop and explicit lock. |
| **Brute-Force Vault Attack** | Exponential lockout delays enforced and persisted in the encrypted vault metadata. |
| **Frontend Injection / XSS** | Strict Content Security Policy (CSP) isolating connect targets and disabling inline scripts where possible. |
| **Backend Thread Panic** | Comprehensive `AppError` type with safe error propagation across all SQLite and Mutex operations. |

---

## 4. Development & Verification Workflows

```bash
# Frontend development server (mock IPC)
npm run dev

# Full native desktop development with Tauri
npm run tauri dev

# Run frontend test suite (Fork-isolated Vitest)
npm run test

# Run Rust backend test suite
cd src-tauri && cargo test

# Production build
npm run tauri build
```

