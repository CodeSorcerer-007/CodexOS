use std::collections::HashMap;
use std::sync::Mutex;
use std::sync::atomic::{AtomicUsize, Ordering};
use serde::{Deserialize, Serialize};

pub struct TunnelState {
    pub active_tunnels: Mutex<HashMap<u16, TunnelInfo>>,
    counter: AtomicUsize,
}

impl TunnelState {
    pub fn new() -> Self {
        TunnelState {
            active_tunnels: Mutex::new(HashMap::new()),
            counter: AtomicUsize::new(0),
        }
    }
}

#[derive(Clone, Serialize, Deserialize)]
pub struct TunnelInfo {
    pub local_port: u16,
    pub public_url: String,
    pub status: String,
    pub bytes_transferred: String,
}

#[tauri::command]
pub fn start_tunnel(state: tauri::State<'_, TunnelState>, local_port: u16) -> Result<TunnelInfo, String> {
    let mut tunnels = state.active_tunnels.lock().unwrap();
    
    if tunnels.contains_key(&local_port) {
        return Err(format!("Port {} is already tunneled.", local_port));
    }

    let id = state.counter.fetch_add(1, Ordering::SeqCst);
    // Simulate generating a unique, secure public URL
    let public_url = format!("https://vault-tun-{:04x}.vaultly.net", id + 4096);
    
    let info = TunnelInfo {
        local_port,
        public_url,
        status: "Active".to_string(),
        bytes_transferred: "0 KB".to_string(),
    };

    tunnels.insert(local_port, info.clone());
    Ok(info)
}

#[tauri::command]
pub fn stop_tunnel(state: tauri::State<'_, TunnelState>, local_port: u16) -> Result<(), String> {
    let mut tunnels = state.active_tunnels.lock().unwrap();
    tunnels.remove(&local_port);
    Ok(())
}

#[tauri::command]
pub fn list_tunnels(state: tauri::State<'_, TunnelState>) -> Vec<TunnelInfo> {
    let tunnels = state.active_tunnels.lock().unwrap();
    tunnels.values().cloned().collect()
}
