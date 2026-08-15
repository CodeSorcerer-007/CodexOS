# Security Policy

## Supported Versions

We release patches and security fixes for the active major release versions of CodexOS.

| Version | Supported          |
| ------- | ------------------ |
| 2.0.x   | :white_check_mark: |
| < 2.0   | :x:                |

---

## Security Architecture Overview

CodexOS is an offline-first native developer control-center built with **Tauri 2.0 (Rust backend)** and **React 19 (TypeScript frontend)**. Security is engineered at every layer:

- **Strict Sandbox Allowlist (`files.rs`):** All filesystem operations validate canonical paths against explicitly permitted workspace roots. Relative path traversal and symlink escapes are strictly blocked.
- **Zero-Knowledge Secrets Vault (`secrets.rs` / `vault.rs`):** Master keys are derived with Argon2id ($m=65536, t=3, p=1$), secrets encrypted with ChaCha20-Poly1305 with zeroized memory buffers (`zeroize`).
- **Brute-Force Lockout (`secrets.rs`):** Vault unlock attempts are tracked and persisted across app restarts to prevent offline dictionary/brute-force attacks.
- **SSRF Protection (`proxy.rs`):** HTTP interceptor filters local loopback (`127.0.0.1`, `localhost`, `::1`) and metadata IPs (`169.254.169.254`) unless explicitly whitelisted.
- **Content Security Policy (`tauri.conf.json`):** Strict CSP isolating the Webview from executing arbitrary external scripts.

---

## Reporting a Vulnerability

If you discover a security vulnerability in CodexOS, please report it responsibly:

1. **Do not create a public GitHub Issue.**
2. Email the maintainer directly at **security@codexos.dev** or submit a private security advisory through GitHub: [GitHub Security Advisories](https://github.com/CodeSorcerer-007/CodexOS/security/advisories/new).
3. Include detailed steps to reproduce the vulnerability, including platform information (Windows, macOS, Linux), attack scenario, and potential impact.

### What to Expect

- **Acknowledgment:** Within 48 hours of your report.
- **Triage & Assessment:** Within 5 business days with an initial severity rating (CVSS).
- **Fix & Disclosure:** We will coordinate a patch release and credit you in the security release notes (unless you request anonymity).
