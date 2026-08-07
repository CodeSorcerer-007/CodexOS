use std::collections::HashMap;
use std::sync::Mutex;
use std::fs;
use std::path::PathBuf;
use serde::{Serialize, Deserialize};

use argon2::{Argon2};
use argon2::password_hash::{rand_core::OsRng, SaltString};
use chacha20poly1305::{
    aead::{Aead, AeadCore, KeyInit, OsRng as ChaChaRng},
    ChaCha20Poly1305, Nonce
};
use zeroize::Zeroizing;
use tauri::{AppHandle, Manager};

#[cfg(target_os = "windows")]
use std::os::windows::process::CommandExt;

#[derive(Serialize, Deserialize)]
struct EncryptedVault {
    salt: String,
    nonce: String, // hex
    ciphertext: String, // hex
}

pub struct SecretsState {
    pub cache: Mutex<HashMap<String, String>>,
    pub known_keys: Mutex<Vec<String>>,
    pub master_key: Mutex<Option<Zeroizing<Vec<u8>>>>,
}

impl SecretsState {
    pub fn new() -> Self {
        SecretsState {
            cache: Mutex::new(HashMap::new()),
            known_keys: Mutex::new(Vec::new()),
            master_key: Mutex::new(None),
        }
    }
}

// Helper to derive key
fn derive_key(password: &str, salt: &SaltString) -> Result<Zeroizing<Vec<u8>>, String> {
    let mut key = Zeroizing::new(vec![0u8; 32]);
    let argon2 = Argon2::default();
    let _ = argon2.hash_password_into(password.as_bytes(), salt.as_str().as_bytes(), &mut key)
        .map_err(|e| format!("Argon2 error: {}", e))?;
    Ok(key)
}

fn vault_path(app: &AppHandle) -> PathBuf {
    let mut path = app.path().app_data_dir().unwrap_or_else(|_| PathBuf::from("."));
    path.push("secrets_vault.json");
    path
}

#[tauri::command]
pub fn is_vault_locked(state: tauri::State<'_, SecretsState>) -> bool {
    state.master_key.lock().unwrap().is_none()
}

#[tauri::command]
pub fn unlock_vault(
    app: AppHandle,
    state: tauri::State<'_, SecretsState>,
    password: String,
) -> Result<bool, String> {
    let path = vault_path(&app);
    if !path.exists() {
        // Init new vault
        let salt = SaltString::generate(&mut OsRng);
        let key = derive_key(&password, &salt)?;
        
        let cipher = ChaCha20Poly1305::new(chacha20poly1305::Key::from_slice(&key));
        let nonce = ChaCha20Poly1305::generate_nonce(&mut ChaChaRng);
        
        let empty_cache: HashMap<String, String> = HashMap::new();
        let data = serde_json::to_vec(&empty_cache).unwrap();
        
        let ciphertext = cipher.encrypt(&nonce, data.as_ref())
            .map_err(|e| format!("Encrypt error: {}", e))?;
        
        let vault = EncryptedVault {
            salt: salt.to_string(),
            nonce: hex::encode(nonce),
            ciphertext: hex::encode(ciphertext),
        };
        fs::write(&path, serde_json::to_string(&vault).unwrap()).unwrap();
        
        *state.master_key.lock().unwrap() = Some(key);
        return Ok(true);
    }
    
    // Read existing
    let content = fs::read_to_string(&path).map_err(|e| e.to_string())?;
    let vault: EncryptedVault = serde_json::from_str(&content).map_err(|e| e.to_string())?;
    
    let salt = SaltString::from_b64(&vault.salt).map_err(|e| e.to_string())?;
    let key = derive_key(&password, &salt)?;
    
    let cipher = ChaCha20Poly1305::new(chacha20poly1305::Key::from_slice(&key));
    let nonce_bytes = hex::decode(&vault.nonce).map_err(|e| e.to_string())?;
    let nonce = Nonce::from_slice(&nonce_bytes);
    let cipher_bytes = hex::decode(&vault.ciphertext).map_err(|e| e.to_string())?;
    
    match cipher.decrypt(nonce, cipher_bytes.as_ref()) {
        Ok(pt) => {
            let map: HashMap<String, String> = serde_json::from_slice(&pt).unwrap_or_default();
            *state.cache.lock().unwrap() = map.clone();
            *state.known_keys.lock().unwrap() = map.keys().cloned().collect();
            *state.master_key.lock().unwrap() = Some(key);
            Ok(true)
        }
        Err(_) => {
            Err("Invalid password".to_string())
        }
    }
}

#[tauri::command]
pub fn lock_vault(state: tauri::State<'_, SecretsState>) -> Result<(), String> {
    state.cache.lock().unwrap().clear();
    state.known_keys.lock().unwrap().clear();
    *state.master_key.lock().unwrap() = None;
    Ok(())
}

fn save_vault(app: &AppHandle, state: &SecretsState) -> Result<(), String> {
    let mk_guard = state.master_key.lock().unwrap();
    let mk = mk_guard.as_ref().ok_or("Vault is locked")?;
    
    let path = vault_path(app);
    let content = fs::read_to_string(&path).map_err(|e| e.to_string())?;
    let mut vault: EncryptedVault = serde_json::from_str(&content).map_err(|e| e.to_string())?;
    
    let cipher = ChaCha20Poly1305::new(chacha20poly1305::Key::from_slice(mk));
    let nonce = ChaCha20Poly1305::generate_nonce(&mut ChaChaRng);
    
    let map = state.cache.lock().unwrap().clone();
    let pt = serde_json::to_vec(&map).unwrap();
    let ciphertext = cipher.encrypt(&nonce, pt.as_ref()).map_err(|e| e.to_string())?;
    
    vault.nonce = hex::encode(nonce);
    vault.ciphertext = hex::encode(ciphertext);
    
    fs::write(&path, serde_json::to_string(&vault).unwrap()).map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
pub fn add_secret(
    app: AppHandle,
    state: tauri::State<'_, SecretsState>,
    key: String,
    value: String,
) -> Result<(), String> {
    if state.master_key.lock().unwrap().is_none() {
        return Err("Vault is locked".to_string());
    }
    if !key.chars().all(|c| c.is_alphanumeric() || c == '_') {
        return Err("Key name must be alphanumeric with underscores only".to_string());
    }
    
    state.cache.lock().unwrap().insert(key.clone(), value);
    
    let mut keys = state.known_keys.lock().unwrap();
    if !keys.contains(&key) {
        keys.push(key.clone());
    }
    drop(keys);
    save_vault(&app, &state)?;
    
    Ok(())
}

/// Internal helper for Rust-side modules (e.g. ai.rs). Never exposed to the frontend.
pub fn get_secret_internal(state: &SecretsState, key: &str) -> Option<String> {
    if state.master_key.lock().unwrap().is_none() {
        return None;
    }
    state.cache.lock().unwrap().get(key).cloned()
}

#[tauri::command]
pub fn has_secret(state: tauri::State<'_, SecretsState>, key: String) -> bool {
    get_secret_internal(&state, &key).is_some()
}

#[tauri::command]
pub fn list_secret_keys(state: tauri::State<'_, SecretsState>) -> Vec<String> {
    if state.master_key.lock().unwrap().is_none() {
        return vec![];
    }
    state.known_keys.lock().unwrap().clone()
}

#[tauri::command]
pub fn remove_secret(
    app: AppHandle,
    state: tauri::State<'_, SecretsState>,
    key: String,
) -> Result<(), String> {
    if state.master_key.lock().unwrap().is_none() {
        return Err("Vault is locked".to_string());
    }
    
    state.cache.lock().unwrap().remove(&key);
    
    let mut keys = state.known_keys.lock().unwrap();
    keys.retain(|k| k != &key);
    drop(keys);
    save_vault(&app, &state)?;
    
    Ok(())
}

#[tauri::command]
pub fn run_with_secrets(
    state: tauri::State<'_, SecretsState>,
    cmd: String,
    required_keys: Vec<String>,
) -> Result<String, String> {
    if state.master_key.lock().unwrap().is_none() {
        return Err("Vault is locked".to_string());
    }
    
    let mut envs = HashMap::new();
    let cache = state.cache.lock().unwrap();
    
    for key in &required_keys {
        if let Some(val) = cache.get(key) {
            envs.insert(key.clone(), val.clone());
        } else {
            return Err(format!("Required secret '{}' is missing from the vault.", key));
        }
    }
    drop(cache);

    let mut cmd_obj = std::process::Command::new("cmd");
    
    #[cfg(target_os = "windows")]
    {
        const CREATE_NO_WINDOW: u32 = 0x08000000;
        cmd_obj.args(["/C", &cmd]).creation_flags(CREATE_NO_WINDOW);
    }
    
    #[cfg(not(target_os = "windows"))]
    {
        cmd_obj = std::process::Command::new("sh");
        cmd_obj.args(["-c", &cmd]);
    }
    
    cmd_obj.envs(&envs);

    let output = cmd_obj.output().map_err(|e| format!("Failed to execute process: {}", e))?;
    
    if output.status.success() {
        Ok(String::from_utf8_lossy(&output.stdout).to_string())
    } else {
        Err(String::from_utf8_lossy(&output.stderr).to_string())
    }
}
