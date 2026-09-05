# Security Policy

## Supported Versions

Security patches and advisory fixes are actively provided for the supported release branches of **CodexOS**:

| Major / Minor Version | Release Line | Supported Status |
| :--- | :--- | :--- |
| **2.1.x** | Current Production Release | :white_check_mark: Active Support |
| **2.0.x** | Previous Major Release | :white_check_mark: Maintenance Support |
| **< 2.0** | Legacy Prototype Releases | :x: Unsupported / End-of-Life |

---

## Security Architecture Overview

CodexOS is an offline-first native developer control-center built with **Tauri 2.0 (Rust backend)** and **React 19 (TypeScript frontend)**. Security is engineered at every layer:

- **Strict Sandbox Allowlist (`files.rs`):** All filesystem operations validate canonical paths against explicitly permitted workspace roots via `AllowedPathsState` and `dunce::canonicalize`. Relative path traversal (`..`), UNC tricks, and symlink escapes are strictly blocked.
- **Zero-Knowledge Secrets Vault (`secrets.rs` / `vault.rs`):** Master keys are derived with Argon2id ($m=65536\text{ KB}, t=3, p=1$, minimum 12 characters). Secrets are encrypted with ChaCha20-Poly1305 AEAD, and in-memory key buffers implement `zeroize::Zeroize` to scrub sensitive data upon lock or drop.
- **Persistent Brute-Force Lockout (`secrets.rs`):** Vault unlock attempts are tracked and persisted across app restarts with exponential backoff delays to neutralize offline dictionary attacks.
- **Enterprise SSRF Firewall (`proxy.rs`):** Outbound proxy requests strictly block:
  - Loopback addresses (`127.0.0.0/8`, `::1`)
  - RFC-1918 private subnets (`10.0.0.0/8`, `172.16.0.0/12`, `192.168.0.0/16`)
  - Carrier-Grade NAT (`100.64.0.0/10`)
  - Cloud provider metadata endpoints (`169.254.169.254`, `fd00:ec2::254`, `metadata.google.internal`)
  - Link-Local and Unique Local IPv6 ranges (`fe80::/10`, `fc00::/7`)
- **HMAC Commitment Proofs (`hmac_vault.rs`):** Secret verification uses deterministic HMAC-SHA256 commitments with constant-time equality checks (`subtle`) to eliminate timing side-channel attacks.
- **Content Security Policy (`tauri.conf.json`):** Strict CSP isolates the Webview from executing unauthorized remote scripts, eval operations, or untrusted network origins.
- **Process Isolation (`cli_runner.rs`):** CLI commands for Git and OpenSSH execute through direct process arguments without intermediate command shells, eliminating shell injection vectors.

For complete IPC command invariants, see [docs/API_REFERENCE.md](./docs/API_REFERENCE.md).

---

## Reporting a Vulnerability

If you discover a potential security vulnerability in CodexOS, please notify us responsibly:

1. **Do not file public GitHub issues, discussions, or pull requests for security vulnerabilities.**
2. Report the vulnerability privately via **[GitHub Security Advisories](https://github.com/CodeSorcerer-007/CodexOS/security/advisories/new)** or by email to **security@codexos.dev**.
3. Include comprehensive details to help us triage quickly:
   - Affected component or IPC command.
   - Operating system and environment (Windows, macOS, Linux).
   - Minimal reproduction steps, proof-of-concept (PoC) code, or payload.
   - Potential impact and CVSS assessment (if available).

### Response & Disclosure Timetable

- **Initial Acknowledgment:** Within 48 hours of receipt.
- **Triage & Severity Assessment:** Within 5 business days with an assigned tracking ID.
- **Patch Development & Coordination:** We coordinate fixes, test for regression, and notify the reporter prior to public release.
- **Public Attribution:** Reporters are credited in the security advisory release notes (unless anonymity is requested).
