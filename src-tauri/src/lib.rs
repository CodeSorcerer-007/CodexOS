use portable_pty::{CommandBuilder, native_pty_system, PtySize};
use std::thread;
use std::io::{Read, Write};
use std::sync::{Arc, Mutex};
use sysinfo::{Networks, System};
use tauri::{Emitter, State};

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

pub mod files;
pub mod git;
pub mod docker;
pub mod ports;
pub mod system_tools;
pub mod archive;
pub mod crypto_tools;
pub mod ssh;

struct PtyState {
    writer: Arc<Mutex<Option<Box<dyn Write + Send>>>>,
    child: Arc<Mutex<Option<Box<dyn portable_pty::Child + Send + Sync>>>>,
    master: Arc<Mutex<Option<Box<dyn portable_pty::MasterPty + Send>>>>,
}

struct SysState(Mutex<System>);
struct NetState(Mutex<Networks>);

#[tauri::command]
fn start_pty(app_handle: tauri::AppHandle, state: State<'_, PtyState>) -> Result<(), String> {
    let pty_system = native_pty_system();
    let pair = pty_system.openpty(PtySize {
        rows: 24,
        cols: 80,
        pixel_width: 0,
        pixel_height: 0,
    }).map_err(|e| e.to_string())?;

    let cmd = CommandBuilder::new("powershell.exe");
    let child = pair.slave.spawn_command(cmd).map_err(|e| e.to_string())?;

    let mut reader = pair.master.try_clone_reader().map_err(|e| e.to_string())?;
    let writer = pair.master.take_writer().map_err(|e| e.to_string())?;

    *state.writer.lock().unwrap() = Some(writer);
    *state.child.lock().unwrap() = Some(child);
    *state.master.lock().unwrap() = Some(pair.master);

    thread::spawn(move || {
        let mut buf = [0u8; 1024];
        while let Ok(n) = reader.read(&mut buf) {
            if n == 0 { break; }
            let s = String::from_utf8_lossy(&buf[..n]);
            let _ = app_handle.emit("pty-output", s.to_string());
        }
    });

    Ok(())
}

#[tauri::command]
fn write_pty(data: String, state: State<'_, PtyState>) -> Result<(), String> {
    if let Some(writer) = state.writer.lock().unwrap().as_mut() {
        writer.write_all(data.as_bytes()).map_err(|e| e.to_string())?;
    }
    Ok(())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let sys = System::new();
    
    tauri::Builder::default()
        .manage(PtyState {
            writer: Arc::new(Mutex::new(None)),
            child: Arc::new(Mutex::new(None)),
            master: Arc::new(Mutex::new(None)),
        })
        .manage(ports::TailState {
            task: Mutex::new(None),
        })
        .manage(sys::SysState(Mutex::new(sys)))
        .manage(multiplexer::MultiPtyState::new())
        .manage(secrets::SecretsState::new())
        .manage(tunnel::TunnelState::new())
        .manage(proxy::ProxyState::new())
        .invoke_handler(tauri::generate_handler![
            files::get_drives,
            files::read_file_text,
            files::write_file_text,
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
            plugin::run_wasm_plugin,
            plugin::run_wasi_nano_vm,
            start_pty,
            write_pty,
            sys::get_sys_stats,
            sys::get_gpu_info,
            sys::get_gpu_utilization,
            files::scan_dev_bloat,
            zkp::generate_zk_proof,
            zkp::verify_zk_proof,
            secrets::add_secret,
            secrets::list_secret_keys,
            secrets::remove_secret,
            secrets::run_with_secrets,
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
            files::get_treemap_data,
            system_tools::get_env_vars,
            system_tools::set_env_var,
            system_tools::delete_env_var,
            system_tools::get_services,
            system_tools::manage_service,
            system_tools::get_project_tasks,
            system_tools::list_wsl_distros,
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
            files::delete_file
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
