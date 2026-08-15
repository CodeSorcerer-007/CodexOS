# CodexOS IPC API Reference

This document provides a comprehensive specification of all IPC commands exposed by the CodexOS Tauri 2 backend to the React frontend.

---

## 1. File System & Sandbox (`files.rs`, `fs_cache.rs`)

| Command | Arguments | Return Type | Security Constraints |
|:---|:---|:---|:---|
| `get_drives` | None | `Vec<DriveInfo>` | Read-only disk geometry |
| `read_file_text` | `path: String` | `String` | Path must be inside `AllowedPathsState` |
| `write_file_text` | `path: String, content: String` | `()` | Path must be inside `AllowedPathsState` |
| `create_file` | `path: String` | `()` | Path must be inside `AllowedPathsState` |
| `create_directory` | `path: String` | `()` | Path must be inside `AllowedPathsState` |
| `rename_path` | `old_path: String, new_path: String` | `()` | Both paths must be inside `AllowedPathsState` |
| `delete_file` | `path: String` | `()` | Moves to system recycle bin via `trash` |
| `copy_file` | `src: String, dst: String` | `()` | Both paths must be inside `AllowedPathsState` |
| `move_file` | `src: String, dst: String` | `()` | Both paths must be inside `AllowedPathsState` |
| `add_allowed_path` | `path: String` | `()` | Adds canonicalized directory to allowed roots |
| `remove_allowed_path` | `path: String` | `()` | Removes directory from allowed roots |
| `get_allowed_paths` | None | `Vec<String>` | Lists current active workspace roots |
| `get_files_in_dir` | `path: String` | `Vec<FileInfo>` | Path must be inside `AllowedPathsState` |
| `scan_dev_bloat` | `path: String` | `Vec<BloatFolder>` | Path must be inside `AllowedPathsState` |
| `purge_directories` | `paths: Vec<String>` | `u64` | Paths must be inside `AllowedPathsState` |
| `get_code_metrics` | `path: String` | `CodeMetrics` | Recursive LOC / comment analyzer |
| `find_duplicates` | `path: String` | `Vec<DuplicateGroup>` | SHA-256 duplicate content detection |
| `start_fs_watch` | `path: String` | `()` | Starts non-blocking filesystem watcher |
| `stop_fs_watch` | None | `()` | Stops active filesystem watcher |

---

## 2. Secrets & Cryptographic Vault (`secrets.rs`, `vault.rs`, `hmac_vault.rs`)

| Command | Arguments | Return Type | Security Constraints |
|:---|:---|:---|:---|
| `unlock_vault` | `password: String` | `bool` | Minimum 12 characters; Argon2id KDF |
| `lock_vault` | None | `()` | Zeroizes master key memory buffers |
| `is_vault_locked` | None | `bool` | Checks if master key is loaded in memory |
| `add_secret` | `key: String, value: String` | `()` | Requires unlocked vault |
| `remove_secret` | `key: String` | `()` | Requires unlocked vault |
| `has_secret` | `key: String` | `bool` | Safe existence check (does not return secret) |
| `list_secret_keys` | None | `Vec<String>` | Returns keys only (never secret values) |
| `export_secrets_to_env` | `output_path: String` | `()` | Injects plaintext warning header |
| `run_with_secrets` | `command: String, args: Vec<String>` | `String` | Whitelisted env injection without shell |
| `encrypt_vault` | `path: String, password: String, out_path: String` | `()` | ChaCha20-Poly1305 + Argon2id |
| `decrypt_vault` | `vault_path: String, password: String, dest_dir: String` | `()` | Bounded zip extraction (anti-zip-bomb) |
| `generate_hmac_proof` | `message: String, secret: String` | `HmacProof` | HMAC-SHA256 authenticated proof |
| `verify_hmac_proof` | `message: String, signature: String, secret: String` | `bool` | Constant-time verification |

---

## 3. Key-Value & Local Storage (`kv.rs`, `db.rs`)

| Command | Arguments | Return Type | Security Constraints |
|:---|:---|:---|:---|
| `kv_set` | `key: String, value: String` | `()` | SQLite WAL mode; durable store |
| `kv_get` | `key: String` | `Option<String>` | Parameterized query |
| `query_sqlite` | `path: String, query: String` | `SqliteResult` | Local SQLite database browser |
| `query_database` | `url: String, query: String` | `Vec<Record<String, Value>>` | Generic SQL database query (Postgres/MySQL/SQLite) |

---

## 4. Network Interception & SSRF Firewall (`proxy.rs`)

| Command | Arguments | Return Type | Security Constraints |
|:---|:---|:---|:---|
| `start_proxy` | `port: u16` | `u16` | Binds to 127.0.0.1 only |
| `stop_proxy` | None | `()` | Graceful server shutdown |
| `is_proxy_running` | None | `bool` | Status check |
| `get_captured_requests` | None | `Vec<CapturedRequest>` | Reads bounded rolling proxy logs (max 500) |
| `clear_captured_requests` | None | `()` | Clears database table |
| `replay_request` | `url: String, method: String, headers: Vec<(String, String)>, body: Option<String>` | `HttpResponse` | Filtered through SSRF firewall |
| `set_proxy_whitelist` | `hosts: Vec<String>` | `()` | Whitelist custom internal hosts |
| `get_proxy_whitelist` | None | `Vec<String>` | Lists whitelisted host patterns |

---

## 5. Terminal Multiplexer & Process Control (`multiplexer.rs`, `ports.rs`)

| Command | Arguments | Return Type | Security Constraints |
|:---|:---|:---|:---|
| `start_multiplex_pty` | `id: String, shell: Option<String>, cwd: Option<String>` | `()` | Spawns pseudo-terminal |
| `write_multiplex_pty` | `id: String, data: String` | `()` | Writes to PTY stdin stream |
| `resize_multiplex_pty` | `id: String, cols: u16, rows: u16` | `()` | Resizes terminal dimensions |
| `kill_multiplex_pty` | `id: String` | `()` | Terminates child process |
| `get_active_ports` | None | `Vec<PortInfo>` | Scans listening ports on localhost |
| `kill_process` | `pid: u32` | `()` | Sends termination signal to PID |

---

## 6. AI Copilot Engine (`ai.rs`)

| Command | Arguments | Return Type | Security Constraints |
|:---|:---|:---|:---|
| `query_ollama` | `model: String, prompt: String` | `()` | Streams tokens via `ai-token` event |
| `diagnose_issue` | `trigger: DiagnosticTrigger, repo_path: Option<String>` | `Diagnosis` | 10s rate limit per trigger; LRU cached |
| `is_copilot_configured` | None | `bool` | Checks presence of MISTRAL_API_KEY in vault |

---

## 7. Version Control & Container Subsystems (`git.rs`, `docker.rs`, `ssh.rs`)

| Command | Arguments | Return Type | Security Constraints |
|:---|:---|:---|:---|
| `get_git_status` | `path: String` | `GitStatus` | Validates git repository path |
| `git_action` | `path: String, action: String, file: String, message: String` | `String` | Validates action whitelist |
| `get_docker_containers` | None | `Vec<DockerContainer>` | Scans local Docker socket |
| `docker_action` | `container_id: String, action: String` | `String` | Validates container ID format |
| `ssh_list_dir` | `connection: String, path: String` | `Vec<FileInfo>` | Validates connection format against flags/injection |
| `ssh_read_file_text` | `connection: String, path: String` | `String` | Non-interactive batch mode with 10MB safety cap |
| `ssh_write_file_text` | `connection: String, path: String, content: String` | `()` | Shell-escaped destination path |
