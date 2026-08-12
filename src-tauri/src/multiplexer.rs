use portable_pty::{native_pty_system, CommandBuilder, PtySize};
use std::collections::HashMap;
use std::io::{Read, Write};
use std::sync::{Arc, Mutex};
use std::thread;

const MAX_BUFFER_LINES: usize = 200;

pub struct MultiPtyState {
    pub writers: Arc<Mutex<HashMap<String, Box<dyn Write + Send>>>>,
    pub children: Arc<Mutex<HashMap<String, Box<dyn portable_pty::Child + Send + Sync>>>>,
    pub output_buffers: Arc<Mutex<HashMap<String, Vec<String>>>>,
}

impl MultiPtyState {
    pub fn new() -> Self {
        Self {
            writers: Arc::new(Mutex::new(HashMap::new())),
            children: Arc::new(Mutex::new(HashMap::new())),
            output_buffers: Arc::new(Mutex::new(HashMap::new())),
        }
    }
}

fn append_to_buffer(buffers: &Arc<Mutex<HashMap<String, Vec<String>>>>, id: &str, chunk: &str) {
    let mut map = buffers.lock().unwrap();
    let buf = map.entry(id.to_string()).or_default();
    for line in chunk.lines() {
        buf.push(line.to_string());
    }
    if buf.len() > MAX_BUFFER_LINES {
        let drain = buf.len() - MAX_BUFFER_LINES;
        buf.drain(0..drain);
    }
}

pub fn get_terminal_lines(state: &MultiPtyState, session_id: &str, n: usize) -> Vec<String> {
    let map = state.output_buffers.lock().unwrap();
    if let Some(buf) = map.get(session_id) {
        let start = buf.len().saturating_sub(n);
        return buf[start..].to_vec();
    }
    vec![]
}

#[tauri::command]
pub fn start_multiplex_pty(
    id: String,
    command: Option<String>,
    shell: Option<String>,
    cwd: Option<String>,
    app_handle: tauri::AppHandle,
    state: tauri::State<'_, MultiPtyState>,
) -> Result<(), String> {
    let pty_system = native_pty_system();
    let pair = pty_system
        .openpty(PtySize {
            rows: 24,
            cols: 80,
            pixel_width: 0,
            pixel_height: 0,
        })
        .map_err(|e| e.to_string())?;

    let default_shell = if let Some(s) = shell {
        if s == "cmd" {
            "cmd.exe".to_string()
        } else if s == "wsl" {
            "wsl.exe".to_string()
        } else {
            "powershell.exe".to_string()
        }
    } else if cfg!(target_os = "windows") {
        "powershell.exe".to_string()
    } else {
        std::env::var("SHELL").unwrap_or_else(|_| "/bin/bash".to_string())
    };
    let cmd_str = command.unwrap_or(default_shell);
    let mut cmd = CommandBuilder::new(cmd_str);
    if let Some(cwd_path) = cwd {
        cmd.cwd(cwd_path);
    }
    let child = pair.slave.spawn_command(cmd).map_err(|e| e.to_string())?;

    let mut reader = pair.master.try_clone_reader().map_err(|e| e.to_string())?;
    let writer = pair.master.take_writer().map_err(|e| e.to_string())?;

    state.writers.lock().unwrap().insert(id.clone(), writer);
    state.children.lock().unwrap().insert(id.clone(), child);
    state
        .output_buffers
        .lock()
        .unwrap()
        .insert(id.clone(), Vec::new());

    let id_clone = id.clone();
    let buffers = Arc::clone(&state.output_buffers);
    let children = Arc::clone(&state.children);
    let writers = Arc::clone(&state.writers);

    thread::spawn(move || {
        use tauri::Emitter;
        let mut buf = [0u8; 1024];
        while let Ok(n) = reader.read(&mut buf) {
            if n == 0 {
                break;
            }
            let s = String::from_utf8_lossy(&buf[..n]).to_string();
            append_to_buffer(&buffers, &id_clone, &s);
            let _ = app_handle.emit(&format!("pty-output-{}", id_clone), s);
        }

        let exit_code = {
            let mut children_guard = children.lock().unwrap();
            if let Some(mut child) = children_guard.remove(&id_clone) {
                child
                    .wait()
                    .ok()
                    .map(|s| s.exit_code() as i32)
                    .unwrap_or(-1)
            } else {
                -1
            }
        };
        writers.lock().unwrap().remove(&id_clone);
        let _ = app_handle.emit(&format!("pty-exit-{}", id_clone), exit_code);
    });

    Ok(())
}

#[tauri::command]
pub fn write_multiplex_pty(
    id: String,
    data: String,
    state: tauri::State<'_, MultiPtyState>,
) -> Result<(), String> {
    if let Some(writer) = state.writers.lock().unwrap().get_mut(&id) {
        writer
            .write_all(data.as_bytes())
            .map_err(|e| e.to_string())?;
    }
    Ok(())
}

#[tauri::command]
pub fn kill_multiplex_pty(
    id: String,
    state: tauri::State<'_, MultiPtyState>,
) -> Result<(), String> {
    if let Some(mut child) = state.children.lock().unwrap().remove(&id) {
        let _ = child.kill();
    }
    state.writers.lock().unwrap().remove(&id);
    state.output_buffers.lock().unwrap().remove(&id);
    Ok(())
}
