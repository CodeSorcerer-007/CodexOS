use crate::error::{AppError, AppResult};
use crate::files::FileInfo;
use crate::cli_runner::{run_cli, run_cli_parse};
use std::process::{Command, Stdio};
use std::io::Write;

const MAX_SSH_READ_BYTES: usize = 10 * 1024 * 1024;

fn validate_connection(connection: &str) -> AppResult<()> {
    let trimmed = connection.trim();
    if trimmed.starts_with('-') {
        return Err(AppError::Custom("Invalid SSH connection string: Flags are not permitted.".to_string()));
    }
    if trimmed.is_empty() || trimmed.contains(|c: char| c.is_whitespace() || ";|&$`<>".contains(c))
    {
        return Err(AppError::Custom("Invalid SSH connection target format.".to_string()));
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
pub fn ssh_write_file_text(
    connection: String,
    path: String,
    content: String,
) -> AppResult<()> {
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
