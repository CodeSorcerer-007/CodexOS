use crate::error::AppResult;
use serde_json::{Map, Value};
use sqlx::{any::AnyPoolOptions, Column, Row, ValueRef};

#[tauri::command]
pub async fn query_database(url: String, query: String) -> Result<Vec<Map<String, Value>>, String> {
    sqlx::any::install_default_drivers();

    let pool = AnyPoolOptions::new()
        .max_connections(5)
        .connect(&url)
        .await
        .map_err(|e| format!("Connection error: {}", e))?;

    let rows = sqlx::query(&query)
        .fetch_all(&pool)
        .await
        .map_err(|e| format!("Query error: {}", e))?;

    let mut result = Vec::new();
    for row in rows {
        let mut map = Map::new();
        for col in row.columns() {
            let name = col.name().to_string();
            let val = row
                .try_get_raw(col.ordinal())
                .map(|r| {
                    if r.is_null() {
                        Value::Null
                    } else if let Ok(v) = row.try_get::<String, _>(col.ordinal()) {
                        Value::String(v)
                    } else if let Ok(v) = row.try_get::<i64, _>(col.ordinal()) {
                        Value::Number(serde_json::Number::from(v))
                    } else if let Ok(v) = row.try_get::<f64, _>(col.ordinal()) {
                        serde_json::Number::from_f64(v)
                            .map(Value::Number)
                            .unwrap_or(Value::String(v.to_string()))
                    } else if let Ok(v) = row.try_get::<bool, _>(col.ordinal()) {
                        Value::Bool(v)
                    } else {
                        Value::String("<complex type>".to_string())
                    }
                })
                .unwrap_or(Value::Null);

            map.insert(name, val);
        }
        result.push(map);
    }

    Ok(result)
}

const MAX_SQLITE_ROWS: usize = 10_000;

#[derive(serde::Serialize, serde::Deserialize)]
pub struct SqliteResult {
    pub columns: Vec<String>,
    pub rows: Vec<Vec<String>>,
}

#[tauri::command]
pub fn query_sqlite(path: String, query: String) -> AppResult<SqliteResult> {
    use rusqlite::{types::ValueRef, Connection};
    use std::path::Path;

    if path != ":memory:" {
        let p = Path::new(&path);
        if !p.exists() || !p.is_file() {
            return Err(crate::error::AppError::Custom(format!(
                "SQLite database file not found: {}",
                path
            )));
        }
    }

    let conn = Connection::open(&path).map_err(|e| e.to_string())?;
    let mut stmt = conn.prepare(&query).map_err(|e| e.to_string())?;

    let column_names: Vec<String> = stmt.column_names().into_iter().map(String::from).collect();
    let column_count = column_names.len();

    let mut rows_data = Vec::new();

    let mut rows = stmt.query([]).map_err(|e| e.to_string())?;
    while let Some(row) = rows.next().map_err(|e| e.to_string())? {
        if rows_data.len() >= MAX_SQLITE_ROWS {
            break;
        }
        let mut row_data = Vec::with_capacity(column_count);
        for i in 0..column_count {
            let val_ref = row.get_ref(i).map_err(|e| e.to_string())?;
            let val_str = match val_ref {
                ValueRef::Null => "NULL".to_string(),
                ValueRef::Integer(i) => i.to_string(),
                ValueRef::Real(f) => f.to_string(),
                ValueRef::Text(t) => String::from_utf8_lossy(t).to_string(),
                ValueRef::Blob(_) => "[BLOB]".to_string(),
            };
            row_data.push(val_str);
        }
        rows_data.push(row_data);
    }

    Ok(SqliteResult {
        columns: column_names,
        rows: rows_data,
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_query_sqlite_memory() {
        let res = query_sqlite(
            ":memory:".to_string(),
            "SELECT 1 AS id, 'alice' AS name, NULL AS extra;".to_string(),
        )
        .unwrap();

        assert_eq!(res.columns, vec!["id", "name", "extra"]);
        assert_eq!(res.rows.len(), 1);
        assert_eq!(res.rows[0], vec!["1", "alice", "NULL"]);
    }

    #[test]
    fn test_query_sqlite_syntax_error() {
        let res = query_sqlite(
            ":memory:".to_string(),
            "INVALID SQL STATEMENT;".to_string(),
        );
        assert!(res.is_err());
    }

    #[test]
    fn test_query_sqlite_non_existent_file() {
        let res = query_sqlite(
            "C:\\non_existent_path_12345\\db.sqlite".to_string(),
            "SELECT 1;".to_string(),
        );
        assert!(res.is_err());
    }
}
