use crate::error::AppResult;
use serde::{Deserialize, Serialize};

#[derive(Serialize, Deserialize)]
pub struct ZipEntryInfo {
    pub name: String,
    pub is_dir: bool,
    pub size: u64,
}

pub fn list_zip_contents_internal(
    path: &str,
    allowed_paths: &crate::files::AllowedPathsState,
) -> AppResult<Vec<ZipEntryInfo>> {
    use std::fs::File;
    use zip::ZipArchive;

    let validated = crate::files::validate_path(path, allowed_paths)?;
    let file = File::open(&validated).map_err(|e| e.to_string())?;
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
pub fn list_zip_contents(
    path: String,
    allowed_paths: tauri::State<'_, crate::files::AllowedPathsState>,
) -> AppResult<Vec<ZipEntryInfo>> {
    list_zip_contents_internal(&path, &allowed_paths)
}

const MAX_ZIP_ENTRY_READ_BYTES: u64 = 10 * 1024 * 1024; // 10 MB

pub fn read_zip_file_internal(
    zip_path: &str,
    internal_path: &str,
    allowed_paths: &crate::files::AllowedPathsState,
) -> AppResult<String> {
    use std::fs::File;
    use std::io::Read;
    use zip::ZipArchive;

    let validated = crate::files::validate_path(zip_path, allowed_paths)?;
    let file = File::open(&validated).map_err(|e| e.to_string())?;
    let mut archive = ZipArchive::new(file).map_err(|e| e.to_string())?;

    let mut zip_file = archive.by_name(internal_path).map_err(|e| e.to_string())?;

    let mut buffer = Vec::new();
    let mut reader = (&mut zip_file).take(MAX_ZIP_ENTRY_READ_BYTES);
    reader.read_to_end(&mut buffer).map_err(|e| e.to_string())?;

    let content = String::from_utf8_lossy(&buffer).to_string();
    Ok(content)
}

#[tauri::command]
pub fn read_zip_file(
    zip_path: String,
    internal_path: String,
    allowed_paths: tauri::State<'_, crate::files::AllowedPathsState>,
) -> AppResult<String> {
    read_zip_file_internal(&zip_path, &internal_path, &allowed_paths)
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::io::Write;
    use tempfile::NamedTempFile;
    use zip::write::FileOptions;
    use zip::ZipWriter;

    #[test]
    fn test_zip_list_and_read() {
        let temp_zip = NamedTempFile::new().unwrap();
        let path = temp_zip.path().to_string_lossy().to_string();

        {
            let file = std::fs::File::create(&path).unwrap();
            let mut zip = ZipWriter::new(file);
            let options = FileOptions::<()>::default().compression_method(zip::CompressionMethod::Stored);

            zip.start_file("test.txt", options).unwrap();
            zip.write_all(b"Hello from inside zip!").unwrap();
            zip.finish().unwrap();
        }

        let state = crate::files::AllowedPathsState::new();
        let entries = list_zip_contents_internal(&path, &state).unwrap();
        assert_eq!(entries.len(), 1);
        assert_eq!(entries[0].name, "test.txt");

        let content = read_zip_file_internal(&path, "test.txt", &state).unwrap();
        assert_eq!(content, "Hello from inside zip!");
    }
}
