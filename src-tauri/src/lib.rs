use serde::{Serialize, Deserialize};
use std::fs;
use sysinfo::{Disks, System, Networks};
use tauri::{Emitter, State};
use sha2::{Sha256, Digest};
use md5::Md5;
use std::sync::{Arc, Mutex};
use walkdir::WalkDir;
use portable_pty::{CommandBuilder, native_pty_system, PtySize};
use std::thread;
use std::io::{Read, Write};
use std::process::Command;
use x509_parser::prelude::*;
mod vault;
mod db;
mod devdocs;
mod multiplexer;
mod proxy;
mod plugin;
mod zkp;
mod secrets;
mod tunnel;
mod sys;

#[derive(Serialize, Deserialize)]
pub struct DriveInfo {
    name: String,
    total_gb: u64,
    used_gb: u64,
}

#[derive(Serialize, Deserialize)]
pub struct BloatItem {
    path: String,
    size_mb: u64,
}

#[derive(Serialize, Deserialize)]
pub struct FileInfo {
    name: String,
    path: String,
    is_dir: bool,
    size_bytes: u64,
}

#[derive(Serialize, Deserialize)]
pub struct SearchResult {
    file: String,
    line: u32,
    content: String,
}

#[derive(Serialize, Deserialize)]
pub struct GitCommitInfo {
    hash: String,
    message: String,
    date: String,
}

#[derive(Serialize, Deserialize)]
pub struct TelemetryData {
    cpu_usage: f32,
    used_mem: u64,
    total_mem: u64,
    rx_bytes: u64,
    tx_bytes: u64,
}

#[derive(Serialize, Deserialize)]
pub struct TreeMapNode {
    name: String,
    size: u64,
    children: Vec<TreeMapNode>,
}

#[derive(Serialize, Deserialize)]
pub struct WindowsService {
    name: String,
    display_name: String,
    status: String,
    start_type: String,
}

#[derive(Serialize, Deserialize)]
pub struct DockerContainer {
    id: String,
    name: String,
    image: String,
    state: String,
    status: String,
    ports: String,
}

#[derive(Serialize, Deserialize, Default)]
pub struct CodeMetrics {
    total_files: u32,
    total_lines: u32,
    languages: std::collections::HashMap<String, u32>,
}

#[derive(Serialize, Deserialize)]
pub struct PortInfo {
    port: String,
    pid: String,
    process_name: String,
    state: String,
}

#[derive(Serialize, Deserialize)]
pub struct SqliteResult {
    columns: Vec<String>,
    rows: Vec<Vec<String>>,
}

#[derive(Serialize, Deserialize)]
pub struct ZipEntryInfo {
    name: String,
    is_dir: bool,
    size: u64,
}

struct PtyState {
    writer: Arc<Mutex<Option<Box<dyn Write + Send>>>>,
    child: Arc<Mutex<Option<Box<dyn portable_pty::Child + Send + Sync>>>>,
    master: Arc<Mutex<Option<Box<dyn portable_pty::MasterPty + Send>>>>,
}

struct TailState {
    task: Mutex<Option<tauri::async_runtime::JoinHandle<()>>>,
}

struct SysState(Mutex<System>);
struct NetState(Mutex<Networks>);

#[tauri::command]
fn get_drives() -> Vec<DriveInfo> {
    let mut disks = Disks::new_with_refreshed_list();
    disks.refresh_list();
    
    disks.iter().map(|disk| {
        let total = disk.total_space();
        let available = disk.available_space();
        let used = total.saturating_sub(available);
        
        let name = disk.mount_point().to_string_lossy().to_string();
        
        DriveInfo {
            name,
            total_gb: total / 1_000_000_000,
            used_gb: used / 1_000_000_000,
        }
    }).collect()
}

#[tauri::command]
fn read_file_text(path: String) -> Result<String, String> {
    fs::read_to_string(path).map_err(|e| e.to_string())
}

#[tauri::command]
fn read_file_binary(path: String) -> Result<Vec<u8>, String> {
    fs::read(path).map_err(|e| e.to_string())
}

#[tauri::command]
fn write_file_binary_webrtc(path: String, data: Vec<u8>) -> Result<(), String> {
    fs::write(path, data).map_err(|e| e.to_string())
}

#[tauri::command]
fn start_pty(app_handle: tauri::AppHandle, state: State<'_, PtyState>) -> Result<(), String> {
    let pty_system = native_pty_system();
    let pair = pty_system.openpty(PtySize {
        rows: 24,
        cols: 80,
        pixel_width: 0,
        pixel_height: 0,
    }).map_err(|e| e.to_string())?;

    let cmd = CommandBuilder::new("powershell.exe");
    let child = pair.slave.spawn_command(cmd).map_err(|e| e.to_string())?;

    let mut reader = pair.master.try_clone_reader().map_err(|e| e.to_string())?;
    let writer = pair.master.take_writer().map_err(|e| e.to_string())?;

    *state.writer.lock().unwrap() = Some(writer);
    *state.child.lock().unwrap() = Some(child);
    *state.master.lock().unwrap() = Some(pair.master);

    thread::spawn(move || {
        let mut buf = [0u8; 1024];
        while let Ok(n) = reader.read(&mut buf) {
            if n == 0 { break; }
            let s = String::from_utf8_lossy(&buf[..n]);
            let _ = app_handle.emit("pty-output", s.to_string());
        }
    });

    Ok(())
}

#[tauri::command]
fn write_pty(data: String, state: State<'_, PtyState>) -> Result<(), String> {
    if let Some(writer) = state.writer.lock().unwrap().as_mut() {
        writer.write_all(data.as_bytes()).map_err(|e| e.to_string())?;
    }
    Ok(())
}

#[tauri::command]
fn scan_dev_bloat(path: String) -> Vec<BloatItem> {
    let mut bloat_items = Vec::new();
    
    let walker = WalkDir::new(path).into_iter().filter_entry(|e| {
        let is_hidden = e.file_name().to_str().map(|s| s.starts_with('.')).unwrap_or(false);
        !is_hidden
    });
    
    for entry in walker {
        if let Ok(entry) = entry {
            if entry.file_type().is_dir() {
                let name = entry.file_name().to_string_lossy();
                if name == "node_modules" || name == "target" || name == "bin" || name == "obj" {
                    let mut size_bytes = 0;
                    for sub_entry in WalkDir::new(entry.path()) {
                        if let Ok(sub_entry) = sub_entry {
                            if let Ok(meta) = sub_entry.metadata() {
                                size_bytes += meta.len();
                            }
                        }
                    }
                    bloat_items.push(BloatItem {
                        path: entry.path().to_string_lossy().to_string(),
                        size_mb: size_bytes / 1_000_000,
                    });
                }
            }
        }
    }
    
    bloat_items
}

#[tauri::command]
fn purge_directories(paths: Vec<String>) -> Result<(), String> {
    for path in paths {
        trash::delete(&path).map_err(|e| e.to_string())?;
    }
    Ok(())
}

#[tauri::command]
fn get_current_dir() -> Result<String, String> {
    std::env::current_dir()
        .map(|p| p.to_string_lossy().to_string())
        .map_err(|e| e.to_string())
}

#[tauri::command]
fn get_files_in_dir(path: String) -> Result<Vec<FileInfo>, String> {
    let mut files = Vec::new();
    let entries = std::fs::read_dir(path).map_err(|e| e.to_string())?;
    
    for entry in entries.flatten() {
        let meta = entry.metadata().map_err(|e| e.to_string())?;
            files.push(FileInfo {
                name: entry.file_name().to_string_lossy().to_string(),
                path: entry.path().to_string_lossy().to_string(),
                is_dir: meta.is_dir(),
                size_bytes: meta.len(),
            });
    }
    
    // Sort directories first
    files.sort_by(|a, b| {
        b.is_dir.cmp(&a.is_dir).then_with(|| a.name.to_lowercase().cmp(&b.name.to_lowercase()))
    });
    
    Ok(files)
}

#[tauri::command]
fn get_git_status(path: String) -> Result<std::collections::HashMap<String, String>, String> {
    use std::process::Command;
    let mut status_map = std::collections::HashMap::new();
    
    // Use the native git executable. If not installed, it safely returns an error.
    let output = Command::new("git")
        .current_dir(path)
        .args(["status", "--porcelain"])
        .output()
        .map_err(|e| e.to_string())?;
        
    if output.status.success() {
        let stdout = String::from_utf8_lossy(&output.stdout);
        for line in stdout.lines() {
            if line.len() > 3 {
                let status = &line[0..2];
                let file = &line[3..];
                status_map.insert(file.to_string(), status.to_string());
            }
        }
    }
    Ok(status_map)
}

#[tauri::command]
fn search_contents(path: String, query: String) -> Result<Vec<SearchResult>, String> {
    use std::process::Command;
    let mut results = Vec::new();
    
    // Ripgrep must be installed on the host machine
    let output = Command::new("rg")
        .current_dir(path)
        .args(["--no-heading", "-n", &query])
        .output()
        .map_err(|e| format!("Ripgrep failed to execute (is it installed?): {}", e))?;
        
    if output.status.success() {
        let stdout = String::from_utf8_lossy(&output.stdout);
        for line in stdout.lines() {
            let parts: Vec<&str> = line.splitn(3, ':').collect();
            if parts.len() == 3 {
                if let Ok(line_num) = parts[1].parse::<u32>() {
                    results.push(SearchResult {
                        file: parts[0].replace("\\", "/"), // Normalize paths for frontend
                        line: line_num,
                        content: parts[2].trim().to_string(),
                    });
                }
            }
        }
    }
    Ok(results)
}

#[tauri::command]
fn git_action(path: String, action: String, file: String, message: String) -> Result<String, String> {
    use std::process::Command;
    
    let mut cmd = Command::new("git");
    cmd.current_dir(&path);
    
    match action.as_str() {
        "add" => { cmd.args(["add", &file]); },
        "commit" => { cmd.args(["commit", "-m", &message]); },
        "push" => { cmd.args(["push"]); },
        _ => return Err("Invalid git action".to_string()),
    }
    
    let output = cmd.output().map_err(|e| e.to_string())?;
    
    if output.status.success() {
        Ok(String::from_utf8_lossy(&output.stdout).into_owned())
    } else {
        Err(String::from_utf8_lossy(&output.stderr).into_owned())
    }
}

#[tauri::command]
fn git_history(path: String, file: String) -> Result<Vec<GitCommitInfo>, String> {
    use std::process::Command;
    
    // git log --pretty=format:"%H|%s|%cd" --date=short -- <file>
    let output = Command::new("git")
        .current_dir(path)
        .args(["log", "--pretty=format:%H|%s|%cd", "--date=short", "--", &file])
        .output()
        .map_err(|e| e.to_string())?;
        
    let mut history = Vec::new();
    if output.status.success() {
        let stdout = String::from_utf8_lossy(&output.stdout);
        for line in stdout.lines() {
            let parts: Vec<&str> = line.splitn(3, '|').collect();
            if parts.len() == 3 {
                history.push(GitCommitInfo {
                    hash: parts[0].to_string(),
                    message: parts[1].to_string(),
                    date: parts[2].to_string(),
                });
            }
        }
    }
    Ok(history)
}

#[tauri::command]
fn git_show(path: String, hash: String, file: String) -> Result<String, String> {
    use std::process::Command;
    
    // git show <hash>:<file>
    let output = Command::new("git")
        .current_dir(path)
        .args(["show", &format!("{}:{}", hash, file)])
        .output()
        .map_err(|e| e.to_string())?;
        
    if output.status.success() {
        Ok(String::from_utf8_lossy(&output.stdout).into_owned())
    } else {
        Err(String::from_utf8_lossy(&output.stderr).into_owned())
    }
}

#[tauri::command]
fn get_docker_containers() -> Result<Vec<DockerContainer>, String> {
    use std::process::Command;
    
    // Using a custom format to avoid requiring serde_json for parsing
    let output = Command::new("docker")
        .args(["ps", "-a", "--format", "{{.ID}}|{{.Names}}|{{.Image}}|{{.State}}|{{.Status}}|{{.Ports}}"])
        .output()
        .map_err(|e| e.to_string())?;
        
    let mut containers = Vec::new();
    if output.status.success() {
        let stdout = String::from_utf8_lossy(&output.stdout);
        for line in stdout.lines() {
            let parts: Vec<&str> = line.splitn(6, '|').collect();
            if parts.len() == 6 {
                containers.push(DockerContainer {
                    id: parts[0].to_string(),
                    name: parts[1].to_string(),
                    image: parts[2].to_string(),
                    state: parts[3].to_string(),
                    status: parts[4].to_string(),
                    ports: parts[5].to_string(),
                });
            }
        }
    }
    
    Ok(containers)
}

#[tauri::command]
fn get_code_metrics(path: String) -> Result<CodeMetrics, String> {
    let mut metrics = CodeMetrics::default();
    
    fn scan_dir(dir: &std::path::Path, metrics: &mut CodeMetrics) -> Result<(), String> {
        if let Ok(entries) = std::fs::read_dir(dir) {
            for entry in entries.flatten() {
                let path = entry.path();
                let file_name = path.file_name().unwrap_or_default().to_string_lossy();
                
                // Skip common heavy directories
                if file_name == "node_modules" || file_name == "target" || file_name == ".git" || file_name == "dist" {
                    continue;
                }
                
                if path.is_dir() {
                    let _ = scan_dir(&path, metrics);
                } else if path.is_file() {
                    let ext = path.extension().unwrap_or_default().to_string_lossy().to_string();
                    if !ext.is_empty() {
                        metrics.total_files += 1;
                        
                        // Count lines for code files
                        if matches!(ext.as_str(), "rs" | "ts" | "tsx" | "js" | "jsx" | "css" | "html" | "json" | "toml") {
                            if let Ok(content) = std::fs::read_to_string(&path) {
                                let lines = content.lines().count() as u32;
                                metrics.total_lines += lines;
                                
                                *metrics.languages.entry(ext).or_insert(0) += lines;
                            }
                        }
                    }
                }
            }
        }
        Ok(())
    }
    
    scan_dir(std::path::Path::new(&path), &mut metrics)?;
    Ok(metrics)
}

#[tauri::command]
fn get_active_ports() -> Result<Vec<PortInfo>, String> {
    use std::process::Command;
    use sysinfo::System;
    
    let mut sys = System::new();
    sys.refresh_all();
    
    // Windows specific netstat mapping
    let output = Command::new("netstat")
        .args(["-ano", "-p", "tcp"])
        .output()
        .map_err(|e| e.to_string())?;
        
    let mut ports = Vec::new();
    let stdout = String::from_utf8_lossy(&output.stdout);
    
    for line in stdout.lines().skip(4) { // Skip headers
        let parts: Vec<&str> = line.split_whitespace().collect();
        if parts.len() >= 4 {
            let local_addr = parts[1];
            let state = parts[3];
            let pid_str = if parts.len() > 4 { parts[4] } else { parts[3] }; // Sometimes state is missing
            
            if state == "LISTENING" {
                let port = local_addr.split(':').next_back().unwrap_or("").to_string();
                let pid = pid_str.to_string();
                
                let process_name = if let Ok(pid_num) = pid.parse::<usize>() {
                    sys.process(sysinfo::Pid::from(pid_num)).map(|p| p.name().to_string()).unwrap_or_else(|| "Unknown".to_string())
                } else {
                    "Unknown".to_string()
                };
                
                // Avoid duplicates
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
    
    Ok(ports)
}

#[tauri::command]
fn kill_process(pid: String) -> Result<String, String> {
    use std::process::Command;
    
    let output = Command::new("taskkill")
        .args(["/F", "/PID", &pid])
        .output()
        .map_err(|e| e.to_string())?;
        
    if output.status.success() {
        Ok(String::from_utf8_lossy(&output.stdout).into_owned())
    } else {
        Err(String::from_utf8_lossy(&output.stderr).into_owned())
    }
}

#[tauri::command]
fn spawn_local_server(path: String) -> Result<String, String> {
    use std::thread;
    use tiny_http::{Server, Response};
    use local_ip_address::local_ip;
    
    let ip = local_ip().map_err(|e| e.to_string())?.to_string();
    let port = 8080;
    
    let server_addr = format!("0.0.0.0:{}", port);
    
    // Spawn server in background
    thread::spawn(move || {
        let server = Server::http(&server_addr).unwrap();
        for request in server.incoming_requests() {
            let mut req_path = request.url().to_string();
            if req_path == "/" {
                req_path = "/index.html".to_string();
            }
            
            // basic security - no directory traversal
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

#[tauri::command]
fn query_sqlite(path: String, query: String) -> Result<SqliteResult, String> {
    use rusqlite::{Connection, types::ValueRef};
    
    let conn = Connection::open(path).map_err(|e| e.to_string())?;
    let mut stmt = conn.prepare(&query).map_err(|e| e.to_string())?;
    
    let column_names: Vec<String> = stmt.column_names().into_iter().map(String::from).collect();
    let column_count = column_names.len();
    
    let mut rows_data = Vec::new();
    
    let mut rows = stmt.query([]).map_err(|e| e.to_string())?;
    while let Some(row) = rows.next().map_err(|e| e.to_string())? {
        let mut row_data = Vec::with_capacity(column_count);
        for i in 0..column_count {
            let val_ref = row.get_ref(i).map_err(|e| e.to_string())?;
            let val_str = match val_ref {
                ValueRef::Null => "NULL".to_string(),
                ValueRef::Integer(i) => i.to_string(),
                ValueRef::Real(f) => f.to_string(),
                ValueRef::Text(t) => String::from_utf8_lossy(t).to_string(),
                ValueRef::Blob(_) => "[BLOB]".to_string(),
            };
            row_data.push(val_str);
        }
        rows_data.push(row_data);
    }
    
    Ok(SqliteResult {
        columns: column_names,
        rows: rows_data,
    })
}

#[tauri::command]
fn bulk_rename(path: String, pattern: String, replacement: String) -> Result<Vec<String>, String> {
    use regex::Regex;
    use std::fs;
    
    let re = Regex::new(&pattern).map_err(|e| e.to_string())?;
    let dir = std::path::Path::new(&path);
    let mut renamed_files = Vec::new();
    
    if let Ok(entries) = fs::read_dir(dir) {
        for entry in entries.flatten() {
            let file_path = entry.path();
            if file_path.is_file() {
                if let Some(file_name) = file_path.file_name().and_then(|n| n.to_str()) {
                    if re.is_match(file_name) {
                        let new_name = re.replace(file_name, &replacement).to_string();
                        if new_name != file_name {
                            let new_path = file_path.with_file_name(&new_name);
                            if fs::rename(&file_path, &new_path).is_ok() {
                                renamed_files.push(format!("{} -> {}", file_name, new_name));
                            }
                        }
                    }
                }
            }
        }
    }
    
    Ok(renamed_files)
}

#[tauri::command]
fn list_zip_contents(path: String) -> Result<Vec<ZipEntryInfo>, String> {
    use std::fs::File;
    use zip::ZipArchive;
    
    let file = File::open(&path).map_err(|e| e.to_string())?;
    let mut archive = ZipArchive::new(file).map_err(|e| e.to_string())?;
    
    let mut entries = Vec::new();
    for i in 0..archive.len() {
        let file = archive.by_index(i).map_err(|e| e.to_string())?;
        entries.push(ZipEntryInfo {
            name: file.name().to_string(),
            is_dir: file.is_dir(),
            size: file.size(),
        });
    }
    
    Ok(entries)
}

#[tauri::command]
fn read_zip_file(zip_path: String, internal_path: String) -> Result<String, String> {
    use std::fs::File;
    use std::io::Read;
    use zip::ZipArchive;
    
    let file = File::open(&zip_path).map_err(|e| e.to_string())?;
    let mut archive = ZipArchive::new(file).map_err(|e| e.to_string())?;
    
    let mut zip_file = archive.by_name(&internal_path).map_err(|e| e.to_string())?;
    
    let mut contents = String::new();
    zip_file.read_to_string(&mut contents).map_err(|e| e.to_string())?;
    
    Ok(contents)
}

#[tauri::command]
async fn start_tail_log(
    path: String,
    window: tauri::Window,
    state: State<'_, TailState>,
) -> Result<(), String> {
    use linemux::MuxedLines;
    use futures::stream::StreamExt;

    // Stop any existing tail
    let mut task_guard = state.task.lock().unwrap();
    if let Some(existing_task) = task_guard.take() {
        existing_task.abort();
    }

    let handle = tauri::async_runtime::spawn(async move {
        let mut mux = match MuxedLines::new() {
            Ok(m) => m,
            Err(e) => {
                let _ = window.emit("log-error", e.to_string());
                return;
            }
        };

        if let Err(e) = mux.add_file(&path).await {
            let _ = window.emit("log-error", e.to_string());
            return;
        }

        while let Some(Ok(line)) = mux.next().await {
            let _ = window.emit("log-line", line.line().to_string());
        }
    });

    *task_guard = Some(handle);
    Ok(())
}

#[tauri::command]
fn stop_tail_log(state: State<'_, TailState>) -> Result<(), String> {
    let mut task_guard = state.task.lock().unwrap();
    if let Some(existing_task) = task_guard.take() {
        existing_task.abort();
    }
    Ok(())
}

#[tauri::command]
fn ssh_list_dir(connection: String, path: String) -> Result<Vec<FileInfo>, String> {
    // Uses Windows built-in ssh.exe
    let output = std::process::Command::new("ssh")
        .arg(&connection)
        // %y = type (d/f/l), %s = size in bytes, %f = filename
        .arg(format!("find \"{}\" -maxdepth 1 -printf '%y|%s|%f\\n'", path))
        .output()
        .map_err(|e| format!("Failed to execute ssh: {}", e))?;

    if !output.status.success() {
        let err = String::from_utf8_lossy(&output.stderr);
        return Err(format!("SSH Error: {}", err));
    }

    let stdout = String::from_utf8_lossy(&output.stdout);
    let mut files = Vec::new();

    for line in stdout.lines() {
        if line.is_empty() { continue; }
        
        // Expected format: d|4096|folder_name
        let parts: Vec<&str> = line.splitn(3, '|').collect();
        if parts.len() == 3 {
            let file_type = parts[0];
            let size_str = parts[1];
            let name = parts[2].to_string();

            if name == "." || name == ".." {
                continue;
            }

            let is_dir = file_type == "d";
            let size_bytes = size_str.parse::<u64>().unwrap_or(0);
            
            // Reconstruct path
            let full_path = if path.ends_with('/') {
                format!("{}{}", path, name)
            } else {
                format!("{}/{}", path, name)
            };

            files.push(FileInfo {
                name,
                path: full_path,
                is_dir,
                size_bytes,
            });
        }
    }
    
    // Sort directories first
    files.sort_by(|a, b| b.is_dir.cmp(&a.is_dir).then(a.name.to_lowercase().cmp(&b.name.to_lowercase())));

    Ok(files)
}

#[tauri::command]
fn ssh_read_file_text(connection: String, path: String) -> Result<String, String> {
    let output = std::process::Command::new("ssh")
        .arg(&connection)
        .arg(format!("cat \"{}\"", path))
        .output()
        .map_err(|e| format!("Failed to execute ssh: {}", e))?;

    if !output.status.success() {
        let err = String::from_utf8_lossy(&output.stderr);
        return Err(format!("SSH Error: {}", err));
    }

    Ok(String::from_utf8_lossy(&output.stdout).to_string())
}

fn build_tree(path: &std::path::Path, current_depth: u8, max_depth: u8) -> TreeMapNode {
    let name = path.file_name().unwrap_or_default().to_string_lossy().to_string();
    let mut node = TreeMapNode {
        name: if name.is_empty() { path.to_string_lossy().to_string() } else { name },
        size: 0,
        children: Vec::new(),
    };
    
    if current_depth >= max_depth {
        let size = WalkDir::new(path).into_iter().filter_map(|e| e.ok()).filter(|e| e.file_type().is_file()).map(|e| e.metadata().map(|m| m.len()).unwrap_or(0)).sum();
        node.size = size;
        return node;
    }
    
    if let Ok(entries) = std::fs::read_dir(path) {
        let mut child_nodes = Vec::new();
        let mut total_size = 0;
        
        for entry in entries.flatten() {
            if let Ok(metadata) = entry.metadata() {
                if metadata.is_dir() {
                    let child = build_tree(&entry.path(), current_depth + 1, max_depth);
                    total_size += child.size;
                    child_nodes.push(child);
                } else {
                    let size = metadata.len();
                    total_size += size;
                    child_nodes.push(TreeMapNode {
                        name: entry.file_name().to_string_lossy().to_string(),
                        size,
                        children: Vec::new()
                    });
                }
            }
        }
        
        child_nodes.sort_by_key(|b| std::cmp::Reverse(b.size));
        
        if child_nodes.len() > 30 {
            let mut others_size = 0;
            for child in child_nodes.iter().skip(29) {
                others_size += child.size;
            }
            child_nodes.truncate(29);
            child_nodes.push(TreeMapNode {
                name: "Others".to_string(),
                size: others_size,
                children: Vec::new(),
            });
        }
        
        node.size = total_size;
        node.children = child_nodes;
    }
    
    node
}

#[tauri::command]
async fn get_treemap_data(path: String, max_depth: u8) -> Result<Vec<TreeMapNode>, String> {
    let p = std::path::PathBuf::from(path);
    if !p.exists() {
        return Err("Path does not exist".to_string());
    }
    
    // Run blocking filesystem operations inside spawn_blocking
    let tree = tauri::async_runtime::spawn_blocking(move || {
        build_tree(&p, 0, max_depth)
    }).await.map_err(|e| e.to_string())?;
    
    // Recharts expects an array at the top level
    Ok(vec![tree])
}

#[tauri::command]
fn get_env_vars() -> Result<std::collections::HashMap<String, String>, String> {
    let output = std::process::Command::new("powershell")
        .args(["-Command", "[Environment]::GetEnvironmentVariables('User') | ConvertTo-Json"])
        .output()
        .map_err(|e| e.to_string())?;
        
    let json_str = String::from_utf8_lossy(&output.stdout);
    serde_json::from_str(&json_str).map_err(|e| e.to_string())
}

#[tauri::command]
fn set_env_var(name: String, value: String) -> Result<(), String> {
    let output = std::process::Command::new("powershell")
        .env("NEW_ENV_NAME", &name)
        .env("NEW_ENV_VAL", &value)
        .args(["-Command", "[Environment]::SetEnvironmentVariable($env:NEW_ENV_NAME, $env:NEW_ENV_VAL, 'User')"])
        .output()
        .map_err(|e| e.to_string())?;
        
    if !output.status.success() {
        return Err(String::from_utf8_lossy(&output.stderr).to_string());
    }
    
    Ok(())
}

#[tauri::command]
fn delete_env_var(name: String) -> Result<(), String> {
    let output = std::process::Command::new("powershell")
        .env("DEL_ENV_NAME", &name)
        .args(["-Command", "[Environment]::SetEnvironmentVariable($env:DEL_ENV_NAME, $null, 'User')"])
        .output()
        .map_err(|e| e.to_string())?;
        
    if !output.status.success() {
        return Err(String::from_utf8_lossy(&output.stderr).to_string());
    }
    
    Ok(())
}

#[tauri::command]
fn get_services() -> Result<Vec<WindowsService>, String> {
    let script = "Get-Service | Select-Object Name, DisplayName, @{Name='status';Expression={$_.Status.ToString()}}, @{Name='start_type';Expression={$_.StartType.ToString()}} | ConvertTo-Json -Depth 2";
    let output = std::process::Command::new("powershell")
        .args(["-NoProfile", "-Command", script])
        .output()
        .map_err(|e| e.to_string())?;
        
    let json_str = String::from_utf8_lossy(&output.stdout);
    serde_json::from_str(&json_str).map_err(|e| e.to_string())
}

#[tauri::command]
fn manage_service(name: String, action: String) -> Result<(), String> {
    // action is "Start", "Stop", or "Restart"
    let script = format!("{}-Service -Name $env:SERVICE_NAME -Force", action);
    let output = std::process::Command::new("powershell")
        .env("SERVICE_NAME", &name)
        .args(["-NoProfile", "-Command", &script])
        .output()
        .map_err(|e| e.to_string())?;
        
    if !output.status.success() {
        let err = String::from_utf8_lossy(&output.stderr).to_string();
        if err.contains("Access is denied") || err.contains("Cannot open") {
            return Err("Access Denied: You must run Vaultly as Administrator to modify this service.".to_string());
        }
        return Err(err);
    }
    
    Ok(())
}

#[tauri::command]
fn get_project_tasks(path: String) -> Result<std::collections::HashMap<String, String>, String> {
    let pkg_path = std::path::Path::new(&path).join("package.json");
    if pkg_path.exists() {
        let content = std::fs::read_to_string(pkg_path).map_err(|e| e.to_string())?;
        if let Ok(json) = serde_json::from_str::<serde_json::Value>(&content) {
            if let Some(scripts) = json.get("scripts").and_then(|s| s.as_object()) {
                let mut tasks = std::collections::HashMap::new();
                for (key, val) in scripts {
                    if let Some(v_str) = val.as_str() {
                        tasks.insert(key.clone(), v_str.to_string());
                    }
                }
                return Ok(tasks);
            }
        }
    }
    
    Ok(std::collections::HashMap::new())
}

#[tauri::command]
fn list_wsl_distros() -> Result<Vec<String>, String> {
    let script = "Get-ChildItem HKCU:\\Software\\Microsoft\\Windows\\CurrentVersion\\Lxss -ErrorAction SilentlyContinue | ForEach-Object { (Get-ItemProperty $_.PSPath).DistributionName }";
    let output = std::process::Command::new("powershell")
        .args(["-NoProfile", "-Command", script])
        .output()
        .map_err(|e| e.to_string())?;
        
    let distros_str = String::from_utf8_lossy(&output.stdout);
    let mut distros = Vec::new();
    for line in distros_str.lines() {
        let trimmed = line.trim();
        if !trimmed.is_empty() {
            distros.push(trimmed.to_string());
        }
    }
    Ok(distros)
}

#[tauri::command]
fn convert_format(path: String, target_format: String) -> Result<String, String> {
    let content = std::fs::read_to_string(&path).map_err(|e| e.to_string())?;
    let path_lower = path.to_lowercase();
    
    let value: serde_json::Value = if path_lower.ends_with(".json") {
        serde_json::from_str(&content).map_err(|e| format!("Invalid JSON: {}", e))?
    } else if path_lower.ends_with(".yaml") || path_lower.ends_with(".yml") {
        serde_yaml::from_str(&content).map_err(|e| format!("Invalid YAML: {}", e))?
    } else {
        return Err("Only JSON and YAML are currently supported for conversion.".to_string());
    };
    
    let output = match target_format.as_str() {
        "json" => serde_json::to_string_pretty(&value).map_err(|e| format!("Failed to generate JSON: {}", e))?,
        "yaml" => serde_yaml::to_string(&value).map_err(|e| format!("Failed to generate YAML: {}", e))?,
        _ => return Err("Target format not supported.".to_string()),
    };
    
    let new_path = std::path::Path::new(&path).with_extension(&target_format);
    std::fs::write(&new_path, output).map_err(|e| e.to_string())?;
    
    Ok(new_path.to_string_lossy().to_string())
}

#[tauri::command]
fn calculate_hash(path: String, algorithm: String) -> Result<String, String> {
    let mut file = std::fs::File::open(&path).map_err(|e| e.to_string())?;
    
    if algorithm == "md5" {
        let mut hasher = Md5::new();
        std::io::copy(&mut file, &mut hasher).map_err(|e| e.to_string())?;
        Ok(hex::encode(hasher.finalize()))
    } else if algorithm == "sha256" {
        let mut hasher = Sha256::new();
        std::io::copy(&mut file, &mut hasher).map_err(|e| e.to_string())?;
        Ok(hex::encode(hasher.finalize()))
    } else {
        Err("Unsupported algorithm".to_string())
    }
}

#[derive(serde::Serialize)]
struct DuplicateGroup {
    hash: String,
    files: Vec<String>,
    size: u64,
}

#[tauri::command]
async fn find_duplicates(path: String) -> Result<Vec<DuplicateGroup>, String> {
    tauri::async_runtime::spawn_blocking(move || {
        use std::collections::HashMap;
        
        let mut size_map: HashMap<u64, Vec<String>> = HashMap::new();
        
        for entry in WalkDir::new(&path).into_iter().filter_map(|e| e.ok()) {
            if entry.file_type().is_file() {
                if let Ok(metadata) = entry.metadata() {
                    let size = metadata.len();
                    if size > 0 {
                        size_map.entry(size).or_default().push(entry.path().to_string_lossy().to_string());
                    }
                }
            }
        }
        
        let mut duplicates = Vec::new();
        
        for (size, files) in size_map {
            if files.len() > 1 {
                let mut hash_map: HashMap<String, Vec<String>> = HashMap::new();
                for file_path in files {
                    if let Ok(mut file) = std::fs::File::open(&file_path) {
                        let mut hasher = Sha256::new();
                        if std::io::copy(&mut file, &mut hasher).is_ok() {
                            let hash = hex::encode(hasher.finalize());
                            hash_map.entry(hash).or_default().push(file_path);
                        }
                    }
                }
                
                for (hash, identical_files) in hash_map {
                    if identical_files.len() > 1 {
                        duplicates.push(DuplicateGroup {
                            hash,
                            files: identical_files,
                            size,
                        });
                    }
                }
            }
        }
        
        duplicates.sort_by_key(|b| std::cmp::Reverse(b.size));
        Ok(duplicates)
    }).await.map_err(|e| e.to_string())?
}

#[tauri::command]
fn read_hosts() -> Result<String, String> {
    let path = "C:\\Windows\\System32\\drivers\\etc\\hosts";
    std::fs::read_to_string(path).map_err(|e| e.to_string())
}

#[tauri::command]
fn write_hosts(content: String) -> Result<(), String> {
    let path = "C:\\Windows\\System32\\drivers\\etc\\hosts";
    if std::fs::write(path, &content).is_ok() {
        return Ok(());
    }
    
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
}

#[tauri::command]
async fn optimize_image(path: String) -> Result<String, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let original_size = std::fs::metadata(&path).map_err(|e| e.to_string())?.len();
        
        let options = oxipng::Options::from_preset(3);
        
        let in_file = oxipng::InFile::Path(std::path::PathBuf::from(&path));
        let out_file = oxipng::OutFile::Path { 
            path: Some(std::path::PathBuf::from(&path)),
            preserve_attrs: false
        };
        
        oxipng::optimize(&in_file, &out_file, &options).map_err(|e| e.to_string())?;
        
        let new_size = std::fs::metadata(&path).map_err(|e| e.to_string())?.len();
        
        if original_size > new_size {
            let saved = original_size - new_size;
            Ok(format!("Saved {} bytes", saved))
        } else {
            Ok("Already fully optimized".to_string())
        }
    }).await.map_err(|e| e.to_string())?
}

#[tauri::command]
fn copy_file(source: String, dest: String) -> Result<(), String> {
    std::fs::copy(source, dest).map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
fn move_file(source: String, dest: String) -> Result<(), String> {
    std::fs::rename(source, dest).map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
fn install_font(path: String) -> Result<String, String> {
    let script = format!(
        "$FontFolder = (New-Object -ComObject Shell.Application).Namespace(0x14); \
        $FontFolder.CopyHere(\"{}\")",
        path.replace("\"", "`\"")
    );
    let output = Command::new("powershell")
        .args(["-NoProfile", "-Command", &script])
        .output()
        .map_err(|e| e.to_string())?;
        
    if !output.status.success() {
        return Err(String::from_utf8_lossy(&output.stderr).to_string());
    }
    
    Ok("Font installed successfully".to_string())
}

#[tauri::command]
async fn execute_http_request(url: String, method: String, body: Option<String>) -> Result<String, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let client = reqwest::blocking::Client::new();
        let req = match method.to_uppercase().as_str() {
            "POST" => client.post(&url),
            "PUT" => client.put(&url),
            "DELETE" => client.delete(&url),
            "PATCH" => client.patch(&url),
            _ => client.get(&url),
        };
        
        let req = if let Some(b) = body {
            req.body(b).header("Content-Type", "application/json")
        } else {
            req
        };
        
        let res = req.send().map_err(|e| e.to_string())?;
        let status = res.status();
        let headers = format!("{:#?}", res.headers());
        let text = res.text().unwrap_or_default();
        
        Ok(format!("HTTP {}\n\n{}\n\n{}", status, headers, text))
    }).await.map_err(|e| e.to_string())?
}

#[tauri::command]
fn inspect_ssl_cert(path: String) -> Result<String, String> {
    let data = std::fs::read(&path).map_err(|e| e.to_string())?;
    
    let (_, pem) = x509_parser::pem::parse_x509_pem(&data).map_err(|e| e.to_string())?;
    let (_, x509) = X509Certificate::from_der(&pem.contents).map_err(|e| e.to_string())?;
    
    let subject = x509.subject().to_string();
    let issuer = x509.issuer().to_string();
    let valid_from = x509.validity().not_before.to_string();
    let valid_to = x509.validity().not_after.to_string();
    
    let json = format!(r#"{{
        "subject": "{}",
        "issuer": "{}",
        "valid_from": "{}",
        "valid_to": "{}"
    }}"#, 
    subject.replace("\"", "\\\"").replace("\n", ""), 
    issuer.replace("\"", "\\\"").replace("\n", ""), 
    valid_from, valid_to);
    
    Ok(json)
}

#[tauri::command]
fn delete_file(path: String) -> Result<(), String> {
    fs::remove_file(path).map_err(|e| e.to_string())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let sys = System::new();
    
    tauri::Builder::default()
        .manage(PtyState {
            writer: Arc::new(Mutex::new(None)),
            child: Arc::new(Mutex::new(None)),
            master: Arc::new(Mutex::new(None)),
        })
        .manage(TailState {
            task: Mutex::new(None),
        })
        .manage(sys::SysState(Mutex::new(sys)))
        .manage(multiplexer::MultiPtyState::new())
        .manage(secrets::SecretsState::new())
        .manage(tunnel::TunnelState::new())
        .manage(proxy::ProxyState { is_running: std::sync::Arc::new(std::sync::atomic::AtomicBool::new(false)) })
        .invoke_handler(tauri::generate_handler![
            get_drives,
            read_file_text,
            read_file_binary,
            write_file_binary_webrtc,
            vault::encrypt_vault,
            vault::decrypt_vault,
            db::query_database,
            devdocs::query_docset,
            multiplexer::start_multiplex_pty,
            multiplexer::write_multiplex_pty,
            multiplexer::kill_multiplex_pty,
            proxy::start_proxy,
            proxy::stop_proxy,
            plugin::run_wasm_plugin,
            plugin::run_wasi_nano_vm,
            start_pty,
            write_pty,
            sys::get_sys_stats,
            scan_dev_bloat,
            zkp::generate_zk_proof,
            zkp::verify_zk_proof,
            secrets::add_secret,
            secrets::list_secret_keys,
            secrets::remove_secret,
            secrets::run_with_secrets,
            tunnel::start_tunnel,
            tunnel::stop_tunnel,
            tunnel::list_tunnels,
            purge_directories,
            get_current_dir,
            get_files_in_dir,
            get_git_status,
            search_contents,
            git_action,
            git_history,
            git_show,
            get_docker_containers,
            get_code_metrics,
            get_active_ports,
            kill_process,
            spawn_local_server,
            query_sqlite,
            bulk_rename,
            list_zip_contents,
            read_zip_file,
            start_tail_log,
            stop_tail_log,
            ssh_list_dir,
            ssh_read_file_text,
            get_treemap_data,
            get_env_vars,
            set_env_var,
            delete_env_var,
            get_services,
            manage_service,
            get_project_tasks,
            list_wsl_distros,
            convert_format,
            calculate_hash,
            find_duplicates,
            read_hosts,
            write_hosts,
            optimize_image,
            copy_file,
            move_file,
            install_font,
            execute_http_request,
            inspect_ssl_cert,
            delete_file
        ])
        .setup(|app| {
            use tauri::Manager;
            let window = app.get_webview_window("main").expect("WINDOW NOT FOUND!");
            window.show().unwrap();
            window.set_focus().unwrap();
            if cfg!(debug_assertions) {
                app.handle().plugin(
                    tauri_plugin_log::Builder::default()
                        .level(log::LevelFilter::Info)
                        .build(),
                )?;
            }
            Ok(())
        })
        .build(tauri::generate_context!())
        .expect("error while building tauri application")
        .run(|_app_handle, _event| {
        });
}
