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
    
    let conn = rusqlite::Connection::open(&db_path)
        .map_err(|e| format!("Database connection error: {}", e))?;
        
    let mut stmt = conn.prepare("SELECT name, type, path FROM searchIndex WHERE name LIKE ?1 LIMIT 100")
        .map_err(|e| format!("Query prepare error: {}", e))?;
        
    let pattern = format!("%{}%", query);
    let rows = stmt.query_map(rusqlite::params![pattern], |row| {
        Ok(DocIndex {
            name: row.get(0)?,
            r#type: row.get(1)?,
            path: row.get(2)?,
        })
    }).map_err(|e| format!("Query execution error: {}", e))?;
    
    let mut results = Vec::new();
    for row in rows {
        if let Ok(doc) = row {
            results.push(doc);
        }
    }
    
    Ok(results)
}
