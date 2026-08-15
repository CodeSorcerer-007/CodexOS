use crate::error::{AppError, AppResult};
use std::path::Path;
use std::process::Command;

pub struct CliResult {
    pub stdout: String,
    pub stderr: String,
    pub exit_code: i32,
}

pub fn run_cli(cmd: &str, args: &[&str], cwd: Option<&Path>) -> AppResult<CliResult> {
    let mut command = Command::new(cmd);
    command.args(args);
    command.env("LC_ALL", "C");
    command.env("LANG", "C");
    command.env("GIT_TERMINAL_PROMPT", "0");
    if let Some(dir) = cwd {
        command.current_dir(dir);
    }

    let output = command
        .output()
        .map_err(|e| AppError::Command(format!("Failed to execute '{}': {}", cmd, e)))?;

    Ok(CliResult {
        stdout: String::from_utf8_lossy(&output.stdout).to_string(),
        stderr: String::from_utf8_lossy(&output.stderr).to_string(),
        exit_code: output.status.code().unwrap_or(-1),
    })
}

pub fn run_cli_parse<T, F>(cmd: &str, args: &[&str], cwd: Option<&Path>, parser: F) -> AppResult<T>
where
    F: FnOnce(&str) -> AppResult<T>,
{
    let result = run_cli(cmd, args, cwd)?;
    if result.exit_code != 0 {
        return Err(AppError::Command(format!(
            "Command '{}' failed with exit code {}: {}",
            cmd, result.exit_code, result.stderr
        )));
    }
    parser(&result.stdout)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_run_cli_success() {
        let (cmd, args) = if cfg!(windows) { ("cmd", vec!["/C", "echo", "hello"]) } else { ("echo", vec!["hello"]) };
        let res = run_cli(cmd, &args, None).unwrap();
        assert_eq!(res.exit_code, 0);
        assert!(res.stdout.contains("hello"));
    }

    #[test]
    fn test_run_cli_not_found() {
        let res = run_cli("non_existent_command_12345", &[], None);
        assert!(res.is_err());
    }

    #[test]
    fn test_run_cli_parse_success() {
        let (cmd, args) = if cfg!(windows) { ("cmd", vec!["/C", "echo", "42"]) } else { ("echo", vec!["42"]) };
        let parsed = run_cli_parse(cmd, &args, None, |out| {
            let num: i32 = out.trim().parse().unwrap_or(0);
            Ok(num)
        }).unwrap();
        assert_eq!(parsed, 42);
    }

    #[test]
    fn test_run_cli_parse_error() {
        // Run a command that fails, expect Err
        let cmd = if cfg!(windows) { "cmd" } else { "false" };
        let args = if cfg!(windows) { vec!["/c", "exit 1"] } else { vec![] };
        
        let res = run_cli_parse(cmd, &args, None, |out| {
            Ok(out.to_string())
        });
        
        assert!(res.is_err());
    }
}
