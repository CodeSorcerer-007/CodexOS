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
    pub memory_kb: u64,
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
            memory_kb: proc.memory(),
        }
    }).collect();

    processes.sort_by(|a, b| b.memory_kb.cmp(&a.memory_kb));
    processes.into_iter().take(20).collect()
}
