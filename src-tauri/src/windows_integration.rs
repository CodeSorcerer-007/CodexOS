use crate::error::{AppError, AppResult};
use serde::{Deserialize, Serialize};
use std::path::Path;

#[derive(Serialize, Deserialize, Clone, Debug, PartialEq, Eq)]
pub struct ContextMenuStatus {
    pub is_registered: bool,
    pub supported: bool,
    pub directory_registered: bool,
    pub background_registered: bool,
    pub drive_registered: bool,
}

#[derive(Serialize, Deserialize, Clone, Debug, PartialEq, Eq)]
pub struct StartupStatus {
    pub enabled: bool,
    pub start_minimized: bool,
    pub supported: bool,
}

#[derive(Serialize, Deserialize, Clone, Debug, PartialEq, Eq)]
pub struct WindowsIntegrationStatus {
    pub context_menu: ContextMenuStatus,
    pub startup: StartupStatus,
    pub is_windows: bool,
    pub win11_modern_menu_note: String,
    pub default_folder_note: String,
}

/// Helper to get current executable path safely quoted for registry
pub fn get_current_exe_quoted() -> AppResult<(String, String)> {
    let exe = std::env::current_exe().map_err(|e| AppError::Custom(e.to_string()))?;
    let stripped = crate::files::strip_unc_prefix(&exe);
    let exe_str = stripped.to_string_lossy().to_string();
    let quoted = format!("\"{}\"", exe_str);
    Ok((exe_str, quoted))
}

/// Extracts and validates folder paths from CLI arguments
pub fn extract_folder_paths_from_args(args: &[String]) -> Vec<String> {
    let mut paths = Vec::new();

    for (idx, arg) in args.iter().enumerate() {
        // Skip argv[0] which is usually the executable
        if idx == 0 && (arg.ends_with(".exe") || arg.contains("codexos") || arg.contains("app")) {
            continue;
        }

        // Skip command-line flags
        if arg.starts_with('-') || arg.starts_with('/') {
            continue;
        }

        let p = Path::new(arg);
        if p.exists() && p.is_dir() {
            let normalized = if let Ok(canon) = p.canonicalize() {
                crate::files::strip_unc_prefix(&canon)
                    .to_string_lossy()
                    .to_string()
            } else {
                arg.to_string()
            };
            if !paths.contains(&normalized) {
                paths.push(normalized);
            }
        }
    }

    paths
}

#[cfg(windows)]
mod win_impl {
    use super::*;
    use winreg::enums::*;
    use winreg::RegKey;

    const HKCU_CLASSES: &str = "Software\\Classes";
    const RUN_KEY: &str = "Software\\Microsoft\\Windows\\CurrentVersion\\Run";
    const APP_RUN_NAME: &str = "CodexOS";

    pub fn get_context_menu_status() -> ContextMenuStatus {
        let hkcu = RegKey::predef(HKEY_CURRENT_USER);

        let dir_reg = hkcu
            .open_subkey(format!("{}\\Directory\\shell\\CodexOS", HKCU_CLASSES))
            .is_ok();
        let bg_reg = hkcu
            .open_subkey(format!(
                "{}\\Directory\\Background\\shell\\CodexOS",
                HKCU_CLASSES
            ))
            .is_ok();
        let drive_reg = hkcu
            .open_subkey(format!("{}\\Drive\\shell\\CodexOS", HKCU_CLASSES))
            .is_ok();

        ContextMenuStatus {
            is_registered: dir_reg && bg_reg && drive_reg,
            supported: true,
            directory_registered: dir_reg,
            background_registered: bg_reg,
            drive_registered: drive_reg,
        }
    }

    pub fn register_context_menu() -> AppResult<()> {
        let (exe_path, quoted_exe) = get_current_exe_quoted()?;
        let hkcu = RegKey::predef(HKEY_CURRENT_USER);
        let classes = hkcu
            .open_subkey_with_flags(HKCU_CLASSES, KEY_WRITE)
            .map_err(|e| AppError::Custom(format!("Failed to open HKCU Classes: {}", e)))?;

        let result = (|| -> AppResult<()> {
            // 1. Directory right-click
            {
                let (dir_key, _) =
                    classes
                        .create_subkey("Directory\\shell\\CodexOS")
                        .map_err(|e| {
                            AppError::Custom(format!("Failed to create Directory shell: {}", e))
                        })?;
                dir_key
                    .set_value("", &"Open with CodexOS")
                    .map_err(|e| AppError::Custom(e.to_string()))?;
                dir_key
                    .set_value("Icon", &exe_path)
                    .map_err(|e| AppError::Custom(e.to_string()))?;

                let (cmd_key, _) = dir_key
                    .create_subkey("command")
                    .map_err(|e| AppError::Custom(e.to_string()))?;
                let cmd_val = format!("{} \"%V\"", quoted_exe);
                cmd_key
                    .set_value("", &cmd_val)
                    .map_err(|e| AppError::Custom(e.to_string()))?;
            }

            // 2. Directory Background right-click
            {
                let (bg_key, _) = classes
                    .create_subkey("Directory\\Background\\shell\\CodexOS")
                    .map_err(|e| {
                        AppError::Custom(format!("Failed to create Background shell: {}", e))
                    })?;
                bg_key
                    .set_value("", &"Open in CodexOS")
                    .map_err(|e| AppError::Custom(e.to_string()))?;
                bg_key
                    .set_value("Icon", &exe_path)
                    .map_err(|e| AppError::Custom(e.to_string()))?;

                let (cmd_key, _) = bg_key
                    .create_subkey("command")
                    .map_err(|e| AppError::Custom(e.to_string()))?;
                let cmd_val = format!("{} \"%V\"", quoted_exe);
                cmd_key
                    .set_value("", &cmd_val)
                    .map_err(|e| AppError::Custom(e.to_string()))?;
            }

            // 3. Drive root right-click (e.g. C:\)
            {
                let (drive_key, _) =
                    classes
                        .create_subkey("Drive\\shell\\CodexOS")
                        .map_err(|e| {
                            AppError::Custom(format!("Failed to create Drive shell: {}", e))
                        })?;
                drive_key
                    .set_value("", &"Open with CodexOS")
                    .map_err(|e| AppError::Custom(e.to_string()))?;
                drive_key
                    .set_value("Icon", &exe_path)
                    .map_err(|e| AppError::Custom(e.to_string()))?;

                let (cmd_key, _) = drive_key
                    .create_subkey("command")
                    .map_err(|e| AppError::Custom(e.to_string()))?;
                let cmd_val = format!("{} \"%V\"", quoted_exe);
                cmd_key
                    .set_value("", &cmd_val)
                    .map_err(|e| AppError::Custom(e.to_string()))?;
            }

            Ok(())
        })();

        if result.is_err() {
            // Atomic rollback: Clean up any partially created entries on failure
            let _ = unregister_context_menu();
        }

        result
    }

    pub fn unregister_context_menu() -> AppResult<()> {
        let hkcu = RegKey::predef(HKEY_CURRENT_USER);

        if let Ok(dir_shell) =
            hkcu.open_subkey_with_flags(format!("{}\\Directory\\shell", HKCU_CLASSES), KEY_WRITE)
        {
            let _ = dir_shell.delete_subkey_all("CodexOS");
        }

        if let Ok(bg_shell) = hkcu.open_subkey_with_flags(
            format!("{}\\Directory\\Background\\shell", HKCU_CLASSES),
            KEY_WRITE,
        ) {
            let _ = bg_shell.delete_subkey_all("CodexOS");
        }

        if let Ok(drive_shell) =
            hkcu.open_subkey_with_flags(format!("{}\\Drive\\shell", HKCU_CLASSES), KEY_WRITE)
        {
            let _ = drive_shell.delete_subkey_all("CodexOS");
        }

        Ok(())
    }

    pub fn get_startup_status() -> StartupStatus {
        let hkcu = RegKey::predef(HKEY_CURRENT_USER);
        if let Ok(run_key) = hkcu.open_subkey(RUN_KEY) {
            if let Ok(val) = run_key.get_value::<String, _>(APP_RUN_NAME) {
                let start_minimized = val.contains("--minimized");
                return StartupStatus {
                    enabled: true,
                    start_minimized,
                    supported: true,
                };
            }
        }

        StartupStatus {
            enabled: false,
            start_minimized: false,
            supported: true,
        }
    }

    pub fn set_startup(enabled: bool, start_minimized: bool) -> AppResult<()> {
        let hkcu = RegKey::predef(HKEY_CURRENT_USER);
        let run_key = hkcu
            .open_subkey_with_flags(RUN_KEY, KEY_WRITE)
            .map_err(|e| AppError::Custom(format!("Failed to open Run key: {}", e)))?;

        if enabled {
            let (_, quoted_exe) = get_current_exe_quoted()?;
            let val = if start_minimized {
                format!("{} --minimized", quoted_exe)
            } else {
                quoted_exe
            };
            run_key
                .set_value(APP_RUN_NAME, &val)
                .map_err(|e| AppError::Custom(format!("Failed to set startup value: {}", e)))?;
        } else {
            let _ = run_key.delete_value(APP_RUN_NAME);
        }

        Ok(())
    }
}

#[cfg(not(windows))]
mod non_win_impl {
    use super::*;

    pub fn get_context_menu_status() -> ContextMenuStatus {
        ContextMenuStatus {
            is_registered: false,
            supported: false,
            directory_registered: false,
            background_registered: false,
            drive_registered: false,
        }
    }

    pub fn register_context_menu() -> AppResult<()> {
        Err(AppError::Custom(
            "Windows context menu is only supported on Windows".to_string(),
        ))
    }

    pub fn unregister_context_menu() -> AppResult<()> {
        Ok(())
    }

    pub fn get_startup_status() -> StartupStatus {
        StartupStatus {
            enabled: false,
            start_minimized: false,
            supported: false,
        }
    }

    pub fn set_startup(_enabled: bool, _start_minimized: bool) -> AppResult<()> {
        Err(AppError::Custom(
            "Windows startup integration is only supported on Windows".to_string(),
        ))
    }
}

#[cfg(windows)]
use win_impl as platform;

#[cfg(not(windows))]
use non_win_impl as platform;

#[tauri::command]
pub fn get_windows_integration_status() -> WindowsIntegrationStatus {
    WindowsIntegrationStatus {
        context_menu: platform::get_context_menu_status(),
        startup: platform::get_startup_status(),
        is_windows: cfg!(windows),
        win11_modern_menu_note: "On Windows 11, custom HKCU shell verbs appear in the classic menu via 'Show more options' (Shift+F10) without modifying protected system DLLs.".to_string(),
        default_folder_note: "Windows 10/11 protects the default folder association via UserChoice cryptographic hashes. CodexOS provides safe context menu access and startup options while retaining Windows Explorer as the primary system shell.".to_string(),
    }
}

#[tauri::command]
pub fn register_context_menu() -> AppResult<ContextMenuStatus> {
    platform::register_context_menu()?;
    Ok(platform::get_context_menu_status())
}

#[tauri::command]
pub fn unregister_context_menu() -> AppResult<ContextMenuStatus> {
    platform::unregister_context_menu()?;
    Ok(platform::get_context_menu_status())
}

#[tauri::command]
pub fn set_windows_startup(
    enabled: bool,
    start_minimized: Option<bool>,
) -> AppResult<StartupStatus> {
    platform::set_startup(enabled, start_minimized.unwrap_or(false))?;
    Ok(platform::get_startup_status())
}

#[tauri::command]
pub fn restore_windows_defaults() -> AppResult<WindowsIntegrationStatus> {
    let _ = platform::unregister_context_menu();
    let _ = platform::set_startup(false, false);
    Ok(get_windows_integration_status())
}

#[tauri::command]
pub fn generate_registry_scripts() -> (String, String) {
    let (_, quoted_exe) = get_current_exe_quoted()
        .unwrap_or_else(|_| ("codexos.exe".to_string(), "\"codexos.exe\"".to_string()));

    let escaped_quoted = quoted_exe.replace('\\', "\\\\");

    let register_reg = format!(
        r#"Windows Registry Editor Version 5.00

; CodexOS Windows Explorer Integration (Per-User HKCU)
; Safe rollback file provided in unregister-context-menu.reg

[HKEY_CURRENT_USER\Software\Classes\Directory\shell\CodexOS]
@="Open with CodexOS"
"Icon"={}

[HKEY_CURRENT_USER\Software\Classes\Directory\shell\CodexOS\command]
@="{} \"%V\""

[HKEY_CURRENT_USER\Software\Classes\Directory\Background\shell\CodexOS]
@="Open in CodexOS"
"Icon"={}

[HKEY_CURRENT_USER\Software\Classes\Directory\Background\shell\CodexOS\command]
@="{} \"%V\""

[HKEY_CURRENT_USER\Software\Classes\Drive\shell\CodexOS]
@="Open with CodexOS"
"Icon"={}

[HKEY_CURRENT_USER\Software\Classes\Drive\shell\CodexOS\command]
@="{} \"%V\""
"#,
        escaped_quoted,
        escaped_quoted,
        escaped_quoted,
        escaped_quoted,
        escaped_quoted,
        escaped_quoted
    );

    let unregister_reg = r#"Windows Registry Editor Version 5.00

; CodexOS Clean Rollback Script
[-HKEY_CURRENT_USER\Software\Classes\Directory\shell\CodexOS]
[-HKEY_CURRENT_USER\Software\Classes\Directory\Background\shell\CodexOS]
[-HKEY_CURRENT_USER\Software\Classes\Drive\shell\CodexOS]

[HKEY_CURRENT_USER\Software\Microsoft\Windows\CurrentVersion\Run]
"CodexOS"=-
"#
    .to_string();

    (register_reg, unregister_reg)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_extract_folder_paths_from_args_skips_flags() {
        let temp_dir = std::env::temp_dir();
        let temp_str = temp_dir.to_string_lossy().to_string();

        let args = vec![
            "codexos.exe".to_string(),
            "--minimized".to_string(),
            "-v".to_string(),
            temp_str.clone(),
            "/p".to_string(),
        ];

        let extracted = extract_folder_paths_from_args(&args);
        assert_eq!(extracted.len(), 1);
        assert!(
            extracted[0].contains("Temp")
                || extracted[0].contains("temp")
                || extracted[0].contains("AppData")
        );
    }

    #[test]
    fn test_extract_folder_paths_non_existent_ignored() {
        let args = vec![
            "app.exe".to_string(),
            "C:\\NonExistent_Fake_Dir_123456789".to_string(),
            "/flag".to_string(),
        ];
        let extracted = extract_folder_paths_from_args(&args);
        assert!(extracted.is_empty());
    }

    #[test]
    fn test_generate_registry_scripts_format() {
        let (reg, unreg) = generate_registry_scripts();
        assert!(reg.contains("Windows Registry Editor Version 5.00"));
        assert!(reg.contains("Directory\\shell\\CodexOS"));
        assert!(
            unreg.contains("[-HKEY_CURRENT_USER\\Software\\Classes\\Directory\\shell\\CodexOS]")
        );
        assert!(unreg
            .contains("[HKEY_CURRENT_USER\\Software\\Microsoft\\Windows\\CurrentVersion\\Run]"));
        assert!(unreg.contains("\"CodexOS\"=-"));
    }

    #[test]
    fn test_extract_folder_paths_skips_files() {
        let temp_dir = std::env::temp_dir();
        let file_path = temp_dir.join(format!("codexos_test_file_{}.txt", std::process::id()));
        std::fs::write(&file_path, "dummy").unwrap();

        let args = vec![
            "codexos.exe".to_string(),
            file_path.to_string_lossy().to_string(),
        ];
        let extracted = extract_folder_paths_from_args(&args);
        let _ = std::fs::remove_file(&file_path);

        assert!(
            extracted.is_empty(),
            "Files must NOT be extracted as folder paths"
        );
    }

    #[test]
    fn test_extract_folder_paths_supports_spaces_and_unicode() {
        let temp_dir = std::env::temp_dir();
        let sub_dir = temp_dir.join(format!(
            "CodexOS Test Dir Проект 日本語 {}",
            std::process::id()
        ));
        std::fs::create_dir_all(&sub_dir).unwrap();

        let sub_str = sub_dir.to_string_lossy().to_string();
        let args = vec!["codexos.exe".to_string(), sub_str.clone()];
        let extracted = extract_folder_paths_from_args(&args);
        let _ = std::fs::remove_dir_all(&sub_dir);

        assert_eq!(extracted.len(), 1);
        assert!(extracted[0].contains("CodexOS Test Dir"));
    }

    #[test]
    fn test_extract_folder_paths_preserves_multiple_directories() {
        let temp_dir = std::env::temp_dir();
        let dir1 = temp_dir.join(format!("codexos_test_d1_{}", std::process::id()));
        let dir2 = temp_dir.join(format!("codexos_test_d2_{}", std::process::id()));
        std::fs::create_dir_all(&dir1).unwrap();
        std::fs::create_dir_all(&dir2).unwrap();

        let args = vec![
            "codexos.exe".to_string(),
            dir1.to_string_lossy().to_string(),
            dir2.to_string_lossy().to_string(),
        ];
        let extracted = extract_folder_paths_from_args(&args);
        let _ = std::fs::remove_dir_all(&dir1);
        let _ = std::fs::remove_dir_all(&dir2);

        assert_eq!(extracted.len(), 2);
    }
}
