# Contributing to CodexOS

Thank you for your interest in contributing to **CodexOS**! This guide outlines our development workflow, coding standards, testing requirements, and pull request guidelines.

---

## Prerequisites

Ensure you have the following toolchains installed:

| Tool | Required Version | Verification Command |
| :--- | :--- | :--- |
| **Node.js** | $\ge 20$ (see `.nvmrc`) | `node --version` |
| **Rust** | Latest stable ($\ge 1.77$) | `rustc --version` |
| **C++ Build Tools** | Visual Studio Build Tools 2022 (Windows) or `build-essential` (Linux) | System check |
| **Git** | $\ge 2.30$ | `git --version` |

---

## Local Development Setup

```bash
# 1. Fork and clone the repository
git clone https://github.com/CodeSorcerer-007/CodexOS.git
cd CodexOS

# 2. Install frontend dependencies
npm install

# 3. Launch Tauri development desktop app (Vite HMR + Rust Backend)
npm run tauri dev
```

---

## Quality & Testing Gates

All pull requests must pass the automated test and linting gates before they can be merged. Run these locally prior to opening a PR:

```bash
# 1. Run ultra-fast linter (oxlint)
npm run lint

# 2. Run TypeScript typecheck
npx tsc -b

# 3. Run frontend component & unit tests (Vitest)
npm test

# 4. Run Rust unit and integration tests
cd src-tauri && cargo test

# 5. Run Rust linter (Clippy)
cd src-tauri && cargo clippy -- -D warnings

# 6. Check Rust code formatting
cd src-tauri && cargo fmt --check
```

---

## Git Workflow & Commit Standards

We enforce [Conventional Commits](https://www.conventionalcommits.org/en/v1.0.0/) for clear, automated release changelogs.

### Branch Naming
- Features: `feat/<short-description>` (e.g., `feat/terminal-color-picker`)
- Bug Fixes: `fix/<short-description>` (e.g., `fix/proxy-ssrf-ipv6`)
- Documentation: `docs/<short-description>` (e.g., `docs/add-api-endpoints`)
- Refactoring: `refactor/<short-description>` (e.g., `refactor/zustand-tabs-slice`)

### Commit Types
| Type | Purpose | Example |
| :--- | :--- | :--- |
| `feat` | Introduces a new feature | `feat(vault): add auto-lock timer option` |
| `fix` | Fixes a bug | `fix(terminal): prevent cursor clipping on resize` |
| `docs` | Documentation changes only | `docs(api): update proxy replay arguments` |
| `refactor` | Code restructuring with no behavior change | `refactor(proxy): streamline stream buffering` |
| `perf` | A code change that improves performance | `perf(files): batch stat lookups for directory treemap` |
| `test` | Adding or updating tests | `test(vault): add fast-check unlock property tests` |
| `chore` | Dependency bumps or build tool updates | `chore(deps): update tauri to 2.11.3` |
| `ci` | Changes to CI workflows or scripts | `ci(github): cache cargo registry across runners` |

---

## Testing Standards

- **Frontend Components**: All non-trivial UI modules must include tests (`.test.tsx`) asserting render states, user interaction events, keyboard navigation, and error boundary isolation.
- **Rust Backend**:
  - Every `#[tauri::command]` handler must include unit tests within a `#[cfg(test)] mod tests` block.
  - Changes touching security boundaries (`AllowedPathsState`, `secrets.rs`, `proxy.rs`) must include regression tests in `src-tauri/tests/integration_test.rs`.
- **Zero Coverage Regression**: PRs should maintain or increase existing test coverage.

---

## Pull Request Submission Checklist

When opening a Pull Request:
1. **Branch off `main`** and keep commits atomic and descriptive.
2. Fill out the **[Pull Request Template](.github/PULL_REQUEST_TEMPLATE.md)** completely.
3. Ensure `npm run lint`, `npm test`, and `cargo test` pass with **zero warnings and zero errors**.
4. Update relevant documentation in `docs/` or `ARCHITECTURE.md` if your PR modifies architecture, configuration, or IPC commands.
5. If introducing a major architectural or security change, include an **[ADR](docs/adr/README.md)**.
6. **Never commit credentials, API keys, or personal tokens**.

---

## Security Vulnerabilities

Please **do not** report security vulnerabilities via public GitHub issues. Follow the confidential disclosure procedure documented in our **[SECURITY.md](./SECURITY.md)**.
