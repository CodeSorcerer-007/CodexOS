use tauri::Emitter;
use tokio::net::TcpListener;
use tokio::io::AsyncReadExt;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;

pub struct ProxyState {
    pub is_running: Arc<AtomicBool>,
}

#[tauri::command]
pub async fn start_proxy(app_handle: tauri::AppHandle, state: tauri::State<'_, ProxyState>) -> Result<(), String> {
    if state.is_running.load(Ordering::SeqCst) {
        return Err("Proxy is already running".to_string());
    }

    state.is_running.store(true, Ordering::SeqCst);
    let is_running = state.is_running.clone();

    tokio::spawn(async move {
        let listener = match TcpListener::bind("127.0.0.1:8080").await {
            Ok(l) => l,
            Err(e) => {
                let _ = app_handle.emit("proxy-error", e.to_string());
                return;
            }
        };

        while is_running.load(Ordering::SeqCst) {
            if let Ok((mut socket, _addr)) = listener.accept().await {
                let app_handle = app_handle.clone();
                tokio::spawn(async move {
                    let mut buf = [0; 4096];
                    if let Ok(n) = socket.read(&mut buf).await {
                        if n > 0 {
                            let request_str = String::from_utf8_lossy(&buf[..n]).to_string();
                            let _ = app_handle.emit("proxy-request", request_str);
                        }
                    }
                });
            }
        }
    });

    Ok(())
}

#[tauri::command]
pub fn stop_proxy(state: tauri::State<'_, ProxyState>) -> Result<(), String> {
    state.is_running.store(false, Ordering::SeqCst);
    Ok(())
}
