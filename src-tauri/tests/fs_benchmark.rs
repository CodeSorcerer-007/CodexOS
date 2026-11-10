use app_lib::files::FileInfo;
use std::fs::{self, File};
use std::io::Write;
use std::time::Instant;

fn run_benchmark_for_count(count: usize) -> (u128, u128, u128, usize) {
    let temp_dir = std::env::temp_dir().join(format!("codexos_bench_{}", count));
    if temp_dir.exists() {
        let _ = fs::remove_dir_all(&temp_dir);
    }
    fs::create_dir_all(&temp_dir).expect("Failed to create bench temp dir");

    // Populate dummy files
    for i in 0..count {
        let file_path = temp_dir.join(format!("test_file_{:06}.txt", i));
        let mut f = File::create(&file_path).expect("Failed to create file");
        let _ = f.write_all(b"bench data");
    }

    // 1. Measure raw read_dir iteration + metadata retrieval
    let t_start = Instant::now();
    let entries = fs::read_dir(&temp_dir).expect("read_dir failed");
    let mut files = Vec::with_capacity(count);

    let mut metadata_total_nanos: u128 = 0;
    for entry in entries.flatten() {
        let t_meta = Instant::now();
        let meta = entry.metadata().expect("metadata failed");
        metadata_total_nanos += t_meta.elapsed().as_nanos();

        files.push(FileInfo {
            name: entry.file_name().to_string_lossy().to_string(),
            path: entry.path().to_string_lossy().to_string(),
            is_dir: meta.is_dir(),
            size_bytes: meta.len(),
        });
    }
    let total_enum_elapsed_ms = t_start.elapsed().as_millis();
    let metadata_ms = metadata_total_nanos / 1_000_000;

    // 2. Measure IPC serialization (serde_json)
    let t_json = Instant::now();
    let serialized = serde_json::to_string(&files).expect("serialization failed");
    let json_ms = t_json.elapsed().as_millis();
    let json_bytes = serialized.len();

    // Cleanup
    let _ = fs::remove_dir_all(&temp_dir);

    (total_enum_elapsed_ms, metadata_ms, json_ms, json_bytes)
}

#[test]
#[ignore] // Run with: cargo test --test fs_benchmark -- --ignored --nocapture
fn benchmark_filesystem_scales() {
    println!("\n=== CODEXOS FILESYSTEM PERFORMANCE BENCHMARK ===");
    for &count in &[1_000, 10_000, 50_000] {
        println!("Testing scale: {} entries...", count);
        let (total_ms, meta_ms, json_ms, json_bytes) = run_benchmark_for_count(count);
        println!(
            "Count: {:6} | Total Enum: {:5} ms | Metadata: {:5} ms | JSON IPC: {:5} ms | Payload: {:7.2} MB",
            count,
            total_ms,
            meta_ms,
            json_ms,
            json_bytes as f64 / 1_048_576.0
        );
    }
    println!("================================================\n");
}

#[test]
#[ignore] // Run with: cargo test --test fs_benchmark benchmark_search_and_indexing_scales -- --ignored --nocapture
fn benchmark_search_and_indexing_scales() {
    use app_lib::search::{
        execute_streaming_search, index_workspace_internal, parse_search_query,
        query_workspace_index, SearchExecutionOptions,
    };
    use rusqlite::Connection;
    use std::sync::atomic::AtomicBool;

    println!("\n=== CODEXOS SEARCH & INDEXING PERFORMANCE BENCHMARK ===");
    for &count in &[10_000, 50_000] {
        let temp_dir = std::env::temp_dir().join(format!("codexos_search_bench_{}", count));
        if temp_dir.exists() {
            let _ = fs::remove_dir_all(&temp_dir);
        }
        fs::create_dir_all(&temp_dir).expect("Failed to create bench temp dir");

        let extensions = ["rs", "ts", "json", "md", "txt"];
        println!(
            "\nGenerating test directory structure with {} files...",
            count
        );
        let gen_start = Instant::now();
        for i in 0..count {
            let ext = extensions[i % extensions.len()];
            let sub = i % 50;
            let sub_dir = temp_dir.join(format!("subdir_{}", sub));
            if i < 50 {
                let _ = fs::create_dir_all(&sub_dir);
            }
            let file_path = sub_dir.join(format!("file_{:06}.{}", i, ext));
            let content = if i == 42 || i == 9999 || i == 49999 {
                "// Special search target: TARGET_KEYWORD_MATCH\npub fn found() -> bool { true }\n"
            } else {
                "// Normal code file\nconst VAL: u32 = 12345;\n"
            };
            let _ = fs::write(&file_path, content);
        }
        println!(
            "Generated {} files in {} ms",
            count,
            gen_start.elapsed().as_millis()
        );

        let cancel = AtomicBool::new(false);
        let opts = SearchExecutionOptions {
            search_content: false,
            max_results: Some(5000),
            max_file_size_bytes: None,
            custom_exclusions: None,
            include_hidden: None,
        };

        // 1. Cold search latency (name search)
        let q_name = parse_search_query("file_000042").unwrap();
        let t_cold = Instant::now();
        let (cold_matches, scanned_cold, _) =
            execute_streaming_search(None, "bench_cold", &temp_dir, &q_name, &opts, &cancel, None);
        let cold_ms = t_cold.elapsed().as_millis();
        assert_eq!(cold_matches.len(), 1);

        // 2. Warm search latency (name search)
        let t_warm = Instant::now();
        let (warm_matches, _scanned_warm, _) =
            execute_streaming_search(None, "bench_warm", &temp_dir, &q_name, &opts, &cancel, None);
        let warm_ms = t_warm.elapsed().as_millis();
        assert_eq!(warm_matches.len(), 1);

        // 3. Content search latency
        let q_content = parse_search_query("content:TARGET_KEYWORD_MATCH").unwrap();
        let content_opts = SearchExecutionOptions {
            search_content: true,
            max_results: Some(5000),
            max_file_size_bytes: None,
            custom_exclusions: None,
            include_hidden: None,
        };
        let t_content = Instant::now();
        let (content_matches, _, _) = execute_streaming_search(
            None,
            "bench_content",
            &temp_dir,
            &q_content,
            &content_opts,
            &cancel,
            None,
        );
        let content_ms = t_content.elapsed().as_millis();
        assert!(!content_matches.is_empty());

        // 4. Initial Indexing into SQLite
        let mut conn = Connection::open_in_memory().unwrap();
        app_lib::db_migration::run_migrations(&mut conn).unwrap();

        let ws_str = temp_dir.to_string_lossy().to_string();
        let t_index = Instant::now();
        let index_status = index_workspace_internal(&mut conn, &ws_str, &cancel, None).unwrap();
        let index_ms = t_index.elapsed().as_millis();
        assert_eq!(index_status.file_count, count);

        // 5. Index Query Performance (instant SQLite lookup)
        let q_indexed = parse_search_query("ext:rs name:0000").unwrap();
        let t_idx_query = Instant::now();
        let _idx_matches = query_workspace_index(&conn, &ws_str, &q_indexed, 100).unwrap();
        let idx_query_ms = t_idx_query.elapsed().as_micros();

        println!(
            "Count: {:6} | Cold: {:4} ms | Warm: {:4} ms | Content: {:4} ms | SQLite Index: {:5} ms | SQLite Query: {:5} µs ({} results, {} scanned)",
            count,
            cold_ms,
            warm_ms,
            content_ms,
            index_ms,
            idx_query_ms,
            cold_matches.len(),
            scanned_cold
        );

        let _ = fs::remove_dir_all(&temp_dir);
    }
    println!("=======================================================\n");
}

#[test]
fn benchmark_streaming_verification() {
    use app_lib::files::{copy_dir_all, copy_dir_streaming_verified, copy_file_streaming_verified};
    use std::time::Instant;

    println!("\n=== CODEXOS STREAMING VERIFICATION BENCHMARK ===");

    let bench_dir = std::env::temp_dir().join(format!(
        "codexos_bench_stream_{}",
        std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap()
            .as_secs()
    ));
    let _ = fs::create_dir_all(&bench_dir);

    // 1. Small file (4 KB)
    {
        let src = bench_dir.join("small_src.bin");
        let dst_raw = bench_dir.join("small_dst_raw.bin");
        let dst_ver = bench_dir.join("small_dst_ver.bin");
        fs::write(&src, vec![0x42u8; 4 * 1024]).unwrap();

        let iterations = 100;
        let t0 = Instant::now();
        for _ in 0..iterations {
            let _ = fs::copy(&src, &dst_raw);
        }
        let raw_total_us = t0.elapsed().as_micros();
        let raw_avg_us = raw_total_us / iterations;

        let t1 = Instant::now();
        for _ in 0..iterations {
            let _ = copy_file_streaming_verified(&src, &dst_ver);
        }
        let ver_total_us = t1.elapsed().as_micros();
        let ver_avg_us = ver_total_us / iterations;

        let overhead_pct =
            ((ver_avg_us as f64 - raw_avg_us as f64) / raw_avg_us.max(1) as f64) * 100.0;
        println!(
            "Small File (4 KB)   | Raw Copy: {:5} µs | Verified Copy: {:5} µs | Overhead: {:+6.1}% | Buffer: 64 KB",
            raw_avg_us, ver_avg_us, overhead_pct
        );
    }

    // 2. Medium file (1 MB)
    {
        let src = bench_dir.join("med_src.bin");
        let dst_raw = bench_dir.join("med_dst_raw.bin");
        let dst_ver = bench_dir.join("med_dst_ver.bin");
        fs::write(&src, vec![0x37u8; 1024 * 1024]).unwrap();

        let iterations = 20;
        let t0 = Instant::now();
        for _ in 0..iterations {
            let _ = fs::copy(&src, &dst_raw);
        }
        let raw_avg_us = t0.elapsed().as_micros() / iterations;

        let t1 = Instant::now();
        for _ in 0..iterations {
            let _ = copy_file_streaming_verified(&src, &dst_ver);
        }
        let ver_avg_us = t1.elapsed().as_micros() / iterations;

        let overhead_pct =
            ((ver_avg_us as f64 - raw_avg_us as f64) / raw_avg_us.max(1) as f64) * 100.0;
        let throughput_mb_s = (1.0 / (ver_avg_us as f64 / 1_000_000.0)).max(0.0);
        println!(
            "Medium File (1 MB)  | Raw Copy: {:5} µs | Verified Copy: {:5} µs | Overhead: {:+6.1}% | Throughput: {:6.1} MB/s",
            raw_avg_us, ver_avg_us, overhead_pct, throughput_mb_s
        );
    }

    // 3. Large file (25 MB)
    {
        let src = bench_dir.join("large_src.bin");
        let dst_raw = bench_dir.join("large_dst_raw.bin");
        let dst_ver = bench_dir.join("large_dst_ver.bin");
        let data = vec![0xAAu8; 25 * 1024 * 1024];
        fs::write(&src, &data).unwrap();

        let iterations = 3;
        let t0 = Instant::now();
        for _ in 0..iterations {
            let _ = fs::copy(&src, &dst_raw);
        }
        let raw_avg_ms = t0.elapsed().as_millis() / iterations as u128;

        let t1 = Instant::now();
        for _ in 0..iterations {
            let _ = copy_file_streaming_verified(&src, &dst_ver);
        }
        let ver_avg_ms = t1.elapsed().as_millis() / iterations as u128;

        let overhead_pct =
            ((ver_avg_ms as f64 - raw_avg_ms as f64) / raw_avg_ms.max(1) as f64) * 100.0;
        let throughput_mb_s = (25.0 / (ver_avg_ms as f64 / 1_000.0)).max(0.0);
        println!(
            "Large File (25 MB)  | Raw Copy: {:5} ms | Verified Copy: {:5} ms | Overhead: {:+6.1}% | Throughput: {:6.1} MB/s",
            raw_avg_ms, ver_avg_ms, overhead_pct, throughput_mb_s
        );
    }

    // 4. Very Large File (50 MB)
    {
        let src = bench_dir.join("vlarge_src.bin");
        let dst_raw = bench_dir.join("vlarge_dst_raw.bin");
        let dst_ver = bench_dir.join("vlarge_dst_ver.bin");
        let data = vec![0xBBu8; 50 * 1024 * 1024];
        fs::write(&src, &data).unwrap();

        let iterations = 2;
        let t0 = Instant::now();
        for _ in 0..iterations {
            let _ = fs::copy(&src, &dst_raw);
        }
        let raw_avg_ms = t0.elapsed().as_millis() / iterations as u128;

        let t1 = Instant::now();
        for _ in 0..iterations {
            let _ = copy_file_streaming_verified(&src, &dst_ver);
        }
        let ver_avg_ms = t1.elapsed().as_millis() / iterations as u128;

        let overhead_pct =
            ((ver_avg_ms as f64 - raw_avg_ms as f64) / raw_avg_ms.max(1) as f64) * 100.0;
        let throughput_mb_s = (50.0 / (ver_avg_ms as f64 / 1_000.0)).max(0.0);
        println!(
            "VLarge File (50 MB) | Raw Copy: {:5} ms | Verified Copy: {:5} ms | Overhead: {:+6.1}% | Throughput: {:6.1} MB/s",
            raw_avg_ms, ver_avg_ms, overhead_pct, throughput_mb_s
        );
    }

    // 5. Directory Transfer (100 files across 10 subdirectories)
    {
        let src_tree = bench_dir.join("dir_src_tree");
        let dst_raw_tree = bench_dir.join("dir_dst_raw_tree");
        let dst_ver_tree = bench_dir.join("dir_dst_ver_tree");
        fs::create_dir_all(&src_tree).unwrap();

        let mut total_dir_bytes: u64 = 0;
        for d in 0..10 {
            let sub = src_tree.join(format!("subdir_{:02}", d));
            fs::create_dir_all(&sub).unwrap();
            for f in 0..10 {
                let file_path = sub.join(format!("file_{:02}.dat", f));
                let size = (f + 1) * 8 * 1024; // 8KB to 80KB
                fs::write(&file_path, vec![0x55u8; size]).unwrap();
                total_dir_bytes += size as u64;
            }
        }

        let t0 = Instant::now();
        let _ = copy_dir_all(&src_tree, &dst_raw_tree);
        let raw_dir_ms = t0.elapsed().as_millis();

        let t1 = Instant::now();
        let _ = copy_dir_streaming_verified(&src_tree, &dst_ver_tree);
        let ver_dir_ms = t1.elapsed().as_millis();

        let overhead_pct =
            ((ver_dir_ms as f64 - raw_dir_ms as f64) / raw_dir_ms.max(1) as f64) * 100.0;
        println!(
            "Directory (100 files)| Raw Copy: {:5} ms | Verified Copy: {:5} ms | Overhead: {:+6.1}% | Total Size: {:4.2} MB",
            raw_dir_ms, ver_dir_ms, overhead_pct, total_dir_bytes as f64 / 1_048_576.0
        );
    }

    let _ = fs::remove_dir_all(&bench_dir);
    println!("================================================\n");
}
