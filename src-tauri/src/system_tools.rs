use crate::error::{AppError, AppResult};
use crate::cli_runner::{run_cli, run_cli_parse};
use serde::{Deserialize, Serialize};
use std::collections::HashMap;

/// Executes the detect_tool command.
#[tauri::command]
pub fn detect_tool(tool: String) -> String {
    let args = match tool.as_str() {
        "git" => vec!["--version"],
        "docker" => vec!["--version"],
        "rg" => vec!["--version"],
        "node" => vec!["--version"],
        _ => return String::new(),
    };

    run_cli(&tool, &args, None)
        .map(|r| if r.exit_code == 0 { r.stdout.trim().to_string() } else { String::new() })
        .unwrap_or_default()
}

/// Probes the local Ollama HTTP endpoint from the Rust backend, avoiding
/// CSP restrictions that would block a direct WebView `fetch` in production builds.
#[tauri::command]
pub fn is_ollama_running() -> bool {
    // A HEAD request is sufficient; we only care about reachability.
    std::process::Command::new("curl")
        .args(["--silent", "--fail", "--max-time", "2", "--head", "http://127.0.0.1:11434/"])
        .output()
        .map(|o| o.status.success())
        .unwrap_or(false)
}


/// Executes the get_os_info command.
#[tauri::command]
pub fn get_os_info() -> String {
    std::env::consts::OS.to_string()
}

#[derive(Serialize, Deserialize)]
pub struct WindowsService {
    pub name: String,
    pub display_name: String,
    pub status: String,
    pub start_type: String,
}

fn validate_env_var_name(name: &str) -> AppResult<()> {
    if name.is_empty() || name.len() > 256 {
        return Err(AppError::Custom("Environment variable name must be between 1 and 256 characters".into()));
    }
    if !name.chars().all(|c| c.is_ascii_alphanumeric() || c == '_') {
        return Err(AppError::Custom("Environment variable name must contain only alphanumeric characters and underscores".into()));
    }
    Ok(())
}

/// Executes the get_env_vars command.
#[tauri::command]
pub fn get_env_vars() -> AppResult<HashMap<String, String>> {
    run_cli_parse("powershell", &["-NoProfile", "-Command", "[Environment]::GetEnvironmentVariables('User') | ConvertTo-Json"], None, |stdout| {
        serde_json::from_str(stdout).map_err(|e| AppError::Custom(e.to_string()))
    })
}

/// Executes the set_env_var command.
#[tauri::command]
pub fn set_env_var(name: String, value: String) -> AppResult<()> {
    validate_env_var_name(&name)?;
    let res = run_cli(
        "powershell",
        &[
            "-NoProfile",
            "-Command",
            "param($n, $v) [Environment]::SetEnvironmentVariable($n, $v, 'User')",
            "-n",
            &name,
            "-v",
            &value,
        ],
        None,
    )?;
    if res.exit_code == 0 {
        Ok(())
    } else {
        Err(AppError::Command(res.stderr))
    }
}

/// Executes the delete_env_var command.
#[tauri::command]
pub fn delete_env_var(name: String) -> AppResult<()> {
    validate_env_var_name(&name)?;
    let res = run_cli(
        "powershell",
        &[
            "-NoProfile",
            "-Command",
            "param($n) [Environment]::SetEnvironmentVariable($n, $null, 'User')",
            "-n",
            &name,
        ],
        None,
    )?;
    if res.exit_code == 0 {
        Ok(())
    } else {
        Err(AppError::Command(res.stderr))
    }
}

/// Executes the get_services command.
#[tauri::command]
pub fn get_services() -> AppResult<Vec<WindowsService>> {
    let script = "Get-Service | Select-Object Name, DisplayName, @{Name='status';Expression={$_.Status.ToString()}}, @{Name='start_type';Expression={$_.StartType.ToString()}} | ConvertTo-Json -Depth 2";
    run_cli_parse("powershell", &["-NoProfile", "-Command", script], None, |stdout| {
        serde_json::from_str(stdout).map_err(|e| AppError::Custom(e.to_string()))
    })
}

/// Executes the manage_service command.
#[tauri::command]
pub fn manage_service(name: String, action: String) -> AppResult<()> {
    let normalized_action = match action.to_lowercase().as_str() {
        "start" => "Start",
        "stop" => "Stop",
        "restart" => "Restart",
        _ => return Err(AppError::Custom("Invalid service action. Allowed actions: start, stop, restart".into())),
    };
    if name.is_empty() || !name.chars().all(|c| c.is_ascii_alphanumeric() || c == '_' || c == '-' || c == '.') {
        return Err(AppError::Custom("Invalid service name. Contains disallowed characters".into()));
    }
    let script = match normalized_action {
        "Start" => "param($svc) Start-Service -Name $svc -Force",
        "Stop" => "param($svc) Stop-Service -Name $svc -Force",
        _ => "param($svc) Restart-Service -Name $svc -Force",
    };
    let res = run_cli("powershell", &["-NoProfile", "-Command", script, "-svc", &name], None)?;
    
    if res.exit_code != 0 {
        let err = res.stderr;
        if err.contains("Access is denied") || err.contains("Cannot open") {
            return Err(AppError::Command("Access Denied: You must run CodexOS as Administrator to modify this service.".to_string()));
        }
        return Err(AppError::Command(err));
    }
    Ok(())
}

/// Executes the list_wsl_distros command.
#[tauri::command]
pub fn list_wsl_distros() -> AppResult<Vec<String>> {
    let script = "Get-ChildItem HKCU:\\Software\\Microsoft\\Windows\\CurrentVersion\\Lxss -ErrorAction SilentlyContinue | ForEach-Object { (Get-ItemProperty $_.PSPath).DistributionName }";
    run_cli_parse("powershell", &["-NoProfile", "-Command", script], None, |stdout| {
        let mut distros = Vec::new();
        for line in stdout.lines() {
            let trimmed = line.trim();
            if !trimmed.is_empty() {
                distros.push(trimmed.to_string());
            }
        }
        Ok(distros)
    })
}

/// Executes the get_project_tasks command.
#[tauri::command]
pub fn get_project_tasks(path: String) -> AppResult<HashMap<String, String>> {
    let mut tasks = HashMap::new();
    let root = std::path::Path::new(&path);

    // 1. package.json
    let pkg_path = root.join("package.json");
    if pkg_path.exists() {
        if let Ok(content) = std::fs::read_to_string(&pkg_path) {
            if let Ok(json) = serde_json::from_str::<serde_json::Value>(&content) {
                if let Some(scripts) = json.get("scripts").and_then(|s| s.as_object()) {
                    for (key, val) in scripts {
                        if let Some(v_str) = val.as_str() {
                            tasks.insert(key.clone(), v_str.to_string());
                        }
                    }
                }
            }
        }
    }

    // 2. Cargo.toml
    let cargo_path = root.join("Cargo.toml");
    if cargo_path.exists() {
        if let Ok(content) = std::fs::read_to_string(&cargo_path) {
            tasks.insert("cargo:check".to_string(), "cargo check".to_string());
            tasks.insert("cargo:build".to_string(), "cargo build".to_string());
            tasks.insert("cargo:test".to_string(), "cargo test".to_string());
            tasks.insert("cargo:clippy".to_string(), "cargo clippy".to_string());
            if content.contains("[[bin]]") || content.contains("[package]") {
                tasks.insert("cargo:run".to_string(), "cargo run".to_string());
            }
        }
    }

    // 3. Makefile
    let make_path = root.join("Makefile");
    if make_path.exists() {
        if let Ok(content) = std::fs::read_to_string(&make_path) {
            for line in content.lines() {
                let trimmed = line.trim();
                if trimmed.starts_with('#') || trimmed.starts_with('.') || trimmed.is_empty() {
                    continue;
                }
                if let Some((target, _)) = trimmed.split_once(':') {
                    let target_name = target.trim();
                    if !target_name.contains(' ') && !target_name.contains('$') && !target_name.contains('=') && !target_name.is_empty() {
                        tasks.insert(format!("make:{}", target_name), format!("make {}", target_name));
                    }
                }
            }
        }
    }

    Ok(tasks)
}

fn get_hosts_path() -> &'static str {
    if cfg!(target_os = "windows") {
        "C:\\Windows\\System32\\drivers\\etc\\hosts"
    } else {
        "/etc/hosts"
    }
}

/// Executes the read_hosts command.
#[tauri::command]
pub fn read_hosts() -> AppResult<String> {
    let path = get_hosts_path();
    std::fs::read_to_string(path).map_err(|e| AppError::Io(e.to_string()))
}

/// Executes the write_hosts command.
#[tauri::command]
pub fn write_hosts(content: String) -> AppResult<()> {
    let path = get_hosts_path();
    if std::fs::write(path, &content).is_ok() {
        return Ok(());
    }

    if cfg!(target_os = "windows") {
        let temp_path = std::env::temp_dir().join(format!("codexos_hosts_{}.tmp", std::process::id()));
        std::fs::write(&temp_path, &content)?;

        let temp_str = temp_path.to_string_lossy().to_string();
        let script = "param($src, $dst) Start-Process powershell -ArgumentList ('-NoProfile -Command Copy-Item -LiteralPath \"' + $src + '\" -Destination \"' + $dst + '\" -Force') -Verb RunAs -WindowStyle Hidden -Wait";
        let res = run_cli("powershell", &["-NoProfile", "-Command", script, "-src", &temp_str, "-dst", path], None);

        let _ = std::fs::remove_file(&temp_path);
        let res = res?;

        if res.exit_code == 0 {
            Ok(())
        } else {
            Err(AppError::Command("Failed to acquire Administrator privileges to save hosts file.".to_string()))
        }
    } else {
        Err(AppError::Command("Permission denied: Modifying /etc/hosts requires root privileges (sudo).".to_string()))
    }
}

/// Executes the install_font command.
#[tauri::command]
pub fn install_font(path: String) -> AppResult<String> {
    let font_path = std::path::Path::new(&path);
    if !font_path.exists() || !font_path.is_file() {
        return Err(AppError::Custom("Font file does not exist".into()));
    }
    let ext = font_path.extension().and_then(|e| e.to_str()).unwrap_or("").to_lowercase();
    if !["ttf", "otf", "fon", "ttc"].contains(&ext.as_str()) {
        return Err(AppError::Custom("Invalid font format. Expected .ttf, .otf, .fon, or .ttc".into()));
    }
    let canonical_path = font_path.canonicalize().map_err(|e| AppError::Custom(format!("Cannot resolve font path: {}", e)))?;
    let canonical_str = canonical_path.to_string_lossy().to_string();

    let res = run_cli(
        "powershell",
        &[
            "-NoProfile",
            "-Command",
            "param($p) $FontFolder = (New-Object -ComObject Shell.Application).Namespace(0x14); $FontFolder.CopyHere($p)",
            "-p",
            &canonical_str,
        ],
        None,
    )?;
    if res.exit_code == 0 {
        Ok("Font installed successfully".to_string())
    } else {
        Err(AppError::Command(res.stderr))
    }
}

/// Executes the execute_command command with workspace sandbox boundary enforcement.
#[tauri::command]
pub fn execute_command(
    command: String,
    cwd: String,
    allowed_paths: tauri::State<'_, crate::files::AllowedPathsState>,
) -> AppResult<String> {
    if command.trim().is_empty() {
        return Err(AppError::Command("Command must not be empty".to_string()));
    }

    let trimmed_cwd = cwd.trim();
    if trimmed_cwd.is_empty() {
        return Err(AppError::Command(
            "Access denied: Working directory must be specified and within allowed workspace boundaries.".to_string(),
        ));
    }

    let p = std::path::Path::new(trimmed_cwd);
    if !p.exists() || !p.is_dir() {
        return Err(AppError::Command(format!(
            "Working directory '{}' does not exist or is not a directory.",
            cwd
        )));
    }
    if !allowed_paths.is_allowed(p) {
        return Err(AppError::Command(format!(
            "Access denied: Working directory '{}' is outside allowed workspace boundaries.",
            cwd
        )));
    }

    let res = if cfg!(target_os = "windows") {
        run_cli("cmd", &["/c", &command], Some(p))?
    } else {
        run_cli("sh", &["-c", &command], Some(p))?
    };
    
    if res.exit_code == 0 {
        Ok(res.stdout)
    } else {
        Err(AppError::Command(format!("{}\n{}", res.stdout, res.stderr)))
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use tempfile::tempdir;

    #[test]
    fn test_validate_env_var_name() {
        assert!(validate_env_var_name("MY_VAR_123").is_ok());
        assert!(validate_env_var_name("PORT").is_ok());
        assert!(validate_env_var_name("").is_err());
        assert!(validate_env_var_name("VAR-WITH-DASH").is_err());
        assert!(validate_env_var_name("VAR WITH SPACE").is_err());
        assert!(validate_env_var_name("VAR;rm -rf /").is_err());
    }

    #[test]
    fn test_get_hosts_path() {
        let path = get_hosts_path();
        #[cfg(target_os = "windows")]
        assert!(path.contains("drivers\\etc\\hosts"));
        #[cfg(not(target_os = "windows"))]
        assert_eq!(path, "/etc/hosts");
    }

    #[test]
    fn test_detect_tool_unsupported() {
        let result = detect_tool("unsupported_tool_xyz_987".to_string());
        assert!(result.is_empty());
    }

    #[test]
    fn test_get_project_tasks_package_json() {
        let dir = tempdir().unwrap();
        let pkg_file = dir.path().join("package.json");
        std::fs::write(&pkg_file, r#"{"scripts": {"build": "tsc", "test": "vitest"}}"#).unwrap();

        let tasks = get_project_tasks(dir.path().to_string_lossy().to_string()).unwrap();
        assert_eq!(tasks.get("build").unwrap(), "tsc");
        assert_eq!(tasks.get("test").unwrap(), "vitest");
    }

    #[test]
    fn test_get_project_tasks_cargo_and_makefile() {
        let dir = tempdir().unwrap();
        let cargo_file = dir.path().join("Cargo.toml");
        std::fs::write(&cargo_file, "[package]\nname = \"test_pkg\"\nversion = \"0.1.0\"\n").unwrap();

        let make_file = dir.path().join("Makefile");
        std::fs::write(&make_file, "all:\n\techo all\nclean:\n\trm -rf target\n").unwrap();

        let tasks = get_project_tasks(dir.path().to_string_lossy().to_string()).unwrap();
        assert!(tasks.contains_key("cargo:build"));
        assert!(tasks.contains_key("cargo:test"));
        assert!(tasks.contains_key("make:all"));
        assert!(tasks.contains_key("make:clean"));
    }
}
