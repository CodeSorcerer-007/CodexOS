use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::io::{BufRead, BufReader};
use std::process::{Child, Command, Stdio};
use std::sync::{Arc, Mutex};
use tauri::Emitter;

pub struct TunnelProcess {
    pub child: Child,
    pub public_url: String,
    pub local_port: u16,
}

pub struct TunnelState {
    pub tunnels: Arc<Mutex<HashMap<u16, TunnelProcess>>>,
}

impl TunnelState {
    pub fn new() -> Self {
        TunnelState {
            tunnels: Arc::new(Mutex::new(HashMap::new())),
        }
    }
}

#[derive(Clone, Serialize, Deserialize)]
pub struct TunnelInfo {
    pub local_port: u16,
    pub public_url: String,
    pub status: String,
}

#[tauri::command]
pub fn start_tunnel(
    app_handle: tauri::AppHandle,
    state: tauri::State<'_, TunnelState>,
    local_port: u16,
) -> Result<TunnelInfo, String> {
    let mut tunnels = state.tunnels.lock().unwrap();
    if tunnels.contains_key(&local_port) {
        return Err(format!("Port {} is already tunneled.", local_port));
    }

    // Use serveo.net for free SSH tunneling
    // ssh -R 80:localhost:{port} nokey@serveo.net
    let mut child = Command::new("ssh")
        .args([
            "-o",
            "StrictHostKeyChecking=accept-new",
            "-o",
            "ServerAliveInterval=60",
            "-R",
            &format!("80:localhost:{}", local_port),
            "nokey@serveo.net",
        ])
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn()
        .map_err(|e| {
            format!(
                "Failed to start SSH tunnel: {}. Make sure OpenSSH is installed.",
                e
            )
        })?;

    // Read the assigned URL from ssh output
    // serveo.net outputs: "Forwarding HTTP traffic from https://xxxx.serveo.net"
    let stderr = child.stderr.take().ok_or("Could not capture ssh stderr")?;

    let reader = BufReader::new(stderr);
    let mut public_url = String::new();

    for line in reader.lines().take(20).flatten() {
        // Emit progress to frontend
        let _ = app_handle.emit("tunnel-log", &line);
        if line.contains("https://") {
            // Extract URL from the line
            if let Some(url_start) = line.find("https://") {
                public_url = line[url_start..]
                    .split_whitespace()
                    .next()
                    .unwrap_or("")
                    .to_string();
                break;
            }
        }
        if line.contains("http://") {
            if let Some(url_start) = line.find("http://") {
                public_url = line[url_start..]
                    .split_whitespace()
                    .next()
                    .unwrap_or("")
                    .to_string();
                break;
            }
        }
    }

    if public_url.is_empty() {
        let _ = child.kill();
        return Err(
            "Could not obtain public URL from SSH relay. Check your internet connection."
                .to_string(),
        );
    }

    let info = TunnelInfo {
        local_port,
        public_url: public_url.clone(),
        status: "Active".to_string(),
    };

    tunnels.insert(
        local_port,
        TunnelProcess {
            child,
            public_url,
            local_port,
        },
    );

    Ok(info)
}

#[tauri::command]
pub fn stop_tunnel(state: tauri::State<'_, TunnelState>, local_port: u16) -> Result<(), String> {
    let mut tunnels = state.tunnels.lock().unwrap();
    if let Some(mut tunnel) = tunnels.remove(&local_port) {
        let _ = tunnel.child.kill();
    }
    Ok(())
}

#[tauri::command]
pub fn list_tunnels(state: tauri::State<'_, TunnelState>) -> Vec<TunnelInfo> {
    let tunnels = state.tunnels.lock().unwrap();
    tunnels
        .values()
        .map(|t| TunnelInfo {
            local_port: t.local_port,
            public_url: t.public_url.clone(),
            status: "Active".to_string(),
        })
        .collect()
}
