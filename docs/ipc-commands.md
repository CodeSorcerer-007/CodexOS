# CodexOS IPC Command Catalog

Below is the complete list of all Tauri IPC commands exposed by the Rust backend to the TypeScript frontend.

## Files (`files.rs`)
| Command | Parameters | Returns | Description |
|---|---|---|---|
| `get_drives` | none | `DriveInfo[]` | Lists mounted drives |
| `read_file_text` | `path: String` | `String` | Reads file as text |
| `write_file_text` | `path: String, content: String` | `()` | Writes text to file |
| `create_file` | `path: String` | `()` | Creates a new file |
| `create_directory` | `path: String` | `()` | Creates a new directory |
| `rename_path` | `old_path: String, new_path: String` | `()` | Renames a file or directory |
| `read_file_binary` | `path: String` | `Vec<u8>` | Reads file as binary |
| `write_file_binary_webrtc` | `path: String, data: Vec<u8>` | `()` | Writes binary data |
| `get_current_dir` | none | `String` | Gets current working directory |
| `get_files_in_dir` | `path: String` | `FileInfo[]` | Lists files in directory |
| `scan_dev_bloat` | `path: String` | `BloatItem[]` | Scans for bloated directories |
| `purge_directories` | `paths: Vec<String>` | `()` | Deletes multiple directories |
| `bulk_rename` | `path: String, pattern: String, replacement: String` | `Vec<String>` | Bulk renames files |
| `find_duplicates` | `path: String` | `DuplicateGroup[]` | Finds duplicate files |
| `copy_file` | `source: String, dest: String` | `()` | Copies a file |
| `move_file` | `source: String, dest: String` | `()` | Moves a file |
| `delete_file` | `path: String` | `()` | Deletes a file |
| `get_treemap_data` | `path: String, max_depth: u8` | `TreeMapNode[]` | Gets treemap representation of directory |
| `get_code_metrics` | `path: String` | `CodeMetrics` | Gets code metrics for directory |

## Git (`git.rs`)
| Command | Parameters | Returns | Description |
|---|---|---|---|
| `get_git_status` | `path: String` | `GitStatusResult` | Current repo status |
| `search_contents` | `path: String, query: String` | `SearchResult[]` | Searches files |
| `git_action` | `path: String, action: String, args: Vec<String>` | `String` | Runs git command |
| `git_history` | `path: String, limit: u32` | `CommitInfo[]` | Gets git history |
| `git_show` | `path: String, hash: String` | `String` | Shows commit details |
| `get_branches` | `path: String` | `BranchInfo[]` | Lists branches |
| `git_checkout` | `path: String, branch: String` | `()` | Checks out branch |
| `git_create_branch` | `path: String, branch: String` | `()` | Creates branch |
| `git_pull` | `path: String` | `String` | Pulls from remote |
| `git_fetch` | `path: String` | `String` | Fetches from remote |
| `get_file_diff` | `path: String, file: String` | `String` | Gets file diff |
| `get_staged_diff` | `path: String` | `String` | Gets staged diff |
| `get_recent_commit_diff` | `path: String` | `String` | Gets recent commit diff |
| `git_clone` | `url: String, path: String` | `()` | Clones repository |
| `git_stash` | `path: String` | `String` | Stashes changes |
| `git_stash_pop` | `path: String` | `String` | Pops stash |

## Docker (`docker.rs`)
| Command | Parameters | Returns | Description |
|---|---|---|---|
| `get_docker_containers` | none | `DockerContainer[]` | Lists containers |
| `docker_action` | `container_id: String, action: String` | `String` | Runs docker action |
| `stream_docker_logs` | `container_id: String, tail_lines: u32` | `()` | Streams logs |
| `get_docker_images` | none | `DockerImage[]` | Lists images |
| `docker_pull_image` | `image: String` | `()` | Pulls image |
| `docker_remove_image` | `image_id: String` | `String` | Removes image |
| `get_container_stats` | `container_id: String` | `ContainerStats` | Gets container stats |
| `docker_inspect` | `container_id: String` | `String` | Inspects container |

## Proxy (`proxy.rs`)
| Command | Parameters | Returns | Description |
|---|---|---|---|
| `start_proxy` | `port: u16` | `()` | Starts HTTP proxy |
| `stop_proxy` | none | `()` | Stops HTTP proxy |
| `get_captured_requests` | none | `CapturedRequest[]` | Lists captured requests |
| `clear_captured_requests` | none | `()` | Clears captured requests |
| `replay_request` | `url: String, method: String, headers: Vec<(String, String)>, body: Option<String>` | `CapturedRequest` | Replays a request |
| `kv_set` | `key: String, value: String` | `()` | Sets KV store value |
| `kv_get` | `key: String` | `Option<String>` | Gets KV store value |

## System (`sys.rs` & `system_tools.rs`)
| Command | Parameters | Returns | Description |
|---|---|---|---|
| `get_sys_stats` | none | `SysStats` | Gets system stats |
| `get_top_processes_memory` | `limit: usize` | `ProcessInfo[]` | Gets top processes |
| `get_gpu_info` | none | `GpuInfo[]` | Gets GPU info |
| `get_gpu_utilization` | none | `GpuUtilization[]` | Gets GPU utilization |
| `detect_tool` | `tool: String` | `bool` | Detects installed tool |
| `get_os_info` | none | `OsInfo` | Gets OS info |
| `get_env_vars` | none | `EnvVar[]` | Gets environment variables |
| `set_env_var` | `key: String, value: String` | `()` | Sets environment variable |
| `delete_env_var` | `key: String` | `()` | Deletes environment variable |
| `get_services` | none | `ServiceInfo[]` | Gets services |
| `manage_service` | `service: String, action: String` | `()` | Manages service |
| `get_project_tasks` | `path: String` | `ProjectTask[]` | Gets project tasks |
| `list_wsl_distros` | none | `String[]` | Lists WSL distros |
| `execute_command` | `command: String, args: Vec<String>, cwd: Option<String>` | `CommandResult` | Executes shell command |
| `read_hosts` | none | `String` | Reads hosts file |
| `write_hosts` | `content: String` | `()` | Writes hosts file |
| `install_font` | `path: String` | `()` | Installs font |

## Secrets Vault (`secrets.rs` & `vault.rs` & `hmac_vault.rs`)
| Command | Parameters | Returns | Description |
|---|---|---|---|
| `add_secret` | `key: String, value: String` | `()` | Adds secret to vault |
| `list_secret_keys` | none | `String[]` | Lists secret keys |
| `remove_secret` | `key: String` | `()` | Removes secret |
| `has_secret` | `key: String` | `bool` | Checks if secret exists |
| `run_with_secrets` | `command: String, args: Vec<String>, keys: Vec<String>` | `String` | Runs command with secrets |
| `is_vault_locked` | none | `bool` | Checks if vault is locked |
| `unlock_vault` | `password: String` | `()` | Unlocks vault |
| `lock_vault` | none | `()` | Locks vault |
| `encrypt_vault` | `path: String, password: String` | `()` | Encrypts vault file |
| `decrypt_vault` | `path: String, password: String` | `()` | Decrypts vault file |
| `generate_hmac_proof` | `data: String` | `String` | Generates HMAC proof |
| `verify_hmac_proof` | `data: String, hmac: String` | `bool` | Verifies HMAC proof |

## Tunnel (`tunnel.rs`)
| Command | Parameters | Returns | Description |
|---|---|---|---|
| `start_tunnel` | `port: u16` | `TunnelInfo` | Starts tunnel |
| `stop_tunnel` | `tunnel_id: String` | `()` | Stops tunnel |
| `list_tunnels` | none | `TunnelInfo[]` | Lists tunnels |

## AI Copilot (`ai.rs`)
| Command | Parameters | Returns | Description |
|---|---|---|---|
| `query_ollama` | `prompt: String` | `String` | Queries local LLM |
| `diagnose_issue` | `trigger: DiagnosticTrigger, repo_path: Option<String>` | `Diagnosis` | Diagnoses issue |
| `is_copilot_configured` | none | `bool` | Checks if AI is configured |

## SSH (`ssh.rs`)
| Command | Parameters | Returns | Description |
|---|---|---|---|
| `ssh_list_dir` | `connection_string: String, path: String` | `FileInfo[]` | Lists remote directory |
| `ssh_read_file_text` | `connection_string: String, path: String` | `String` | Reads remote file |
| `ssh_write_file_text` | `connection_string: String, path: String, content: String` | `()` | Writes remote file |

## Database (`db.rs`)
| Command | Parameters | Returns | Description |
|---|---|---|---|
| `query_database` | `query: String` | `QueryResult` | Queries SQL database |
| `query_sqlite` | `db_path: String, query: String` | `QueryResult` | Queries SQLite database |

## Multiplexer (`multiplexer.rs`)
| Command | Parameters | Returns | Description |
|---|---|---|---|
| `start_multiplex_pty` | `command: String, args: Vec<String>, cols: u16, rows: u16` | `String` | Starts multiplexer PTY |
| `write_multiplex_pty` | `session_id: String, data: String` | `()` | Writes to multiplexer PTY |
| `kill_multiplex_pty` | `session_id: String` | `()` | Kills multiplexer PTY |

## Misc (`ports.rs`, `plugin.rs`, `devdocs.rs`, `archive.rs`, `crypto_tools.rs`)
| Command | Parameters | Returns | Description |
|---|---|---|---|
| `get_active_ports` | none | `PortInfo[]` | Lists active ports |
| `kill_process` | `pid: u32` | `()` | Kills process |
| `spawn_local_server` | `path: String, port: u16` | `()` | Spawns local static server |
| `start_tail_log` | `path: String` | `()` | Starts tailing log file |
| `stop_tail_log` | none | `()` | Stops tailing log |
| `run_wasm_plugin` | `path: String` | `String` | Runs WASM plugin |
| `run_wasi_nano_vm` | `path: String` | `String` | Runs WASI VM |
| `query_docset` | `query: String` | `DocsetResult[]` | Queries DevDocs |
| `list_zip_contents` | `path: String` | `String[]` | Lists ZIP contents |
| `read_zip_file` | `zip_path: String, file_path: String` | `Vec<u8>` | Reads file from ZIP |
| `convert_format` | `data: String, format_from: String, format_to: String` | `String` | Converts data format |
| `calculate_hash` | `data: String, algorithm: String` | `String` | Calculates hash |
| `optimize_image` | `path: String` | `()` | Optimizes image |
| `inspect_ssl_cert` | `host: String` | `CertInfo` | Inspects SSL certificate |
