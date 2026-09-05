# CodexOS v1 vs. CodexOS v2: Architectural & Security Comparison Report

This report documents the architectural, cryptographic, security, design, and performance evolution between **CodexOS v1** (the initial prototype baseline) and **CodexOS v2** (the hardened, production-grade desktop platform).

---

## Executive Summary

| Architectural Dimension | CodexOS v1 (Prototype Baseline) | CodexOS v2 (Hardened Production Release) |
| :--- | :--- | :--- |
| **Security Architecture** | Basic path checks; prototype key storage; mock ZKP. | **Argon2id + ChaCha20-Poly1305 AEAD**, zeroized memory (`Zeroizing`), persistent brute-force lockout, canonical `AllowedPathsState` sandbox across all I/O, and SSRF Firewall. |
| **Zero-Knowledge Proofs** | Insecure pseudo-ZKP proof mock (`zkp.rs`, `ZKPVault.tsx`). | **Cryptographically verified HMAC Commitment Vault** (`hmac_vault.rs`, `HMACVault.tsx`) with SHA-256 HMAC proofs. Insecure mock files eliminated. |
| **Network Security** | Basic loopback check on proxy. | **Enterprise SSRF Firewall** (`proxy.rs`) blocking loopback, RFC-1918 private subnets, CGNAT (`100.64.0.0/10`), cloud metadata (`169.254.169.254`), and IPv6 ULA/link-local. |
| **Frontend State** | Monolithic 350+ line Zustand store (`store.ts`) with duplicate hydration calls. | **Modular Zustand Store Slices** (`tabsSlice.ts`, `settingsSlice.ts`, `uiSlice.ts`) with deterministic single-source hydration and dual-write SQLite KV persistence (`kv.rs`). |
| **Component Architecture** | 1,100+ line monolithic `FileGrid.tsx`. | **Decomposed subcomponents** in `src/components/FileGrid/` (`FileGridContext`, `FileGridMain`, `FileGridToolbar`, `FileGridStatus`, `FileGridTreemap`, `FileGridDuplicates`). |
| **IPC Type Safety** | Unchecked direct `invoke()` calls. | **Runtime-validated IPC boundary (`ipc.ts`)** utilizing Zod schemas for all backend return types to guarantee zero contract drift. |
| **Window Management** | Drag region swallowed title bar clicks; missing Tauri capabilities. | **Isolated drag header** + native Rust `window_minimize`, `window_toggle_maximize`, `window_close` commands + full Tauri 2 capabilities. |
| **Brand Identity** | Generic external Tauri placeholder icon. | **Custom brand logo (`logo.png`)** unified across all native binaries (`.ico`, `.icns`, all PNG sizes), favicon, sidebar, dashboard, onboarding, and docs. |
| **Testing & CI/CD** | Basic unit tests; single release workflow. | **102 Automated Rust Tests** (95 unit, 1 binding, 6 integration) + 60+ Vitest tests + Playwright E2E suites + multi-stage GitHub Actions CI (`ci.yml`, `release.yml`). |

---

## 1. Cryptography & Security Subsystem Deep Dive

### 1.1 Secrets Vault & Key Derivation (`secrets.rs` / `vault.rs`)
* **v1 Baseline**: Stored secrets with basic encryption; memory buffers were not cleared on lock; no protection against rapid automated brute-force attacks.
* **v2 Hardening**:
  - **Argon2id Derivation**: Master key derived with cryptographic memory hardness ($m=65536\text{ KB}$, $t=3\text{ iterations}$, $p=1\text{ lane}$, minimum 12-character passphrase).
  - **ChaCha20-Poly1305 AEAD**: Authenticated encryption with associated data ensuring secret ciphertext confidentiality and integrity.
  - **Zeroize Memory Clearing**: Master keys and plaintext buffers implement `Zeroize` to scrub sensitive data from RAM immediately upon lock or drop.
  - **Persistent Exponential Lockout**: Failed unlock attempts trigger persisted exponential backoff and lockouts across application restarts to prevent dictionary attacks.
  - **Path-Validated Secrets Export**: `export_secrets_to_env` is strictly verified against `AllowedPathsState` to prevent writing `.env` files outside authorized project boundaries.

### 1.2 SSRF Firewall & Network Interceptor (`proxy.rs`)
* **v1 Baseline**: Only checked against `127.0.0.1` and `localhost`.
* **v2 Hardening**: Comprehensive IP parser filtering all outbound requests against:
  - Loopback (`127.0.0.0/8`, `::1`)
  - RFC-1918 Private Ranges (`10.0.0.0/8`, `172.16.0.0/12`, `192.168.0.0/16`)
  - Carrier-Grade NAT (`100.64.0.0/10`)
  - Cloud Metadata Endpoints (`169.254.169.254`, `fd00:ec2::254`, `metadata.google.internal`)
  - Link-Local & Unique Local IPv6 (`fe80::/10`, `fc00::/7`)

### 1.3 HMAC Proof Vault vs. Deprecated Mock ZKP
* **v1 Baseline**: Included a pseudo-ZKP implementation that used simple hash loops without true zero-knowledge mathematical guarantees, creating a false sense of security.
* **v2 Hardening**: Completely removed `zkp.rs` and `ZKPVault.tsx`. Replaced with a cryptographically sound `HMACVault` (`hmac_vault.rs`, `HMACVault.tsx`) providing deterministic HMAC-SHA256 commitment proofs.

### 1.4 Canonical Filesystem Sandboxing (`files.rs`)
* **v1 Baseline**: Basic relative path checks.
* **v2 Hardening**: Enforces strict canonical path resolution using `dunce::canonicalize` and checks every read, write, copy, move, delete, and search operation against `AllowedPathsState`. Symlink escapes and UNC traversal attacks are neutralized.

---

## 2. Frontend Architecture & State Management

### 2.1 Zustand Multi-Slice Store Decomposition
* **v1 Baseline**: All state (navigation, tabs, settings, UI, dialogs, toasts) resided in one large `store.ts` file. Store hydration was called multiple times redundantly.
* **v2 Hardening**:
  - Modularized into `src/store/slices/tabsSlice.ts`, `src/store/slices/settingsSlice.ts`, and `src/store/slices/uiSlice.ts`.
  - Single-source deterministic hydration lifecycle in `App.tsx` utilizing SQLite WAL key-value storage (`kvSet`/`kvGet`) with fallback to `localStorage`.

### 2.2 IPC Validation Boundary (`src/ipc.ts`)
* **v1 Baseline**: Direct `invoke()` calls with untyped or casted results.
* **v2 Hardening**: Created `src/ipc.ts` with strict **Zod runtime validation schemas**:
  - `SysStatsSchema`, `GitStatusSchema`, `DockerContainerSummarySchema`, `DiagnosisSchema`.
  - Guarantees complete contract consistency between the Rust backend and TypeScript frontend at runtime, failing fast on contract drift.

### 2.3 FileGrid Decomposition
* **v1 Baseline**: Single 1,123-line monolithic file (`FileGrid.tsx`).
* **v2 Hardening**: Modularized into `src/components/FileGrid/`:
  - `FileGridContext.tsx`: Shared state & keyboard navigation provider.
  - `FileGridMain.tsx`: Main view switcher (Grid, List, Details, Treemap, Duplicates).
  - `FileGridToolbar.tsx`: Search, filters, sort, view mode, and actions.
  - `FileGridStatus.tsx`: Real-time path, selection count, and disk usage status.
  - `FileGridTreemap.tsx`: Interactive D3/canvas disk usage visualization.
  - `FileGridDuplicates.tsx`: 2-pass SHA-256 duplicate file detector.

---

## 3. Native Integration & Window Controls

### 3.1 Window Controls & Title Bar Fix
* **v1 Baseline**: Title bar used `data-tauri-drag-region` across the entire width, which on Windows WebView2 intercepted all mouse clicks and prevented Minimize, Fullscreen/Maximize, and Close buttons from working.
* **v2 Hardening**:
  - Separated draggable header strip from the button container (`pointer-events-auto z-50`).
  - Added native Rust IPC commands: `window_minimize`, `window_toggle_maximize`, and `window_close` in `src-tauri/src/sys.rs` and registered in `commands.rs`.
  - Added complete `core:window:*` capabilities to `src-tauri/capabilities/default.json`.
  - Added visual hover glows and active-state micro-animations.

### 3.2 Offline AI Health Probing
* **v1 Baseline**: `OnboardingWizard.tsx` performed a direct browser `fetch('http://127.0.0.1:11434/')`, which triggered Content Security Policy (CSP) violations.
* **v2 Hardening**: Added native Rust `is_ollama_running` command that probes the local Ollama daemon via backend HTTP/curl headers, keeping the frontend 100% compliant with strict CSP.

---

## 4. Complete Brand Logo & Identity Integration

* **Source Asset**: [`logo.png`](../logo.png)
* **Native Desktop Assets**: Ran Tauri icon pipeline generating all resolutions in `src-tauri/icons/`:
  - `icon.ico` *(Embedded into Windows binaries and taskbar)*
  - `icon.icns` *(macOS App bundle)*
  - `32x32.png`, `64x64.png`, `128x128.png`, `128x128@2x.png`, `icon.png` *(Linux & window decorations)*
  - Windows Appx & Store logos (`StoreLogo.png`, `Square150x150Logo.png`, etc.)
  - Android & iOS launcher mipmaps
* **Application UI & Docs**:
  - `index.html`: Linked `/logo.png` as favicon.
  - `Sidebar.tsx`: Integrated `/logo.png` in top navigation brand.
  - `CodexOSDashboard.tsx`: Added brand logo alongside "Welcome to CodexOS v2".
  - `OnboardingWizard.tsx`: Added brand logo to initial setup step.
  - `README.md` & `ARCHITECTURE.md`: Updated header graphics.

---

## 5. Testing & Quality Assurance Summary

### Automated Test Matrix
| Suite | Target | Test Count | Status |
| :--- | :--- | :--- | :--- |
| **Cargo Unit Tests** | Rust Backend Core | 95 Tests | Pass |
| **Cargo Bindings Test** | Rust IPC Bindings | 1 Test | Pass |
| **Cargo Integration Tests** | End-to-End Rust Backend | 6 Tests (`tests/integration_test.rs`) | Pass |
| **Vitest Component Tests** | React Frontend Modules | 60+ Tests | Pass |
| **Playwright E2E Tests** | Desktop & UI Workflows | 6 Suites (`e2e/`) | Pass |

---

## 6. Production Deliverables (v2.1.0)

| Package | Path | Size | Description |
| :--- | :--- | :--- | :--- |
| **Standalone Executable** | `src-tauri/target/release/CodexOS.exe` | **37.1 MB** | Standalone portable executable with embedded icon and hardened security. |
| **Windows NSIS Setup** | `src-tauri/target/release/bundle/nsis/CodexOS_2.1.0_x64-setup.exe` | **11.3 MB** | Full Windows setup installer with start menu and desktop shortcuts. |
| **Windows MSI Package** | `src-tauri/target/release/bundle/msi/CodexOS_2.1.0_x64_en-US.msi` | **15.5 MB** | Windows Installer MSI package for managed enterprise deployment. |

---

## Related Documentation

- [System Architecture Guide](../ARCHITECTURE.md)
- [IPC API Reference](./API_REFERENCE.md)
- [Changelog](../CHANGELOG.md)
- [Enterprise Code Signing Runbook](./ENTERPRISE_GA_SIGNING.md)
