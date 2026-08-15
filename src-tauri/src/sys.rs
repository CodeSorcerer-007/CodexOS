use crate::error::AppResult;
use serde::{Deserialize, Serialize};
use std::sync::Mutex;
use sysinfo::{Disks, System};

#[derive(Serialize, Deserialize)]
pub struct DriveInfo {
    pub name: String,
    pub mount_point: String,
    pub total_space: u64,
    pub available_space: u64,
}

#[derive(Serialize, Deserialize)]
pub struct SysStats {
    pub cpu_usage: f32,
    pub mem_total: u64,
    pub mem_used: u64,
    pub drives: Vec<DriveInfo>,
}

#[derive(Serialize, Deserialize)]
pub struct ProcessMemInfo {
    pub pid: u32,
    pub name: String,
    pub memory_bytes: u64,
}

use std::sync::Arc;

pub struct SysState(pub Arc<Mutex<System>>);

#[tauri::command]
pub fn get_sys_stats(state: tauri::State<'_, SysState>) -> SysStats {
    let mut sys = match state.0.lock() {
        Ok(guard) => guard,
        Err(poisoned) => poisoned.into_inner(),
    };
    sys.refresh_cpu_usage();
    sys.refresh_memory();

    let cpu_usage = if !sys.cpus().is_empty() {
        sys.cpus().iter().map(|c| c.cpu_usage()).sum::<f32>() / sys.cpus().len() as f32
    } else {
        0.0
    };
    let mem_total = sys.total_memory();
    let mem_used = sys.used_memory();

    let disks = Disks::new_with_refreshed_list();
    let drives = disks
        .iter()
        .map(|d| {
            let n = d.name().to_string_lossy().to_string();
            let name = if n.is_empty() {
                d.mount_point().to_string_lossy().to_string()
            } else {
                n
            };
            DriveInfo {
                name,
                mount_point: format!("{}", d.mount_point().display()),
                total_space: d.total_space(),
                available_space: d.available_space(),
            }
        })
        .collect();

    SysStats {
        cpu_usage,
        mem_total,
        mem_used,
        drives,
    }
}

#[tauri::command]
pub fn get_api_version() -> &'static str {
    env!("CARGO_PKG_VERSION")
}

#[tauri::command]
pub fn get_top_processes_memory(state: tauri::State<'_, SysState>) -> Vec<ProcessMemInfo> {
    let mut sys = match state.0.lock() {
        Ok(guard) => guard,
        Err(poisoned) => poisoned.into_inner(),
    };
    sys.refresh_processes(sysinfo::ProcessesToUpdate::All, true);

    let mut processes: Vec<ProcessMemInfo> = sys
        .processes()
        .iter()
        .map(|(pid, proc)| ProcessMemInfo {
            pid: pid.as_u32(),
            name: proc.name().to_string_lossy().to_string(),
            memory_bytes: proc.memory(),
        })
        .collect();

    processes.sort_by_key(|p| std::cmp::Reverse(p.memory_bytes));
    processes.into_iter().take(20).collect()
}

#[derive(Serialize, Deserialize)]
pub struct GpuInfo {
    pub name: String,
    pub adapter_ram: String,
    pub driver_version: String,
    pub video_processor: String,
}

#[tauri::command]
pub fn get_gpu_info() -> AppResult<Vec<GpuInfo>> {
    if !cfg!(target_os = "windows") {
        return Ok(Vec::new());
    }

    let script = "Get-WmiObject Win32_VideoController -ErrorAction SilentlyContinue | Select-Object Name,AdapterRAM,DriverVersion,VideoProcessor | ConvertTo-Json";
    let output = match std::process::Command::new("powershell")
        .args(["-NoProfile", "-Command", script])
        .output()
    {
        Ok(out) => out,
        Err(_) => return Ok(Vec::new()),
    };

    if !output.status.success() {
        return Ok(Vec::new());
    }

    let json = String::from_utf8_lossy(&output.stdout);
    if json.trim().is_empty() {
        return Ok(Vec::new());
    }

    let value: serde_json::Value = match serde_json::from_str(&json) {
        Ok(v) => v,
        Err(_) => return Ok(Vec::new()),
    };

    let items = if value.is_array() {
        value.as_array().unwrap_or(&Vec::new()).clone()
    } else {
        vec![value]
    };

    let gpus = items
        .iter()
        .filter_map(|item| {
            Some(GpuInfo {
                name: item["Name"].as_str()?.to_string(),
                adapter_ram: format!(
                    "{} MB",
                    item["AdapterRAM"].as_u64().unwrap_or(0) / 1_048_576
                ),
                driver_version: item["DriverVersion"]
                    .as_str()
                    .unwrap_or("Unknown")
                    .to_string(),
                video_processor: item["VideoProcessor"]
                    .as_str()
                    .unwrap_or("Unknown")
                    .to_string(),
            })
        })
        .collect();

    Ok(gpus)
}

#[tauri::command]
pub fn get_gpu_utilization() -> AppResult<u8> {
    let nvidia = std::process::Command::new("nvidia-smi")
        .args([
            "--query-gpu=utilization.gpu",
            "--format=csv,noheader,nounits",
        ])
        .output();

    if let Ok(output) = nvidia {
        if output.status.success() {
            let s = String::from_utf8_lossy(&output.stdout);
            if let Ok(val) = s.trim().parse::<u8>() {
                return Ok(val);
            }
        }
    }

    Ok(0)
}

#[tauri::command]
pub fn window_minimize(window: tauri::WebviewWindow) -> AppResult<()> {
    window.minimize().map_err(|e| crate::error::AppError::Custom(e.to_string()))
}

#[tauri::command]
pub fn window_toggle_maximize(window: tauri::WebviewWindow) -> AppResult<()> {
    if window.is_maximized().unwrap_or(false) {
        window.unmaximize().map_err(|e| crate::error::AppError::Custom(e.to_string()))
    } else {
        window.maximize().map_err(|e| crate::error::AppError::Custom(e.to_string()))
    }
}

#[tauri::command]
pub fn window_close(window: tauri::WebviewWindow) -> AppResult<()> {
    window.close().map_err(|e| crate::error::AppError::Custom(e.to_string()))
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::sync::Mutex;
    use sysinfo::System;

    #[test]
    fn test_sys_state_initialization() {
        let state = SysState(std::sync::Arc::new(Mutex::new(System::new_all())));
        let mut sys = state.0.lock().unwrap();
        sys.refresh_memory();
        assert!(sys.total_memory() > 0);
    }

    #[test]
    fn test_sys_state_poison_recovery() {
        let state = SysState(std::sync::Arc::new(Mutex::new(System::new_all())));
        let _ = std::panic::catch_unwind(|| {
            let _guard = state.0.lock().unwrap();
            panic!("poisoning lock");
        });
        assert!(state.0.is_poisoned());
        let mut recovered = match state.0.lock() {
            Ok(g) => g,
            Err(p) => p.into_inner(),
        };
        recovered.refresh_memory();
        assert!(recovered.total_memory() > 0);
    }

    #[test]
    fn test_get_top_processes_memory_ordering() {
        let sys_arc = std::sync::Arc::new(Mutex::new(System::new_all()));
        let state = SysState(sys_arc.clone());
        {
            let mut sys = sys_arc.lock().unwrap();
            sys.refresh_processes(sysinfo::ProcessesToUpdate::All, true);
        }
        let processes = {
            let sys = state.0.lock().unwrap();
            let mut procs: Vec<ProcessMemInfo> = sys
                .processes()
                .iter()
                .map(|(pid, proc)| ProcessMemInfo {
                    pid: pid.as_u32(),
                    name: proc.name().to_string_lossy().to_string(),
                    memory_bytes: proc.memory(),
                })
                .collect();
            procs.sort_by_key(|p| std::cmp::Reverse(p.memory_bytes));
            procs.into_iter().take(20).collect::<Vec<_>>()
        };

        if processes.len() > 1 {
            for i in 0..(processes.len() - 1) {
                assert!(processes[i].memory_bytes >= processes[i + 1].memory_bytes);
            }
        }
    }
}
