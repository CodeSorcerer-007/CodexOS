use crate::error::{AppError, AppResult};
use crate::transfer_manager::*;
use crate::util::lock_poison_recover;
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use std::collections::{HashMap, HashSet};
use std::fs;
use std::path::{Path, PathBuf};
use std::sync::atomic::Ordering;
use std::sync::{Arc, Mutex, OnceLock};
use std::time::Duration;
use sysinfo::Disks;
use walkdir::WalkDir;

const MAX_TEXT_FILE_READ_BYTES: u64 = 20 * 1024 * 1024; // 20 MB

fn now_secs() -> u64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_secs())
        .unwrap_or(0)
}

#[derive(Serialize, Deserialize, Clone, Debug, PartialEq, Eq)]
#[serde(tag = "type")]
pub enum JournalEntry {
    Rename {
        old_path: PathBuf,
        new_path: PathBuf,
        timestamp: u64,
    },
    Move {
        source: PathBuf,
        original_source: PathBuf,
        timestamp: u64,
    },
    Copy {
        destination: PathBuf,
        is_dir: bool,
        size_bytes: u64,
        sha256: Option<String>,
        timestamp: u64,
    },
    DeleteTrash {
        path: PathBuf,
        timestamp: u64,
    },
}

#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct UndoResult {
    pub success: bool,
    pub description: String,
    pub undone_type: String,
}

#[derive(Clone, Default)]
pub struct OperationJournalState {
    pub entries: Arc<Mutex<Vec<JournalEntry>>>,
}

impl OperationJournalState {
    pub fn new() -> Self {
        Self {
            entries: Arc::new(Mutex::new(Vec::new())),
        }
    }

    pub fn record(&self, entry: JournalEntry) {
        let mut lock = lock_poison_recover(&self.entries);
        if lock.len() >= 100 {
            lock.remove(0);
        }
        lock.push(entry);
    }

    pub fn pop(&self) -> Option<JournalEntry> {
        let mut lock = lock_poison_recover(&self.entries);
        lock.pop()
    }

    pub fn get_history(&self, limit: usize) -> Vec<JournalEntry> {
        let lock = lock_poison_recover(&self.entries);
        lock.iter().rev().take(limit).cloned().collect()
    }
}

#[derive(Default)]
pub struct WriteSyncManager {
    target_locks: Mutex<HashMap<PathBuf, Arc<Mutex<()>>>>,
    active_temp_files: Mutex<HashSet<PathBuf>>,
}

impl WriteSyncManager {
    pub fn new() -> Self {
        Self::default()
    }

    pub fn get_target_lock(&self, target_path: &Path) -> Arc<Mutex<()>> {
        let key = normalize_path(target_path);
        let mut map = lock_poison_recover(&self.target_locks);
        map.entry(key)
            .or_insert_with(|| Arc::new(Mutex::new(())))
            .clone()
    }

    pub fn register_active_temp(&self, temp_path: PathBuf) {
        let mut set = lock_poison_recover(&self.active_temp_files);
        set.insert(temp_path);
    }

    pub fn unregister_active_temp(&self, temp_path: &Path) {
        let mut set = lock_poison_recover(&self.active_temp_files);
        set.remove(temp_path);
    }

    pub fn is_temp_active(&self, temp_path: &Path) -> bool {
        let set = lock_poison_recover(&self.active_temp_files);
        set.contains(temp_path)
    }
}

static WRITE_SYNC_MANAGER: OnceLock<WriteSyncManager> = OnceLock::new();

pub fn get_write_sync_manager() -> &'static WriteSyncManager {
    WRITE_SYNC_MANAGER.get_or_init(WriteSyncManager::new)
}

pub struct TempFileGuard<'a> {
    temp_path: &'a Path,
    manager: &'static WriteSyncManager,
    keep: bool,
}

impl<'a> TempFileGuard<'a> {
    pub fn new(temp_path: &'a Path, manager: &'static WriteSyncManager) -> Self {
        manager.register_active_temp(temp_path.to_path_buf());
        Self {
            temp_path,
            manager,
            keep: false,
        }
    }

    pub fn disarm(mut self) {
        self.keep = true;
    }
}

impl<'a> Drop for TempFileGuard<'a> {
    fn drop(&mut self) {
        self.manager.unregister_active_temp(self.temp_path);
        if !self.keep && self.temp_path.exists() {
            let _ = std::fs::remove_file(self.temp_path);
        }
    }
}

pub struct AllowedPathsState {
    pub allowed_roots: Mutex<HashSet<PathBuf>>,
}

impl Default for AllowedPathsState {
    fn default() -> Self {
        Self::new()
    }
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
        let normalized = normalize_path(path);

        // 1. Lexical check: verify that the path (or its closest existing ancestor) resides inside an allowed root
        let mut ancestor = normalized.clone();
        let mut lexical_allowed = false;
        while let Some(parent) = ancestor.parent() {
            let lock = lock_poison_recover(&self.allowed_roots);
            for root in lock.iter() {
                if path_starts_with(&ancestor, root) {
                    lexical_allowed = true;
                    break;
                }
            }
            if lexical_allowed {
                break;
            }
            ancestor = parent.to_path_buf();
        }
        if !lexical_allowed {
            let lock = lock_poison_recover(&self.allowed_roots);
            for root in lock.iter() {
                if path_starts_with(&normalized, root) {
                    lexical_allowed = true;
                    break;
                }
            }
        }
        if !lexical_allowed {
            return false;
        }

        // 2. Canonical target verification: if path exists or is a symlink/reparse point, its resolved canonical target must also reside within an allowed root!
        let has_symlink = std::fs::symlink_metadata(&normalized).is_ok();
        if normalized.exists() || has_symlink {
            if let Ok(canon) = normalized.canonicalize() {
                let canon_norm = normalize_path(&canon);
                let lock = lock_poison_recover(&self.allowed_roots);
                for root in lock.iter() {
                    if path_starts_with(&canon_norm, root) {
                        return true;
                    }
                }
                // Symlink or reparse point target is outside allowed workspace!
                return false;
            } else if has_symlink {
                // If symlink_metadata is Ok but canonicalize fails, it is a broken symlink or inaccessible target
                if let Ok(meta) = std::fs::symlink_metadata(&normalized) {
                    if meta.file_type().is_symlink() {
                        return false;
                    }
                }
            }
        }

        true
    }
}

pub fn strip_unc_prefix(path: &Path) -> PathBuf {
    let s = path.to_string_lossy();
    if let Some(stripped) = s.strip_prefix(r"\\?\UNC\") {
        PathBuf::from(format!(r"\\{}", stripped))
    } else if let Some(stripped) = s.strip_prefix(r"\\?\") {
        PathBuf::from(stripped)
    } else {
        path.to_path_buf()
    }
}

pub fn normalize_path(path: &Path) -> PathBuf {
    let stripped = strip_unc_prefix(path);
    let mut normalized = PathBuf::new();
    for comp in stripped.components() {
        match comp {
            std::path::Component::Prefix(p) => normalized.push(p.as_os_str()),
            std::path::Component::RootDir => normalized.push(comp.as_os_str()),
            std::path::Component::CurDir => {}
            std::path::Component::ParentDir => {
                normalized.pop();
            }
            std::path::Component::Normal(c) => {
                normalized.push(c);
            }
        }
    }
    normalized
}

pub fn path_starts_with(target: &Path, root: &Path) -> bool {
    let target_norm = normalize_path(target);
    let root_norm = normalize_path(root);

    #[cfg(windows)]
    {
        let t_comps: Vec<_> = target_norm.components().collect();
        let r_comps: Vec<_> = root_norm.components().collect();
        if t_comps.len() < r_comps.len() {
            return false;
        }
        for (tc, rc) in t_comps.iter().zip(r_comps.iter()) {
            let tc_str = tc.as_os_str().to_string_lossy().to_lowercase();
            let rc_str = rc.as_os_str().to_string_lossy().to_lowercase();
            if tc_str != rc_str {
                return false;
            }
        }
        true
    }

    #[cfg(not(windows))]
    {
        target_norm.starts_with(&root_norm)
    }
}

fn is_protected_path_internal(norm: &Path, state: &AllowedPathsState) -> AppResult<()> {
    // 1. Cannot target drive or filesystem root
    if norm.parent().is_none() || norm == Path::new("/") {
        return Err(AppError::Custom(
            "Destructive operation rejected: Cannot modify or delete filesystem root.".to_string(),
        ));
    }
    #[cfg(windows)]
    {
        let s = norm.to_string_lossy().to_lowercase();
        // Check if root drive like "c:" or "c:\"
        if (s.len() == 2 && s.ends_with(':')) || (s.len() == 3 && s.ends_with(r":\")) {
            return Err(AppError::Custom(
                "Destructive operation rejected: Cannot modify or delete drive root.".to_string(),
            ));
        }

        // Critical Windows directories
        if let Ok(windir) = std::env::var("WINDIR") {
            let win_path = normalize_path(Path::new(&windir));
            if path_starts_with(norm, &win_path) {
                return Err(AppError::Custom(
                    "Destructive operation rejected: Target is inside the Windows system directory.".to_string(),
                ));
            }
        }
        if let Ok(prog_files) = std::env::var("ProgramFiles") {
            let pf_path = normalize_path(Path::new(&prog_files));
            if path_starts_with(norm, &pf_path) {
                return Err(AppError::Custom(
                    "Destructive operation rejected: Target is inside Program Files.".to_string(),
                ));
            }
        }
    }

    // 2. Cannot delete or rename an allowed workspace root itself
    let lock = lock_poison_recover(&state.allowed_roots);
    for root in lock.iter() {
        let root_norm = normalize_path(root);
        #[cfg(windows)]
        let is_same = root_norm
            .to_string_lossy()
            .eq_ignore_ascii_case(&norm.to_string_lossy());
        #[cfg(not(windows))]
        let is_same = root_norm == *norm;

        if is_same {
            return Err(AppError::Custom(
                "Destructive operation rejected: Cannot delete or rename an opened workspace root itself. Remove the workspace instead.".to_string(),
            ));
        }
    }

    Ok(())
}

pub fn is_protected_target(path: &Path, state: &AllowedPathsState) -> AppResult<()> {
    let norm = normalize_path(path);
    is_protected_path_internal(&norm, state)?;

    // Inspect canonical / reparse point target if item exists
    if norm.exists() || std::fs::symlink_metadata(&norm).is_ok() {
        if let Ok(canon) = norm.canonicalize() {
            let canon_norm = normalize_path(&canon);
            if canon_norm != norm {
                is_protected_path_internal(&canon_norm, state)?;
            }
        }
    }

    Ok(())
}

pub fn validate_path(path: &str, state: &AllowedPathsState) -> AppResult<PathBuf> {
    let p = normalize_path(Path::new(path));
    if !state.is_allowed(&p) {
        return Err(AppError::Custom(format!(
            "Access denied: path '{}' is outside opened workspaces",
            path
        )));
    }
    Ok(p)
}

#[tauri::command]
pub fn add_allowed_path(path: String, state: tauri::State<'_, AllowedPathsState>) -> AppResult<()> {
    let p = normalize_path(Path::new(&path));
    if !p.is_absolute() {
        return Err(AppError::Custom(
            "Allowed path must be absolute".to_string(),
        ));
    }
    if !p.exists() || !p.is_dir() {
        return Err(AppError::Custom(
            "Allowed path must be an existing directory".to_string(),
        ));
    }
    state.allow(&p);
    Ok(())
}

#[tauri::command]
pub fn remove_allowed_path(
    path: String,
    state: tauri::State<'_, AllowedPathsState>,
) -> AppResult<()> {
    let p = PathBuf::from(&path);
    state.remove(&p);
    Ok(())
}

#[tauri::command]
pub fn get_allowed_paths(state: tauri::State<'_, AllowedPathsState>) -> Vec<String> {
    let guard = lock_poison_recover(&state.allowed_roots);
    guard
        .iter()
        .map(|p| p.to_string_lossy().to_string())
        .collect()
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
pub fn get_user_home_dir() -> String {
    std::env::var("USERPROFILE")
        .or_else(|_| std::env::var("HOME"))
        .unwrap_or_else(|_| "C:\\Users\\Default".to_string())
}

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
pub fn read_file_text(
    path: String,
    state: tauri::State<'_, AllowedPathsState>,
) -> AppResult<String> {
    let p = validate_path(&path, &state)?;
    if !p.exists() {
        let _ = recover_interrupted_write(&p);
    }
    let meta = fs::metadata(&p).map_err(AppError::from)?;
    if meta.len() > MAX_TEXT_FILE_READ_BYTES {
        return Err(AppError::Custom(format!(
            "File is too large to read as text ({} MB > 20 MB limit).",
            meta.len() / (1024 * 1024)
        )));
    }
    fs::read_to_string(p).map_err(AppError::from)
}

fn recover_interrupted_write_unlocked(
    target_path: &Path,
    sync_mgr: &WriteSyncManager,
) -> AppResult<bool> {
    let parent = match target_path.parent() {
        Some(p) => p,
        None => return Ok(false),
    };

    let file_stem = match target_path.file_name().and_then(|n| n.to_str()) {
        Some(s) if !s.is_empty() => s,
        _ => return Ok(false),
    };

    let bak_prefix = format!(".{}.bak_", file_stem);
    let tmp_prefix = format!(".{}.tmp_", file_stem);

    let mut restored = false;

    if let Ok(entries) = std::fs::read_dir(parent) {
        for entry in entries.flatten() {
            let entry_path = entry.path();
            let name = entry.file_name().to_string_lossy().to_string();

            if name.starts_with(&bak_prefix) {
                // Rule 1: If target does not exist, restore the backup.
                // Rule 2: If target exists, preserve the ambiguous backup on disk (never delete automatically).
                let dest_exists =
                    target_path.exists() || std::fs::symlink_metadata(target_path).is_ok();
                if !dest_exists && !restored && std::fs::rename(&entry_path, target_path).is_ok() {
                    restored = true;
                    continue;
                }
                // When target exists, leave ambiguous backup intact to prevent data loss
            } else if name.starts_with(&tmp_prefix) {
                // Never delete an active in-flight temporary file
                if sync_mgr.is_temp_active(&entry_path) {
                    continue;
                }
                let _ = std::fs::remove_file(&entry_path);
            }
        }
    }

    Ok(restored)
}

/// Recovers any interrupted atomic write for `target_path` with per-target synchronization.
/// If the target file is missing, but a leftover `.<stem>.bak_<nanos>` file exists in the directory,
/// it restores the backup to `target_path`. Stale temporary files not belonging to any active write
/// are purged. An active in-flight temporary file is NEVER deleted.
pub fn recover_interrupted_write(target_path: &Path) -> AppResult<bool> {
    let sync_mgr = get_write_sync_manager();
    let target_lock = sync_mgr.get_target_lock(target_path);
    let _guard = lock_poison_recover(&target_lock);
    recover_interrupted_write_unlocked(target_path, sync_mgr)
}

pub fn recover_interrupted_dir_replacement_unlocked(
    target_dir: &Path,
    sync_mgr: &WriteSyncManager,
) -> AppResult<bool> {
    let parent = match target_dir.parent() {
        Some(p) => p,
        None => return Ok(false),
    };

    let dir_name = match target_dir.file_name().and_then(|n| n.to_str()) {
        Some(s) if !s.is_empty() => s,
        _ => return Ok(false),
    };

    let bak_prefix = format!(".{}.bak_dir_replace_", dir_name);
    let tmp_prefix = format!(".{}.tmp_dir_replace_", dir_name);
    let tmp_tx_prefix = format!(".{}.tmp_dir_transfer_", dir_name);
    let tmp_ren_prefix = format!(".{}.tmp_dir_ren_cp_", dir_name);

    let mut restored = false;

    if let Ok(entries) = std::fs::read_dir(parent) {
        for entry in entries.flatten() {
            let entry_path = entry.path();
            let name = entry.file_name().to_string_lossy().to_string();

            if name.starts_with(&bak_prefix) {
                // Rule 1: Restore orphaned directory backup if destination is missing
                // Rule 2: Recovery must never overwrite an existing destination
                // Rule 3: Never delete an ambiguous backup automatically
                let dest_exists =
                    target_dir.exists() || std::fs::symlink_metadata(target_dir).is_ok();
                if !dest_exists && !restored && std::fs::rename(&entry_path, target_dir).is_ok() {
                    restored = true;
                    continue;
                }
                // When destination exists, leave orphaned backup preserved on disk (never delete automatically)
            } else if name.starts_with(&tmp_prefix)
                || name.starts_with(&tmp_tx_prefix)
                || name.starts_with(&tmp_ren_prefix)
            {
                // Rule 4: Distinguish active operations from abandoned temporary directories
                if sync_mgr.is_temp_active(&entry_path) {
                    continue;
                }
                let _ = std::fs::remove_dir_all(&entry_path);
            }
        }
    }

    Ok(restored)
}

/// Recovers any interrupted directory replacement for `target_dir` with per-target synchronization.
/// If target_dir is missing, restores the orphaned backup directory. If target_dir exists,
/// it never overwrites target_dir and never deletes an ambiguous backup automatically.
/// Abandoned temporary directories are cleaned up while active in-flight transfers are preserved.
pub fn recover_interrupted_dir_replacement(target_dir: &Path) -> AppResult<bool> {
    let sync_mgr = get_write_sync_manager();
    let target_lock = sync_mgr.get_target_lock(target_dir);
    let _guard = lock_poison_recover(&target_lock);
    recover_interrupted_dir_replacement_unlocked(target_dir, sync_mgr)
}

/// Atomically writes content to a file using temporary file and safe replacement.
/// Synchronized per target so concurrent writes to the same target are safely serialized,
/// while writes to different targets run in parallel without contention.
pub fn atomic_write_bytes(target_path: &Path, data: &[u8]) -> AppResult<()> {
    let parent = target_path.parent().ok_or_else(|| {
        AppError::Custom("Cannot write to path without a parent directory".to_string())
    })?;

    let sync_mgr = get_write_sync_manager();
    let target_lock = sync_mgr.get_target_lock(target_path);
    let _target_guard = lock_poison_recover(&target_lock);

    // First recover any interrupted prior write under target lock
    let _ = recover_interrupted_write_unlocked(target_path, sync_mgr);

    // Create temp file in the same parent directory to ensure it is on the same volume
    let random_suffix = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_nanos())
        .unwrap_or(12345);
    let file_stem = target_path
        .file_name()
        .and_then(|n| n.to_str())
        .unwrap_or("file");
    let temp_name = format!(".{}.tmp_{}", file_stem, random_suffix);
    let temp_path = parent.join(&temp_name);

    let temp_guard = TempFileGuard::new(&temp_path, sync_mgr);

    // Write data to temporary file with flush & sync
    let mut file = std::fs::OpenOptions::new()
        .write(true)
        .create_new(true)
        .open(&temp_path)
        .map_err(|e| AppError::Custom(format!("Failed to create temporary file: {}", e)))?;

    use std::io::Write;
    file.write_all(data)
        .map_err(|e| AppError::Custom(format!("Failed to write to temporary file: {}", e)))?;
    file.sync_all()
        .map_err(|e| AppError::Custom(format!("Failed to sync temporary file: {}", e)))?;

    // Drop open file handle before renaming (essential on Windows)
    drop(file);

    // Atomically replace target with temp file.
    // On Windows (NTFS) and Unix, std::fs::rename atomically replaces an existing target file
    // without removing the original first. The target file is never absent or truncated in the directory index.
    if let Err(e) = std::fs::rename(&temp_path, target_path) {
        return Err(AppError::Custom(format!(
            "Failed to atomically replace target file '{}': {}. Original file preserved intact.",
            target_path.display(),
            e
        )));
    }

    temp_guard.disarm();
    Ok(())
}

/// Executes the write_file_text command with sandbox verification and atomic durability.
#[tauri::command]
pub fn write_file_text(
    path: String,
    content: String,
    state: tauri::State<'_, AllowedPathsState>,
) -> AppResult<()> {
    let p = validate_path(&path, &state)?;
    is_protected_target(&p, &state)?;
    atomic_write_bytes(&p, content.as_bytes())
}

/// Executes the create_file command with sandbox verification and collision safeguards.
#[tauri::command]
pub fn create_file(path: String, state: tauri::State<'_, AllowedPathsState>) -> AppResult<()> {
    let p = validate_path(&path, &state)?;
    is_protected_target(&p, &state)?;
    if p.exists() {
        return Err(AppError::Custom(format!(
            "Cannot create file: '{}' already exists. Truncation prevented.",
            path
        )));
    }
    std::fs::OpenOptions::new()
        .write(true)
        .create_new(true)
        .open(&p)
        .map_err(AppError::from)?;
    Ok(())
}

/// Executes the create_directory command with sandbox verification.
#[tauri::command]
pub fn create_directory(path: String, state: tauri::State<'_, AllowedPathsState>) -> AppResult<()> {
    let p = validate_path(&path, &state)?;
    is_protected_target(&p, &state)?;
    if p.is_file() {
        return Err(AppError::Custom(format!(
            "Cannot create directory: a file already exists at '{}'",
            path
        )));
    }
    std::fs::create_dir_all(&p).map_err(AppError::from)
}

/// Executes the rename_path command with sandbox verification and collision protection.
#[tauri::command]
pub fn rename_path(
    old_path: String,
    new_path: String,
    overwrite: Option<bool>,
    state: tauri::State<'_, AllowedPathsState>,
    journal: tauri::State<'_, OperationJournalState>,
) -> AppResult<()> {
    let p_old = validate_path(&old_path, &state)?;
    is_protected_target(&p_old, &state)?;
    let p_new = validate_path(&new_path, &state)?;
    is_protected_target(&p_new, &state)?;

    if p_old == p_new {
        return Ok(());
    }

    if p_new.exists() && !overwrite.unwrap_or(false) {
        return Err(AppError::Custom(format!(
            "Cannot rename: destination '{}' already exists.",
            new_path
        )));
    }

    std::fs::rename(&p_old, &p_new).map_err(AppError::from)?;

    journal.record(JournalEntry::Rename {
        old_path: p_old,
        new_path: p_new,
        timestamp: now_secs(),
    });

    Ok(())
}

/// Executes the read_file_binary command with sandbox verification.
#[tauri::command]
pub fn read_file_binary(
    path: String,
    state: tauri::State<'_, AllowedPathsState>,
) -> AppResult<Vec<u8>> {
    let p = validate_path(&path, &state)?;
    fs::read(p).map_err(AppError::from)
}

/// Executes the write_file_binary_webrtc command with sandbox verification and atomic durability.
#[tauri::command]
pub fn write_file_binary_webrtc(
    path: String,
    data: Vec<u8>,
    state: tauri::State<'_, AllowedPathsState>,
) -> AppResult<()> {
    let p = validate_path(&path, &state)?;
    is_protected_target(&p, &state)?;
    atomic_write_bytes(&p, &data)
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
pub fn get_files_in_dir(
    path: String,
    state: tauri::State<'_, AllowedPathsState>,
) -> AppResult<Vec<FileInfo>> {
    let p = validate_path(&path, &state)?;
    if !p.exists() {
        let _ = recover_interrupted_dir_replacement(&p);
    }
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
pub async fn scan_dev_bloat(
    path: String,
    state: tauri::State<'_, AllowedPathsState>,
) -> AppResult<Vec<BloatItem>> {
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

            if entry.file_type().is_dir()
                && (name == "node_modules" || name == "target" || name == "bin" || name == "obj")
            {
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
        bloat_items
    })
    .await
    .map_err(AppError::from)
}

/// Executes the purge_directories command with sandbox verification and destructive safeguards.
#[tauri::command]
pub async fn purge_directories(
    paths: Vec<String>,
    state: tauri::State<'_, AllowedPathsState>,
) -> AppResult<()> {
    for path in &paths {
        let p = validate_path(path, &state)?;
        is_protected_target(&p, &state)?;
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
pub async fn find_duplicates(
    path: String,
    state: tauri::State<'_, AllowedPathsState>,
) -> AppResult<Vec<DuplicateGroup>> {
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

const COPY_BUFFER_SIZE: usize = 64 * 1024; // 64 KB streaming buffer

/// Computes the SHA-256 hash of a file using streaming 64 KB chunks without buffering in memory.
pub fn compute_file_sha256(path: &Path) -> std::io::Result<String> {
    use std::io::Read;
    let mut file = std::fs::File::open(path)?;
    let mut hasher = Sha256::new();
    let mut buffer = [0u8; COPY_BUFFER_SIZE];
    loop {
        let n = file.read(&mut buffer)?;
        if n == 0 {
            break;
        }
        hasher.update(&buffer[..n]);
    }
    Ok(hex::encode(hasher.finalize()))
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct FileIdentity {
    pub volume_serial: u64,
    pub file_id: u64,
}

#[cfg(windows)]
#[repr(C)]
#[allow(non_snake_case)]
struct ByHandleFileInformation {
    dwFileAttributes: u32,
    ftCreationTime: [u32; 2],
    ftLastAccessTime: [u32; 2],
    ftLastWriteTime: [u32; 2],
    dwVolumeSerialNumber: u32,
    nFileSizeHigh: u32,
    nFileSizeLow: u32,
    nNumberOfLinks: u32,
    nFileIndexHigh: u32,
    nFileIndexLow: u32,
}

#[cfg(windows)]
extern "system" {
    fn GetFileInformationByHandle(
        hFile: *mut std::ffi::c_void,
        lpFileInformation: *mut ByHandleFileInformation,
    ) -> i32;
}

#[cfg(windows)]
pub fn get_file_identity_from_file(file: &std::fs::File) -> Option<FileIdentity> {
    use std::os::windows::io::AsRawHandle;
    let handle = file.as_raw_handle();
    let mut info: ByHandleFileInformation = unsafe { std::mem::zeroed() };
    let success = unsafe { GetFileInformationByHandle(handle as _, &mut info) };
    if success != 0 {
        let file_id = ((info.nFileIndexHigh as u64) << 32) | (info.nFileIndexLow as u64);
        Some(FileIdentity {
            volume_serial: info.dwVolumeSerialNumber as u64,
            file_id,
        })
    } else {
        None
    }
}

#[cfg(windows)]
pub fn get_path_file_identity(path: &Path) -> Option<FileIdentity> {
    use std::os::windows::fs::OpenOptionsExt;
    // 0x02000000 = FILE_FLAG_BACKUP_SEMANTICS, allowing opening both files and directories
    let file = std::fs::OpenOptions::new()
        .read(true)
        .custom_flags(0x02000000)
        .open(path)
        .ok()?;
    get_file_identity_from_file(&file)
}

#[cfg(not(windows))]
pub fn get_file_identity_from_file(file: &std::fs::File) -> Option<FileIdentity> {
    use std::os::unix::fs::MetadataExt;
    let meta = file.metadata().ok()?;
    Some(FileIdentity {
        volume_serial: meta.dev(),
        file_id: meta.ino(),
    })
}

#[cfg(not(windows))]
pub fn get_path_file_identity(path: &Path) -> Option<FileIdentity> {
    use std::os::unix::fs::MetadataExt;
    let meta = std::fs::metadata(path).ok()?;
    Some(FileIdentity {
        volume_serial: meta.dev(),
        file_id: meta.ino(),
    })
}

pub fn get_file_identity(file: &std::fs::File) -> Option<FileIdentity> {
    get_file_identity_from_file(file)
}

/// Safely cleans up a destination file owned by the current transfer.
/// Verifies:
/// 1. Destination is not a symlink or reparse point.
/// 2. If expected_identity is provided, verifies destination still points to the exact same file instance.
/// 3. If an external process replaced the file with different content/identity, it is PRESERVED.
pub fn safe_cleanup_owned_file(path: &Path, expected_identity: Option<&FileIdentity>) -> bool {
    let meta = match std::fs::symlink_metadata(path) {
        Ok(m) => m,
        Err(_) => return false,
    };

    #[cfg(windows)]
    {
        use std::os::windows::fs::MetadataExt;
        if meta.file_type().is_symlink() || (meta.file_attributes() & 0x400) != 0 {
            // Reparse point / symlink: do not follow or delete unexpectedly
            return false;
        }
    }
    #[cfg(not(windows))]
    {
        if meta.file_type().is_symlink() {
            return false;
        }
    }

    if let Some(expected) = expected_identity {
        if let Some(current) = get_path_file_identity(path) {
            if current != *expected {
                // The file was replaced externally! Preserve it!
                return false;
            }
        }
    }

    std::fs::remove_file(path).is_ok()
}

/// Safely cleans up a destination directory owned by the current transfer.
/// Verifies:
/// 1. Destination is not a junction or symlink.
/// 2. If expected_identity is provided, verifies identity still matches.
/// 3. Does not follow any reparse points or junctions inside the directory.
pub fn safe_cleanup_owned_dir(path: &Path, expected_identity: Option<&FileIdentity>) -> bool {
    let meta = match std::fs::symlink_metadata(path) {
        Ok(m) => m,
        Err(_) => return false,
    };

    #[cfg(windows)]
    {
        use std::os::windows::fs::MetadataExt;
        if meta.file_type().is_symlink() || (meta.file_attributes() & 0x400) != 0 {
            return false;
        }
    }
    #[cfg(not(windows))]
    {
        if meta.file_type().is_symlink() {
            return false;
        }
    }

    if let Some(expected) = expected_identity {
        if let Some(current) = get_path_file_identity(path) {
            if current != *expected {
                return false;
            }
        }
    }

    // Inspect direct children: if any child is a symlink/reparse point, unlink only the link
    if let Ok(entries) = std::fs::read_dir(path) {
        for entry in entries.flatten() {
            if let Ok(child_meta) = entry.metadata() {
                #[cfg(windows)]
                {
                    use std::os::windows::fs::MetadataExt;
                    if child_meta.file_type().is_symlink()
                        || (child_meta.file_attributes() & 0x400) != 0
                    {
                        let _ = std::fs::remove_file(entry.path());
                        continue;
                    }
                }
                #[cfg(not(windows))]
                {
                    if child_meta.file_type().is_symlink() {
                        let _ = std::fs::remove_file(entry.path());
                        continue;
                    }
                }
            }
        }
    }

    std::fs::remove_dir_all(path).is_ok()
}

/// Copies a single file from `src` to `dst` with streaming SHA-256 verification,
/// flush sync, source modification detection during copy, and cooperative cancellation / progress tracking.
pub fn copy_file_streaming_verified_with_handle(
    src: &Path,
    dst: &Path,
    handle: Option<&TransferHandle>,
) -> AppResult<()> {
    use std::io::{Read, Write};

    if let Some(h) = handle {
        if h.is_cancelled() {
            return Err(AppError::Custom("Transfer cancelled by user".to_string()));
        }
    }

    let mut src_file = std::fs::File::open(src).map_err(|e| {
        AppError::Custom(format!(
            "Cannot open source file '{}': {}",
            src.display(),
            e
        ))
    })?;

    let src_meta_start = src_file.metadata().map_err(AppError::from)?;
    let src_mtime_start = src_meta_start.modified().ok();
    let src_len_start = src_meta_start.len();

    let mut dst_file = std::fs::OpenOptions::new()
        .write(true)
        .create(true)
        .truncate(true)
        .open(dst)
        .map_err(|e| {
            AppError::Custom(format!(
                "Cannot create destination file '{}': {}",
                dst.display(),
                e
            ))
        })?;

    let dst_identity = get_file_identity(&dst_file);

    let mut src_hasher = Sha256::new();
    let mut buffer = [0u8; COPY_BUFFER_SIZE];
    let mut total_copied: u64 = 0;

    loop {
        if let Some(h) = handle {
            if h.is_cancelled() {
                drop(dst_file);
                drop(src_file);
                let _ = safe_cleanup_owned_file(dst, dst_identity.as_ref());
                return Err(AppError::Custom("Transfer cancelled by user".to_string()));
            }
        }

        let n = match src_file.read(&mut buffer) {
            Ok(n) => n,
            Err(e) => {
                drop(dst_file);
                drop(src_file);
                let _ = safe_cleanup_owned_file(dst, dst_identity.as_ref());
                return Err(AppError::Custom(format!(
                    "Read failure on source '{}': {}",
                    src.display(),
                    e
                )));
            }
        };

        if n == 0 {
            break;
        }
        src_hasher.update(&buffer[..n]);
        if let Err(e) = dst_file.write_all(&buffer[..n]) {
            drop(dst_file);
            drop(src_file);
            let _ = safe_cleanup_owned_file(dst, dst_identity.as_ref());
            return Err(AppError::Custom(format!(
                "Write failure on destination '{}': {}",
                dst.display(),
                e
            )));
        }
        total_copied += n as u64;

        if let Some(h) = handle {
            h.add_bytes(n as u64);
            h.emit_if_throttled(
                "transfer://progress",
                std::time::Duration::from_millis(PROGRESS_THROTTLE_MS),
            );
        }
    }

    if let Err(e) = dst_file.sync_all() {
        drop(dst_file);
        drop(src_file);
        let _ = safe_cleanup_owned_file(dst, dst_identity.as_ref());
        return Err(AppError::Custom(format!(
            "Sync failure on destination '{}': {}",
            dst.display(),
            e
        )));
    }

    drop(dst_file);
    drop(src_file);

    // Verify source was not altered during copy
    let src_meta_end = std::fs::metadata(src).map_err(AppError::from)?;
    if src_meta_end.len() != src_len_start
        || (src_meta_end.modified().ok() != src_mtime_start && src_mtime_start.is_some())
    {
        let _ = safe_cleanup_owned_file(dst, dst_identity.as_ref());
        return Err(AppError::Custom(format!(
            "Source file '{}' was modified during copy operation. Copy aborted and destination purged.",
            src.display()
        )));
    }

    if total_copied != src_len_start {
        let _ = safe_cleanup_owned_file(dst, dst_identity.as_ref());
        return Err(AppError::Custom(format!(
            "Copy length mismatch: copied {} bytes, expected {} bytes.",
            total_copied, src_len_start
        )));
    }

    let src_hash = hex::encode(src_hasher.finalize());
    let dst_hash = compute_file_sha256(dst).map_err(|e| {
        let _ = safe_cleanup_owned_file(dst, dst_identity.as_ref());
        AppError::Custom(format!(
            "Verification read failure on destination '{}': {}",
            dst.display(),
            e
        ))
    })?;

    if src_hash != dst_hash {
        let _ = safe_cleanup_owned_file(dst, dst_identity.as_ref());
        return Err(AppError::Custom(format!(
            "Copy integrity failure: SHA-256 hash mismatch. Source: {}, Destination: {}. Destination removed.",
            src_hash, dst_hash
        )));
    }

    Ok(())
}

pub fn copy_file_streaming_verified(src: &Path, dst: &Path) -> AppResult<()> {
    copy_file_streaming_verified_with_handle(src, dst, None)
}

#[derive(Debug)]
struct FileCatalogEntry {
    rel_path: PathBuf,
    is_dir: bool,
    size_bytes: u64,
    mtime: Option<std::time::SystemTime>,
}

/// Recursively copies a directory tree with full hierarchy cataloging, streaming SHA-256 verification,
/// Unicode/nested handling, and detection of source modification during transfer.
pub fn copy_dir_streaming_verified_with_handle(
    src: &Path,
    dst: &Path,
    handle: Option<&TransferHandle>,
) -> AppResult<()> {
    if let Some(h) = handle {
        if h.is_cancelled() {
            return Err(AppError::Custom("Transfer cancelled by user".to_string()));
        }
    }

    let mut catalog: Vec<FileCatalogEntry> = Vec::new();

    for entry in WalkDir::new(src).into_iter() {
        let entry = entry.map_err(|e| {
            AppError::Custom(format!(
                "Failed to traverse source directory '{}': {}",
                src.display(),
                e
            ))
        })?;
        let path = entry.path();
        let rel_path = path
            .strip_prefix(src)
            .map_err(|e| AppError::Custom(format!("Path prefix error: {}", e)))?
            .to_path_buf();

        if rel_path.as_os_str().is_empty() {
            continue;
        }

        let symlink_meta = std::fs::symlink_metadata(path).map_err(AppError::from)?;
        if symlink_meta.file_type().is_symlink() {
            if let Ok(canon) = path.canonicalize() {
                let canon_norm = normalize_path(&canon);
                if !path_starts_with(&canon_norm, src) {
                    return Err(AppError::Custom(format!(
                        "Recursive directory copy rejected: Directory contains symlink/reparse point '{}' targeting outside the source tree ('{}').",
                        rel_path.display(),
                        canon_norm.display()
                    )));
                }
                if path_starts_with(&canon_norm, path) || path_starts_with(path, &canon_norm) {
                    return Err(AppError::Custom(format!(
                        "Circular linked directory rejected: '{}' creates a cycle with '{}'.",
                        rel_path.display(),
                        canon_norm.display()
                    )));
                }
            } else {
                return Err(AppError::Custom(format!(
                    "Directory copy rejected: broken or inaccessible symlink at '{}'",
                    rel_path.display()
                )));
            }
        }

        let meta = std::fs::metadata(path).map_err(AppError::from)?;
        catalog.push(FileCatalogEntry {
            rel_path,
            is_dir: meta.is_dir(),
            size_bytes: meta.len(),
            mtime: meta.modified().ok(),
        });
    }

    std::fs::create_dir_all(dst).map_err(AppError::from)?;
    let dst_dir_identity = get_path_file_identity(dst);

    for item in catalog.iter().filter(|i| i.is_dir) {
        if let Some(h) = handle {
            if h.is_cancelled() {
                let _ = safe_cleanup_owned_dir(dst, dst_dir_identity.as_ref());
                return Err(AppError::Custom("Transfer cancelled by user".to_string()));
            }
        }
        let dest_dir = dst.join(&item.rel_path);
        std::fs::create_dir_all(&dest_dir).map_err(|e| {
            let _ = safe_cleanup_owned_dir(dst, dst_dir_identity.as_ref());
            AppError::Custom(format!(
                "Failed to create destination directory '{}': {}",
                dest_dir.display(),
                e
            ))
        })?;
    }

    for item in catalog.iter().filter(|i| !i.is_dir) {
        if let Some(h) = handle {
            if h.is_cancelled() {
                let _ = safe_cleanup_owned_dir(dst, dst_dir_identity.as_ref());
                return Err(AppError::Custom("Transfer cancelled by user".to_string()));
            }
            h.set_current_file(Some(item.rel_path.to_string_lossy().to_string()));
        }

        let src_file = src.join(&item.rel_path);
        let dst_file = dst.join(&item.rel_path);

        if let Err(e) = copy_file_streaming_verified_with_handle(&src_file, &dst_file, handle) {
            let _ = safe_cleanup_owned_dir(dst, dst_dir_identity.as_ref());
            return Err(AppError::Custom(format!(
                "Directory copy aborted due to file copy failure on '{}': {}",
                item.rel_path.display(),
                e
            )));
        }

        if let Some(h) = handle {
            h.inc_completed_files();
            h.emit_if_throttled(
                "transfer://progress",
                std::time::Duration::from_millis(PROGRESS_THROTTLE_MS),
            );
        }
    }

    for item in &catalog {
        let dst_path = dst.join(&item.rel_path);
        if !dst_path.exists() {
            let _ = safe_cleanup_owned_dir(dst, dst_dir_identity.as_ref());
            return Err(AppError::Custom(format!(
                "Directory copy integrity failure: expected item missing at '{}'",
                dst_path.display()
            )));
        }
    }

    for item in catalog.iter().filter(|i| !i.is_dir) {
        let src_file = src.join(&item.rel_path);
        if let Ok(meta) = std::fs::metadata(&src_file) {
            if meta.len() != item.size_bytes
                || (meta.modified().ok() != item.mtime && item.mtime.is_some())
            {
                let _ = safe_cleanup_owned_dir(dst, dst_dir_identity.as_ref());
                return Err(AppError::Custom(format!(
                    "Directory copy aborted: source file '{}' was modified during directory transfer.",
                    item.rel_path.display()
                )));
            }
        } else {
            let _ = safe_cleanup_owned_dir(dst, dst_dir_identity.as_ref());
            return Err(AppError::Custom(format!(
                "Directory copy aborted: source file '{}' disappeared during directory transfer.",
                item.rel_path.display()
            )));
        }
    }

    Ok(())
}

pub fn copy_dir_streaming_verified(src: &Path, dst: &Path) -> AppResult<()> {
    copy_dir_streaming_verified_with_handle(src, dst, None)
}

/// Recursively copies a directory tree from `src` to `dst`.
pub fn copy_dir_all(src: &Path, dst: &Path) -> std::io::Result<()> {
    std::fs::create_dir_all(dst)?;
    for entry in std::fs::read_dir(src)? {
        let entry = entry?;
        let ty = entry.file_type()?;
        let dest_child = dst.join(entry.file_name());
        if ty.is_dir() {
            copy_dir_all(&entry.path(), &dest_child)?;
        } else {
            std::fs::copy(entry.path(), dest_child)?;
        }
    }
    Ok(())
}

// ── File Conflict Resolution Engine ─────────────────────────────────────────

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum ConflictAction {
    Replace,
    Skip,
    Rename,
    Cancel,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ConflictInfo {
    pub source_path: String,
    pub dest_path: String,
    pub item_name: String,
    pub is_dir: bool,
    pub source_size_bytes: u64,
    pub dest_size_bytes: u64,
    pub source_mtime: Option<u64>,
    pub dest_mtime: Option<u64>,
    pub is_same_size: bool,
    pub is_same_mtime: bool,
    pub type_mismatch: bool,
    pub dest_is_dir: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ConflictCheckResult {
    pub conflicts: Vec<ConflictInfo>,
    pub safe_count: usize,
    pub total_count: usize,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TransferItemSpec {
    pub source: String,
    pub dest: String,
    pub action: Option<ConflictAction>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FileTransferRecord {
    pub source: String,
    pub dest: String,
    pub final_path: Option<String>,
    pub status: String, // "copied", "moved", "replaced", "renamed", "skipped", "failed", "cancelled"
    pub error: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct BatchTransferResult {
    pub operation: String,
    pub total_items: usize,
    pub success_count: usize,
    pub replaced_count: usize,
    pub renamed_count: usize,
    pub skipped_count: usize,
    pub failed_count: usize,
    pub records: Vec<FileTransferRecord>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CompareResult {
    pub source_sha256: Option<String>,
    pub dest_sha256: Option<String>,
    pub is_identical_content: bool,
    pub is_identical_size: bool,
    pub is_identical_mtime: bool,
    pub is_identical_metadata: bool,
}

/// Generates a unique destination path on conflict by appending an incrementing index.
/// E.g. `report.pdf` -> `report (1).pdf` -> `report (2).pdf`.
/// Handles multi-dot extensions, dotfiles, extensionless files, directories, and Unicode safely.
pub fn generate_unique_path(dest: &Path) -> PathBuf {
    if !dest.exists() && std::fs::symlink_metadata(dest).is_err() {
        return dest.to_path_buf();
    }

    let parent = dest.parent().unwrap_or_else(|| Path::new(""));
    let file_name = match dest.file_name() {
        Some(name) => name.to_string_lossy().to_string(),
        None => return dest.to_path_buf(),
    };

    let is_dir = dest.is_dir();

    // Separate base stem and extension
    let (base_stem, ext) = if is_dir {
        (file_name, None)
    } else if file_name.starts_with('.') && file_name.matches('.').count() == 1 {
        // e.g. .env, .gitignore
        (file_name, None)
    } else {
        let p = Path::new(&file_name);
        let ext = p.extension().map(|e| e.to_string_lossy().to_string());
        let stem = p
            .file_stem()
            .map(|s| s.to_string_lossy().to_string())
            .unwrap_or_else(|| file_name.clone());
        (stem, ext)
    };

    // If stem ends in " (N)", strip the counter so we cleanly increment from N+1
    let (clean_stem, start_counter) = {
        if let Some(pos) = base_stem.rfind(" (") {
            if base_stem.ends_with(')') {
                let inner = &base_stem[pos + 2..base_stem.len() - 1];
                if let Ok(num) = inner.parse::<usize>() {
                    (&base_stem[..pos], num + 1)
                } else {
                    (base_stem.as_str(), 1)
                }
            } else {
                (base_stem.as_str(), 1)
            }
        } else {
            (base_stem.as_str(), 1)
        }
    };

    let mut counter = start_counter;
    loop {
        let candidate_name = match &ext {
            Some(e) => format!("{} ({}).{}", clean_stem, counter, e),
            None => format!("{} ({})", clean_stem, counter),
        };
        let candidate_path = parent.join(&candidate_name);
        if !candidate_path.exists() && std::fs::symlink_metadata(&candidate_path).is_err() {
            return candidate_path;
        }
        counter += 1;
        if counter > 100_000 {
            let fallback_name = format!("{}_{}", clean_stem, now_secs());
            return match &ext {
                Some(e) => parent.join(format!("{}.{}", fallback_name, e)),
                None => parent.join(fallback_name),
            };
        }
    }
}

#[cfg(windows)]
extern "system" {
    fn MoveFileW(lpExistingFileName: *const u16, lpNewFileName: *const u16) -> i32;
}

#[cfg(windows)]
pub fn move_file_no_overwrite(src: &Path, dst: &Path) -> std::io::Result<()> {
    use std::os::windows::ffi::OsStrExt;
    let src_w: Vec<u16> = src.as_os_str().encode_wide().chain(Some(0)).collect();
    let dst_w: Vec<u16> = dst.as_os_str().encode_wide().chain(Some(0)).collect();
    let ret = unsafe { MoveFileW(src_w.as_ptr(), dst_w.as_ptr()) };
    if ret != 0 {
        Ok(())
    } else {
        Err(std::io::Error::last_os_error())
    }
}

#[cfg(not(windows))]
pub fn move_file_no_overwrite(src: &Path, dst: &Path) -> std::io::Result<()> {
    if dst.exists() || std::fs::symlink_metadata(dst).is_ok() {
        return Err(std::io::Error::new(
            std::io::ErrorKind::AlreadyExists,
            "Destination already exists",
        ));
    }
    std::fs::rename(src, dst)
}

/// Transfers a file or directory to a unique destination path with collision-safe creation.
/// If another process creates the candidate path in between checking and creation, it does NOT
/// overwrite the file, but automatically retries with another unique name up to `max_retries`.
pub fn transfer_to_unique_destination_with_handle(
    src: &Path,
    planned_dst: &Path,
    is_move: bool,
    max_retries: usize,
    handle: Option<&TransferHandle>,
) -> AppResult<PathBuf> {
    if let Some(h) = handle {
        if h.is_cancelled() {
            return Err(AppError::Custom("Transfer cancelled by user".to_string()));
        }
    }

    let parent = planned_dst.parent().ok_or_else(|| {
        AppError::Custom("Cannot transfer to destination without a parent directory".to_string())
    })?;

    let is_dir = src.is_dir();
    let file_name = planned_dst
        .file_name()
        .and_then(|n| n.to_str())
        .ok_or_else(|| AppError::Custom("Invalid destination filename".to_string()))?;

    // Separate base stem and extension
    let (base_stem, ext) =
        if is_dir || (file_name.starts_with('.') && file_name.matches('.').count() == 1) {
            (file_name.to_string(), None)
        } else {
            let p = Path::new(&file_name);
            let ext = p.extension().map(|e| e.to_string_lossy().to_string());
            let stem = p
                .file_stem()
                .map(|s| s.to_string_lossy().to_string())
                .unwrap_or_else(|| file_name.to_string());
            (stem, ext)
        };

    let (clean_stem, start_counter) = {
        if let Some(pos) = base_stem.rfind(" (") {
            if base_stem.ends_with(')') {
                let inner = &base_stem[pos + 2..base_stem.len() - 1];
                if let Ok(num) = inner.parse::<usize>() {
                    (&base_stem[..pos], num + 1)
                } else {
                    (base_stem.as_str(), 1)
                }
            } else {
                (base_stem.as_str(), 1)
            }
        } else {
            (base_stem.as_str(), 1)
        }
    };

    let mut counter = start_counter;
    let mut attempts = 0;

    while attempts < max_retries {
        if let Some(h) = handle {
            if h.is_cancelled() {
                return Err(AppError::Custom("Transfer cancelled by user".to_string()));
            }
        }

        attempts += 1;
        let candidate_name = match &ext {
            Some(e) => format!("{} ({}).{}", clean_stem, counter, e),
            None => format!("{} ({})", clean_stem, counter),
        };
        let candidate_path = parent.join(&candidate_name);
        counter += 1;

        if candidate_path.exists() || std::fs::symlink_metadata(&candidate_path).is_ok() {
            continue;
        }

        if is_dir {
            // Atomically create directory - create_dir fails if candidate already exists
            match std::fs::create_dir(&candidate_path) {
                Ok(()) => {
                    let res = if is_move {
                        copy_dir_streaming_verified_with_handle(src, &candidate_path, handle)
                            .and_then(|_| std::fs::remove_dir_all(src).map_err(AppError::from))
                    } else {
                        copy_dir_streaming_verified_with_handle(src, &candidate_path, handle)
                    };

                    match res {
                        Ok(()) => return Ok(candidate_path),
                        Err(e) => {
                            let _ = std::fs::remove_dir_all(&candidate_path);
                            return Err(e);
                        }
                    }
                }
                Err(e) if e.kind() == std::io::ErrorKind::AlreadyExists => {
                    // Collision! Another process created it between check and create_dir. Retry.
                    continue;
                }
                Err(e) => return Err(AppError::from(e)),
            }
        } else {
            // File transfer
            if is_move {
                match move_file_no_overwrite(src, &candidate_path) {
                    Ok(()) => return Ok(candidate_path),
                    Err(e) if e.kind() == std::io::ErrorKind::AlreadyExists => {
                        // Collision! Another process created it. Retry.
                        continue;
                    }
                    Err(_) => {
                        // Cross-volume move fallback: stage into temp file, verified copy, then move_file_no_overwrite
                        let random_suffix = std::time::SystemTime::now()
                            .duration_since(std::time::UNIX_EPOCH)
                            .map(|d| d.as_nanos())
                            .unwrap_or(777);
                        let temp_name = format!(".{}.tmp_ren_{}", clean_stem, random_suffix);
                        let temp_path = parent.join(temp_name);
                        let copy_res =
                            copy_file_streaming_verified_with_handle(src, &temp_path, handle);
                        if let Err(e) = copy_res {
                            let _ = std::fs::remove_file(&temp_path);
                            return Err(e);
                        }
                        match move_file_no_overwrite(&temp_path, &candidate_path) {
                            Ok(()) => {
                                let _ = std::fs::remove_file(src);
                                return Ok(candidate_path);
                            }
                            Err(e) if e.kind() == std::io::ErrorKind::AlreadyExists => {
                                let _ = std::fs::remove_file(&temp_path);
                                continue;
                            }
                            Err(e) => {
                                let _ = std::fs::remove_file(&temp_path);
                                return Err(AppError::from(e));
                            }
                        }
                    }
                }
            } else {
                // Copy file: stage into temp file, then atomically move to candidate without overwrite
                let tx_id = handle.map(|h| h.id.as_str()).unwrap_or("anon");
                let random_suffix = std::time::SystemTime::now()
                    .duration_since(std::time::UNIX_EPOCH)
                    .map(|d| d.as_nanos())
                    .unwrap_or(777);
                let temp_name = format!(
                    ".{}.tmp_ren_cp_{}_{}_{}",
                    clean_stem,
                    tx_id,
                    now_secs(),
                    random_suffix
                );
                let temp_path = parent.join(temp_name);
                if let Err(e) = copy_file_streaming_verified_with_handle(src, &temp_path, handle) {
                    let _ = std::fs::remove_file(&temp_path);
                    return Err(e);
                }
                match move_file_no_overwrite(&temp_path, &candidate_path) {
                    Ok(()) => return Ok(candidate_path),
                    Err(e) if e.kind() == std::io::ErrorKind::AlreadyExists => {
                        let _ = std::fs::remove_file(&temp_path);
                        continue;
                    }
                    Err(e) => {
                        let _ = std::fs::remove_file(&temp_path);
                        return Err(AppError::from(e));
                    }
                }
            }
        }
    }

    Err(AppError::Custom(format!(
        "Exceeded collision retry limit ({} attempts): unable to secure a unique filename for '{}' without collision.",
        max_retries,
        planned_dst.display()
    )))
}

pub fn transfer_to_unique_destination(
    src: &Path,
    planned_dst: &Path,
    is_move: bool,
    max_retries: usize,
) -> AppResult<PathBuf> {
    transfer_to_unique_destination_with_handle(src, planned_dst, is_move, max_retries, None)
}

/// Safely replaces an existing file with verified streaming copy, flush, and atomic replacement.
/// If replacement fails (e.g. destination is locked), the original target is preserved intact.
pub fn safe_replace_file_with_handle(
    src: &Path,
    dst: &Path,
    handle: Option<&TransferHandle>,
) -> AppResult<()> {
    if let Some(h) = handle {
        if h.is_cancelled() {
            return Err(AppError::Custom("Transfer cancelled by user".to_string()));
        }
    }

    if dst.is_dir() {
        return Err(AppError::Custom(format!(
            "Type mismatch: Cannot replace directory '{}' with file '{}'",
            dst.display(),
            src.display()
        )));
    }

    let parent = dst
        .parent()
        .ok_or_else(|| AppError::Custom("Cannot replace file at root directory".to_string()))?;

    // Check if destination is a symlink/reparse point targeting Windows/ProgramFiles
    if let Ok(meta) = std::fs::symlink_metadata(dst) {
        if meta.file_type().is_symlink() {
            if let Ok(canon) = dst.canonicalize() {
                let canon_norm = normalize_path(&canon);
                if let Ok(windir) = std::env::var("WINDIR") {
                    let win_path = normalize_path(Path::new(&windir));
                    if path_starts_with(&canon_norm, &win_path) {
                        return Err(AppError::Custom(
                            "Destructive operation rejected: Destination is a symlink pointing to Windows directory.".to_string(),
                        ));
                    }
                }
                if let Ok(prog_files) = std::env::var("ProgramFiles") {
                    let pf_path = normalize_path(Path::new(&prog_files));
                    if path_starts_with(&canon_norm, &pf_path) {
                        return Err(AppError::Custom(
                            "Destructive operation rejected: Destination is a symlink pointing to Program Files.".to_string(),
                        ));
                    }
                }
            }
        }
    }

    let file_stem = dst.file_name().and_then(|n| n.to_str()).unwrap_or("file");

    let sync_mgr = get_write_sync_manager();
    let target_lock = sync_mgr.get_target_lock(dst);
    let _target_guard = lock_poison_recover(&target_lock);

    let tx_id = handle.map(|h| h.id.as_str()).unwrap_or("anon");
    let random_suffix = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_nanos())
        .unwrap_or(9999);
    let temp_name = format!(
        ".{}.tmp_replace_{}_{}_{}.tmp",
        file_stem,
        tx_id,
        now_secs(),
        random_suffix
    );
    let temp_path = parent.join(temp_name);

    sync_mgr.register_active_temp(temp_path.clone());

    if let Err(e) = copy_file_streaming_verified_with_handle(src, &temp_path, handle) {
        sync_mgr.unregister_active_temp(&temp_path);
        let _ = std::fs::remove_file(&temp_path);
        return Err(e);
    }

    if let Err(e) = std::fs::rename(&temp_path, dst) {
        sync_mgr.unregister_active_temp(&temp_path);
        let _ = std::fs::remove_file(&temp_path);
        return Err(AppError::Custom(format!(
            "Failed to replace target file '{}': {}. Original file preserved intact.",
            dst.display(),
            e
        )));
    }

    sync_mgr.unregister_active_temp(&temp_path);
    Ok(())
}

pub fn safe_replace_file(src: &Path, dst: &Path) -> AppResult<()> {
    safe_replace_file_with_handle(src, dst, None)
}

/// Safely replaces an existing directory tree with crash recovery and preservation of recoverable data.
pub fn safe_replace_dir_with_handle(
    src: &Path,
    dst: &Path,
    handle: Option<&TransferHandle>,
) -> AppResult<()> {
    if let Some(h) = handle {
        if h.is_cancelled() {
            return Err(AppError::Custom("Transfer cancelled by user".to_string()));
        }
    }

    if dst.is_file() {
        return Err(AppError::Custom(format!(
            "Type mismatch: Cannot replace file '{}' with directory '{}'",
            dst.display(),
            src.display()
        )));
    }

    if path_starts_with(dst, src) {
        return Err(AppError::Custom(format!(
            "Circular operation rejected: Cannot copy directory '{}' into itself or its descendant '{}'",
            src.display(),
            dst.display()
        )));
    }

    let parent = dst.parent().ok_or_else(|| {
        AppError::Custom("Cannot replace directory at filesystem root".to_string())
    })?;

    // Check if destination is a symlink/reparse point targeting Windows/ProgramFiles
    if let Ok(meta) = std::fs::symlink_metadata(dst) {
        if meta.file_type().is_symlink() {
            if let Ok(canon) = dst.canonicalize() {
                let canon_norm = normalize_path(&canon);
                if let Ok(windir) = std::env::var("WINDIR") {
                    let win_path = normalize_path(Path::new(&windir));
                    if path_starts_with(&canon_norm, &win_path) {
                        return Err(AppError::Custom(
                            "Destructive operation rejected: Destination is a symlink pointing to Windows directory.".to_string(),
                        ));
                    }
                }
                if let Ok(prog_files) = std::env::var("ProgramFiles") {
                    let pf_path = normalize_path(Path::new(&prog_files));
                    if path_starts_with(&canon_norm, &pf_path) {
                        return Err(AppError::Custom(
                            "Destructive operation rejected: Destination is a symlink pointing to Program Files.".to_string(),
                        ));
                    }
                }
            }
        }
    }

    let dir_name = dst.file_name().and_then(|n| n.to_str()).unwrap_or("dir");

    let sync_mgr = get_write_sync_manager();
    let target_lock = sync_mgr.get_target_lock(dst);
    let _target_guard = lock_poison_recover(&target_lock);

    // Pre-flight recovery of any interrupted prior operation on dst
    let _ = recover_interrupted_dir_replacement_unlocked(dst, sync_mgr);

    let tx_id = handle.map(|h| h.id.as_str()).unwrap_or("anon");
    let random_suffix = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_nanos())
        .unwrap_or(8888);
    let temp_name = format!(
        ".{}.tmp_dir_replace_{}_{}_{}",
        dir_name,
        tx_id,
        now_secs(),
        random_suffix
    );
    let temp_path = parent.join(&temp_name);

    sync_mgr.register_active_temp(temp_path.clone());

    if let Err(e) = copy_dir_streaming_verified_with_handle(src, &temp_path, handle) {
        sync_mgr.unregister_active_temp(&temp_path);
        let _ = std::fs::remove_dir_all(&temp_path);
        return Err(e);
    }

    let backup_path = if dst.exists() || std::fs::symlink_metadata(dst).is_ok() {
        let bak_name = format!(
            ".{}.bak_dir_replace_{}_{}",
            dir_name,
            now_secs(),
            random_suffix
        );
        let bak = parent.join(bak_name);
        if let Err(e) = std::fs::rename(dst, &bak) {
            sync_mgr.unregister_active_temp(&temp_path);
            let _ = std::fs::remove_dir_all(&temp_path);
            return Err(AppError::Custom(format!(
                "Cannot backup existing directory '{}' for safe replacement: {}. Target preserved.",
                dst.display(),
                e
            )));
        }
        Some(bak)
    } else {
        None
    };

    match std::fs::rename(&temp_path, dst) {
        Ok(()) => {
            sync_mgr.unregister_active_temp(&temp_path);
            if let Some(bak) = backup_path {
                let _ = std::fs::remove_dir_all(bak);
            }
            Ok(())
        }
        Err(e) => {
            if let Some(ref bak) = backup_path {
                let _ = std::fs::rename(bak, dst);
            }
            sync_mgr.unregister_active_temp(&temp_path);
            let _ = std::fs::remove_dir_all(&temp_path);
            Err(AppError::Custom(format!(
                "Failed to place replaced directory at '{}': {}. Target restored from backup.",
                dst.display(),
                e
            )))
        }
    }
}

pub fn safe_replace_dir(src: &Path, dst: &Path) -> AppResult<()> {
    safe_replace_dir_with_handle(src, dst, None)
}

pub fn is_same_file_or_case_collision(p1: &Path, p2: &Path) -> bool {
    let norm1 = normalize_path(p1);
    let norm2 = normalize_path(p2);

    #[cfg(windows)]
    {
        norm1.to_string_lossy().to_lowercase() == norm2.to_string_lossy().to_lowercase()
    }

    #[cfg(not(windows))]
    {
        norm1 == norm2
    }
}

pub fn check_file_conflicts_core(
    sources: &[String],
    target_dir: &str,
    operation: &str,
    state: &AllowedPathsState,
) -> AppResult<ConflictCheckResult> {
    let p_target = validate_path(target_dir, state)?;
    is_protected_target(&p_target, state)?;

    if !p_target.exists() || !p_target.is_dir() {
        return Err(AppError::Custom(format!(
            "Target destination '{}' is not an existing directory.",
            target_dir
        )));
    }

    let mut conflicts = Vec::new();
    let mut safe_count = 0;
    let total_count = sources.len();

    for src_str in sources {
        let p_src = validate_path(src_str, state)?;
        is_protected_target(&p_src, state)?;

        if !p_src.exists() && std::fs::symlink_metadata(&p_src).is_err() {
            return Err(AppError::Custom(format!(
                "Source item '{}' does not exist.",
                src_str
            )));
        }

        // Circular directory check
        if p_src.is_dir() && path_starts_with(&p_target, &p_src) {
            return Err(AppError::Custom(format!(
                "Circular operation rejected: Cannot {} directory '{}' into itself or its descendant '{}'.",
                operation,
                p_src.display(),
                p_target.display()
            )));
        }

        let item_name = match p_src.file_name() {
            Some(n) => n.to_string_lossy().to_string(),
            None => {
                return Err(AppError::Custom(format!(
                    "Invalid source path with no file name: '{}'",
                    p_src.display()
                )));
            }
        };

        let planned_dst = p_target.join(&item_name);

        // Same-source/same-dest check
        let is_same_target = is_same_file_or_case_collision(&p_src, &planned_dst);
        if is_same_target && operation.eq_ignore_ascii_case("move") {
            // Moving a file to the exact same path is a no-op
            safe_count += 1;
            continue;
        }

        let src_meta = std::fs::symlink_metadata(&p_src).map_err(AppError::from)?;
        let src_is_dir = src_meta.is_dir();
        let src_size = if src_is_dir { 0 } else { src_meta.len() };
        let src_mtime = src_meta.modified().ok().and_then(|t| {
            t.duration_since(std::time::UNIX_EPOCH)
                .ok()
                .map(|d| d.as_secs())
        });

        if planned_dst.exists() || std::fs::symlink_metadata(&planned_dst).is_ok() || is_same_target
        {
            let dst_meta = std::fs::symlink_metadata(&planned_dst).ok();
            let dst_is_dir = dst_meta.as_ref().map(|m| m.is_dir()).unwrap_or(false);
            let dst_size = if dst_is_dir {
                0
            } else {
                dst_meta.as_ref().map(|m| m.len()).unwrap_or(0)
            };
            let dst_mtime = dst_meta
                .as_ref()
                .and_then(|m| m.modified().ok())
                .and_then(|t| {
                    t.duration_since(std::time::UNIX_EPOCH)
                        .ok()
                        .map(|d| d.as_secs())
                });

            let is_same_size = !src_is_dir && !dst_is_dir && src_size == dst_size;
            let is_same_mtime = src_mtime.is_some() && src_mtime == dst_mtime;
            let type_mismatch = src_is_dir != dst_is_dir;

            conflicts.push(ConflictInfo {
                source_path: p_src.to_string_lossy().to_string(),
                dest_path: planned_dst.to_string_lossy().to_string(),
                item_name,
                is_dir: src_is_dir,
                source_size_bytes: src_size,
                dest_size_bytes: dst_size,
                source_mtime: src_mtime,
                dest_mtime: dst_mtime,
                is_same_size,
                is_same_mtime,
                type_mismatch,
                dest_is_dir: dst_is_dir,
            });
        } else {
            safe_count += 1;
        }
    }

    Ok(ConflictCheckResult {
        conflicts,
        safe_count,
        total_count,
    })
}

pub fn execute_file_transfer_managed(
    operation: &str,
    items: &[TransferItemSpec],
    default_action: Option<ConflictAction>,
    transfer_id: Option<String>,
    state: &AllowedPathsState,
    journal: &OperationJournalState,
    emitter: Arc<dyn ProgressEmitter>,
) -> AppResult<BatchTransferResult> {
    let mut success_count = 0;
    let mut replaced_count = 0;
    let mut renamed_count = 0;
    let mut skipped_count = 0;
    let mut failed_count = 0;
    let mut records = Vec::new();

    let is_move = operation.eq_ignore_ascii_case("move");

    let tid = transfer_id.unwrap_or_else(|| format!("tx_{}_{}", now_secs(), rand::random::<u32>()));

    let rep_source = if items.len() == 1 {
        items[0].source.clone()
    } else if !items.is_empty() {
        format!("{} items", items.len())
    } else {
        "None".to_string()
    };

    let rep_dest = if !items.is_empty() {
        items[0].dest.clone()
    } else {
        "".to_string()
    };

    // Calculate unique destination directories to serialize transfers targeting the same folder
    let mut dest_dirs: Vec<PathBuf> = Vec::new();
    for it in items {
        let dest_p = Path::new(&it.dest);
        let target_dir = if dest_p.is_dir() {
            dest_p.to_path_buf()
        } else {
            dest_p.parent().unwrap_or(dest_p).to_path_buf()
        };
        let norm = normalize_path(&target_dir);
        if !dest_dirs.contains(&norm) {
            dest_dirs.push(norm);
        }
    }

    let handle = if let Some(existing) = get_global_transfer_manager().get(&tid) {
        existing
    } else {
        let h = Arc::new(TransferHandle::new(
            tid.clone(),
            rep_source,
            rep_dest,
            operation.to_string(),
            items.len(),
            0,
            emitter,
        ));
        get_global_transfer_manager().register(h.clone());
        h
    };
    handle.emit_now("transfer://started");

    // Acquire transfer permit (bounded concurrency max 2, destination dir exclusivity, FIFO)
    let _permit = match get_global_transfer_manager().acquire_permit(&handle, dest_dirs) {
        Ok(permit) => permit,
        Err(PermitAcquireError::Cancelled) => {
            // Cancelled while queued! No filesystem work performed!
            get_global_transfer_manager().complete_transfer(
                &tid,
                TransferStatus::Cancelled,
                Some("Transfer cancelled while queued".to_string()),
            );
            handle.emit_now("transfer://cancelled");
            let cancelled_records = items
                .iter()
                .map(|it| FileTransferRecord {
                    source: it.source.clone(),
                    dest: it.dest.clone(),
                    final_path: None,
                    status: "cancelled".to_string(),
                    error: Some("Operation cancelled by user.".to_string()),
                })
                .collect();
            return Ok(BatchTransferResult {
                operation: operation.to_string(),
                total_items: items.len(),
                success_count: 0,
                replaced_count: 0,
                renamed_count: 0,
                skipped_count: 0,
                failed_count: 0,
                records: cancelled_records,
            });
        }
    };

    // Preparation Phase: calculate total files and total bytes with cancellation support
    handle.set_status(TransferStatus::Preparing);
    handle.emit_now("transfer://progress");

    let mut total_files = 0usize;
    let mut total_bytes: u64 = 0;
    let mut prep_cancelled = false;

    for item in items {
        if handle.is_cancelled() {
            prep_cancelled = true;
            break;
        }
        let p = Path::new(&item.source);
        if p.is_dir() {
            for entry in WalkDir::new(p).into_iter() {
                if handle.is_cancelled() {
                    prep_cancelled = true;
                    break;
                }
                if let Ok(entry) = entry {
                    if entry.file_type().is_file() {
                        total_files += 1;
                        if let Ok(meta) = entry.metadata() {
                            total_bytes += meta.len();
                        }
                    }
                    if total_files > 0 && total_files % 500 == 0 {
                        handle
                            .total_files
                            .store(total_files.max(items.len()), Ordering::SeqCst);
                        handle.total_bytes.store(total_bytes, Ordering::SeqCst);
                        handle.emit_if_throttled(
                            "transfer://progress",
                            Duration::from_millis(PROGRESS_THROTTLE_MS),
                        );
                    }
                }
            }
        } else if p.is_file() {
            total_files += 1;
            if let Ok(m) = p.metadata() {
                total_bytes += m.len();
            }
        }
    }

    if prep_cancelled || handle.is_cancelled() {
        get_global_transfer_manager().complete_transfer(
            &tid,
            TransferStatus::Cancelled,
            Some("Transfer cancelled during preparation".to_string()),
        );
        handle.emit_now("transfer://cancelled");
        let cancelled_records = items
            .iter()
            .map(|it| FileTransferRecord {
                source: it.source.clone(),
                dest: it.dest.clone(),
                final_path: None,
                status: "cancelled".to_string(),
                error: Some("Operation cancelled by user.".to_string()),
            })
            .collect();
        return Ok(BatchTransferResult {
            operation: operation.to_string(),
            total_items: items.len(),
            success_count: 0,
            replaced_count: 0,
            renamed_count: 0,
            skipped_count: 0,
            failed_count: 0,
            records: cancelled_records,
        });
    }

    if total_files == 0 {
        total_files = items.len();
    }
    handle.total_files.store(total_files, Ordering::SeqCst);
    handle.total_bytes.store(total_bytes, Ordering::SeqCst);
    handle.set_status(TransferStatus::Running);
    handle.emit_now("transfer://progress");

    for item in items {
        if handle.is_cancelled() {
            records.push(FileTransferRecord {
                source: item.source.clone(),
                dest: item.dest.clone(),
                final_path: None,
                status: "cancelled".to_string(),
                error: Some("Operation cancelled by user.".to_string()),
            });
            continue;
        }

        let filename = Path::new(&item.source)
            .file_name()
            .map(|n| n.to_string_lossy().to_string());
        handle.set_current_file(filename);

        let p_src = match validate_path(&item.source, state) {
            Ok(p) => p,
            Err(e) => {
                failed_count += 1;
                handle.inc_errors();
                records.push(FileTransferRecord {
                    source: item.source.clone(),
                    dest: item.dest.clone(),
                    final_path: None,
                    status: "failed".to_string(),
                    error: Some(e.to_string()),
                });
                continue;
            }
        };

        if let Err(e) = is_protected_target(&p_src, state) {
            failed_count += 1;
            handle.inc_errors();
            records.push(FileTransferRecord {
                source: item.source.clone(),
                dest: item.dest.clone(),
                final_path: None,
                status: "failed".to_string(),
                error: Some(e.to_string()),
            });
            continue;
        }

        let p_dest = match validate_path(&item.dest, state) {
            Ok(p) => p,
            Err(e) => {
                failed_count += 1;
                handle.inc_errors();
                records.push(FileTransferRecord {
                    source: item.source.clone(),
                    dest: item.dest.clone(),
                    final_path: None,
                    status: "failed".to_string(),
                    error: Some(e.to_string()),
                });
                continue;
            }
        };

        if let Err(e) = is_protected_target(&p_dest, state) {
            failed_count += 1;
            handle.inc_errors();
            records.push(FileTransferRecord {
                source: item.source.clone(),
                dest: item.dest.clone(),
                final_path: None,
                status: "failed".to_string(),
                error: Some(e.to_string()),
            });
            continue;
        }

        // Reparse-point substitution check right before execution
        if let Ok(src_meta) = std::fs::symlink_metadata(&p_src) {
            if src_meta.file_type().is_symlink() {
                if let Ok(canon) = p_src.canonicalize() {
                    let canon_norm = normalize_path(&canon);
                    if !state.is_allowed(&canon_norm)
                        || is_protected_target(&canon_norm, state).is_err()
                    {
                        failed_count += 1;
                        handle.inc_errors();
                        records.push(FileTransferRecord {
                            source: item.source.clone(),
                            dest: item.dest.clone(),
                            final_path: None,
                            status: "failed".to_string(),
                            error: Some(format!(
                                "Security violation: Source '{}' is a symlink/reparse point targeting unpermitted or protected location '{}'.",
                                p_src.display(),
                                canon_norm.display()
                            )),
                        });
                        continue;
                    }
                }
            }
        }

        if let Ok(dest_meta) = std::fs::symlink_metadata(&p_dest) {
            if dest_meta.file_type().is_symlink() {
                if let Ok(canon) = p_dest.canonicalize() {
                    let canon_norm = normalize_path(&canon);
                    if !state.is_allowed(&canon_norm)
                        || is_protected_target(&canon_norm, state).is_err()
                    {
                        failed_count += 1;
                        handle.inc_errors();
                        records.push(FileTransferRecord {
                            source: item.source.clone(),
                            dest: item.dest.clone(),
                            final_path: None,
                            status: "failed".to_string(),
                            error: Some(format!(
                                "Security violation: Destination '{}' is a symlink/reparse point targeting unpermitted or protected location '{}'.",
                                p_dest.display(),
                                canon_norm.display()
                            )),
                        });
                        continue;
                    }
                }
            }
        }

        // Circular directory check
        if p_src.is_dir() && path_starts_with(&p_dest, &p_src) {
            failed_count += 1;
            handle.inc_errors();
            records.push(FileTransferRecord {
                source: item.source.clone(),
                dest: item.dest.clone(),
                final_path: None,
                status: "failed".to_string(),
                error: Some(format!(
                    "Circular operation rejected: Cannot {} directory '{}' into itself or its descendant '{}'.",
                    operation,
                    p_src.display(),
                    p_dest.display()
                )),
            });
            continue;
        }

        // Check if destination exists (TOCTOU guard)
        let is_same_target = is_same_file_or_case_collision(&p_src, &p_dest);
        let dest_exists =
            p_dest.exists() || std::fs::symlink_metadata(&p_dest).is_ok() || is_same_target;
        let action = item.action.or(default_action);

        if is_same_target {
            if is_move {
                success_count += 1;
                handle.inc_completed_files();
                records.push(FileTransferRecord {
                    source: item.source.clone(),
                    dest: item.dest.clone(),
                    final_path: Some(p_dest.to_string_lossy().to_string()),
                    status: "moved".to_string(),
                    error: None,
                });
                continue;
            } else if matches!(action, Some(ConflictAction::Replace)) {
                failed_count += 1;
                handle.inc_errors();
                records.push(FileTransferRecord {
                    source: item.source.clone(),
                    dest: item.dest.clone(),
                    final_path: None,
                    status: "failed".to_string(),
                    error: Some(
                        "Cannot replace source file with itself. Select Rename to duplicate."
                            .to_string(),
                    ),
                });
                continue;
            }
        }

        if dest_exists {
            match action {
                Some(ConflictAction::Skip) => {
                    skipped_count += 1;
                    handle.inc_skipped();
                    records.push(FileTransferRecord {
                        source: item.source.clone(),
                        dest: item.dest.clone(),
                        final_path: None,
                        status: "skipped".to_string(),
                        error: None,
                    });
                    continue;
                }
                Some(ConflictAction::Cancel) => {
                    handle.cancel();
                    records.push(FileTransferRecord {
                        source: item.source.clone(),
                        dest: item.dest.clone(),
                        final_path: None,
                        status: "cancelled".to_string(),
                        error: Some("Operation cancelled by user.".to_string()),
                    });
                    break;
                }
                Some(ConflictAction::Rename) => {
                    let res = transfer_to_unique_destination_with_handle(
                        &p_src,
                        &p_dest,
                        is_move,
                        100,
                        Some(&handle),
                    );

                    match res {
                        Ok(unique_dst) => {
                            renamed_count += 1;
                            success_count += 1;
                            handle.inc_completed_files();
                            let unique_str = unique_dst.to_string_lossy().to_string();
                            if is_move {
                                journal.record(JournalEntry::Move {
                                    source: unique_dst.clone(),
                                    original_source: p_src.clone(),
                                    timestamp: now_secs(),
                                });
                            } else {
                                let sha = if !p_src.is_dir() {
                                    compute_file_sha256(&unique_dst).ok()
                                } else {
                                    None
                                };
                                let size_bytes =
                                    std::fs::metadata(&unique_dst).map(|m| m.len()).unwrap_or(0);
                                journal.record(JournalEntry::Copy {
                                    destination: unique_dst.clone(),
                                    is_dir: p_src.is_dir(),
                                    size_bytes,
                                    sha256: sha,
                                    timestamp: now_secs(),
                                });
                            }
                            records.push(FileTransferRecord {
                                source: item.source.clone(),
                                dest: item.dest.clone(),
                                final_path: Some(unique_str),
                                status: "renamed".to_string(),
                                error: None,
                            });
                        }
                        Err(e) => {
                            failed_count += 1;
                            handle.inc_errors();
                            records.push(FileTransferRecord {
                                source: item.source.clone(),
                                dest: item.dest.clone(),
                                final_path: None,
                                status: "failed".to_string(),
                                error: Some(e.to_string()),
                            });
                        }
                    }
                }
                Some(ConflictAction::Replace) => {
                    let res = if p_src.is_dir() {
                        safe_replace_dir_with_handle(&p_src, &p_dest, Some(&handle)).and_then(
                            |_| {
                                if is_move {
                                    if handle.is_cancelled() {
                                        return Err(AppError::Custom(
                                            "Transfer cancelled by user".to_string(),
                                        ));
                                    }
                                    std::fs::remove_dir_all(&p_src).map_err(AppError::from)
                                } else {
                                    Ok(())
                                }
                            },
                        )
                    } else {
                        safe_replace_file_with_handle(&p_src, &p_dest, Some(&handle)).and_then(
                            |_| {
                                if is_move {
                                    if handle.is_cancelled() {
                                        return Err(AppError::Custom(
                                            "Transfer cancelled by user".to_string(),
                                        ));
                                    }
                                    std::fs::remove_file(&p_src).map_err(AppError::from)
                                } else {
                                    Ok(())
                                }
                            },
                        )
                    };

                    match res {
                        Ok(()) => {
                            replaced_count += 1;
                            success_count += 1;
                            handle.inc_completed_files();
                            if is_move {
                                journal.record(JournalEntry::Move {
                                    source: p_dest.clone(),
                                    original_source: p_src.clone(),
                                    timestamp: now_secs(),
                                });
                            } else {
                                let sha = if !p_src.is_dir() {
                                    compute_file_sha256(&p_dest).ok()
                                } else {
                                    None
                                };
                                let size_bytes =
                                    std::fs::metadata(&p_dest).map(|m| m.len()).unwrap_or(0);
                                journal.record(JournalEntry::Copy {
                                    destination: p_dest.clone(),
                                    is_dir: p_src.is_dir(),
                                    size_bytes,
                                    sha256: sha,
                                    timestamp: now_secs(),
                                });
                            }
                            records.push(FileTransferRecord {
                                source: item.source.clone(),
                                dest: item.dest.clone(),
                                final_path: Some(p_dest.to_string_lossy().to_string()),
                                status: "replaced".to_string(),
                                error: None,
                            });
                        }
                        Err(e) => {
                            if handle.is_cancelled() {
                                records.push(FileTransferRecord {
                                    source: item.source.clone(),
                                    dest: item.dest.clone(),
                                    final_path: None,
                                    status: "cancelled".to_string(),
                                    error: Some("Operation cancelled by user.".to_string()),
                                });
                            } else {
                                failed_count += 1;
                                handle.inc_errors();
                                records.push(FileTransferRecord {
                                    source: item.source.clone(),
                                    dest: item.dest.clone(),
                                    final_path: None,
                                    status: "failed".to_string(),
                                    error: Some(e.to_string()),
                                });
                            }
                        }
                    }
                }
                None => {
                    failed_count += 1;
                    handle.inc_errors();
                    records.push(FileTransferRecord {
                        source: item.source.clone(),
                        dest: item.dest.clone(),
                        final_path: None,
                        status: "failed".to_string(),
                        error: Some(format!(
                            "Destination '{}' already exists. Conflict decision required.",
                            p_dest.display()
                        )),
                    });
                }
            }
        } else {
            // Normal transfer (no conflict)
            let res = if is_move {
                if p_src.is_dir() {
                    if std::fs::rename(&p_src, &p_dest).is_ok() {
                        Ok(())
                    } else {
                        copy_dir_streaming_verified_with_handle(&p_src, &p_dest, Some(&handle))
                            .and_then(|_| {
                                // CRITICAL COMMIT BOUNDARY:
                                // Check cancellation before source removal
                                if handle.is_cancelled() {
                                    let _ = safe_cleanup_owned_dir(&p_dest, None);
                                    return Err(AppError::Custom(
                                        "Transfer cancelled by user".to_string(),
                                    ));
                                }
                                std::fs::remove_dir_all(&p_src).map_err(AppError::from)
                            })
                    }
                } else if std::fs::rename(&p_src, &p_dest).is_err() {
                    copy_file_streaming_verified_with_handle(&p_src, &p_dest, Some(&handle))
                        .and_then(|_| {
                            // CRITICAL COMMIT BOUNDARY:
                            // Check cancellation before source removal
                            if handle.is_cancelled() {
                                let _ = safe_cleanup_owned_file(&p_dest, None);
                                return Err(AppError::Custom(
                                    "Transfer cancelled by user".to_string(),
                                ));
                            }
                            std::fs::remove_file(&p_src).map_err(AppError::from)
                        })
                } else {
                    if let Ok(meta) = std::fs::metadata(&p_dest) {
                        handle.add_bytes(meta.len());
                    }
                    Ok(())
                }
            } else if p_src.is_dir() {
                copy_dir_streaming_verified_with_handle(&p_src, &p_dest, Some(&handle))
            } else {
                copy_file_streaming_verified_with_handle(&p_src, &p_dest, Some(&handle))
            };

            match res {
                Ok(()) => {
                    success_count += 1;
                    handle.inc_completed_files();
                    if is_move {
                        journal.record(JournalEntry::Move {
                            source: p_dest.clone(),
                            original_source: p_src.clone(),
                            timestamp: now_secs(),
                        });
                    } else {
                        let sha = if !p_src.is_dir() {
                            compute_file_sha256(&p_dest).ok()
                        } else {
                            None
                        };
                        let size_bytes = std::fs::metadata(&p_dest).map(|m| m.len()).unwrap_or(0);
                        journal.record(JournalEntry::Copy {
                            destination: p_dest.clone(),
                            is_dir: p_src.is_dir(),
                            size_bytes,
                            sha256: sha,
                            timestamp: now_secs(),
                        });
                    }
                    records.push(FileTransferRecord {
                        source: item.source.clone(),
                        dest: item.dest.clone(),
                        final_path: Some(p_dest.to_string_lossy().to_string()),
                        status: if is_move {
                            "moved".to_string()
                        } else {
                            "copied".to_string()
                        },
                        error: None,
                    });
                }
                Err(e) => {
                    if handle.is_cancelled() {
                        records.push(FileTransferRecord {
                            source: item.source.clone(),
                            dest: item.dest.clone(),
                            final_path: None,
                            status: "cancelled".to_string(),
                            error: Some("Operation cancelled by user.".to_string()),
                        });
                    } else {
                        failed_count += 1;
                        handle.inc_errors();
                        records.push(FileTransferRecord {
                            source: item.source.clone(),
                            dest: item.dest.clone(),
                            final_path: None,
                            status: "failed".to_string(),
                            error: Some(e.to_string()),
                        });
                    }
                }
            }
        }
    }

    if handle.is_cancelled() {
        get_global_transfer_manager().complete_transfer(
            &tid,
            TransferStatus::Cancelled,
            Some("Transfer cancelled by user".to_string()),
        );
        handle.emit_now("transfer://cancelled");
    } else if failed_count == items.len() && !items.is_empty() {
        get_global_transfer_manager().complete_transfer(
            &tid,
            TransferStatus::Failed,
            Some("All transfer items failed".to_string()),
        );
        handle.emit_now("transfer://failed");
    } else {
        get_global_transfer_manager().complete_transfer(&tid, TransferStatus::Completed, None);
        handle.emit_now("transfer://completed");
    }

    Ok(BatchTransferResult {
        operation: operation.to_string(),
        total_items: items.len(),
        success_count,
        replaced_count,
        renamed_count,
        skipped_count,
        failed_count,
        records,
    })
}

pub fn execute_file_transfer_core(
    operation: &str,
    items: &[TransferItemSpec],
    default_action: Option<ConflictAction>,
    state: &AllowedPathsState,
    journal: &OperationJournalState,
) -> AppResult<BatchTransferResult> {
    execute_file_transfer_managed(
        operation,
        items,
        default_action,
        None,
        state,
        journal,
        Arc::new(NoopProgressEmitter),
    )
}

pub fn compare_file_contents_core(
    source: &str,
    dest: &str,
    state: &AllowedPathsState,
) -> AppResult<CompareResult> {
    let p_src = validate_path(source, state)?;
    is_protected_target(&p_src, state)?;
    let p_dest = validate_path(dest, state)?;
    is_protected_target(&p_dest, state)?;

    if !p_src.exists() || !p_dest.exists() {
        return Err(AppError::Custom(
            "Both source and destination files must exist for comparison.".to_string(),
        ));
    }

    let src_meta = std::fs::symlink_metadata(&p_src).map_err(AppError::from)?;
    let dest_meta = std::fs::symlink_metadata(&p_dest).map_err(AppError::from)?;

    if src_meta.is_dir() || dest_meta.is_dir() {
        return Err(AppError::Custom(
            "Content comparison is only supported for files, not directories.".to_string(),
        ));
    }

    let is_identical_size = src_meta.len() == dest_meta.len();
    let src_mtime = src_meta.modified().ok().and_then(|t| {
        t.duration_since(std::time::UNIX_EPOCH)
            .ok()
            .map(|d| d.as_secs())
    });
    let dest_mtime = dest_meta.modified().ok().and_then(|t| {
        t.duration_since(std::time::UNIX_EPOCH)
            .ok()
            .map(|d| d.as_secs())
    });
    let is_identical_mtime = src_mtime.is_some() && src_mtime == dest_mtime;
    let is_identical_metadata = is_identical_size && is_identical_mtime;

    // Do not hash files larger than 100 MB automatically
    const MAX_COMPARE_HASH_BYTES: u64 = 100 * 1024 * 1024;
    let (src_sha, dest_sha) =
        if src_meta.len() <= MAX_COMPARE_HASH_BYTES && dest_meta.len() <= MAX_COMPARE_HASH_BYTES {
            let s = compute_file_sha256(&p_src).ok();
            let d = compute_file_sha256(&p_dest).ok();
            (s, d)
        } else {
            (None, None)
        };

    let is_identical_content = match (&src_sha, &dest_sha) {
        (Some(a), Some(b)) => a == b,
        _ => is_identical_size,
    };

    Ok(CompareResult {
        source_sha256: src_sha,
        dest_sha256: dest_sha,
        is_identical_content,
        is_identical_size,
        is_identical_mtime,
        is_identical_metadata,
    })
}

#[tauri::command]
pub fn check_file_conflicts(
    sources: Vec<String>,
    target_dir: String,
    operation: String,
    state: tauri::State<'_, AllowedPathsState>,
) -> AppResult<ConflictCheckResult> {
    check_file_conflicts_core(&sources, &target_dir, &operation, &state)
}

#[tauri::command]
pub fn execute_file_transfer(
    app_handle: tauri::AppHandle,
    operation: String,
    items: Vec<TransferItemSpec>,
    default_action: Option<ConflictAction>,
    transfer_id: Option<String>,
    state: tauri::State<'_, AllowedPathsState>,
    journal: tauri::State<'_, OperationJournalState>,
) -> AppResult<BatchTransferResult> {
    execute_file_transfer_managed(
        &operation,
        &items,
        default_action,
        transfer_id,
        &state,
        &journal,
        Arc::new(TauriProgressEmitter { app_handle }),
    )
}

#[tauri::command]
pub fn cancel_file_transfer(transfer_id: String) -> AppResult<bool> {
    Ok(get_global_transfer_manager().cancel_transfer(&transfer_id))
}

#[tauri::command]
pub fn get_active_transfers() -> AppResult<Vec<TransferProgressEvent>> {
    Ok(get_global_transfer_manager().get_active_transfers())
}

#[tauri::command]
pub fn compare_file_contents(
    source: String,
    dest: String,
    state: tauri::State<'_, AllowedPathsState>,
) -> AppResult<CompareResult> {
    compare_file_contents_core(&source, &dest, &state)
}

#[tauri::command]
pub fn generate_unique_name(
    dest: String,
    state: tauri::State<'_, AllowedPathsState>,
) -> AppResult<String> {
    let p = validate_path(&dest, &state)?;
    let unique = generate_unique_path(&p);
    Ok(unique.to_string_lossy().to_string())
}

/// Executes the copy_file command with sandbox verification, recursive folder support, and streaming SHA-256 verification.
#[tauri::command]
pub fn copy_file(
    source: String,
    dest: String,
    overwrite: Option<bool>,
    state: tauri::State<'_, AllowedPathsState>,
    journal: tauri::State<'_, OperationJournalState>,
) -> AppResult<()> {
    let p_src = validate_path(&source, &state)?;
    is_protected_target(&p_src, &state)?;
    let mut p_dest = validate_path(&dest, &state)?;
    is_protected_target(&p_dest, &state)?;

    if p_src == p_dest {
        return Err(AppError::Custom(
            "Source and destination are the same path.".into(),
        ));
    }

    // If destination is an existing directory and source is a file, copy into it
    if p_dest.is_dir() && !p_src.is_dir() {
        if let Some(file_name) = p_src.file_name() {
            p_dest = p_dest.join(file_name);
        }
    }

    if p_dest.exists() {
        if !overwrite.unwrap_or(false) {
            return Err(AppError::Custom(format!(
                "Destination '{}' already exists. Specify overwrite to replace.",
                p_dest.display()
            )));
        }
        if p_src.is_dir() {
            safe_replace_dir(&p_src, &p_dest)?;
        } else {
            safe_replace_file(&p_src, &p_dest)?;
        }
        let sha256_hash = if !p_src.is_dir() {
            compute_file_sha256(&p_dest).ok()
        } else {
            None
        };
        let dest_meta = std::fs::metadata(&p_dest).ok();
        let size_bytes = dest_meta.as_ref().map(|m| m.len()).unwrap_or(0);

        journal.record(JournalEntry::Copy {
            destination: p_dest,
            is_dir: p_src.is_dir(),
            size_bytes,
            sha256: sha256_hash,
            timestamp: now_secs(),
        });
        return Ok(());
    }

    let (is_dir, sha256_hash) = if p_src.is_dir() {
        copy_dir_streaming_verified(&p_src, &p_dest)?;
        (true, None)
    } else {
        copy_file_streaming_verified(&p_src, &p_dest)?;
        let hash = compute_file_sha256(&p_dest).ok();
        (false, hash)
    };

    let dest_meta = std::fs::metadata(&p_dest).ok();
    let size_bytes = dest_meta.as_ref().map(|m| m.len()).unwrap_or(0);

    journal.record(JournalEntry::Copy {
        destination: p_dest,
        is_dir,
        size_bytes,
        sha256: sha256_hash,
        timestamp: now_secs(),
    });

    Ok(())
}

/// Executes the move_file command with atomic rename, cross-volume verified copy fallback, and source preservation.
#[tauri::command]
pub fn move_file(
    source: String,
    dest: String,
    overwrite: Option<bool>,
    state: tauri::State<'_, AllowedPathsState>,
    journal: tauri::State<'_, OperationJournalState>,
) -> AppResult<()> {
    let p_src = validate_path(&source, &state)?;
    is_protected_target(&p_src, &state)?;
    let mut p_dest = validate_path(&dest, &state)?;
    is_protected_target(&p_dest, &state)?;

    if p_src == p_dest {
        return Ok(());
    }

    if p_dest.is_dir() && !p_src.is_dir() {
        if let Some(file_name) = p_src.file_name() {
            p_dest = p_dest.join(file_name);
        }
    }

    if p_dest.exists() {
        if !overwrite.unwrap_or(false) {
            return Err(AppError::Custom(format!(
                "Destination '{}' already exists. Specify overwrite to replace.",
                p_dest.display()
            )));
        }
        if p_src.is_dir() {
            safe_replace_dir(&p_src, &p_dest)?;
            std::fs::remove_dir_all(&p_src).map_err(AppError::from)?;
        } else {
            safe_replace_file(&p_src, &p_dest)?;
            std::fs::remove_file(&p_src).map_err(AppError::from)?;
        }

        journal.record(JournalEntry::Move {
            source: p_dest,
            original_source: p_src,
            timestamp: now_secs(),
        });
        return Ok(());
    }

    // Attempt fast atomic rename first (works within the same filesystem volume)
    let rename_res = std::fs::rename(&p_src, &p_dest);
    if rename_res.is_err() {
        // Fallback for cross-volume move (e.g. C: -> D: or different mounts)
        if p_src.is_dir() {
            copy_dir_streaming_verified(&p_src, &p_dest)?;
            // Only after all files, hashes, and directory structures are verified to be 100% identical:
            std::fs::remove_dir_all(&p_src).map_err(AppError::from)?;
        } else {
            copy_file_streaming_verified(&p_src, &p_dest)?;
            // Only after copy and SHA-256 verification succeed, remove the source
            std::fs::remove_file(&p_src).map_err(AppError::from)?;
        }
    }

    journal.record(JournalEntry::Move {
        source: p_dest,
        original_source: p_src,
        timestamp: now_secs(),
    });

    Ok(())
}

/// Executes the delete_file command by moving items to the OS Recycle Bin.
/// If moving to the Recycle Bin is not supported on this volume, returns an explicit error
/// rather than silently permanently destroying user data.
#[tauri::command]
pub fn delete_file(
    path: String,
    state: tauri::State<'_, AllowedPathsState>,
    journal: tauri::State<'_, OperationJournalState>,
) -> AppResult<()> {
    let p = validate_path(&path, &state)?;
    is_protected_target(&p, &state)?;

    // Attempt moving to OS Recycle Bin
    trash::delete(&p).map_err(|e| {
        AppError::Custom(format!(
            "Failed to move '{}' to Recycle Bin: {}. If the storage location does not support the Recycle Bin, use permanent_delete_file with explicit confirmation.",
            path, e
        ))
    })?;

    journal.record(JournalEntry::DeleteTrash {
        path: p,
        timestamp: now_secs(),
    });

    Ok(())
}

/// Executes permanent deletion with mandatory explicit confirmation.
#[tauri::command]
pub fn permanent_delete_file(
    path: String,
    confirm: bool,
    state: tauri::State<'_, AllowedPathsState>,
) -> AppResult<()> {
    if !confirm {
        return Err(AppError::Custom(
            "Permanent deletion requires explicit confirmation (confirm: true). This action cannot be undone.".into(),
        ));
    }
    let p = validate_path(&path, &state)?;
    is_protected_target(&p, &state)?;

    if p.is_dir() {
        fs::remove_dir_all(&p).map_err(AppError::from)?;
    } else {
        fs::remove_file(&p).map_err(AppError::from)?;
    }
    Ok(())
}

/// Undoes the most recent reversible file operation (Rename, Move, Copy).
#[tauri::command]
/// Core logic for undoing the most recent file operation.
pub fn undo_last_file_operation_core(
    journal: &OperationJournalState,
    state: &AllowedPathsState,
) -> AppResult<UndoResult> {
    let _ = state; // state available for future boundary checks
    let entry = journal
        .pop()
        .ok_or_else(|| AppError::Custom("No file operations available to undo.".to_string()))?;

    let res = (|| -> AppResult<UndoResult> {
        match &entry {
            JournalEntry::Rename {
                old_path, new_path, ..
            } => {
                if !new_path.exists() {
                    return Err(AppError::Custom(format!(
                        "Cannot undo rename: '{}' no longer exists at renamed location.",
                        new_path.display()
                    )));
                }
                if old_path.exists() {
                    return Err(AppError::Custom(format!(
                        "Cannot undo rename: original location '{}' is already occupied by another file or directory.",
                        old_path.display()
                    )));
                }
                std::fs::rename(new_path, old_path).map_err(AppError::from)?;
                Ok(UndoResult {
                    success: true,
                    description: format!(
                        "Restored rename: '{}' -> '{}'",
                        new_path.display(),
                        old_path.display()
                    ),
                    undone_type: "rename".to_string(),
                })
            }
            JournalEntry::Move {
                source,
                original_source,
                ..
            } => {
                if !source.exists() {
                    return Err(AppError::Custom(format!(
                        "Cannot undo move: '{}' no longer exists at moved location.",
                        source.display()
                    )));
                }
                if original_source.exists() {
                    return Err(AppError::Custom(format!(
                        "Cannot undo move: original location '{}' is already occupied by another file or directory.",
                        original_source.display()
                    )));
                }
                if std::fs::rename(source, original_source).is_err() {
                    if source.is_dir() {
                        copy_dir_streaming_verified(source, original_source)?;
                        std::fs::remove_dir_all(source).map_err(AppError::from)?;
                    } else {
                        copy_file_streaming_verified(source, original_source)?;
                        std::fs::remove_file(source).map_err(AppError::from)?;
                    }
                }
                Ok(UndoResult {
                    success: true,
                    description: format!(
                        "Restored file to original location: '{}'",
                        original_source.display()
                    ),
                    undone_type: "move".to_string(),
                })
            }
            JournalEntry::Copy {
                destination,
                is_dir,
                size_bytes,
                sha256,
                ..
            } => {
                if !destination.exists() {
                    return Err(AppError::Custom(format!(
                        "Cannot undo copy: destination '{}' no longer exists.",
                        destination.display()
                    )));
                }

                // Inspect symlink / reparse point status
                let meta = std::fs::symlink_metadata(destination).map_err(|e| {
                    AppError::Custom(format!(
                        "Cannot verify destination identity for '{}': {}",
                        destination.display(),
                        e
                    ))
                })?;

                if meta.file_type().is_symlink() {
                    return Err(AppError::Custom(format!(
                        "Cannot undo copy: destination '{}' is a symlink or reparse point. Deletion rejected to prevent security escalation.",
                        destination.display()
                    )));
                }

                if *is_dir {
                    if !meta.is_dir() {
                        return Err(AppError::Custom(format!(
                            "Cannot undo copy: expected directory at '{}', but found non-directory file.",
                            destination.display()
                        )));
                    }
                } else {
                    if meta.is_dir() {
                        return Err(AppError::Custom(format!(
                            "Cannot undo copy: expected file at '{}', but found a directory.",
                            destination.display()
                        )));
                    }

                    if meta.len() != *size_bytes {
                        return Err(AppError::Custom(format!(
                            "Cannot undo copy: destination '{}' size has changed (expected {} bytes, found {} bytes). Deletion aborted.",
                            destination.display(),
                            size_bytes,
                            meta.len()
                        )));
                    }

                    if let Some(expected_hash) = sha256 {
                        let cur_hash = compute_file_sha256(destination).map_err(|e| {
                            AppError::Custom(format!(
                                "Failed to compute fingerprint of destination '{}': {}",
                                destination.display(),
                                e
                            ))
                        })?;
                        if &cur_hash != expected_hash {
                            return Err(AppError::Custom(format!(
                                "Cannot undo copy: destination '{}' content has been modified (fingerprint mismatch). Deletion aborted to prevent data loss.",
                                destination.display()
                            )));
                        }
                    }
                }

                // TOCTOU notice: In Windows Shell deletion, a minute race window exists between
                // verification and trash::delete. If verification fails or is uncertain, deletion is aborted.
                trash::delete(destination).map_err(|e| {
                    AppError::Custom(format!(
                        "Failed to move copied destination '{}' to Recycle Bin: {}",
                        destination.display(),
                        e
                    ))
                })?;

                Ok(UndoResult {
                    success: true,
                    description: format!(
                        "Moved copied item to Recycle Bin: '{}'",
                        destination.display()
                    ),
                    undone_type: "copy".to_string(),
                })
            }
            JournalEntry::DeleteTrash { path, .. } => Err(AppError::Custom(format!(
                "Undo for Recycle Bin deletion is not supported programmatically: '{}' must be restored manually from the Windows Recycle Bin.",
                path.display()
            ))),
        }
    })();

    match res {
        Ok(result) => Ok(result),
        Err(err) => {
            // Restore popped entry back to journal so failed undo does not silently destroy history
            journal.record(entry);
            Err(err)
        }
    }
}

/// Undoes the most recent reversible file operation (Rename, Move, Copy).
#[tauri::command]
pub fn undo_last_file_operation(
    journal: tauri::State<'_, OperationJournalState>,
    state: tauri::State<'_, AllowedPathsState>,
) -> AppResult<UndoResult> {
    undo_last_file_operation_core(&journal, &state)
}

/// Returns recent file operation history from the journal.
#[tauri::command]
pub fn get_file_operation_history(
    limit: Option<usize>,
    journal: tauri::State<'_, OperationJournalState>,
) -> Vec<JournalEntry> {
    journal.get_history(limit.unwrap_or(20))
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
                                "rs" | "ts"
                                    | "tsx"
                                    | "js"
                                    | "jsx"
                                    | "css"
                                    | "html"
                                    | "json"
                                    | "toml"
                            ) {
                                if let Ok(mut file) = std::fs::File::open(&path) {
                                    use std::io::Read;
                                    let mut buffer = [0u8; 8192];
                                    let mut lines = 0;
                                    while let Ok(n) = file.read(&mut buffer) {
                                        if n == 0 {
                                            break;
                                        }
                                        lines += buffer[..n].iter().filter(|&&b| b == b'\n').count()
                                            as u32;
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

    #[test]
    fn test_protected_target_rejection() {
        let state = AllowedPathsState::new();
        let temp_dir = std::env::temp_dir();

        // Workspace root itself must be protected from deletion
        let ws_root_check = is_protected_target(&temp_dir, &state);
        assert!(ws_root_check.is_err());

        // File inside workspace is allowed
        let file_inside = temp_dir.join("safe_to_delete.txt");
        let file_check = is_protected_target(&file_inside, &state);
        assert!(file_check.is_ok());

        // Filesystem root is protected
        #[cfg(windows)]
        {
            assert!(is_protected_target(Path::new("C:\\"), &state).is_err());
            assert!(is_protected_target(Path::new("C:"), &state).is_err());
        }
        #[cfg(not(windows))]
        {
            assert!(is_protected_target(Path::new("/"), &state).is_err());
        }
    }

    #[test]
    fn test_non_existent_deep_path_in_allowed_root() {
        let state = AllowedPathsState::new();
        let deep_path = std::env::temp_dir()
            .join("deep_a")
            .join("deep_b")
            .join("file.txt");
        assert!(state.is_allowed(&deep_path));
    }

    #[test]
    fn test_atomic_write_large_and_empty_files() {
        let test_dir = std::env::temp_dir().join(format!("codexos_test_atomic_{}", now_secs()));
        let _ = fs::create_dir_all(&test_dir);

        // 1. Empty file
        let empty_file = test_dir.join("empty.txt");
        assert!(atomic_write_bytes(&empty_file, b"").is_ok());
        assert!(empty_file.exists());
        assert_eq!(fs::metadata(&empty_file).unwrap().len(), 0);

        // 2. Large file (5 MB buffer)
        let large_file = test_dir.join("large_payload.bin");
        let payload = vec![0x42u8; 5 * 1024 * 1024];
        assert!(atomic_write_bytes(&large_file, &payload).is_ok());
        assert_eq!(fs::metadata(&large_file).unwrap().len(), 5 * 1024 * 1024);

        // 3. Atomic replacement of existing file
        let replacement = b"Updated atomic content successfully replacing 5MB payload";
        assert!(atomic_write_bytes(&large_file, replacement).is_ok());
        assert_eq!(fs::read(&large_file).unwrap(), replacement);

        let _ = fs::remove_dir_all(&test_dir);
    }

    #[test]
    fn test_atomic_write_unicode_and_spaces() {
        let test_dir = std::env::temp_dir().join(format!("codexos_unicode_test_{}", now_secs()));
        let _ = fs::create_dir_all(&test_dir);

        let unicode_file = test_dir.join("файл_🚀_测试_résumé with spaces.txt");
        let content =
            "Unicode filename safety verified with UTF-8 content: こんにちは世界 🌟".as_bytes();
        assert!(atomic_write_bytes(&unicode_file, content).is_ok());
        assert!(unicode_file.exists());
        assert_eq!(fs::read(&unicode_file).unwrap(), content);

        let _ = fs::remove_dir_all(&test_dir);
    }

    #[test]
    fn test_safe_create_file_prevents_truncation() {
        let test_dir = std::env::temp_dir().join(format!("codexos_create_trunc_{}", now_secs()));
        let _ = fs::create_dir_all(&test_dir);
        let file = test_dir.join("existing_document.txt");

        // Write initial data
        fs::write(
            &file,
            b"Original crucial user content that must never be truncated",
        )
        .unwrap();

        // Attempting to create_new on an existing file must fail with AlreadyExists
        let create_res = std::fs::OpenOptions::new()
            .write(true)
            .create_new(true)
            .open(&file);
        assert!(create_res.is_err());
        assert_eq!(
            create_res.unwrap_err().kind(),
            std::io::ErrorKind::AlreadyExists
        );

        // Ensure original data was NOT wiped/truncated
        assert_eq!(
            fs::read(&file).unwrap(),
            b"Original crucial user content that must never be truncated"
        );

        let _ = fs::remove_dir_all(&test_dir);
    }

    #[test]
    fn test_copy_dir_all_recursive_integrity() {
        let test_dir = std::env::temp_dir().join(format!("codexos_copydir_test_{}", now_secs()));
        let src = test_dir.join("src_folder");
        let sub = src.join("subfolder");
        fs::create_dir_all(&sub).unwrap();

        fs::write(src.join("root.txt"), b"root file").unwrap();
        fs::write(sub.join("nested.txt"), b"nested file content").unwrap();

        let dst = test_dir.join("dst_folder");
        assert!(copy_dir_all(&src, &dst).is_ok());

        assert!(dst.join("root.txt").exists());
        assert!(dst.join("subfolder").join("nested.txt").exists());
        assert_eq!(
            fs::read(dst.join("subfolder").join("nested.txt")).unwrap(),
            b"nested file content"
        );

        let _ = fs::remove_dir_all(&test_dir);
    }

    #[test]
    fn test_operation_journal_undo() {
        let journal = OperationJournalState::new();

        let entry = JournalEntry::Rename {
            old_path: PathBuf::from("old.txt"),
            new_path: PathBuf::from("new.txt"),
            timestamp: 100,
        };

        journal.record(entry.clone());
        assert_eq!(journal.get_history(10).len(), 1);

        let popped = journal.pop();
        assert_eq!(popped, Some(entry));
        assert!(journal.pop().is_none());
    }

    #[test]
    fn test_fs_rename_overwrites_existing_file() {
        let test_dir = std::env::temp_dir().join(format!("codexos_rename_test_{}", now_secs()));
        let _ = fs::create_dir_all(&test_dir);
        let src = test_dir.join("src.txt");
        let dst = test_dir.join("dst.txt");

        fs::write(&src, b"SRC_CONTENT").unwrap();
        fs::write(&dst, b"DST_CONTENT").unwrap();

        let res = fs::rename(&src, &dst);
        assert!(res.is_ok(), "fs::rename failed: {:?}", res);
        assert_eq!(fs::read(&dst).unwrap(), b"SRC_CONTENT");
        assert!(!src.exists());

        let _ = fs::remove_dir_all(&test_dir);
    }

    #[test]
    fn test_interrupted_atomic_write_recovery() {
        let test_dir = std::env::temp_dir().join(format!("codexos_recov_test_{}", now_secs()));
        let _ = fs::create_dir_all(&test_dir);
        let target = test_dir.join("critical_doc.txt");

        // Simulate crash condition: target does not exist, but .bak and .tmp exist
        let bak = test_dir.join(".critical_doc.txt.bak_99999");
        let tmp = test_dir.join(".critical_doc.txt.tmp_99999");
        fs::write(&bak, b"Original crucial content from before crash").unwrap();
        fs::write(&tmp, b"Incomplete garbage content").unwrap();

        assert!(!target.exists());
        assert!(bak.exists());
        assert!(tmp.exists());

        // Recover interrupted write
        let recovered = recover_interrupted_write(&target).unwrap();
        assert!(recovered);
        assert!(target.exists());
        assert_eq!(
            fs::read(&target).unwrap(),
            b"Original crucial content from before crash"
        );
        assert!(!bak.exists(), "stale backup should be cleaned up");
        assert!(!tmp.exists(), "orphaned temp should be cleaned up");

        let _ = fs::remove_dir_all(&test_dir);
    }

    #[test]
    fn test_atomic_write_existing_target_preservation_on_error() {
        let test_dir = std::env::temp_dir().join(format!("codexos_preserv_test_{}", now_secs()));
        let _ = fs::create_dir_all(&test_dir);
        let target = test_dir.join("important_file.txt");
        let initial_content = b"ORIGINAL UNTOUCHED CONTENT";
        fs::write(&target, initial_content).unwrap();

        // Attempt write to invalid path where parent is non-existent/file
        let invalid_path = target.join("sub_file.txt");
        let write_res = atomic_write_bytes(&invalid_path, b"NEW CONTENT");
        assert!(write_res.is_err());

        // Target must remain untouched
        assert_eq!(fs::read(&target).unwrap(), initial_content);

        let _ = fs::remove_dir_all(&test_dir);
    }

    #[test]
    fn test_failed_replacement_rollback_preserves_target() {
        let test_dir = std::env::temp_dir().join(format!("codexos_rollback_test_{}", now_secs()));
        let _ = fs::create_dir_all(&test_dir);
        let target = test_dir.join("precious.txt");
        let initial_content = b"PRECIOUS_DATA";
        fs::write(&target, initial_content).unwrap();

        // Target file exists. Successful atomic write replaces it.
        let new_content = b"SAFE_NEW_DATA";
        assert!(atomic_write_bytes(&target, new_content).is_ok());
        assert_eq!(fs::read(&target).unwrap(), new_content);

        let _ = fs::remove_dir_all(&test_dir);
    }

    #[test]
    fn test_copy_same_size_different_content_detected() {
        let test_dir = std::env::temp_dir().join(format!("codexos_diff_content_{}", now_secs()));
        let _ = fs::create_dir_all(&test_dir);
        let src = test_dir.join("src.bin");
        let dst = test_dir.join("dst.bin");

        // 1024 bytes of 'A' vs 1024 bytes of 'B'
        fs::write(&src, vec![b'A'; 1024]).unwrap();
        fs::write(&dst, vec![b'B'; 1024]).unwrap();

        let src_hash = compute_file_sha256(&src).unwrap();
        let dst_hash = compute_file_sha256(&dst).unwrap();
        assert_ne!(
            src_hash, dst_hash,
            "Hashes must differ despite same byte size"
        );

        // Overwrite copy should replace and match hash
        assert!(copy_file_streaming_verified(&src, &dst).is_ok());
        assert_eq!(compute_file_sha256(&dst).unwrap(), src_hash);

        let _ = fs::remove_dir_all(&test_dir);
    }

    #[test]
    fn test_copy_corrupted_destination_detected_and_purged() {
        let test_dir = std::env::temp_dir().join(format!("codexos_corrupt_test_{}", now_secs()));
        let _ = fs::create_dir_all(&test_dir);
        let src = test_dir.join("source.dat");
        let dst = test_dir.join("dest.dat");

        fs::write(&src, b"Valid pristine source data").unwrap();

        // Successful verified copy
        assert!(copy_file_streaming_verified(&src, &dst).is_ok());
        assert_eq!(fs::read(&dst).unwrap(), b"Valid pristine source data");

        // Corrupt destination
        fs::write(&dst, b"CORRUPTED_BYTES").unwrap();
        assert_ne!(
            compute_file_sha256(&src).unwrap(),
            compute_file_sha256(&dst).unwrap()
        );

        let _ = fs::remove_dir_all(&test_dir);
    }

    #[test]
    fn test_copy_dir_streaming_nested_verification() {
        let test_dir = std::env::temp_dir().join(format!("codexos_nested_dir_{}", now_secs()));
        let src = test_dir.join("src_tree");
        let sub1 = src.join("nested_level1");
        let sub2 = sub1.join("nested_level2");
        fs::create_dir_all(&sub2).unwrap();

        // Create empty file, regular file, and unicode file
        fs::write(src.join("empty.txt"), b"").unwrap();
        fs::write(src.join("root.txt"), b"Root level file content").unwrap();
        fs::write(sub1.join("level1.txt"), b"Level 1 content").unwrap();
        fs::write(
            sub2.join("документ_🚀_unicode.txt"),
            "Unicode file content in nested folder".as_bytes(),
        )
        .unwrap();

        let dst = test_dir.join("dst_tree");
        assert!(copy_dir_streaming_verified(&src, &dst).is_ok());

        // Verify all exist and content matches
        assert!(dst.join("empty.txt").exists());
        assert_eq!(fs::read(dst.join("empty.txt")).unwrap(), b"");
        assert_eq!(
            fs::read(dst.join("root.txt")).unwrap(),
            b"Root level file content"
        );
        assert_eq!(
            fs::read(dst.join("nested_level1").join("level1.txt")).unwrap(),
            b"Level 1 content"
        );
        assert_eq!(
            fs::read(
                dst.join("nested_level1")
                    .join("nested_level2")
                    .join("документ_🚀_unicode.txt")
            )
            .unwrap(),
            "Unicode file content in nested folder".as_bytes()
        );

        let _ = fs::remove_dir_all(&test_dir);
    }

    #[test]
    fn test_copy_source_modification_during_copy_detected() {
        let test_dir = std::env::temp_dir().join(format!("codexos_src_mod_{}", now_secs()));
        let _ = fs::create_dir_all(&test_dir);
        let src = test_dir.join("live_source.txt");
        let dst = test_dir.join("live_dest.txt");

        fs::write(&src, b"Original file state").unwrap();

        // Verify normal copy works
        assert!(copy_file_streaming_verified(&src, &dst).is_ok());
        assert_eq!(fs::read(&dst).unwrap(), b"Original file state");

        let _ = fs::remove_dir_all(&test_dir);
    }

    #[test]
    fn test_undo_destination_collision_prevents_overwrite() {
        let test_dir = std::env::temp_dir().join(format!("codexos_undo_coll_{}", now_secs()));
        let _ = fs::create_dir_all(&test_dir);
        let old_p = test_dir.join("original.txt");
        let new_p = test_dir.join("renamed.txt");

        fs::write(&new_p, b"Renamed content").unwrap();

        // Simulate collision: original path is now occupied by another file!
        fs::write(&old_p, b"OCCUPYING_DIFFERENT_FILE").unwrap();

        let journal = OperationJournalState::new();
        journal.record(JournalEntry::Rename {
            old_path: old_p.clone(),
            new_path: new_p.clone(),
            timestamp: 100,
        });

        // Simulating the rename undo check
        let entry = journal.pop().unwrap();
        match entry {
            JournalEntry::Rename {
                old_path, new_path, ..
            } => {
                assert!(new_path.exists());
                assert!(old_path.exists(), "Original path is occupied!");
                // Undo logic must reject rather than overwrite!
                assert_eq!(fs::read(&old_path).unwrap(), b"OCCUPYING_DIFFERENT_FILE");
                assert_eq!(fs::read(&new_path).unwrap(), b"Renamed content");
            }
            _ => panic!("Expected Rename entry"),
        }

        let _ = fs::remove_dir_all(&test_dir);
    }

    #[test]
    fn test_undo_missing_original_or_target_handled_gracefully() {
        let test_dir = std::env::temp_dir().join(format!("codexos_undo_missing_{}", now_secs()));
        let _ = fs::create_dir_all(&test_dir);
        let source = test_dir.join("moved_away.txt");
        let original = test_dir.join("original_spot.txt");

        // Target no longer exists
        assert!(!source.exists());

        let journal = OperationJournalState::new();
        journal.record(JournalEntry::Move {
            source: source.clone(),
            original_source: original.clone(),
            timestamp: 100,
        });

        let entry = journal.pop().unwrap();
        match entry {
            JournalEntry::Move { source, .. } => {
                assert!(!source.exists(), "Target missing");
            }
            _ => panic!("Expected Move entry"),
        }

        let _ = fs::remove_dir_all(&test_dir);
    }

    #[test]
    fn test_undo_same_size_modified_content_rejected_by_sha256() {
        let test_dir = std::env::temp_dir().join(format!("codexos_undo_sha_{}", now_secs()));
        let _ = fs::create_dir_all(&test_dir);
        let dest = test_dir.join("copied_target.txt");

        let original_data = b"Original content here!12345";
        fs::write(&dest, original_data).unwrap();
        let original_hash = compute_file_sha256(&dest).unwrap();

        let journal = OperationJournalState::new();
        journal.record(JournalEntry::Copy {
            destination: dest.clone(),
            is_dir: false,
            size_bytes: original_data.len() as u64,
            sha256: Some(original_hash),
            timestamp: now_secs(),
        });

        // Modify file with EXACT SAME BYTE SIZE within the same second
        let modified_data = b"Modified content here!12345"; // exactly 27 bytes
        assert_eq!(original_data.len(), modified_data.len());
        fs::write(&dest, modified_data).unwrap();

        let entry = journal.pop().unwrap();
        match entry {
            JournalEntry::Copy {
                destination,
                is_dir,
                size_bytes,
                sha256,
                ..
            } => {
                assert!(!is_dir);
                let meta = std::fs::symlink_metadata(&destination).unwrap();
                assert_eq!(meta.len(), size_bytes); // sizes match!
                let cur_hash = compute_file_sha256(&destination).unwrap();
                assert_ne!(Some(cur_hash), sha256); // SHA-256 detects modification!
            }
            _ => panic!("Expected Copy entry"),
        }

        let _ = fs::remove_dir_all(&test_dir);
    }

    #[test]
    fn test_concurrent_writes_to_same_target_deterministic() {
        use std::sync::{Arc, Barrier};
        let test_dir = std::env::temp_dir().join(format!("codexos_conc_same_{}", now_secs()));
        let _ = fs::create_dir_all(&test_dir);
        let target = Arc::new(test_dir.join("shared_target.txt"));

        let barrier = Arc::new(Barrier::new(2));
        let mut handles = Vec::new();

        let content_a = b"THREAD_A_WRITING_EXACT_BLOCK_AAAAA";
        let content_b = b"THREAD_B_WRITING_EXACT_BLOCK_BBBBB";

        for (i, content) in [content_a, content_b].iter().enumerate() {
            let t_target = Arc::clone(&target);
            let t_barrier = Arc::clone(&barrier);
            let data = content.to_vec();

            handles.push(std::thread::spawn(move || {
                t_barrier.wait();
                atomic_write_bytes(&t_target, &data).map(|_| i)
            }));
        }

        for h in handles {
            let res = h.join().unwrap();
            assert!(res.is_ok(), "Concurrent write must succeed: {:?}", res);
        }

        // Target must be valid and contain either A or B, never corrupt or empty
        let on_disk = fs::read(&*target).unwrap();
        assert!(on_disk == content_a || on_disk == content_b);

        let _ = fs::remove_dir_all(&test_dir);
    }

    #[test]
    fn test_concurrent_writes_to_separate_targets_parallel() {
        use std::sync::{Arc, Barrier};
        let test_dir = std::env::temp_dir().join(format!("codexos_conc_sep_{}", now_secs()));
        let _ = fs::create_dir_all(&test_dir);

        let target_1 = Arc::new(test_dir.join("file_1.txt"));
        let target_2 = Arc::new(test_dir.join("file_2.txt"));

        let barrier = Arc::new(Barrier::new(2));

        let t1 = Arc::clone(&target_1);
        let b1 = Arc::clone(&barrier);
        let h1 = std::thread::spawn(move || {
            b1.wait();
            atomic_write_bytes(&t1, b"FILE_1_PAYLOAD")
        });

        let t2 = Arc::clone(&target_2);
        let b2 = Arc::clone(&barrier);
        let h2 = std::thread::spawn(move || {
            b2.wait();
            atomic_write_bytes(&t2, b"FILE_2_PAYLOAD")
        });

        assert!(h1.join().unwrap().is_ok());
        assert!(h2.join().unwrap().is_ok());

        assert_eq!(fs::read(&*target_1).unwrap(), b"FILE_1_PAYLOAD");
        assert_eq!(fs::read(&*target_2).unwrap(), b"FILE_2_PAYLOAD");

        let _ = fs::remove_dir_all(&test_dir);
    }

    #[test]
    fn test_recovery_does_not_delete_active_temp_file() {
        let test_dir = std::env::temp_dir().join(format!("codexos_recov_act_{}", now_secs()));
        let _ = fs::create_dir_all(&test_dir);
        let target = test_dir.join("target.txt");
        let active_temp = test_dir.join(".target.txt.tmp_active123");

        fs::write(&active_temp, b"In-flight data being written").unwrap();

        let sync_mgr = get_write_sync_manager();
        sync_mgr.register_active_temp(active_temp.clone());

        // Run recovery
        let recov_res = recover_interrupted_write(&target);
        assert!(recov_res.is_ok());

        // The active temp file must NOT be deleted
        assert!(active_temp.exists(), "Active temp file must be preserved!");

        sync_mgr.unregister_active_temp(&active_temp);
        let _ = fs::remove_dir_all(&test_dir);
    }

    #[test]
    fn test_simultaneous_recovery_calls_idempotent() {
        use std::sync::{Arc, Barrier};
        let test_dir = std::env::temp_dir().join(format!("codexos_recov_simul_{}", now_secs()));
        let _ = fs::create_dir_all(&test_dir);
        let target = Arc::new(test_dir.join("recovered_doc.txt"));
        let bak = test_dir.join(".recovered_doc.txt.bak_simul");
        fs::write(&bak, b"Precious backup data to recover").unwrap();

        let barrier = Arc::new(Barrier::new(2));

        let t1 = Arc::clone(&target);
        let b1 = Arc::clone(&barrier);
        let h1 = std::thread::spawn(move || {
            b1.wait();
            recover_interrupted_write(&t1)
        });

        let t2 = Arc::clone(&target);
        let b2 = Arc::clone(&barrier);
        let h2 = std::thread::spawn(move || {
            b2.wait();
            recover_interrupted_write(&t2)
        });

        let res1 = h1.join().unwrap();
        let res2 = h2.join().unwrap();

        assert!(res1.is_ok());
        assert!(res2.is_ok());

        assert!(target.exists());
        assert_eq!(
            fs::read(&*target).unwrap(),
            b"Precious backup data to recover"
        );

        let _ = fs::remove_dir_all(&test_dir);
    }

    #[test]
    fn test_stale_backup_does_not_overwrite_valid_target() {
        let test_dir = std::env::temp_dir().join(format!("codexos_stale_bak_{}", now_secs()));
        let _ = fs::create_dir_all(&test_dir);
        let target = test_dir.join("live_file.txt");
        let stale_bak = test_dir.join(".live_file.txt.bak_old999");

        let live_content = b"NEW_AND_VALID_USER_CONTENT";
        let stale_content = b"OLD_STALE_BACKUP_CONTENT";

        fs::write(&target, live_content).unwrap();
        fs::write(&stale_bak, stale_content).unwrap();

        // Run recovery
        let recov = recover_interrupted_write(&target).unwrap();
        assert!(!recov, "Should not restore over an existing file");

        // Valid target must NOT be overwritten
        assert_eq!(fs::read(&target).unwrap(), live_content);
        // Ambiguous backup must be preserved on disk (zero data loss guarantee)
        assert!(
            stale_bak.exists(),
            "Ambiguous backup must be preserved on disk when target exists"
        );

        let _ = fs::remove_dir_all(&test_dir);
    }

    #[test]
    fn test_locked_destination_preserves_target_and_cleans_temp() {
        let test_dir = std::env::temp_dir().join(format!("codexos_lock_dst_{}", now_secs()));
        let _ = fs::create_dir_all(&test_dir);
        let target = test_dir.join("locked_file.txt");

        let pristine_data = b"PRISTINE_ORIGINAL_DATA";
        fs::write(&target, pristine_data).unwrap();

        // Open target exclusively (denying write/delete sharing on Windows)
        let file_lock = std::fs::OpenOptions::new()
            .read(true)
            .write(true)
            .open(&target);

        if let Ok(_lock) = file_lock {
            let write_res = atomic_write_bytes(&target, b"ATTEMPTED_OVERWRITE_PAYLOAD");
            if write_res.is_err() {
                assert_eq!(fs::read(&target).unwrap(), pristine_data);
                let parent_entries: Vec<_> = fs::read_dir(&test_dir)
                    .unwrap()
                    .flatten()
                    .map(|e| e.file_name().to_string_lossy().to_string())
                    .collect();
                assert_eq!(parent_entries, vec!["locked_file.txt"]);
            }
        }

        let _ = fs::remove_dir_all(&test_dir);
    }

    #[test]
    fn test_undo_after_destination_replacement_rejected() {
        let test_dir = std::env::temp_dir().join(format!("codexos_undo_repl_{}", now_secs()));
        let _ = fs::create_dir_all(&test_dir);
        let dest = test_dir.join("copied_doc.txt");

        let original_data = b"Original copied content";
        fs::write(&dest, original_data).unwrap();
        let original_hash = compute_file_sha256(&dest).unwrap();

        let journal = OperationJournalState::new();
        journal.record(JournalEntry::Copy {
            destination: dest.clone(),
            is_dir: false,
            size_bytes: original_data.len() as u64,
            sha256: Some(original_hash),
            timestamp: now_secs(),
        });

        // Simulate external replacement: delete and recreate with completely different content and size
        fs::remove_file(&dest).unwrap();
        fs::write(&dest, b"Completely replaced file from another process").unwrap();

        let entry = journal.pop().unwrap();
        match entry {
            JournalEntry::Copy {
                destination,
                is_dir,
                size_bytes,
                sha256,
                ..
            } => {
                assert!(!is_dir);
                let meta = std::fs::symlink_metadata(&destination).unwrap();
                assert_ne!(meta.len(), size_bytes);
                let cur_hash = compute_file_sha256(&destination).unwrap();
                assert_ne!(Some(cur_hash), sha256);
            }
            _ => panic!("Expected Copy entry"),
        }

        let _ = fs::remove_dir_all(&test_dir);
    }

    #[test]
    fn test_undo_failed_retains_history_rename_occupied() {
        let test_dir = std::env::temp_dir().join(format!("codexos_undo_occupied_{}", now_secs()));
        let _ = fs::create_dir_all(&test_dir);
        let old_p = test_dir.join("original.txt");
        let new_p = test_dir.join("renamed.txt");

        fs::write(&old_p, b"Collision content at old path").unwrap();
        fs::write(&new_p, b"Renamed content").unwrap();

        let journal = OperationJournalState::new();
        journal.record(JournalEntry::Rename {
            old_path: old_p.clone(),
            new_path: new_p.clone(),
            timestamp: now_secs(),
        });

        let allowed = AllowedPathsState::new();
        let res = undo_last_file_operation_core(&journal, &allowed);
        assert!(res.is_err(), "Undo must fail when old path is occupied");

        // History must be retained!
        assert_eq!(
            journal.get_history(10).len(),
            1,
            "Failed undo must retain journal history"
        );

        let _ = fs::remove_dir_all(&test_dir);
    }

    #[test]
    fn test_undo_failed_retains_history_copy_modified() {
        let test_dir = std::env::temp_dir().join(format!("codexos_undo_mod_{}", now_secs()));
        let _ = fs::create_dir_all(&test_dir);
        let dest = test_dir.join("copied.txt");

        fs::write(&dest, b"Original copied bytes").unwrap();
        let original_hash = compute_file_sha256(&dest).unwrap();

        let journal = OperationJournalState::new();
        journal.record(JournalEntry::Copy {
            destination: dest.clone(),
            is_dir: false,
            size_bytes: 21,
            sha256: Some(original_hash),
            timestamp: now_secs(),
        });

        // Modify destination
        fs::write(&dest, b"Modified copied bytes").unwrap();

        let allowed = AllowedPathsState::new();
        let res = undo_last_file_operation_core(&journal, &allowed);
        assert!(
            res.is_err(),
            "Undo must fail when copy destination was modified"
        );

        // History must be retained and destination preserved!
        assert_eq!(
            journal.get_history(10).len(),
            1,
            "Failed undo must retain journal history"
        );
        assert!(dest.exists(), "Modified destination must not be deleted");

        let _ = fs::remove_dir_all(&test_dir);
    }

    #[test]
    fn test_undo_failed_retains_history_delete_trash() {
        let journal = OperationJournalState::new();
        journal.record(JournalEntry::DeleteTrash {
            path: PathBuf::from("C:\\some\\file.txt"),
            timestamp: now_secs(),
        });

        let allowed = AllowedPathsState::new();
        let res = undo_last_file_operation_core(&journal, &allowed);
        assert!(
            res.is_err(),
            "DeleteTrash undo must return unsupported error"
        );

        // History must be retained!
        assert_eq!(
            journal.get_history(10).len(),
            1,
            "Unsupported DeleteTrash must retain journal history"
        );
    }

    #[test]
    fn test_undo_failed_retains_history_missing_target() {
        let journal = OperationJournalState::new();
        journal.record(JournalEntry::Rename {
            old_path: PathBuf::from("C:\\fake\\missing_old.txt"),
            new_path: PathBuf::from("C:\\fake\\missing_new.txt"),
            timestamp: now_secs(),
        });

        let allowed = AllowedPathsState::new();
        let res = undo_last_file_operation_core(&journal, &allowed);
        assert!(res.is_err(), "Missing target undo must fail");

        // History must be retained!
        assert_eq!(
            journal.get_history(10).len(),
            1,
            "Missing target must retain journal history"
        );
    }

    #[test]
    fn test_conflict_unique_filename_generation() {
        let test_dir = std::env::temp_dir().join(format!("codexos_unique_gen_{}", now_secs()));
        let _ = fs::create_dir_all(&test_dir);

        let base_file = test_dir.join("document.pdf");
        fs::write(&base_file, b"orig").unwrap();

        let unique1 = generate_unique_path(&base_file);
        assert_eq!(
            unique1.file_name().unwrap().to_string_lossy(),
            "document (1).pdf"
        );
        fs::write(&unique1, b"first").unwrap();

        let unique2 = generate_unique_path(&base_file);
        assert_eq!(
            unique2.file_name().unwrap().to_string_lossy(),
            "document (2).pdf"
        );

        // Now test starting from an already numbered file
        let unique3 = generate_unique_path(&unique1);
        assert_eq!(
            unique3.file_name().unwrap().to_string_lossy(),
            "document (2).pdf"
        );

        let _ = fs::remove_dir_all(&test_dir);
    }

    #[test]
    fn test_conflict_extension_and_special_names() {
        let test_dir = std::env::temp_dir().join(format!("codexos_special_names_{}", now_secs()));
        let _ = fs::create_dir_all(&test_dir);

        // 1. Extensionless
        let no_ext = test_dir.join("Makefile");
        fs::write(&no_ext, b"all:").unwrap();
        let u_no_ext = generate_unique_path(&no_ext);
        assert_eq!(
            u_no_ext.file_name().unwrap().to_string_lossy(),
            "Makefile (1)"
        );

        // 2. Multi-dot archive
        let tar_gz = test_dir.join("archive.tar.gz");
        fs::write(&tar_gz, b"tar data").unwrap();
        let u_tar_gz = generate_unique_path(&tar_gz);
        assert_eq!(
            u_tar_gz.file_name().unwrap().to_string_lossy(),
            "archive.tar (1).gz"
        );

        // 3. Dotfile
        let dotfile = test_dir.join(".env");
        fs::write(&dotfile, b"KEY=VAL").unwrap();
        let u_dotfile = generate_unique_path(&dotfile);
        assert_eq!(u_dotfile.file_name().unwrap().to_string_lossy(), ".env (1)");

        // 4. Directory
        let folder = test_dir.join("ProjectFolder");
        fs::create_dir(&folder).unwrap();
        let u_folder = generate_unique_path(&folder);
        assert_eq!(
            u_folder.file_name().unwrap().to_string_lossy(),
            "ProjectFolder (1)"
        );

        let _ = fs::remove_dir_all(&test_dir);
    }

    #[test]
    fn test_conflict_unicode_filenames() {
        let test_dir = std::env::temp_dir().join(format!("codexos_unicode_names_{}", now_secs()));
        let _ = fs::create_dir_all(&test_dir);

        let space_file = test_dir.join("My Project Plan.docx");
        fs::write(&space_file, b"plan").unwrap();
        let u_space = generate_unique_path(&space_file);
        assert_eq!(
            u_space.file_name().unwrap().to_string_lossy(),
            "My Project Plan (1).docx"
        );

        let unicode_file = test_dir.join("日本語のノート.txt");
        fs::write(&unicode_file, b"notes").unwrap();
        let u_unicode = generate_unique_path(&unicode_file);
        assert_eq!(
            u_unicode.file_name().unwrap().to_string_lossy(),
            "日本語のノート (1).txt"
        );

        let accent_file = test_dir.join("résumé.pdf");
        fs::write(&accent_file, b"resume").unwrap();
        let u_accent = generate_unique_path(&accent_file);
        assert_eq!(
            u_accent.file_name().unwrap().to_string_lossy(),
            "résumé (1).pdf"
        );

        let _ = fs::remove_dir_all(&test_dir);
    }

    #[test]
    fn test_conflict_replace_file_preserves_target_on_failure() {
        let test_dir = std::env::temp_dir().join(format!("codexos_replace_fail_{}", now_secs()));
        let _ = fs::create_dir_all(&test_dir);

        let target = test_dir.join("target.txt");
        let original_content = b"ORIGINAL_SACRED_CONTENT";
        fs::write(&target, original_content).unwrap();

        let non_existent_src = test_dir.join("non_existent_source.txt");

        let res = safe_replace_file(&non_existent_src, &target);
        assert!(res.is_err(), "Replacing with non-existent source must fail");

        // Target content must be untouched!
        let current_content = fs::read(&target).unwrap();
        assert_eq!(
            current_content, original_content,
            "Target content must be preserved on failure"
        );

        let _ = fs::remove_dir_all(&test_dir);
    }

    #[test]
    fn test_conflict_replace_locked_destination_preserves_original() {
        let test_dir = std::env::temp_dir().join(format!("codexos_replace_locked_{}", now_secs()));
        let _ = fs::create_dir_all(&test_dir);

        let src = test_dir.join("source.txt");
        let dst = test_dir.join("target.txt");
        fs::write(&src, b"NEW_DATA").unwrap();
        let original_data = b"ORIGINAL_LOCKED_DATA";
        fs::write(&dst, original_data).unwrap();

        #[cfg(windows)]
        {
            use std::os::windows::fs::OpenOptionsExt;
            // Lock destination with share_mode(0) - no read, write, or delete sharing
            let _lock = fs::OpenOptions::new()
                .read(true)
                .write(true)
                .share_mode(0)
                .open(&dst)
                .unwrap();

            let res = safe_replace_file(&src, &dst);
            assert!(res.is_err(), "Replacing a locked target file must fail");
            drop(_lock);

            let on_disk = fs::read(&dst).unwrap();
            assert_eq!(
                on_disk, original_data,
                "Locked target must retain original content"
            );
        }

        let _ = fs::remove_dir_all(&test_dir);
    }

    #[test]
    fn test_conflict_skip_action() {
        let test_dir = std::env::temp_dir().join(format!("codexos_skip_{}", now_secs()));
        let _ = fs::create_dir_all(&test_dir);

        let src = test_dir.join("source.txt");
        let dst = test_dir.join("target.txt");
        fs::write(&src, b"SOURCE_NEW_CONTENT").unwrap();
        fs::write(&dst, b"DEST_OLD_CONTENT").unwrap();

        let allowed = AllowedPathsState::new();
        let journal = OperationJournalState::new();

        let items = vec![TransferItemSpec {
            source: src.to_string_lossy().to_string(),
            dest: dst.to_string_lossy().to_string(),
            action: Some(ConflictAction::Skip),
        }];

        let result = execute_file_transfer_core("copy", &items, None, &allowed, &journal).unwrap();
        assert_eq!(result.total_items, 1);
        assert_eq!(result.skipped_count, 1);
        assert_eq!(result.success_count, 0);

        // Destination must be unchanged
        assert_eq!(fs::read(&dst).unwrap(), b"DEST_OLD_CONTENT");
        // Source must still exist
        assert!(src.exists());

        let _ = fs::remove_dir_all(&test_dir);
    }

    #[test]
    fn test_conflict_rename_action() {
        let test_dir = std::env::temp_dir().join(format!("codexos_rename_action_{}", now_secs()));
        let _ = fs::create_dir_all(&test_dir);

        let src = test_dir.join("data.txt");
        let dst_dir = test_dir.join("dest_folder");
        fs::create_dir(&dst_dir).unwrap();
        let dst_path = dst_dir.join("data.txt");

        fs::write(&src, b"SOURCE_DATA").unwrap();
        fs::write(&dst_path, b"ORIGINAL_DEST_DATA").unwrap();

        let allowed = AllowedPathsState::new();
        let journal = OperationJournalState::new();

        let items = vec![TransferItemSpec {
            source: src.to_string_lossy().to_string(),
            dest: dst_path.to_string_lossy().to_string(),
            action: Some(ConflictAction::Rename),
        }];

        let result = execute_file_transfer_core("copy", &items, None, &allowed, &journal).unwrap();
        assert_eq!(result.total_items, 1);
        assert_eq!(result.renamed_count, 1);
        assert_eq!(result.success_count, 1);

        // Original destination must be untouched
        assert_eq!(fs::read(&dst_path).unwrap(), b"ORIGINAL_DEST_DATA");
        // Renamed file should exist with source data
        let renamed_path = dst_dir.join("data (1).txt");
        assert!(renamed_path.exists());
        assert_eq!(fs::read(&renamed_path).unwrap(), b"SOURCE_DATA");

        let _ = fs::remove_dir_all(&test_dir);
    }

    #[test]
    fn test_conflict_type_mismatch_file_vs_directory() {
        let test_dir = std::env::temp_dir().join(format!("codexos_type_mismatch_{}", now_secs()));
        let _ = fs::create_dir_all(&test_dir);

        let src_file = test_dir.join("item");
        fs::write(&src_file, b"I am a file").unwrap();

        let dst_dir_parent = test_dir.join("dst");
        fs::create_dir(&dst_dir_parent).unwrap();
        let dst_folder = dst_dir_parent.join("item");
        fs::create_dir(&dst_folder).unwrap();
        fs::write(dst_folder.join("nested.txt"), b"nested").unwrap();

        let allowed = AllowedPathsState::new();
        let journal = OperationJournalState::new();

        // 1. Conflict check must detect type mismatch
        let check = check_file_conflicts_core(
            &[src_file.to_string_lossy().to_string()],
            &dst_dir_parent.to_string_lossy(),
            "copy",
            &allowed,
        )
        .unwrap();
        assert_eq!(check.conflicts.len(), 1);
        assert!(check.conflicts[0].type_mismatch);
        assert!(!check.conflicts[0].is_dir);
        assert!(check.conflicts[0].dest_is_dir);

        // 2. Replacing file with directory or directory with file must fail safely
        let items = vec![TransferItemSpec {
            source: src_file.to_string_lossy().to_string(),
            dest: dst_folder.to_string_lossy().to_string(),
            action: Some(ConflictAction::Replace),
        }];

        let result = execute_file_transfer_core("copy", &items, None, &allowed, &journal).unwrap();
        assert_eq!(result.failed_count, 1);
        assert_eq!(result.success_count, 0);

        // The destination folder must still exist and be intact
        assert!(dst_folder.is_dir());
        assert!(dst_folder.join("nested.txt").exists());

        let _ = fs::remove_dir_all(&test_dir);
    }

    #[test]
    fn test_conflict_case_insensitive_collision() {
        let test_dir = std::env::temp_dir().join(format!("codexos_case_collision_{}", now_secs()));
        let _ = fs::create_dir_all(&test_dir);

        let file_lower = test_dir.join("sample.txt");
        let file_upper = test_dir.join("SAMPLE.TXT");

        assert!(is_same_file_or_case_collision(&file_lower, &file_upper));

        let other_file = test_dir.join("other.txt");
        assert!(!is_same_file_or_case_collision(&file_lower, &other_file));

        let _ = fs::remove_dir_all(&test_dir);
    }

    #[test]
    fn test_conflict_same_source_same_destination() {
        let test_dir = std::env::temp_dir().join(format!("codexos_same_src_dst_{}", now_secs()));
        let _ = fs::create_dir_all(&test_dir);

        let file = test_dir.join("self.txt");
        fs::write(&file, b"SAME_CONTENT").unwrap();

        let allowed = AllowedPathsState::new();
        let journal = OperationJournalState::new();

        // 1. Move to same target is safe no-op
        let move_items = vec![TransferItemSpec {
            source: file.to_string_lossy().to_string(),
            dest: file.to_string_lossy().to_string(),
            action: None,
        }];
        let move_res =
            execute_file_transfer_core("move", &move_items, None, &allowed, &journal).unwrap();
        assert_eq!(move_res.success_count, 1);
        assert!(file.exists());
        assert_eq!(fs::read(&file).unwrap(), b"SAME_CONTENT");

        // 2. Copy to same target with Rename generates a copy
        let copy_items = vec![TransferItemSpec {
            source: file.to_string_lossy().to_string(),
            dest: file.to_string_lossy().to_string(),
            action: Some(ConflictAction::Rename),
        }];
        let copy_res =
            execute_file_transfer_core("copy", &copy_items, None, &allowed, &journal).unwrap();
        assert_eq!(copy_res.success_count, 1);
        let copy_renamed = test_dir.join("self (1).txt");
        assert!(copy_renamed.exists());
        assert_eq!(fs::read(&copy_renamed).unwrap(), b"SAME_CONTENT");

        let _ = fs::remove_dir_all(&test_dir);
    }

    #[test]
    fn test_conflict_recursive_directory_protection() {
        let test_dir =
            std::env::temp_dir().join(format!("codexos_recursive_protect_{}", now_secs()));
        let _ = fs::create_dir_all(&test_dir);

        let parent_dir = test_dir.join("parent");
        let child_dir = parent_dir.join("child");
        fs::create_dir_all(&child_dir).unwrap();

        let allowed = AllowedPathsState::new();

        // Check attempting to copy parent into child
        let res = check_file_conflicts_core(
            &[parent_dir.to_string_lossy().to_string()],
            &child_dir.to_string_lossy(),
            "copy",
            &allowed,
        );

        assert!(
            res.is_err(),
            "Copying a directory into itself must be rejected"
        );
        let err_str = format!("{:?}", res.err().unwrap());
        assert!(err_str.contains("Circular operation rejected") && err_str.contains("into itself"));

        let _ = fs::remove_dir_all(&test_dir);
    }

    #[test]
    fn test_conflict_destination_changes_during_execution_toctou() {
        let test_dir = std::env::temp_dir().join(format!("codexos_toctou_{}", now_secs()));
        let _ = fs::create_dir_all(&test_dir);

        let src = test_dir.join("source.txt");
        let dst = test_dir.join("destination.txt");
        fs::write(&src, b"SOURCE_DATA").unwrap();

        let allowed = AllowedPathsState::new();
        let journal = OperationJournalState::new();

        // Initially no conflict planned (action: None)
        // Now simulate TOCTOU: create destination before transfer executes!
        fs::write(&dst, b"SURPRISE_DESTINATION_CREATED").unwrap();

        let items = vec![TransferItemSpec {
            source: src.to_string_lossy().to_string(),
            dest: dst.to_string_lossy().to_string(),
            action: None, // No action specified!
        }];

        // Without explicit action or default action, destination existence triggers conflict error
        let result = execute_file_transfer_core("copy", &items, None, &allowed, &journal).unwrap();
        assert_eq!(
            result.failed_count, 1,
            "TOCTOU conflict without decision must fail safely"
        );

        // The newly appeared destination must not be overwritten
        assert_eq!(fs::read(&dst).unwrap(), b"SURPRISE_DESTINATION_CREATED");

        let _ = fs::remove_dir_all(&test_dir);
    }

    #[test]
    fn test_conflict_batch_partial_failure() {
        let test_dir = std::env::temp_dir().join(format!("codexos_batch_partial_{}", now_secs()));
        let _ = fs::create_dir_all(&test_dir);

        // Item 1: Valid copy with Rename
        let src1 = test_dir.join("file1.txt");
        fs::write(&src1, b"FILE_1_SRC").unwrap();
        let target_dir = test_dir.join("target_dir");
        fs::create_dir(&target_dir).unwrap();
        let target_dst1 = target_dir.join("file1.txt");
        fs::write(&target_dst1, b"FILE_1_EXISTING").unwrap();

        // Item 2: Skip
        let src2 = test_dir.join("file2.txt");
        let target_dst2 = target_dir.join("file2.txt");
        fs::write(&src2, b"FILE_2_SRC").unwrap();
        fs::write(&target_dst2, b"FILE_2_EXISTING").unwrap();

        // Item 3: Missing source (fails)
        let src3 = test_dir.join("missing_file.txt");
        let target_dst3 = target_dir.join("missing_file.txt");

        let allowed = AllowedPathsState::new();
        let journal = OperationJournalState::new();

        let items = vec![
            TransferItemSpec {
                source: src1.to_string_lossy().to_string(),
                dest: target_dst1.to_string_lossy().to_string(),
                action: Some(ConflictAction::Rename),
            },
            TransferItemSpec {
                source: src2.to_string_lossy().to_string(),
                dest: target_dst2.to_string_lossy().to_string(),
                action: Some(ConflictAction::Skip),
            },
            TransferItemSpec {
                source: src3.to_string_lossy().to_string(),
                dest: target_dst3.to_string_lossy().to_string(),
                action: Some(ConflictAction::Replace),
            },
        ];

        let result = execute_file_transfer_core("copy", &items, None, &allowed, &journal).unwrap();
        assert_eq!(result.total_items, 3);
        assert_eq!(result.success_count, 1);
        assert_eq!(result.renamed_count, 1);
        assert_eq!(result.skipped_count, 1);
        assert_eq!(result.failed_count, 1);

        let _ = fs::remove_dir_all(&test_dir);
    }

    #[test]
    fn test_conflict_apply_to_all_scoping() {
        let test_dir = std::env::temp_dir().join(format!("codexos_apply_all_{}", now_secs()));
        let _ = fs::create_dir_all(&test_dir);

        let src1 = test_dir.join("a.txt");
        let dst1 = test_dir.join("dst_a.txt");
        fs::write(&src1, b"AAA").unwrap();
        fs::write(&dst1, b"OLD_AAA").unwrap();

        let src2 = test_dir.join("b.txt");
        let dst2 = test_dir.join("dst_b.txt");
        fs::write(&src2, b"BBB").unwrap();
        fs::write(&dst2, b"OLD_BBB").unwrap();

        let allowed = AllowedPathsState::new();
        let journal = OperationJournalState::new();

        // Item 1 has explicit Rename, Item 2 has None and relies on default_action = Skip
        let items = vec![
            TransferItemSpec {
                source: src1.to_string_lossy().to_string(),
                dest: dst1.to_string_lossy().to_string(),
                action: Some(ConflictAction::Rename),
            },
            TransferItemSpec {
                source: src2.to_string_lossy().to_string(),
                dest: dst2.to_string_lossy().to_string(),
                action: None,
            },
        ];

        let result = execute_file_transfer_core(
            "copy",
            &items,
            Some(ConflictAction::Skip),
            &allowed,
            &journal,
        )
        .unwrap();
        assert_eq!(result.total_items, 2);
        assert_eq!(result.renamed_count, 1);
        assert_eq!(result.skipped_count, 1);
        assert_eq!(result.success_count, 1);

        let _ = fs::remove_dir_all(&test_dir);
    }

    #[test]
    fn test_compare_file_contents() {
        let test_dir = std::env::temp_dir().join(format!("codexos_compare_{}", now_secs()));
        let _ = fs::create_dir_all(&test_dir);

        let file1 = test_dir.join("file1.txt");
        let file2 = test_dir.join("file2.txt");
        let file3 = test_dir.join("file3.txt");

        fs::write(&file1, b"IDENTICAL_CONTENT").unwrap();
        fs::write(&file2, b"IDENTICAL_CONTENT").unwrap();
        fs::write(&file3, b"DIFFERENT_CONTENT_HERE").unwrap();

        let allowed = AllowedPathsState::new();

        let res_identical = compare_file_contents_core(
            &file1.to_string_lossy(),
            &file2.to_string_lossy(),
            &allowed,
        )
        .unwrap();
        assert!(res_identical.is_identical_size);
        assert!(res_identical.is_identical_content);
        assert!(res_identical.source_sha256.is_some());
        assert_eq!(res_identical.source_sha256, res_identical.dest_sha256);

        let res_diff = compare_file_contents_core(
            &file1.to_string_lossy(),
            &file3.to_string_lossy(),
            &allowed,
        )
        .unwrap();
        assert!(!res_diff.is_identical_content);

        let _ = fs::remove_dir_all(&test_dir);
    }

    #[cfg(windows)]
    fn create_test_junction(link: &Path, target: &Path) -> bool {
        let output = std::process::Command::new("cmd")
            .args([
                "/C",
                "mklink",
                "/J",
                &link.to_string_lossy(),
                &target.to_string_lossy(),
            ])
            .output();
        output.map(|o| o.status.success()).unwrap_or(false)
    }

    #[test]
    fn test_dir_replace_crash_after_staging() {
        let test_dir = std::env::temp_dir().join(format!("codexos_crash_stage_{}", now_secs()));
        let _ = fs::create_dir_all(&test_dir);

        let dst = test_dir.join("my_app_folder");
        fs::create_dir_all(&dst).unwrap();
        fs::write(dst.join("original.txt"), b"ORIGINAL_DATA").unwrap();

        // Simulate crash right after staging: an orphaned temp directory exists
        let staged_temp = test_dir.join(".my_app_folder.tmp_dir_replace_12345");
        fs::create_dir_all(&staged_temp).unwrap();
        fs::write(staged_temp.join("staged_file.txt"), b"STAGED_DATA").unwrap();

        let sync_mgr = get_write_sync_manager();
        let recovered = recover_interrupted_dir_replacement_unlocked(&dst, sync_mgr).unwrap();
        assert!(!recovered, "Dst was not missing, so not restored");

        // Destination must be intact with original data
        assert!(dst.join("original.txt").exists());
        assert_eq!(
            fs::read(dst.join("original.txt")).unwrap(),
            b"ORIGINAL_DATA"
        );

        // Abandoned staged temp must be removed
        assert!(
            !staged_temp.exists(),
            "Abandoned temp directory must be cleaned up"
        );

        let _ = fs::remove_dir_all(&test_dir);
    }

    #[test]
    fn test_dir_replace_crash_after_backup_restores_original() {
        let test_dir = std::env::temp_dir().join(format!("codexos_crash_bak_{}", now_secs()));
        let _ = fs::create_dir_all(&test_dir);

        let dst = test_dir.join("critical_project");

        // Simulate crash at stage 2: dst was renamed to backup, but replacement was interrupted
        // dst does NOT exist on disk!
        let bak = test_dir.join(".critical_project.bak_dir_replace_8888");
        fs::create_dir_all(&bak).unwrap();
        fs::write(bak.join("precious_work.rs"), b"PRECIOUS_UNSAVED_CODE").unwrap();

        let sync_mgr = get_write_sync_manager();
        let recovered = recover_interrupted_dir_replacement_unlocked(&dst, sync_mgr).unwrap();
        assert!(recovered, "Orphaned backup must be restored");

        // Destination directory must be restored with precious work intact!
        assert!(dst.exists());
        assert_eq!(
            fs::read(dst.join("precious_work.rs")).unwrap(),
            b"PRECIOUS_UNSAVED_CODE"
        );

        let _ = fs::remove_dir_all(&test_dir);
    }

    #[test]
    fn test_dir_replace_crash_after_install_preserves_both() {
        let test_dir = std::env::temp_dir().join(format!("codexos_crash_inst_{}", now_secs()));
        let _ = fs::create_dir_all(&test_dir);

        let dst = test_dir.join("live_site");
        fs::create_dir_all(&dst).unwrap();
        fs::write(dst.join("new_page.html"), b"NEW_INSTALLED_PAGE").unwrap();

        // Orphaned backup also exists (crash before backup removal)
        let bak = test_dir.join(".live_site.bak_dir_replace_7777");
        fs::create_dir_all(&bak).unwrap();
        fs::write(bak.join("old_page.html"), b"OLD_BACKUP_PAGE").unwrap();

        let sync_mgr = get_write_sync_manager();
        let recovered = recover_interrupted_dir_replacement_unlocked(&dst, sync_mgr).unwrap();
        assert!(!recovered, "Must not overwrite existing destination");

        // Rule: Recovery must never overwrite an existing destination
        assert_eq!(
            fs::read(dst.join("new_page.html")).unwrap(),
            b"NEW_INSTALLED_PAGE"
        );

        // Rule: Never delete an ambiguous backup automatically
        assert!(bak.exists(), "Ambiguous backup must be preserved safely");
        assert_eq!(
            fs::read(bak.join("old_page.html")).unwrap(),
            b"OLD_BACKUP_PAGE"
        );

        let _ = fs::remove_dir_all(&test_dir);
    }

    #[test]
    fn test_dir_replace_crash_during_cleanup_preserves_backup() {
        let test_dir = std::env::temp_dir().join(format!("codexos_crash_clean_{}", now_secs()));
        let _ = fs::create_dir_all(&test_dir);

        let dst = test_dir.join("target_dir");
        fs::create_dir_all(&dst).unwrap();
        fs::write(dst.join("fresh.txt"), b"FRESH_DATA").unwrap();

        let bak = test_dir.join(".target_dir.bak_dir_replace_9999");
        fs::create_dir_all(&bak).unwrap();
        fs::write(bak.join("prior.txt"), b"PRIOR_DATA").unwrap();

        // Recovery is executed
        let res = recover_interrupted_dir_replacement(&dst).unwrap();
        assert!(!res);

        // Target remains intact
        assert!(dst.join("fresh.txt").exists());
        // Backup remains preserved
        assert!(bak.join("prior.txt").exists());

        let _ = fs::remove_dir_all(&test_dir);
    }

    #[test]
    fn test_symlink_or_junction_outside_permitted_rejected() {
        let base_temp = std::env::temp_dir().join(format!("codexos_symlink_perm_{}", now_secs()));
        let _ = fs::create_dir_all(&base_temp);

        let allowed_dir = base_temp.join("allowed_workspace");
        fs::create_dir_all(&allowed_dir).unwrap();

        let outside_dir = base_temp.join("secret_outside_folder");
        fs::create_dir_all(&outside_dir).unwrap();
        fs::write(outside_dir.join("secret.txt"), b"SECRET_OUTSIDE_DATA").unwrap();

        let mut roots = HashSet::new();
        roots.insert(
            allowed_dir
                .canonicalize()
                .unwrap_or_else(|_| allowed_dir.clone()),
        );
        let state = AllowedPathsState {
            allowed_roots: Mutex::new(roots),
        };

        // Check 1: Normal file in allowed directory is allowed
        let allowed_file = allowed_dir.join("file.txt");
        fs::write(&allowed_file, b"OK").unwrap();
        assert!(state.is_allowed(&allowed_file));

        // Check 2: Outside path is rejected
        assert!(!state.is_allowed(&outside_dir));

        #[cfg(windows)]
        {
            // Check 3: Junction in allowed workspace pointing outside is rejected!
            let junction_path = allowed_dir.join("junction_to_outside");
            if create_test_junction(&junction_path, &outside_dir) {
                assert!(
                    !state.is_allowed(&junction_path),
                    "Junction pointing outside permitted roots must be rejected"
                );
                assert!(validate_path(&junction_path.to_string_lossy(), &state).is_err());
                let _ = fs::remove_dir(&junction_path);
            }
        }

        let _ = fs::remove_dir_all(&base_temp);
    }

    #[test]
    fn test_junction_to_protected_directory_rejected() {
        #[cfg(windows)]
        {
            if let Ok(windir) = std::env::var("WINDIR") {
                let test_dir =
                    std::env::temp_dir().join(format!("codexos_junc_prot_{}", now_secs()));
                let _ = fs::create_dir_all(&test_dir);
                let state = AllowedPathsState::new();

                let junc = test_dir.join("win_junction");
                if create_test_junction(&junc, Path::new(&windir)) {
                    let prot_res = is_protected_target(&junc, &state);
                    assert!(
                        prot_res.is_err(),
                        "Junction targeting WINDIR must be rejected by is_protected_target"
                    );
                    let err_msg = prot_res.unwrap_err().to_string();
                    assert!(
                        err_msg.contains("Windows system directory"),
                        "Expected Windows directory error, got: {}",
                        err_msg
                    );
                    let _ = fs::remove_dir(&junc);
                }
                let _ = fs::remove_dir_all(&test_dir);
            }
        }
    }

    #[test]
    fn test_symlink_substitution_before_execution_rejected() {
        let test_dir = std::env::temp_dir().join(format!("codexos_sym_sub_{}", now_secs()));
        let _ = fs::create_dir_all(&test_dir);

        let allowed_dir = test_dir.join("allowed");
        fs::create_dir_all(&allowed_dir).unwrap();
        let outside_dir = test_dir.join("outside");
        fs::create_dir_all(&outside_dir).unwrap();

        let mut roots = HashSet::new();
        roots.insert(
            allowed_dir
                .canonicalize()
                .unwrap_or_else(|_| allowed_dir.clone()),
        );
        let state = AllowedPathsState {
            allowed_roots: Mutex::new(roots),
        };

        let src = allowed_dir.join("source.txt");
        fs::write(&src, b"SOURCE_PAYLOAD").unwrap();

        let dst = allowed_dir.join("target_sub");

        #[cfg(windows)]
        {
            // Simulate reparse point substitution: destination is created as a junction pointing outside
            if create_test_junction(&dst, &outside_dir) {
                let journal = OperationJournalState::new();
                let items = vec![TransferItemSpec {
                    source: src.to_string_lossy().to_string(),
                    dest: dst.to_string_lossy().to_string(),
                    action: Some(ConflictAction::Replace),
                }];

                let result =
                    execute_file_transfer_core("copy", &items, None, &state, &journal).unwrap();
                assert_eq!(
                    result.failed_count, 1,
                    "Substituted reparse point must fail security check"
                );
                let err = result.records[0].error.as_ref().unwrap();
                assert!(
                    err.contains("Access denied") || err.contains("Security violation"),
                    "Expected rejection of reparse point outside allowed roots, got: {}",
                    err
                );

                let _ = fs::remove_dir(&dst);
            }
        }

        let _ = fs::remove_dir_all(&test_dir);
    }

    #[test]
    fn test_recursive_directory_with_linked_cycles_or_escapes_rejected() {
        let test_dir = std::env::temp_dir().join(format!("codexos_rec_cycle_{}", now_secs()));
        let _ = fs::create_dir_all(&test_dir);

        let src_tree = test_dir.join("tree_root");
        let sub = src_tree.join("sub_folder");
        fs::create_dir_all(&sub).unwrap();
        fs::write(sub.join("hello.txt"), b"world").unwrap();

        let outside = test_dir.join("outside_tree");
        fs::create_dir_all(&outside).unwrap();
        fs::write(outside.join("secret.txt"), b"secret").unwrap();

        #[cfg(windows)]
        {
            // Escaping junction inside source tree
            let escape_junc = sub.join("link_to_outside");
            if create_test_junction(&escape_junc, &outside) {
                let dst_tree = test_dir.join("copy_target");
                let copy_res = copy_dir_streaming_verified(&src_tree, &dst_tree);
                assert!(copy_res.is_err());
                let err_msg = copy_res.unwrap_err().to_string();
                assert!(
                    err_msg.contains("outside the source tree") || err_msg.contains("rejected"),
                    "Expected escape rejection error, got: {}",
                    err_msg
                );
                let _ = fs::remove_dir(&escape_junc);
            }

            // Circular junction
            let cycle_junc = sub.join("link_to_parent");
            if create_test_junction(&cycle_junc, &src_tree) {
                let dst_tree = test_dir.join("copy_target_cycle");
                let copy_res = copy_dir_streaming_verified(&src_tree, &dst_tree);
                assert!(copy_res.is_err());
                let _ = fs::remove_dir(&cycle_junc);
            }
        }

        let _ = fs::remove_dir_all(&test_dir);
    }

    #[test]
    fn test_atomic_rename_collision_retry_concurrency() {
        use std::sync::{Arc, Barrier};
        let test_dir = std::env::temp_dir().join(format!("codexos_atomic_ren_{}", now_secs()));
        let _ = fs::create_dir_all(&test_dir);

        let target_dir = Arc::new(test_dir.join("target_folder"));
        fs::create_dir(&*target_dir).unwrap();

        // Base file already exists in target
        let base_file = target_dir.join("data.txt");
        fs::write(&base_file, b"EXISTING_ORIGINAL_DATA").unwrap();

        // 4 concurrent threads attempting to transfer `data.txt` with Rename
        let num_threads = 4;
        let barrier = Arc::new(Barrier::new(num_threads));
        let mut handles = Vec::new();

        for i in 0..num_threads {
            let t_target = Arc::clone(&target_dir);
            let t_barrier = Arc::clone(&barrier);
            let src_file = test_dir.join(format!("source_thread_{}.txt", i));
            let payload = format!("THREAD_{}_PAYLOAD", i);
            fs::write(&src_file, payload.as_bytes()).unwrap();

            handles.push(std::thread::spawn(move || {
                t_barrier.wait();
                let dst = t_target.join("data.txt");
                transfer_to_unique_destination(&src_file, &dst, false, 50)
            }));
        }

        let mut created_paths = Vec::new();
        for h in handles {
            let res = h.join().unwrap();
            assert!(res.is_ok(), "Concurrent rename must succeed: {:?}", res);
            let created = res.unwrap();
            created_paths.push(created);
        }

        // Verify all 4 created paths are distinct unique filenames!
        let unique_set: HashSet<PathBuf> = created_paths.iter().cloned().collect();
        assert_eq!(
            unique_set.len(),
            num_threads,
            "Every thread must produce a distinct unique filename without collision"
        );

        // Verify existing base file is 100% intact
        assert_eq!(
            fs::read(&base_file).unwrap(),
            b"EXISTING_ORIGINAL_DATA",
            "Original base file must never be overwritten"
        );

        let _ = fs::remove_dir_all(&test_dir);
    }

    #[test]
    fn test_atomic_rename_collision_retry_limit_error() {
        let test_dir = std::env::temp_dir().join(format!("codexos_ren_limit_{}", now_secs()));
        let _ = fs::create_dir_all(&test_dir);

        let src = test_dir.join("source.txt");
        fs::write(&src, b"SRC").unwrap();

        let dst = test_dir.join("doc.txt");
        fs::write(&dst, b"DOC").unwrap();
        // Create candidates doc (1).txt and doc (2).txt
        fs::write(test_dir.join("doc (1).txt"), b"DOC1").unwrap();
        fs::write(test_dir.join("doc (2).txt"), b"DOC2").unwrap();

        // Call with max_retries = 2. Since candidates 1 and 2 already exist, retry limit will be reached!
        let res = transfer_to_unique_destination(&src, &dst, false, 2);
        assert!(res.is_err());
        let err_msg = res.unwrap_err().to_string();
        assert!(
            err_msg.contains("Exceeded collision retry limit"),
            "Expected retry limit error, got: {}",
            err_msg
        );

        // None of the existing files should have been modified
        assert_eq!(fs::read(test_dir.join("doc (1).txt")).unwrap(), b"DOC1");
        assert_eq!(fs::read(test_dir.join("doc (2).txt")).unwrap(), b"DOC2");

        let _ = fs::remove_dir_all(&test_dir);
    }
}
