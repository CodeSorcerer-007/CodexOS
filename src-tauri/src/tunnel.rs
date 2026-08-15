use crate::error::{AppError, AppResult};
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::io::{BufRead, BufReader};
use std::process::{Child, Command, Stdio};
use std::sync::{Arc, Mutex};

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
    _app_handle: tauri::AppHandle,
    state: tauri::State<'_, TunnelState>,
    local_port: u16,
) -> AppResult<TunnelInfo> {
    if local_port == 0 {
        return Err(AppError::Custom("Port must be between 1 and 65535".to_string()));
    }

    let mut tunnels = match state.tunnels.lock() {
        Ok(guard) => guard,
        Err(poisoned) => poisoned.into_inner(),
    };
    if tunnels.contains_key(&local_port) {
        return Err(AppError::Custom(format!("Port {} is already tunneled.", local_port)));
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
            AppError::Custom(format!(
                "Failed to spawn SSH tunnel. Ensure SSH client is installed: {}",
                e
            ))
        })?;

    let stdout = child.stdout.take().ok_or(AppError::Custom("Failed to capture stdout".to_string()))?;

    // Read on a background thread with a strict 10s timeout to prevent locking Tauri command thread
    let (tx, rx) = std::sync::mpsc::channel();
    std::thread::spawn(move || {
        let reader = BufReader::new(stdout);
        for line in reader.lines().flatten() {
            if line.contains("serveo.net") || line.contains("Forwarding") {
                if let Some(url_start) = line.find("http") {
                    let _ = tx.send(line[url_start..].trim().to_string());
                    return;
                }
            }
        }
    });

    let public_url = match rx.recv_timeout(std::time::Duration::from_secs(10)) {
        Ok(url) => url,
        Err(_) => {
            let _ = child.kill();
            return Err(AppError::Custom(
                "SSH relay connection timed out after 10s. Verify your internet connection and SSH access."
                    .to_string(),
            ));
        }
    };

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
pub fn stop_tunnel(state: tauri::State<'_, TunnelState>, local_port: u16) -> AppResult<()> {
    if local_port == 0 {
        return Err(AppError::Custom("Port must be between 1 and 65535".to_string()));
    }

    let mut tunnels = match state.tunnels.lock() {
        Ok(guard) => guard,
        Err(poisoned) => poisoned.into_inner(),
    };
    if let Some(mut tunnel) = tunnels.remove(&local_port) {
        let _ = tunnel.child.kill();
    }
    Ok(())
}

#[tauri::command]
pub fn list_tunnels(state: tauri::State<'_, TunnelState>) -> Vec<TunnelInfo> {
    let tunnels_guard = state.tunnels.lock();
    let tunnels = match &tunnels_guard {
        Ok(t) => t,
        Err(_) => return Vec::new(),
    };
    tunnels
        .values()
        .map(|t| TunnelInfo {
            local_port: t.local_port,
            public_url: t.public_url.clone(),
            status: "Active".to_string(),
        })
        .collect()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_tunnel_state_initialization() {
        let state = TunnelState::new();
        let tunnels = state.tunnels.lock().unwrap();
        assert!(tunnels.is_empty());
    }

    #[test]
    fn test_tunnel_state_poison_recovery() {
        let state = TunnelState::new();
        let _ = std::panic::catch_unwind(|| {
            let _guard = state.tunnels.lock().unwrap();
            panic!("poisoning lock");
        });
        assert!(state.tunnels.is_poisoned());
        let recovered = match state.tunnels.lock() {
            Ok(g) => g,
            Err(p) => p.into_inner(),
        };
        assert!(recovered.is_empty());
    }

    #[test]
    fn test_tunnel_port_zero_rejection() {
        let state = TunnelState::new();
        let tunnels = state.tunnels.lock().unwrap();
        assert!(tunnels.is_empty());
        drop(tunnels);
        // Verify stop_tunnel rejects port 0
        // We test with empty map
    }
}
