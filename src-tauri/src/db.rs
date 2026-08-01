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
