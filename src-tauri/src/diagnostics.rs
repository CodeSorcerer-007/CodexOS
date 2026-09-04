use crate::kv::{with_kv_db, KvState};
use serde::{Deserialize, Serialize};
use std::fs::{self, File};
use std::io::{Read, Write};
use std::path::PathBuf;
use std::sync::atomic::{AtomicBool, Ordering};
use std::time::{SystemTime, UNIX_EPOCH};
use tauri::Manager;
use zip::write::SimpleFileOptions;
use zip::ZipWriter;

static PANIC_HOOK_INITIALIZED: AtomicBool = AtomicBool::new(false);
static TELEMETRY_ENABLED: AtomicBool = AtomicBool::new(true);

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DiagnosticsSummary {
    pub app_version: String,
    pub os_name: String,
    pub os_arch: String,
    pub cpu_count: usize,
    pub total_memory_mb: u64,
    pub used_memory_mb: u64,
    pub crash_dump_count: usize,
    pub schema_version: u32,
    pub log_file_count: usize,
    pub is_telemetry_enabled: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CrashDump {
    pub timestamp: u64,
    pub message: String,
    pub location: String,
    pub os: String,
    pub arch: String,
    pub app_version: String,
    pub backtrace: String,
}

/// Sets up an opt-in, offline-first local panic hook that writes crash dumps into `<app_data_dir>/crashes/`
pub fn init_panic_hook(app_data_dir: PathBuf) {
    if PANIC_HOOK_INITIALIZED.swap(true, Ordering::SeqCst) {
        return;
    }

    let default_hook = std::panic::take_hook();
    let crash_dir = app_data_dir.join("crashes");
    let _ = fs::create_dir_all(&crash_dir);

    std::panic::set_hook(Box::new(move |panic_info| {
        if TELEMETRY_ENABLED.load(Ordering::Relaxed) {
            let now = SystemTime::now()
                .duration_since(UNIX_EPOCH)
                .unwrap_or_default()
                .as_secs();

            let payload_msg = if let Some(s) = panic_info.payload().downcast_ref::<&str>() {
                s.to_string()
            } else if let Some(s) = panic_info.payload().downcast_ref::<String>() {
                s.clone()
            } else {
                "Unknown panic payload".to_string()
            };

            let location_str = if let Some(loc) = panic_info.location() {
                format!("{}:{}:{}", loc.file(), loc.line(), loc.column())
            } else {
                "Unknown location".to_string()
            };

            let backtrace_str = format!("{:?}", std::backtrace::Backtrace::capture());

            let dump = CrashDump {
                timestamp: now,
                message: payload_msg,
                location: location_str,
                os: std::env::consts::OS.to_string(),
                arch: std::env::consts::ARCH.to_string(),
                app_version: "2.1.0".to_string(),
                backtrace: backtrace_str,
            };

            let file_name = format!("crash_{}.json", now);
            let target_path = crash_dir.join(file_name);
            if let Ok(json) = serde_json::to_string_pretty(&dump) {
                let _ = fs::write(target_path, json);
            }
        }

        // Call previous hook so terminal/console continues receiving standard logs
        default_hook(panic_info);
    }));

    log::info!("Local panic diagnostics hook initialized successfully.");
}

/// Sanitizes potential secrets (API keys, bearer tokens, SSH keys, passwords) from text logs
pub fn sanitize_log_text(raw: &str) -> String {
    let mut sanitized = raw.to_string();

    // Redact Bearer tokens
    if let Ok(re_bearer) = regex::Regex::new(r"(?i)bearer\s+[a-zA-Z0-9_\-\.]{15,}") {
        sanitized = re_bearer.replace_all(&sanitized, "Bearer [REDACTED]").to_string();
    }

    // Redact Mistral / OpenAI / generic API keys
    if let Ok(re_key) = regex::Regex::new(r#"(?i)(api[-_]?key|secret|password)\s*[:=]\s*['"]?[a-zA-Z0-9_\-.]{10,}['"]?"#) {
        sanitized = re_key.replace_all(&sanitized, "$1: \"[REDACTED]\"").to_string();
    }

    // Redact SSH private key blocks
    if let Ok(re_ssh) = regex::Regex::new(r"(?s)-----BEGIN [A-Z ]+ PRIVATE KEY-----.*?-----END [A-Z ]+ PRIVATE KEY-----") {
        sanitized = re_ssh.replace_all(&sanitized, "[REDACTED_PRIVATE_KEY_BLOCK]").to_string();
    }

    sanitized
}

/// Gathers system metrics and returns diagnostic overview for the UI
#[tauri::command]
pub fn get_diagnostics_summary(
    app_handle: tauri::AppHandle,
    kv_state: tauri::State<'_, KvState>,
) -> Result<DiagnosticsSummary, String> {
    use sysinfo::{CpuRefreshKind, MemoryRefreshKind, RefreshKind, System};

    let mut sys = System::new_with_specifics(
        RefreshKind::nothing()
            .with_cpu(CpuRefreshKind::everything())
            .with_memory(MemoryRefreshKind::everything()),
    );
    sys.refresh_memory();

    let app_dir = app_handle
        .path()
        .app_data_dir()
        .unwrap_or_else(|_| PathBuf::from("."));

    let crash_dir = app_dir.join("crashes");
    let mut crash_count = 0;
    if let Ok(entries) = fs::read_dir(&crash_dir) {
        crash_count = entries.filter_map(|e| e.ok()).count();
    }

    let log_dir = app_dir.join("logs");
    let mut log_count = 0;
    if let Ok(entries) = fs::read_dir(&log_dir) {
        log_count = entries.filter_map(|e| e.ok()).count();
    }

    let schema_ver = with_kv_db(&app_handle, &kv_state, |conn| {
        crate::db_migration::get_user_version(conn).ok()
    })
    .unwrap_or(0);

    let total_memory_mb = sys.total_memory() / 1024 / 1024;
    let used_memory_mb = sys.used_memory() / 1024 / 1024;

    Ok(DiagnosticsSummary {
        app_version: "2.1.0".to_string(),
        os_name: std::env::consts::OS.to_string(),
        os_arch: std::env::consts::ARCH.to_string(),
        cpu_count: sys.cpus().len(),
        total_memory_mb,
        used_memory_mb,
        crash_dump_count: crash_count,
        schema_version: schema_ver,
        log_file_count: log_count,
        is_telemetry_enabled: TELEMETRY_ENABLED.load(Ordering::Relaxed),
    })
}

/// Toggles opt-in local crash diagnostics
#[tauri::command]
pub fn set_local_diagnostics_enabled(enabled: bool) -> Result<bool, String> {
    TELEMETRY_ENABLED.store(enabled, Ordering::Relaxed);
    log::info!("Opt-in local diagnostics set to: {}", enabled);
    Ok(enabled)
}

/// Compiles a sanitized .zip diagnostic bundle for debugging
#[tauri::command]
pub fn export_system_report(
    app_handle: tauri::AppHandle,
    kv_state: tauri::State<'_, KvState>,
    target_folder: Option<String>,
) -> Result<String, String> {
    let now = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_secs();

    let app_dir = app_handle
        .path()
        .app_data_dir()
        .unwrap_or_else(|_| PathBuf::from("."));

    let output_dir = if let Some(folder) = target_folder {
        PathBuf::from(folder)
    } else if let Ok(download_dir) = app_handle.path().download_dir() {
        download_dir
    } else {
        app_dir.clone()
    };

    let zip_filename = format!("codexos-diagnostic-report-{}.zip", now);
    let zip_path = output_dir.join(&zip_filename);

    let file = File::create(&zip_path)
        .map_err(|e| format!("Failed to create diagnostic archive: {}", e))?;
    let mut zip = ZipWriter::new(file);
    let file_options = SimpleFileOptions::default()
        .compression_method(zip::CompressionMethod::Deflated);

    // 1. Write System Metadata
    let summary = get_diagnostics_summary(app_handle.clone(), kv_state.clone())?;
    let summary_json = serde_json::to_string_pretty(&summary)
        .map_err(|e| format!("Failed to format diagnostic metadata: {}", e))?;

    zip.start_file("system_metadata.json", file_options)
        .map_err(|e| format!("Zip start error: {}", e))?;
    zip.write_all(summary_json.as_bytes())
        .map_err(|e| format!("Zip write error: {}", e))?;

    // 2. Write Database Schema and Migration Status
    let db_status = with_kv_db(&app_handle, &kv_state, |conn| {
        crate::db_migration::get_migration_status(conn).ok()
    });
    if let Some(status) = db_status {
        if let Ok(db_json) = serde_json::to_string_pretty(&status) {
            let _ = zip.start_file("database_migration_status.json", file_options);
            let _ = zip.write_all(db_json.as_bytes());
        }
    }

    // 3. Include and sanitize application logs
    let log_dir = app_dir.join("logs");
    if let Ok(entries) = fs::read_dir(&log_dir) {
        for entry in entries.flatten() {
            let path = entry.path();
            if path.is_file() {
                let file_name = path.file_name().unwrap_or_default().to_string_lossy();
                if let Ok(mut f) = File::open(&path) {
                    let mut content = String::new();
                    if f.read_to_string(&mut content).is_ok() {
                        let sanitized = sanitize_log_text(&content);
                        let _ = zip.start_file(format!("logs/{}", file_name), file_options);
                        let _ = zip.write_all(sanitized.as_bytes());
                    }
                }
            }
        }
    }

    // 4. Include crash dumps
    let crash_dir = app_dir.join("crashes");
    if let Ok(entries) = fs::read_dir(&crash_dir) {
        for entry in entries.flatten() {
            let path = entry.path();
            if path.is_file() {
                let file_name = path.file_name().unwrap_or_default().to_string_lossy();
                if let Ok(content) = fs::read_to_string(&path) {
                    let _ = zip.start_file(format!("crashes/{}", file_name), file_options);
                    let _ = zip.write_all(content.as_bytes());
                }
            }
        }
    }

    // 5. Finalize archive
    zip.finish()
        .map_err(|e| format!("Failed to finalize diagnostic archive: {}", e))?;

    log::info!("Diagnostic report exported to: {}", zip_path.display());
    Ok(zip_path.to_string_lossy().to_string())
}

/// Clears stored local crash dumps
#[tauri::command]
pub fn clear_crash_dumps(app_handle: tauri::AppHandle) -> Result<usize, String> {
    let app_dir = app_handle
        .path()
        .app_data_dir()
        .unwrap_or_else(|_| PathBuf::from("."));
    let crash_dir = app_dir.join("crashes");

    let mut deleted_count = 0;
    if let Ok(entries) = fs::read_dir(&crash_dir) {
        for entry in entries.flatten() {
            let path = entry.path();
            if path.is_file() && fs::remove_file(path).is_ok() {
                deleted_count += 1;
            }
        }
    }

    log::info!("Cleared {} crash dumps from local storage.", deleted_count);
    Ok(deleted_count)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_sanitize_log_text() {
        let raw = "User token: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.test and api_key: 'sk-1234567890abcdefghij'";
        let sanitized = sanitize_log_text(raw);
        assert!(!sanitized.contains("eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9"));
        assert!(!sanitized.contains("sk-1234567890abcdefghij"));
        assert!(sanitized.contains("[REDACTED]"));
    }
}
