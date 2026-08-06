use serde::{Deserialize, Serialize};

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

#[tauri::command]
pub fn get_git_status(path: String) -> Result<GitStatusResult, String> {
    use std::process::Command;
    
    let mut staged = Vec::new();
    let mut unstaged = Vec::new();
    let mut untracked = Vec::new();
    
    let output = Command::new("git")
        .current_dir(&path)
        .args(["status", "--porcelain"])
        .output()
        .map_err(|e| e.to_string())?;
        
    if output.status.success() {
        let stdout = String::from_utf8_lossy(&output.stdout);
        for line in stdout.lines() {
            if line.len() > 3 {
                let status = &line[0..2];
                let file = line[3..].to_string();
                if status.starts_with('?') {
                    untracked.push(file);
                } else {
                    let chars: Vec<char> = status.chars().collect();
                    if chars[0] != ' ' && chars[0] != '?' {
                        staged.push(file.clone());
                    }
                    if chars[1] != ' ' && chars[1] != '?' {
                        unstaged.push(file);
                    }
                }
            }
        }
    }

    let branch_output = Command::new("git")
        .current_dir(&path)
        .args(["branch", "--show-current"])
        .output();
        
    let branch = if let Ok(out) = branch_output {
        String::from_utf8_lossy(&out.stdout).trim().to_string()
    } else {
        "unknown".to_string()
    };
    
    Ok(GitStatusResult { staged, unstaged, untracked, branch })
}

#[tauri::command]
pub fn git_action(path: String, action: String, file: String, message: String) -> Result<String, String> {
    use std::process::Command;
    
    let mut cmd = Command::new("git");
    cmd.current_dir(&path);
    
    match action.as_str() {
        "add" => { cmd.args(["add", &file]); },
        "commit" => { cmd.args(["commit", "-m", &message]); },
        "push" => { cmd.args(["push"]); },
        _ => return Err("Invalid git action".to_string()),
    }
    
    let output = cmd.output().map_err(|e| e.to_string())?;
    
    if output.status.success() {
        Ok(String::from_utf8_lossy(&output.stdout).into_owned())
    } else {
        Err(String::from_utf8_lossy(&output.stderr).into_owned())
    }
}

#[tauri::command]
pub fn git_history(path: String, file: String) -> Result<Vec<GitCommitInfo>, String> {
    use std::process::Command;
    
    let output = Command::new("git")
        .current_dir(path)
        .args(["log", "--pretty=format:%H|%s|%cd", "--date=short", "--", &file])
        .output()
        .map_err(|e| e.to_string())?;
        
    let mut history = Vec::new();
    if output.status.success() {
        let stdout = String::from_utf8_lossy(&output.stdout);
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
    }
    Ok(history)
}

#[tauri::command]
pub fn git_show(path: String, hash: String, file: String) -> Result<String, String> {
    use std::process::Command;
    
    let output = Command::new("git")
        .current_dir(path)
        .args(["show", &format!("{}:{}", hash, file)])
        .output()
        .map_err(|e| e.to_string())?;
        
    if output.status.success() {
        Ok(String::from_utf8_lossy(&output.stdout).into_owned())
    } else {
        Err(String::from_utf8_lossy(&output.stderr).into_owned())
    }
}

#[tauri::command]
pub fn search_contents(path: String, query: String) -> Result<Vec<crate::files::SearchResult>, String> {
    use std::process::Command;
    let mut results = Vec::new();
    
    let output = Command::new("rg")
        .current_dir(path)
        .args(["--no-heading", "-n", &query])
        .output()
        .map_err(|e| format!("Ripgrep failed to execute (is it installed?): {}", e))?;
        
    if output.status.success() {
        let stdout = String::from_utf8_lossy(&output.stdout);
        for line in stdout.lines() {
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
pub fn get_branches(path: String) -> Result<Vec<BranchInfo>, String> {
    use std::process::Command;
    let output = Command::new("git")
        .current_dir(&path)
        .args(["branch", "-a", "--format=%(refname:short)|%(objectname:short)|%(HEAD)"])
        .output()
        .map_err(|e| e.to_string())?;
    
    let mut branches = Vec::new();
    let stdout = String::from_utf8_lossy(&output.stdout);
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
}

#[tauri::command]
pub fn git_checkout(path: String, branch: String) -> Result<String, String> {
    use std::process::Command;
    let output = Command::new("git")
        .current_dir(&path)
        .args(["checkout", &branch])
        .output()
        .map_err(|e| e.to_string())?;
    if output.status.success() {
        Ok(String::from_utf8_lossy(&output.stdout).to_string())
    } else {
        Err(String::from_utf8_lossy(&output.stderr).to_string())
    }
}

#[tauri::command]
pub fn git_create_branch(path: String, branch: String) -> Result<String, String> {
    use std::process::Command;
    let output = Command::new("git")
        .current_dir(&path)
        .args(["checkout", "-b", &branch])
        .output()
        .map_err(|e| e.to_string())?;
    if output.status.success() {
        Ok(String::from_utf8_lossy(&output.stdout).to_string())
    } else {
        Err(String::from_utf8_lossy(&output.stderr).to_string())
    }
}

#[tauri::command]
pub fn git_pull(path: String) -> Result<String, String> {
    use std::process::Command;
    let output = Command::new("git")
        .current_dir(&path)
        .args(["pull"])
        .output()
        .map_err(|e| e.to_string())?;
    if output.status.success() {
        Ok(String::from_utf8_lossy(&output.stdout).to_string())
    } else {
        Err(String::from_utf8_lossy(&output.stderr).to_string())
    }
}

#[tauri::command]
pub fn git_fetch(path: String) -> Result<String, String> {
    use std::process::Command;
    let output = Command::new("git")
        .current_dir(&path)
        .args(["fetch", "--all"])
        .output()
        .map_err(|e| e.to_string())?;
    if output.status.success() {
        Ok(String::from_utf8_lossy(&output.stdout).to_string())
    } else {
        Err(String::from_utf8_lossy(&output.stderr).to_string())
    }
}

#[tauri::command]
pub fn get_file_diff(path: String, file: String) -> Result<String, String> {
    use std::process::Command;
    let output = Command::new("git")
        .current_dir(&path)
        .args(["diff", "--", &file])
        .output()
        .map_err(|e| e.to_string())?;
    if output.status.success() {
        Ok(String::from_utf8_lossy(&output.stdout).to_string())
    } else {
        Err(String::from_utf8_lossy(&output.stderr).to_string())
    }
}

#[tauri::command]
pub fn get_staged_diff(path: String, file: String) -> Result<String, String> {
    use std::process::Command;
    let output = Command::new("git")
        .current_dir(&path)
        .args(["diff", "--cached", "--", &file])
        .output()
        .map_err(|e| e.to_string())?;
    if output.status.success() {
        Ok(String::from_utf8_lossy(&output.stdout).to_string())
    } else {
        Err(String::from_utf8_lossy(&output.stderr).to_string())
    }
}

#[tauri::command]
pub fn git_clone(url: String, destination: String, app_handle: tauri::AppHandle) -> Result<(), String> {
    use std::process::Command;
    use tauri::Emitter;
    std::thread::spawn(move || {
        use std::io::{BufRead, BufReader};
        let child_res = Command::new("git")
            .args(["clone", "--progress", &url, &destination])
            .stderr(std::process::Stdio::piped())
            .spawn();
            
        let mut child = match child_res {
            Ok(child) => child,
            Err(e) => {
                let _ = app_handle.emit("git-progress", format!("Error: Failed to execute git: {}", e));
                return;
            }
        };
        
        if let Some(stderr) = child.stderr.take() {
            let reader = BufReader::new(stderr);
            for line in reader.lines() {
                if let Ok(line) = line {
                    let _ = app_handle.emit("git-progress", line);
                }
            }
        }
        let _ = child.wait();
    });
    Ok(())
}

#[tauri::command]
pub fn git_stash(path: String) -> Result<String, String> {
    use std::process::Command;
    let output = Command::new("git")
        .current_dir(&path)
        .args(["stash"])
        .output()
        .map_err(|e| e.to_string())?;
    if output.status.success() {
        Ok(String::from_utf8_lossy(&output.stdout).to_string())
    } else {
        Err(String::from_utf8_lossy(&output.stderr).to_string())
    }
}

#[tauri::command]
pub fn git_stash_pop(path: String) -> Result<String, String> {
    use std::process::Command;
    let output = Command::new("git")
        .current_dir(&path)
        .args(["stash", "pop"])
        .output()
        .map_err(|e| e.to_string())?;
    if output.status.success() {
        Ok(String::from_utf8_lossy(&output.stdout).to_string())
    } else {
        Err(String::from_utf8_lossy(&output.stderr).to_string())
    }
}
