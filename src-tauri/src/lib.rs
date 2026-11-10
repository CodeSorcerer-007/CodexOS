use std::sync::Mutex;

pub mod ai;
pub mod db;
pub mod db_migration;
pub mod devdocs;
pub mod diagnostics;
pub mod error;
pub mod fs_cache;
pub mod hmac_vault;
pub mod kv;
pub mod multiplexer;
pub mod plugin;
pub mod proxy;
pub mod secrets;
pub mod sys;
pub mod tunnel;
pub mod util;
pub mod vault;

pub mod archive;
pub mod cli_runner;
pub mod commands;
pub mod crypto_tools;
pub mod docker;
pub mod files;
pub mod git;
pub mod ports;
pub mod search;
pub mod ssh;
pub mod system_tools;
pub mod transfer_manager;
pub mod tray;
pub mod windows_integration;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let mut builder = tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_single_instance::init(|app, argv, _cwd| {
            use tauri::Emitter;
            use tauri::Manager;

            if let Some(window) = app.get_webview_window("main") {
                let _ = window.unminimize();
                let _ = window.show();
                let _ = window.set_focus();
            }

            let paths = windows_integration::extract_folder_paths_from_args(&argv);
            if !paths.is_empty() {
                if let Some(allowed) = app.try_state::<files::AllowedPathsState>() {
                    for path in &paths {
                        allowed.allow(std::path::Path::new(path));
                    }
                }
                let _ = app.emit("open-cli-paths", &paths);
            }
        }))
        .manage(ports::TailState {
            task: Mutex::new(None),
        })
        .manage(sys::SysState::new())
        .manage(multiplexer::MultiPtyState::new())
        .manage(secrets::SecretsState::new())
        .manage(tunnel::TunnelState::new())
        .manage(proxy::ProxyState::new())
        .manage(kv::KvState::new())
        .manage(ai::DiagnosisState::new())
        .manage(fs_cache::FsWatcherState::new())
        .manage(files::AllowedPathsState::new())
        .manage(files::OperationJournalState::new())
        .manage(transfer_manager::TransferManagerState::new())
        .manage(search::SearchManagerState::new())
        .manage(docker::DockerLogStreamState::new());

    builder = commands::register(builder);

    builder
        .setup(|app| {
            use tauri::Manager;

            let args: Vec<String> = std::env::args().collect();
            let start_minimized = args.iter().any(|a| a == "--minimized");

            if let Some(window) = app.get_webview_window("main") {
                if !start_minimized {
                    let _ = window.show();
                    let _ = window.set_focus();
                } else {
                    let _ = window.minimize();
                }
            } else {
                log::warn!("'main' webview window not found during setup");
            }

            let initial_paths = windows_integration::extract_folder_paths_from_args(&args);
            if !initial_paths.is_empty() {
                if let Some(allowed) = app.try_state::<files::AllowedPathsState>() {
                    for path in &initial_paths {
                        allowed.allow(std::path::Path::new(path));
                    }
                }
                let app_handle = app.handle().clone();
                tauri::async_runtime::spawn(async move {
                    tokio::time::sleep(std::time::Duration::from_millis(500)).await;
                    use tauri::Emitter;
                    let _ = app_handle.emit("open-cli-paths", &initial_paths);
                });
            }

            let log_level = if cfg!(debug_assertions) {
                log::LevelFilter::Info
            } else {
                log::LevelFilter::Warn
            };

            let _ = app.handle().plugin(
                tauri_plugin_log::Builder::default()
                    .level(log_level)
                    .rotation_strategy(tauri_plugin_log::RotationStrategy::KeepOne)
                    .max_file_size(5_242_880)
                    .build(),
            );

            if let Ok(app_dir) = app.path().app_data_dir() {
                diagnostics::init_panic_hook(app_dir);
            }

            #[cfg(desktop)]
            {
                if let Err(e) = tray::create_tray(app.handle()) {
                    log::warn!("Failed to create system tray: {}", e);
                }
            }

            Ok(())
        })
        .build(tauri::generate_context!())
        .expect("error while building tauri application")
        .run(|_app_handle, _event| {});
}
