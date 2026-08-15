use crate::error::{AppError, AppResult};
use serde::{Deserialize, Serialize};
use std::sync::Mutex;
use tauri::State;

fn require_absolute_dir(path: &str) -> AppResult<std::path::PathBuf> {
    let p = std::path::Path::new(path);
    if !p.is_absolute() {
        return Err(format!("Path must be absolute: {}", path).into());
    }
    if !p.is_dir() {
        return Err(format!("Path is not a directory: {}", path).into());
    }
    Ok(p.to_path_buf())
}

fn require_absolute_file(path: &str) -> AppResult<std::path::PathBuf> {
    let p = std::path::Path::new(path);
    if !p.is_absolute() {
        return Err(format!("Path must be absolute: {}", path).into());
    }
    if !p.is_file() {
        return Err(format!("Path is not a file: {}", path).into());
    }
    Ok(p.to_path_buf())
}

#[derive(Serialize, Deserialize)]
pub struct PortInfo {
    pub port: String,
    pub pid: String,
    pub process_name: String,
    pub state: String,
}

pub struct TailState {
    pub task: Mutex<Option<tauri::async_runtime::JoinHandle<()>>>,
}

/// Executes the get_active_ports command.
#[tauri::command]
pub fn get_active_ports() -> AppResult<Vec<PortInfo>> {
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
                        sys.process(sysinfo::Pid::from(pid_num))
                            .map(|p| p.name().to_string_lossy().to_string())
                            .unwrap_or_else(|| "Unknown".to_string())
                    } else {
                        "Unknown".to_string()
                    };

                    if !ports
                        .iter()
                        .any(|p: &PortInfo| p.port == port && p.pid == pid)
                    {
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
                let name_field = parts[8];
                let port = name_field.split(':').next_back().unwrap_or("").to_string();

                if !port.is_empty()
                    && !ports
                        .iter()
                        .any(|p: &PortInfo| p.port == port && p.pid == pid)
                {
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

fn lock_poison_recover<T>(mutex: &Mutex<T>) -> std::sync::MutexGuard<'_, T> {
    match mutex.lock() {
        Ok(guard) => guard,
        Err(poisoned) => poisoned.into_inner(),
    }
}

/// Executes the kill_process command.
#[tauri::command]
pub fn kill_process(pid: String) -> AppResult<String> {
    use std::process::Command;

    let trimmed_pid = pid.trim();
    if trimmed_pid.is_empty() || !trimmed_pid.chars().all(|c| c.is_ascii_digit()) {
        return Err(AppError::Custom("Invalid process ID: PID must be numeric digits only".to_string()));
    }

    let output = if cfg!(target_os = "windows") {
        Command::new("taskkill").args(["/F", "/PID", trimmed_pid]).output()
    } else {
        Command::new("kill").args(["-9", trimmed_pid]).output()
    }
    .map_err(|e| e.to_string())?;

    if output.status.success() {
        Ok(String::from_utf8_lossy(&output.stdout).into_owned())
    } else {
        Err(String::from_utf8_lossy(&output.stderr).into_owned().into())
    }
}

/// Executes the spawn_local_server command.
#[tauri::command]
pub fn spawn_local_server(path: String) -> AppResult<String> {
    let p = require_absolute_dir(&path)?;
    let base_canonical = p.canonicalize().map_err(|e| format!("Failed to resolve directory: {}", e))?;
    use std::thread;
    use tiny_http::{Response, Server};

    let port = 8080;
    let server_addr = format!("127.0.0.1:{}", port);
    let server = Server::http(&server_addr)
        .map_err(|e| format!("Failed to bind local server to {}: {}", server_addr, e))?;

    thread::spawn(move || {
        for request in server.incoming_requests() {
            let mut req_path = request.url().to_string();
            if let Some(pos) = req_path.find('?') {
                req_path = req_path[..pos].to_string();
            }
            if let Some(pos) = req_path.find('#') {
                req_path = req_path[..pos].to_string();
            }
            if req_path == "/" {
                req_path = "/index.html".to_string();
            }

            let sub_path = req_path.trim_start_matches('/');
            let target_path = base_canonical.join(sub_path);

            if let Ok(canonical_target) = target_path.canonicalize() {
                if canonical_target.starts_with(&base_canonical) && canonical_target.is_file() {
                    if let Ok(file) = std::fs::File::open(&canonical_target) {
                        let _ = request.respond(Response::from_file(file));
                        continue;
                    }
                }
            }

            let _ = request
                .respond(Response::from_string("404 Not Found").with_status_code(404));
        }
    });

    Ok(format!("http://127.0.0.1:{}", port))
}

/// Executes the start_tail_log command.
#[tauri::command]
pub async fn start_tail_log(
    window: tauri::Window,
    path: String,
    state: State<'_, TailState>,
) -> AppResult<()> {
    let p = require_absolute_file(&path)?;
    use futures::stream::StreamExt;
    use linemux::MuxedLines;
    use tauri::Emitter;

    let mut task_guard = lock_poison_recover(&state.task);
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

        if let Err(e) = mux.add_file(&p).await {
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

/// Executes the stop_tail_log command.
#[tauri::command]
pub fn stop_tail_log(state: State<'_, TailState>) -> AppResult<()> {
    let mut task_guard = lock_poison_recover(&state.task);
    if let Some(existing_task) = task_guard.take() {
        existing_task.abort();
    }
    Ok(())
}

/// Executes the execute_http_request command.
#[tauri::command]
pub async fn execute_http_request(
    url: String,
    method: String,
    body: Option<String>,
) -> AppResult<String> {
    tauri::async_runtime::spawn_blocking(move || {
        let client = reqwest::blocking::Client::builder()
            .timeout(std::time::Duration::from_secs(30))
            .build()
            .map_err(|e| e.to_string())?;

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
    })
    .await
    .map_err(AppError::from)?
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_require_absolute_paths() {
        let rel_path = "some/relative/path";
        assert!(require_absolute_dir(rel_path).is_err());
        assert!(require_absolute_file(rel_path).is_err());

        #[cfg(target_os = "windows")]
        let abs_path = "C:\\nonexistent\\dir\\path";
        #[cfg(not(target_os = "windows"))]
        let abs_path = "/nonexistent/dir/path";

        let err_dir = require_absolute_dir(abs_path);
        assert!(err_dir.is_err());

        let err_file = require_absolute_file(abs_path);
        assert!(err_file.is_err());
    }

    #[test]
    fn test_kill_process_invalid_pid() {
        assert!(kill_process("".to_string()).is_err());
        assert!(kill_process("abc".to_string()).is_err());
        assert!(kill_process("123; rm -rf /".to_string()).is_err());
    }

    #[test]
    fn test_tail_state_poison_recovery() {
        let state = TailState {
            task: Mutex::new(None),
        };
        let _ = std::panic::catch_unwind(|| {
            let _guard = state.task.lock().unwrap();
            panic!("Simulated tail state lock panic");
        });

        assert!(state.task.is_poisoned());
        let guard = lock_poison_recover(&state.task);
        assert!(guard.is_none());
    }

    #[test]
    fn test_spawn_local_server_relative_path() {
        assert!(spawn_local_server("relative/dir".to_string()).is_err());
    }
}
