use crate::error::AppResult;
use notify::{Config, RecommendedWatcher, RecursiveMode, Watcher};
use std::collections::HashMap;
use std::path::Path;
use std::sync::Mutex;
use std::thread;

pub struct FsWatcherState {
    pub watchers: Mutex<HashMap<String, RecommendedWatcher>>,
}

impl FsWatcherState {
    pub fn new() -> Self {
        Self {
            watchers: Mutex::new(HashMap::new()),
        }
    }
}

fn lock_poison_recover<T>(mutex: &Mutex<T>) -> std::sync::MutexGuard<'_, T> {
    match mutex.lock() {
        Ok(guard) => guard,
        Err(poisoned) => poisoned.into_inner(),
    }
}

pub fn watch_directory(
    path: &str,
    app_handle: tauri::AppHandle,
    state: &FsWatcherState,
) -> AppResult<()> {
    let p = Path::new(path);
    if !p.exists() || !p.is_dir() {
        return Err(crate::error::AppError::Custom(format!(
            "Path does not exist or is not a directory: {}",
            path
        )));
    }

    let mut watchers = lock_poison_recover(&state.watchers);

    // Already watching this directory
    if watchers.contains_key(path) {
        return Ok(());
    }

    let path_clone = path.to_string();
    
    let (tx, rx) = std::sync::mpsc::channel();
    
    let mut watcher = notify::RecommendedWatcher::new(
        tx,
        Config::default().with_poll_interval(std::time::Duration::from_secs(2)),
    )
    .map_err(|e| e.to_string())?;

    watcher
        .watch(Path::new(path), RecursiveMode::NonRecursive)
        .map_err(|e| e.to_string())?;

    watchers.insert(path.to_string(), watcher);

    thread::spawn(move || {
        for res in rx {
            match res {
                Ok(event) => {
                    if let notify::EventKind::Modify(_) | notify::EventKind::Create(_) | notify::EventKind::Remove(_) = event.kind {
                        use tauri::Emitter;
                        let _ = app_handle.emit("fs-change", &path_clone);
                    }
                }
                Err(e) => log::error!("watch error: {:?}", e),
            }
        }
    });

    Ok(())
}

#[tauri::command]
pub fn start_fs_watch(
    app_handle: tauri::AppHandle,
    path: String,
    state: tauri::State<'_, FsWatcherState>,
) -> AppResult<()> {
    watch_directory(&path, app_handle, &state)
}

#[tauri::command]
pub fn stop_fs_watch(path: String, state: tauri::State<'_, FsWatcherState>) -> AppResult<()> {
    let mut watchers = lock_poison_recover(&state.watchers);
    watchers.remove(&path);
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_fs_watcher_state_initialization() {
        let state = FsWatcherState::new();
        assert!(state.watchers.lock().unwrap().is_empty());
    }

    #[test]
    fn test_fs_watcher_state_poison_recovery() {
        let state = FsWatcherState::new();

        let _ = std::panic::catch_unwind(|| {
            let _guard = state.watchers.lock().unwrap();
            panic!("Simulated lock panic");
        });

        assert!(state.watchers.is_poisoned());
        let guard = lock_poison_recover(&state.watchers);
        assert!(guard.is_empty());
    }
}
