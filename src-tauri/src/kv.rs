use crate::util::lock_poison_recover;
use rusqlite::Connection;
use std::path::PathBuf;
use std::sync::{Arc, Mutex};
use tauri::Manager;

pub struct KvState {
    pub db: Arc<Mutex<Option<Connection>>>,
}

impl KvState {
    pub fn new() -> Self {
        KvState {
            db: Arc::new(Mutex::new(None)),
        }
    }
}

pub fn get_db_conn(app_handle: &tauri::AppHandle) -> rusqlite::Result<Connection> {
    let mut path = app_handle
        .path()
        .app_data_dir()
        .unwrap_or_else(|_| PathBuf::from("."));
    std::fs::create_dir_all(&path).unwrap_or_default();
    path.push("codexos.db");
    let mut conn = Connection::open(path)?;

    // Enable WAL mode & fast synchronous for desktop concurrency and write throughput
    let _ = conn.execute_batch("PRAGMA journal_mode=WAL; PRAGMA synchronous=NORMAL;");

    // Execute atomic SQLite schema migrations
    if let Err(e) = crate::db_migration::run_migrations(&mut conn) {
        log::error!("Failed to apply SQLite schema migrations: {:?}", e);
    }

    Ok(conn)
}

#[tauri::command]
pub fn get_db_migration_status(
    app_handle: tauri::AppHandle,
    state: tauri::State<'_, KvState>,
) -> Result<crate::db_migration::MigrationStatus, String> {
    with_kv_db(&app_handle, &state, |conn| {
        crate::db_migration::get_migration_status(conn).ok()
    })
    .ok_or_else(|| "Failed to query database migration status".to_string())
}

pub fn with_kv_db<F, R>(app_handle: &tauri::AppHandle, state: &KvState, f: F) -> Option<R>
where
    F: FnOnce(&mut Connection) -> Option<R>,
{
    let mut guard = lock_poison_recover(&state.db);
    if guard.is_none() {
        if let Ok(conn) = get_db_conn(app_handle) {
            *guard = Some(conn);
        }
    }
    guard.as_mut().and_then(f)
}

/// Persistent SQLite Key-Value Store: write key/value
#[tauri::command]
pub fn kv_set(app_handle: tauri::AppHandle, state: tauri::State<'_, KvState>, key: String, value: String) -> Result<(), String> {
    let res = with_kv_db(&app_handle, &state, |conn| {
        conn.execute(
            "INSERT OR REPLACE INTO store_kv (key, value) VALUES (?1, ?2)",
            rusqlite::params![key, value],
        ).ok()
    });
    if res.is_some() {
        Ok(())
    } else {
        Err("Failed to write to KV store".to_string())
    }
}

/// Persistent SQLite Key-Value Store: read key
#[tauri::command]
pub fn kv_get(app_handle: tauri::AppHandle, state: tauri::State<'_, KvState>, key: String) -> Result<Option<String>, String> {
    let res = with_kv_db(&app_handle, &state, |conn| {
        let mut stmt = conn.prepare("SELECT value FROM store_kv WHERE key = ?1").ok()?;
        let mut iter = stmt.query_map(rusqlite::params![key], |row| row.get::<_, String>(0)).ok()?;
        if let Some(Ok(val)) = iter.next() {
            Some(Some(val))
        } else {
            Some(None)
        }
    });
    Ok(res.flatten())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_kv_db_schema() {
        let conn = Connection::open_in_memory().unwrap();
        conn.execute(
            "CREATE TABLE IF NOT EXISTS store_kv (
                key TEXT PRIMARY KEY,
                value TEXT NOT NULL
            )",
            [],
        ).unwrap();

        conn.execute(
            "INSERT OR REPLACE INTO store_kv (key, value) VALUES (?1, ?2)",
            rusqlite::params!["test_key", "test_value"],
        ).unwrap();

        let mut stmt = conn.prepare("SELECT value FROM store_kv WHERE key = ?1").unwrap();
        let val: String = stmt.query_row(rusqlite::params!["test_key"], |row| row.get(0)).unwrap();
        assert_eq!(val, "test_value");
    }
}
