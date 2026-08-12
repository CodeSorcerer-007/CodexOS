use aes_gcm::{
    aead::{Aead, AeadCore, KeyInit, OsRng},
    Aes256Gcm, Key, Nonce,
};
use pbkdf2::pbkdf2_hmac;
use rand::RngCore;
use sha2::Sha256;
use std::fs;
use std::io::{Read, Write};
use std::path::Path;

#[tauri::command]
pub fn encrypt_vault(path: String, password: String, out_path: String) -> Result<(), String> {
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
                    } else {
                        zip.add_directory(name_str, options)
                            .map_err(|e| e.to_string())?;
                    }
                }
            }
        }
        zip.finish().map_err(|e| e.to_string())?;
    }

    // 2. Hash password
    let mut salt = [0u8; 16];
    rand::thread_rng().fill_bytes(&mut salt);
    let mut key = [0u8; 32];
    pbkdf2_hmac::<Sha256>(password.as_bytes(), &salt, 100_000, &mut key);

    let cipher = Aes256Gcm::new(&Key::<Aes256Gcm>::from(key));
    let nonce = Aes256Gcm::generate_nonce(&mut OsRng); // 96-bits

    let ciphertext = cipher
        .encrypt(&nonce, buffer.as_ref())
        .map_err(|e| e.to_string())?;

    // 3. Save: salt(16) + nonce(12) + ciphertext
    let mut out_file = fs::File::create(&out_path).map_err(|e| e.to_string())?;
    out_file.write_all(&salt).map_err(|e| e.to_string())?;
    out_file.write_all(&nonce).map_err(|e| e.to_string())?;
    out_file.write_all(&ciphertext).map_err(|e| e.to_string())?;

    Ok(())
}

#[tauri::command]
pub fn decrypt_vault(path: String, password: String, out_path: String) -> Result<(), String> {
    let mut file = fs::File::open(&path).map_err(|e| e.to_string())?;
    let mut salt = [0u8; 16];
    file.read_exact(&mut salt)
        .map_err(|_| "Failed reading salt".to_string())?;

    let mut nonce_bytes = [0u8; 12];
    file.read_exact(&mut nonce_bytes)
        .map_err(|_| "Failed reading nonce".to_string())?;

    let mut ciphertext = Vec::new();
    file.read_to_end(&mut ciphertext)
        .map_err(|e| e.to_string())?;

    let mut key = [0u8; 32];
    pbkdf2_hmac::<Sha256>(password.as_bytes(), &salt, 100_000, &mut key);

    let cipher = Aes256Gcm::new(&Key::<Aes256Gcm>::from(key));
    let nonce = Nonce::from_slice(&nonce_bytes);

    let plaintext = cipher
        .decrypt(nonce, ciphertext.as_ref())
        .map_err(|_| "Decryption failed! Incorrect password.".to_string())?;

    let mut archive =
        zip::ZipArchive::new(std::io::Cursor::new(plaintext)).map_err(|e| e.to_string())?;
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
            std::io::copy(&mut file, &mut outfile).map_err(|e| e.to_string())?;
        }
    }

    Ok(())
}
