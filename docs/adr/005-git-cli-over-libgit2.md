# ADR 005: Git CLI Executable Wrapper over libgit2

## Status
Accepted

## Context
CodexOS requires deep integration with Git repositories (status, diffs, branch graph, staging, stashing, and remote fetch/pull/push). We evaluated using the `git2` Rust crate (native C bindings to libgit2) versus executing the system `git` CLI directly through a hardened process runner (`cli_runner.rs`).

## Decision
We chose to invoke the native **Git CLI** executable via [`cli_runner`](../../src-tauri/src/cli_runner.rs) rather than linking against `git2` / libgit2.

## Rationale
1. **Zero C Dependency Overhead**: Avoids complex C toolchain requirements (OpenSSL / libgit2 / cmake) across Windows MSVC, macOS universal binaries, and Linux environments.
2. **Native SSH & GPG Authentication**: Git CLI automatically respects the user's existing SSH agent (`ssh-agent`, Pageant, 1Password), GPG signing keys, and system credential helpers without custom reimplementation.
3. **Full Git Feature Surface**: Provides instant compatibility with all Git features, configuration flags, submodules, and worktrees without waiting for libgit2 API support.
4. **Process Isolation**: Git operations execute in isolated child processes with enforced timeouts, preventing memory leaks or segfaults from impacting the Tauri application process.

## Consequences
- **Prerequisite**: Requires `git` to be installed on the user's system PATH (detected on launch via `detect_tool`).
- **Parsing Overhead**: Output from commands such as `git status --porcelain=v2` must be parsed in Rust (`parse_git_status_output`), which is thoroughly covered by unit tests.
