use wasmtime::*;

use std::fs;

#[tauri::command]
pub fn run_wasm_plugin(path: String) -> Result<String, String> {
    // Basic WASM execution using wasmtime (No WASI)
    let engine = Engine::default();

    let wasm_bytes = fs::read(&path).map_err(|e| format!("Failed to read WASM file: {}", e))?;
    let module =
        Module::new(&engine, &wasm_bytes).map_err(|e| format!("Failed to compile WASM: {}", e))?;

    let mut store = Store::new(&engine, ());
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
pub fn run_wasi_nano_vm(_path: String, _mounted_dir: String) -> Result<String, String> {
    Err("WASI Nano-VM is not yet implemented. Full WASI runtime support is planned for a future release.".to_string())
}
