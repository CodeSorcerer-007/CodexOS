# ADR 001: Selection of Tauri v2 over Electron

## Status
Accepted

## Context
CodexOS requires a cross-platform desktop shell capable of executing low-level native system tasks (pty terminals, process monitoring, encrypted vaults, system stats) while rendering a fast, responsive UI.

## Decision
We chose **Tauri v2** with a React frontend over Electron.

## Rationale
1. **Resource Efficiency**: Tauri leverages the OS native webview (Wry/WebKit/WebView2) instead of bundling a full Chromium instance per app window. Startup RSS memory is ~30–40 MB vs ~200+ MB for Electron.
2. **Security Model**: Rust backend commands explicitly define exposed IPC endpoints. Unused native APIs are omitted at compile time.
3. **Native System Access**: High-performance system operations (file scanning, PTY management, ChaCha20 crypto) execute directly in Rust without Node.js native addon compilation overhead.

## Consequences
- Requires Rust tooling for desktop build pipeline.
- CSS/Layout must account for platform webview rendering differences.
