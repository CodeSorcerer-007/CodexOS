# Changelog

All notable changes to CodexOS are documented here.

The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).
Versioning follows [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

---

## [2.1.0] — 2026-08-15

### Added
- **Dedicated KV Engine (`kv.rs`)**: Extracted general-purpose SQLite key-value persistence from `proxy.rs` into its own decoupled architecture.
- **Deterministic LRU Cache (`BoundedLruCache`)**: Zero-dependency bounded LRU cache with automatic eviction for AI root-cause diagnostics.
- **Comprehensive API Documentation (`docs/API_REFERENCE.md`)**: Full specification of all 45+ Tauri IPC commands and security invariants.
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

[Unreleased]: https://github.com/CodeSorcerer-007/CodexOS/compare/v2.0.0...HEAD
[2.0.0]: https://github.com/CodeSorcerer-007/CodexOS/compare/v1.0.0...v2.0.0
[1.0.0]: https://github.com/CodeSorcerer-007/CodexOS/releases/tag/v1.0.0
