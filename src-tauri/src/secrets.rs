use crate::error::AppError;
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::fs;
use std::path::PathBuf;
use std::sync::Mutex;

use argon2::password_hash::{rand_core::OsRng, SaltString};
use argon2::Argon2;
use chacha20poly1305::{
    aead::{Aead, AeadCore, KeyInit, OsRng as ChaChaRng},
    ChaCha20Poly1305, Nonce,
};
use tauri::{AppHandle, Manager};
use zeroize::Zeroizing;

fn default_m_cost() -> u32 {
    65536
}
fn default_t_cost() -> u32 {
    3
}
fn default_p_cost() -> u32 {
    1
}
fn default_vault_version() -> u32 {
    1
}

#[derive(Serialize, Deserialize)]
struct EncryptedVault {
    salt: String,
    nonce: String,      // hex
    ciphertext: String, // hex
    #[serde(default)]
    failed_attempts: u32,
    #[serde(default)]
    last_failed_unix: u64,
    #[serde(default = "default_m_cost")]
    m_cost: u32,
    #[serde(default = "default_t_cost")]
    t_cost: u32,
    #[serde(default = "default_p_cost")]
    p_cost: u32,
    #[serde(default = "default_vault_version")]
    version: u32,
}

pub struct SecretsState {
    pub cache: Mutex<HashMap<String, String>>,
    pub known_keys: Mutex<Vec<String>>,
    pub master_key: Mutex<Option<Zeroizing<Vec<u8>>>>,
    pub vault_salt: Mutex<Option<String>>,
    pub failed_attempts: Mutex<u32>,
    pub last_failed_attempt: Mutex<Option<std::time::Instant>>,
}

impl SecretsState {
    pub fn new() -> Self {
        SecretsState {
            cache: Mutex::new(HashMap::new()),
            known_keys: Mutex::new(Vec::new()),
            master_key: Mutex::new(None),
            vault_salt: Mutex::new(None),
            failed_attempts: Mutex::new(0),
            last_failed_attempt: Mutex::new(None),
        }
    }
}

// Helper to derive key with explicit or default Argon2 parameters
fn derive_key(
    password: &str,
    salt: &SaltString,
    m_cost: u32,
    t_cost: u32,
    p_cost: u32,
) -> crate::error::AppResult<Zeroizing<Vec<u8>>> {
    let mut key = Zeroizing::new(vec![0u8; 32]);
    let params_res = argon2::Params::new(m_cost, t_cost, p_cost, Some(32));
    let argon2 = match params_res {
        Ok(params) => Argon2::new(argon2::Algorithm::Argon2id, argon2::Version::V0x13, params),
        Err(_) => Argon2::default(),
    };
    argon2
        .hash_password_into(password.as_bytes(), salt.as_str().as_bytes(), &mut key)
        .map_err(|e| format!("Argon2 error: {}", e))?;
    Ok(key)
}

fn vault_path(app: &AppHandle) -> PathBuf {
    let mut path = app
        .path()
        .app_data_dir()
        .unwrap_or_else(|_| PathBuf::from("."));
    path.push("secrets_vault.json");
    path
}

fn ensure_vault_dir(app: &AppHandle) -> crate::error::AppResult<()> {
    let path = app
        .path()
        .app_data_dir()
        .map_err(|e| format!("App data dir error: {}", e))?;
    if !path.exists() {
        fs::create_dir_all(&path).map_err(|e| format!("Failed to create app data dir: {}", e))?;
    }
    Ok(())
}

fn current_unix_timestamp() -> u64 {
    use std::time::{SystemTime, UNIX_EPOCH};
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_secs()
}

#[tauri::command]
pub fn is_vault_locked(state: tauri::State<'_, SecretsState>) -> bool {
    state.master_key.lock().map(|m| m.is_none()).unwrap_or(true)
}

#[tauri::command]
pub fn unlock_vault(
    app: AppHandle,
    state: tauri::State<'_, SecretsState>,
    password: String,
) -> crate::error::AppResult<bool> {
    if password.len() < crate::util::MIN_PASSWORD_LENGTH {
        return Err(format!("Password must be at least {} characters", crate::util::MIN_PASSWORD_LENGTH).into());
    }

    let path = vault_path(&app);
    if !path.exists() {
        // Init new vault with hardened, versioned Argon2 parameters
        let salt = SaltString::generate(&mut OsRng);
        let key = derive_key(&password, &salt, default_m_cost(), default_t_cost(), default_p_cost())?;

        let cipher = ChaCha20Poly1305::new(chacha20poly1305::Key::from_slice(&key));
        let nonce = ChaCha20Poly1305::generate_nonce(&mut ChaChaRng);

        let empty_cache: HashMap<String, String> = HashMap::new();
        let data =
            serde_json::to_vec(&empty_cache).map_err(|e| format!("Serialize error: {}", e))?;

        let ciphertext = cipher
            .encrypt(&nonce, data.as_ref())
            .map_err(|e| format!("Encrypt error: {}", e))?;

        let vault = EncryptedVault {
            salt: salt.to_string(),
            nonce: hex::encode(nonce),
            ciphertext: hex::encode(ciphertext),
            failed_attempts: 0,
            last_failed_unix: 0,
            m_cost: default_m_cost(),
            t_cost: default_t_cost(),
            p_cost: default_p_cost(),
            version: default_vault_version(),
        };
        ensure_vault_dir(&app)?;
        let vault_json =
            serde_json::to_string(&vault).map_err(|e| format!("Serialize vault error: {}", e))?;
        fs::write(&path, vault_json).map_err(|e| format!("Failed to write vault: {}", e))?;

        *state.master_key.lock().map_err(|_| "lock poisoned")? = Some(key);
        *state.vault_salt.lock().map_err(|_| "lock poisoned")? = Some(salt.to_string());
        return Ok(true);
    }

    // Read existing
    let content = fs::read_to_string(&path).map_err(|e| e.to_string())?;
    let mut vault: EncryptedVault = serde_json::from_str(&content).map_err(|e| e.to_string())?;

    let now = current_unix_timestamp();
    if vault.failed_attempts >= 3 {
        let elapsed = now.saturating_sub(vault.last_failed_unix);
        let required_wait = match vault.failed_attempts {
            3 => 10,
            4 => 60,
            _ => 600,
        };
        if elapsed < required_wait {
            return Err(
                format!("Vault locked due to multiple failed attempts. Please wait {} seconds.", required_wait - elapsed).into()
            );
        }
    }

    let salt = SaltString::from_b64(&vault.salt).map_err(|e| e.to_string())?;
    let m_cost = if vault.m_cost > 0 { vault.m_cost } else { default_m_cost() };
    let t_cost = if vault.t_cost > 0 { vault.t_cost } else { default_t_cost() };
    let p_cost = if vault.p_cost > 0 { vault.p_cost } else { default_p_cost() };

    let mut key = derive_key(&password, &salt, m_cost, t_cost, p_cost)?;

    let cipher = ChaCha20Poly1305::new(chacha20poly1305::Key::from_slice(&key));
    let nonce_bytes = hex::decode(&vault.nonce).map_err(|e| e.to_string())?;
    let nonce = Nonce::from_slice(&nonce_bytes);
    let cipher_bytes = hex::decode(&vault.ciphertext).map_err(|e| e.to_string())?;

    let mut decrypted = cipher.decrypt(nonce, cipher_bytes.as_ref());
    if decrypted.is_err() {
        // Fallback with Argon2::default() in case it was created with library defaults
        let fallback_argon = Argon2::default();
        let mut fallback_key = Zeroizing::new(vec![0u8; 32]);
        if fallback_argon.hash_password_into(password.as_bytes(), salt.as_str().as_bytes(), &mut fallback_key).is_ok() {
            let fallback_cipher = ChaCha20Poly1305::new(chacha20poly1305::Key::from_slice(&fallback_key));
            if let Ok(pt) = fallback_cipher.decrypt(nonce, cipher_bytes.as_ref()) {
                key = fallback_key;
                decrypted = Ok(pt);
            }
        }
    }

    match decrypted {
        Ok(pt) => {
            let map: HashMap<String, String> = serde_json::from_slice(&pt).map_err(|e| {
                format!(
                    "Vault data is corrupted and could not be read ({}). \
                     Your vault file may be damaged. Back up '{}' and contact support.",
                    e,
                    vault_path(&app).display()
                )
            })?;
            *state.cache.lock().map_err(|_| "lock poisoned")? = map.clone();
            *state.known_keys.lock().map_err(|_| "lock poisoned")? = map.keys().cloned().collect();
            *state.master_key.lock().map_err(|_| "lock poisoned")? = Some(key);
            *state.vault_salt.lock().map_err(|_| "lock poisoned")? = Some(vault.salt.clone());
            *state.failed_attempts.lock().map_err(|_| "lock poisoned")? = 0;
            *state.last_failed_attempt.lock().map_err(|_| "lock poisoned")? = None;
            
            vault.failed_attempts = 0;
            vault.last_failed_unix = 0;
            if let Ok(vault_json) = serde_json::to_string(&vault) {
                let _ = fs::write(&path, vault_json);
            }
            Ok(true)
        }
        Err(_) => {
            *state.failed_attempts.lock().map_err(|_| "lock poisoned")? += 1;
            *state.last_failed_attempt.lock().map_err(|_| "lock poisoned")? = Some(std::time::Instant::now());
            
            vault.failed_attempts += 1;
            vault.last_failed_unix = now;
            if let Ok(vault_json) = serde_json::to_string(&vault) {
                let _ = fs::write(&path, vault_json);
            }
            Err("Invalid password".to_string().into())
        }
    }
}

#[tauri::command]
pub fn lock_vault(state: tauri::State<'_, SecretsState>) -> crate::error::AppResult<()> {
    state.cache.lock().map_err(|_| "lock poisoned")?.clear();
    state.known_keys.lock().map_err(|_| "lock poisoned")?.clear();
    *state.master_key.lock().map_err(|_| "lock poisoned")? = None;
    *state.vault_salt.lock().map_err(|_| "lock poisoned")? = None;
    Ok(())
}

fn save_vault(app: &AppHandle, state: &SecretsState) -> crate::error::AppResult<()> {
    let mk_guard = state.master_key.lock().map_err(|_| "lock poisoned")?;
    let mk = mk_guard.as_ref().ok_or("Vault is locked")?;

    let salt_guard = state.vault_salt.lock().map_err(|_| "lock poisoned")?;
    let salt_str = salt_guard.as_ref().ok_or("Vault salt missing")?;

    let path = vault_path(app);

    let cipher = ChaCha20Poly1305::new(chacha20poly1305::Key::from_slice(mk));
    let nonce = ChaCha20Poly1305::generate_nonce(&mut ChaChaRng);

    let map = state.cache.lock().map_err(|_| "lock poisoned")?.clone();
    let pt = serde_json::to_vec(&map).map_err(|e| format!("Serialize cache error: {}", e))?;
    let ciphertext = cipher
        .encrypt(&nonce, pt.as_ref())
        .map_err(|e| e.to_string())?;

    let failed_attempts = *state.failed_attempts.lock().map_err(|_| "lock poisoned")?;
    let last_failed_unix = if failed_attempts > 0 {
        if let Ok(content) = fs::read_to_string(&path) {
            serde_json::from_str::<EncryptedVault>(&content)
                .map(|v| v.last_failed_unix)
                .unwrap_or(0)
        } else {
            0
        }
    } else {
        0
    };

    let vault = EncryptedVault {
        salt: salt_str.to_string(),
        nonce: hex::encode(nonce),
        ciphertext: hex::encode(ciphertext),
        failed_attempts,
        last_failed_unix,
        m_cost: default_m_cost(),
        t_cost: default_t_cost(),
        p_cost: default_p_cost(),
        version: default_vault_version(),
    };

    let vault_json =
        serde_json::to_string(&vault).map_err(|e| format!("Serialize vault error: {}", e))?;
    fs::write(&path, vault_json).map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
pub fn add_secret(
    app: AppHandle,
    state: tauri::State<'_, SecretsState>,
    key: String,
    value: String,
) -> crate::error::AppResult<()> {
    if state.master_key.lock().map_err(|_| "lock poisoned")?.is_none() {
        return Err("Vault is locked".to_string().into());
    }
    if !key.chars().all(|c| c.is_alphanumeric() || c == '_') {
        return Err("Key name must be alphanumeric with underscores only".to_string().into());
    }

    state.cache.lock().map_err(|_| "lock poisoned")?.insert(key.clone(), value);

    let mut keys = state.known_keys.lock().map_err(|_| "lock poisoned")?;
    if !keys.contains(&key) {
        keys.push(key.clone());
    }
    drop(keys);
    save_vault(&app, &state)?;

    Ok(())
}

/// Internal helper for Rust-side modules (e.g. ai.rs). Never exposed to the frontend.
pub fn get_secret_internal(state: &SecretsState, key: &str) -> Option<String> {
    if state.master_key.lock().map(|m| m.is_none()).unwrap_or(true) {
        return None;
    }
    state.cache.lock().ok()?.get(key).cloned()
}

#[tauri::command]
pub fn has_secret(state: tauri::State<'_, SecretsState>, key: String) -> bool {
    get_secret_internal(&state, &key).is_some()
}

#[tauri::command]
pub fn list_secret_keys(state: tauri::State<'_, SecretsState>) -> Vec<String> {
    if state.master_key.lock().map(|m| m.is_none()).unwrap_or(true) {
        return vec![];
    }
    state.known_keys.lock().map(|k| k.clone()).unwrap_or_default()
}

#[tauri::command]
pub fn remove_secret(
    app: AppHandle,
    state: tauri::State<'_, SecretsState>,
    key: String,
) -> crate::error::AppResult<()> {
    if state.master_key.lock().map_err(|_| "lock poisoned")?.is_none() {
        return Err("Vault is locked".to_string().into());
    }

    state.cache.lock().map_err(|_| "lock poisoned")?.remove(&key);

    let mut keys = state.known_keys.lock().map_err(|_| "lock poisoned")?;
    keys.retain(|k| k != &key);
    drop(keys);
    save_vault(&app, &state)?;

    Ok(())
}

#[tauri::command]
pub fn export_secrets_to_env(
    state: tauri::State<'_, SecretsState>,
    paths_state: tauri::State<'_, crate::files::AllowedPathsState>,
    output_path: String,
) -> crate::error::AppResult<()> {
    if state.master_key.lock().map_err(|_| "lock poisoned")?.is_none() {
        return Err("Vault is locked".to_string().into());
    }
    // Validate output path against the workspace sandbox before writing any
    // plaintext secrets to disk. Prevents inadvertent writes outside the
    // opened workspace (e.g. to a system directory or cloud-sync folder).
    crate::files::validate_path(&output_path, &paths_state)?;
    let cache = state.cache.lock().map_err(|_| "lock poisoned")?;
    let mut env_content = String::from("# WARNING: This file contains unencrypted secrets. Do NOT commit to version control.\n\n");
    for (k, v) in cache.iter() {
        env_content.push_str(&format!("{}={}\n", k, v));
    }
    drop(cache);
    fs::write(&output_path, env_content).map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
pub fn run_with_secrets(
    state: tauri::State<'_, SecretsState>,
    cmd: String,
    required_keys: Vec<String>,
) -> crate::error::AppResult<String> {
    if state.master_key.lock().map_err(|_| "lock poisoned")?.is_none() {
        return Err("Vault is locked".to_string().into());
    }

    let mut envs = HashMap::new();
    let cache = state.cache.lock().map_err(|_| "lock poisoned")?;

    for key in &required_keys {
        if let Some(val) = cache.get(key) {
            envs.insert(key.clone(), val.clone());
        } else {
            return Err(format!(
                "Required secret key '{}' is not present in the vault",
                key
            ).into());
        }
    }
    drop(cache);

    let argv = split_command_args(&cmd).map_err(|e| format!("Invalid command syntax: {}", e))?;

    if argv.is_empty() {
        return Err("Command must not be empty".to_string().into());
    }

    let executable = &argv[0];
    let args = &argv[1..];

    for ch in ['&', '|', ';', '`', '$', '<', '>'] {
        if executable.contains(ch) {
            return Err(AppError::Custom(format!(
                "Command contains disallowed shell metacharacter '{}'",
                ch
            )));
        }
    }

    let mut cmd_obj = std::process::Command::new(executable);
    cmd_obj.args(args);
    cmd_obj.envs(&envs);

    #[cfg(target_os = "windows")]
    {
        use std::os::windows::process::CommandExt;
        const CREATE_NO_WINDOW: u32 = 0x08000000;
        cmd_obj.creation_flags(CREATE_NO_WINDOW);
    }

    let output = cmd_obj
        .output()
        .map_err(|e| format!("Failed to execute process: {}", e))?;

    if output.status.success() {
        Ok(String::from_utf8_lossy(&output.stdout).to_string())
    } else {
        Err(AppError::Custom(String::from_utf8_lossy(&output.stderr).to_string()))
    }
}

/// Minimal POSIX-style argument tokeniser.
fn split_command_args(input: &str) -> crate::error::AppResult<Vec<String>> {
    let mut args: Vec<String> = Vec::new();
    let mut current = String::new();
    let mut chars = input.chars().peekable();

    while let Some(ch) = chars.next() {
        match ch {
            '\'' => loop {
                match chars.next() {
                    Some('\'') => break,
                    Some(c) => current.push(c),
                    None => return Err("Unterminated single-quoted string".to_string().into()),
                }
            },
            '"' => loop {
                match chars.next() {
                    Some('"') => break,
                    Some('\\') => match chars.next() {
                        Some(escaped) => current.push(escaped),
                        None => {
                            return Err("Unterminated escape in double-quoted string".to_string().into())
                        }
                    },
                    Some(c) => current.push(c),
                    None => return Err("Unterminated double-quoted string".to_string().into()),
                }
            },
            c if c.is_whitespace() => {
                if !current.is_empty() {
                    args.push(current.clone());
                    current.clear();
                }
            }
            c => current.push(c),
        }
    }

    if !current.is_empty() {
        args.push(current);
    }

    Ok(args)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn split_simple_command() {
        assert_eq!(
            split_command_args("echo hello world").unwrap(),
            vec!["echo", "hello", "world"]
        );
    }

    #[test]
    fn split_double_quoted_span() {
        assert_eq!(
            split_command_args(r#"echo "hello world""#).unwrap(),
            vec!["echo", "hello world"]
        );
    }

    #[test]
    fn split_single_quoted_span() {
        assert_eq!(
            split_command_args("echo 'hello world'").unwrap(),
            vec!["echo", "hello world"]
        );
    }

    #[test]
    fn split_escape_in_double_quotes() {
        assert_eq!(
            split_command_args(r#"echo "hello \"world\"""#).unwrap(),
            vec!["echo", r#"hello "world""#]
        );
    }

    #[test]
    fn split_unterminated_single_quote_errors() {
        assert!(split_command_args("echo 'unterminated").is_err());
    }

    #[test]
    fn split_unterminated_double_quote_errors() {
        assert!(split_command_args(r#"echo "unterminated"#).is_err());
    }

    #[test]
    fn split_empty_string_returns_empty_vec() {
        assert_eq!(split_command_args("").unwrap(), Vec::<String>::new());
    }

    #[test]
    fn split_whitespace_only_returns_empty_vec() {
        assert_eq!(split_command_args("   ").unwrap(), Vec::<String>::new());
    }

    #[test]
    fn split_multiple_spaces_between_args() {
        assert_eq!(
            split_command_args("  echo   foo   bar  ").unwrap(),
            vec!["echo", "foo", "bar"]
        );
    }

    #[test]
    fn test_split_mixed_quotes() {
        assert_eq!(
            split_command_args(r#"echo "hello" 'world'"#).unwrap(),
            vec!["echo", "hello", "world"]
        );
    }

    #[test]
    fn test_split_adjacent_tokens() {
        assert_eq!(
            split_command_args(r#"key="value with spaces""#).unwrap(),
            vec!["key=value with spaces"]
        );
    }

    #[test]
    fn test_derive_key_and_cipher_roundtrip() {
        let password = "TestMasterPassword123!";
        let salt = SaltString::generate(&mut OsRng);
        let key = derive_key(password, &salt, 1024, 1, 1).unwrap();
        assert_eq!(key.len(), 32);

        let cipher = ChaCha20Poly1305::new(chacha20poly1305::Key::from_slice(&key));
        let nonce = ChaCha20Poly1305::generate_nonce(&mut ChaChaRng);
        let plaintext = b"SECRET_API_KEY=sk-123456789";

        let ciphertext = cipher.encrypt(&nonce, plaintext.as_ref()).unwrap();
        let decrypted = cipher.decrypt(&nonce, ciphertext.as_ref()).unwrap();
        assert_eq!(decrypted, plaintext);
    }
}
