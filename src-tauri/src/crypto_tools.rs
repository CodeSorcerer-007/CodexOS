use sha2::{Sha256, Digest};
use md5::Md5;
use x509_parser::prelude::*;

#[tauri::command]
pub fn calculate_hash(path: String, algorithm: String) -> Result<String, String> {
    let mut file = std::fs::File::open(&path).map_err(|e| e.to_string())?;
    
    if algorithm == "md5" {
        let mut hasher = Md5::new();
        std::io::copy(&mut file, &mut hasher).map_err(|e| e.to_string())?;
        Ok(hex::encode(hasher.finalize()))
    } else if algorithm == "sha256" {
        let mut hasher = Sha256::new();
        std::io::copy(&mut file, &mut hasher).map_err(|e| e.to_string())?;
        Ok(hex::encode(hasher.finalize()))
    } else {
        Err("Unsupported algorithm".to_string())
    }
}

#[tauri::command]
pub async fn optimize_image(path: String) -> Result<String, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let original_size = std::fs::metadata(&path).map_err(|e| e.to_string())?.len();
        
        let options = oxipng::Options::from_preset(3);
        
        let in_file = oxipng::InFile::Path(std::path::PathBuf::from(&path));
        let out_file = oxipng::OutFile::Path { 
            path: Some(std::path::PathBuf::from(&path)),
            preserve_attrs: false
        };
        
        oxipng::optimize(&in_file, &out_file, &options).map_err(|e| e.to_string())?;
        
        let new_size = std::fs::metadata(&path).map_err(|e| e.to_string())?.len();
        
        if original_size > new_size {
            let saved = original_size - new_size;
            Ok(format!("Saved {} bytes", saved))
        } else {
            Ok("Already fully optimized".to_string())
        }
    }).await.map_err(|e| e.to_string())?
}

#[tauri::command]
pub fn convert_format(path: String, target_format: String) -> Result<String, String> {
    let content = std::fs::read_to_string(&path).map_err(|e| e.to_string())?;
    let path_lower = path.to_lowercase();
    
    let value: serde_json::Value = if path_lower.ends_with(".json") {
        serde_json::from_str(&content).map_err(|e| format!("Invalid JSON: {}", e))?
    } else if path_lower.ends_with(".yaml") || path_lower.ends_with(".yml") {
        serde_yaml::from_str(&content).map_err(|e| format!("Invalid YAML: {}", e))?
    } else {
        return Err("Only JSON and YAML are currently supported for conversion.".to_string());
    };
    
    let output = match target_format.as_str() {
        "json" => serde_json::to_string_pretty(&value).map_err(|e| format!("Failed to generate JSON: {}", e))?,
        "yaml" => serde_yaml::to_string(&value).map_err(|e| format!("Failed to generate YAML: {}", e))?,
        _ => return Err("Target format not supported.".to_string()),
    };
    
    let new_path = std::path::Path::new(&path).with_extension(&target_format);
    std::fs::write(&new_path, output).map_err(|e| e.to_string())?;
    
    Ok(new_path.to_string_lossy().to_string())
}

#[tauri::command]
pub fn inspect_ssl_cert(path: String) -> Result<String, String> {
    let data = std::fs::read(&path).map_err(|e| e.to_string())?;
    
    let (_, pem) = x509_parser::pem::parse_x509_pem(&data).map_err(|e| e.to_string())?;
    let (_, x509) = X509Certificate::from_der(&pem.contents).map_err(|e| e.to_string())?;
    
    let subject = x509.subject().to_string();
    let issuer = x509.issuer().to_string();
    let valid_from = x509.validity().not_before.to_string();
    let valid_to = x509.validity().not_after.to_string();
    
    let json = format!(r#"{{
        "subject": "{}",
        "issuer": "{}",
        "valid_from": "{}",
        "valid_to": "{}"
    }}"#, 
    subject.replace("\"", "\\\"").replace("\n", ""), 
    issuer.replace("\"", "\\\"").replace("\n", ""), 
    valid_from, valid_to);
    
    Ok(json)
}
