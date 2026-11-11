# Architectural Decision Records (ADRs)

This directory documents the significant architectural, technology, and engineering decisions made during the evolution of **CodexOS**.

---

## ADR Index

| ADR | Title | Status | Decided Date | Summary |
| :--- | :--- | :--- | :--- | :--- |
| [001](./001-tauri-over-electron.md) | **Selection of Tauri v2 over Electron** | `Accepted` | 2025-05-10 | Chose Tauri 2 for 4x lower memory footprint, native Webview, and Rust memory safety. |
| [002](./002-zustand-state.md) | **Zustand for Centralized Application State** | `Accepted` | 2025-05-14 | Adopted Zustand with domain slices for zero boilerplate and out-of-React subscription access. |
| [003](./003-argon2-chacha20-vault.md) | **Cryptographic Architecture (Argon2id + ChaCha20-Poly1305)** | `Accepted` | 2025-05-20 | Selected Argon2id KDF and ChaCha20-Poly1305 AEAD for GPU-hardened offline encryption. |
| [004](./004-ipc-zod-validation.md) | **Runtime IPC Boundary Validation using Zod** | `Accepted` | 2025-06-02 | Enforced runtime validation on IPC responses to eliminate contract drift between Rust and TS. |
| [005](./005-git-cli-over-libgit2.md) | **Git CLI Executable Wrapper over libgit2** | `Accepted` | 2025-06-15 | Selected system Git CLI execution over `git2` crate for native SSH/GPG and zero C-binding overhead. |

---

## ADR Status Lifecycle

- **Proposed**: Under community review and evaluation.
- **Accepted**: Approved and actively implemented in the platform.
- **Superseded**: Replaced by a newer ADR (must link to the superseding document).
- **Deprecated**: Abandoned or no longer applicable.

---

## Proposing a New ADR

When making significant architectural changes (e.g., adding major runtime dependencies, altering cryptography, or modifying IPC patterns), submit an ADR as part of your pull request using this template:

```markdown
# ADR [Number]: [Descriptive Title]

## Status
[Proposed | Accepted | Superseded by ADR-XXX | Deprecated]

## Context
[Describe the problem, architectural context, requirements, and constraints.]

## Decision
[State the chosen solution clearly and decisively.]

## Rationale
[List why this option was selected over alternatives.]
1. [Reason 1]
2. [Reason 2]

## Consequences
- **Positive**: [Advantages gained.]
- **Negative / Trade-offs**: [Costs, prerequisites, or operational trade-offs incurred.]
```
