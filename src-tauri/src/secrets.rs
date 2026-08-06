use keyring::Entry;
use std::collections::HashMap;
use std::sync::Mutex;
use serde::{Deserialize, Serialize};

#[cfg(target_os = "windows")]
use std::os::windows::process::CommandExt;

const SERVICE_NAME: &str = "vaultly";

pub struct SecretsState {
    pub cache: Mutex<HashMap<String, String>>,
    pub known_keys: Mutex<Vec<String>>,
}

impl SecretsState {
    pub fn new() -> Self {
        let state = SecretsState {
            cache: Mutex::new(HashMap::new()),
            known_keys: Mutex::new(Vec::new()),
        };
        // Load known keys from a special keyring entry on startup
        if let Ok(entry) = Entry::new(SERVICE_NAME, "__vault_keys__") {
            if let Ok(keys_json) = entry.get_password() {
                if let Ok(keys) = serde_json::from_str::<Vec<String>>(&keys_json) {
                    *state.known_keys.lock().unwrap() = keys;
                }
            }
        }
        state
    }
    
    fn persist_keys(&self) {
        let keys = self.known_keys.lock().unwrap().clone();
        if let Ok(entry) = Entry::new(SERVICE_NAME, "__vault_keys__") {
            let _ = entry.set_password(&serde_json::to_string(&keys).unwrap_or_default());
        }
    }
}

#[tauri::command]
pub fn add_secret(
    state: tauri::State<'_, SecretsState>,
    key: String,
    value: String,
) -> Result<(), String> {
    if !key.chars().all(|c| c.is_alphanumeric() || c == '_') {
        return Err("Key name must be alphanumeric with underscores only".to_string());
    }
    
    let entry = Entry::new(SERVICE_NAME, &key)
        .map_err(|e| format!("Keyring error: {}", e))?;
    entry.set_password(&value)
        .map_err(|e| format!("Failed to store secret: {}", e))?;
    
    state.cache.lock().unwrap().insert(key.clone(), value);
    
    let mut keys = state.known_keys.lock().unwrap();
    if !keys.contains(&key) {
        keys.push(key.clone());
        drop(keys);
        state.persist_keys();
    }
    
    Ok(())
}

#[tauri::command]
pub fn list_secret_keys(state: tauri::State<'_, SecretsState>) -> Vec<String> {
    state.known_keys.lock().unwrap().clone()
}

#[tauri::command]
pub fn remove_secret(
    state: tauri::State<'_, SecretsState>,
    key: String,
) -> Result<(), String> {
    if let Ok(entry) = Entry::new(SERVICE_NAME, &key) {
        let _ = entry.delete_credential();
    }
    
    state.cache.lock().unwrap().remove(&key);
    
    let mut keys = state.known_keys.lock().unwrap();
    keys.retain(|k| k != &key);
    drop(keys);
    state.persist_keys();
    
    Ok(())
}

#[tauri::command]
pub fn run_with_secrets(
    state: tauri::State<'_, SecretsState>,
    cmd: String,
    required_keys: Vec<String>,
) -> Result<String, String> {
    let mut envs = HashMap::new();
    
    for key in &required_keys {
        let cached = state.cache.lock().unwrap().get(key).cloned();
        
        let value = if let Some(v) = cached {
            v
        } else {
            let entry = Entry::new(SERVICE_NAME, key)
                .map_err(|e| format!("Keyring error for '{}': {}", key, e))?;
            let v = entry.get_password()
                .map_err(|_| format!("Secret '{}' not found in vault.", key))?;
            state.cache.lock().unwrap().insert(key.clone(), v.clone());
            v
        };
        
        envs.insert(key.clone(), value);
    }
    
    #[cfg(target_os = "windows")]
    let mut command = {
        const CREATE_NO_WINDOW: u32 = 0x08000000;
        let mut cmd_obj = std::process::Command::new("cmd");
        cmd_obj.args(&["/C", &cmd]).creation_flags(CREATE_NO_WINDOW);
        cmd_obj
    };

    #[cfg(not(target_os = "windows"))]
    let mut command = {
        let mut cmd_obj = std::process::Command::new("sh");
        cmd_obj.args(&["-c", &cmd]);
        cmd_obj
    };

    let output = command
        .envs(&envs)
        .output()
        .map_err(|e| format!("Failed to execute: {}", e))?;
    
    if output.status.success() {
        Ok(String::from_utf8_lossy(&output.stdout).into_owned())
    } else {
        Err(String::from_utf8_lossy(&output.stderr).into_owned())
    }
}

#[tauri::command]
pub fn export_secrets_to_env(
    state: tauri::State<'_, SecretsState>,
    output_path: String,
) -> Result<(), String> {
    let keys = state.known_keys.lock().unwrap().clone();
    let mut lines = Vec::new();
    
    for key in keys {
        let entry = Entry::new(SERVICE_NAME, &key)
            .map_err(|e| format!("Keyring error: {}", e))?;
        let value = entry.get_password()
            .map_err(|e| format!("Failed to read '{}': {}", key, e))?;
        lines.push(format!("{}={}", key, value));
    }
    
    std::fs::write(&output_path, lines.join("\n"))
        .map_err(|e| e.to_string())
}
