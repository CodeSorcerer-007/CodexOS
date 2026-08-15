# Contributing to CodexOS

Thanks for your interest in contributing. Below is everything you need to get started.

---

## Prerequisites

| Tool | Version |
|---|---|
| Node.js | ≥ 20 (see `.nvmrc`) |
| Rust | latest stable (`rustup update`) |
| Windows MSVC build tools | Visual Studio Build Tools 2022 |

---

## Local Development

```bash
# Clone
git clone https://github.com/CodeSorcerer-007/CodexOS.git
cd CodexOS

# Install frontend deps
npm install

# Start dev server (Tauri + Vite with hot-reload)
npm run tauri dev
```

---

## Running Tests

```bash
# Frontend component tests (Vitest)
npm test

# Rust unit + property-based tests
cd src-tauri && cargo test

# Rust static analysis
cd src-tauri && cargo clippy -- -D warnings

# Frontend lint
npm run lint
```

All of the above must pass before submitting a PR. The CI pipeline enforces this automatically.

---

## Testing Requirements

- **Frontend**: All new UI components must include a co-located or `__tests__` Vitest test file covering initial render, user interaction, error boundary handling, and ARIA accessibility roles.
- **Rust Backend**: Every `#[tauri::command]` and core subsystem function must include unit tests in a `#[cfg(test)] mod tests` block.
- **Security Invariants**: Any change affecting cryptographic keys, path sandboxing, or proxy filtering must include a regression test in `src-tauri/tests/integration_test.rs`.
- **Coverage**: Total line and branch coverage must not decrease on any PR.

---

## Project Structure & Architecture

See [ARCHITECTURE.md](./ARCHITECTURE.md) for a comprehensive breakdown of the system layers, IPC contract, security threat model, and SQLite data durability design.

```
src/                   React frontend (components, stores, hooks, IPC)
src-tauri/src/         Rust backend (Tauri 2 commands, vault, proxy, PTY)
src-tauri/capabilities/ Tauri 2.0 IPC capability grants
.github/workflows/     CI & Release automation pipelines
```

---

## Pull Request Guidelines

1. **Branch off `main`** — name your branch `feat/<topic>` or `fix/<topic>`.
2. **One concern per PR** — keep changes focused and reviewable.
3. **Write tests** for new Rust commands and non-trivial React components.
4. **Keep commits atomic** — each commit should build and pass tests on its own.
5. **Update the README** if you add a new module or change the architecture.
6. **No secrets in commits** — use the Secrets Vault for any API keys.

---

## Security Issues

Please do **not** file public issues for security vulnerabilities. Email the maintainers directly or open a private security advisory on GitHub.

---

## Code Style

- **Rust**: `cargo fmt` + `cargo clippy` must produce zero warnings.
- **TypeScript/React**: `npm run lint` (oxlint) must produce zero errors. Use named exports. Avoid `any`.
- **CSS**: Tailwind utility classes only — no raw CSS unless adding a design-token to the existing CSS custom property sheet.
