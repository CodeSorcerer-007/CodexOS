use std::path::Path;
use serde::{Serialize, Deserialize};

#[derive(Serialize, Deserialize)]
pub struct DocIndex {
    name: String,
    r#type: String,
    path: String,
}

#[tauri::command]
pub async fn query_docset(docset_path: String, query: String) -> Result<Vec<DocIndex>, String> {
    let db_path = Path::new(&docset_path).join("Contents/Resources/docSet.dsidx");
    if !db_path.exists() {
        return Err("Not a valid docset".to_string());
    }
    
    let url = format!("sqlite://{}", db_path.display());
    
    let pool = sqlx::any::AnyPoolOptions::new()
        .connect(&url).await.map_err(|e| format!("Connection error: {}", e))?;
    
    // Dash schema usually has a searchIndex table: id, name, type, path
    // We search by name using LIKE
    let sql = format!("SELECT name, type, path FROM searchIndex WHERE name LIKE '%{}%' LIMIT 100", query.replace("'", "''"));
    let rows = sqlx::query(&sql).fetch_all(&pool).await.map_err(|e| format!("Query error: {}", e))?;
    
    let mut results = Vec::new();
    for row in rows {
        use sqlx::Row;
        if let (Ok(name), Ok(r#type), Ok(path)) = (row.try_get::<String, _>("name"), row.try_get::<String, _>("type"), row.try_get::<String, _>("path")) {
            results.push(DocIndex { name, r#type, path });
        }
    }
    
    Ok(results)
}
