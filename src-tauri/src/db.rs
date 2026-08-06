use sqlx::{any::AnyPoolOptions, Row, Column, ValueRef};
use serde_json::{Map, Value};

#[tauri::command]
pub async fn query_database(url: String, query: String) -> Result<Vec<Map<String, Value>>, String> {
    sqlx::any::install_default_drivers();
    
    let pool = AnyPoolOptions::new()
        .max_connections(5)
        .connect(&url).await.map_err(|e| format!("Connection error: {}", e))?;
    
    let rows = sqlx::query(&query).fetch_all(&pool).await.map_err(|e| format!("Query error: {}", e))?;
    
    let mut result = Vec::new();
    for row in rows {
        let mut map = Map::new();
        for col in row.columns() {
            let name = col.name().to_string();
            let val = row.try_get_raw(col.ordinal()).map(|r| {
                if r.is_null() {
                    Value::Null
                } else if let Ok(v) = row.try_get::<String, _>(col.ordinal()) {
                    Value::String(v)
                } else if let Ok(v) = row.try_get::<i64, _>(col.ordinal()) {
                    Value::Number(serde_json::Number::from(v))
                } else if let Ok(v) = row.try_get::<f64, _>(col.ordinal()) {
                    serde_json::Number::from_f64(v).map(Value::Number).unwrap_or(Value::String(v.to_string()))
                } else if let Ok(v) = row.try_get::<bool, _>(col.ordinal()) {
                    Value::Bool(v)
                } else {
                    Value::String("<complex type>".to_string())
                }
            }).unwrap_or(Value::Null);
            
            map.insert(name, val);
        }
        result.push(map);
    }
    
    Ok(result)
}

#[derive(serde::Serialize, serde::Deserialize)]
pub struct SqliteResult {
    pub columns: Vec<String>,
    pub rows: Vec<Vec<String>>,
}

#[tauri::command]
pub fn query_sqlite(path: String, query: String) -> Result<SqliteResult, String> {
    use rusqlite::{Connection, types::ValueRef};
    
    let conn = Connection::open(path).map_err(|e| e.to_string())?;
    let mut stmt = conn.prepare(&query).map_err(|e| e.to_string())?;
    
    let column_names: Vec<String> = stmt.column_names().into_iter().map(String::from).collect();
    let column_count = column_names.len();
    
    let mut rows_data = Vec::new();
    
    let mut rows = stmt.query([]).map_err(|e| e.to_string())?;
    while let Some(row) = rows.next().map_err(|e| e.to_string())? {
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
