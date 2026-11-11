# CodexOS IPC API Reference Specification

This document provides the authoritative, exhaustive specification for all **129 Tauri IPC commands** exposed by the CodexOS Rust backend to the TypeScript/React frontend.

All IPC commands are registered in [`src-tauri/src/commands.rs`](../src-tauri/src/commands.rs) and invoked across the capability-secured Tauri 2 bridge.

---

## Architecture & Security Invariants

1. **Capability Boundary**: IPC commands require explicit permission grants in `src-tauri/capabilities/default.json`.
2. **Canonical Path Sandboxing**: Filesystem operations are validated against `AllowedPathsState` using `dunce::canonicalize`. Symlink escapes, path traversals (`..`), and UNC tricks are rejected with `AppError::AccessDenied`.
3. **SSRF Filtering**: Network and proxy requests filter destination IPs against loopback (`127.0.0.0/8`, `::1`), RFC-1918 private subnets, Carrier-Grade NAT (`100.64.0.0/10`), link-local/ULA, and cloud metadata endpoints (`169.254.169.254`, `metadata.google.internal`).
4. **Zeroized Memory**: In-memory secrets and master key derivations implement `zeroize::Zeroize` to scrub sensitive data upon lock or drop.
5. **Runtime Validation (Zod)**: In the frontend (`src/ipc.ts`), response payloads pass through runtime Zod schemas to guarantee contract integrity.

---

## Quick Navigation

- [1. Filesystem & Path Sandboxing (`files.rs`)](#1-filesystem--path-sandboxing-filesrs)
- [2. Filesystem Watcher (`fs_cache.rs`)](#2-filesystem-watcher-fs_cachers)
- [3. Secrets Manager & Key Derivation (`secrets.rs`)](#3-secrets-manager--key-derivation-secretsrs)
- [4. Archive Vault Encryption (`vault.rs`)](#4-archive-vault-encryption-vaultrs)
- [5. HMAC Commitment Vault (`hmac_vault.rs`)](#5-hmac-commitment-vault-hmac_vaultrs)
- [6. Visual Git Client (`git.rs`)](#6-visual-git-client-gitrs)
- [7. Terminal Multiplexer & PTY (`multiplexer.rs`)](#7-terminal-multiplexer--pty-multiplexerrs)
- [8. Network Interceptor & SSRF Firewall (`proxy.rs`)](#8-network-interceptor--ssrf-firewall-proxyrs)
- [9. SQLite Key-Value Persistence (`kv.rs`)](#9-sqlite-key-value-persistence-kvrs)
- [10. Database Studio (`db.rs`)](#10-database-studio-dbrs)
- [11. System Diagnostics & Health (`diagnostics.rs`)](#11-system-diagnostics--health-diagnosticsrs)
- [12. WebAssembly & WASI Plugin Sandbox (`plugin.rs`)](#12-webassembly--wasi-plugin-sandbox-pluginrs)
- [13. System Telemetry & Native Window Controls (`sys.rs`)](#13-system-telemetry--native-window-controls-sysrs)
- [14. Docker Daemon Bridge (`docker.rs`)](#14-docker-daemon-bridge-dockerrs)
- [15. System Developer Tools (`system_tools.rs`)](#15-system-developer-tools-system_toolsrs)
- [16. Network Ports & HTTP Client (`ports.rs`)](#16-network-ports--http-client-portsrs)
- [17. Remote SSH Client (`ssh.rs`)](#17-remote-ssh-client-sshrs)
- [18. Reverse Port Tunneling (`tunnel.rs`)](#18-reverse-port-tunneling-tunnelrs)
- [19. AI Root-Cause Copilot (`ai.rs`)](#19-ai-root-cause-copilot-airs)
- [20. Archive & Compression (`archive.rs`)](#20-archive--compression-archivers)
- [21. Cryptographic Utilities & Data Converters (`crypto_tools.rs`)](#21-cryptographic-utilities--data-converters-crypto_toolsrs)
- [22. Offline Documentation (`devdocs.rs`)](#22-offline-documentation-devdocsrs)

---

## 1. Filesystem & Path Sandboxing (`files.rs`)

| Command | Arguments | Return Type | Description | Security Invariants |
| :--- | :--- | :--- | :--- | :--- |
| `get_drives` | None | `Vec<DriveInfo>` | Lists mounted system drives and volumes. | Read-only disk enumeration. |
| `get_current_dir` | None | `String` | Returns canonical current working directory. | Path canonicalization. |
| `get_allowed_paths` | None | `Vec<String>` | Lists all active sandbox workspace roots. | Sandboxing state inspection. |
| `add_allowed_path` | `path: String` | `()` | Adds canonicalized directory to allowed sandbox roots. | Directory must exist and resolve canonically. |
| `remove_allowed_path` | `path: String` | `()` | Removes directory from allowed sandbox roots. | Restricts sandbox boundary. |
| `get_files_in_dir` | `path: String` | `Vec<FileInfo>` | Lists files and directories with metadata. | Validated against `AllowedPathsState`. |
| `read_file_text` | `path: String` | `String` | Reads UTF-8 text file contents. | Validated against `AllowedPathsState`. |
| `write_file_text` | `path: String, content: String` | `()` | Writes text content to file. | Validated against `AllowedPathsState`. |
| `read_file_binary` | `path: String` | `Vec<u8>` | Reads raw binary file bytes. | Validated against `AllowedPathsState`. |
| `write_file_binary_webrtc` | `path: String, data: Vec<u8>` | `()` | Writes binary data stream (P2P file transfer). | Validated against `AllowedPathsState`. |
| `create_file` | `path: String` | `()` | Creates a new empty file. | Validated against `AllowedPathsState`. |
| `create_directory` | `path: String` | `()` | Recursively creates directories. | Validated against `AllowedPathsState`. |
| `rename_path` | `old_path: String, new_path: String` | `()` | Renames a file or folder. | Both paths validated against sandbox. |
| `copy_file` | `src: String, dst: String` | `()` | Copies a file to destination path. | Both paths validated against sandbox. |
| `move_file` | `src: String, dst: String` | `()` | Moves a file to destination path. | Both paths validated against sandbox. |
| `delete_file` | `path: String` | `()` | Safely sends file to system trash/recycle bin. | Validated against `AllowedPathsState`. |
| `bulk_rename` | `path: String, pattern: String, replacement: String` | `Vec<String>` | Regex batch file rename within folder. | Validated against `AllowedPathsState`. |
| `scan_dev_bloat` | `path: String` | `Vec<BloatFolder>` | Detects build artifacts (`node_modules`, `target`). | Path must be inside sandbox. |
| `purge_directories` | `paths: Vec<String>` | `u64` | Purges selected bloat directories; returns bytes freed. | All paths strictly validated against sandbox. |
| `get_code_metrics` | `path: String` | `CodeMetrics` | Computes lines of code, comments, and file breakdown. | Path must be inside sandbox. |
| `get_treemap_data` | `path: String, max_depth: u8` | `TreeMapNode` | Computes recursive disk usage hierarchy. | Depth-capped (max 8) to prevent recursion exhaustion. |
| `find_duplicates` | `path: String` | `Vec<DuplicateGroup>` | Detects duplicate files using 2-pass SHA-256 hash. | Path must be inside sandbox. |

---

## 2. Filesystem Watcher (`fs_cache.rs`)

| Command | Arguments | Return Type | Description | Security Invariants |
| :--- | :--- | :--- | :--- | :--- |
| `start_fs_watch` | `path: String` | `()` | Spawns non-blocking file watcher emitting `fs-change`. | Must be inside `AllowedPathsState`. |
| `stop_fs_watch` | None | `()` | Halts active background directory watcher. | State-managed thread shutdown. |

---

## 3. Secrets Manager & Key Derivation (`secrets.rs`)

| Command | Arguments | Return Type | Description | Security Invariants |
| :--- | :--- | :--- | :--- | :--- |
| `unlock_vault` | `password: String` | `bool` | Unlocks secrets vault using Argon2id master key. | Minimum 12 characters; persistent exponential lockout. |
| `lock_vault` | None | `()` | Locks vault and scrubs RAM buffers. | Invokes `zeroize::Zeroize` on master key. |
| `is_vault_locked` | None | `bool` | Returns true if master key is locked/absent from RAM. | Non-disclosing memory state check. |
| `add_secret` | `key: String, value: String` | `()` | Encrypts secret via ChaCha20-Poly1305 in memory. | Requires unlocked vault; zeroizes plaintext. |
| `remove_secret` | `key: String` | `()` | Removes secret key from memory. | Requires unlocked vault. |
| `has_secret` | `key: String` | `bool` | Checks if key exists without disclosing value. | Constant-time metadata check. |
| `list_secret_keys` | None | `Vec<String>` | Lists stored secret identifiers (keys only). | Requires unlocked vault; values never disclosed. |
| `export_secrets_to_env` | `output_path: String` | `()` | Writes decrypted secrets to `.env` file with warning. | Path strictly validated against `AllowedPathsState`. |
| `run_with_secrets` | `command: String, args: Vec<String>` | `String` | Runs child process with injected vault environment. | Direct process spawn without intermediate shell. |

---

## 4. Archive Vault Encryption (`vault.rs`)

| Command | Arguments | Return Type | Description | Security Invariants |
| :--- | :--- | :--- | :--- | :--- |
| `encrypt_vault` | `path: String, password: String, out_path: String` | `()` | Creates Argon2id + ChaCha20-Poly1305 encrypted archive. | Min 12-char passphrase; AEAD authentication tag. |
| `decrypt_vault` | `vault_path: String, password: String, dest_dir: String` | `()` | Decrypts archive to directory with safety extraction. | Anti-zip-bomb extraction limits; sandbox checked. |

---

## 5. HMAC Commitment Vault (`hmac_vault.rs`)

| Command | Arguments | Return Type | Description | Security Invariants |
| :--- | :--- | :--- | :--- | :--- |
| `generate_hmac_proof` | `message: String, secret: String` | `HmacProof` | Generates SHA-256 HMAC cryptographic commitment. | High-entropy secret validation. |
| `verify_hmac_proof` | `message: String, signature: String, secret: String` | `bool` | Verifies commitment authenticity. | Constant-time comparison (`subtle`) to prevent timing attacks. |

---

## 6. Visual Git Client (`git.rs`)

*CodexOS invokes the Git CLI executable natively via [`cli_runner`](../src-tauri/src/cli_runner.rs) with strict parameter separation to prevent shell injection.*

| Command | Arguments | Return Type | Description | Security Invariants |
| :--- | :--- | :--- | :--- | :--- |
| `get_git_status` | `path: String` | `GitStatusResult` | Parsed staged, unstaged, untracked files & branch. | Path must be inside `AllowedPathsState`. |
| `search_contents` | `path: String, query: String` | `Vec<SearchResult>` | Multi-file regex query across repository. | Path must be inside `AllowedPathsState`. |
| `git_action` | `path: String, action: String, file: String, message: String` | `String` | Executes git stage, unstage, commit, or discard. | Action whitelist; safe argument quoting. |
| `git_history` | `path: String, limit: u32` | `Vec<GitCommitInfo>` | Retrieves commit log history. | Limit capped (max 500) to prevent memory spikes. |
| `git_show` | `path: String, hash: String` | `String` | Retrieves commit diff patch and author metadata. | Hash format validated (`[a-f0-9]{7,40}`). |
| `get_branches` | `path: String` | `Vec<BranchInfo>` | Lists local and remote repository branches. | Path must be inside `AllowedPathsState`. |
| `git_checkout` | `path: String, branch: String` | `()` | Checks out branch or revision. | Branch name sanitized against flag injection. |
| `git_create_branch` | `path: String, branch: String` | `()` | Creates and switches to a new Git branch. | Branch name sanitized against flag injection. |
| `git_pull` | `path: String` | `String` | Pulls remote changes into current branch. | Non-interactive execution; credential helper isolation. |
| `git_fetch` | `path: String` | `String` | Fetches remote repository metadata. | Non-interactive execution. |
| `get_file_diff` | `path: String, file: String` | `String` | Computes working tree file diff. | Path and file validated against sandbox. |
| `get_staged_diff` | `path: String` | `String` | Computes staged index diff. | Path must be inside `AllowedPathsState`. |
| `get_recent_commit_diff` | `path: String` | `String` | Computes diff of the HEAD commit. | Path must be inside `AllowedPathsState`. |
| `git_clone` | `url: String, path: String` | `()` | Clones remote repository into local target. | Destination validated against `AllowedPathsState`. |
| `git_stash` | `path: String` | `String` | Stashes uncommitted working tree changes. | Path must be inside `AllowedPathsState`. |
| `git_stash_pop` | `path: String` | `String` | Applies and removes the latest stash entry. | Path must be inside `AllowedPathsState`. |

---

## 7. Terminal Multiplexer & PTY (`multiplexer.rs`)

| Command | Arguments | Return Type | Description | Security Invariants |
| :--- | :--- | :--- | :--- | :--- |
| `start_multiplex_pty` | `id: String, shell: Option<String>, cwd: Option<String>` | `()` | Spawns pseudo-terminal bridge via `portable-pty`. | Whitelisted system shells (`powershell`, `cmd`, `bash`, `zsh`). |
| `resize_multiplex_pty` | `id: String, cols: u16, rows: u16` | `()` | Resizes terminal grid dimensions. | Dimensions bounded (`cols <= 500`, `rows <= 200`). |
| `write_multiplex_pty` | `id: String, data: String` | `()` | Streams input characters to PTY stdin. | Session ID validated against active table. |
| `kill_multiplex_pty` | `id: String` | `()` | Sends termination signal to child process. | Safely reaps OS process handles. |

---

## 8. Network Interceptor & SSRF Firewall (`proxy.rs`)

| Command | Arguments | Return Type | Description | Security Invariants |
| :--- | :--- | :--- | :--- | :--- |
| `start_proxy` | `port: u16` | `u16` | Starts local HTTP/HTTPS intercepting proxy. | Binds to `127.0.0.1` only. |
| `stop_proxy` | None | `()` | Stops active HTTP intercepting proxy server. | Graceful server listener shutdown. |
| `is_proxy_running` | None | `bool` | Returns running status of the interceptor. | State check. |
| `get_captured_requests` | None | `Vec<CapturedRequest>` | Reads captured HTTP request/response entries. | Bounded rolling log query (max 500 entries). |
| `clear_captured_requests` | None | `()` | Clears recorded HTTP request database table. | Parameterized SQLite deletion. |
| `replay_request` | `url: String, method: String, headers: Vec<(String, String)>, body: Option<String>` | `HttpResponse` | Replays HTTP request through SSRF firewall. | Filtered against private IPs, CGNAT, loopback, and metadata. |
| `set_proxy_whitelist` | `hosts: Vec<String>` | `()` | Sets whitelisted hosts for bypass. | Hostnames normalized and validated. |
| `get_proxy_whitelist` | None | `Vec<String>` | Returns active proxy whitelist rules. | State check. |

---

## 9. SQLite Key-Value Persistence (`kv.rs`)

| Command | Arguments | Return Type | Description | Security Invariants |
| :--- | :--- | :--- | :--- | :--- |
| `kv_set` | `key: String, value: String` | `()` | Persists key-value pair in SQLite database. | WAL journal mode; parameterized SQL query. |
| `kv_get` | `key: String` | `Option<String>` | Retrieves persisted value by key. | Parameterized query; SQL injection proof. |
| `get_db_migration_status` | None | `MigrationStatus` | Inspects local database schema migration level. | Safe read-only schema query. |

---

## 10. Database Studio (`db.rs`)

| Command | Arguments | Return Type | Description | Security Invariants |
| :--- | :--- | :--- | :--- | :--- |
| `query_sqlite` | `path: String, query: String` | `SqliteResult` | Executes SQL on local SQLite database file. | Path must be inside `AllowedPathsState`. |
| `query_database` | `url: String, query: String` | `Vec<Record<String, Value>>` | Generic SQL database query (Postgres/MySQL/SQLite). | Connection string sanitized; query timeout enforced. |

---

## 11. System Diagnostics & Health (`diagnostics.rs`)

| Command | Arguments | Return Type | Description | Security Invariants |
| :--- | :--- | :--- | :--- | :--- |
| `get_diagnostics_summary` | None | `DiagnosticsSummary` | Aggregates system health, memory, and error stats. | Local metrics only; zero remote telemetry. |
| `set_local_diagnostics_enabled` | `enabled: bool` | `()` | Toggles local error and crash dump collection. | Stored in local settings slice. |
| `export_system_report` | None | `String` | Generates sanitized markdown diagnostic report. | All personal directories and tokens redacted. |
| `clear_crash_dumps` | None | `()` | Clears local crash dumps and panic log files. | Scoped strictly to application data directory. |

---

## 12. WebAssembly & WASI Plugin Sandbox (`plugin.rs`)

| Command | Arguments | Return Type | Description | Security Invariants |
| :--- | :--- | :--- | :--- | :--- |
| `run_wasm_plugin` | `path: String` | `String` | Executes pure WebAssembly plugin in Wasmtime. | Zero host filesystem or network access by default. |
| `run_wasi_nano_vm` | `path: String` | `String` | Executes WASI module within capability boundary. | Scoped WASI capabilities and memory quota. |
| `execute_marketplace_plugin` | `plugin_id: String, payload: String` | `String` | Executes verified marketplace plugin. | Plugin signature checked before invocation. |

---

## 13. System Telemetry & Native Window Controls (`sys.rs`)

| Command | Arguments | Return Type | Description | Security Invariants |
| :--- | :--- | :--- | :--- | :--- |
| `get_sys_stats` | None | `SysStats` | Real-time CPU, RAM, disk, and network telemetry. | Read-only kernel metric polling via `sysinfo`. |
| `get_api_version` | None | `String` | Returns native Rust backend semantic version (`2.1.0`). | Static version string. |
| `get_top_processes_memory` | `limit: usize` | `Vec<ProcessInfo>` | Returns top processes sorted by RSS memory. | Limit capped (max 100); sanitized process names. |
| `get_gpu_info` | None | `Vec<GpuInfo>` | Returns detected GPU hardware adapters. | Read-only adapter query. |
| `get_gpu_utilization` | None | `Vec<GpuUtilization>` | Real-time GPU processor and VRAM utilization. | Read-only telemetry query. |
| `window_minimize` | None | `()` | Minimizes the native desktop window. | Tauri window handle operation. |
| `window_toggle_maximize` | None | `()` | Toggles window between maximized and restored. | Tauri window handle operation. |
| `window_close` | None | `()` | Closes the application gracefully. | Invokes orderly app teardown. |

---

## 14. Docker Daemon Bridge (`docker.rs`)

| Command | Arguments | Return Type | Description | Security Invariants |
| :--- | :--- | :--- | :--- | :--- |
| `get_docker_containers` | None | `Vec<DockerContainer>` | Queries containers via local Docker socket / pipe. | Read-only daemon inspection. |
| `docker_action` | `container_id: String, action: String` | `String` | Executes start, stop, restart, pause, unpause. | Action whitelist; hex container ID validated. |
| `stream_docker_logs` | `container_id: String, tail_lines: u32` | `()` | Streams container logs to `docker-log` event. | Tail lines capped; container ID validated. |
| `get_docker_images` | None | `Vec<DockerImage>` | Lists cached local Docker images. | Read-only daemon inspection. |
| `docker_pull_image` | `image: String` | `()` | Pulls container image from container registry. | Image tag sanitized against command injection. |
| `docker_remove_image` | `image_id: String` | `String` | Removes local Docker image. | Image ID format validated. |
| `get_container_stats` | `container_id: String` | `ContainerStats` | Fetches live CPU and memory utilization. | Non-blocking telemetry query. |
| `docker_inspect` | `container_id: String` | `String` | Fetches JSON inspection document for container. | Container ID format validated. |

---

## 15. System Developer Tools (`system_tools.rs`)

| Command | Arguments | Return Type | Description | Security Invariants |
| :--- | :--- | :--- | :--- | :--- |
| `detect_tool` | `tool: String` | `bool` | Checks if CLI binary (`git`, `docker`, `ollama`) is on PATH. | Whitelisted tool names only. |
| `is_ollama_running` | None | `bool` | Probes local Ollama daemon on loopback port 11434. | HTTP probe from backend avoiding CSP violations. |
| `get_os_info` | None | `OsInfo` | Returns platform name, kernel version, arch, hostname. | Read-only system inspection. |
| `get_env_vars` | None | `Vec<EnvVar>` | Lists current process environment variables. | System inspection. |
| `set_env_var` | `key: String, value: String` | `()` | Sets environment variable for CodexOS process. | Key sanitized against invalid characters. |
| `delete_env_var` | `key: String` | `()` | Removes environment variable from CodexOS process. | Key sanitized against invalid characters. |
| `get_services` | None | `Vec<ServiceInfo>` | Enumerates background system services. | Platform-specific service query. |
| `manage_service` | `service: String, action: String` | `()` | Starts, stops, or restarts service. | Action whitelist; service name validated. |
| `get_project_tasks` | `path: String` | `Vec<ProjectTask>` | Parses package.json, Makefile, Cargo.toml build tasks. | Path must be inside `AllowedPathsState`. |
| `list_wsl_distros` | None | `Vec<String>` | Lists installed WSL distributions (Windows only). | Read-only enumeration via `wsl.exe -l -q`. |
| `execute_command` | `command: String, args: Vec<String>, cwd: Option<String>` | `CommandResult` | Executes system CLI process with stdout/stderr capture. | Non-shell command execution; cwd validated. |
| `read_hosts` | None | `String` | Reads OS hosts file. | Read-only hosts access. |
| `write_hosts` | `content: String` | `()` | Updates OS hosts file with elevated privileges. | Explicit write protection; backups created. |
| `install_font` | `path: String` | `()` | Registers TTF/OTF font in OS font registry. | Path must be inside `AllowedPathsState`. |

---

## 16. Network Ports & HTTP Client (`ports.rs`)

| Command | Arguments | Return Type | Description | Security Invariants |
| :--- | :--- | :--- | :--- | :--- |
| `get_active_ports` | None | `Vec<PortInfo>` | Scans listening TCP/UDP ports and owning PIDs. | Read-only network stack inspection. |
| `kill_process` | `pid: u32` | `()` | Sends termination signal to process ID. | Validates non-zero PID; prevents killing init/kernel. |
| `spawn_local_server` | `path: String, port: u16` | `()` | Spawns static HTTP file server for directory. | Path must be inside `AllowedPathsState`. |
| `start_tail_log` | `path: String` | `()` | Streams live appended lines from log file. | Path must be inside `AllowedPathsState`. |
| `stop_tail_log` | None | `()` | Stops active background log tailer. | State-managed thread shutdown. |
| `execute_http_request` | `request: HttpRequestParams` | `HttpResponse` | Executes outbound HTTP request from builder. | Filtered through SSRF firewall. |

---

## 17. Remote SSH Client (`ssh.rs`)

*CodexOS wraps OpenSSH CLI using strict batch flags (`-o BatchMode=yes`) and shell-escaped destination paths to eliminate credential prompt hangs and command injection.*

| Command | Arguments | Return Type | Description | Security Invariants |
| :--- | :--- | :--- | :--- | :--- |
| `ssh_list_dir` | `connection: String, path: String` | `Vec<FileInfo>` | Lists remote files over SSH connection. | Connection string checked for illegal flags/characters. |
| `ssh_read_file_text` | `connection: String, path: String` | `String` | Reads remote file text over SSH. | 10 MB maximum safety cap to prevent OOM. |
| `ssh_write_file_text` | `connection: String, path: String, content: String` | `()` | Writes remote file content over SSH. | Remote path safely shell-escaped. |

---

## 18. Reverse Port Tunneling (`tunnel.rs`)

| Command | Arguments | Return Type | Description | Security Invariants |
| :--- | :--- | :--- | :--- | :--- |
| `start_tunnel` | `port: u16` | `TunnelInfo` | Spawns secure reverse SSH tunnel via serveo. | Port must be a valid non-privileged user port. |
| `stop_tunnel` | `tunnel_id: String` | `()` | Closes active reverse port tunnel. | Tunnel ID validated against active table. |
| `list_tunnels` | None | `Vec<TunnelInfo>` | Lists all running reverse tunnels. | State check. |

---

## 19. AI Root-Cause Copilot (`ai.rs`)

| Command | Arguments | Return Type | Description | Security Invariants |
| :--- | :--- | :--- | :--- | :--- |
| `query_ollama` | `model: String, prompt: String` | `()` | Streams local Ollama LLM tokens to `ai-token` event. | 100% offline; connects to local daemon only. |
| `diagnose_issue` | `trigger: DiagnosticTrigger, repo_path: Option<String>` | `Diagnosis` | Autonomous root-cause analysis via Mistral AI. | Rate limited (1 req/10s per trigger); bounded LRU cache. |
| `is_copilot_configured` | None | `bool` | Checks if `MISTRAL_API_KEY` is present in vault. | Does not disclose API key to frontend. |

---

## 20. Archive & Compression (`archive.rs`)

| Command | Arguments | Return Type | Description | Security Invariants |
| :--- | :--- | :--- | :--- | :--- |
| `list_zip_contents` | `path: String` | `Vec<String>` | Lists files and directories inside ZIP archive. | Path must be inside `AllowedPathsState`. |
| `read_zip_file` | `zip_path: String, file_path: String` | `Vec<u8>` | Extracts single file payload from ZIP archive. | Extraction bounded (max 50MB) to prevent decompression bombs. |

---

## 21. Cryptographic Utilities & Data Converters (`crypto_tools.rs`)

| Command | Arguments | Return Type | Description | Security Invariants |
| :--- | :--- | :--- | :--- | :--- |
| `convert_format` | `data: String, format_from: String, format_to: String` | `String` | Converts structured data between JSON, YAML, TOML, XML. | Input data bounded (max 5MB) to prevent parsing exhaustion. |
| `calculate_hash` | `data: String, algorithm: String` | `String` | Computes SHA-256, SHA-512, MD5, SHA-1 checksum. | Whitelisted cryptographic algorithm identifiers. |
| `optimize_image` | `path: String` | `()` | Losslessly compresses PNG/JPEG image using `oxipng`. | Path must be inside `AllowedPathsState`. |
| `inspect_ssl_cert` | `host: String` | `CertInfo` | Connects via TLS and parses X.509 certificate chain. | Host validated through SSRF filter before TLS handshake. |

---

## 22. Offline Documentation (`devdocs.rs`)

| Command | Arguments | Return Type | Description | Security Invariants |
| :--- | :--- | :--- | :--- | :--- |
| `query_docset` | `query: String` | `Vec<DocsetResult>` | Fuzzy searches local offline DevDocs SQLite index. | Parameterized SQLite query; 100% offline. |

---

## Summary of All Commands by Subsystem

| Module | Subsystem Purpose | Command Count |
| :--- | :--- | :--- |
| `files.rs` | Canonical filesystem sandboxing & file management | 22 |
| `fs_cache.rs` | Real-time filesystem change notifications | 2 |
| `secrets.rs` | ChaCha20-Poly1305 encrypted in-memory secrets | 9 |
| `vault.rs` | Argon2id encrypted filesystem vaults | 2 |
| `hmac_vault.rs` | HMAC-SHA256 zero-knowledge proof commitments | 2 |
| `git.rs` | Offline visual Git repository operations | 16 |
| `multiplexer.rs` | Cross-platform PTY terminal multiplexer | 4 |
| `proxy.rs` | HTTP traffic sniffer, replay & SSRF firewall | 8 |
| `kv.rs` | SQLite WAL durable key-value persistence | 3 |
| `db.rs` | Local SQLite and SQL database studio | 2 |
| `diagnostics.rs` | Local health metrics & sanitized error logs | 4 |
| `plugin.rs` | Wasmtime WebAssembly & WASI nano-VM sandbox | 3 |
| `sys.rs` | System telemetry & native window frame controls | 8 |
| `docker.rs` | Docker daemon container and image lifecycle | 8 |
| `system_tools.rs` | Cross-platform developer utility commands | 14 |
| `ports.rs` | Active port scanner, log tailer & HTTP client | 6 |
| `ssh.rs` | Hardened OpenSSH remote filesystem bridge | 3 |
| `tunnel.rs` | Reverse SSH port forwarding tunnels | 3 |
| `ai.rs` | Offline Ollama and AI Root-Cause Copilot | 3 |
| `archive.rs` | Safe bounded ZIP archive reader | 2 |
| `crypto_tools.rs` | Format converter, hash calculator, TLS inspector | 4 |
| `devdocs.rs` | Offline developer documentation search | 1 |
| **Total** | **Exhaustive Tauri IPC Command Surface** | **129** |
