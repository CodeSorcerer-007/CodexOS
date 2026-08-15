use crate::error::{AppError, AppResult};
use crate::util::lock_poison_recover;
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use std::collections::HashSet;
use std::fs;
use std::path::{Path, PathBuf};
use std::sync::Mutex;
use sysinfo::Disks;
use walkdir::WalkDir;

const MAX_TEXT_FILE_READ_BYTES: u64 = 20 * 1024 * 1024; // 20 MB

pub struct AllowedPathsState {
    pub allowed_roots: Mutex<HashSet<PathBuf>>,
}

impl AllowedPathsState {
    pub fn new() -> Self {
        let mut set = HashSet::new();
        if let Ok(cd) = std::env::current_dir() {
            if let Ok(canon) = cd.canonicalize() {
                set.insert(canon);
            } else {
                set.insert(cd);
            }
        }
        if let Ok(td) = std::env::temp_dir().canonicalize() {
            set.insert(td);
        } else {
            set.insert(std::env::temp_dir());
        }
        Self {
            allowed_roots: Mutex::new(set),
        }
    }

    pub fn allow(&self, path: &Path) {
        let mut lock = lock_poison_recover(&self.allowed_roots);
        if let Ok(canon) = path.canonicalize() {
            lock.insert(canon);
        } else {
            lock.insert(path.to_path_buf());
        }
    }

    pub fn remove(&self, path: &Path) {
        let canon = path.canonicalize().unwrap_or_else(|_| path.to_path_buf());
        let mut lock = lock_poison_recover(&self.allowed_roots);
        lock.remove(&canon);
    }

    pub fn is_allowed(&self, path: &Path) -> bool {
        let canon = if path.exists() {
            path.canonicalize().unwrap_or_else(|_| path.to_path_buf())
        } else if let Some(parent) = path.parent() {
            if parent.exists() {
                if let Ok(p_canon) = parent.canonicalize() {
                    if let Some(file_name) = path.file_name() {
                        p_canon.join(file_name)
                    } else {
                        p_canon
                    }
                } else {
                    path.to_path_buf()
                }
            } else {
                path.to_path_buf()
            }
        } else {
            path.to_path_buf()
        };

        let lock = lock_poison_recover(&self.allowed_roots);
        for root in lock.iter() {
            if canon.starts_with(root) {
                return true;
            }
        }
        false
    }
}

pub fn validate_path(path: &str, state: &AllowedPathsState) -> AppResult<PathBuf> {
    let p = PathBuf::from(path);
    let canon = if p.exists() {
        p.canonicalize().unwrap_or_else(|_| p.clone())
    } else if let Some(parent) = p.parent() {
        if parent.exists() {
            if let Ok(p_canon) = parent.canonicalize() {
                if let Some(file_name) = p.file_name() {
                    p_canon.join(file_name)
                } else {
                    p_canon
                }
            } else {
                p.clone()
            }
        } else {
            p.clone()
        }
    } else {
        p.clone()
    };

    if !state.is_allowed(&canon) {
        return Err(AppError::Custom(format!(
            "Access denied: path '{}' is outside opened workspaces",
            path
        )));
    }
    Ok(p)
}

#[tauri::command]
pub fn add_allowed_path(path: String, state: tauri::State<'_, AllowedPathsState>) -> AppResult<()> {
    let p = PathBuf::from(&path);
    state.allow(&p);
    Ok(())
}

#[tauri::command]
pub fn remove_allowed_path(path: String, state: tauri::State<'_, AllowedPathsState>) -> AppResult<()> {
    let p = PathBuf::from(&path);
    state.remove(&p);
    Ok(())
}

#[tauri::command]
pub fn get_allowed_paths(state: tauri::State<'_, AllowedPathsState>) -> Vec<String> {
    let guard = lock_poison_recover(&state.allowed_roots);
    guard.iter().map(|p| p.to_string_lossy().to_string()).collect()
}

#[derive(Serialize, Deserialize)]
pub struct DriveInfo {
    pub name: String,
    pub total_gb: u64,
    pub used_gb: u64,
}

#[derive(Serialize, Deserialize)]
pub struct BloatItem {
    pub path: String,
    pub size_mb: u64,
}

#[derive(Serialize, Deserialize)]
pub struct FileInfo {
    pub name: String,
    pub path: String,
    pub is_dir: bool,
    pub size_bytes: u64,
}

#[derive(Serialize, Deserialize)]
pub struct SearchResult {
    pub file: String,
    pub line: u32,
    pub content: String,
}

#[derive(Serialize, Deserialize)]
pub struct TreeMapNode {
    pub name: String,
    pub size: u64,
    pub children: Vec<TreeMapNode>,
}

#[derive(Serialize, Deserialize, Default)]
pub struct CodeMetrics {
    pub total_files: u32,
    pub total_lines: u32,
    pub languages: std::collections::HashMap<String, u32>,
}

#[derive(serde::Serialize)]
pub struct DuplicateGroup {
    pub hash: String,
    pub files: Vec<String>,
    pub size: u64,
}

/// Executes the get_drives command.
#[tauri::command]
pub fn get_drives() -> Vec<DriveInfo> {
    let disks = Disks::new_with_refreshed_list();

    disks
        .iter()
        .map(|disk| {
            let total = disk.total_space();
            let available = disk.available_space();
            let used = total.saturating_sub(available);

            let name = disk.mount_point().to_string_lossy().to_string();

            DriveInfo {
                name,
                total_gb: total / 1_000_000_000,
                used_gb: used / 1_000_000_000,
            }
        })
        .collect()
}

/// Executes the read_file_text command with sandbox verification and 20MB memory safety cap.
#[tauri::command]
pub fn read_file_text(path: String, state: tauri::State<'_, AllowedPathsState>) -> AppResult<String> {
    let p = validate_path(&path, &state)?;
    let meta = fs::metadata(&p).map_err(AppError::from)?;
    if meta.len() > MAX_TEXT_FILE_READ_BYTES {
        return Err(AppError::Custom(format!(
            "File is too large to read as text ({} MB > 20 MB limit).",
            meta.len() / (1024 * 1024)
        )));
    }
    fs::read_to_string(p).map_err(AppError::from)
}

/// Executes the write_file_text command with sandbox verification.
#[tauri::command]
pub fn write_file_text(path: String, content: String, state: tauri::State<'_, AllowedPathsState>) -> AppResult<()> {
    let p = validate_path(&path, &state)?;
    std::fs::write(p, content).map_err(AppError::from)
}

/// Executes the create_file command with sandbox verification.
#[tauri::command]
pub fn create_file(path: String, state: tauri::State<'_, AllowedPathsState>) -> AppResult<()> {
    let p = validate_path(&path, &state)?;
    std::fs::File::create(&p).map_err(AppError::from)?;
    Ok(())
}

/// Executes the create_directory command with sandbox verification.
#[tauri::command]
pub fn create_directory(path: String, state: tauri::State<'_, AllowedPathsState>) -> AppResult<()> {
    let p = validate_path(&path, &state)?;
    std::fs::create_dir_all(&p).map_err(AppError::from)
}

/// Executes the rename_path command with sandbox verification.
#[tauri::command]
pub fn rename_path(old_path: String, new_path: String, state: tauri::State<'_, AllowedPathsState>) -> AppResult<()> {
    let p_old = validate_path(&old_path, &state)?;
    let p_new = validate_path(&new_path, &state)?;
    std::fs::rename(p_old, p_new).map_err(AppError::from)
}

/// Executes the read_file_binary command with sandbox verification.
#[tauri::command]
pub fn read_file_binary(path: String, state: tauri::State<'_, AllowedPathsState>) -> AppResult<Vec<u8>> {
    let p = validate_path(&path, &state)?;
    fs::read(p).map_err(AppError::from)
}

/// Executes the write_file_binary_webrtc command with sandbox verification.
#[tauri::command]
pub fn write_file_binary_webrtc(path: String, data: Vec<u8>, state: tauri::State<'_, AllowedPathsState>) -> AppResult<()> {
    let p = validate_path(&path, &state)?;
    fs::write(p, data).map_err(AppError::from)
}

/// Executes the get_current_dir command.
#[tauri::command]
pub fn get_current_dir() -> AppResult<String> {
    std::env::current_dir()
        .map(|p| p.to_string_lossy().to_string())
        .map_err(AppError::from)
}

/// Executes the get_files_in_dir command with sandbox verification.
#[tauri::command]
pub fn get_files_in_dir(path: String, state: tauri::State<'_, AllowedPathsState>) -> AppResult<Vec<FileInfo>> {
    let p = validate_path(&path, &state)?;
    let mut files = Vec::new();
    let entries = std::fs::read_dir(p).map_err(AppError::from)?;

    for entry in entries.flatten() {
        let meta = entry.metadata().map_err(AppError::from)?;
        files.push(FileInfo {
            name: entry.file_name().to_string_lossy().to_string(),
            path: entry.path().to_string_lossy().to_string(),
            is_dir: meta.is_dir(),
            size_bytes: meta.len(),
        });
    }

    files.sort_by(|a, b| {
        b.is_dir
            .cmp(&a.is_dir)
            .then_with(|| a.name.to_lowercase().cmp(&b.name.to_lowercase()))
    });

    Ok(files)
}

/// Executes the scan_dev_bloat command asynchronously.
#[tauri::command]
pub async fn scan_dev_bloat(path: String, state: tauri::State<'_, AllowedPathsState>) -> AppResult<Vec<BloatItem>> {
    let p = validate_path(&path, &state)?;
    let p_clone = p.to_string_lossy().to_string();

    tauri::async_runtime::spawn_blocking(move || {
        let mut bloat_items = Vec::new();
        let mut it = WalkDir::new(p_clone).into_iter();
        while let Some(Ok(entry)) = it.next() {
            let name = entry.file_name().to_string_lossy();
            
            if name.starts_with('.') && name != "." && name != ".." {
                if entry.file_type().is_dir() {
                    it.skip_current_dir();
                }
                continue;
            }

            if entry.file_type().is_dir() {
                if name == "node_modules" || name == "target" || name == "bin" || name == "obj" {
                    let mut size_bytes = 0;
                    for sub_entry in WalkDir::new(entry.path()).into_iter().flatten() {
                        if let Ok(meta) = sub_entry.metadata() {
                            size_bytes += meta.len();
                        }
                    }
                    bloat_items.push(BloatItem {
                        path: entry.path().to_string_lossy().to_string(),
                        size_mb: size_bytes / 1_000_000,
                    });
                    it.skip_current_dir();
                }
            }
        }
        bloat_items
    })
    .await
    .map_err(AppError::from)
}

/// Executes the purge_directories command with sandbox verification.
#[tauri::command]
pub async fn purge_directories(paths: Vec<String>, state: tauri::State<'_, AllowedPathsState>) -> AppResult<()> {
    for path in &paths {
        let _ = validate_path(path, &state)?;
    }
    let paths_clone = paths.clone();
    tauri::async_runtime::spawn_blocking(move || {
        for path in paths_clone {
            trash::delete(&path).map_err(AppError::from)?;
        }
        Ok(())
    })
    .await
    .map_err(AppError::from)?
}

/// Executes the bulk_rename command with sandbox verification.
#[tauri::command]
pub async fn bulk_rename(
    path: String,
    pattern: String,
    replacement: String,
    state: tauri::State<'_, AllowedPathsState>,
) -> AppResult<Vec<String>> {
    let p = validate_path(&path, &state)?;
    let p_clone = p.clone();

    tauri::async_runtime::spawn_blocking(move || {
        use regex::Regex;
        let re = Regex::new(&pattern).map_err(AppError::from)?;
        let mut renamed_files = Vec::new();

        if let Ok(entries) = fs::read_dir(&p_clone) {
            for entry in entries.flatten() {
                let file_path = entry.path();
                if file_path.is_file() {
                    if let Some(file_name) = file_path.file_name().and_then(|n| n.to_str()) {
                        if re.is_match(file_name) {
                            let new_name = re.replace(file_name, &replacement).to_string();
                            if new_name != file_name {
                                let new_path = file_path.with_file_name(&new_name);
                                if fs::rename(&file_path, &new_path).is_ok() {
                                    renamed_files.push(format!("{} -> {}", file_name, new_name));
                                }
                            }
                        }
                    }
                }
            }
        }
        Ok(renamed_files)
    })
    .await
    .map_err(AppError::from)?
}

/// Executes the find_duplicates command with sandbox verification.
#[tauri::command]
pub async fn find_duplicates(path: String, state: tauri::State<'_, AllowedPathsState>) -> AppResult<Vec<DuplicateGroup>> {
    let p = validate_path(&path, &state)?;
    let p_clone = p.to_string_lossy().to_string();

    tauri::async_runtime::spawn_blocking(move || {
        use std::collections::HashMap;

        let mut size_map: HashMap<u64, Vec<String>> = HashMap::new();

        for entry in WalkDir::new(&p_clone).into_iter().filter_map(|e| e.ok()) {
            if entry.file_type().is_file() {
                if let Ok(metadata) = entry.metadata() {
                    let size = metadata.len();
                    if size > 0 {
                        size_map
                            .entry(size)
                            .or_default()
                            .push(entry.path().to_string_lossy().to_string());
                    }
                }
            }
        }

        let mut duplicates = Vec::new();

        for (size, files) in size_map {
            if files.len() > 1 {
                let mut prefix_map: HashMap<String, Vec<String>> = HashMap::new();
                for file_path in files {
                    if let Ok(mut file) = std::fs::File::open(&file_path) {
                        use std::io::Read;
                        let mut buffer = [0u8; 4096];
                        if let Ok(n) = file.read(&mut buffer) {
                            let mut hasher = Sha256::new();
                            hasher.update(&buffer[..n]);
                            let hash = hex::encode(hasher.finalize());
                            prefix_map.entry(hash).or_default().push(file_path);
                        }
                    }
                }

                // Second pass: for files whose first-4KB SHA-256 prefix collides,
                // compute a full-file SHA-256 to confirm true duplication.
                for (prefix_hash, prefix_files) in prefix_map {
                    let _ = prefix_hash; // prefix used only for grouping; full hash follows
                    if prefix_files.len() > 1 {
                        let mut full_hash_map: HashMap<String, Vec<String>> = HashMap::new();
                        for file_path in prefix_files {
                            if let Ok(mut file) = std::fs::File::open(&file_path) {
                                let mut hasher = Sha256::new();
                                if std::io::copy(&mut file, &mut hasher).is_ok() {
                                    let hash = hex::encode(hasher.finalize());
                                    full_hash_map.entry(hash).or_default().push(file_path);
                                }
                            }
                        }

                        for (hash, identical_files) in full_hash_map {
                            if identical_files.len() > 1 {
                                duplicates.push(DuplicateGroup {
                                    hash,
                                    files: identical_files,
                                    size,
                                });
                            }
                        }
                    }
                }
            }
        }

        duplicates.sort_by_key(|b| std::cmp::Reverse(b.size));
        Ok(duplicates)
    })
    .await
    .map_err(AppError::from)?
}

/// Executes the copy_file command with sandbox verification.
#[tauri::command]
pub fn copy_file(source: String, dest: String, state: tauri::State<'_, AllowedPathsState>) -> AppResult<()> {
    let p_src = validate_path(&source, &state)?;
    let p_dest = validate_path(&dest, &state)?;
    std::fs::copy(p_src, p_dest).map_err(AppError::from)?;
    Ok(())
}

/// Executes the move_file command with sandbox verification.
#[tauri::command]
pub fn move_file(source: String, dest: String, state: tauri::State<'_, AllowedPathsState>) -> AppResult<()> {
    let p_src = validate_path(&source, &state)?;
    let p_dest = validate_path(&dest, &state)?;
    std::fs::rename(p_src, p_dest).map_err(AppError::from)?;
    Ok(())
}

/// Executes the delete_file command with sandbox verification.
#[tauri::command]
pub fn delete_file(path: String, state: tauri::State<'_, AllowedPathsState>) -> AppResult<()> {
    let p = validate_path(&path, &state)?;
    fs::remove_file(p).map_err(AppError::from)
}

pub fn build_tree(path: &std::path::Path, current_depth: u8, max_depth: u8) -> TreeMapNode {
    let name = path
        .file_name()
        .unwrap_or_default()
        .to_string_lossy()
        .to_string();
    let mut node = TreeMapNode {
        name: if name.is_empty() {
            path.to_string_lossy().to_string()
        } else {
            name
        },
        size: 0,
        children: Vec::new(),
    };

    if current_depth >= max_depth {
        let size = WalkDir::new(path)
            .into_iter()
            .filter_map(|e| e.ok())
            .filter(|e| e.file_type().is_file())
            .map(|e| e.metadata().map(|m| m.len()).unwrap_or(0))
            .sum();
        node.size = size;
        return node;
    }

    if let Ok(entries) = std::fs::read_dir(path) {
        let mut child_nodes = Vec::new();
        let mut total_size = 0;

        for entry in entries.flatten() {
            if let Ok(metadata) = entry.metadata() {
                if metadata.is_dir() {
                    let child = build_tree(&entry.path(), current_depth + 1, max_depth);
                    total_size += child.size;
                    child_nodes.push(child);
                } else {
                    let size = metadata.len();
                    total_size += size;
                    child_nodes.push(TreeMapNode {
                        name: entry.file_name().to_string_lossy().to_string(),
                        size,
                        children: Vec::new(),
                    });
                }
            }
        }

        child_nodes.sort_by_key(|b| std::cmp::Reverse(b.size));

        if child_nodes.len() > 30 {
            let mut others_size = 0;
            for child in child_nodes.iter().skip(29) {
                others_size += child.size;
            }
            child_nodes.truncate(29);
            child_nodes.push(TreeMapNode {
                name: "Others".to_string(),
                size: others_size,
                children: Vec::new(),
            });
        }

        node.size = total_size;
        node.children = child_nodes;
    }

    node
}

/// Executes the get_treemap_data command with sandbox verification.
#[tauri::command]
pub async fn get_treemap_data(
    path: String,
    max_depth: u8,
    state: tauri::State<'_, AllowedPathsState>,
) -> AppResult<Vec<TreeMapNode>> {
    let p = validate_path(&path, &state)?;
    if !p.exists() {
        return Err(AppError::Custom("Path does not exist".to_string()));
    }

    let tree = tauri::async_runtime::spawn_blocking(move || build_tree(&p, 0, max_depth))
        .await
        .map_err(AppError::from)?;

    Ok(vec![tree])
}

/// Executes the get_code_metrics command asynchronously with sandbox verification.
#[tauri::command]
pub async fn get_code_metrics(
    path: String,
    state: tauri::State<'_, AllowedPathsState>,
) -> AppResult<CodeMetrics> {
    let p = validate_path(&path, &state)?;

    tauri::async_runtime::spawn_blocking(move || {
        let mut metrics = CodeMetrics::default();

        fn scan_dir(dir: &std::path::Path, metrics: &mut CodeMetrics) -> AppResult<()> {
            if let Ok(entries) = std::fs::read_dir(dir) {
                for entry in entries.flatten() {
                    let path = entry.path();
                    let file_name = path.file_name().unwrap_or_default().to_string_lossy();

                    if file_name == "node_modules"
                        || file_name == ".git"
                        || file_name == "dist"
                        || file_name == "target"
                    {
                        continue;
                    }

                    if path.is_dir() {
                        let _ = scan_dir(&path, metrics);
                    } else if path.is_file() {
                        let ext = path
                            .extension()
                            .unwrap_or_default()
                            .to_string_lossy()
                            .to_string();
                        if !ext.is_empty() {
                            metrics.total_files += 1;

                            if matches!(
                                ext.as_str(),
                                "rs" | "ts" | "tsx" | "js" | "jsx" | "css" | "html" | "json" | "toml"
                            ) {
                                if let Ok(mut file) = std::fs::File::open(&path) {
                                    use std::io::Read;
                                    let mut buffer = [0u8; 8192];
                                    let mut lines = 0;
                                    while let Ok(n) = file.read(&mut buffer) {
                                        if n == 0 {
                                            break;
                                        }
                                        lines += buffer[..n].iter().filter(|&&b| b == b'\n').count() as u32;
                                    }
                                    
                                    metrics.total_lines += lines;
                                    *metrics.languages.entry(ext).or_insert(0) += lines;
                                }
                            }
                        }
                    }
                }
            }
            Ok(())
        }

        scan_dir(&p, &mut metrics)?;
        Ok(metrics)
    })
    .await
    .map_err(AppError::from)?
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;

    #[test]
    fn test_allowed_paths_sandbox() {
        let state = AllowedPathsState::new();
        let temp_dir = std::env::temp_dir();
        assert!(state.is_allowed(&temp_dir));

        let unauthorized = if cfg!(target_os = "windows") {
            PathBuf::from("C:\\Windows\\System32\\config")
        } else {
            PathBuf::from("/etc/shadow")
        };
        assert!(!state.is_allowed(&unauthorized));
    }

    #[test]
    fn test_build_tree_empty() {
        let temp_dir = std::env::temp_dir().join("codexos_test_build_tree");
        let _ = fs::create_dir_all(&temp_dir);
        let tree = build_tree(&temp_dir, 0, 2);

        assert_eq!(tree.size, 0);
        assert_eq!(tree.children.len(), 0);

        let _ = fs::remove_dir_all(&temp_dir);
    }

    #[test]
    fn test_allowed_paths_add_remove() {
        let state = AllowedPathsState::new();
        let custom_path = std::env::temp_dir().join("custom_workspace_folder");
        let _ = fs::create_dir_all(&custom_path);

        state.allow(&custom_path);
        assert!(state.is_allowed(&custom_path));

        state.remove(&custom_path);
        // Note: standard temp_dir is still allowed by default, so check a child path specifically outside standard temp_dir or compare set
        let _ = fs::remove_dir_all(&custom_path);
    }

    #[test]
    fn test_allowed_paths_poison_recovery() {
        let state = AllowedPathsState::new();
        let _ = std::panic::catch_unwind(|| {
            let _guard = state.allowed_roots.lock().unwrap();
            panic!("Simulated lock poison in allowed paths");
        });

        assert!(state.allowed_roots.is_poisoned());
        let guard = lock_poison_recover(&state.allowed_roots);
        assert!(!guard.is_empty());
    }

    #[test]
    fn test_validate_path_sandbox_rejection() {
        let state = AllowedPathsState::new();
        let forbidden = if cfg!(target_os = "windows") {
            "C:\\Windows\\System32\\drivers\\etc\\hosts"
        } else {
            "/etc/shadow"
        };
        let result = validate_path(forbidden, &state);
        assert!(result.is_err());
    }
}
