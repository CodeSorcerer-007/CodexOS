use crate::files::FileInfo;

fn validate_connection(connection: &str) -> Result<(), String> {
    let trimmed = connection.trim();
    if trimmed.starts_with('-') {
        return Err("Invalid SSH connection string: Flags are not permitted.".to_string());
    }
    if trimmed.is_empty() || trimmed.contains(|c: char| c.is_whitespace() || ";|&$`<>".contains(c)) {
        return Err("Invalid SSH connection target format.".to_string());
    }
    Ok(())
}

fn escape_shell_arg(arg: &str) -> String {
    format!("'{}'", arg.replace('\'', "'\\''"))
}

#[tauri::command]
pub fn ssh_list_dir(connection: String, path: String) -> Result<Vec<FileInfo>, String> {
    validate_connection(&connection)?;
    let safe_path = escape_shell_arg(&path);
    let remote_cmd = format!("find {} -maxdepth 1 -printf '%y|%s|%f\\n'", safe_path);

    let output = std::process::Command::new("ssh")
        .arg(&connection)
        .arg(remote_cmd)
        .output()
        .map_err(|e| format!("Failed to execute ssh: {}", e))?;

    if !output.status.success() {
        let err = String::from_utf8_lossy(&output.stderr);
        return Err(format!("SSH Error: {}", err));
    }

    let stdout = String::from_utf8_lossy(&output.stdout);
    let mut files = Vec::new();

    for line in stdout.lines() {
        if line.is_empty() { continue; }
        
        let parts: Vec<&str> = line.splitn(3, '|').collect();
        if parts.len() == 3 {
            let file_type = parts[0];
            let size_str = parts[1];
            let name = parts[2].to_string();

            if name == "." || name == ".." {
                continue;
            }

            let is_dir = file_type == "d";
            let size_bytes = size_str.parse::<u64>().unwrap_or(0);
            
            let full_path = if path.ends_with('/') {
                format!("{}{}", path, name)
            } else {
                format!("{}/{}", path, name)
            };

            files.push(FileInfo {
                name,
                path: full_path,
                is_dir,
                size_bytes,
            });
        }
    }
    
    files.sort_by(|a, b| b.is_dir.cmp(&a.is_dir).then(a.name.to_lowercase().cmp(&b.name.to_lowercase())));

    Ok(files)
}

#[tauri::command]
pub fn ssh_read_file_text(connection: String, path: String) -> Result<String, String> {
    validate_connection(&connection)?;
    let safe_path = escape_shell_arg(&path);
    let remote_cmd = format!("cat {}", safe_path);

    let output = std::process::Command::new("ssh")
        .arg(&connection)
        .arg(remote_cmd)
        .output()
        .map_err(|e| format!("Failed to execute ssh: {}", e))?;

    if !output.status.success() {
        let err = String::from_utf8_lossy(&output.stderr);
        return Err(format!("SSH Error: {}", err));
    }

    Ok(String::from_utf8_lossy(&output.stdout).to_string())
}

#[tauri::command]
pub fn ssh_write_file_text(connection: String, path: String, content: String) -> Result<(), String> {
    validate_connection(&connection)?;
    let safe_path = escape_shell_arg(&path);
    
    // We can pipe content to ssh command
    use std::io::Write;
    let mut child = std::process::Command::new("ssh")
        .arg(&connection)
        .arg(format!("cat > {}", safe_path))
        .stdin(std::process::Stdio::piped())
        .stdout(std::process::Stdio::piped())
        .stderr(std::process::Stdio::piped())
        .spawn()
        .map_err(|e| format!("Failed to execute ssh: {}", e))?;

    if let Some(mut stdin) = child.stdin.take() {
        stdin.write_all(content.as_bytes()).map_err(|e| format!("Failed to write to stdin: {}", e))?;
    }

    let output = child.wait_with_output().map_err(|e| format!("Failed to wait for ssh: {}", e))?;

    if !output.status.success() {
        let err = String::from_utf8_lossy(&output.stderr);
        return Err(format!("SSH Error: {}", err));
    }

    Ok(())
}
