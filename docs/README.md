# CodexOS Developer Documentation Portal

Welcome to the technical documentation hub for **CodexOS**. This index organizes the architectural blueprints, API contracts, security runbooks, and design decisions governing the platform.

---

## Documentation Map

```
docs/
├── README.md                      # Documentation Hub & Navigation Index (This file)
├── API_REFERENCE.md               # Authoritative IPC API Reference (129 Tauri commands)
├── ENTERPRISE_GA_SIGNING.md       # Code Signing, Apple Notarization & Auto-Updater Runbook
├── V1_VS_V2_COMPARISON.md         # CodexOS v1 vs v2 Architectural & Security Report
└── adr/                           # Architectural Decision Records
    ├── README.md                  # ADR Index & Contribution Lifecycle
    ├── 001-tauri-over-electron.md # Decision: Tauri 2 over Electron
    ├── 002-zustand-state.md       # Decision: Modular Zustand domain slices
    ├── 003-argon2-chacha20-vault.md # Decision: Argon2id + ChaCha20-Poly1305 AEAD
    ├── 004-ipc-zod-validation.md  # Decision: Runtime Zod validation on IPC boundary
    └── 005-git-cli-over-libgit2.md # Decision: Native Git CLI wrapper over git2
```

---

## Core Technical Guides

### 1. [System Architecture Guide](../ARCHITECTURE.md)
Detailed walkthrough of the multi-tier desktop architecture:
- React 19 + TypeScript presentation layer and Zustand modular state slices (`tabsSlice`, `settingsSlice`, `uiSlice`).
- Tauri 2 Rust core: memory-safe PTY multiplexer, Argon2id secrets vault, Hyper proxy with SSRF firewall, and Wasmtime sandbox.
- SQLite WAL key-value engine and local durability guarantees.
- Comprehensive security threat model and mitigation matrix.

### 2. [IPC API Reference Specification](./API_REFERENCE.md)
The authoritative catalog of all **129 registered Tauri IPC commands**:
- Complete method signatures, typed arguments, and return types.
- Security constraints: `AllowedPathsState` sandboxing, SSRF IP blocking, zeroized memory buffers, and rate limits.
- Subsystem mappings across Filesystem, Git, Docker, Terminal PTY, Secrets, AI Diagnostics, and Remote SSH.

### 3. [Architectural Decision Records (ADRs)](./adr/README.md)
Historical record of key design and technology choices:
- [ADR 001: Selection of Tauri v2 over Electron](./adr/001-tauri-over-electron.md)
- [ADR 002: Zustand for Centralized Application State](./adr/002-zustand-state.md)
- [ADR 003: Cryptographic Architecture (Argon2id + ChaCha20-Poly1305)](./adr/003-argon2-chacha20-vault.md)
- [ADR 004: Runtime IPC Boundary Validation using Zod](./adr/004-ipc-zod-validation.md)
- [ADR 005: Git CLI over libgit2](./adr/005-git-cli-over-libgit2.md)

### 4. [Enterprise GA Signing & Auto-Updater Runbook](./ENTERPRISE_GA_SIGNING.md)
Production deployment runbook covering:
- Minisign Ed25519 keypair generation for the Tauri auto-updater.
- Windows Authenticode certificate integration for SmartScreen reputation.
- macOS Apple Developer ID signing, hardening, and Gatekeeper notarization (`xcrun notarytool`).
- Automated release matrix via GitHub Actions.

### 5. [CodexOS v1 vs. v2 Comparison Report](./V1_VS_V2_COMPARISON.md)
Deep-dive technical report detailing the security hardening, performance optimizations, component decomposition, and automated testing evolution between the initial prototype and the v2 release.

---

## Contributing & Governance

- [Contributing Standards](../CONTRIBUTING.md) — PR lifecycle, Conventional Commits, code style, and test requirements.
- [Security Policy](../SECURITY.md) — Vulnerability reporting guidelines and supported release versions.
- [Changelog](../CHANGELOG.md) — Chronological history of releases following Keep a Changelog.
