use serde::{Deserialize, Serialize};
use sysinfo::Disks;
use std::fs;
use walkdir::WalkDir;
use sha2::{Sha256, Digest};

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

#[tauri::command]
pub fn get_drives() -> Vec<DriveInfo> {
    let mut disks = Disks::new_with_refreshed_list();
    disks.refresh_list();
    
    disks.iter().map(|disk| {
        let total = disk.total_space();
        let available = disk.available_space();
        let used = total.saturating_sub(available);
        
        let name = disk.mount_point().to_string_lossy().to_string();
        
        DriveInfo {
            name,
            total_gb: total / 1_000_000_000,
            used_gb: used / 1_000_000_000,
        }
    }).collect()
}

#[tauri::command]
pub fn read_file_text(path: String) -> Result<String, String> {
    fs::read_to_string(path).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn write_file_text(path: String, content: String) -> Result<(), String> {
    std::fs::write(path, content).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn create_file(path: String) -> Result<(), String> {
    std::fs::File::create(&path).map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
pub fn create_directory(path: String) -> Result<(), String> {
    std::fs::create_dir_all(&path).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn rename_path(old_path: String, new_path: String) -> Result<(), String> {
    std::fs::rename(&old_path, &new_path).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn read_file_binary(path: String) -> Result<Vec<u8>, String> {
    fs::read(path).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn write_file_binary_webrtc(path: String, data: Vec<u8>) -> Result<(), String> {
    fs::write(path, data).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn get_current_dir() -> Result<String, String> {
    std::env::current_dir()
        .map(|p| p.to_string_lossy().to_string())
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub fn get_files_in_dir(path: String) -> Result<Vec<FileInfo>, String> {
    let mut files = Vec::new();
    let entries = std::fs::read_dir(path).map_err(|e| e.to_string())?;
    
    for entry in entries.flatten() {
        let meta = entry.metadata().map_err(|e| e.to_string())?;
            files.push(FileInfo {
                name: entry.file_name().to_string_lossy().to_string(),
                path: entry.path().to_string_lossy().to_string(),
                is_dir: meta.is_dir(),
                size_bytes: meta.len(),
            });
    }
    
    files.sort_by(|a, b| {
        b.is_dir.cmp(&a.is_dir).then_with(|| a.name.to_lowercase().cmp(&b.name.to_lowercase()))
    });
    
    Ok(files)
}

#[tauri::command]
pub fn scan_dev_bloat(path: String) -> Vec<BloatItem> {
    let mut bloat_items = Vec::new();
    
    let walker = WalkDir::new(path).into_iter().filter_entry(|e| {
        let is_hidden = e.file_name().to_str().map(|s| s.starts_with('.')).unwrap_or(false);
        !is_hidden
    });
    
    for entry in walker.flatten() {
        if entry.file_type().is_dir() {
            let name = entry.file_name().to_string_lossy();
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
            }
        }
    }
    
    bloat_items
}

#[tauri::command]
pub fn purge_directories(paths: Vec<String>) -> Result<(), String> {
    for path in paths {
        trash::delete(&path).map_err(|e| e.to_string())?;
    }
    Ok(())
}

#[tauri::command]
pub fn bulk_rename(path: String, pattern: String, replacement: String) -> Result<Vec<String>, String> {
    use regex::Regex;
    use std::fs;
    
    let re = Regex::new(&pattern).map_err(|e| e.to_string())?;
    let dir = std::path::Path::new(&path);
    let mut renamed_files = Vec::new();
    
    if let Ok(entries) = fs::read_dir(dir) {
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
}

#[tauri::command]
pub async fn find_duplicates(path: String) -> Result<Vec<DuplicateGroup>, String> {
    tauri::async_runtime::spawn_blocking(move || {
        use std::collections::HashMap;
        
        let mut size_map: HashMap<u64, Vec<String>> = HashMap::new();
        
        for entry in WalkDir::new(&path).into_iter().filter_map(|e| e.ok()) {
            if entry.file_type().is_file() {
                if let Ok(metadata) = entry.metadata() {
                    let size = metadata.len();
                    if size > 0 {
                        size_map.entry(size).or_default().push(entry.path().to_string_lossy().to_string());
                    }
                }
            }
        }
        
        let mut duplicates = Vec::new();
        
        for (size, files) in size_map {
            if files.len() > 1 {
                let mut hash_map: HashMap<String, Vec<String>> = HashMap::new();
                for file_path in files {
                    if let Ok(mut file) = std::fs::File::open(&file_path) {
                        let mut hasher = Sha256::new();
                        if std::io::copy(&mut file, &mut hasher).is_ok() {
                            let hash = hex::encode(hasher.finalize());
                            hash_map.entry(hash).or_default().push(file_path);
                        }
                    }
                }
                
                for (hash, identical_files) in hash_map {
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
        
        duplicates.sort_by_key(|b| std::cmp::Reverse(b.size));
        Ok(duplicates)
    }).await.map_err(|e| e.to_string())?
}

#[tauri::command]
pub fn copy_file(source: String, dest: String) -> Result<(), String> {
    std::fs::copy(source, dest).map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
pub fn move_file(source: String, dest: String) -> Result<(), String> {
    std::fs::rename(source, dest).map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
pub fn delete_file(path: String) -> Result<(), String> {
    fs::remove_file(path).map_err(|e| e.to_string())
}

pub fn build_tree(path: &std::path::Path, current_depth: u8, max_depth: u8) -> TreeMapNode {
    let name = path.file_name().unwrap_or_default().to_string_lossy().to_string();
    let mut node = TreeMapNode {
        name: if name.is_empty() { path.to_string_lossy().to_string() } else { name },
        size: 0,
        children: Vec::new(),
    };
    
    if current_depth >= max_depth {
        let size = WalkDir::new(path).into_iter().filter_map(|e| e.ok()).filter(|e| e.file_type().is_file()).map(|e| e.metadata().map(|m| m.len()).unwrap_or(0)).sum();
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
                        children: Vec::new()
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

#[tauri::command]
pub async fn get_treemap_data(path: String, max_depth: u8) -> Result<Vec<TreeMapNode>, String> {
    let p = std::path::PathBuf::from(path);
    if !p.exists() {
        return Err("Path does not exist".to_string());
    }
    
    let tree = tauri::async_runtime::spawn_blocking(move || {
        build_tree(&p, 0, max_depth)
    }).await.map_err(|e| e.to_string())?;
    
    Ok(vec![tree])
}

#[tauri::command]
pub fn get_code_metrics(path: String) -> Result<CodeMetrics, String> {
    let mut metrics = CodeMetrics::default();
    
    fn scan_dir(dir: &std::path::Path, metrics: &mut CodeMetrics) -> Result<(), String> {
        if let Ok(entries) = std::fs::read_dir(dir) {
            for entry in entries.flatten() {
                let path = entry.path();
                let file_name = path.file_name().unwrap_or_default().to_string_lossy();
                
                if file_name == "node_modules" || file_name == "target" || file_name == ".git" || file_name == "dist" {
                    continue;
                }
                
                if path.is_dir() {
                    let _ = scan_dir(&path, metrics);
                } else if path.is_file() {
                    let ext = path.extension().unwrap_or_default().to_string_lossy().to_string();
                    if !ext.is_empty() {
                        metrics.total_files += 1;
                        
                        if matches!(ext.as_str(), "rs" | "ts" | "tsx" | "js" | "jsx" | "css" | "html" | "json" | "toml") {
                            if let Ok(content) = std::fs::read_to_string(&path) {
                                let lines = content.lines().count() as u32;
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
    
    scan_dir(std::path::Path::new(&path), &mut metrics)?;
    Ok(metrics)
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;
    use std::path::Path;

    #[test]
    fn test_build_tree_empty() {
        let temp_dir = std::env::temp_dir().join("codexos_test_build_tree");
        let _ = fs::create_dir_all(&temp_dir);
        let tree = build_tree(&temp_dir, 0, 2);
        
        assert_eq!(tree.size, 0);
        assert_eq!(tree.children.len(), 0);
        
        let _ = fs::remove_dir_all(&temp_dir);
    }
}
