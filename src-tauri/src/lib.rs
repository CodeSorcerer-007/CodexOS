use std::sync::Mutex;
use sysinfo::System;

pub mod error;
pub mod util;
pub mod kv;
pub mod ai;
pub mod db;
pub mod devdocs;
pub mod multiplexer;
pub mod plugin;
pub mod proxy;
pub mod secrets;
pub mod sys;
pub mod tunnel;
pub mod vault;
pub mod hmac_vault;
pub mod fs_cache;

pub mod archive;
pub mod crypto_tools;
pub mod cli_runner;
pub mod docker;
pub mod files;
pub mod git;
pub mod ports;
pub mod ssh;
pub mod system_tools;
pub mod commands;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let sys = System::new();

    let mut builder = tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .manage(ports::TailState {
            task: Mutex::new(None),
        })
        .manage(sys::SysState(std::sync::Arc::new(Mutex::new(sys))))
        .manage(multiplexer::MultiPtyState::new())
        .manage(secrets::SecretsState::new())
        .manage(tunnel::TunnelState::new())
        .manage(proxy::ProxyState::new())
        .manage(kv::KvState::new())
        .manage(ai::DiagnosisState::new())
        .manage(fs_cache::FsWatcherState::new())
        .manage(files::AllowedPathsState::new());

    builder = commands::register(builder);

    builder
        .setup(|app| {
            use tauri::Manager;
            if let Some(window) = app.get_webview_window("main") {
                let _ = window.show();
                let _ = window.set_focus();
            } else {
                log::warn!("'main' webview window not found during setup");
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

            Ok(())
        })
        .build(tauri::generate_context!())
        .expect("error while building tauri application")
        .run(|_app_handle, _event| {});
}
