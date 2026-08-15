use crate::cli_runner::{run_cli, run_cli_parse};
use crate::error::{AppError, AppResult};
use serde::{Deserialize, Serialize};
use std::path::Path;
use std::process::Command;

fn require_absolute_dir(path: &str) -> AppResult<std::path::PathBuf> {
    let p = Path::new(path);
    if !p.is_absolute() {
        return Err(AppError::Custom(format!("Path must be absolute: {}", path)));
    }
    if !p.is_dir() {
        return Err(AppError::Custom(format!("Path is not a directory: {}", path)));
    }
    Ok(p.to_path_buf())
}

#[derive(Serialize, Deserialize)]
pub struct GitCommitInfo {
    pub hash: String,
    pub message: String,
    pub date: String,
}

#[derive(Serialize, Deserialize)]
pub struct GitStatusResult {
    pub staged: Vec<String>,
    pub unstaged: Vec<String>,
    pub untracked: Vec<String>,
    pub branch: String,
}

pub fn parse_git_status_output(stdout: &str) -> GitStatusResult {
    let mut staged = Vec::new();
    let mut unstaged = Vec::new();
    let mut untracked = Vec::new();
    let mut branch = "HEAD".to_string();

    for line in stdout.lines() {
        if line.starts_with("# branch.head ") {
            branch = line["# branch.head ".len()..].trim().to_string();
        } else if line.starts_with("? ") {
            untracked.push(line[2..].trim().to_string());
        } else if line.starts_with("1 ") || line.starts_with("2 ") {
            let parts: Vec<&str> = line.split_whitespace().collect();
            if parts.len() >= 9 {
                let xy = parts[1];
                let file = parts[8..].join(" "); // handle spaces in filename if any
                
                let x = xy.chars().nth(0).unwrap_or('.');
                let y = xy.chars().nth(1).unwrap_or('.');
                
                if x != '.' && x != '?' {
                    staged.push(file.clone());
                }
                if y != '.' && y != '?' {
                    unstaged.push(file);
                }
            }
        }
    }
    
    GitStatusResult {
        staged,
        unstaged,
        untracked,
        branch,
    }
}

/// Returns the git status of a repository using git CLI.
#[tauri::command]
pub fn get_git_status(path: String) -> AppResult<GitStatusResult> {
    let p = require_absolute_dir(&path)?;
    run_cli_parse("git", &["status", "--porcelain=v2", "--branch"], Some(&p), |stdout| {
        Ok(parse_git_status_output(stdout))
    })
}

#[derive(Serialize, Deserialize, Debug, Clone, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum GitAction {
    Add,
    Commit,
    Push,
    RestoreStaged,
    Init,
}

#[tauri::command]
pub fn git_action(
    path: String,
    action: GitAction,
    file: Option<String>,
    message: Option<String>,
) -> AppResult<String> {
    let p = require_absolute_dir(&path)?;
    let file_target = file.unwrap_or_else(|| ".".to_string());
    let msg_target = message.unwrap_or_else(|| "Update".to_string());

    match action {
        GitAction::Add => {
            let res = run_cli("git", &["add", &file_target], Some(&p))?;
            if res.exit_code == 0 { Ok(res.stdout) } else { Err(AppError::Git(res.stderr)) }
        }
        GitAction::Commit => {
            let res = run_cli("git", &["commit", "-m", &msg_target], Some(&p))?;
            if res.exit_code == 0 { Ok(res.stdout) } else { Err(AppError::Git(res.stderr)) }
        }
        GitAction::Push => {
            let res = run_cli("git", &["push"], Some(&p))?;
            if res.exit_code == 0 { Ok(res.stdout) } else { Err(AppError::Git(res.stderr)) }
        }
        GitAction::RestoreStaged => {
            let res = run_cli("git", &["restore", "--staged", &file_target], Some(&p))?;
            if res.exit_code == 0 { Ok(res.stdout) } else { Err(AppError::Git(res.stderr)) }
        }
        GitAction::Init => {
            let res = run_cli("git", &["init"], Some(&p))?;
            if res.exit_code == 0 { Ok(res.stdout) } else { Err(AppError::Git(res.stderr)) }
        }
    }
}

#[tauri::command]
pub fn git_history(path: String, file: String) -> AppResult<Vec<GitCommitInfo>> {
    let p = require_absolute_dir(&path)?;
    run_cli_parse("git", &["log", "--pretty=format:%H|%s|%cd", "--date=short", "--", &file], Some(&p), |stdout| {
        let mut history = Vec::new();
        for line in stdout.lines() {
            let parts: Vec<&str> = line.splitn(3, '|').collect();
            if parts.len() == 3 {
                history.push(GitCommitInfo {
                    hash: parts[0].to_string(),
                    message: parts[1].to_string(),
                    date: parts[2].to_string(),
                });
            }
        }
        Ok(history)
    })
}

#[tauri::command]
pub fn git_show(path: String, hash: String, file: String) -> AppResult<String> {
    let p = require_absolute_dir(&path)?;
    let spec = format!("{}:{}", hash, file);
    let res = run_cli("git", &["show", &spec], Some(&p))?;
    if res.exit_code == 0 { Ok(res.stdout) } else { Err(AppError::Git(res.stderr)) }
}

#[tauri::command]
pub fn search_contents(
    path: String,
    query: String,
) -> AppResult<Vec<crate::files::SearchResult>> {
    if query.trim().is_empty() {
        return Err(AppError::Custom("Search query cannot be empty".into()));
    }
    if query.len() > 100 {
        return Err(AppError::Custom("Search query is too long (max 100 chars)".into()));
    }
    let p = require_absolute_dir(&path)?;
    
    // Allow ripgrep failure (exit code 1) meaning no matches, but exit code >1 is error
    let res = run_cli("rg", &["--no-heading", "-n", &query], Some(&p))?;
    if res.exit_code > 1 {
        return Err(AppError::Command(format!("Ripgrep failed: {}", res.stderr)));
    }
    
    let mut results = Vec::new();
    for line in res.stdout.lines() {
        let parts: Vec<&str> = line.splitn(3, ':').collect();
        if parts.len() == 3 {
            if let Ok(line_num) = parts[1].parse::<u32>() {
                results.push(crate::files::SearchResult {
                    file: parts[0].replace("\\", "/"),
                    line: line_num,
                    content: parts[2].trim().to_string(),
                });
            }
        }
    }
    Ok(results)
}

#[derive(Serialize, Deserialize)]
pub struct BranchInfo {
    pub name: String,
    pub hash: String,
    pub is_current: bool,
    pub is_remote: bool,
}

#[tauri::command]
pub fn get_branches(path: String) -> AppResult<Vec<BranchInfo>> {
    let p = require_absolute_dir(&path)?;
    run_cli_parse("git", &["branch", "-a", "--format=%(refname:short)|%(objectname:short)|%(HEAD)"], Some(&p), |stdout| {
        let mut branches = Vec::new();
        for line in stdout.lines() {
            let parts: Vec<&str> = line.splitn(3, '|').collect();
            if parts.len() == 3 {
                branches.push(BranchInfo {
                    name: parts[0].trim().to_string(),
                    hash: parts[1].to_string(),
                    is_current: parts[2] == "*",
                    is_remote: parts[0].contains("remotes/"),
                });
            }
        }
        Ok(branches)
    })
}

#[tauri::command]
pub fn git_checkout(path: String, branch: String) -> AppResult<String> {
    let p = require_absolute_dir(&path)?;
    let res = run_cli("git", &["checkout", &branch], Some(&p))?;
    if res.exit_code == 0 { Ok(res.stdout) } else { Err(AppError::Git(res.stderr)) }
}

#[tauri::command]
pub fn git_create_branch(path: String, branch: String) -> AppResult<String> {
    let p = require_absolute_dir(&path)?;
    let res = run_cli("git", &["checkout", "-b", &branch], Some(&p))?;
    if res.exit_code == 0 { Ok(res.stdout) } else { Err(AppError::Git(res.stderr)) }
}

#[tauri::command]
pub fn git_pull(path: String) -> AppResult<String> {
    let p = require_absolute_dir(&path)?;
    let res = run_cli("git", &["pull"], Some(&p))?;
    if res.exit_code == 0 { Ok(res.stdout) } else { Err(AppError::Git(res.stderr)) }
}

#[tauri::command]
pub fn git_fetch(path: String) -> AppResult<String> {
    let p = require_absolute_dir(&path)?;
    let res = run_cli("git", &["fetch", "--all"], Some(&p))?;
    if res.exit_code == 0 { Ok(res.stdout) } else { Err(AppError::Git(res.stderr)) }
}

pub fn get_recent_commit_diff_internal(path: &str) -> AppResult<String> {
    let p = require_absolute_dir(path)?;
    let res = run_cli("git", &["diff", "HEAD~1", "HEAD"], Some(&p))?;
    
    // git diff exits with 0 even if there are changes. But if HEAD~1 doesn't exist (initial commit), it will fail.
    if res.exit_code != 0 {
        // Try getting just HEAD diff (meaning we are on initial commit)
        let res2 = run_cli("git", &["show", "HEAD"], Some(&p))?;
        if res2.exit_code == 0 {
            return Ok(res2.stdout);
        }
        return Err(AppError::Git(res.stderr));
    }
    
    if res.stdout.trim().is_empty() {
        Ok("(no file changes)".to_string())
    } else {
        Ok(res.stdout)
    }
}

#[tauri::command]
pub fn get_recent_commit_diff(path: String) -> AppResult<String> {
    get_recent_commit_diff_internal(&path)
}

#[tauri::command]
pub fn get_file_diff(path: String, file: String) -> AppResult<String> {
    let p = require_absolute_dir(&path)?;
    let res = run_cli("git", &["diff", "--", &file], Some(&p))?;
    if res.exit_code == 0 { Ok(res.stdout) } else { Err(AppError::Git(res.stderr)) }
}

#[tauri::command]
pub fn get_staged_diff(path: String, file: String) -> AppResult<String> {
    let p = require_absolute_dir(&path)?;
    let res = run_cli("git", &["diff", "--cached", "--", &file], Some(&p))?;
    if res.exit_code == 0 { Ok(res.stdout) } else { Err(AppError::Git(res.stderr)) }
}

#[tauri::command]
pub fn git_clone(
    url: String,
    destination: String,
    app_handle: tauri::AppHandle,
) -> AppResult<()> {
    use tauri::Emitter;
    std::thread::spawn(move || {
        use std::io::{BufRead, BufReader};
        let app_handle_clone = app_handle.clone();
        let child_res = Command::new("git")
            .args(["clone", "--progress", &url, &destination])
            .stderr(std::process::Stdio::piped())
            .spawn();

        let mut child = match child_res {
            Ok(child) => child,
            Err(e) => {
                let _ = app_handle.emit(
                    "git-progress",
                    format!("Error: Failed to execute git: {}", e),
                );
                return;
            }
        };

        if let Some(stderr) = child.stderr.take() {
            let reader = BufReader::new(stderr);
            for line in reader.lines().map_while(Result::ok) {
                let _ = app_handle.emit("git-progress", line);
            }
        }
        match child.wait() {
            Ok(status) => {
                let code = status.code().unwrap_or(-1);
                let msg = if code == 0 { "Clone complete".to_string() } else { format!("Clone exited with code {}", code) };
                let _ = app_handle_clone.emit("git-progress", msg);
            }
            Err(e) => {
                let _ = app_handle_clone.emit("git-progress", format!("Error: {}", e));
            }
        }
    });
    Ok(())
}

#[tauri::command]
pub fn git_stash(path: String) -> AppResult<String> {
    let p = require_absolute_dir(&path)?;
    let res = run_cli("git", &["stash"], Some(&p))?;
    if res.exit_code == 0 { Ok(res.stdout) } else { Err(AppError::Git(res.stderr)) }
}

#[tauri::command]
pub fn git_stash_pop(path: String) -> AppResult<String> {
    let p = require_absolute_dir(&path)?;
    let res = run_cli("git", &["stash", "pop"], Some(&p))?;
    if res.exit_code == 0 { Ok(res.stdout) } else { Err(AppError::Git(res.stderr)) }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn git_action_serde_roundtrip() {
        let action_add: GitAction = serde_json::from_str("\"add\"").unwrap();
        assert_eq!(action_add, GitAction::Add);

        let action_commit: GitAction = serde_json::from_str("\"commit\"").unwrap();
        assert_eq!(action_commit, GitAction::Commit);

        let action_push: GitAction = serde_json::from_str("\"push\"").unwrap();
        assert_eq!(action_push, GitAction::Push);

        let action_restore: GitAction = serde_json::from_str("\"restore_staged\"").unwrap();
        assert_eq!(action_restore, GitAction::RestoreStaged);

        let action_init: GitAction = serde_json::from_str("\"init\"").unwrap();
        assert_eq!(action_init, GitAction::Init);

        let serialized = serde_json::to_string(&GitAction::Commit).unwrap();
        assert_eq!(serialized, "\"commit\"");
    }

    #[test]
    fn get_git_status_non_existent_path_errors() {
        let res = get_git_status("/non/existent/path/99999".to_string());
        assert!(res.is_err());
    }

    #[test]
    fn test_parse_git_status_output() {
        let sample = "# branch.oid 1234567\n# branch.head main\n1 M. N... 100644 100644 100644 12345 12345 src/main.rs\n1 .M N... 100644 100644 100644 12345 12345 Cargo.toml\n? untracked_file.txt\n";
        let parsed = parse_git_status_output(sample);

        assert_eq!(parsed.branch, "main");
        assert_eq!(parsed.staged, vec!["src/main.rs"]);
        assert_eq!(parsed.unstaged, vec!["Cargo.toml"]);
        assert_eq!(parsed.untracked, vec!["untracked_file.txt"]);
    }
}
