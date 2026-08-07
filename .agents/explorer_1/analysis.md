# Rust Backend Code Survey & Analysis Report (R1, R2, R5, R7)

**Author:** `explorer_1`  
**Date:** 2026-08-06  
**Scope:** `src-tauri/` Rust backend files  

---

## Executive Summary

This report presents an exhaustive analysis of all Rust backend code in `src-tauri/` relevant to requirements **R1** (Critical App-Breaking Bugs), **R2** (Security Vulnerabilities), **R5** (Stub Features & Mislabeled Functionality), and **R7** (Cross-Platform Compatibility).

For each requirement, exact file paths, line numbers, current implementations, proposed code fixes, crate dependencies, and potential risks are documented below.

---

## 1. Requirement R1: Critical App-Breaking Bugs

### 1.1 Unregistered Command: `get_top_processes_memory`
- **Target File:** `src-tauri/src/lib.rs` (Lines 122–222)
- **Source Definition:** `src-tauri/src/sys.rs` (Line 56)
- **Current Implementation:**
  `sys::get_top_processes_memory` is defined in `sys.rs` as:
  ```rust
  pub fn get_top_processes_memory(state: tauri::State<'_, SysState>) -> Vec<ProcessMemInfo>
  ```
  However, in `lib.rs`, while `sys::get_sys_stats`, `sys::get_gpu_info`, and `sys::get_gpu_utilization` are registered inside `invoke_handler!(tauri::generate_handler![...])`, `sys::get_top_processes_memory` is omitted.
- **Exact Changes Needed in `src-tauri/src/lib.rs`:**
  Add `sys::get_top_processes_memory` to the `tauri::generate_handler![...]` macro invocation around line 147.
  ```rust
  sys::get_sys_stats,
  sys::get_top_processes_memory,
  sys::get_gpu_info,
  sys::get_gpu_utilization,
  ```
- **Dependencies:** None (function and `SysState` already exist in `sys.rs`).
- **Risks:** Minimal. Frontend component `MemoryProfiler.tsx` calls `invoke('get_top_processes_memory')` which currently fails with "command not found". Registering it resolves the crash.

---

### 1.2 Potential Panic in Local HTTP Server Spawn
- **Target File:** `src-tauri/src/ports.rs` (Line 93)
- **Current Implementation (`ports.rs` lines 82–117):**
  ```rust
  #[tauri::command]
  pub fn spawn_local_server(path: String) -> Result<String, String> {
      ...
      let server_addr = format!("0.0.0.0:{}", port);
      
      thread::spawn(move || {
          let server = Server::http(&server_addr).unwrap(); // LINE 93 - PANICS IF PORT OCCUPIED
          for request in server.incoming_requests() {
              ...
          }
      });
      
      Ok(format!("http://{}:{}", ip, port))
  }
  ```
- **Issue:** If port 8080 is occupied or fails to bind, `Server::http(...)` returns an `Err`. Calling `.unwrap()` panics the spawned thread, failing silently or crashing the background worker without informing the user. Additionally, `spawn_local_server` returns `Ok(...)` immediately even when socket binding fails.
- **Exact Changes Needed in `src-tauri/src/ports.rs`:**
  Bind `Server::http` synchronously *before* spawning the thread, propagating any error back to the caller using `?` / `map_err`.
  ```rust
  #[tauri::command]
  pub fn spawn_local_server(path: String) -> Result<String, String> {
      use std::thread;
      use tiny_http::{Server, Response};
      use local_ip_address::local_ip;
      
      let ip = local_ip().map_err(|e| e.to_string())?.to_string();
      let port = 8080;
      let server_addr = format!("0.0.0.0:{}", port);
      
      let server = Server::http(&server_addr)
          .map_err(|e| format!("Failed to bind local server to {}: {}", server_addr, e))?;
      
      thread::spawn(move || {
          for request in server.incoming_requests() {
              let mut req_path = request.url().to_string();
              if req_path == "/" {
                  req_path = "/index.html".to_string();
              }
              
              req_path = req_path.replace("..", "");
              
              let full_path = format!("{}{}", path, req_path);
              let file = std::fs::File::open(&full_path);
              
              match file {
                  Ok(f) => {
                      let _ = request.respond(Response::from_file(f));
                  },
                  Err(_) => {
                      let _ = request.respond(Response::from_string("404 Not Found").with_status_code(404));
                  }
              }
          }
      });
      
      Ok(format!("http://{}:{}", ip, port))
  }
  ```
- **Dependencies:** `tiny_http::Server` implements `Send`, so binding before `thread::spawn` is valid.
- **Risks:** Low. Prevents application panic and ensures frontend receives an error string when port 8080 is occupied.

---

### 1.3 Panic in Git Clone Background Thread
- **Target File:** `src-tauri/src/git.rs` (Line 296)
- **Current Implementation (`git.rs` lines 287–309):**
  ```rust
  #[tauri::command]
  pub fn git_clone(url: String, destination: String, app_handle: tauri::AppHandle) -> Result<(), String> {
      use std::process::Command;
      use tauri::Emitter;
      std::thread::spawn(move || {
          use std::io::{BufRead, BufReader};
          let mut child = Command::new("git")
              .args(["clone", "--progress", &url, &destination])
              .stderr(std::process::Stdio::piped())
              .spawn()
              .expect("failed to execute child"); // LINE 296 - PANICS THREAD IF GIT NOT FOUND
          
          if let Some(stderr) = child.stderr.take() {
              let reader = BufReader::new(stderr);
              for line in reader.lines() {
                  if let Ok(line) = line {
                      let _ = app_handle.emit("git-progress", line);
                  }
              }
          }
          let _ = child.wait();
      });
      Ok(())
  }
  ```
- **Issue:** If `git` is missing from the system PATH, `.spawn()` returns an `io::Error`. The `.expect(...)` call panics the background thread.
- **Exact Changes Needed in `src-tauri/src/git.rs`:**
  Replace `.expect(...)` with graceful error handling that emits an error event over the existing `git-progress` channel or an error channel.
  ```rust
  #[tauri::command]
  pub fn git_clone(url: String, destination: String, app_handle: tauri::AppHandle) -> Result<(), String> {
      use std::process::Command;
      use tauri::Emitter;
      std::thread::spawn(move || {
          use std::io::{BufRead, BufReader};
          let child_res = Command::new("git")
              .args(["clone", "--progress", &url, &destination])
              .stderr(std::process::Stdio::piped())
              .spawn();
          
          let mut child = match child_res {
              Ok(child) => child,
              Err(e) => {
                  let _ = app_handle.emit("git-progress", format!("Error: Failed to execute git: {}", e));
                  return;
              }
          };
          
          if let Some(stderr) = child.stderr.take() {
              let reader = BufReader::new(stderr);
              for line in reader.lines() {
                  if let Ok(line) = line {
                      let _ = app_handle.emit("git-progress", line);
                  }
              }
          }
          let _ = child.wait();
      });
      Ok(())
  }
  ```
- **Dependencies:** None.
- **Risks:** Low. Guarantees background clone thread terminates cleanly and communicates failure via events.

---

## 2. Requirement R2: Security Vulnerabilities

### 2.1 Shell Command Injection in SSH Operations
- **Target File:** `src-tauri/src/ssh.rs` (Lines 4–69)
- **Current Implementation:**
  ```rust
  #[tauri::command]
  pub fn ssh_list_dir(connection: String, path: String) -> Result<Vec<FileInfo>, String> {
      let output = std::process::Command::new("ssh")
          .arg(&connection)
          .arg(format!("find \"{}\" -maxdepth 1 -printf '%y|%s|%f\\n'", path))
          .output() ...
  }

  #[tauri::command]
  pub fn ssh_read_file_text(connection: String, path: String) -> Result<String, String> {
      let output = std::process::Command::new("ssh")
          .arg(&connection)
          .arg(format!("cat \"{}\"", path))
          .output() ...
  }
  ```
- **Vulnerabilities:**
  1. `connection` argument injection: A malicious `connection` string starting with `-` (e.g. `-oProxyCommand=...`) can execute arbitrary code on the local host.
  2. `path` remote command injection: Unescaped double quotes, backticks, `$()`, or semicolons inside `path` permit remote command execution on the target server.
- **Exact Changes Needed in `src-tauri/src/ssh.rs`:**
  1. Validate `connection` string format: Ensure it does not start with `-` and only contains valid hostname / user characters (e.g. `[a-zA-Z0-9_.-]+(@[a-zA-Z0-9_.-]+)?(:[0-9]+)?`).
  2. Quote and escape `path` for remote POSIX shell execution (replace `'` with `'\''` and wrap path in single quotes `'...'`).
  ```rust
  fn validate_connection(connection: &str) -> Result<(), String> {
      let trimmed = connection.trim();
      if trimmed.starts_with('-') {
          return Err("Invalid SSH connection string: Flags are not permitted.".to_string());
      }
      if trimmed.is_empty() || trimmed.contains(|c: char| c.is_whitespace() || ";|&$`<>".contains(c)) {
          return Err("Invalid SSH connection target format.".to_string());
      }
      Ok(())
  }

  fn escape_shell_arg(arg: &str) -> String {
      format!("'{}'", arg.replace('\'', "'\\''"))
  }
  ```
  Update `ssh_list_dir` and `ssh_read_file_text`:
  ```rust
  #[tauri::command]
  pub fn ssh_list_dir(connection: String, path: String) -> Result<Vec<FileInfo>, String> {
      validate_connection(&connection)?;
      let safe_path = escape_shell_arg(&path);
      let remote_cmd = format!("find {} -maxdepth 1 -printf '%y|%s|%f\\n'", safe_path);

      let output = std::process::Command::new("ssh")
          .arg(&connection)
          .arg(remote_cmd)
          .output()
          .map_err(|e| format!("Failed to execute ssh: {}", e))?;
      ...
  }

  #[tauri::command]
  pub fn ssh_read_file_text(connection: String, path: String) -> Result<String, String> {
      validate_connection(&connection)?;
      let safe_path = escape_shell_arg(&path);
      let remote_cmd = format!("cat {}", safe_path);

      let output = std::process::Command::new("ssh")
          .arg(&connection)
          .arg(remote_cmd)
          .output()
          .map_err(|e| format!("Failed to execute ssh: {}", e))?;
      ...
  }
  ```
- **Dependencies:** None.
- **Risks:** Medium. Strict connection format validation ensures malicious SSH option injections (like `-oProxyCommand`) are rejected while single-quoting handles all arbitrary remote file paths safely.

---

### 2.2 SQL Injection in DevDocs Search
- **Target File:** `src-tauri/src/devdocs.rs` (Lines 12–37)
- **Current Implementation:**
  ```rust
  let sql = format!("SELECT name, type, path FROM searchIndex WHERE name LIKE '%{}%' LIMIT 100", query.replace("'", "''"));
  let rows = sqlx::query(&sql).fetch_all(&pool).await.map_err(|e| format!("Query error: {}", e))?;
  ```
- **Issue:** Using string formatting for SQL queries (even with `.replace("'", "''")`) exposes the application to SQL injection vulnerabilities and breaks on specialized SQLite syntax.
- **Exact Changes Needed in `src-tauri/src/devdocs.rs`:**
  Replace `sqlx::any` dynamic raw string SQL query with parameterized `rusqlite` query, as mandated by Requirement R2.
  ```rust
  use std::path::Path;
  use serde::{Serialize, Deserialize};

  #[derive(Serialize, Deserialize)]
  pub struct DocIndex {
      name: String,
      r#type: String,
      path: String,
  }

  #[tauri::command]
  pub fn query_docset(docset_path: String, query: String) -> Result<Vec<DocIndex>, String> {
      let db_path = Path::new(&docset_path).join("Contents/Resources/docSet.dsidx");
      if !db_path.exists() {
          return Err("Not a valid docset".to_string());
      }
      
      let conn = rusqlite::Connection::open(&db_path)
          .map_err(|e| format!("Database connection error: {}", e))?;
      
      let mut stmt = conn.prepare("SELECT name, type, path FROM searchIndex WHERE name LIKE ?1 LIMIT 100")
          .map_err(|e| format!("Query prepare error: {}", e))?;
          
      let pattern = format!("%{}%", query);
      let rows = stmt.query_map(rusqlite::params![pattern], |row| {
          Ok(DocIndex {
              name: row.get(0)?,
              r#type: row.get(1)?,
              path: row.get(2)?,
          })
      }).map_err(|e| format!("Query execution error: {}", e))?;
      
      let mut results = Vec::new();
      for row in rows {
          if let Ok(doc) = row {
              results.push(doc);
          }
      }
      
      Ok(results)
  }
  ```
- **Dependencies:** `rusqlite = { version = "0.29.0", features = ["bundled"] }` is already listed in `Cargo.toml`.
- **Risks:** Low. Synchronous `rusqlite` parameterization removes `sqlx` async pool overhead for local docset SQLite files and eliminates SQL injection completely. Note: Update function signature from `async fn query_docset` to `fn query_docset` (or keep async wrapper if required by tauri macro compatibility).

---

### 2.3 Insecure Host Key Checking in SSH Tunnel
- **Target File:** `src-tauri/src/tunnel.rs` (Line 48)
- **Current Implementation:**
  ```rust
  let mut child = Command::new("ssh")
      .args([
          "-o", "StrictHostKeyChecking=no",
          "-o", "ServerAliveInterval=60",
          "-R", &format!("80:localhost:{}", local_port),
          "nokey@serveo.net",
      ])
  ```
- **Issue:** `StrictHostKeyChecking=no` automatically accepts any host key and disables host key verification, making connection vulnerable to Man-In-The-Middle (MITM) attacks.
- **Exact Changes Needed in `src-tauri/src/tunnel.rs`:**
  Change `"StrictHostKeyChecking=no"` to `"StrictHostKeyChecking=accept-new"` on line 48.
  ```rust
  let mut child = Command::new("ssh")
      .args([
          "-o", "StrictHostKeyChecking=accept-new",
          "-o", "ServerAliveInterval=60",
          "-R", &format!("80:localhost:{}", local_port),
          "nokey@serveo.net",
      ])
  ```
- **Dependencies:** Standard OpenSSH client support for `accept-new` (available in OpenSSH 7.6+).
- **Risks:** Low. `accept-new` automatically accepts host keys for new hosts but rejects changed host keys, preventing MITM spoofing.

---

## 3. Requirement R5: Stub Features & Mislabeled Functionality

### 3.1 Relabeling ZKP Vault to HMAC Proof Vault
- **Target File:** `src-tauri/src/zkp.rs` (and `src-tauri/src/lib.rs`)
- **Current Implementation (`zkp.rs` lines 5–46):**
  ```rust
  #[tauri::command]
  pub fn generate_zk_proof(vault_data: String, secret_key: String) -> Result<String, String> { ... }

  #[tauri::command]
  pub fn verify_zk_proof(proof_hash: String, expected_vault_data: String, secret_key: String) -> Result<bool, String> { ... }
  ```
- **Issue:** The module uses HMAC-SHA256 commitment signatures, which are symmetric signed proofs — not zero-knowledge proofs. Labeling this feature "ZKP / Zero-Knowledge" is misleading.
- **Exact Changes Needed in `src-tauri/src/zkp.rs`:**
  Rename commands to `generate_hmac_proof` and `verify_hmac_proof`. Add alias handlers or retain compatibility functions if needed, but update Rust command names.
  ```rust
  #[tauri::command]
  pub fn generate_hmac_proof(vault_data: String, secret_key: String) -> Result<String, String> {
      // Generate a secure random nonce
      let rng = rand::SystemRandom::new();
      let mut nonce = [0u8; 16];
      rng.fill(&mut nonce).map_err(|_| "Failed to generate secure nonce")?;

      // Use HMAC-SHA256 for cryptographic commitment
      let key = hmac::Key::new(hmac::HMAC_SHA256, secret_key.as_bytes());
      
      let mut combined_data = vault_data.into_bytes();
      combined_data.extend_from_slice(&nonce);
      
      let signature = hmac::sign(&key, &combined_data);
      
      let proof = format!("{}:{}", hex::encode(nonce), hex::encode(signature.as_ref()));
      Ok(proof)
  }

  #[tauri::command]
  pub fn verify_hmac_proof(proof_hash: String, expected_vault_data: String, secret_key: String) -> Result<bool, String> {
      let parts: Vec<&str> = proof_hash.split(':').collect();
      if parts.len() != 2 {
          return Err("Invalid proof format".to_string());
      }

      let nonce = hex::decode(parts[0]).map_err(|_| "Invalid nonce encoding")?;
      let signature_bytes = hex::decode(parts[1]).map_err(|_| "Invalid signature encoding")?;

      let key = hmac::Key::new(hmac::HMAC_SHA256, secret_key.as_bytes());
      
      let mut combined_data = expected_vault_data.into_bytes();
      combined_data.extend_from_slice(&nonce);

      match hmac::verify(&key, &combined_data, &signature_bytes) {
          Ok(_) => Ok(true),
          Err(_) => Ok(false)
      }
  }
  ```
  Update `src-tauri/src/lib.rs` (lines 151–152):
  ```rust
  zkp::generate_hmac_proof,
  zkp::verify_hmac_proof,
  ```
  *(Note: Alias functions `generate_zk_proof` and `verify_zk_proof` can be marked deprecated or forwarded to `generate_hmac_proof` if backward compatibility is required during transition).*
- **Dependencies:** None.
- **Risks:** Frontend invoke targets must be updated synchronously in `ZKPVault.tsx` (renamed to `HMACVault.tsx`).

---

### 3.2 Honest Unimplemented State for WASI Nano-VM
- **Target File:** `src-tauri/src/plugin.rs` (Lines 30–33)
- **Current Implementation:**
  ```rust
  #[tauri::command]
  pub fn run_wasi_nano_vm(path: String, mounted_dir: String) -> Result<String, String> {
      Ok(format!("WASI Nano-VM successfully executed and terminated: {}", path))
  }
  ```
- **Issue:** Function returns a fake success message without executing any WASI sandbox logic.
- **Exact Changes Needed in `src-tauri/src/plugin.rs`:**
  Return an explicit `Err` indicating that the WASM Sandbox / WASI Nano-VM is not yet implemented.
  ```rust
  #[tauri::command]
  pub fn run_wasi_nano_vm(_path: String, _mounted_dir: String) -> Result<String, String> {
      Err("WASM Sandbox feature is not yet implemented in this release.".to_string())
  }
  ```
- **Dependencies:** None.
- **Risks:** Low. Ensures UI reflects true capability instead of deceiving the user with mock execution.

---

## 4. Requirement R7: Cross-Platform Compatibility

### 4.1 PTY Shell Runtime OS Detection
- **Target Files:** `src-tauri/src/lib.rs` (Line 48) and `src-tauri/src/multiplexer.rs` (Line 36)
- **Current Implementations:**
  - `lib.rs` line 48:
    ```rust
    let cmd = CommandBuilder::new("powershell.exe");
    ```
  - `multiplexer.rs` line 36:
    ```rust
    let cmd_str = command.unwrap_or_else(|| "powershell.exe".to_string());
    ```
- **Issue:** Hardcoded `powershell.exe` fails on macOS and Linux where PowerShell is not installed.
- **Exact Changes Needed:**
  - In `src-tauri/src/lib.rs` (`start_pty` command, line 48):
    ```rust
    let default_shell = if cfg!(target_os = "windows") {
        "powershell.exe"
    } else {
        "/bin/bash"
    };
    let cmd = CommandBuilder::new(default_shell);
    ```
  - In `src-tauri/src/multiplexer.rs` (`start_multiplex_pty` command, line 36):
    ```rust
    let default_shell = if cfg!(target_os = "windows") {
        "powershell.exe".to_string()
    } else {
        std::env::var("SHELL").unwrap_or_else(|_| "/bin/bash".to_string())
    };
    let cmd_str = command.unwrap_or(default_shell);
    let cmd = CommandBuilder::new(cmd_str);
    ```
- **Dependencies:** Standard library `cfg!(target_os = "windows")`.
- **Risks:** Low. Enables native shell spawning across Windows, macOS, and Linux.

---

### 4.2 Cross-Platform Network Port Enumeration
- **Target File:** `src-tauri/src/ports.rs` (Lines 25–28)
- **Current Implementation:**
  ```rust
  let output = Command::new("netstat")
      .args(["-ano", "-p", "tcp"])
      .output()
      .map_err(|e| e.to_string())?;
  ```
- **Issue:** Windows netstat uses `-ano -p tcp`, whereas macOS/Linux `netstat` or `lsof` require different flags and output formatting.
- **Exact Changes Needed in `src-tauri/src/ports.rs`:**
  Implement OS-branching command execution and parser for active listening ports.
  ```rust
  #[tauri::command]
  pub fn get_active_ports() -> Result<Vec<PortInfo>, String> {
      use std::process::Command;
      use sysinfo::System;
      
      let mut sys = System::new();
      sys.refresh_all();
      let mut ports = Vec::new();

      if cfg!(target_os = "windows") {
          let output = Command::new("netstat")
              .args(["-ano", "-p", "tcp"])
              .output()
              .map_err(|e| e.to_string())?;
              
          let stdout = String::from_utf8_lossy(&output.stdout);
          
          for line in stdout.lines().skip(4) {
              let parts: Vec<&str> = line.split_whitespace().collect();
              if parts.len() >= 4 {
                  let local_addr = parts[1];
                  let state = parts[3];
                  let pid_str = if parts.len() > 4 { parts[4] } else { parts[3] };
                  
                  if state == "LISTENING" {
                      let port = local_addr.split(':').next_back().unwrap_or("").to_string();
                      let pid = pid_str.to_string();
                      
                      let process_name = if let Ok(pid_num) = pid.parse::<usize>() {
                          sys.process(sysinfo::Pid::from(pid_num)).map(|p| p.name().to_string()).unwrap_or_else(|| "Unknown".to_string())
                      } else {
                          "Unknown".to_string()
                      };
                      
                      if !ports.iter().any(|p: &PortInfo| p.port == port && p.pid == pid) {
                          ports.push(PortInfo {
                              port,
                              pid,
                              process_name,
                              state: state.to_string(),
                          });
                      }
                  }
              }
          }
      } else {
          // macOS / Linux implementation using lsof
          let output = Command::new("lsof")
              .args(["-iTCP", "-sTCP:LISTEN", "-P", "-n"])
              .output()
              .map_err(|e| format!("Failed to run lsof: {}", e))?;

          let stdout = String::from_utf8_lossy(&output.stdout);
          for line in stdout.lines().skip(1) {
              let parts: Vec<&str> = line.split_whitespace().collect();
              if parts.len() >= 9 {
                  let process_name = parts[0].to_string();
                  let pid = parts[1].to_string();
                  let name_field = parts[8]; // e.g. "*:8080" or "127.0.0.1:3000"
                  let port = name_field.split(':').next_back().unwrap_or("").to_string();

                  if !port.is_empty() && !ports.iter().any(|p: &PortInfo| p.port == port && p.pid == pid) {
                      ports.push(PortInfo {
                          port,
                          pid,
                          process_name,
                          state: "LISTEN".to_string(),
                      });
                  }
              }
          }
      }
      
      Ok(ports)
  }
  ```
- **Dependencies:** Standard OS tools (`netstat` on Windows, `lsof` on Unix).
- **Risks:** Medium. `lsof` is standard on macOS and most Linux distros; fallback error messaging explains if missing.

---

### 4.3 Cross-Platform Process Termination
- **Target File:** `src-tauri/src/ports.rs` (Lines 66–79)
- **Note on Discrepancy:** The initial task prompt referenced `system_tools.rs` for process termination, but `kill_process` is actually implemented in `src-tauri/src/ports.rs` (lines 66–79).
- **Current Implementation:**
  ```rust
  #[tauri::command]
  pub fn kill_process(pid: String) -> Result<String, String> {
      use std::process::Command;
      
      let output = Command::new("taskkill")
          .args(["/F", "/PID", &pid])
          .output()
          .map_err(|e| e.to_string())?;
      ...
  }
  ```
- **Issue:** `taskkill` fails on macOS/Linux.
- **Exact Changes Needed in `src-tauri/src/ports.rs`:**
  Use `cfg!(target_os = "windows")` to branch between `taskkill /F /PID` and `kill -9`:
  ```rust
  #[tauri::command]
  pub fn kill_process(pid: String) -> Result<String, String> {
      use std::process::Command;
      
      let output = if cfg!(target_os = "windows") {
          Command::new("taskkill")
              .args(["/F", "/PID", &pid])
              .output()
      } else {
          Command::new("kill")
              .args(["-9", &pid])
              .output()
      }.map_err(|e| e.to_string())?;
          
      if output.status.success() {
          Ok(String::from_utf8_lossy(&output.stdout).into_owned())
      } else {
          Err(String::from_utf8_lossy(&output.stderr).into_owned())
      }
  }
  ```
- **Dependencies:** Standard POSIX `kill` command.
- **Risks:** Low. Multi-platform process signal termination.

---

### 4.4 Cross-Platform Hosts File Path Handling
- **Target File:** `src-tauri/src/system_tools.rs` (Lines 126–157)
- **Current Implementation:**
  ```rust
  #[tauri::command]
  pub fn read_hosts() -> Result<String, String> {
      let path = "C:\\Windows\\System32\\drivers\\etc\\hosts";
      std::fs::read_to_string(path).map_err(|e| e.to_string())
  }

  #[tauri::command]
  pub fn write_hosts(content: String) -> Result<(), String> {
      let path = "C:\\Windows\\System32\\drivers\\etc\\hosts";
      if std::fs::write(path, &content).is_ok() {
          return Ok(());
      }
      ...
  }
  ```
- **Issue:** Hardcoded Windows system directory `C:\Windows\System32\drivers\etc\hosts` breaks on Unix systems where the path is `/etc/hosts`.
- **Exact Changes Needed in `src-tauri/src/system_tools.rs`:**
  Abstract path lookup based on OS runtime:
  ```rust
  fn get_hosts_path() -> &'static str {
      if cfg!(target_os = "windows") {
          "C:\\Windows\\System32\\drivers\\etc\\hosts"
      } else {
          "/etc/hosts"
      }
  }

  #[tauri::command]
  pub fn read_hosts() -> Result<String, String> {
      let path = get_hosts_path();
      std::fs::read_to_string(path).map_err(|e| e.to_string())
  }

  #[tauri::command]
  pub fn write_hosts(content: String) -> Result<(), String> {
      let path = get_hosts_path();
      if std::fs::write(path, &content).is_ok() {
          return Ok(());
      }
      
      if cfg!(target_os = "windows") {
          let temp_path = std::env::temp_dir().join("vaultly_hosts_tmp.txt");
          std::fs::write(&temp_path, &content).map_err(|e| e.to_string())?;
          
          let script = format!(
              "Start-Process powershell -ArgumentList '-NoProfile -Command Copy-Item -Path \"{}\" -Destination \"{}\" -Force' -Verb RunAs -WindowStyle Hidden -Wait",
              temp_path.to_string_lossy(),
              path
          );
          
          let status = std::process::Command::new("powershell")
              .args(["-NoProfile", "-Command", &script])
              .status()
              .map_err(|e| e.to_string())?;
              
          if status.success() {
              Ok(())
          } else {
              Err("Failed to acquire Administrator privileges to save hosts file.".to_string())
          }
      } else {
          Err("Permission denied: Modifying /etc/hosts requires root privileges (sudo).".to_string())
      }
  }
  ```
- **Dependencies:** Standard file system APIs.
- **Risks:** Low. Properly identifies platform path and avoids Windows PowerShell UAC escalation scripts on Unix systems.

---

## 5. Matrix Summary of File Changes

| File Path | Requirement | Key Modification |
|---|---|---|
| `src-tauri/src/lib.rs` | R1, R5, R7 | Register `sys::get_top_processes_memory`, rename `zkp` commands, default PTY to `/bin/bash` on non-Windows |
| `src-tauri/src/ports.rs` | R1, R7 | Replace `.unwrap()` on `Server::http()` with `?`, implement Unix `lsof` for `get_active_ports`, add Unix `kill -9` to `kill_process` |
| `src-tauri/src/git.rs` | R1 | Handle `git clone` process `.spawn()` error without panicking, emit progress error event |
| `src-tauri/src/ssh.rs` | R2 | Sanitize/validate `connection` string and shell-escape `path` |
| `src-tauri/src/devdocs.rs` | R2 | Replace string-formatted SQL with parameterized `rusqlite` query |
| `src-tauri/src/tunnel.rs` | R2 | Replace `StrictHostKeyChecking=no` with `StrictHostKeyChecking=accept-new` |
| `src-tauri/src/zkp.rs` | R5 | Rename `generate_zk_proof` and `verify_zk_proof` to `generate_hmac_proof` and `verify_hmac_proof` |
| `src-tauri/src/plugin.rs` | R5 | Update `run_wasi_nano_vm` to return `Err("WASM Sandbox not yet implemented")` |
| `src-tauri/src/multiplexer.rs` | R7 | Fallback default multiplexer PTY shell to `/bin/bash` on Unix |
| `src-tauri/src/system_tools.rs` | R7 | Use platform-aware path (`/etc/hosts` vs Windows drivers path) for `read_hosts` and `write_hosts` |
