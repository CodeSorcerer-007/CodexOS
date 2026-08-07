use sysinfo::{System, Disks};
use std::sync::Mutex;
use serde::{Deserialize, Serialize};

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

pub struct SysState(pub Mutex<System>);

#[tauri::command]
pub fn get_sys_stats(state: tauri::State<'_, SysState>) -> SysStats {
    let mut sys = state.0.lock().unwrap();
    sys.refresh_all();
    
    let cpu_usage = sys.cpus().iter().map(|c| c.cpu_usage()).sum::<f32>() / sys.cpus().len() as f32;
    let mem_total = sys.total_memory();
    let mem_used = sys.used_memory();
    
    let disks = Disks::new_with_refreshed_list();
    let drives = disks.iter().map(|d| DriveInfo {
        name: format!("{:?}", d.name()),
        mount_point: format!("{}", d.mount_point().display()),
        total_space: d.total_space(),
        available_space: d.available_space(),
    }).collect();

    SysStats {
        cpu_usage,
        mem_total,
        mem_used,
        drives,
    }
}

#[tauri::command]
pub fn get_top_processes_memory(state: tauri::State<'_, SysState>) -> Vec<ProcessMemInfo> {
    let mut sys = state.0.lock().unwrap();
    sys.refresh_processes();

    let mut processes: Vec<ProcessMemInfo> = sys.processes().iter().map(|(pid, proc)| {
        ProcessMemInfo {
            pid: pid.as_u32(),
            name: proc.name().to_string(),
            memory_bytes: proc.memory() * 1024,
        }
    }).collect();

    processes.sort_by_key(|b| std::cmp::Reverse(b.memory_bytes));
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
pub fn get_gpu_info() -> Result<Vec<GpuInfo>, String> {
    let script = "Get-WmiObject Win32_VideoController | Select-Object Name,AdapterRAM,DriverVersion,VideoProcessor | ConvertTo-Json";
    let output = std::process::Command::new("powershell")
        .args(["-NoProfile", "-Command", script])
        .output()
        .map_err(|e| e.to_string())?;
    
    let json = String::from_utf8_lossy(&output.stdout);
    
    // Parse the JSON. Note: if only one GPU, it's an object not array.
    // Handle both cases.
    let value: serde_json::Value = serde_json::from_str(&json)
        .map_err(|e| format!("Parse error: {}", e))?;
    
    let items = if value.is_array() {
        value.as_array().unwrap().clone()
    } else {
        vec![value]
    };
    
    let gpus = items.iter().filter_map(|item| {
        Some(GpuInfo {
            name: item["Name"].as_str()?.to_string(),
            adapter_ram: format!("{} MB", item["AdapterRAM"].as_u64().unwrap_or(0) / 1_048_576),
            driver_version: item["DriverVersion"].as_str().unwrap_or("Unknown").to_string(),
            video_processor: item["VideoProcessor"].as_str().unwrap_or("Unknown").to_string(),
        })
    }).collect();
    
    Ok(gpus)
}

#[tauri::command]
pub fn get_gpu_utilization() -> Result<u8, String> {
    // Get GPU utilization via nvidia-smi if NVIDIA GPU, else return 0
    // Try nvidia-smi first (NVIDIA GPUs)
    let nvidia = std::process::Command::new("nvidia-smi")
        .args(["--query-gpu=utilization.gpu", "--format=csv,noheader,nounits"])
        .output();
    
    if let Ok(output) = nvidia {
        if output.status.success() {
            let s = String::from_utf8_lossy(&output.stdout);
            return s.trim().parse::<u8>().map_err(|e| e.to_string());
        }
    }
    
    // Fallback: use WMIC for basic GPU process info
    Ok(0)
}
