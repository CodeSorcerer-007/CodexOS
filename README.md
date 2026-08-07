<div align="center">
  <img src="https://raw.githubusercontent.com/tauri-apps/tauri/dev/app-icon.png" width="128" height="128" alt="CodexOS Icon" />
  
  # CodexOS

  **The Ultimate Offline Developer OS.**  
  A blazingly fast, deeply integrated system explorer and control center built on Rust, Tauri 2.0, and React 19.

  [![Built with Tauri](https://img.shields.io/badge/Built_with-Tauri_2.0-24C8DB?style=for-the-badge&logo=tauri&logoColor=white)](#)
  [![React](https://img.shields.io/badge/React-19-61DAFB?style=for-the-badge&logo=react&logoColor=black)](#)
  [![Rust](https://img.shields.io/badge/Rust-1.75+-000000?style=for-the-badge&logo=rust&logoColor=white)](#)
  [![TypeScript](https://img.shields.io/badge/TypeScript-6.0-3178C6?style=for-the-badge&logo=typescript&logoColor=white)](#)
  [![Mistral AI](https://img.shields.io/badge/Mistral-AI_Copilot-FF7000?style=for-the-badge&logo=openai&logoColor=white)](#)
  [![License](https://img.shields.io/badge/License-MIT-green?style=for-the-badge)](#)
</div>

<br/>

CodexOS is a next-generation developer environment and control center designed from the ground up for speed, power, and offline capabilities. Bypassing Electron's bloat in favor of **Tauri 2.0 (Rust)**, CodexOS brings deep native OS integration directly into a gorgeous, ultra-premium glassmorphic React interface.

> [!NOTE]
> **Windows Ready:** This application is tailored for Windows and can be cloned and run natively on any Windows system without complex configuration.

---

## 🚀 Feature Arsenal

CodexOS is packed with high-performance native modules executing completely offline on your machine:

| Module | Description |
|---|---|
| 🗂️ **File Vault** | Native file explorer with git status overlay, bulk rename, duplicate finder, and treemap disk visualizer |
| 🔀 **Visual Git Client** | Full offline Git — branching, merging, stash, diff viewer, clone, fetch, and history |
| 💻 **Terminal Multiplexer** | Run multiple parallel shell sessions natively via Rust PTY bridge |
| 🔑 **Secrets Manager** | Encrypted in-memory secrets vault with run-with-secrets injection |
| 🛡️ **ZKP Vault** | Zero-Knowledge Proof based HMAC encryption for paranoid secret storage |
| 🌐 **Proxy Interceptor** | Sniff, capture, and replay raw local HTTP/TCP traffic |
| 🐳 **Docker Dashboard** | Monitor containers, images, networks, and stream logs in real-time |
| 🗄️ **Database Studio** | Local SQLite management with query analysis and results grid |
| ⚡ **Local AI** | Query local Ollama LLMs offline — no API keys, no cloud |
| 🖥️ **GPU Cluster** | Real-time GPU hardware metrics and utilization monitoring |
| 🔭 **AST Refactor Engine** | Tree-sitter powered semantic code analysis and manipulation |
| 🤝 **CRDT Collab Editor** | Conflict-free peer-to-peer code editing via y-webrtc + y-monaco |
| 🚇 **Port Tunnel** | Secure local port forwarding and reverse proxies via serveo |
| 🧠 **Memory Profiler** | Real-time process memory analysis and top-consumer tracking |
| 📦 **Sandbox / Nano-VMs** | Run WASM/WASI plugins in sandboxed Wasmtime nano-VMs |
| 🔌 **Plugin Manager** | Load and run local WASM plugins from disk |
| 🛒 **Plugin Marketplace** | Browse and install community plugins |
| 🤖 **Automation Studio** | Visual workflow automation builder |
| 📚 **DevDocs Viewer** | Browse offline developer documentation |
| ✨ **AI Root-Cause Copilot** | Auto-diagnose terminal errors, memory spikes & HTTP failures via Mistral AI |

---

## ✨ AI Root-Cause Copilot

> [!IMPORTANT]
> **New Feature** — The AI Root-Cause Copilot automatically diagnoses errors across your entire dev environment using **Mistral AI** (`mistral-large-latest`). It's fully opt-in and completely silent without an API key.

### How It Works

When something goes wrong in CodexOS, the Copilot springs into action:

```
PTY exit ≠ 0      ──┐
Memory spike       ──┼──► Context gathered ──► Mistral API ──► Diagnosis Card
HTTP 4xx / 5xx    ──┘
```

It collects relevant context (terminal output, git diff, system stats, HTTP request/response), sends it to Mistral, and renders a **dismissible glassmorphic diagnosis card** — not a chat window — right inside the active module.

### Trigger Sources

| Trigger | How It Fires |
|---|---|
| **Terminal Error** | Automatically when a shell command exits with a non-zero code |
| **Memory Spike** | Automatically when a process memory delta exceeds the configured threshold |
| **Network Error** | Manually via a **"Diagnose"** button on any 4xx / 5xx request row in the Proxy Interceptor |

### Diagnosis Card

Each card shows:
- 🔴 **Root Cause** — concise headline of what failed
- 🏷️ **Confidence Badge** — `high` (red) · `medium` (amber) · `low` (gray)
- 📖 **Collapsible Explanation** — detailed analysis
- 💊 **Suggested Fix** — monospace code block with the exact fix
- 📁 **Related Files** — clickable file chips that navigate directly to the affected file

The card animates in with Framer Motion and can be dismissed permanently for that session.

### Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                       RUST BACKEND (ai.rs)                   │
│                                                              │
│  ┌─────────────┐   ┌──────────────┐   ┌──────────────────┐  │
│  │  Context    │   │  Rate Limiter │   │   In-Memory      │  │
│  │  Gatherer   │──►│  1 req/10s   │──►│   Cache          │  │
│  │             │   │  per trigger │   │   (by trigger)   │  │
│  └─────────────┘   └──────────────┘   └────────┬─────────┘  │
│       ▲                                         │ miss       │
│       │                                         ▼            │
│  Terminal lines                     Mistral API (15s timeout)│
│  Git diff (≤8K)                     mistral-large-latest     │
│  Sys stats                          JSON parser +            │
│  HTTP req/res                       fence stripping          │
└─────────────────────────────────────────────────────────────┘
                          │ Result<Diagnosis>
                          ▼
┌─────────────────────────────────────────────────────────────┐
│                   FRONTEND (React + Zustand)                  │
│                                                              │
│  diagnosisStore → DiagnosisCard (glassmorphic overlay)       │
│    loading  → skeleton shimmer (animate-pulse)               │
│    success  → cause + badge + explanation + fix + files      │
│    error    → message + retry button                         │
│    dismissed → null (session-persistent, no localStorage)    │
└─────────────────────────────────────────────────────────────┘
```

### Security

- 🔐 `MISTRAL_API_KEY` is stored **exclusively** in the ChaCha20-Poly1305 encrypted Secrets Vault — never in JavaScript, never in logs, never in Tauri events
- 🔒 `get_secret_internal` is a Rust-only function, unreachable from the frontend
- ✂️ Git diffs are capped at **8,000 chars** to prevent accidental transmission of credential files
- 🚫 No data leaves your machine except the diagnostic context sent to Mistral

### Setup

1. **Unlock** the Secrets Vault in CodexOS
2. **Add a secret**: Key = `MISTRAL_API_KEY` · Value = your [Mistral API key](https://console.mistral.ai)
3. Go to **Settings → AI Root-Cause Copilot** — you'll see ✅ **"API Key Configured"**
4. Run a failing command in the terminal — the diagnosis card appears automatically!

### Configuration (Settings Page)

| Setting | Default | Description |
|---|---|---|
| Enable / Disable | `on` | Master toggle — disabling stops all AI calls completely |
| Memory Spike Threshold | `500 MB` | Delta required to trigger a memory diagnosis |
| Memory Spike Window | `10 sec` | Rolling window for spike detection |

---

## 🛠️ Tech Stack

### Frontend
| Technology | Version | Purpose |
|---|---|---|
| React | 19 | UI Framework |
| Vite | 8 | Build tool & dev server |
| TypeScript | 6.0 | Type safety |
| Zustand | 5 | Global state management |
| Framer Motion | 12 | Animations & transitions |
| Tailwind CSS | 4 | Utility-first styling |
| Lucide React | 1.28 | Icon library |
| Monaco Editor | 0.56 | Code editor |
| ReactFlow | 11 | Automation workflow graph |
| Recharts | 3 | Data visualization |
| Yjs + y-webrtc | 13 / 10 | CRDT real-time collaboration |
| xterm.js | 5 | Terminal emulation |

### Backend (Rust / Tauri)
| Crate | Purpose |
|---|---|
| Tauri 2.0 | Native app shell & IPC bridge |
| portable-pty | Native PTY terminal sessions |
| git2 | Libgit2 bindings for Git operations |
| rusqlite | SQLite database access |
| sysinfo | CPU / memory / process monitoring |
| wasmtime | WASM/WASI sandboxed plugin runner |
| ring | Cryptography (HMAC, hashing) |
| tokio | Async runtime |
| hyper | HTTP proxy engine |
| reqwest | Async HTTP client (Mistral API) |
| serde / serde_json | Serialization |
| ssh2 | SSH file browsing |
| proptest | Property-based testing for AI module |

---

## 🏗️ Architecture

- **Multi-Tab UI**: Up to 8 concurrent workspace tabs with per-tab state (`Ctrl+1..8` global hotkeys).
- **Lazy-Loaded Modules**: Every major feature module is loaded on-demand via `React.lazy` + `Suspense`, keeping startup instant.
- **Fault-Tolerant UI**: Global React Error Boundaries ensure individual plugin crashes never take down the dashboard.
- **Global Store**: Prop-drilling-free state management powered by Zustand with persistent settings via `localStorage`.
- **Native IPC Bridge**: All heavy lifting (file ops, git, crypto, docker, PTY) runs in Rust via Tauri's type-safe `invoke` IPC.
- **AI Copilot**: Fully async Rust backend — the Tauri main thread is never blocked during Mistral API calls.

---

## ⚙️ Getting Started

### Prerequisites
- [Rust](https://rustup.rs/) (latest stable)
- [Node.js](https://nodejs.org/) 20+
- Windows MSVC build tools (Visual Studio Build Tools 2022)

### Install & Run

```bash
# Clone the repository
git clone https://github.com/CodeSorcerer-007/CodexOS.git
cd CodexOS

# Install frontend dependencies
npm install

# Run the dev server (Frontend + Rust backend with hot-reloading)
npm run tauri dev
```

### Other Commands

```bash
# Lint the frontend (oxlint)
npm run lint

# Run frontend component tests (Vitest)
npm run test

# Run Rust backend unit tests (includes AI property-based tests)
cd src-tauri && cargo test

# Run Rust static analysis
cd src-tauri && cargo clippy

# Build the production executable (installer)
npm run tauri build
```

---

## 📁 Project Structure

```
CodexOS/
├── src/                          # React frontend
│   ├── App.tsx                   # Root app, sidebar, routing
│   ├── components/               # Feature modules (lazy-loaded)
│   │   ├── FileGrid.tsx          # File explorer
│   │   ├── VisualGit.tsx         # Git client
│   │   ├── TerminalMultiplexer.tsx
│   │   ├── DockerDashboard.tsx
│   │   ├── DatabaseStudio.tsx
│   │   ├── NetworkInterceptor.tsx
│   │   ├── CollaborativeEditor.tsx
│   │   ├── SecretsManager.tsx
│   │   ├── ZKPVault.tsx
│   │   ├── LocalAI.tsx
│   │   ├── GPUCluster.tsx
│   │   ├── ASTRefactor.tsx
│   │   ├── PortTunnel.tsx
│   │   ├── MemoryProfiler.tsx
│   │   ├── DiagnosisCard.tsx     # ✨ AI Copilot diagnosis overlay
│   │   ├── SettingsPage.tsx      # Includes AI Copilot config section
│   │   └── ...
│   ├── store/
│   │   ├── store.ts              # Zustand global state
│   │   └── diagnosisStore.ts     # ✨ AI Copilot state slice
│   ├── utils/
│   │   └── detectMemorySpike.ts  # ✨ Pure memory spike detection
│   └── hooks/
│       └── useKeyboardShortcuts.ts
├── src-tauri/                    # Rust backend
│   ├── src/
│   │   ├── lib.rs                # Entry point, PTY, command registration
│   │   ├── files.rs              # File system operations
│   │   ├── git.rs                # Git2 operations
│   │   ├── docker.rs             # Docker API
│   │   ├── proxy.rs              # HTTP proxy/interceptor
│   │   ├── secrets.rs            # Secrets vault (ChaCha20-Poly1305)
│   │   ├── vault.rs              # ZKP encryption
│   │   ├── zkp.rs                # Zero-knowledge proofs
│   │   ├── ports.rs              # Port management & log tailing
│   │   ├── sys.rs                # System stats
│   │   ├── tunnel.rs             # SSH reverse tunneling
│   │   ├── multiplexer.rs        # Multi-PTY sessions
│   │   ├── db.rs                 # SQLite & docset queries
│   │   ├── crypto_tools.rs       # Hash, SSL, format conversion
│   │   ├── ssh.rs                # SSH file browsing
│   │   ├── ai.rs                 # ✨ AI Copilot + Ollama LLM integration
│   │   └── plugin.rs             # WASM/WASI plugin runner
│   └── Cargo.toml
├── .kiro/
│   └── specs/
│       └── ai-root-cause-copilot/  # ✨ Full feature spec & design docs
│           ├── requirements.md
│           ├── design.md
│           └── tasks.md
├── index.html
├── vite.config.ts
├── tailwind.config.js
└── package.json
```

---

## 🔒 Security & Offline-First

CodexOS is designed for the paranoid developer.

- **100% Local**: No telemetry, no tracking, no cloud accounts required.
- **Memory Safety**: Backed by Rust's strict borrow checker and compiler guarantees.
- **Encrypted**: Keys are never stored in plaintext — utilizes `ring` cryptography and HMAC-based Zero-Knowledge Proofs for verification.
- **Sandboxed Plugins**: WASM plugins run inside Wasmtime's sandboxed environment with no host access by default.
- **AI Key Isolation**: The Mistral API key never touches JavaScript — it lives exclusively in the Rust process inside the encrypted vault.

---

<br/>
<div align="center">
  <i>Built for power users. Zero compromises.</i>
</div>
