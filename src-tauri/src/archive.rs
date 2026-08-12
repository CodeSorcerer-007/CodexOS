use serde::{Deserialize, Serialize};

#[derive(Serialize, Deserialize)]
pub struct ZipEntryInfo {
    pub name: String,
    pub is_dir: bool,
    pub size: u64,
}

#[tauri::command]
pub fn list_zip_contents(path: String) -> Result<Vec<ZipEntryInfo>, String> {
    use std::fs::File;
    use zip::ZipArchive;

    let file = File::open(&path).map_err(|e| e.to_string())?;
    let mut archive = ZipArchive::new(file).map_err(|e| e.to_string())?;

    let mut entries = Vec::new();
    for i in 0..archive.len() {
        let file = archive.by_index(i).map_err(|e| e.to_string())?;
        entries.push(ZipEntryInfo {
            name: file.name().to_string(),
            is_dir: file.is_dir(),
            size: file.size(),
        });
    }

    Ok(entries)
}

#[tauri::command]
pub fn read_zip_file(zip_path: String, internal_path: String) -> Result<String, String> {
    use std::fs::File;
    use std::io::Read;
    use zip::ZipArchive;

    let file = File::open(&zip_path).map_err(|e| e.to_string())?;
    let mut archive = ZipArchive::new(file).map_err(|e| e.to_string())?;

    let mut zip_file = archive.by_name(&internal_path).map_err(|e| e.to_string())?;

    let mut contents = String::new();
    zip_file
        .read_to_string(&mut contents)
        .map_err(|e| e.to_string())?;

    Ok(contents)
}
