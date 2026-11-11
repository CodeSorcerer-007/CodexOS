use crate::cli_runner::{run_cli, run_cli_parse};
use crate::error::{AppError, AppResult};
use crate::files::FileInfo;
use std::io::Write;
use std::process::{Command, Stdio};

const MAX_SSH_READ_BYTES: usize = 10 * 1024 * 1024;

fn validate_connection(connection: &str) -> AppResult<()> {
    let trimmed = connection.trim();
    if trimmed.starts_with('-') {
        return Err(AppError::Custom(
            "Invalid SSH connection string: Flags are not permitted.".to_string(),
        ));
    }
    if trimmed.is_empty() || trimmed.contains(|c: char| c.is_whitespace() || ";|&$`<>".contains(c))
    {
        return Err(AppError::Custom(
            "Invalid SSH connection target format.".to_string(),
        ));
    }
    Ok(())
}

fn escape_shell_arg(arg: &str) -> String {
    format!("'{}'", arg.replace('\'', "'\\''"))
}

pub fn parse_find_lines(stdout: &str, base_path: &str) -> Vec<FileInfo> {
    let mut files = Vec::new();

    for line in stdout.lines() {
        if line.is_empty() {
            continue;
        }

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

            let full_path = if base_path.ends_with('/') {
                format!("{}{}", base_path, name)
            } else {
                format!("{}/{}", base_path, name)
            };

            files.push(FileInfo {
                name,
                path: full_path,
                is_dir,
                size_bytes,
            });
        }
    }

    files.sort_by(|a, b| {
        b.is_dir
            .cmp(&a.is_dir)
            .then(a.name.to_lowercase().cmp(&b.name.to_lowercase()))
    });

    files
}

/// Lists files in a remote directory via SSH.
#[tauri::command]
pub fn ssh_list_dir(connection: String, path: String) -> AppResult<Vec<FileInfo>> {
    validate_connection(&connection)?;
    let safe_path = escape_shell_arg(&path);
    let remote_cmd = format!("find {} -maxdepth 1 -printf '%y|%s|%f\\n'", safe_path);

    run_cli_parse(
        "ssh",
        &[
            "-o",
            "BatchMode=yes",
            "-o",
            "StrictHostKeyChecking=accept-new",
            "-o",
            "ConnectTimeout=10",
            &connection,
            &remote_cmd,
        ],
        None,
        |stdout| Ok(parse_find_lines(stdout, &path)),
    )
}

/// Reads remote text file via SSH in non-interactive batch mode.
#[tauri::command]
pub fn ssh_read_file_text(connection: String, path: String) -> AppResult<String> {
    validate_connection(&connection)?;
    let safe_path = escape_shell_arg(&path);
    let remote_cmd = format!("cat {}", safe_path);

    let res = run_cli(
        "ssh",
        &[
            "-o",
            "BatchMode=yes",
            "-o",
            "StrictHostKeyChecking=accept-new",
            "-o",
            "ConnectTimeout=10",
            &connection,
            &remote_cmd,
        ],
        None,
    )?;
    if res.exit_code == 0 {
        if res.stdout.len() > MAX_SSH_READ_BYTES {
            Ok(format!(
                "{}\n... [truncated at 10MB]",
                &res.stdout[..MAX_SSH_READ_BYTES]
            ))
        } else {
            Ok(res.stdout)
        }
    } else {
        Err(AppError::Command(format!("SSH Error: {}", res.stderr)))
    }
}

/// Writes text content to a remote file via SSH.
#[tauri::command]
pub fn ssh_write_file_text(connection: String, path: String, content: String) -> AppResult<()> {
    validate_connection(&connection)?;
    let safe_path = escape_shell_arg(&path);

    let mut child = Command::new("ssh")
        .arg("-o")
        .arg("BatchMode=yes")
        .arg("-o")
        .arg("StrictHostKeyChecking=accept-new")
        .arg("-o")
        .arg("ConnectTimeout=10")
        .arg(&connection)
        .arg(format!("cat > {}", safe_path))
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn()
        .map_err(|e| AppError::Command(format!("Failed to execute ssh: {}", e)))?;

    if let Some(mut stdin) = child.stdin.take() {
        stdin
            .write_all(content.as_bytes())
            .map_err(|e| AppError::Command(format!("Failed to write to stdin: {}", e)))?;
    }

    let output = child
        .wait_with_output()
        .map_err(|e| AppError::Command(format!("Failed to wait for ssh: {}", e)))?;

    if !output.status.success() {
        let err = String::from_utf8_lossy(&output.stderr);
        return Err(AppError::Command(format!("SSH Error: {}", err)));
    }

    Ok(())
}

#[derive(serde::Serialize, serde::Deserialize, Clone, Debug)]
pub struct SshKeypairInfo {
    pub key_id: String,
    pub key_type: String,
    pub public_key: String,
    pub public_key_path: String,
    pub private_key_path: String,
    pub comment: String,
    pub created_at: String,
}

#[derive(serde::Serialize, serde::Deserialize, Clone, Debug)]
pub struct SshKeySummary {
    pub key_id: String,
    pub key_type: String,
    pub public_key: String,
    pub public_key_path: String,
    pub private_key_path: String,
    pub comment: String,
}

pub fn get_ssh_dir() -> std::path::PathBuf {
    let home = std::env::var("USERPROFILE")
        .or_else(|_| std::env::var("HOME"))
        .unwrap_or_else(|_| ".".to_string());
    std::path::PathBuf::from(home).join(".ssh")
}

/// Generates a new SSH keypair using standard ssh-keygen.
#[tauri::command]
pub fn generate_ssh_keypair(
    key_type: Option<String>,
    bits: Option<u32>,
    comment: Option<String>,
) -> AppResult<SshKeypairInfo> {
    let k_type = key_type
        .unwrap_or_else(|| "ed25519".to_string())
        .to_lowercase();
    if k_type != "ed25519" && k_type != "rsa" && k_type != "ecdsa" {
        return Err(AppError::Custom(
            "Unsupported key type. Allowed: ed25519, rsa, ecdsa".to_string(),
        ));
    }

    let comment_str = comment.unwrap_or_else(|| "codexos".to_string());
    if comment_str.contains(|c: char| c.is_control() || ";|&$`<>\"'".contains(c)) {
        return Err(AppError::Custom(
            "Invalid characters in SSH key comment".to_string(),
        ));
    }

    let ssh_dir = get_ssh_dir();
    if !ssh_dir.exists() {
        let _ = std::fs::create_dir_all(&ssh_dir);
    }

    let timestamp = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_secs())
        .unwrap_or(0);
    let key_id = format!("id_{}_codexos_{}", k_type, timestamp);
    let private_path = ssh_dir.join(&key_id);
    let public_path = ssh_dir.join(format!("{}.pub", key_id));

    let mut cmd = Command::new("ssh-keygen");
    cmd.arg("-t").arg(&k_type);
    if k_type == "rsa" {
        let b = bits.unwrap_or(4096).clamp(2048, 8192);
        cmd.arg("-b").arg(b.to_string());
    }
    cmd.arg("-C").arg(&comment_str);
    cmd.arg("-f").arg(&private_path);
    cmd.arg("-N").arg(""); // Empty passphrase for default developer key

    let output = cmd.output().map_err(|e| {
        AppError::Custom(format!(
            "Failed to execute ssh-keygen: {}. Ensure OpenSSH is installed.",
            e
        ))
    })?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        return Err(AppError::Custom(format!("ssh-keygen failed: {}", stderr)));
    }

    let public_key = std::fs::read_to_string(&public_path)
        .unwrap_or_default()
        .trim()
        .to_string();

    Ok(SshKeypairInfo {
        key_id,
        key_type: k_type,
        public_key,
        public_key_path: public_path.to_string_lossy().to_string(),
        private_key_path: private_path.to_string_lossy().to_string(),
        comment: comment_str,
        created_at: timestamp.to_string(),
    })
}

/// Lists all available public SSH keys in ~/.ssh
#[tauri::command]
pub fn list_ssh_keys() -> AppResult<Vec<SshKeySummary>> {
    let ssh_dir = get_ssh_dir();
    let mut keys = Vec::new();

    if !ssh_dir.exists() {
        return Ok(keys);
    }

    if let Ok(entries) = std::fs::read_dir(&ssh_dir) {
        for entry in entries.flatten() {
            let path = entry.path();
            if path.extension().and_then(|e| e.to_str()) == Some("pub") {
                if let Ok(content) = std::fs::read_to_string(&path) {
                    let trimmed = content.trim();
                    let parts: Vec<&str> = trimmed.split_whitespace().collect();
                    let key_type = parts.first().copied().unwrap_or("unknown").to_string();
                    let comment = parts.get(2).copied().unwrap_or("").to_string();
                    let key_id = path
                        .file_stem()
                        .and_then(|s| s.to_str())
                        .unwrap_or("unknown")
                        .to_string();
                    let private_path = ssh_dir.join(&key_id);

                    keys.push(SshKeySummary {
                        key_id,
                        key_type,
                        public_key: trimmed.to_string(),
                        public_key_path: path.to_string_lossy().to_string(),
                        private_key_path: private_path.to_string_lossy().to_string(),
                        comment,
                    });
                }
            }
        }
    }

    keys.sort_by(|a, b| a.key_id.cmp(&b.key_id));
    Ok(keys)
}

/// Deletes an SSH key pair by key_id
#[tauri::command]
pub fn delete_ssh_key(key_id: String) -> AppResult<()> {
    if key_id.is_empty() || key_id.contains(|c: char| !c.is_alphanumeric() && c != '_' && c != '-')
    {
        return Err(AppError::Custom("Invalid key ID format".to_string()));
    }

    let ssh_dir = get_ssh_dir();
    let private_path = ssh_dir.join(&key_id);
    let public_path = ssh_dir.join(format!("{}.pub", key_id));

    if private_path.exists() {
        let _ = std::fs::remove_file(private_path);
    }
    if public_path.exists() {
        let _ = std::fs::remove_file(public_path);
    }

    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_validate_connection_valid() {
        assert!(validate_connection("user@example.com").is_ok());
        assert!(validate_connection("example.com").is_ok());
    }

    #[test]
    fn test_validate_connection_invalid_flags() {
        assert!(validate_connection("-o ProxyCommand=...").is_err());
        assert!(validate_connection("--help").is_err());
    }

    #[test]
    fn test_validate_connection_invalid_chars() {
        assert!(validate_connection("user@example.com; rm -rf /").is_err());
        assert!(validate_connection("user@example.com | bash").is_err());
        assert!(validate_connection("user@example.com & echo 1").is_err());
    }

    #[test]
    fn test_escape_shell_arg() {
        assert_eq!(escape_shell_arg("normal"), "'normal'");
        assert_eq!(escape_shell_arg("path/to/file"), "'path/to/file'");
        assert_eq!(escape_shell_arg("it's a trap"), "'it'\\''s a trap'");
    }

    #[test]
    fn test_parse_find_lines() {
        let sample = "d|4096|src\nf|1024|main.rs\nd|4096|.\nd|4096|..\n";
        let files = parse_find_lines(sample, "/home/user/project");
        assert_eq!(files.len(), 2);
        assert_eq!(files[0].name, "src");
        assert!(files[0].is_dir);
        assert_eq!(files[0].path, "/home/user/project/src");
        assert_eq!(files[1].name, "main.rs");
        assert!(!files[1].is_dir);
        assert_eq!(files[1].size_bytes, 1024);
    }
}
