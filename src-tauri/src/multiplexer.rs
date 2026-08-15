use crate::error::AppResult;
use crate::util::lock_poison_recover;
use portable_pty::{native_pty_system, CommandBuilder, MasterPty, PtySize};
use std::collections::{HashMap, VecDeque};
use std::io::{Read, Write};
use std::sync::{Arc, Mutex};
use std::thread;

const MAX_BUFFER_LINES: usize = 200;

pub struct MultiPtyState {
    pub writers: Arc<Mutex<HashMap<String, Box<dyn Write + Send>>>>,
    pub masters: Arc<Mutex<HashMap<String, Box<dyn MasterPty + Send>>>>,
    pub children: Arc<Mutex<HashMap<String, Box<dyn portable_pty::Child + Send + Sync>>>>,
    pub output_buffers: Arc<Mutex<HashMap<String, VecDeque<String>>>>,
}

impl MultiPtyState {
    pub fn new() -> Self {
        Self {
            writers: Arc::new(Mutex::new(HashMap::new())),
            masters: Arc::new(Mutex::new(HashMap::new())),
            children: Arc::new(Mutex::new(HashMap::new())),
            output_buffers: Arc::new(Mutex::new(HashMap::new())),
        }
    }
}

fn append_to_buffer(buffers: &Arc<Mutex<HashMap<String, VecDeque<String>>>>, id: &str, chunk: &str) {
    let mut map = lock_poison_recover(buffers);
    let buf = map.entry(id.to_string()).or_default();
    for line in chunk.lines() {
        if buf.len() >= MAX_BUFFER_LINES {
            buf.pop_front();
        }
        buf.push_back(line.to_string());
    }
}

pub fn get_terminal_lines(state: &MultiPtyState, session_id: &str, n: usize) -> Vec<String> {
    let map = lock_poison_recover(&state.output_buffers);
    if let Some(buf) = map.get(session_id) {
        let start = buf.len().saturating_sub(n);
        return buf.iter().skip(start).cloned().collect();
    }
    vec![]
}

/// Executes the start_multiplex_pty command.
#[tauri::command]
pub fn start_multiplex_pty(
    id: String,
    command: Option<String>,
    shell: Option<String>,
    cwd: Option<String>,
    app_handle: tauri::AppHandle,
    state: tauri::State<'_, MultiPtyState>,
) -> AppResult<()> {
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
    if let Some(ref cwd_path) = cwd {
        let p = std::path::Path::new(cwd_path);
        if !p.exists() || !p.is_dir() {
            return Err(crate::error::AppError::Custom(format!(
                "Working directory does not exist: {}",
                cwd_path
            )));
        }
        cmd.cwd(cwd_path);
    }
    let child = pair.slave.spawn_command(cmd).map_err(|e| e.to_string())?;

    let mut reader = pair.master.try_clone_reader().map_err(|e| e.to_string())?;
    let writer = pair.master.take_writer().map_err(|e| e.to_string())?;

    lock_poison_recover(&state.writers).insert(id.clone(), writer);
    lock_poison_recover(&state.masters).insert(id.clone(), pair.master);
    lock_poison_recover(&state.children).insert(id.clone(), child);
    lock_poison_recover(&state.output_buffers).insert(id.clone(), VecDeque::new());

    let id_clone = id.clone();
    let buffers = Arc::clone(&state.output_buffers);
    let children = Arc::clone(&state.children);
    let writers = Arc::clone(&state.writers);
    let masters = Arc::clone(&state.masters);

    thread::spawn(move || {
        use tauri::Emitter;
        let mut buf = [0u8; 16_384];
        while let Ok(n) = reader.read(&mut buf) {
            if n == 0 {
                break;
            }
            let s = String::from_utf8_lossy(&buf[..n]).to_string();
            append_to_buffer(&buffers, &id_clone, &s);
            let _ = app_handle.emit(&format!("pty-output-{}", id_clone), s);
        }

        let exit_code = {
            let mut children_guard = lock_poison_recover(&children);
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
        lock_poison_recover(&writers).remove(&id_clone);
        lock_poison_recover(&masters).remove(&id_clone);
        let _ = app_handle.emit(&format!("pty-exit-{}", id_clone), exit_code);
    });

    Ok(())
}

/// Executes the resize_multiplex_pty command.
#[tauri::command]
pub fn resize_multiplex_pty(
    id: String,
    rows: u16,
    cols: u16,
    state: tauri::State<'_, MultiPtyState>,
) -> AppResult<()> {
    let mut guard = lock_poison_recover(&state.masters);
    if let Some(master) = guard.get_mut(&id) {
        master
            .resize(PtySize {
                rows,
                cols,
                pixel_width: 0,
                pixel_height: 0,
            })
            .map_err(|e| e.to_string())?;
    }
    Ok(())
}

/// Executes the write_multiplex_pty command.
#[tauri::command]
pub fn write_multiplex_pty(
    id: String,
    data: String,
    state: tauri::State<'_, MultiPtyState>,
) -> AppResult<()> {
    let mut guard = lock_poison_recover(&state.writers);
    if let Some(writer) = guard.get_mut(&id) {
        writer
            .write_all(data.as_bytes())
            .map_err(|e| e.to_string())?;
    }
    Ok(())
}

/// Executes the kill_multiplex_pty command.
#[tauri::command]
pub fn kill_multiplex_pty(
    id: String,
    state: tauri::State<'_, MultiPtyState>,
) -> AppResult<()> {
    let mut guard = lock_poison_recover(&state.children);
    if let Some(mut child) = guard.remove(&id) {
        let _ = child.kill();
    }
    lock_poison_recover(&state.writers).remove(&id);
    lock_poison_recover(&state.masters).remove(&id);
    lock_poison_recover(&state.output_buffers).remove(&id);
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_multipty_state_initialization() {
        let state = MultiPtyState::new();
        assert!(state.writers.lock().unwrap().is_empty());
        assert!(state.masters.lock().unwrap().is_empty());
        assert!(state.children.lock().unwrap().is_empty());
        assert!(state.output_buffers.lock().unwrap().is_empty());
    }

    #[test]
    fn test_multipty_state_poison_recovery() {
        let state = MultiPtyState::new();
        let writers_clone = Arc::clone(&state.writers);

        let _ = std::panic::catch_unwind(move || {
            let _guard = writers_clone.lock().unwrap();
            panic!("Simulated panic inside Mutex lock");
        });

        assert!(state.writers.is_poisoned());
        let guard = lock_poison_recover(&state.writers);
        assert!(guard.is_empty());
    }

    #[test]
    fn test_append_to_buffer() {
        let buffers = Arc::new(Mutex::new(HashMap::new()));
        let id = "test1";
        
        append_to_buffer(&buffers, id, "line1\nline2");
        
        let map = buffers.lock().unwrap();
        let buf = map.get(id).unwrap();
        assert_eq!(buf.len(), 2);
        assert_eq!(buf[0], "line1");
        assert_eq!(buf[1], "line2");
    }

    #[test]
    fn test_append_to_buffer_max_lines() {
        let buffers = Arc::new(Mutex::new(HashMap::new()));
        let id = "test2";
        
        let mut large_string = String::new();
        for i in 0..250 {
            large_string.push_str(&format!("line{}\n", i));
        }
        
        append_to_buffer(&buffers, id, &large_string);
        
        let map = buffers.lock().unwrap();
        let buf = map.get(id).unwrap();
        
        assert_eq!(buf.len(), MAX_BUFFER_LINES);
        assert_eq!(buf.back().unwrap(), "line249");
        assert_eq!(buf.front().unwrap(), "line50");
    }

    #[test]
    fn test_get_terminal_lines() {
        let state = MultiPtyState::new();
        append_to_buffer(&state.output_buffers, "session-1", "a\nb\nc\nd\ne");

        let lines = get_terminal_lines(&state, "session-1", 3);
        assert_eq!(lines, vec!["c", "d", "e"]);

        let non_existent = get_terminal_lines(&state, "non-existent", 3);
        assert!(non_existent.is_empty());
    }
}
