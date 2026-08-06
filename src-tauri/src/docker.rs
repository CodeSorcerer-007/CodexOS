use serde::{Deserialize, Serialize};

#[derive(Serialize, Deserialize)]
pub struct DockerContainer {
    pub id: String,
    pub name: String,
    pub image: String,
    pub state: String,
    pub status: String,
    pub ports: String,
}

#[derive(Serialize, Deserialize)]
pub struct DockerImage {
    pub id: String,
    pub repository: String,
    pub tag: String,
    pub size: String,
}

#[derive(Serialize, Deserialize)]
pub struct ContainerStats {
    pub cpu_perc: String,
    pub mem_usage: String,
    pub net_io: String,
}

#[tauri::command]
pub fn get_docker_containers() -> Result<Vec<DockerContainer>, String> {
    use std::process::Command;
    
    let output = Command::new("docker")
        .args(["ps", "-a", "--format", "{{.ID}}|{{.Names}}|{{.Image}}|{{.State}}|{{.Status}}|{{.Ports}}"])
        .output()
        .map_err(|e| e.to_string())?;
        
    let mut containers = Vec::new();
    if output.status.success() {
        let stdout = String::from_utf8_lossy(&output.stdout);
        for line in stdout.lines() {
            let parts: Vec<&str> = line.splitn(6, '|').collect();
            if parts.len() == 6 {
                containers.push(DockerContainer {
                    id: parts[0].to_string(),
                    name: parts[1].to_string(),
                    image: parts[2].to_string(),
                    state: parts[3].to_string(),
                    status: parts[4].to_string(),
                    ports: parts[5].to_string(),
                });
            }
        }
    }
    
    Ok(containers)
}

#[tauri::command]
pub fn docker_action(container_id: String, action: String) -> Result<String, String> {
    let cmd_action = match action.as_str() {
        "start" => "start",
        "stop" => "stop",
        "restart" => "restart",
        "remove" | "rm" => "rm",
        _ => return Err("Invalid action".to_string()),
    };
    
    let mut args = vec![cmd_action];
    if cmd_action == "rm" {
        args.push("-f");
    }
    args.push(&container_id);
    
    let output = std::process::Command::new("docker")
        .args(&args)
        .output()
        .map_err(|e| e.to_string())?;
    
    if output.status.success() {
        Ok(String::from_utf8_lossy(&output.stdout).to_string())
    } else {
        Err(String::from_utf8_lossy(&output.stderr).to_string())
    }
}

#[tauri::command]
pub async fn stream_docker_logs(
    app_handle: tauri::AppHandle,
    container_id: String,
    tail_lines: u32,
) -> Result<(), String> {
    use tokio::process::Command;
    use tokio::io::{AsyncBufReadExt, BufReader};
    use tauri::Emitter;
    
    let mut child = Command::new("docker")
        .args(["logs", "-f", "--tail", &tail_lines.to_string(), &container_id])
        .stdout(std::process::Stdio::piped())
        .stderr(std::process::Stdio::piped())
        .spawn()
        .map_err(|e| e.to_string())?;
    
    let stdout = child.stdout.take().ok_or("no stdout")?;
    let stderr = child.stderr.take().ok_or("no stderr")?;
    
    let event_name = format!("docker-log-{}", container_id);
    
    let app_handle_clone = app_handle.clone();
    let event_clone = event_name.clone();
    tokio::spawn(async move {
        let mut reader = BufReader::new(stdout).lines();
        while let Ok(Some(line)) = reader.next_line().await {
            let _ = app_handle_clone.emit(&event_clone, line);
        }
    });
    
    tokio::spawn(async move {
        let mut reader = BufReader::new(stderr).lines();
        while let Ok(Some(line)) = reader.next_line().await {
            let _ = app_handle.emit(&event_name, format!("[STDERR] {}", line));
        }
    });
    
    Ok(())
}

#[tauri::command]
pub fn get_docker_images() -> Result<Vec<DockerImage>, String> {
    let output = std::process::Command::new("docker")
        .args(["images", "--format", "{{.ID}}|{{.Repository}}|{{.Tag}}|{{.Size}}"])
        .output()
        .map_err(|e| e.to_string())?;
        
    let mut images = Vec::new();
    if output.status.success() {
        let stdout = String::from_utf8_lossy(&output.stdout);
        for line in stdout.lines() {
            let parts: Vec<&str> = line.splitn(4, '|').collect();
            if parts.len() == 4 {
                images.push(DockerImage {
                    id: parts[0].to_string(),
                    repository: parts[1].to_string(),
                    tag: parts[2].to_string(),
                    size: parts[3].to_string(),
                });
            }
        }
    }
    
    Ok(images)
}

#[tauri::command]
pub async fn docker_pull_image(
    image: String,
    app_handle: tauri::AppHandle,
) -> Result<(), String> {
    use tokio::process::Command;
    use tokio::io::{AsyncBufReadExt, BufReader};
    use tauri::Emitter;

    let mut child = Command::new("docker")
        .args(["pull", &image])
        .stdout(std::process::Stdio::piped())
        .stderr(std::process::Stdio::piped())
        .spawn()
        .map_err(|e| e.to_string())?;

    let stdout = child.stdout.take().ok_or("no stdout")?;
    let stderr = child.stderr.take().ok_or("no stderr")?;

    let event_name = format!("docker-pull-{}", image.replace(':', "-").replace('/', "-"));

    let app_handle_clone = app_handle.clone();
    let event_clone = event_name.clone();
    tokio::spawn(async move {
        let mut reader = BufReader::new(stdout).lines();
        while let Ok(Some(line)) = reader.next_line().await {
            let _ = app_handle_clone.emit(&event_clone, line);
        }
    });

    tokio::spawn(async move {
        let mut reader = BufReader::new(stderr).lines();
        while let Ok(Some(line)) = reader.next_line().await {
            let _ = app_handle.emit(&event_name, format!("[STDERR] {}", line));
        }
    });

    Ok(())
}

#[tauri::command]
pub fn docker_remove_image(image_id: String) -> Result<String, String> {
    let output = std::process::Command::new("docker")
        .args(["rmi", "-f", &image_id])
        .output()
        .map_err(|e| e.to_string())?;
    
    if output.status.success() {
        Ok(String::from_utf8_lossy(&output.stdout).to_string())
    } else {
        Err(String::from_utf8_lossy(&output.stderr).to_string())
    }
}

#[tauri::command]
pub fn get_container_stats(container_id: String) -> Result<ContainerStats, String> {
    let output = std::process::Command::new("docker")
        .args(["stats", "--no-stream", "--format", "{{.CPUPerc}}|{{.MemUsage}}|{{.NetIO}}", &container_id])
        .output()
        .map_err(|e| e.to_string())?;
        
    if output.status.success() {
        let stdout = String::from_utf8_lossy(&output.stdout);
        let line = stdout.lines().next().unwrap_or("");
        let parts: Vec<&str> = line.splitn(3, '|').collect();
        if parts.len() == 3 {
            Ok(ContainerStats {
                cpu_perc: parts[0].to_string(),
                mem_usage: parts[1].to_string(),
                net_io: parts[2].to_string(),
            })
        } else {
            Err("Failed to parse stats output".to_string())
        }
    } else {
        Err(String::from_utf8_lossy(&output.stderr).to_string())
    }
}

#[tauri::command]
pub fn docker_inspect(container_id: String) -> Result<String, String> {
    let output = std::process::Command::new("docker")
        .args(["inspect", &container_id])
        .output()
        .map_err(|e| e.to_string())?;
    
    if output.status.success() {
        Ok(String::from_utf8_lossy(&output.stdout).to_string())
    } else {
        Err(String::from_utf8_lossy(&output.stderr).to_string())
    }
}
