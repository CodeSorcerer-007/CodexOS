use aes_gcm::{Aes256Gcm, Key as AesKey, Nonce as AesNonce};
use chacha20poly1305::{
    aead::{Aead, AeadCore, KeyInit, OsRng},
    ChaCha20Poly1305, Key, Nonce,
};
use zeroize::{Zeroize, Zeroizing};
use argon2::Argon2;
use rand::RngCore;
use std::fs;
use std::io::{Read, Write};
use std::path::Path;

use crate::error::AppResult;

const VAULT_MAGIC: &[u8; 4] = b"CDX1";
const DEFAULT_M_COST: u32 = 65536;
const DEFAULT_T_COST: u32 = 3;
const DEFAULT_P_COST: u32 = 1;

#[tauri::command]
pub fn encrypt_vault(path: String, password: String, out_path: String) -> AppResult<()> {
    if password.len() < crate::util::MIN_PASSWORD_LENGTH {
        return Err(crate::error::AppError::Vault(format!("Password must be at least {} characters", crate::util::MIN_PASSWORD_LENGTH)));
    }
    // 1. Zip
    let mut buffer = Vec::new();
    {
        let mut zip = zip::ZipWriter::new(std::io::Cursor::new(&mut buffer));
        let options = zip::write::SimpleFileOptions::default()
            .compression_method(zip::CompressionMethod::Deflated);

        let path_obj = Path::new(&path);
        let walkdir = walkdir::WalkDir::new(path_obj);
        for entry in walkdir.into_iter().filter_map(|e| e.ok()) {
            let p = entry.path();
            if let Ok(name) = p.strip_prefix(path_obj) {
                if let Some(name_str) = name.to_str() {
                    if name_str.is_empty() {
                        continue;
                    }
                    let name_str = name_str.replace("\\", "/");

                    if p.is_file() {
                        zip.start_file(name_str.clone(), options)
                            .map_err(|e| e.to_string())?;
                        let mut f = fs::File::open(p).map_err(|e| e.to_string())?;
                        let mut buf = Vec::new();
                        f.read_to_end(&mut buf).map_err(|e| e.to_string())?;
                        zip.write_all(&buf).map_err(|e| e.to_string())?;
                        buf.zeroize();
                    } else {
                        zip.add_directory(name_str, options)
                            .map_err(|e| e.to_string())?;
                    }
                }
            }
        }
        zip.finish().map_err(|e| e.to_string())?;
    }

    // 2. Derive key using versioned Argon2 parameters
    let mut salt = [0u8; 16];
    rand::thread_rng().fill_bytes(&mut salt);
    let mut key = Zeroizing::new([0u8; 32]);
    
    let params = argon2::Params::new(DEFAULT_M_COST, DEFAULT_T_COST, DEFAULT_P_COST, Some(32))
        .map_err(|e| format!("Argon2 params error: {}", e))?;
    let argon2 = Argon2::new(argon2::Algorithm::Argon2id, argon2::Version::V0x13, params);
    argon2.hash_password_into(password.as_bytes(), &salt, &mut *key).map_err(|e| e.to_string())?;

    let cipher = ChaCha20Poly1305::new(&Key::from(*key));
    let nonce = ChaCha20Poly1305::generate_nonce(&mut OsRng); // 96-bits

    let ciphertext = cipher
        .encrypt(&nonce, buffer.as_ref())
        .map_err(|e| e.to_string())?;

    // Zeroize unencrypted zip buffer
    buffer.zeroize();

    // 3. Save: magic(4) + m_cost(4) + t_cost(4) + p_cost(4) + salt(16) + nonce(12) + ciphertext
    let mut out_file = fs::File::create(&out_path).map_err(|e| e.to_string())?;
    out_file.write_all(VAULT_MAGIC).map_err(|e| e.to_string())?;
    out_file.write_all(&DEFAULT_M_COST.to_le_bytes()).map_err(|e| e.to_string())?;
    out_file.write_all(&DEFAULT_T_COST.to_le_bytes()).map_err(|e| e.to_string())?;
    out_file.write_all(&DEFAULT_P_COST.to_le_bytes()).map_err(|e| e.to_string())?;
    out_file.write_all(&salt).map_err(|e| e.to_string())?;
    out_file.write_all(&nonce).map_err(|e| e.to_string())?;
    out_file.write_all(&ciphertext).map_err(|e| e.to_string())?;

    Ok(())
}

#[tauri::command]
pub fn decrypt_vault(path: String, password: String, out_path: String) -> AppResult<()> {
    if password.is_empty() {
        return Err(crate::error::AppError::Vault("Password cannot be empty".to_string()));
    }
    let data = fs::read(&path).map_err(|e| e.to_string())?;
    if data.len() < 28 {
        return Err(crate::error::AppError::Vault("Vault file is too small or corrupt".to_string()));
    }

    let is_v1 = data.starts_with(VAULT_MAGIC);
    let (m_cost, t_cost, p_cost, salt, nonce_bytes, ciphertext) = if is_v1 && data.len() >= 44 {
        let m = data.get(4..8).and_then(|s| s.try_into().ok()).map(u32::from_le_bytes).unwrap_or(0);
        let t = data.get(8..12).and_then(|s| s.try_into().ok()).map(u32::from_le_bytes).unwrap_or(0);
        let p = data.get(12..16).and_then(|s| s.try_into().ok()).map(u32::from_le_bytes).unwrap_or(0);
        let salt = &data[16..32];
        let nonce = &data[32..44];
        let ct = &data[44..];
        (m, t, p, salt, nonce, ct)
    } else {
        // Legacy format without header: salt(16) + nonce(12) + ciphertext
        let salt = &data[0..16];
        let nonce = &data[16..28];
        let ct = &data[28..];
        (0, 0, 0, salt, nonce, ct)
    };

    let mut key = Zeroizing::new([0u8; 32]);
    let mut decrypted = None;

    if m_cost > 0 {
        if let Ok(params) = argon2::Params::new(m_cost, t_cost, p_cost, Some(32)) {
            let argon2 = Argon2::new(argon2::Algorithm::Argon2id, argon2::Version::V0x13, params);
            if argon2.hash_password_into(password.as_bytes(), salt, &mut *key).is_ok() {
                let chacha_cipher = ChaCha20Poly1305::new(&Key::from(*key));
                let chacha_nonce = Nonce::from_slice(nonce_bytes);
                if let Ok(pt) = chacha_cipher.decrypt(chacha_nonce, ciphertext) {
                    decrypted = Some(pt);
                }
            }
        }
    }

    if decrypted.is_none() {
        // Fallback with Argon2::default() for legacy vaults
        let argon2 = Argon2::default();
        if argon2.hash_password_into(password.as_bytes(), salt, &mut *key).is_ok() {
            let chacha_cipher = ChaCha20Poly1305::new(&Key::from(*key));
            let chacha_nonce = Nonce::from_slice(nonce_bytes);
            if let Ok(pt) = chacha_cipher.decrypt(chacha_nonce, ciphertext) {
                decrypted = Some(pt);
            } else {
                // Fallback to AES-GCM for legacy vaults
                let aes_cipher = Aes256Gcm::new(&AesKey::<Aes256Gcm>::from(*key));
                let aes_nonce = AesNonce::from_slice(nonce_bytes);
                if let Ok(pt) = aes_cipher.decrypt(aes_nonce, ciphertext) {
                    decrypted = Some(pt);
                }
            }
        }
    }

    let plaintext = decrypted.ok_or_else(|| {
        crate::error::AppError::Vault("Decryption failed! Incorrect password or corrupted vault.".to_string())
    })?;

const MAX_EXTRACT_FILE_BYTES: u64 = 100 * 1024 * 1024; // 100 MB per file
const MAX_EXTRACT_TOTAL_BYTES: u64 = 500 * 1024 * 1024; // 500 MB total

    let mut archive =
        zip::ZipArchive::new(std::io::Cursor::new(plaintext)).map_err(|e| e.to_string())?;
    let mut total_extracted_bytes: u64 = 0;
    for i in 0..archive.len() {
        let mut file = archive.by_index(i).map_err(|e| e.to_string())?;
        let outpath = match file.enclosed_name() {
            Some(path) => Path::new(&out_path).join(path),
            None => continue,
        };

        if (*file.name()).ends_with('/') {
            fs::create_dir_all(&outpath).map_err(|e| e.to_string())?;
        } else {
            if let Some(p) = outpath.parent() {
                if !p.exists() {
                    fs::create_dir_all(p).map_err(|e| e.to_string())?;
                }
            }
            let mut outfile = fs::File::create(&outpath).map_err(|e| e.to_string())?;
            let mut limited_reader = (&mut file).take(MAX_EXTRACT_FILE_BYTES);
            let bytes_written = std::io::copy(&mut limited_reader, &mut outfile).map_err(|e| e.to_string())?;

            total_extracted_bytes = total_extracted_bytes.saturating_add(bytes_written);
            if total_extracted_bytes > MAX_EXTRACT_TOTAL_BYTES {
                return Err(crate::error::AppError::Vault(
                    "Vault extraction exceeded maximum allowed total size (500 MB safety limit).".to_string(),
                ));
            }
        }
    }

    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;
    use tempfile::tempdir;

    #[test]
    fn test_encrypt_decrypt_roundtrip() {
        let dir = tempdir().unwrap();
        let in_dir = dir.path().join("in");
        let out_dir = dir.path().join("out");
        let vault_file = dir.path().join("vault.enc");

        fs::create_dir(&in_dir).unwrap();
        fs::write(in_dir.join("test.txt"), "hello world").unwrap();

        let pass = "password12345".to_string();

        encrypt_vault(
            in_dir.to_string_lossy().to_string(),
            pass.clone(),
            vault_file.to_string_lossy().to_string(),
        ).unwrap();

        assert!(vault_file.exists());

        fs::create_dir(&out_dir).unwrap();

        decrypt_vault(
            vault_file.to_string_lossy().to_string(),
            pass,
            out_dir.to_string_lossy().to_string(),
        ).unwrap();

        let extracted = fs::read_to_string(out_dir.join("test.txt")).unwrap();
        assert_eq!(extracted, "hello world");
    }

    #[test]
    fn test_wrong_password_fails() {
        let dir = tempdir().unwrap();
        let in_dir = dir.path().join("in");
        let out_dir = dir.path().join("out");
        let vault_file = dir.path().join("vault.enc");

        fs::create_dir(&in_dir).unwrap();
        fs::write(in_dir.join("test.txt"), "hello world").unwrap();

        encrypt_vault(
            in_dir.to_string_lossy().to_string(),
            "password12345".to_string(),
            vault_file.to_string_lossy().to_string(),
        ).unwrap();

        fs::create_dir(&out_dir).unwrap();

        let res = decrypt_vault(
            vault_file.to_string_lossy().to_string(),
            "wrongpass123".to_string(),
            out_dir.to_string_lossy().to_string(),
        );

        assert!(res.is_err());
    }

    #[test]
    fn test_empty_directory() {
        let dir = tempdir().unwrap();
        let in_dir = dir.path().join("in");
        let out_dir = dir.path().join("out");
        let vault_file = dir.path().join("vault.enc");

        fs::create_dir(&in_dir).unwrap();

        let pass = "password12345".to_string();
        encrypt_vault(
            in_dir.to_string_lossy().to_string(),
            pass.clone(),
            vault_file.to_string_lossy().to_string(),
        ).unwrap();

        fs::create_dir(&out_dir).unwrap();

        decrypt_vault(
            vault_file.to_string_lossy().to_string(),
            pass,
            out_dir.to_string_lossy().to_string(),
        ).unwrap();

        let count = fs::read_dir(&out_dir).unwrap().count();
        assert_eq!(count, 0);
    }

    #[test]
    fn test_nested_directories() {
        let dir = tempdir().unwrap();
        let in_dir = dir.path().join("in");
        let out_dir = dir.path().join("out");
        let vault_file = dir.path().join("vault.enc");

        fs::create_dir(&in_dir).unwrap();
        fs::create_dir(in_dir.join("nested")).unwrap();
        fs::write(in_dir.join("nested").join("test.txt"), "nested hello").unwrap();

        let pass = "password12345".to_string();

        encrypt_vault(
            in_dir.to_string_lossy().to_string(),
            pass.clone(),
            vault_file.to_string_lossy().to_string(),
        ).unwrap();

        fs::create_dir(&out_dir).unwrap();

        decrypt_vault(
            vault_file.to_string_lossy().to_string(),
            pass,
            out_dir.to_string_lossy().to_string(),
        ).unwrap();

        let extracted = fs::read_to_string(out_dir.join("nested").join("test.txt")).unwrap();
        assert_eq!(extracted, "nested hello");
    }
}
