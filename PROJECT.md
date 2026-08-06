# PROJECT — Vaultly Production Readiness

## Architecture
Vaultly is a desktop developer toolkit built on Tauri v2 (Rust backend in `src-tauri/` and React 18 / TypeScript frontend in `src/`).
- Backend handles PTY multiplexing, SSH sessions, SQLite devdocs index, git operations, system metrics, port management, and HMAC signing.
- Frontend manages tabbed views, modal dialogs, global toast notifications, monaco/collaborative editor, and system profiling visualization.

## Feature Inventory
| # | Feature / Requirement | Description | Milestone | Source |
|---|-----------------------|-------------|-----------|--------|
| 1 | VaultModal infinite re-render (R1) | Move `setMode()` into useEffect | M2 | Survey Explorer 2 |
| 2 | Missing `get_top_processes_memory` (R1) | Register command in `lib.rs` invoke_handler | M1 | Survey Explorer 1 |
| 3 | Port 8080 panic in `ports.rs` (R1) | Replace `.unwrap()` on `Server::http()` with `?` | M1 | Survey Explorer 1 |
| 4 | Git clone thread panic in `git.rs` (R1) | Replace `.expect()` with error event emission | M1 | Survey Explorer 1 |
| 5 | SSH Command Injection in `ssh.rs` (R2) | Parameterize / escape metacharacters in SSH commands | M1 | Survey Explorer 1 |
| 6 | Devdocs SQL Injection in `devdocs.rs` (R2) | Use `rusqlite` parameterized queries | M1 | Survey Explorer 1 |
| 7 | Weak SSH host key checking in `tunnel.rs` (R2) | Change `StrictHostKeyChecking=no` to `accept-new` | M1 | Survey Explorer 1 |
| 8 | Cross-Platform PTY Shell (R7) | Runtime OS detection (`powershell.exe` vs `/bin/bash`) | M1 | Survey Explorer 1 |
| 9 | Cross-Platform Active Ports & Process Kill (R7) | Support Unix `lsof` / `kill -9` alongside Windows | M1 | Survey Explorer 1 |
| 10 | Cross-Platform Hosts File Path (R7) | `/etc/hosts` on Unix vs Windows drivers path | M1 & M4 | Survey Explorer 1 & 2 |
| 11 | Native Browser Dialog Replacement (R3) | Replace all 33 `alert()`, `confirm()`, `prompt()` calls | M2 | Survey Explorer 2 |
| 12 | Pervasive Toast Error Handling (R4) | Add try/catch + `showToast` to all 47 `invoke()` calls | M2 | Survey Explorer 2 |
| 13 | AutomationStudio Stub Cleanup (R5) | Add disabled "Coming Soon" state and disable fake PTY logs | M3 | Survey Explorer 3 |
| 14 | WASM Sandbox Honest State (R5) | Return `Err("WASM Sandbox not yet implemented")` & UI banner | M3 | Survey Explorer 1 & 3 |
| 15 | PluginMarketplace Banner (R5) | Replace fake listings with "Coming Soon" hero section | M3 | Survey Explorer 3 |
| 16 | ZKPVault Relabeling to HMAC Proof (R5) | Relabel all ZKP/Zero-Knowledge references in UI & Rust commands | M3 | Survey Explorer 1 & 3 |
| 17 | FileGrid Context Menu Listener (R6) | Add document click listener to close menu outside | M4 | Survey Explorer 2 |
| 18 | CollaborativeEditor Race Condition & Toast (R6) | Await content load before joinRoom; add save toast | M4 | Survey Explorer 2 |
| 19 | TreeMapOverlay Null Guard (R6) | Guard `root.children.length` before Recharts render | M4 | Survey Explorer 2 |
| 20 | CodeMetricsOverlay JSON Color (R6) | Fix invisible `#000000` text color to `#cb171e` | M4 | Survey Explorer 2 |
| 21 | PurgerModal Unchecked Default (R6) | Change default destructive selection to unchecked | M4 | Survey Explorer 2 |
| 22 | RegexRenamerModal Dry-Run Preview (R6) | Add live preview of match transformations before rename | M4 | Survey Explorer 2 |
| 23 | Modal Escape Key Dismissal (R6) | Add keydown handlers to dismiss all 6 main modals on Escape | M4 | Survey Explorer 2 |
| 24 | SettingsPage Path Validation (R6) | Validate path existence for default path setting | M4 | Survey Explorer 2 |
| 25 | EnvVarModal PATH Separator (R7) | Use `;` on Windows, `:` on Unix for PATH variable | M4 | Survey Explorer 2 |
| 26 | TypeScript & Rust Clean Build Verification | `npx tsc --noEmit` and `cargo build` pass cleanly | M5 | User Request |

## Milestones
| # | Name | Scope | Dependencies | Status |
|---|------|-------|-------------|--------|
| M1 | Backend Fixes (R1, R2, R7) | Fix Rust backend bugs, security vulnerabilities, and OS shell/port abstractions in `src-tauri/` | None | IN_PROGRESS |
| M2 | Frontend Bugs, Dialogs & Toast Error Handling (R1, R3, R4) | Fix VaultModal render loop, replace all native dialogs, add pervasive try/catch toasts across frontend | None | PLANNED |
| M3 | Stub Features & Mislabeled Functionality (R5) | Honest state for SandboxManager, PluginMarketplace, AutomationStudio, and HMAC Vault relabeling | M1, M2 | PLANNED |
| M4 | UI/UX Polish, Modals & Cross-Platform Frontend (R6, R7) | Fix FileGrid, CollaborativeEditor, overlays, modal Escape key dismiss, RegexRenamer dry-run, PATH separator | M2 | PLANNED |
| M5 | Build & Integration Verification | Run `npx tsc --noEmit` and `cargo build` in `src-tauri/` and conduct forensic audit | M1, M2, M3, M4 | PLANNED |

## Interface Contracts
- Backend command `get_top_processes_memory` returns `Result<Vec<ProcessMemoryInfo>, String>`.
- Backend command `generate_hmac_proof` and `verify_hmac_proof` (renamed from `generate_zkp_proof` and `verify_zkp_proof`).
- `run_wasi_nano_vm` command returns `Result<String, String>` where `Err("WASM Sandbox not yet implemented")` is returned on invocation.
- Toast notifications use `useToast()` hook or `useStore.getState().addToast({ type: 'error' | 'success' | 'info', message: string })`.

## Code Layout
- Backend Rust Code: `src-tauri/src/`
  - `lib.rs`: Tauri command registration and main handler setup
  - `ports.rs`: Port scanner, HTTP proxy server, active process killing
  - `git.rs`: Git CLI wrapper, clone thread execution
  - `ssh.rs`: SSH shell command builder and session manager
  - `devdocs.rs`: SQLite documentation search index
  - `tunnel.rs`: SSH tunnel manager and port forwarding
  - `multiplexer.rs`: PTY session manager
  - `system_tools.rs`: Host file parser, process management
  - `zkp.rs`: HMAC proof generation and verification
  - `plugin.rs`: WASI Sandbox execution engine
- Frontend React Code: `src/`
  - `components/VaultModal.tsx`: Vault mode switching
  - `components/VisualGit.tsx`: Visual git GUI
  - `components/EnvVarModal.tsx`: Environment variable editor modal
  - `components/DuplicateFinderModal.tsx`: Duplicate file cleaner
  - `components/AutomationStudio.tsx`: Command automation workflow
  - `components/SandboxManager.tsx`: WASM sandbox runner
  - `components/PluginMarketplace.tsx`: Plugin extension store
  - `components/ZKPVault.tsx`: HMAC vault component
  - `components/FileGrid.tsx`: File explorer view
  - `components/CollaborativeEditor.tsx`: Realtime collaborative code editor
  - `components/TreeMapOverlay.tsx`: Disk usage treemap
  - `components/CodeMetricsOverlay.tsx`: Code complexity profiler
  - `components/PurgerModal.tsx`: File purge cleanup modal
  - `components/RegexRenamerModal.tsx`: Batch regex file renamer
  - `components/SettingsPage.tsx`: Application settings
  - `components/HostsEditorModal.tsx`: Hosts file editor
