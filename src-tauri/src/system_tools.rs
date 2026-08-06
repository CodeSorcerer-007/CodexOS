use serde::{Deserialize, Serialize};

#[derive(Serialize, Deserialize)]
pub struct WindowsService {
    pub name: String,
    pub display_name: String,
    pub status: String,
    pub start_type: String,
}

#[tauri::command]
pub fn get_env_vars() -> Result<std::collections::HashMap<String, String>, String> {
    let output = std::process::Command::new("powershell")
        .args(["-Command", "[Environment]::GetEnvironmentVariables('User') | ConvertTo-Json"])
        .output()
        .map_err(|e| e.to_string())?;
        
    let json_str = String::from_utf8_lossy(&output.stdout);
    serde_json::from_str(&json_str).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn set_env_var(name: String, value: String) -> Result<(), String> {
    let output = std::process::Command::new("powershell")
        .env("NEW_ENV_NAME", &name)
        .env("NEW_ENV_VAL", &value)
        .args(["-Command", "[Environment]::SetEnvironmentVariable($env:NEW_ENV_NAME, $env:NEW_ENV_VAL, 'User')"])
        .output()
        .map_err(|e| e.to_string())?;
        
    if !output.status.success() {
        return Err(String::from_utf8_lossy(&output.stderr).to_string());
    }
    
    Ok(())
}

#[tauri::command]
pub fn delete_env_var(name: String) -> Result<(), String> {
    let output = std::process::Command::new("powershell")
        .env("DEL_ENV_NAME", &name)
        .args(["-Command", "[Environment]::SetEnvironmentVariable($env:DEL_ENV_NAME, $null, 'User')"])
        .output()
        .map_err(|e| e.to_string())?;
        
    if !output.status.success() {
        return Err(String::from_utf8_lossy(&output.stderr).to_string());
    }
    
    Ok(())
}

#[tauri::command]
pub fn get_services() -> Result<Vec<WindowsService>, String> {
    let script = "Get-Service | Select-Object Name, DisplayName, @{Name='status';Expression={$_.Status.ToString()}}, @{Name='start_type';Expression={$_.StartType.ToString()}} | ConvertTo-Json -Depth 2";
    let output = std::process::Command::new("powershell")
        .args(["-NoProfile", "-Command", script])
        .output()
        .map_err(|e| e.to_string())?;
        
    let json_str = String::from_utf8_lossy(&output.stdout);
    serde_json::from_str(&json_str).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn manage_service(name: String, action: String) -> Result<(), String> {
    let script = format!("{}-Service -Name $env:SERVICE_NAME -Force", action);
    let output = std::process::Command::new("powershell")
        .env("SERVICE_NAME", &name)
        .args(["-NoProfile", "-Command", &script])
        .output()
        .map_err(|e| e.to_string())?;
        
    if !output.status.success() {
        let err = String::from_utf8_lossy(&output.stderr).to_string();
        if err.contains("Access is denied") || err.contains("Cannot open") {
            return Err("Access Denied: You must run Vaultly as Administrator to modify this service.".to_string());
        }
        return Err(err);
    }
    
    Ok(())
}

#[tauri::command]
pub fn list_wsl_distros() -> Result<Vec<String>, String> {
    let script = "Get-ChildItem HKCU:\\Software\\Microsoft\\Windows\\CurrentVersion\\Lxss -ErrorAction SilentlyContinue | ForEach-Object { (Get-ItemProperty $_.PSPath).DistributionName }";
    let output = std::process::Command::new("powershell")
        .args(["-NoProfile", "-Command", script])
        .output()
        .map_err(|e| e.to_string())?;
        
    let distros_str = String::from_utf8_lossy(&output.stdout);
    let mut distros = Vec::new();
    for line in distros_str.lines() {
        let trimmed = line.trim();
        if !trimmed.is_empty() {
            distros.push(trimmed.to_string());
        }
    }
    Ok(distros)
}

#[tauri::command]
pub fn get_project_tasks(path: String) -> Result<std::collections::HashMap<String, String>, String> {
    let pkg_path = std::path::Path::new(&path).join("package.json");
    if pkg_path.exists() {
        let content = std::fs::read_to_string(pkg_path).map_err(|e| e.to_string())?;
        if let Ok(json) = serde_json::from_str::<serde_json::Value>(&content) {
            if let Some(scripts) = json.get("scripts").and_then(|s| s.as_object()) {
                let mut tasks = std::collections::HashMap::new();
                for (key, val) in scripts {
                    if let Some(v_str) = val.as_str() {
                        tasks.insert(key.clone(), v_str.to_string());
                    }
                }
                return Ok(tasks);
            }
        }
    }
    
    Ok(std::collections::HashMap::new())
}

fn get_hosts_path() -> &'static str {
    if cfg!(target_os = "windows") {
        "C:\\Windows\\System32\\drivers\\etc\\hosts"
    } else {
        "/etc/hosts"
    }
}

#[tauri::command]
pub fn read_hosts() -> Result<String, String> {
    let path = get_hosts_path();
    std::fs::read_to_string(path).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn write_hosts(content: String) -> Result<(), String> {
    let path = get_hosts_path();
    if std::fs::write(path, &content).is_ok() {
        return Ok(());
    }
    
    if cfg!(target_os = "windows") {
        let temp_path = std::env::temp_dir().join("vaultly_hosts_tmp.txt");
        std::fs::write(&temp_path, &content).map_err(|e| e.to_string())?;
        
        let script = format!(
            "Start-Process powershell -ArgumentList '-NoProfile -Command Copy-Item -Path \"{}\" -Destination \"{}\" -Force' -Verb RunAs -WindowStyle Hidden -Wait",
            temp_path.to_string_lossy(),
            path
        );
        
        let status = std::process::Command::new("powershell")
            .args(["-NoProfile", "-Command", &script])
            .status()
            .map_err(|e| e.to_string())?;
            
        if status.success() {
            Ok(())
        } else {
            Err("Failed to acquire Administrator privileges to save hosts file.".to_string())
        }
    } else {
        Err("Permission denied: Modifying /etc/hosts requires root privileges (sudo).".to_string())
    }
}

#[tauri::command]
pub fn install_font(path: String) -> Result<String, String> {
    let script = format!(
        "$FontFolder = (New-Object -ComObject Shell.Application).Namespace(0x14); \
        $FontFolder.CopyHere(\"{}\")",
        path.replace("\"", "`\"")
    );
    let output = std::process::Command::new("powershell")
        .args(["-NoProfile", "-Command", &script])
        .output()
        .map_err(|e| e.to_string())?;
        
    if !output.status.success() {
        return Err(String::from_utf8_lossy(&output.stderr).to_string());
    }
    
    Ok("Font installed successfully".to_string())
}
