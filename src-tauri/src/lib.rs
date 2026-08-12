use std::sync::Mutex;
use sysinfo::System;

mod vault;
mod db;
mod devdocs;
mod multiplexer;
mod proxy;
mod plugin;
mod zkp;
mod secrets;
mod tunnel;
mod sys;
mod ai;

pub mod files;
pub mod git;
pub mod docker;
pub mod ports;
pub mod system_tools;
pub mod archive;
pub mod crypto_tools;
pub mod ssh;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let sys = System::new();
    
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .manage(ports::TailState {
            task: Mutex::new(None),
        })
        .manage(sys::SysState(Mutex::new(sys)))
        .manage(multiplexer::MultiPtyState::new())
        .manage(secrets::SecretsState::new())
        .manage(tunnel::TunnelState::new())
        .manage(proxy::ProxyState::new())
        .manage(ai::DiagnosisState::new())
        .invoke_handler(tauri::generate_handler![
            files::get_drives,
            files::read_file_text,
            files::write_file_text,
            files::create_file,
            files::create_directory,
            files::rename_path,
            files::read_file_binary,
            files::write_file_binary_webrtc,
            vault::encrypt_vault,
            vault::decrypt_vault,
            db::query_database,
            devdocs::query_docset,
            multiplexer::start_multiplex_pty,
            multiplexer::write_multiplex_pty,
            multiplexer::kill_multiplex_pty,
            proxy::start_proxy,
            proxy::stop_proxy,
            proxy::get_captured_requests,
            proxy::clear_captured_requests,
            proxy::replay_request,
            proxy::kv_set,
            proxy::kv_get,
            plugin::run_wasm_plugin,
            plugin::run_wasi_nano_vm,
            sys::get_sys_stats,
            sys::get_top_processes_memory,
            sys::get_gpu_info,
            sys::get_gpu_utilization,
            files::scan_dev_bloat,
            zkp::generate_hmac_proof,
            zkp::verify_hmac_proof,
            secrets::add_secret,
            secrets::list_secret_keys,
            secrets::remove_secret,
            secrets::has_secret,
            secrets::run_with_secrets,
            secrets::is_vault_locked,
            secrets::unlock_vault,
            secrets::lock_vault,
            tunnel::start_tunnel,
            tunnel::stop_tunnel,
            tunnel::list_tunnels,
            files::purge_directories,
            files::get_current_dir,
            files::get_files_in_dir,
            git::get_git_status,
            git::search_contents,
            git::git_action,
            git::git_history,
            git::git_show,
            git::get_branches,
            git::git_checkout,
            git::git_create_branch,
            git::git_pull,
            git::git_fetch,
            git::get_file_diff,
            git::get_staged_diff,
            git::get_recent_commit_diff,
            git::git_clone,
            git::git_stash,
            git::git_stash_pop,
            docker::get_docker_containers,
            docker::docker_action,
            docker::stream_docker_logs,
            docker::get_docker_images,
            docker::docker_pull_image,
            docker::docker_remove_image,
            docker::get_container_stats,
            docker::docker_inspect,
            system_tools::detect_tool,
            system_tools::get_os_info,
            files::get_code_metrics,
            ports::get_active_ports,
            ports::kill_process,
            ports::spawn_local_server,
            db::query_sqlite,
            files::bulk_rename,
            archive::list_zip_contents,
            archive::read_zip_file,
            ports::start_tail_log,
            ports::stop_tail_log,
            ssh::ssh_list_dir,
            ssh::ssh_read_file_text,
            ssh::ssh_write_file_text,
            files::get_treemap_data,
            system_tools::get_env_vars,
            system_tools::set_env_var,
            system_tools::delete_env_var,
            system_tools::get_services,
            system_tools::manage_service,
            system_tools::get_project_tasks,
            system_tools::list_wsl_distros,
            system_tools::execute_command,
            crypto_tools::convert_format,
            crypto_tools::calculate_hash,
            files::find_duplicates,
            system_tools::read_hosts,
            system_tools::write_hosts,
            crypto_tools::optimize_image,
            files::copy_file,
            files::move_file,
            system_tools::install_font,
            ports::execute_http_request,
            crypto_tools::inspect_ssl_cert,
            files::delete_file,
            ai::query_ollama,
            ai::diagnose_issue,
            ai::is_copilot_configured
        ])
        .setup(|app| {
            use tauri::Manager;
            let window = app.get_webview_window("main").expect("WINDOW NOT FOUND!");
            window.show().unwrap();
            window.set_focus().unwrap();
            if cfg!(debug_assertions) {
                app.handle().plugin(
                    tauri_plugin_log::Builder::default()
                        .level(log::LevelFilter::Info)
                        .build(),
                )?;
            }
            Ok(())
        })
        .build(tauri::generate_context!())
        .expect("error while building tauri application")
        .run(|_app_handle, _event| {
        });
}
