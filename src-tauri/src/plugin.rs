use crate::error::{AppError, AppResult};
use wasmtime::*;

use std::fs;

#[tauri::command]
pub fn run_wasm_plugin(path: String) -> AppResult<String> {
    // Sandboxed WASM execution using wasmtime with compute fuel budget
    let mut config = Config::new();
    config.consume_fuel(true);
    let engine = Engine::new(&config).map_err(|e| format!("Failed to configure WASM engine: {}", e))?;

    let wasm_bytes = fs::read(&path).map_err(|e| format!("Failed to read WASM file: {}", e))?;
    let module =
        Module::new(&engine, &wasm_bytes).map_err(|e| format!("Failed to compile WASM: {}", e))?;

    let mut store = Store::new(&engine, ());
    // Allocate 50M compute units (~50ms CPU equivalent) to prevent infinite loops
    store.set_fuel(50_000_000).map_err(|e| format!("Failed to set WASM fuel: {}", e))?;

    let linker = Linker::new(&engine);
    let instance = linker
        .instantiate(&mut store, &module)
        .map_err(|e| format!("Failed to instantiate WASM: {}", e))?;

    let run_func = instance.get_typed_func::<(), ()>(&mut store, "run");

    match run_func {
        Ok(func) => {
            func.call(&mut store, ())
                .map_err(|e| format!("Failed to execute 'run': {}", e))?;
            Ok(format!("Successfully executed plugin: {}", path))
        }
        Err(_) => Ok(format!(
            "Successfully loaded plugin (no 'run' export found): {}",
            path
        )),
    }
}

#[tauri::command]
pub fn run_wasi_nano_vm(_path: String, _mounted_dir: String) -> AppResult<String> {
    Err(AppError::Custom("WASI Nano-VM is not yet implemented. Full WASI runtime support is planned for a future release.".to_string()))
}

#[cfg(test)]
mod tests {
    use super::*;
    use tempfile::NamedTempFile;
    use std::io::Write;

    #[test]
    fn test_run_wasm_plugin_invalid_file() {
        let res = run_wasm_plugin("non_existent_file.wasm".to_string());
        assert!(res.is_err());
    }

    #[test]
    fn test_run_wasm_plugin_invalid_wasm() {
        let mut file = NamedTempFile::new().unwrap();
        file.write_all(b"not a valid wasm file").unwrap();

        let res = run_wasm_plugin(file.path().to_string_lossy().to_string());
        assert!(res.is_err());
    }

    #[test]
    fn test_run_wasm_plugin_valid_no_run() {
        // A minimal valid WebAssembly module (magic + version)
        let minimal_wasm: &[u8] = &[0x00, 0x61, 0x73, 0x6d, 0x01, 0x00, 0x00, 0x00];
        
        let mut file = NamedTempFile::new().unwrap();
        file.write_all(minimal_wasm).unwrap();

        let res = run_wasm_plugin(file.path().to_string_lossy().to_string());
        assert!(res.is_ok());
        assert!(res.unwrap().contains("no 'run' export found"));
    }
}
