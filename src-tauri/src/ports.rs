use serde::{Deserialize, Serialize};
use tauri::State;
use std::sync::Mutex;

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

#[tauri::command]
pub async fn start_tail_log(
    path: String,
    window: tauri::Window,
    state: State<'_, TailState>,
) -> Result<(), String> {
    use linemux::MuxedLines;
    use futures::stream::StreamExt;
    use tauri::Emitter;

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
pub fn stop_tail_log(state: State<'_, TailState>) -> Result<(), String> {
    let mut task_guard = state.task.lock().unwrap();
    if let Some(existing_task) = task_guard.take() {
        existing_task.abort();
    }
    Ok(())
}

#[tauri::command]
pub async fn execute_http_request(url: String, method: String, body: Option<String>) -> Result<String, String> {
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
