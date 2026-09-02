use crate::error::{AppError, AppResult};
use md5::Md5;
use sha2::{Digest, Sha256};
use x509_parser::prelude::*;

pub fn calculate_hash_internal(
    path: &str,
    algorithm: &str,
    allowed_paths: &crate::files::AllowedPathsState,
) -> AppResult<String> {
    let validated = crate::files::validate_path(path, allowed_paths)?;
    let mut file = std::fs::File::open(&validated).map_err(|e| e.to_string())?;

    if algorithm == "md5" {
        let mut hasher = Md5::new();
        std::io::copy(&mut file, &mut hasher).map_err(|e| e.to_string())?;
        Ok(hex::encode(hasher.finalize()))
    } else if algorithm == "sha256" {
        let mut hasher = Sha256::new();
        std::io::copy(&mut file, &mut hasher).map_err(|e| e.to_string())?;
        Ok(hex::encode(hasher.finalize()))
    } else {
        Err(AppError::Custom("Unsupported algorithm".to_string()))
    }
}

#[tauri::command]
pub fn calculate_hash(
    path: String,
    algorithm: String,
    allowed_paths: tauri::State<'_, crate::files::AllowedPathsState>,
) -> AppResult<String> {
    calculate_hash_internal(&path, &algorithm, &allowed_paths)
}

pub async fn optimize_image_internal(
    path: &str,
    allowed_paths: &crate::files::AllowedPathsState,
) -> AppResult<String> {
    let validated = crate::files::validate_path(path, allowed_paths)?;
    let validated_path = validated.to_string_lossy().to_string();

    tauri::async_runtime::spawn_blocking(move || {
        let original_size = std::fs::metadata(&validated_path).map_err(|e| e.to_string())?.len();

        let options = oxipng::Options::from_preset(3);

        let in_file = oxipng::InFile::Path(std::path::PathBuf::from(&validated_path));
        let out_file = oxipng::OutFile::Path {
            path: Some(std::path::PathBuf::from(&validated_path)),
            preserve_attrs: false,
        };

        oxipng::optimize(&in_file, &out_file, &options).map_err(|e| e.to_string())?;

        let new_size = std::fs::metadata(&validated_path).map_err(|e| e.to_string())?.len();

        if original_size > new_size {
            let saved = original_size - new_size;
            Ok(format!("Saved {} bytes", saved))
        } else {
            Ok("Already fully optimized".to_string())
        }
    })
    .await
    .map_err(|e| e.to_string())?
}

#[tauri::command]
pub async fn optimize_image(
    path: String,
    allowed_paths: tauri::State<'_, crate::files::AllowedPathsState>,
) -> AppResult<String> {
    optimize_image_internal(&path, &allowed_paths).await
}

pub fn convert_format_internal(
    path: &str,
    target_format: &str,
    allowed_paths: &crate::files::AllowedPathsState,
) -> AppResult<String> {
    let validated = crate::files::validate_path(path, allowed_paths)?;
    let content = std::fs::read_to_string(&validated).map_err(|e| e.to_string())?;
    let path_lower = path.to_lowercase();

    let value: serde_json::Value = if path_lower.ends_with(".json") {
        serde_json::from_str(&content).map_err(|e| format!("Invalid JSON: {}", e))?
    } else if path_lower.ends_with(".yaml") || path_lower.ends_with(".yml") {
        serde_yml::from_str(&content).map_err(|e| format!("Invalid YAML: {}", e))?
    } else {
        return Err(AppError::Custom("Only JSON and YAML are currently supported for conversion.".to_string()));
    };

    let output = match target_format {
        "json" => serde_json::to_string_pretty(&value)
            .map_err(|e| format!("Failed to generate JSON: {}", e))?,
        "yaml" => {
            serde_yml::to_string(&value).map_err(|e| format!("Failed to generate YAML: {}", e))?
        }
        _ => return Err(AppError::Custom("Target format not supported.".to_string())),
    };

    let new_path = validated.with_extension(target_format);
    let validated_new_path = crate::files::validate_path(&new_path.to_string_lossy(), allowed_paths)?;
    std::fs::write(&validated_new_path, output).map_err(|e| e.to_string())?;

    Ok(validated_new_path.to_string_lossy().to_string())
}

#[tauri::command]
pub fn convert_format(
    path: String,
    target_format: String,
    allowed_paths: tauri::State<'_, crate::files::AllowedPathsState>,
) -> AppResult<String> {
    convert_format_internal(&path, &target_format, &allowed_paths)
}

pub fn inspect_ssl_cert_internal(
    path: &str,
    allowed_paths: &crate::files::AllowedPathsState,
) -> AppResult<String> {
    let validated = crate::files::validate_path(path, allowed_paths)?;
    let data = std::fs::read(&validated).map_err(|e| e.to_string())?;

    // Attempt PEM parsing first; if that fails, try parsing as raw DER bytes
    let (subject, issuer, valid_from, valid_to) = if let Ok((_, pem)) = x509_parser::pem::parse_x509_pem(&data) {
        let (_, cert) = X509Certificate::from_der(&pem.contents).map_err(|e| e.to_string())?;
        (
            cert.subject().to_string(),
            cert.issuer().to_string(),
            cert.validity().not_before.to_string(),
            cert.validity().not_after.to_string(),
        )
    } else {
        let (_, cert) = X509Certificate::from_der(&data).map_err(|e| format!("Failed to parse certificate as PEM or DER: {}", e))?;
        (
            cert.subject().to_string(),
            cert.issuer().to_string(),
            cert.validity().not_before.to_string(),
            cert.validity().not_after.to_string(),
        )
    };

    let cert_info = serde_json::json!({
        "subject": subject,
        "issuer": issuer,
        "valid_from": valid_from,
        "valid_to": valid_to,
    });

    serde_json::to_string_pretty(&cert_info).map_err(|e| e.to_string().into())
}

#[tauri::command]
pub fn inspect_ssl_cert(
    path: String,
    allowed_paths: tauri::State<'_, crate::files::AllowedPathsState>,
) -> AppResult<String> {
    inspect_ssl_cert_internal(&path, &allowed_paths)
}

#[cfg(test)]
mod tests {
    use super::*;
    use tempfile::NamedTempFile;
    use std::io::Write;

    #[test]
    fn test_calculate_hash_sha256() {
        let mut file = NamedTempFile::new().unwrap();
        file.write_all(b"hello world").unwrap();
        let state = crate::files::AllowedPathsState::new();
        let hash = calculate_hash_internal(&file.path().to_string_lossy(), "sha256", &state).unwrap();
        // sha256("hello world") = b94d27b9934d3e08a52e52d7da7dabfac484efe37a5380ee9088f7ace2efcde9
        assert_eq!(hash, "b94d27b9934d3e08a52e52d7da7dabfac484efe37a5380ee9088f7ace2efcde9");
    }

    #[test]
    fn test_calculate_hash_md5() {
        let mut file = NamedTempFile::new().unwrap();
        file.write_all(b"hello world").unwrap();
        let state = crate::files::AllowedPathsState::new();
        let hash = calculate_hash_internal(&file.path().to_string_lossy(), "md5", &state).unwrap();
        // md5("hello world") = 5eb63bbbe01eeed093cb22bb8f5acdc3
        assert_eq!(hash, "5eb63bbbe01eeed093cb22bb8f5acdc3");
    }

    #[test]
    fn test_calculate_hash_unsupported() {
        let mut file = NamedTempFile::new().unwrap();
        file.write_all(b"hello world").unwrap();
        let state = crate::files::AllowedPathsState::new();
        let res = calculate_hash_internal(&file.path().to_string_lossy(), "sha1", &state);
        assert!(res.is_err());
    }

    #[test]
    fn test_convert_format_json_to_yaml() {
        let mut file = tempfile::Builder::new().suffix(".json").tempfile().unwrap();
        file.write_all(b"{\"name\": \"CodexOS\", \"version\": 2}").unwrap();
        let state = crate::files::AllowedPathsState::new();
        let out_path = convert_format_internal(&file.path().to_string_lossy(), "yaml", &state);
        assert!(out_path.is_ok());
        let content = std::fs::read_to_string(out_path.unwrap()).unwrap();
        assert!(content.contains("name: CodexOS"));
    }

    #[test]
    fn test_inspect_ssl_cert_invalid() {
        let mut file = tempfile::Builder::new().suffix(".pem").tempfile().unwrap();
        file.write_all(b"not a valid certificate").unwrap();
        let state = crate::files::AllowedPathsState::new();
        let res = inspect_ssl_cert_internal(&file.path().to_string_lossy(), &state);
        assert!(res.is_err());
    }
}
