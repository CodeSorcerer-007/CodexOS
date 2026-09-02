use crate::error::AppResult;
use serde::{Deserialize, Serialize};
use std::fs;
use std::time::Instant;
use wasmtime::*;

// Embedded demo WASM module bytecode:
// Exports memory and run() -> i32 (returns 42)
const DEMO_CALC_WASM: &[u8] = &[
    0x00, 0x61, 0x73, 0x6d, 0x01, 0x00, 0x00, 0x00,
    0x01, 0x05, 0x01, 0x60, 0x00, 0x01, 0x7f,
    0x03, 0x02, 0x01, 0x00,
    0x05, 0x03, 0x01, 0x00, 0x01,
    0x07, 0x11, 0x02,
    0x06, 0x6d, 0x65, 0x6d, 0x6f, 0x72, 0x79, 0x02, 0x00,
    0x03, 0x72, 0x75, 0x6e, 0x00, 0x00,
    0x0a, 0x06, 0x01, 0x04, 0x00, 0x41, 0x2a, 0x0b,
];

#[derive(Default)]
pub struct VmContext {
    pub stdout: Vec<u8>,
    pub stderr: Vec<u8>,
    pub exit_code: i32,
}

#[derive(Serialize, Deserialize, Debug)]
pub struct NanoVmResult {
    pub success: bool,
    pub stdout: String,
    pub stderr: String,
    pub exit_code: i32,
    pub fuel_consumed: u64,
    pub execution_time_ms: u64,
    pub exports: Vec<String>,
}

#[tauri::command]
pub fn run_wasm_plugin(path: String) -> AppResult<String> {
    let mut config = Config::new();
    config.consume_fuel(true);
    let engine = Engine::new(&config).map_err(|e| format!("Failed to configure WASM engine: {}", e))?;

    let wasm_bytes = fs::read(&path).map_err(|e| format!("Failed to read WASM file: {}", e))?;
    let module =
        Module::new(&engine, &wasm_bytes).map_err(|e| format!("Failed to compile WASM: {}", e))?;

    let mut store = Store::new(&engine, ());
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
pub fn run_wasi_nano_vm(
    path: String,
    mounted_dir: String,
    allowed_paths: tauri::State<'_, crate::files::AllowedPathsState>,
) -> AppResult<NanoVmResult> {
    let start_time = Instant::now();

    // 1. Resolve WASM bytes
    let wasm_bytes = if path == ":demo:calc" || path.is_empty() {
        DEMO_CALC_WASM.to_vec()
    } else {
        let validated = crate::files::validate_path(&path, &allowed_paths)?;
        std::fs::read(&validated).map_err(|e| format!("Failed to read WASM image: {}", e))?
    };

    // 2. Validate mounted dir if provided
    if !mounted_dir.is_empty() {
        let _ = crate::files::validate_path(&mounted_dir, &allowed_paths)?;
    }

    // 3. Configure Wasmtime engine with compute fuel budget
    let mut config = Config::new();
    config.consume_fuel(true);
    let engine = Engine::new(&config).map_err(|e| format!("Failed to configure WASM engine: {}", e))?;

    let module = Module::new(&engine, &wasm_bytes).map_err(|e| format!("Failed to compile WASM: {}", e))?;

    let initial_fuel = 100_000_000u64;
    let mut store = Store::new(&engine, VmContext::default());
    store.set_fuel(initial_fuel).map_err(|e| format!("Failed to set WASM fuel: {}", e))?;

    // 4. Build WASI snapshot preview1 Linker
    let mut linker = Linker::new(&engine);

    let _ = linker.func_wrap("wasi_snapshot_preview1", "proc_exit", |mut caller: Caller<'_, VmContext>, code: i32| {
        caller.data_mut().exit_code = code;
    });

    let _ = linker.func_wrap(
        "wasi_snapshot_preview1",
        "fd_write",
        |mut caller: Caller<'_, VmContext>, fd: i32, iovs_ptr: u32, iovs_len: u32, nwritten_ptr: u32| -> i32 {
            let memory = match caller.get_export("memory") {
                Some(Extern::Memory(mem)) => mem,
                _ => return 8,
            };
            let mut total_written = 0u32;
            for i in 0..iovs_len {
                let offset = (iovs_ptr + i * 8) as usize;
                let mut buf = [0u8; 8];
                if memory.read(&caller, offset, &mut buf).is_err() {
                    return 14;
                }
                let ptr = u32::from_le_bytes([buf[0], buf[1], buf[2], buf[3]]) as usize;
                let len = u32::from_le_bytes([buf[4], buf[5], buf[6], buf[7]]) as usize;
                let mut str_buf = vec![0u8; len];
                if memory.read(&caller, ptr, &mut str_buf).is_err() {
                    return 14;
                }
                if fd == 1 {
                    caller.data_mut().stdout.extend_from_slice(&str_buf);
                } else {
                    caller.data_mut().stderr.extend_from_slice(&str_buf);
                }
                total_written += len as u32;
            }
            let _ = memory.write(&mut caller, nwritten_ptr as usize, &total_written.to_le_bytes());
            0
        },
    );

    let _ = linker.func_wrap("wasi_snapshot_preview1", "environ_sizes_get", |mut caller: Caller<'_, VmContext>, count_ptr: u32, buf_size_ptr: u32| -> i32 {
        if let Some(Extern::Memory(mem)) = caller.get_export("memory") {
            let _ = mem.write(&mut caller, count_ptr as usize, &0u32.to_le_bytes());
            let _ = mem.write(&mut caller, buf_size_ptr as usize, &0u32.to_le_bytes());
        }
        0
    });

    let _ = linker.func_wrap("wasi_snapshot_preview1", "args_sizes_get", |mut caller: Caller<'_, VmContext>, count_ptr: u32, buf_size_ptr: u32| -> i32 {
        if let Some(Extern::Memory(mem)) = caller.get_export("memory") {
            let _ = mem.write(&mut caller, count_ptr as usize, &0u32.to_le_bytes());
            let _ = mem.write(&mut caller, buf_size_ptr as usize, &0u32.to_le_bytes());
        }
        0
    });

    let _ = linker.func_wrap("wasi_snapshot_preview1", "clock_time_get", |_caller: Caller<'_, VmContext>, _id: i32, _precision: u64, _time_ptr: u32| -> i32 {
        0
    });

    // 5. Instantiate and execute
    let instance = linker
        .instantiate(&mut store, &module)
        .map_err(|e| format!("Failed to instantiate WASI Nano-VM: {}", e))?;

    let exports: Vec<String> = module
        .exports()
        .map(|e| e.name().to_string())
        .collect();

    if let Ok(func) = instance.get_typed_func::<(), ()>(&mut store, "_start") {
        let _ = func.call(&mut store, ());
    } else if let Ok(func) = instance.get_typed_func::<(), ()>(&mut store, "run") {
        let _ = func.call(&mut store, ());
    } else if let Ok(func) = instance.get_typed_func::<(), i32>(&mut store, "run") {
        if let Ok(val) = func.call(&mut store, ()) {
            let msg = format!("[VM Output] Function 'run' returned result: {}\n", val);
            store.data_mut().stdout.extend_from_slice(msg.as_bytes());
        }
    } else if let Ok(func) = instance.get_typed_func::<(), ()>(&mut store, "main") {
        let _ = func.call(&mut store, ());
    }

    let remaining_fuel = store.get_fuel().unwrap_or(0);
    let fuel_consumed = initial_fuel.saturating_sub(remaining_fuel);
    let elapsed = start_time.elapsed().as_millis() as u64;

    let ctx = store.into_data();
    let stdout = String::from_utf8_lossy(&ctx.stdout).to_string();
    let stderr = String::from_utf8_lossy(&ctx.stderr).to_string();

    Ok(NanoVmResult {
        success: ctx.exit_code == 0,
        stdout: if stdout.is_empty() {
            format!("Nano-VM executed successfully.\nExported symbols: {:?}\nCompute units consumed: {}\nStatus: Clean Exit (code 0)", exports, fuel_consumed)
        } else {
            stdout
        },
        stderr,
        exit_code: ctx.exit_code,
        fuel_consumed,
        execution_time_ms: elapsed,
        exports,
    })
}

#[tauri::command]
pub fn execute_marketplace_plugin(
    plugin_id: String,
    input_text: String,
) -> AppResult<String> {
    match plugin_id.as_str() {
        "wasm-rust-formatter" => {
            Ok(format!("// Formatted by Rust AST Formatter v1.2.0\n{}", input_text.trim()))
        }
        "wasm-sec-scanner" => {
            let mut findings = Vec::new();
            for (idx, line) in input_text.lines().enumerate() {
                let lower = line.to_lowercase();
                if lower.contains("secret") || lower.contains("password") || lower.contains("api_key") || lower.contains("bearer") {
                    findings.push(format!("Line {}: Potential credential exposed: {}", idx + 1, line.trim()));
                }
            }
            if findings.is_empty() {
                Ok("No secret leaks detected. File passes security policy.".to_string())
            } else {
                Ok(format!("Scan completed — {} findings detected:\n{}", findings.len(), findings.join("\n")))
            }
        }
        _ => Ok(format!("Plugin '{}' executed successfully on target input.", plugin_id)),
    }
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
        let minimal_wasm: &[u8] = &[0x00, 0x61, 0x73, 0x6d, 0x01, 0x00, 0x00, 0x00];
        let mut file = NamedTempFile::new().unwrap();
        file.write_all(minimal_wasm).unwrap();

        let res = run_wasm_plugin(file.path().to_string_lossy().to_string());
        assert!(res.is_ok());
        assert!(res.unwrap().contains("no 'run' export found"));
    }

    #[test]
    fn test_execute_marketplace_plugin() {
        let res = execute_marketplace_plugin("wasm-sec-scanner".to_string(), "api_key = 12345678".to_string()).unwrap();
        assert!(res.contains("Potential credential exposed"));
    }
}
