use crate::error::{AppError, AppResult};
use crate::cli_runner::{run_cli, run_cli_parse};
use serde::{Deserialize, Serialize};
use tauri::Emitter;
use ts_rs::TS;

#[derive(Serialize, Deserialize, TS)]
#[ts(export, export_to = "../../src/types/bindings/")]
pub struct DockerContainer {
    pub id: String,
    pub name: String,
    pub image: String,
    pub state: String,
    pub status: String,
    pub ports: String,
}

#[derive(Serialize, Deserialize, TS)]
#[ts(export, export_to = "../../src/types/bindings/")]
pub struct DockerImage {
    pub id: String,
    pub repository: String,
    pub tag: String,
    pub size: String,
}

#[derive(Serialize, Deserialize, TS)]
#[ts(export, export_to = "../../src/types/bindings/")]
pub struct ContainerStats {
    pub cpu_perc: String,
    pub mem_usage: String,
    pub net_io: String,
}

fn validate_docker_id(id: &str) -> AppResult<&str> {
    let trimmed = id.trim();
    if trimmed.is_empty() || trimmed.starts_with('-') || trimmed.len() > 256 {
        return Err(AppError::Custom("Invalid Docker identifier format".to_string()));
    }
    if !trimmed.chars().all(|c| c.is_ascii_alphanumeric() || c == '_' || c == '.' || c == '-' || c == ':' || c == '/') {
        return Err(AppError::Custom("Docker identifier contains disallowed characters".to_string()));
    }
    Ok(trimmed)
}

pub fn parse_container_lines(stdout: &str) -> Vec<DockerContainer> {
    let mut containers = Vec::new();
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
    containers
}

/// Executes the get_docker_containers command.
#[tauri::command]
pub fn get_docker_containers() -> AppResult<Vec<DockerContainer>> {
    run_cli_parse(
        "docker",
        &[
            "ps",
            "-a",
            "--format",
            "{{.ID}}|{{.Names}}|{{.Image}}|{{.State}}|{{.Status}}|{{.Ports}}",
        ],
        None,
        |stdout| Ok(parse_container_lines(stdout)),
    )
}

/// Executes the docker_action command.
#[tauri::command]
pub fn docker_action(container_id: String, action: String) -> AppResult<String> {
    let validated_id = validate_docker_id(&container_id)?;
    let cmd_action = match action.as_str() {
        "start" => "start",
        "stop" => "stop",
        "restart" => "restart",
        "remove" | "rm" => "rm",
        _ => return Err(AppError::Custom("Invalid action".to_string())),
    };

    let mut args = vec![cmd_action];
    if cmd_action == "rm" {
        args.push("-f");
    }
    args.push(validated_id);

    let res = run_cli("docker", &args, None)?;
    if res.exit_code == 0 { Ok(res.stdout) } else { Err(AppError::Command(res.stderr)) }
}

/// Executes the stream_docker_logs command.
#[tauri::command]
pub async fn stream_docker_logs(
    app_handle: tauri::AppHandle,
    container_id: String,
    tail_lines: u32,
) -> AppResult<String> {
    let validated_id = validate_docker_id(&container_id)?;
    use tauri::Emitter;
    use tokio::io::{AsyncBufReadExt, BufReader};
    use tokio::process::Command;

    let mut child = Command::new("docker")
        .args([
            "logs",
            "-f",
            "--tail",
            &tail_lines.to_string(),
            validated_id,
        ])
        .kill_on_drop(true)
        .stdout(std::process::Stdio::piped())
        .stderr(std::process::Stdio::piped())
        .spawn()
        .map_err(AppError::from)?;

    let stdout = child.stdout.take().ok_or_else(|| AppError::Custom("No stdout available from process".to_string()))?;
    let stderr = child.stderr.take().ok_or_else(|| AppError::Custom("No stderr available from process".to_string()))?;

    let event_name = format!("docker-log-{}", validated_id);

    let app_handle_clone = app_handle.clone();
    let event_clone = event_name.clone();
    tokio::spawn(async move {
        let mut reader = BufReader::new(stdout).lines();
        while let Ok(Some(line)) = reader.next_line().await {
            if app_handle_clone.emit(&event_clone, line).is_err() {
                break;
            }
        }
        let _ = child.kill().await;
    });

    tokio::spawn(async move {
        let mut reader = BufReader::new(stderr).lines();
        while let Ok(Some(line)) = reader.next_line().await {
            let _ = app_handle.emit(&event_name, format!("[STDERR] {}", line));
        }
    });

    Ok("".to_string())
}

pub fn parse_image_lines(stdout: &str) -> Vec<DockerImage> {
    let mut images = Vec::new();
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
    images
}

/// Executes the get_docker_images command.
#[tauri::command]
pub fn get_docker_images() -> AppResult<Vec<DockerImage>> {
    run_cli_parse("docker", &["images", "--format", "{{.ID}}|{{.Repository}}|{{.Tag}}|{{.Size}}"], None, |stdout| {
        Ok(parse_image_lines(stdout))
    })
}

/// Executes the docker_pull_image command.
#[tauri::command]
pub async fn docker_pull_image(image: String, app_handle: tauri::AppHandle) -> AppResult<String> {
    let validated_img = validate_docker_id(&image)?;
    use tokio::io::{AsyncBufReadExt, BufReader};
    use tokio::process::Command;

    let mut child = Command::new("docker")
        .args(["pull", validated_img])
        .kill_on_drop(true)
        .stdout(std::process::Stdio::piped())
        .stderr(std::process::Stdio::piped())
        .spawn()
        .map_err(AppError::from)?;

    let stdout = child.stdout.take().ok_or_else(|| AppError::Custom("No stdout available from process".to_string()))?;
    let stderr = child.stderr.take().ok_or_else(|| AppError::Custom("No stderr available from process".to_string()))?;

    let event_name = format!("docker-pull-{}", validated_img.replace([':', '/'], "-"));

    let app_handle_clone = app_handle.clone();
    let event_clone = event_name.clone();
    tokio::spawn(async move {
        let mut reader = BufReader::new(stdout).lines();
        while let Ok(Some(line)) = reader.next_line().await {
            if app_handle_clone.emit(&event_clone, line).is_err() {
                break;
            }
        }
        let _ = child.wait().await;
    });

    tokio::spawn(async move {
        let mut reader = BufReader::new(stderr).lines();
        while let Ok(Some(line)) = reader.next_line().await {
            let _ = app_handle.emit(&event_name, format!("[STDERR] {}", line));
        }
    });

    Ok(validated_img.to_string())
}

/// Executes the docker_remove_image command.
#[tauri::command]
pub fn docker_remove_image(image_id: String) -> AppResult<String> {
    let validated_id = validate_docker_id(&image_id)?;
    let res = run_cli("docker", &["rmi", "-f", validated_id], None)?;
    if res.exit_code == 0 { Ok(res.stdout) } else { Err(AppError::Command(res.stderr)) }
}

/// Executes the get_container_stats command.
#[tauri::command]
pub fn get_container_stats(container_id: String) -> AppResult<ContainerStats> {
    let validated_id = validate_docker_id(&container_id)?;
    run_cli_parse("docker", &["stats", "--no-stream", "--format", "{{.CPUPerc}}|{{.MemUsage}}|{{.NetIO}}", validated_id], None, |stdout| {
        let line = stdout.lines().next().unwrap_or("");
        let parts: Vec<&str> = line.splitn(3, '|').collect();
        if parts.len() == 3 {
            Ok(ContainerStats {
                cpu_perc: parts[0].to_string(),
                mem_usage: parts[1].to_string(),
                net_io: parts[2].to_string(),
            })
        } else {
            Err(AppError::Command("Failed to parse stats output".to_string()))
        }
    })
}

/// Executes the docker_inspect command.
#[tauri::command]
pub fn docker_inspect(container_id: String) -> AppResult<String> {
    let validated_id = validate_docker_id(&container_id)?;
    let res = run_cli("docker", &["inspect", validated_id], None)?;
    if res.exit_code == 0 {
        Ok(res.stdout)
    } else {
        Err(AppError::Command(res.stderr))
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_validate_docker_id() {
        assert!(validate_docker_id("abc123def456").is_ok());
        assert!(validate_docker_id("my-container_name:v1.0").is_ok());
        assert!(validate_docker_id("ghcr.io/org/image:latest").is_ok());
        assert!(validate_docker_id("").is_err());
        assert!(validate_docker_id("--privileged").is_err());
        assert!(validate_docker_id("-v /:/host").is_err());
        assert!(validate_docker_id("my_image; rm -rf /").is_err());
    }

    #[test]
    fn test_docker_action_invalid() {
        assert!(docker_action("abc".to_string(), "invalid_action".to_string()).is_err());
        assert!(docker_action("--flag".to_string(), "start".to_string()).is_err());
    }

    #[test]
    fn test_parse_container_lines() {
        let sample = "c1|nginx_prod|nginx:alpine|running|Up 2 hours|0.0.0.0:80->80/tcp\n";
        let containers = parse_container_lines(sample);
        assert_eq!(containers.len(), 1);
        assert_eq!(containers[0].id, "c1");
        assert_eq!(containers[0].name, "nginx_prod");
        assert_eq!(containers[0].image, "nginx:alpine");
        assert_eq!(containers[0].state, "running");
        assert_eq!(containers[0].status, "Up 2 hours");
        assert_eq!(containers[0].ports, "0.0.0.0:80->80/tcp");
    }

    #[test]
    fn test_parse_image_lines() {
        let sample = "img1|alpine|latest|5.5MB\nimg2|node|20-alpine|150MB\n";
        let images = parse_image_lines(sample);
        assert_eq!(images.len(), 2);
        assert_eq!(images[0].repository, "alpine");
        assert_eq!(images[0].tag, "latest");
        assert_eq!(images[1].repository, "node");
        assert_eq!(images[1].size, "150MB");
    }
}
