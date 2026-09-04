use rusqlite::{Connection, Result};
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MigrationStatus {
    pub current_version: u32,
    pub target_version: u32,
    pub is_up_to_date: bool,
    pub applied_migrations: Vec<String>,
}

pub struct Migration {
    pub version: u32,
    pub description: &'static str,
    pub up_sql: &'static str,
}

pub const MIGRATIONS: &[Migration] = &[
    Migration {
        version: 1,
        description: "Baseline schema: persistent store_kv and proxy_logs",
        up_sql: r#"
            CREATE TABLE IF NOT EXISTS proxy_logs (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                method TEXT NOT NULL,
                url TEXT NOT NULL,
                request_headers TEXT NOT NULL,
                request_body TEXT NOT NULL,
                response_status INTEGER NOT NULL,
                response_headers TEXT NOT NULL,
                response_body TEXT NOT NULL,
                timestamp INTEGER NOT NULL,
                duration_ms INTEGER NOT NULL
            );

            CREATE TABLE IF NOT EXISTS store_kv (
                key TEXT PRIMARY KEY,
                value TEXT NOT NULL
            );
        "#,
    },
    Migration {
        version: 2,
        description: "Performance indexes and diagnostics events table",
        up_sql: r#"
            CREATE INDEX IF NOT EXISTS idx_proxy_logs_timestamp ON proxy_logs(timestamp);

            CREATE TABLE IF NOT EXISTS diagnostics_events (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                event_type TEXT NOT NULL,
                details TEXT NOT NULL,
                created_at INTEGER NOT NULL
            );
            CREATE INDEX IF NOT EXISTS idx_diagnostics_created_at ON diagnostics_events(created_at);
        "#,
    },
    Migration {
        version: 3,
        description: "Schema version tracking and settings metadata",
        up_sql: r#"
            CREATE TABLE IF NOT EXISTS schema_version_log (
                version INTEGER PRIMARY KEY,
                applied_at INTEGER NOT NULL,
                description TEXT NOT NULL
            );

            CREATE TABLE IF NOT EXISTS settings_meta (
                key TEXT PRIMARY KEY,
                schema_version INTEGER NOT NULL,
                updated_at INTEGER NOT NULL
            );
        "#,
    },
];

pub fn get_user_version(conn: &Connection) -> Result<u32> {
    conn.query_row("PRAGMA user_version", [], |row| row.get(0))
}

pub fn set_user_version(conn: &Connection, version: u32) -> Result<()> {
    conn.execute(&format!("PRAGMA user_version = {}", version), [])?;
    Ok(())
}

/// Runs all pending migrations sequentially inside isolated transactions.
pub fn run_migrations(conn: &mut Connection) -> Result<u32> {
    let current_version = get_user_version(conn)?;
    let target_version = MIGRATIONS.last().map(|m| m.version).unwrap_or(0);

    if current_version >= target_version {
        return Ok(current_version);
    }

    log::info!(
        "Executing SQLite migrations: current version={}, target version={}",
        current_version,
        target_version
    );

    for migration in MIGRATIONS.iter().filter(|m| m.version > current_version) {
        log::info!(
            "Applying SQLite migration v{}: {}",
            migration.version,
            migration.description
        );

        let tx = conn.transaction()?;
        tx.execute_batch(migration.up_sql)?;

        // If version log table exists (or was just created), record entry
        if migration.version >= 3 {
            let now = std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .unwrap_or_default()
                .as_secs() as i64;

            let _ = tx.execute(
                "INSERT OR REPLACE INTO schema_version_log (version, applied_at, description) VALUES (?1, ?2, ?3)",
                rusqlite::params![migration.version, now, migration.description],
            );
        }

        tx.commit()?;
        set_user_version(conn, migration.version)?;
    }

    let final_version = get_user_version(conn)?;
    log::info!("SQLite migrations complete. Active schema version={}", final_version);
    Ok(final_version)
}

/// Retrieves schema migration status for UI and telemetry.
pub fn get_migration_status(conn: &Connection) -> Result<MigrationStatus> {
    let current_version = get_user_version(conn)?;
    let target_version = MIGRATIONS.last().map(|m| m.version).unwrap_or(0);

    let mut applied_migrations = Vec::new();
    for m in MIGRATIONS {
        if m.version <= current_version {
            applied_migrations.push(format!("v{}: {}", m.version, m.description));
        }
    }

    Ok(MigrationStatus {
        current_version,
        target_version,
        is_up_to_date: current_version >= target_version,
        applied_migrations,
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_migrations_from_clean_db() {
        let mut conn = Connection::open_in_memory().unwrap();
        assert_eq!(get_user_version(&conn).unwrap(), 0);

        let version = run_migrations(&mut conn).unwrap();
        assert_eq!(version, 3);
        assert_eq!(get_user_version(&conn).unwrap(), 3);

        // Verify tables exist
        conn.execute("INSERT INTO store_kv (key, value) VALUES ('test', '123')", []).unwrap();
        conn.execute(
            "INSERT INTO diagnostics_events (event_type, details, created_at) VALUES ('info', 'test event', 1000)",
            [],
        ).unwrap();
        conn.execute(
            "INSERT INTO settings_meta (key, schema_version, updated_at) VALUES ('theme', 3, 1000)",
            [],
        ).unwrap();

        let status = get_migration_status(&conn).unwrap();
        assert!(status.is_up_to_date);
        assert_eq!(status.applied_migrations.len(), 3);
    }

    #[test]
    fn test_migrations_idempotency() {
        let mut conn = Connection::open_in_memory().unwrap();
        run_migrations(&mut conn).unwrap();
        // Second run should be a no-op and return version 3
        let version2 = run_migrations(&mut conn).unwrap();
        assert_eq!(version2, 3);
    }
}
