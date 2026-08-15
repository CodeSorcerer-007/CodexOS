use crate::error::{AppError, AppResult};
use serde::{Deserialize, Serialize};
use std::path::Path;

#[derive(Serialize, Deserialize)]
pub struct DocIndex {
    name: String,
    r#type: String,
    path: String,
}

#[tauri::command]
pub async fn query_docset(docset_path: String, query: String) -> AppResult<Vec<DocIndex>> {
    tauri::async_runtime::spawn_blocking(move || {
        let db_path = Path::new(&docset_path).join("Contents/Resources/docSet.dsidx");
        if !db_path.exists() {
            return Err(AppError::Custom("Not a valid docset".to_string()));
        }

        let conn = rusqlite::Connection::open_with_flags(
            &db_path,
            rusqlite::OpenFlags::SQLITE_OPEN_READ_ONLY | rusqlite::OpenFlags::SQLITE_OPEN_NO_MUTEX,
        )
        .map_err(|e| format!("Database connection error: {}", e))?;

        let mut stmt = conn
            .prepare("SELECT name, type, path FROM searchIndex WHERE name LIKE ?1 LIMIT 100")
            .map_err(|e| format!("Query prepare error: {}", e))?;

        let pattern = format!("%{}%", query);
        let rows = stmt
            .query_map(rusqlite::params![pattern], |row| {
                Ok(DocIndex {
                    name: row.get(0)?,
                    r#type: row.get(1)?,
                    path: row.get(2)?,
                })
            })
            .map_err(|e| format!("Query execution error: {}", e))?;

        let mut results = Vec::new();
        for doc in rows.flatten() {
            results.push(doc);
        }

        Ok(results)
    })
    .await
    .map_err(|e| e.to_string())?
}

#[cfg(test)]
mod tests {
    use super::*;
    use tempfile::tempdir;

    #[tokio::test]
    async fn test_query_docset_invalid_path() {
        let res = query_docset("invalid/path".to_string(), "query".to_string()).await;
        assert!(res.is_err());
    }

    #[tokio::test]
    async fn test_query_docset_valid_sqlite() {
        let dir = tempdir().unwrap();
        let res_dir = dir.path().join("Contents").join("Resources");
        std::fs::create_dir_all(&res_dir).unwrap();
        let db_path = res_dir.join("docSet.dsidx");

        {
            let conn = rusqlite::Connection::open(&db_path).unwrap();
            conn.execute(
                "CREATE TABLE searchIndex(id INTEGER PRIMARY KEY, name TEXT, type TEXT, path TEXT)",
                [],
            )
            .unwrap();
            conn.execute(
                "INSERT INTO searchIndex (name, type, path) VALUES ('Vec', 'Struct', 'std/vec/struct.Vec.html')",
                [],
            )
            .unwrap();
        }

        let res = query_docset(dir.path().to_string_lossy().to_string(), "Vec".to_string()).await;
        assert!(res.is_ok());
        let results = res.unwrap();
        assert_eq!(results.len(), 1);
        assert_eq!(results[0].name, "Vec");
        assert_eq!(results[0].r#type, "Struct");
    }
}
