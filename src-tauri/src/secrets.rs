use std::collections::HashMap;
use std::sync::Mutex;
use std::process::Command;
use serde::{Deserialize, Serialize};
use std::os::windows::process::CommandExt;

// In-memory store for secrets during the session
pub struct SecretsState(pub Mutex<HashMap<String, String>>);

impl SecretsState {
    pub fn new() -> Self {
        SecretsState(Mutex::new(HashMap::new()))
    }
}

#[derive(Serialize, Deserialize)]
pub struct SecretItem {
    pub key: String,
    pub value: String,
}

#[tauri::command]
pub fn add_secret(state: tauri::State<'_, SecretsState>, key: String, value: String) -> Result<(), String> {
    let mut secrets = state.0.lock().unwrap();
    secrets.insert(key, value);
    Ok(())
}

#[tauri::command]
pub fn list_secret_keys(state: tauri::State<'_, SecretsState>) -> Vec<String> {
    let secrets = state.0.lock().unwrap();
    secrets.keys().cloned().collect()
}

#[tauri::command]
pub fn remove_secret(state: tauri::State<'_, SecretsState>, key: String) -> Result<(), String> {
    let mut secrets = state.0.lock().unwrap();
    secrets.remove(&key);
    Ok(())
}

#[tauri::command]
pub fn run_with_secrets(state: tauri::State<'_, SecretsState>, cmd: String, required_keys: Vec<String>) -> Result<String, String> {
    let secrets = state.0.lock().unwrap();
    
    let mut envs_to_inject = HashMap::new();
    for key in required_keys {
        if let Some(val) = secrets.get(&key) {
            envs_to_inject.insert(key, val.clone());
        } else {
            return Err(format!("Secret '{}' not found in vault.", key));
        }
    }

    const CREATE_NO_WINDOW: u32 = 0x08000000;

    // Run the command with injected envs
    let output = Command::new("cmd")
        .args(&["/C", &cmd])
        .envs(&envs_to_inject)
        .creation_flags(CREATE_NO_WINDOW)
        .output()
        .map_err(|e| format!("Failed to execute command: {}", e))?;

    if output.status.success() {
        Ok(String::from_utf8_lossy(&output.stdout).into_owned())
    } else {
        Err(String::from_utf8_lossy(&output.stderr).into_owned())
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    // Mock Tauri state injection for tests
    struct MockState(SecretsState);
    impl<'r> tauri::State<'r, SecretsState> for MockState {
        // Rust tests don't easily allow mocking Tauri's State type due to its private fields,
        // but we can test the internal logic directly without the tauri::command wrapper.
    }

    #[test]
    fn test_secret_storage() {
        let state = SecretsState::new();
        
        {
            let mut secrets = state.0.lock().unwrap();
            secrets.insert("TEST_KEY".to_string(), "TEST_VALUE".to_string());
        }

        let keys = {
            let secrets = state.0.lock().unwrap();
            secrets.keys().cloned().collect::<Vec<String>>()
        };

        assert_eq!(keys.len(), 1);
        assert_eq!(keys[0], "TEST_KEY");
    }
}
