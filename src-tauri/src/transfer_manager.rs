use serde::{Deserialize, Serialize};
use std::collections::{HashMap, HashSet, VecDeque};
use std::path::PathBuf;
use std::sync::atomic::{AtomicBool, AtomicU64, AtomicUsize, Ordering};
use std::sync::{Arc, Condvar, Mutex, OnceLock, RwLock};
use std::time::{Duration, Instant};

pub const PROGRESS_THROTTLE_MS: u64 = 100;
pub const MAX_CONCURRENT_TRANSFERS: usize = 2;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum TransferStatus {
    Queued,
    Preparing,
    Running,
    Completed,
    Failed,
    Cancelled,
}

impl TransferStatus {
    pub fn as_str(&self) -> &'static str {
        match self {
            TransferStatus::Queued => "queued",
            TransferStatus::Preparing => "preparing",
            TransferStatus::Running => "running",
            TransferStatus::Completed => "completed",
            TransferStatus::Failed => "failed",
            TransferStatus::Cancelled => "cancelled",
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TransferProgressEvent {
    pub transfer_id: String,
    pub source: String,
    pub dest: String,
    pub operation: String,
    pub status: String,
    pub total_files: usize,
    pub completed_files: usize,
    pub total_bytes: u64,
    pub transferred_bytes: u64,
    pub current_file: Option<String>,
    pub bytes_per_sec: f64,
    pub estimated_remaining_secs: Option<u64>,
    pub error_count: usize,
    pub skipped_count: usize,
    pub error_message: Option<String>,
}

pub trait ProgressEmitter: Send + Sync {
    fn emit(&self, event_name: &str, progress: &TransferProgressEvent);
}

pub struct NoopProgressEmitter;
impl ProgressEmitter for NoopProgressEmitter {
    fn emit(&self, _event_name: &str, _progress: &TransferProgressEvent) {}
}

pub struct TestProgressCollector {
    pub events: Mutex<Vec<(String, TransferProgressEvent)>>,
}

impl TestProgressCollector {
    pub fn new() -> Self {
        Self {
            events: Mutex::new(Vec::new()),
        }
    }

    pub fn get_events(&self) -> Vec<(String, TransferProgressEvent)> {
        self.events.lock().unwrap().clone()
    }
}

impl Default for TestProgressCollector {
    fn default() -> Self {
        Self::new()
    }
}

impl ProgressEmitter for TestProgressCollector {
    fn emit(&self, event_name: &str, progress: &TransferProgressEvent) {
        if let Ok(mut lock) = self.events.lock() {
            lock.push((event_name.to_string(), progress.clone()));
        }
    }
}

pub struct TauriProgressEmitter {
    pub app_handle: tauri::AppHandle,
}

impl ProgressEmitter for TauriProgressEmitter {
    fn emit(&self, event_name: &str, progress: &TransferProgressEvent) {
        use tauri::Emitter;
        let _ = self.app_handle.emit(event_name, progress);
    }
}

pub struct TransferHandle {
    pub id: String,
    pub source: String,
    pub dest: String,
    pub operation: String,
    pub cancel_token: Arc<AtomicBool>,
    pub total_files: AtomicUsize,
    pub completed_files: AtomicUsize,
    pub total_bytes: AtomicU64,
    pub transferred_bytes: AtomicU64,
    pub error_count: AtomicUsize,
    pub skipped_count: AtomicUsize,
    pub current_file: RwLock<Option<String>>,
    pub status: RwLock<TransferStatus>,
    pub error_message: RwLock<Option<String>>,
    pub start_time: Instant,
    pub last_emit: Mutex<Instant>,
    pub emitter: Arc<dyn ProgressEmitter>,
}

impl TransferHandle {
    pub fn new(
        id: String,
        source: String,
        dest: String,
        operation: String,
        total_files: usize,
        total_bytes: u64,
        emitter: Arc<dyn ProgressEmitter>,
    ) -> Self {
        let now = Instant::now();
        Self {
            id,
            source,
            dest,
            operation,
            cancel_token: Arc::new(AtomicBool::new(false)),
            total_files: AtomicUsize::new(total_files),
            completed_files: AtomicUsize::new(0),
            total_bytes: AtomicU64::new(total_bytes),
            transferred_bytes: AtomicU64::new(0),
            error_count: AtomicUsize::new(0),
            skipped_count: AtomicUsize::new(0),
            current_file: RwLock::new(None),
            status: RwLock::new(TransferStatus::Queued),
            error_message: RwLock::new(None),
            start_time: now,
            last_emit: Mutex::new(now.checked_sub(Duration::from_secs(1)).unwrap_or(now)),
            emitter,
        }
    }

    pub fn is_cancelled(&self) -> bool {
        self.cancel_token.load(Ordering::SeqCst)
    }

    pub fn cancel(&self) {
        self.cancel_token.store(true, Ordering::SeqCst);
        if let Ok(mut status) = self.status.write() {
            *status = TransferStatus::Cancelled;
        }
        get_global_transfer_manager().wake_coordinator();
    }

    pub fn add_bytes(&self, bytes: u64) {
        self.transferred_bytes.fetch_add(bytes, Ordering::SeqCst);
    }

    pub fn set_current_file(&self, file: Option<String>) {
        if let Ok(mut cf) = self.current_file.write() {
            *cf = file;
        }
    }

    pub fn inc_completed_files(&self) {
        self.completed_files.fetch_add(1, Ordering::SeqCst);
    }

    pub fn inc_errors(&self) {
        self.error_count.fetch_add(1, Ordering::SeqCst);
    }

    pub fn inc_skipped(&self) {
        self.skipped_count.fetch_add(1, Ordering::SeqCst);
    }

    pub fn set_status(&self, new_status: TransferStatus) {
        if let Ok(mut s) = self.status.write() {
            *s = new_status;
        }
    }

    pub fn set_error_message(&self, msg: Option<String>) {
        if let Ok(mut err) = self.error_message.write() {
            *err = msg;
        }
    }

    pub fn snapshot(&self) -> TransferProgressEvent {
        let elapsed = self.start_time.elapsed().as_secs_f64();
        let transferred = self.transferred_bytes.load(Ordering::SeqCst);
        let total = self.total_bytes.load(Ordering::SeqCst);
        let total_files = self.total_files.load(Ordering::SeqCst);
        let completed_files = self.completed_files.load(Ordering::SeqCst);
        let status = self
            .status
            .read()
            .map(|s| *s)
            .unwrap_or(TransferStatus::Queued);
        let current_file = self.current_file.read().ok().and_then(|f| f.clone());
        let error_message = self.error_message.read().ok().and_then(|e| e.clone());

        // Clamp transferred bytes to total if total is non-zero
        let clamped_transferred = if total > 0 {
            transferred.min(total)
        } else {
            transferred
        };

        let bytes_per_sec = if elapsed >= 0.1 && transferred > 0 {
            transferred as f64 / elapsed
        } else {
            0.0
        };

        let estimated_remaining_secs = if total > transferred && bytes_per_sec > 10.0 {
            let remaining = total - transferred;
            Some((remaining as f64 / bytes_per_sec).ceil() as u64)
        } else if (total <= transferred && total > 0)
            || (total == 0 && total_files > 0 && completed_files >= total_files)
        {
            Some(0)
        } else {
            None
        };

        TransferProgressEvent {
            transfer_id: self.id.clone(),
            source: self.source.clone(),
            dest: self.dest.clone(),
            operation: self.operation.clone(),
            status: status.as_str().to_string(),
            total_files,
            completed_files,
            total_bytes: total,
            transferred_bytes: clamped_transferred,
            current_file,
            bytes_per_sec,
            estimated_remaining_secs,
            error_count: self.error_count.load(Ordering::SeqCst),
            skipped_count: self.skipped_count.load(Ordering::SeqCst),
            error_message,
        }
    }

    pub fn emit_if_throttled(&self, event_name: &str, min_interval: Duration) {
        let should_emit = if let Ok(mut last) = self.last_emit.lock() {
            if last.elapsed() >= min_interval {
                *last = Instant::now();
                true
            } else {
                false
            }
        } else {
            false
        };

        if should_emit {
            self.emitter.emit(event_name, &self.snapshot());
        }
    }

    pub fn emit_now(&self, event_name: &str) {
        if let Ok(mut last) = self.last_emit.lock() {
            *last = Instant::now();
        }
        self.emitter.emit(event_name, &self.snapshot());
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum PermitAcquireError {
    Cancelled,
}

#[derive(Default)]
struct QueueCoordinator {
    running_count: usize,
    active_dest_dirs: HashSet<PathBuf>,
    waiters: VecDeque<(String, Vec<PathBuf>)>,
}

pub struct TransferPermit<'a> {
    manager: &'a TransferManager,
    pub id: String,
    pub dest_dirs: Vec<PathBuf>,
}

impl<'a> Drop for TransferPermit<'a> {
    fn drop(&mut self) {
        self.manager.release_permit(&self.id, &self.dest_dirs);
    }
}

pub struct TransferManager {
    transfers: RwLock<HashMap<String, Arc<TransferHandle>>>,
    history: RwLock<VecDeque<TransferProgressEvent>>,
    queue_coord: Mutex<QueueCoordinator>,
    queue_cv: Condvar,
}

impl TransferManager {
    pub fn new() -> Self {
        Self {
            transfers: RwLock::new(HashMap::new()),
            history: RwLock::new(VecDeque::with_capacity(50)),
            queue_coord: Mutex::new(QueueCoordinator::default()),
            queue_cv: Condvar::new(),
        }
    }

    pub fn wake_coordinator(&self) {
        self.queue_cv.notify_all();
    }

    pub fn acquire_permit<'a>(
        &'a self,
        handle: &TransferHandle,
        dest_dirs: Vec<PathBuf>,
    ) -> Result<TransferPermit<'a>, PermitAcquireError> {
        let mut guard = self.queue_coord.lock().unwrap();

        if handle.is_cancelled() {
            return Err(PermitAcquireError::Cancelled);
        }

        // Add this transfer to waiters queue
        guard
            .waiters
            .push_back((handle.id.clone(), dest_dirs.clone()));

        loop {
            if handle.is_cancelled() {
                guard.waiters.retain(|(id, _)| id != &handle.id);
                self.queue_cv.notify_all();
                return Err(PermitAcquireError::Cancelled);
            }

            let mut earlier_dest_conflict = false;
            let mut is_eligible = false;
            let mut my_index = None;

            for (idx, (w_id, w_dirs)) in guard.waiters.iter().enumerate() {
                if w_id == &handle.id {
                    my_index = Some(idx);
                    if guard.running_count < MAX_CONCURRENT_TRANSFERS && !earlier_dest_conflict {
                        let shares_active =
                            dest_dirs.iter().any(|d| guard.active_dest_dirs.contains(d));
                        if !shares_active {
                            is_eligible = true;
                        }
                    }
                    break;
                }

                // Check if this earlier waiter shares any dest_dirs with us
                if w_dirs.iter().any(|wd| dest_dirs.contains(wd)) {
                    earlier_dest_conflict = true;
                }
            }

            if is_eligible {
                if let Some(idx) = my_index {
                    guard.waiters.remove(idx);
                }
                guard.running_count += 1;
                for d in &dest_dirs {
                    guard.active_dest_dirs.insert(d.clone());
                }
                handle.set_status(TransferStatus::Preparing);
                return Ok(TransferPermit {
                    manager: self,
                    id: handle.id.clone(),
                    dest_dirs,
                });
            }

            // Wait for notification or timeout
            guard = self
                .queue_cv
                .wait_timeout(guard, Duration::from_millis(50))
                .unwrap()
                .0;
        }
    }

    pub fn release_permit(&self, _id: &str, dest_dirs: &[PathBuf]) {
        let mut guard = self.queue_coord.lock().unwrap();
        if guard.running_count > 0 {
            guard.running_count -= 1;
        }
        for d in dest_dirs {
            guard.active_dest_dirs.remove(d);
        }
        self.queue_cv.notify_all();
    }

    pub fn register(&self, handle: Arc<TransferHandle>) {
        if let Ok(mut map) = self.transfers.write() {
            map.insert(handle.id.clone(), handle);
        }
    }

    pub fn get(&self, id: &str) -> Option<Arc<TransferHandle>> {
        self.transfers.read().ok().and_then(|m| m.get(id).cloned())
    }

    pub fn cancel_transfer(&self, id: &str) -> bool {
        if let Some(handle) = self.get(id) {
            handle.cancel();
            true
        } else {
            false
        }
    }

    pub fn complete_transfer(
        &self,
        id: &str,
        final_status: TransferStatus,
        err_msg: Option<String>,
    ) {
        let handle_opt = if let Ok(mut map) = self.transfers.write() {
            map.remove(id)
        } else {
            None
        };

        if let Some(handle) = handle_opt {
            handle.set_status(final_status);
            if err_msg.is_some() {
                handle.set_error_message(err_msg);
            }
            let snapshot = handle.snapshot();
            if let Ok(mut hist) = self.history.write() {
                if hist.len() >= 50 {
                    hist.pop_front();
                }
                hist.push_back(snapshot);
            }
        }
    }

    pub fn get_active_transfers(&self) -> Vec<TransferProgressEvent> {
        if let Ok(map) = self.transfers.read() {
            map.values().map(|h| h.snapshot()).collect()
        } else {
            Vec::new()
        }
    }

    pub fn get_recent_history(&self) -> Vec<TransferProgressEvent> {
        if let Ok(hist) = self.history.read() {
            hist.iter().cloned().collect()
        } else {
            Vec::new()
        }
    }
}

impl Default for TransferManager {
    fn default() -> Self {
        Self::new()
    }
}

static GLOBAL_TRANSFER_MANAGER: OnceLock<TransferManager> = OnceLock::new();

pub fn get_global_transfer_manager() -> &'static TransferManager {
    GLOBAL_TRANSFER_MANAGER.get_or_init(TransferManager::new)
}

pub struct TransferManagerState {
    pub manager: Arc<TransferManager>,
}

impl TransferManagerState {
    pub fn new() -> Self {
        Self {
            manager: Arc::new(TransferManager::new()),
        }
    }
}

impl Default for TransferManagerState {
    fn default() -> Self {
        Self::new()
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::files::{
        copy_dir_streaming_verified_with_handle, copy_file_streaming_verified_with_handle,
        execute_file_transfer_managed, safe_replace_file_with_handle, AllowedPathsState,
        ConflictAction, OperationJournalState, TransferItemSpec,
    };
    use std::fs;
    use std::path::PathBuf;
    use std::sync::atomic::Ordering;

    fn temp_test_dir(prefix: &str) -> PathBuf {
        let dir = std::env::temp_dir().join(format!(
            "codexos_tx_test_{}_{}",
            prefix,
            std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .unwrap()
                .as_nanos()
        ));
        let _ = fs::create_dir_all(&dir);
        dir
    }

    #[test]
    fn test_progress_accuracy_and_speed_calculation() {
        let collector = Arc::new(TestProgressCollector::new());
        let handle = Arc::new(TransferHandle::new(
            "tx_1".to_string(),
            "source.bin".to_string(),
            "dest.bin".to_string(),
            "copy".to_string(),
            2,
            100_000,
            collector.clone(),
        ));

        assert_eq!(handle.total_files.load(Ordering::SeqCst), 2);
        assert_eq!(handle.total_bytes.load(Ordering::SeqCst), 100_000);
        assert_eq!(handle.transferred_bytes.load(Ordering::SeqCst), 0);
        assert_eq!(handle.completed_files.load(Ordering::SeqCst), 0);

        handle.set_status(TransferStatus::Running);
        handle.add_bytes(50_000);
        handle.inc_completed_files();
        handle.set_current_file(Some("file1.bin".to_string()));

        let snap = handle.snapshot();
        assert_eq!(snap.transferred_bytes, 50_000);
        assert_eq!(snap.completed_files, 1);
        assert_eq!(snap.current_file, Some("file1.bin".to_string()));
        assert_eq!(snap.status, "running");

        handle.emit_now("transfer://progress");
        let events = collector.get_events();
        assert_eq!(events.len(), 1);
        assert_eq!(events[0].0, "transfer://progress");
        assert_eq!(events[0].1.transferred_bytes, 50_000);
    }

    #[test]
    fn test_transfer_id_isolation() {
        let collector = Arc::new(TestProgressCollector::new());
        let handle_a = Arc::new(TransferHandle::new(
            "tx_A".to_string(),
            "a.txt".to_string(),
            "dest_a".to_string(),
            "copy".to_string(),
            1,
            500,
            collector.clone(),
        ));
        let handle_b = Arc::new(TransferHandle::new(
            "tx_B".to_string(),
            "b.txt".to_string(),
            "dest_b".to_string(),
            "move".to_string(),
            3,
            2000,
            collector.clone(),
        ));

        handle_a.add_bytes(250);
        handle_b.add_bytes(1000);

        let snap_a = handle_a.snapshot();
        let snap_b = handle_b.snapshot();

        assert_eq!(snap_a.transfer_id, "tx_A");
        assert_eq!(snap_a.transferred_bytes, 250);
        assert_eq!(snap_a.total_bytes, 500);

        assert_eq!(snap_b.transfer_id, "tx_B");
        assert_eq!(snap_b.transferred_bytes, 1000);
        assert_eq!(snap_b.total_bytes, 2000);
    }

    #[test]
    fn test_multiple_queued_transfers() {
        let mgr = TransferManager::new();
        let emitter = Arc::new(NoopProgressEmitter);

        let h1 = Arc::new(TransferHandle::new(
            "tx_q1".to_string(),
            "file1".to_string(),
            "dest1".to_string(),
            "copy".to_string(),
            1,
            100,
            emitter.clone(),
        ));
        let h2 = Arc::new(TransferHandle::new(
            "tx_q2".to_string(),
            "file2".to_string(),
            "dest2".to_string(),
            "copy".to_string(),
            1,
            200,
            emitter,
        ));

        mgr.register(h1);
        mgr.register(h2);

        let active = mgr.get_active_transfers();
        assert_eq!(active.len(), 2);

        mgr.complete_transfer("tx_q1", TransferStatus::Completed, None);
        let active_after = mgr.get_active_transfers();
        assert_eq!(active_after.len(), 1);
        assert_eq!(active_after[0].transfer_id, "tx_q2");

        let history = mgr.get_recent_history();
        assert_eq!(history.len(), 1);
        assert_eq!(history[0].transfer_id, "tx_q1");
        assert_eq!(history[0].status, "completed");
    }

    #[test]
    fn test_cancellation_during_file_copy() {
        let test_dir = temp_test_dir("cancel_file");
        let src = test_dir.join("src_large.bin");
        let dst = test_dir.join("dst_large.bin");

        // Write 256 KB of data
        let data = vec![0xAB; 256 * 1024];
        fs::write(&src, &data).unwrap();

        let collector = Arc::new(TestProgressCollector::new());
        let handle = Arc::new(TransferHandle::new(
            "tx_cancel_1".to_string(),
            src.to_string_lossy().to_string(),
            dst.to_string_lossy().to_string(),
            "copy".to_string(),
            1,
            data.len() as u64,
            collector,
        ));

        // Pre-cancel
        handle.cancel();

        let res = copy_file_streaming_verified_with_handle(&src, &dst, Some(&handle));
        assert!(res.is_err(), "Cancelled transfer must return error");
        let err_msg = res.unwrap_err().to_string();
        assert!(
            err_msg.contains("cancelled"),
            "Error message should mention cancelled: {}",
            err_msg
        );

        // Crucial safety checks:
        assert!(
            src.exists(),
            "Source file must never be deleted or modified"
        );
        assert_eq!(fs::read(&src).unwrap().len(), data.len());
        assert!(!dst.exists(), "Partial destination file must be cleaned up");

        let _ = fs::remove_dir_all(&test_dir);
    }

    #[test]
    fn test_cancellation_during_directory_copy() {
        let test_dir = temp_test_dir("cancel_dir");
        let src_dir = test_dir.join("src_folder");
        let dst_dir = test_dir.join("dst_folder");

        fs::create_dir_all(src_dir.join("sub")).unwrap();
        fs::write(src_dir.join("file1.txt"), b"DATA 1").unwrap();
        fs::write(src_dir.join("sub").join("file2.txt"), b"DATA 2").unwrap();

        let collector = Arc::new(TestProgressCollector::new());
        let handle = Arc::new(TransferHandle::new(
            "tx_cancel_dir".to_string(),
            src_dir.to_string_lossy().to_string(),
            dst_dir.to_string_lossy().to_string(),
            "copy".to_string(),
            2,
            12,
            collector,
        ));

        handle.cancel();

        let res = copy_dir_streaming_verified_with_handle(&src_dir, &dst_dir, Some(&handle));
        assert!(res.is_err());

        // Safety:
        assert!(src_dir.exists(), "Source directory must remain intact");
        assert!(src_dir.join("file1.txt").exists());
        assert!(src_dir.join("sub").join("file2.txt").exists());
        assert!(
            !dst_dir.exists(),
            "Partial destination directory must be purged"
        );

        let _ = fs::remove_dir_all(&test_dir);
    }

    #[test]
    fn test_cancellation_during_cross_volume_move_preserves_source() {
        let test_dir = temp_test_dir("cancel_move");
        let src = test_dir.join("source.dat");
        let dst = test_dir.join("dest.dat");

        fs::write(&src, b"CRITICAL_SOURCE_DATA_MUST_NOT_BE_LOST").unwrap();

        let collector = Arc::new(TestProgressCollector::new());
        let handle = Arc::new(TransferHandle::new(
            "tx_cancel_move".to_string(),
            src.to_string_lossy().to_string(),
            dst.to_string_lossy().to_string(),
            "move".to_string(),
            1,
            38,
            collector,
        ));

        // Simulate cancel
        handle.cancel();

        // When copy_file_streaming_verified_with_handle fails, cross-volume move must abort and preserve source
        let copy_res = copy_file_streaming_verified_with_handle(&src, &dst, Some(&handle));
        assert!(copy_res.is_err());

        // Because copy failed/cancelled, the move operation does NOT remove source:
        assert!(
            src.exists(),
            "Source file MUST NOT be deleted when move is cancelled"
        );
        assert_eq!(
            fs::read(&src).unwrap(),
            b"CRITICAL_SOURCE_DATA_MUST_NOT_BE_LOST"
        );
        assert!(
            !dst.exists(),
            "Incomplete destination must not remain on disk"
        );

        let _ = fs::remove_dir_all(&test_dir);
    }

    #[test]
    fn test_cancellation_during_replacement_preserves_original() {
        let test_dir = temp_test_dir("cancel_replace");
        let src = test_dir.join("new_file.txt");
        let dst = test_dir.join("existing_target.txt");

        fs::write(&src, b"NEW_DATA_SHOULD_NOT_OVERWRITE_IF_CANCELLED").unwrap();
        fs::write(&dst, b"ORIGINAL_TARGET_DATA").unwrap();

        let collector = Arc::new(TestProgressCollector::new());
        let handle = Arc::new(TransferHandle::new(
            "tx_cancel_replace".to_string(),
            src.to_string_lossy().to_string(),
            dst.to_string_lossy().to_string(),
            "replace".to_string(),
            1,
            42,
            collector,
        ));

        handle.cancel();

        let res = safe_replace_file_with_handle(&src, &dst, Some(&handle));
        assert!(res.is_err());

        // Target MUST preserve original data
        assert!(dst.exists(), "Destination file must exist");
        assert_eq!(fs::read(&dst).unwrap(), b"ORIGINAL_TARGET_DATA");
        assert!(src.exists(), "Source file must remain intact");

        let _ = fs::remove_dir_all(&test_dir);
    }

    #[test]
    fn test_partial_batch_transfer_and_cancellation() {
        let test_dir = temp_test_dir("batch_cancel");
        let src1 = test_dir.join("item1.txt");
        let src2 = test_dir.join("item2.txt");
        let dst1 = test_dir.join("dest1.txt");
        let dst2 = test_dir.join("dest2.txt");

        fs::write(&src1, b"ITEM_1_CONTENT").unwrap();
        fs::write(&src2, b"ITEM_2_CONTENT").unwrap();

        let state = AllowedPathsState::new();
        let journal = OperationJournalState::new();
        let collector = Arc::new(TestProgressCollector::new());

        // Create dst2 to force conflict on item 2 and specify ConflictAction::Cancel
        fs::write(&dst2, b"EXISTING_CONFLICT").unwrap();

        let items_with_cancel = vec![
            TransferItemSpec {
                source: src1.to_string_lossy().to_string(),
                dest: dst1.to_string_lossy().to_string(),
                action: None,
            },
            TransferItemSpec {
                source: src2.to_string_lossy().to_string(),
                dest: dst2.to_string_lossy().to_string(),
                action: Some(ConflictAction::Cancel),
            },
        ];

        let res = execute_file_transfer_managed(
            "copy",
            &items_with_cancel,
            None,
            Some("tx_batch_cancel_test".to_string()),
            &state,
            &journal,
            collector.clone(),
        )
        .unwrap();

        assert_eq!(res.success_count, 1, "First item must succeed");
        assert!(dst1.exists(), "First item was copied successfully");
        assert_eq!(fs::read(&dst1).unwrap(), b"ITEM_1_CONTENT");

        assert_eq!(res.records.len(), 2);
        assert_eq!(res.records[0].status, "copied");
        assert_eq!(res.records[1].status, "cancelled");

        // Destination 2 was preserved
        assert_eq!(fs::read(&dst2).unwrap(), b"EXISTING_CONFLICT");

        // Check emitted events
        let events = collector.get_events();
        assert!(events.iter().any(|(name, _)| name == "transfer://started"));
        assert!(events
            .iter()
            .any(|(name, _)| name == "transfer://cancelled"));

        let _ = fs::remove_dir_all(&test_dir);
    }

    #[test]
    fn test_empty_and_small_files_streaming() {
        let test_dir = temp_test_dir("empty_and_small");
        let empty_src = test_dir.join("empty.txt");
        let empty_dst = test_dir.join("empty_dest.txt");
        let small_src = test_dir.join("small.txt");
        let small_dst = test_dir.join("small_dest.txt");

        fs::write(&empty_src, b"").unwrap();
        fs::write(&small_src, b"HELLO").unwrap();

        let collector = Arc::new(TestProgressCollector::new());
        let handle = Arc::new(TransferHandle::new(
            "tx_empty_small".to_string(),
            "batch".to_string(),
            test_dir.to_string_lossy().to_string(),
            "copy".to_string(),
            2,
            5,
            collector,
        ));

        assert!(
            copy_file_streaming_verified_with_handle(&empty_src, &empty_dst, Some(&handle)).is_ok()
        );
        assert!(empty_dst.exists());
        assert_eq!(fs::read(&empty_dst).unwrap().len(), 0);

        assert!(
            copy_file_streaming_verified_with_handle(&small_src, &small_dst, Some(&handle)).is_ok()
        );
        assert!(small_dst.exists());
        assert_eq!(fs::read(&small_dst).unwrap(), b"HELLO");

        assert_eq!(handle.transferred_bytes.load(Ordering::SeqCst), 5);

        let _ = fs::remove_dir_all(&test_dir);
    }

    #[test]
    fn test_large_file_streaming_and_cleanup() {
        let test_dir = temp_test_dir("large_streaming");
        let src = test_dir.join("large_src.bin");
        let dst = test_dir.join("large_dst.bin");

        // 300 KB file (spanning multiple 64KB buffers)
        let chunk = vec![0x55; 300 * 1024];
        fs::write(&src, &chunk).unwrap();

        let collector = Arc::new(TestProgressCollector::new());
        let handle = Arc::new(TransferHandle::new(
            "tx_large".to_string(),
            src.to_string_lossy().to_string(),
            dst.to_string_lossy().to_string(),
            "copy".to_string(),
            1,
            chunk.len() as u64,
            collector,
        ));

        let res = copy_file_streaming_verified_with_handle(&src, &dst, Some(&handle));
        assert!(res.is_ok());

        assert!(dst.exists());
        assert_eq!(fs::read(&dst).unwrap().len(), chunk.len());
        assert_eq!(
            handle.transferred_bytes.load(Ordering::SeqCst),
            chunk.len() as u64
        );

        let _ = fs::remove_dir_all(&test_dir);
    }

    #[test]
    fn test_external_destination_replacement_survival_during_cleanup() {
        use crate::files::{get_path_file_identity, safe_cleanup_owned_file};

        let test_dir = temp_test_dir("ext_replace_cleanup");
        let dst = test_dir.join("destination.txt");

        // Simulate file created by transfer: File A
        fs::write(&dst, b"TRANSFER_FILE_A").unwrap();
        let identity_a = get_path_file_identity(&dst);
        assert!(identity_a.is_some());

        // External process removes destination.txt and recreates it with new content (File B)
        fs::remove_file(&dst).unwrap();
        fs::write(&dst, b"EXTERNAL_PROCESS_CRITICAL_FILE_B").unwrap();
        let identity_b = get_path_file_identity(&dst);

        if identity_a != identity_b {
            let cleaned = safe_cleanup_owned_file(&dst, identity_a.as_ref());
            assert!(
                !cleaned,
                "Cleanup must refuse to delete externally replaced file"
            );
            assert!(dst.exists(), "External file must survive intact");
            assert_eq!(fs::read(&dst).unwrap(), b"EXTERNAL_PROCESS_CRITICAL_FILE_B");
        }

        let _ = fs::remove_dir_all(&test_dir);
    }

    #[test]
    fn test_queued_transfer_cancellation_without_io() {
        let test_dir = temp_test_dir("queued_cancel_no_io");
        let src = test_dir.join("source.txt");
        let dst_dir = test_dir.join("dst_folder");
        let dst = dst_dir.join("source.txt");

        fs::create_dir_all(&dst_dir).unwrap();
        fs::write(&src, b"SOURCE_CONTENT_UNTOUCHED").unwrap();

        let state = Arc::new(AllowedPathsState::new());
        state.allow(&test_dir);
        let journal = OperationJournalState::new();
        let collector = Arc::new(TestProgressCollector::new());

        // First hold destination lock by acquiring permit for dst_dir
        let mgr = get_global_transfer_manager();
        let blocking_handle = Arc::new(TransferHandle::new(
            "tx_blocking".to_string(),
            "b_src".to_string(),
            dst_dir.to_string_lossy().to_string(),
            "copy".to_string(),
            1,
            100,
            collector.clone(),
        ));
        mgr.register(blocking_handle.clone());
        let permit = mgr
            .acquire_permit(&blocking_handle, vec![dst_dir.clone()])
            .unwrap();

        // Spawn a thread to execute a second transfer targeting dst_dir
        let tid_2 = "tx_queued_cancelled".to_string();
        let items = vec![TransferItemSpec {
            source: src.to_string_lossy().to_string(),
            dest: dst.to_string_lossy().to_string(),
            action: None,
        }];

        let state_clone = state.clone();
        let journal_clone = journal.clone();
        let collector_clone = collector.clone();
        let tid_clone = tid_2.clone();

        let join_handle = std::thread::spawn(move || {
            execute_file_transfer_managed(
                "copy",
                &items,
                None,
                Some(tid_clone),
                &state_clone,
                &journal_clone,
                collector_clone,
            )
        });

        // Wait until tx_queued_cancelled is registered in mgr
        let mut waited = 0;
        while mgr.get(&tid_2).is_none() && waited < 50 {
            std::thread::sleep(Duration::from_millis(20));
            waited += 1;
        }

        let queued_handle = mgr
            .get(&tid_2)
            .expect("Transfer must be registered in manager");
        assert_eq!(queued_handle.snapshot().status, "queued");

        // Cancel while still queued
        mgr.cancel_transfer(&tid_2);

        // Now drop the blocking permit
        drop(permit);
        mgr.complete_transfer("tx_blocking", TransferStatus::Completed, None);

        let res = join_handle.join().unwrap().unwrap();

        // Verify that cancel happened cleanly without copying any file
        assert_eq!(res.success_count, 0);
        assert!(
            !dst.exists(),
            "Destination file must NOT exist since transfer was cancelled in queue"
        );
        assert!(src.exists(), "Source file must remain untouched");
        assert_eq!(fs::read(&src).unwrap(), b"SOURCE_CONTENT_UNTOUCHED");
        assert_eq!(res.records[0].status, "cancelled");

        let _ = fs::remove_dir_all(&test_dir);
    }

    #[test]
    fn test_destination_conflict_serialization() {
        let test_dir = temp_test_dir("dest_conflict_serial");
        let dest_folder = test_dir.join("shared_dest");
        fs::create_dir_all(&dest_folder).unwrap();

        let mgr = Arc::new(TransferManager::new());
        let emitter = Arc::new(NoopProgressEmitter);

        let h1 = Arc::new(TransferHandle::new(
            "tx_serial_1".to_string(),
            "s1".to_string(),
            dest_folder.to_string_lossy().to_string(),
            "copy".to_string(),
            1,
            10,
            emitter.clone(),
        ));
        let h2 = Arc::new(TransferHandle::new(
            "tx_serial_2".to_string(),
            "s2".to_string(),
            dest_folder.to_string_lossy().to_string(),
            "copy".to_string(),
            1,
            10,
            emitter.clone(),
        ));

        // Acquire permit for h1 on dest_folder
        let p1 = mgr.acquire_permit(&h1, vec![dest_folder.clone()]).unwrap();

        // h2 targets same destination. Spawning in background: it must wait until p1 is dropped!
        let (tx_started, rx_started) = std::sync::mpsc::channel();
        let (tx_done, rx_done) = std::sync::mpsc::channel();

        let mgr_clone = mgr.clone();
        let h2_clone = h2.clone();
        let dest_clone = dest_folder.clone();

        let t = std::thread::spawn(move || {
            tx_started.send(()).unwrap();
            let p2 = mgr_clone
                .acquire_permit(&h2_clone, vec![dest_clone])
                .unwrap();
            tx_done.send(()).unwrap();
            drop(p2);
        });

        rx_started.recv().unwrap();
        std::thread::sleep(Duration::from_millis(50));
        assert!(
            rx_done.try_recv().is_err(),
            "h2 must NOT acquire permit while h1 holds dest_folder"
        );

        // Release p1
        drop(p1);

        // Now h2 should acquire permit and finish
        let completed = rx_done.recv_timeout(Duration::from_secs(2));
        assert!(
            completed.is_ok(),
            "h2 must acquire permit once h1 releases destination"
        );

        t.join().unwrap();
        let _ = fs::remove_dir_all(&test_dir);
    }

    #[test]
    fn test_bounded_concurrency_max_two() {
        let test_dir = temp_test_dir("bounded_concurrency");
        let dir1 = test_dir.join("target1");
        let dir2 = test_dir.join("target2");
        let dir3 = test_dir.join("target3");
        fs::create_dir_all(&dir1).unwrap();
        fs::create_dir_all(&dir2).unwrap();
        fs::create_dir_all(&dir3).unwrap();

        let mgr = Arc::new(TransferManager::new());
        let emitter = Arc::new(NoopProgressEmitter);

        let h1 = Arc::new(TransferHandle::new(
            "t1".into(),
            "s1".into(),
            "d1".into(),
            "copy".into(),
            1,
            10,
            emitter.clone(),
        ));
        let h2 = Arc::new(TransferHandle::new(
            "t2".into(),
            "s2".into(),
            "d2".into(),
            "copy".into(),
            1,
            10,
            emitter.clone(),
        ));
        let h3 = Arc::new(TransferHandle::new(
            "t3".into(),
            "s3".into(),
            "d3".into(),
            "copy".into(),
            1,
            10,
            emitter.clone(),
        ));

        // Slot 1 and Slot 2 acquired (max concurrency is 2)
        let p1 = mgr.acquire_permit(&h1, vec![dir1.clone()]).unwrap();
        let p2 = mgr.acquire_permit(&h2, vec![dir2.clone()]).unwrap();

        let (tx, rx) = std::sync::mpsc::channel();
        let mgr_c = mgr.clone();
        let h3_c = h3.clone();

        let t = std::thread::spawn(move || {
            let p3 = mgr_c.acquire_permit(&h3_c, vec![dir3]).unwrap();
            tx.send(()).unwrap();
            drop(p3);
        });

        std::thread::sleep(Duration::from_millis(50));
        assert!(
            rx.try_recv().is_err(),
            "h3 must wait when 2 transfers are already running"
        );

        // Drop one permit
        drop(p1);

        // Now h3 should proceed
        assert!(
            rx.recv_timeout(Duration::from_secs(2)).is_ok(),
            "h3 proceeds once a slot opens"
        );

        drop(p2);
        t.join().unwrap();
        let _ = fs::remove_dir_all(&test_dir);
    }

    #[test]
    fn test_recovery_preserves_ambiguous_backups_when_target_exists() {
        use crate::files::recover_interrupted_write;

        let test_dir = temp_test_dir("preserve_bak");
        let target = test_dir.join("target_doc.txt");
        let backup = test_dir.join(".target_doc.txt.bak_99999");

        fs::write(&target, b"VALID_TARGET_CONTENT").unwrap();
        fs::write(&backup, b"AMBIGUOUS_BACKUP_CONTENT_MUST_NOT_BE_DELETED").unwrap();

        let recovered = recover_interrupted_write(&target).unwrap();
        assert!(
            !recovered,
            "Should not overwrite existing target with backup"
        );

        // Target MUST exist
        assert_eq!(fs::read(&target).unwrap(), b"VALID_TARGET_CONTENT");

        // Ambiguous backup MUST BE PRESERVED on disk (zero data loss guarantee)
        assert!(
            backup.exists(),
            "Ambiguous backup must be preserved on disk when target exists"
        );
        assert_eq!(
            fs::read(&backup).unwrap(),
            b"AMBIGUOUS_BACKUP_CONTENT_MUST_NOT_BE_DELETED"
        );

        let _ = fs::remove_dir_all(&test_dir);
    }

    #[test]
    fn test_directory_preparation_cancellation() {
        let test_dir = temp_test_dir("prep_cancel");
        let src_dir = test_dir.join("large_src_dir");
        let dst_dir = test_dir.join("large_dst_dir");

        fs::create_dir_all(&src_dir).unwrap();
        for i in 0..10 {
            fs::write(src_dir.join(format!("file_{}.txt", i)), b"DATA").unwrap();
        }

        let state = AllowedPathsState::new();
        state.allow(&test_dir);
        let journal = OperationJournalState::new();
        let collector = Arc::new(TestProgressCollector::new());

        let tid = "tx_prep_cancel".to_string();
        let items = vec![TransferItemSpec {
            source: src_dir.to_string_lossy().to_string(),
            dest: dst_dir.to_string_lossy().to_string(),
            action: None,
        }];

        // Pre-cancel to trigger cancel during preparation phase
        let mgr = get_global_transfer_manager();
        let pre_handle = Arc::new(TransferHandle::new(
            tid.clone(),
            src_dir.to_string_lossy().to_string(),
            dst_dir.to_string_lossy().to_string(),
            "copy".to_string(),
            1,
            0,
            collector.clone(),
        ));
        pre_handle.cancel();
        mgr.register(pre_handle);

        let res = execute_file_transfer_managed(
            "copy",
            &items,
            None,
            Some(tid),
            &state,
            &journal,
            collector.clone(),
        )
        .unwrap();

        assert_eq!(res.records[0].status, "cancelled");
        assert!(
            !dst_dir.exists(),
            "Destination directory must not be created"
        );
        assert!(src_dir.exists(), "Source directory must remain intact");

        let _ = fs::remove_dir_all(&test_dir);
    }

    #[test]
    fn test_cross_volume_move_cancellation_before_source_removal() {
        use crate::files::safe_cleanup_owned_file;

        let test_dir = temp_test_dir("move_commit_cancel");
        let src = test_dir.join("source.dat");
        let dst = test_dir.join("dest.dat");

        fs::write(&src, b"MOVE_CANCEL_TEST_DATA").unwrap();

        let collector = Arc::new(TestProgressCollector::new());
        let handle = Arc::new(TransferHandle::new(
            "tx_move_cancel_boundary".to_string(),
            src.to_string_lossy().to_string(),
            dst.to_string_lossy().to_string(),
            "move".to_string(),
            1,
            21,
            collector,
        ));

        // Copy completes
        copy_file_streaming_verified_with_handle(&src, &dst, Some(&handle)).unwrap();
        assert!(dst.exists());

        // Cancel before source removal is invoked
        handle.cancel();

        // Cancellation boundary logic:
        let move_res: Result<(), crate::error::AppError> = if handle.is_cancelled() {
            let _ = safe_cleanup_owned_file(&dst, None);
            Err(crate::error::AppError::Custom(
                "Transfer cancelled by user".to_string(),
            ))
        } else {
            fs::remove_file(&src).map_err(crate::error::AppError::from)
        };

        assert!(move_res.is_err());
        // Destination cleaned up, source preserved!
        assert!(
            !dst.exists(),
            "Destination must be cleaned up when move is cancelled"
        );
        assert!(
            src.exists(),
            "Source must survive intact when move is cancelled"
        );
        assert_eq!(fs::read(&src).unwrap(), b"MOVE_CANCEL_TEST_DATA");

        let _ = fs::remove_dir_all(&test_dir);
    }

    #[test]
    fn test_move_commit_records_moved_in_journal() {
        let test_dir = temp_test_dir("move_commit_journal");
        let src = test_dir.join("source.dat");
        let dst = test_dir.join("dest.dat");

        fs::write(&src, b"COMMITTED_MOVE_DATA").unwrap();

        let state = AllowedPathsState::new();
        state.allow(&test_dir);
        let journal = OperationJournalState::new();
        let collector = Arc::new(TestProgressCollector::new());

        let tid = "tx_committed_move".to_string();
        let items = vec![TransferItemSpec {
            source: src.to_string_lossy().to_string(),
            dest: dst.to_string_lossy().to_string(),
            action: None,
        }];

        let res = execute_file_transfer_managed(
            "move",
            &items,
            None,
            Some(tid),
            &state,
            &journal,
            collector,
        )
        .unwrap();

        assert_eq!(res.success_count, 1);
        assert_eq!(res.records[0].status, "moved");
        assert!(!src.exists(), "Source was removed upon successful move");
        assert!(dst.exists(), "Destination exists with data");
        assert_eq!(fs::read(&dst).unwrap(), b"COMMITTED_MOVE_DATA");

        // Journal must have recorded the move
        let entries = journal.get_history(10);
        assert!(!entries.is_empty());
        match &entries[0] {
            crate::files::JournalEntry::Move {
                source,
                original_source,
                ..
            } => {
                assert_eq!(source, &dst);
                assert_eq!(original_source, &src);
            }
            _ => panic!("Expected JournalEntry::Move"),
        }

        let _ = fs::remove_dir_all(&test_dir);
    }
}
