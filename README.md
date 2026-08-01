<div align="center">
  <img src="https://raw.githubusercontent.com/tauri-apps/tauri/dev/app-icon.png" width="128" height="128" alt="Vaultly Icon" />
  
  # Vaultly v2
  
  **The Ultimate Offline Developer OS.**  
  A blazingly fast, deeply integrated system explorer and control center built on Rust, Tauri 2.0, and React.

  [![Built with Tauri](https://img.shields.io/badge/Built_with-Tauri_2.0-24C8DB?style=for-the-badge&logo=tauri&logoColor=white)](#)
  [![React](https://img.shields.io/badge/React-18-61DAFB?style=for-the-badge&logo=react&logoColor=black)](#)
  [![Rust](https://img.shields.io/badge/Rust-1.75+-000000?style=for-the-badge&logo=rust&logoColor=white)](#)
</div>

<br/>

Vaultly v2 is a next-generation developer environment and control center designed from the ground up for speed, power, and offline capabilities. Bypassing Electron's bloat in favor of **Tauri 2.0 (Rust)**, Vaultly brings deep native Windows OS integration directly into a gorgeous, ultra-premium glassmorphic React interface.

---

## 🚀 The Ultimate Developer Arsenal

Vaultly v2 is packed with high-performance native modules executing completely offline on your machine:

- **Multiplexed PTY Terminal**: Run multiple parallel shell sessions natively bridged through Rust.
- **Visual Git Client**: Offline Git version control with branching, merging, and diff tracking.
- **Database Studio**: Local SQLite management with query analysis.
- **Docker Dashboard**: Monitor containers, networks, and images in real-time.
- **Network Interceptor**: Sniff and analyze raw local TCP/UDP packets.
- **AST Refactoring Engine**: Semantically analyze and manipulate code trees locally.
- **ZKP Vault**: Zero-Knowledge Proof based encryption for in-memory secret storage.
- **GPU Cluster**: Local AI compute bridging via your native hardware.
- **CRDT Collab Editor**: Conflict-free replicated data types for peer-to-peer code editing.
- **Port Tunneling**: Secure local forwarding and reverse proxies.
- **Live Memory Profiler**: Heatmaps and active process memory tracking.
- **Plugin Sandbox**: WASM-based isolated plugin execution environment.

## 🛠️ Tech Stack

- **Frontend:** React 18, Vite, Framer Motion, Tailwind CSS v4, Lucide React
- **Backend:** Rust, Tauri 2.0, Wasmtime (WASI), Tokio, Ring (Cryptography), Git2, SQLite, Sysinfo
- **Styling:** Custom sleek dark mode with hardware-accelerated micro-animations, glassmorphism, and hidden scrollbars.

## ⚙️ How to Build & Run

Ensure you have [Rust](https://rustup.rs/), Node.js, and the Windows MSVC build tools installed.

```bash
# Install dependencies
npm install

# Run the Dev Server (Frontend + Native Backend Hot-Reloading)
npm run tauri dev

# Build the production executable
npm run tauri build
```

## 🔒 Security & Offline-First

Vaultly is designed for the paranoid developer. 
- **100% Local**: No telemetry, no tracking, no cloud accounts.
- **Memory Safety**: Backed by Rust's strict compiler.
- **Encrypted**: Keys are never stored in plaintext, utilizing `ring` cryptography and Zero-Knowledge Proofs for verification.

<br/>
<div align="center">
  <i>Built for power users.</i>
</div>
