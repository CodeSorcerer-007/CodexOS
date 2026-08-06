use std::collections::HashMap;
use std::sync::{Arc, Mutex};
use std::io::{Read, Write};
use portable_pty::{CommandBuilder, native_pty_system, PtySize};
use std::thread;

pub struct MultiPtyState {
    pub writers: Arc<Mutex<HashMap<String, Box<dyn Write + Send>>>>,
    pub children: Arc<Mutex<HashMap<String, Box<dyn portable_pty::Child + Send + Sync>>>>,
}

impl MultiPtyState {
    pub fn new() -> Self {
        Self {
            writers: Arc::new(Mutex::new(HashMap::new())),
            children: Arc::new(Mutex::new(HashMap::new())),
        }
    }
}

#[tauri::command]
pub fn start_multiplex_pty(
    id: String,
    command: Option<String>,
    app_handle: tauri::AppHandle,
    state: tauri::State<'_, MultiPtyState>
) -> Result<(), String> {
    let pty_system = native_pty_system();
    let pair = pty_system.openpty(PtySize {
        rows: 24,
        cols: 80,
        pixel_width: 0,
        pixel_height: 0,
    }).map_err(|e| e.to_string())?;

    let default_shell = if cfg!(target_os = "windows") {
        "powershell.exe".to_string()
    } else {
        std::env::var("SHELL").unwrap_or_else(|_| "/bin/bash".to_string())
    };
    let cmd_str = command.unwrap_or(default_shell);
    let cmd = CommandBuilder::new(cmd_str);
    let child = pair.slave.spawn_command(cmd).map_err(|e| e.to_string())?;

    let mut reader = pair.master.try_clone_reader().map_err(|e| e.to_string())?;
    let writer = pair.master.take_writer().map_err(|e| e.to_string())?;

    state.writers.lock().unwrap().insert(id.clone(), writer);
    state.children.lock().unwrap().insert(id.clone(), child);

    thread::spawn(move || {
        let mut buf = [0u8; 1024];
        use tauri::Emitter;
        while let Ok(n) = reader.read(&mut buf) {
            if n == 0 { break; }
            let s = String::from_utf8_lossy(&buf[..n]).to_string();
            // Emit with the ID so frontend can route the output to the correct terminal instance
            let _ = app_handle.emit(&format!("pty-output-{}", id), s);
        }
    });

    Ok(())
}

#[tauri::command]
pub fn write_multiplex_pty(
    id: String,
    data: String,
    state: tauri::State<'_, MultiPtyState>
) -> Result<(), String> {
    if let Some(writer) = state.writers.lock().unwrap().get_mut(&id) {
        writer.write_all(data.as_bytes()).map_err(|e| e.to_string())?;
    }
    Ok(())
}

#[tauri::command]
pub fn kill_multiplex_pty(
    id: String,
    state: tauri::State<'_, MultiPtyState>
) -> Result<(), String> {
    if let Some(mut child) = state.children.lock().unwrap().remove(&id) {
        let _ = child.kill();
    }
    state.writers.lock().unwrap().remove(&id);
    Ok(())
}
