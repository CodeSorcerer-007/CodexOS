# Changelog

All notable changes to CodexOS are documented here.

The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).
Versioning follows [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

---

## [2.2.0] — 2026-10-04

CodexOS v2.2.0 delivers production packaging manifests, automated end-to-end desktop verification, live telemetry dashboard integration, universal light and dark theme adaptation across all 25+ modules, a cryptographically attested Wasm plugin registry, multi-node automation workflow execution, WebRTC STUN/TURN traversal with encrypted credential storage, native SSH keypair management with active port inspection, and Criterion cryptographic microbenchmarks.

### Added
- **Dashboard Telemetry Integration (`CodexOSDashboard.tsx`)**:
  - Integrated high-density system dashboard into application router (`/dashboard`) and navigation sidebar.
  - Live hardware telemetry polling: real-time CPU sparkline charts, RAM utilization, storage volume distribution, and network interface throughput via `sysinfo`.
  - Dynamic container monitor showing status of active local Docker containers.
  - Dynamic quick launch shortcuts for recent workspaces and developer tools.
- **Universal Design Token & Theming Engine**:
  - Centralized semantic theme design tokens in `src/globals.css`, `tailwind.config.js`, and `src/App.tsx` (`--app-bg`, `--app-surface`, `--app-panel`, `--app-card`, `--app-border`, `--app-text`, `--app-text-muted`, `--app-subtle`).
  - Adapted all 25+ application modules for full theme switching with zero un-themed or unreadable elements in both light and dark modes.
  - Dynamic Monaco Editor theme switching (`vs-dark` in dark mode, `light` in light mode) across code editors.
  - Dynamic xterm.js ANSI terminal color scheme adaptation matching active system mode.
- **Automated Desktop E2E Verification (`e2e/`)**:
  - Integrated Playwright (`@playwright/test` v1.62.1) desktop test harness with `"test:e2e"` script in `package.json`.
  - Comprehensive browser-level Tauri 2 IPC mock fixture simulating native backend commands and event streams.
  - Verified 5 critical end-to-end user journeys:
    1. **Vault Unlock Journey**: Locked state detection, password entry, modal dismissal, decrypted vault transition, and invalid master password rejection.
    2. **File Workspace Browsing Journey**: Storage drive enumeration, directory entry navigation, file grid view rendering, and breadcrumb path traversal.
    3. **Terminal Session Journey**: Cross-platform PTY session initialization, shell command execution, and real-time xterm.js output stream rendering.
    4. **Visual Git Staging Journey**: Working tree status inspection, unstaged diff review, individual and bulk staging (`git add`), and status transitions to staged state.
    5. **Command Palette Navigation Journey**: `Ctrl+K` palette invocation, fuzzy search querying, keyboard navigation (`ArrowDown`/`Enter`), and active route transition.
- **Sandboxed Plugin Registry & Workflow DAG Engine**:
  - Sandboxed WebAssembly plugin registry client in `PluginMarketplace.tsx` for browsing and discovering extensions.
  - Cryptographic package verification enforcing SHA-256 checksum attestation before staging and installing plugin bytecode, rejecting corrupt or tampered binaries.
  - Bidirectional installed plugin state persistence and lifecycle management in `PluginManager.tsx` with execute, toggle, and uninstall actions.
  - Multi-node automation workflow graph execution bridge in `AutomationStudio.tsx`, sequentially executing host tasks with structured step results (`nodeId`, `command`, `exitCode`, `stdout`, `stderr`, `durationMs`, `status`) and execution logs.
- **Production Package Manager Manifests (`packaging/`)**:
  - **WinGet Manifests**: `packaging/winget/manifests/c/CodeSorcerer/CodexOS/2.2.0/` conforming to WinGet schema v1.6.0 (`CodeSorcerer.CodexOS.yaml`, `CodeSorcerer.CodexOS.installer.yaml`, `CodeSorcerer.CodexOS.locale.en-US.yaml`).
  - **Homebrew Cask Formula**: `packaging/homebrew/codexos.rb` for macOS distribution supporting both Apple Silicon (`aarch64`) and Intel (`x64`) architectures.
  - **Scoop Manifest**: `packaging/scoop/codexos.json` for lightweight Windows distribution.
- **Cryptographic Microbenchmarks (`src-tauri/benches/crypto_benchmarks.rs`)**:
  - Criterion 0.5 benchmark harness with HTML reports measuring key derivation and symmetric cipher throughput.
  - Argon2id key derivation latency benchmark using production vault parameters (`t_cost=3`, `m_cost=65536`, `p_cost=4`).
  - ChaCha20-Poly1305 symmetric encryption and decryption throughput benchmarks across 64B, 1KB, 64KB, and 1MB payloads using `criterion::Throughput::Bytes`.
- **Peer Collaboration Traversal & Remote Infrastructure**:
  - Configurable WebRTC STUN/TURN network traversal settings in `CollaborativeEditor.tsx` with custom ICE candidate injection (`iceServers`).
  - Native SSH keypair generator and manager in `src-tauri/src/ssh.rs` and `SshManager.tsx` supporting RSA and Ed25519 key generation, listing, and deletion.
  - Active local listening service port inspection in `src-tauri/src/ports.rs` and `SshManager.tsx` consuming `ports::get_active_ports`.

### Security
- **Encrypted WebRTC Traversal Credentials**: Custom STUN/TURN credentials and ICE configurations are persisted exclusively inside the Argon2id / ChaCha20-Poly1305 encrypted vault (`secrets_vault.json`).
- **Cryptographic Plugin Checksum Attestation**: Enforced strict SHA-256 hash checks prior to staging and executing any external WebAssembly plugin bytecode.
- **Dependency Security Auditing (`src-tauri/deny.toml`)**: Audited dependency licenses against a strict whitelist (MIT, Apache-2.0, BSD-3-Clause, BSD-2-Clause, ISC, Unicode-DFS-2016, OpenSSL, Zlib, CC0-1.0), banned wildcards, and enforced automated RustSec vulnerability advisory checks.

### Fixed
- **AppRouter Route Registration**: Fixed route identifier mapping for `zkp` route ID, correctly resolving to `HMACVault`.
- **CSS Semantic Token Inconsistencies**: Fixed hardcoded color utilities across 25+ application modules that caused unreadable text and contrast issues in light mode.

### Changed
- Upgraded version identifiers to 2.2.0 across `packaging/`, `Cargo.toml`, and release configurations.
- Refactored `CollaborativeEditor` provider initialization to dynamically read and apply vault-backed ICE server configuration.

---

## [2.1.0] — 2026-08-15

### Added
- **Dedicated KV Engine (`kv.rs`)**: Extracted general-purpose SQLite key-value persistence from `proxy.rs` into its own decoupled architecture.
- **Deterministic LRU Cache (`BoundedLruCache`)**: Zero-dependency bounded LRU cache with automatic eviction for AI root-cause diagnostics.
- **Comprehensive API Documentation (`docs/API_REFERENCE.md`)**: Full specification of all 129 Tauri IPC commands and security invariants.
- **Frontend Test Suite Explosion**: Added 20+ new Vitest test files covering all previously untested components (`Breadcrumb`, `ToastContainer`, `KeyboardHelp`, `OnboardingWizard`, `LocalAI`, `LocalCodeEditor`, `ProcessManager`, `EnvManager`, `SshManager`, `PortTunnel`, `GPUCluster`, `MemoryProfiler`, `AutomationStudio`, `PluginManager`, `PluginMarketplace`, `SandboxManager`, `ASTRefactor`, `CollaborativeEditor`, `HttpRequestBuilder`, `DevDocsViewer`, `GitContextMenu`).
- **CI Hardening**: Integrated `cargo deny` license, advisory, and ban validation directly into main branch pull request validation.

### Security
- **Harmonized Vault Password Length**: Enforced unified 12-character minimum password policy across both filesystem archive vaults and secret managers via `MIN_PASSWORD_LENGTH`.
- **SSH Hardening**: Added shell-injection protection and strict host key checking.
- **Secrets Export Safety**: Injected unencrypted credentials warning banner at the top of exported `.env` files.
- **Strict CSP Policy**: Hardened Content Security Policy in `tauri.conf.json` removing unnecessary unsafe script directives.

### Changed
- Refactored `OnboardingWizard` tool detection lifecycle to cleanly eliminate all ESLint suppression comments.
- Strongly typed `AppRouter` component registry using the `AppId` type union.
- Upgraded version identifiers to 2.1.0 across `package.json`, `Cargo.toml`, and `tauri.conf.json`.

---

## [2.0.0] — 2026-07-01

> For an in-depth architectural, cryptographic, and performance report comparing the v1 prototype to the v2 platform, see **[docs/V1_VS_V2_COMPARISON.md](docs/V1_VS_V2_COMPARISON.md)**.

### Added
- **AI Root-Cause Copilot** — automatically diagnoses terminal errors (non-zero exit), memory spikes, and HTTP 4xx/5xx failures via Mistral AI (`mistral-large-latest`)
  - Rust backend: async context gathering, 1 req/10s rate limiter per trigger, in-memory response cache, 15s timeout
  - `DiagnosisCard` component: loading skeleton → success (cause, confidence badge, collapsible explanation, suggested fix, file chips) → error + retry
  - `diagnosisStore` Zustand slice with property-based tests (fast-check)
  - `detectMemorySpike` pure utility — side-effect-free, requirement-tagged, fully unit-tested
  - Three trigger sources: terminal PTY exit ≠ 0, memory spike delta ≥ threshold, "Diagnose" button on HTTP error rows
  - API key lives exclusively in the Rust ChaCha20-Poly1305 encrypted vault — never touches JavaScript
  - Git diffs capped at 8,000 chars to prevent credential leakage
- **SSH Remote** module — browse remote filesystems over SSH via `ssh2`
- **Process Manager** module — monitor and kill system processes
- **Env Manager** module — read and write `.env` files for the current workspace
- **Port Tunnel** module — secure local port forwarding via serveo
- **Multi-tab workspace** — up to 8 concurrent tabs with per-tab state, sessionStorage persistence, drag-to-reorder, keyboard shortcuts (Ctrl+T, Ctrl+W, Ctrl+1–9)
- **Command Palette** (Ctrl+K) — fuzzy search across all modules and recent workspaces with full keyboard navigation
- **Onboarding wizard** — first-run guided setup
- `detectMemorySpike` pure utility and full unit test suite
- `diagnosisStore` property-based tests with fast-check (monotone growth, idempotency of dismiss)
- Guard tests for AI trigger sources (terminal, memory, network)
- Full `VaultUnlock`, `SecretsManager`, `ZKPVault` test suites
- Cross-platform CI: Ubuntu + Windows + macOS Tauri builds with Cargo registry caching

### Changed
- Upgraded from Tauri 1.x to **Tauri 2.0** — capability-based IPC, updated plugin APIs
- Upgraded to **React 19**, **TypeScript 6**, **Vite 8**, **Zustand 5**, **Tailwind CSS 4**
- Replaced `eslint` with **oxlint** for 10-100× faster linting
- Zustand store refactored into four typed domain slices: `TabsSlice`, `SettingsSlice`, `NavigationSlice`, `UiSlice`
- `App.tsx` module routing replaced monolithic switch with typed `APP_REGISTRY` map
- All 25+ feature modules are now lazy-loaded via `React.lazy` + `Suspense`

### Security
- Mistral API key isolated to Rust process inside ChaCha20-Poly1305 encrypted vault (`get_secret_internal` is Rust-only)
- WASM/WASI plugins sandboxed in Wasmtime with no default host access
- ZKP Vault uses HMAC-SHA256 commitment scheme for paranoid secret verification

---

## [1.0.0] — 2025-06-01

Initial public release.

### Included modules
- File Vault, Visual Git Client, Terminal Multiplexer
- Secrets Manager (OS Keyring), ZKP Vault
- Proxy Interceptor, Docker Dashboard, Database Studio (SQLite)
- Local AI (Ollama), GPU Cluster, AST Refactor Engine
- CRDT Collaborative Editor (Yjs + WebRTC)
- Sandbox / Nano-VMs (Wasmtime), Plugin Manager, Plugin Marketplace
- Automation Studio (ReactFlow), DevDocs Viewer

[Unreleased]: https://github.com/CodeSorcerer-007/CodexOS/compare/v2.2.0...HEAD
[2.2.0]: https://github.com/CodeSorcerer-007/CodexOS/compare/v2.1.0...v2.2.0
[2.1.0]: https://github.com/CodeSorcerer-007/CodexOS/compare/v2.0.0...v2.1.0
[2.0.0]: https://github.com/CodeSorcerer-007/CodexOS/compare/v1.0.0...v2.0.0
[1.0.0]: https://github.com/CodeSorcerer-007/CodexOS/releases/tag/v1.0.0
