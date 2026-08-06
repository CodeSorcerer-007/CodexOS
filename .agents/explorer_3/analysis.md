# Codebase Survey and Technical Analysis: Requirement R5 (Stub & Mislabeled Features)

**Agent:** explorer_3  
**Date:** 2026-08-06  
**Target Project:** Vaultly (Tauri v2 Desktop App — Rust Backend + React/TypeScript Frontend)  
**Status:** Completed Analysis  

---

## Executive Summary

Requirement **R5** requires auditing and redesigning/relabeling four stub, fake, or mislabeled features across Vaultly's frontend and backend:
1. **`AutomationStudio`**: Assess whether to implement a real shell command recording/replay backend or add a clear disabled/coming soon state in the UI.
2. **`SandboxManager` / `run_wasi_nano_vm`**: Check backend & frontend for fake success strings; detail changes to display an honest "WASM Sandbox not yet implemented" state.
3. **`PluginMarketplace`**: Inspect fake static plugin listings and WebRTC download mock; detail changes for a "Plugin Marketplace — Coming Soon" banner.
4. **`ZKPVault` / `zkp.rs`**: Identify all occurrences of "ZKP", "Zero-Knowledge", and "zkp" across UI headers, labels, tooltips, variable names, and backend commands to relabel to "HMAC Vault" / "HMAC Proof Vault" (reflecting HMAC-SHA256 implementation).

---

## Detailed Item Survey & Analysis

### 1. `AutomationStudio`

#### Current Implementation Analysis
- **Frontend**: [`src/components/AutomationStudio.tsx`](file:///e:/Github/CodexOS/Vaultly/src/components/AutomationStudio.tsx)
  - Uses `reactflow` to present an interactive node pipeline graph initialized with mock nodes (`Start Pipeline`, `Run: npm test`, `Notify Success`).
  - Lines 33–58 (`runPipeline`): Iterates through nodes. For nodes starting with `Run:`, it attempts `await invoke('write_pty', { data: `${cmd}\r\n` })`.
  - Simulates fixed 1000ms delays between node executions (`await new Promise(r => setTimeout(r, 1000))`) and logs `"Pipeline completed successfully."` to the UI log pane regardless of actual command outcome.
- **Backend**: [`src-tauri/src/lib.rs`](file:///e:/Github/CodexOS/Vaultly/src-tauri/src/lib.rs#L70-L76)
  - `write_pty` expects a global PTY writer in state (`state.writer.lock().unwrap()`).
  - If no PTY session is active (i.e. user has not opened the TerminalMultiplexer view first), `state.writer` is `None`. `write_pty` returns `Ok(())` silently without executing anything!
  - `write_pty` does not return command execution output or exit status to caller.

#### Recommendation & Implementation Proposals
- **Assessment**: The visual graph layout in ReactFlow is effective UI framing, but executing background shell scripts without explicit user permission or PTY output capture is dangerous and unreliable.
- **Proposed Solution (Option A — Clear Disabled/Coming Soon UI State - Recommended)**:
  1. Add an informative status banner at top: `"Automation Studio — Coming Soon (Visual Workflow Engine)"`.
  2. Add a clear disclaimer badge: `"Execution Disabled in v1.0 — Experimental Flow Designer"`.
  3. Disable the `"Run Pipeline"` button or intercept execution to append an honest log: `"[System] Automation pipeline execution engine is coming soon in a future update."`.
- **Proposed Solution (Option B — Basic Command Execution Engine)**:
  1. Create a dedicated backend Rust command `run_automation_step(cmd: String)` using `std::process::Command`.
  2. Capture `stdout` / `stderr` and exit status, returning JSON results back to the frontend.

#### Affected Files & Line Numbers
- [`src/components/AutomationStudio.tsx`](file:///e:/Github/CodexOS/Vaultly/src/components/AutomationStudio.tsx): L28, L33–58, L72, L84–91.
- [`src/App.tsx`](file:///e:/Github/CodexOS/Vaultly/src/App.tsx): L54 (Sidebar item label/badge).

---

### 2. `SandboxManager` / `run_wasi_nano_vm`

#### Current Implementation Analysis
- **Backend**: [`src-tauri/src/plugin.rs`](file:///e:/Github/CodexOS/Vaultly/src-tauri/src/plugin.rs#L30-L33)
  ```rust
  #[tauri::command]
  pub fn run_wasi_nano_vm(path: String, mounted_dir: String) -> Result<String, String> {
      Ok(format!("WASI Nano-VM successfully executed and terminated: {}", path))
  }
  ```
  - **Fake Success String**: Returns `Ok("WASI Nano-VM successfully executed and terminated: ...")` without instantiating `wasmtime-wasi`, mounting host directories, or running WASM bytecode.
- **Frontend**: [`src/components/SandboxManager.tsx`](file:///e:/Github/CodexOS/Vaultly/src/components/SandboxManager.tsx)
  - Lines 9–24 (`executeSandbox`): Invokes `run_wasi_nano_vm` and appends the returned string directly to `logs`.
  - Header (Line 30–31): Claims `"Instantly boot lightweight WebAssembly VMs with strictly isolated host filesystem access."`

#### Detailed Changes Required
1. **Backend (`src-tauri/src/plugin.rs`)**:
   - Change `run_wasi_nano_vm` to return an explicit error result:
     ```rust
     #[tauri::command]
     pub fn run_wasi_nano_vm(_path: String, _mounted_dir: String) -> Result<String, String> {
         Err("WASM Sandbox (WASI Nano-VM) is not yet implemented in this release.".to_string())
     }
     ```
2. **Frontend (`src/components/SandboxManager.tsx`)**:
   - Add a prominent warning banner at the top of the component:
     ```tsx
     <div className="bg-amber-500/10 border border-amber-500/30 rounded-lg p-4 mb-4 text-amber-300 text-sm flex items-center gap-3">
       <AlertTriangle className="w-5 h-5 flex-shrink-0" />
       <div>
         <span className="font-bold">WASM Sandbox Not Yet Implemented:</span> WASI host filesystem isolation and VM execution support are under active development.
       </div>
     </div>
     ```
   - Update `executeSandbox` to catch the rejection and display the honest error message in both the execution log and a user-visible toast.
   - Disable the `"Boot Nano-VM"` button or mark it with a `"Coming Soon"` tag.

#### Affected Files & Line Numbers
- [`src-tauri/src/plugin.rs`](file:///e:/Github/CodexOS/Vaultly/src-tauri/src/plugin.rs): L30–33.
- [`src/components/SandboxManager.tsx`](file:///e:/Github/CodexOS/Vaultly/src/components/SandboxManager.tsx): L9–24, L30–32, L52–58, L64–74.

---

### 3. `PluginMarketplace`

#### Current Implementation Analysis
- **Frontend**: [`src/components/PluginMarketplace.tsx`](file:///e:/Github/CodexOS/Vaultly/src/components/PluginMarketplace.tsx)
  - Lines 12–16: Hardcoded mock plugin list `MOCK_P2P_PLUGINS` (`JSON Formatter`, `Log Analyzer`, `Hex Editor Plugin`).
  - Lines 23–31: `useEffect` with fake 2-second `setTimeout` simulating local P2P network scanning.
  - Lines 33–36 (`handleInstall`): Executes native browser `alert(`Successfully downloaded ${plugin.name} from peer ${plugin.peerId} over WebRTC!`);`. This is both a native alert violation (R3) and fake P2P download logic.
  - Header: `"P2P Plugin Marketplace"`.

#### Detailed Changes Required
1. **Remove Mock Data & Fake Logic**:
   - Delete `MOCK_P2P_PLUGINS`, fake scanning timer, and `handleInstall` native `alert()`.
2. **Render Honest "Coming Soon" View**:
   - Replace the fake installation grid with a stylized "Plugin Marketplace — Coming Soon" hero section.
   - Subtitle / Details: `"Peer-to-peer WASM plugin distribution, verification, and local WebRTC mesh discovery are under active development."`
   - Show preview cards with badges marked `"Under Development"` and buttons disabled with text `"Coming Soon"`.

#### Affected Files & Line Numbers
- [`src/components/PluginMarketplace.tsx`](file:///e:/Github/CodexOS/Vaultly/src/components/PluginMarketplace.tsx): L12–16, L23–31, L33–36, L42–49, L51–74.

---

### 4. `ZKPVault` / `zkp.rs` Relabeling

#### Current Implementation Analysis
- **Crypto Mechanics**: [`src-tauri/src/zkp.rs`](file:///e:/Github/CodexOS/Vaultly/src-tauri/src/zkp.rs) uses `ring::hmac` (HMAC-SHA256) to sign data + nonce.
- **Issue**: HMAC is a **symmetric cryptographic authentication mechanism**, NOT a Zero-Knowledge Proof (such as zk-SNARKs or Bulletproofs). Labeling this feature "ZKP Vault" or "Zero-Knowledge Proof" is misleading.

#### Comprehensive Occurrences & Relabeling Matrix

| Location / File | Current Text / Symbol | Proposed Relabeled Text / Symbol | Category |
|---|---|---|---|
| [`src/components/ZKPVault.tsx` L43](file:///e:/Github/CodexOS/Vaultly/src/components/ZKPVault.tsx#L43) | `ZKP Generator (Prover)` | `HMAC Proof Generator (Signer)` | UI Header |
| [`src/components/ZKPVault.tsx` L44](file:///e:/Github/CodexOS/Vaultly/src/components/ZKPVault.tsx#L44) | `Mathematically prove you possess a vault without transmitting it.` | `Generate HMAC-SHA256 cryptographic proofs for secret payloads.` | UI Subtitle |
| [`src/components/ZKPVault.tsx` L55](file:///e:/Github/CodexOS/Vaultly/src/components/ZKPVault.tsx#L55) | `Secret ZK Key` | `HMAC Secret Key` | UI Field Label |
| [`src/components/ZKPVault.tsx` L67](file:///e:/Github/CodexOS/Vaultly/src/components/ZKPVault.tsx#L67) | `Generate SNARK Proof` | `Generate HMAC Proof` | UI Button Text |
| [`src/components/ZKPVault.tsx` L73](file:///e:/Github/CodexOS/Vaultly/src/components/ZKPVault.tsx#L73) | `Generated Proof Hash` | `Generated HMAC Proof` | UI Label |
| [`src/components/ZKPVault.tsx` L82](file:///e:/Github/CodexOS/Vaultly/src/components/ZKPVault.tsx#L82) | `ZKP Verifier` | `HMAC Proof Verifier` | UI Header |
| [`src/components/ZKPVault.tsx` L83](file:///e:/Github/CodexOS/Vaultly/src/components/ZKPVault.tsx#L83) | `Verify a peer's vault commitment.` | `Verify payload signature using secret key.` | UI Subtitle |
| [`src/components/ZKPVault.tsx` L87](file:///e:/Github/CodexOS/Vaultly/src/components/ZKPVault.tsx#L87) | `Received Proof` | `Received HMAC Proof` | UI Label |
| [`src/components/ZKPVault.tsx` L103](file:///e:/Github/CodexOS/Vaultly/src/components/ZKPVault.tsx#L103) | `Verification Key` | `HMAC Secret Key` | UI Label |
| [`src/components/ZKPVault.tsx` L120](file:///e:/Github/CodexOS/Vaultly/src/components/ZKPVault.tsx#L120) | `✅ CRYPTOGRAPHIC PROOF VERIFIED` | `✅ HMAC PROOF VERIFIED` | UI Output |
| [`src/App.tsx` L59](file:///e:/Github/CodexOS/Vaultly/src/App.tsx#L59) | `label: 'ZKP Vault'` | `label: 'HMAC Vault'` | Sidebar Item Label |
| [`src/components/VaultlyDashboard.tsx` L151](file:///e:/Github/CodexOS/Vaultly/src/components/VaultlyDashboard.tsx#L151) | `ZKP` | `HMAC Proof` | Dashboard Stat Card |
| [`README.md` L30](file:///e:/Github/CodexOS/Vaultly/README.md#L30) | `ZKP Vault: Zero-Knowledge Proof based...` | `HMAC Vault: HMAC-SHA256 cryptographic proof verification...` | Documentation |
| [`src-tauri/src/zkp.rs` L6](file:///e:/Github/CodexOS/Vaultly/src-tauri/src/zkp.rs#L6) | `pub fn generate_zk_proof` | `pub fn generate_hmac_proof` (or alias) | Backend Command |
| [`src-tauri/src/zkp.rs` L27](file:///e:/Github/CodexOS/Vaultly/src-tauri/src/zkp.rs#L27) | `pub fn verify_zk_proof` | `pub fn verify_hmac_proof` (or alias) | Backend Command |
| [`src-tauri/src/lib.rs` L151–152](file:///e:/Github/CodexOS/Vaultly/src-tauri/src/lib.rs#L151) | `zkp::generate_zk_proof`, `zkp::verify_zk_proof` | `zkp::generate_hmac_proof`, `zkp::verify_hmac_proof` | Invoke Handler |

---

## Verification Plan

### Test & Verification Commands
1. **Frontend Type Check**:
   ```bash
   npx tsc --noEmit
   ```
2. **Backend Unit Tests**:
   ```bash
   cargo test -p app -- zkp::tests
   ```
3. **Backend Build**:
   ```bash
   cargo build --manifest-path src-tauri/Cargo.toml
   ```

### Manual Acceptance Verification Checklist
- [ ] `AutomationStudio`: View displays clear disabled / coming soon banner; no fake claims of successful execution.
- [ ] `SandboxManager`: UI shows "WASM Sandbox not yet implemented" banner; backend command returns `Err` instead of fake success string.
- [ ] `PluginMarketplace`: UI shows "Plugin Marketplace — Coming Soon" view; zero static mock listings or native `alert()` calls remain.
- [ ] `ZKPVault`: All references to ZKP, SNARK, Zero-Knowledge relabeled to HMAC Vault / HMAC Proof across UI, sidebar, dashboard, docs, and Rust commands.

---
