use app_lib::proxy::is_ssrf_blocked;
use app_lib::vault::{encrypt_vault, decrypt_vault};
use app_lib::files::AllowedPathsState;
use tempfile::tempdir;

#[test]
fn test_ssrf_firewall_blocks_local_and_private_ips() {
    let empty_whitelist: Vec<String> = Vec::new();

    // Loopback & Localhost
    assert!(is_ssrf_blocked("localhost", &empty_whitelist));
    assert!(is_ssrf_blocked("sub.localhost", &empty_whitelist));
    assert!(is_ssrf_blocked("127.0.0.1", &empty_whitelist));
    assert!(is_ssrf_blocked("127.0.0.1:8080", &empty_whitelist));
    assert!(is_ssrf_blocked("::1", &empty_whitelist));
    assert!(is_ssrf_blocked("[::1]:3000", &empty_whitelist));
    assert!(is_ssrf_blocked("0.0.0.0", &empty_whitelist));
    assert!(is_ssrf_blocked("::", &empty_whitelist));

    // Cloud Metadata Endpoints
    assert!(is_ssrf_blocked("169.254.169.254", &empty_whitelist));
    assert!(is_ssrf_blocked("169.254.1.1", &empty_whitelist));
    assert!(is_ssrf_blocked("metadata.google.internal", &empty_whitelist));
    assert!(is_ssrf_blocked("instance-data", &empty_whitelist));

    // RFC-1918 Private IPv4 Ranges
    assert!(is_ssrf_blocked("10.0.0.1", &empty_whitelist));
    assert!(is_ssrf_blocked("10.255.255.255:80", &empty_whitelist));
    assert!(is_ssrf_blocked("172.16.0.1", &empty_whitelist));
    assert!(is_ssrf_blocked("172.31.255.255", &empty_whitelist));
    assert!(is_ssrf_blocked("192.168.1.1", &empty_whitelist));
    assert!(is_ssrf_blocked("192.168.0.100:8000", &empty_whitelist));

    // CGNAT & Carrier Ranges
    assert!(is_ssrf_blocked("100.64.0.1", &empty_whitelist));
    assert!(is_ssrf_blocked("100.127.255.255", &empty_whitelist));

    // IPv6 Link-Local & Unique Local (ULA)
    assert!(is_ssrf_blocked("fe80::1", &empty_whitelist));
    assert!(is_ssrf_blocked("fc00::1", &empty_whitelist));
    assert!(is_ssrf_blocked("fd12:3456:789a:1::1", &empty_whitelist));

    // IPv4-mapped IPv6
    assert!(is_ssrf_blocked("::ffff:127.0.0.1", &empty_whitelist));
    assert!(is_ssrf_blocked("::ffff:192.168.1.1", &empty_whitelist));
    assert!(is_ssrf_blocked("::ffff:10.0.0.1", &empty_whitelist));

    // Public valid hosts should NOT be blocked
    assert!(!is_ssrf_blocked("example.com", &empty_whitelist));
    assert!(!is_ssrf_blocked("api.github.com", &empty_whitelist));
    assert!(!is_ssrf_blocked("93.184.216.34", &empty_whitelist)); // example.com IP
}

#[test]
fn test_ssrf_whitelist_allows_explicit_destinations() {
    let whitelist = vec![
        "localhost".to_string(),
        "127.0.0.1".to_string(),
        "192.168.1.50".to_string(),
    ];

    assert!(!is_ssrf_blocked("localhost", &whitelist));
    assert!(!is_ssrf_blocked("127.0.0.1", &whitelist));
    assert!(!is_ssrf_blocked("127.0.0.1:8080", &whitelist));
    assert!(!is_ssrf_blocked("192.168.1.50", &whitelist));
    assert!(!is_ssrf_blocked("192.168.1.50:3000", &whitelist));

    // Non-whitelisted private addresses must still be blocked
    assert!(is_ssrf_blocked("10.0.0.1", &whitelist));
    assert!(is_ssrf_blocked("169.254.169.254", &whitelist));
}

#[test]
fn test_vault_encryption_roundtrip_with_strong_password() {
    let dir = tempdir().unwrap();
    let src_dir = dir.path().join("source");
    let dest_dir = dir.path().join("extracted");
    let vault_file = dir.path().join("test_vault.enc");

    std::fs::create_dir_all(&src_dir).unwrap();
    std::fs::write(src_dir.join("secret_data.txt"), "codexos-production-10-out-of-10").unwrap();

    let password = "super-secret-vault-password-2026".to_string();

    // Encrypt
    let enc_result = encrypt_vault(
        src_dir.to_string_lossy().to_string(),
        password.clone(),
        vault_file.to_string_lossy().to_string(),
    );
    assert!(enc_result.is_ok(), "Encryption should succeed");
    assert!(vault_file.exists(), "Vault file must be created on disk");

    // Decrypt
    std::fs::create_dir_all(&dest_dir).unwrap();
    let dec_result = decrypt_vault(
        vault_file.to_string_lossy().to_string(),
        password,
        dest_dir.to_string_lossy().to_string(),
    );
    assert!(dec_result.is_ok(), "Decryption should succeed");

    let restored = std::fs::read_to_string(dest_dir.join("secret_data.txt")).unwrap();
    assert_eq!(restored, "codexos-production-10-out-of-10");
}

#[test]
fn test_allowed_paths_sandbox_enforcement() {
    let state = AllowedPathsState::new();
    let temp_dir = tempdir().unwrap();
    let inside_path = temp_dir.path().join("workspace").join("src");
    let outside_path = std::path::PathBuf::from("C:\\Windows\\System32\\drivers\\etc\\hosts");

    std::fs::create_dir_all(&inside_path).unwrap();

    // Allow workspace root
    state.allow(temp_dir.path());
    assert!(state.is_allowed(&inside_path));

    // Outside path must not be allowed
    assert!(!state.is_allowed(&outside_path));
}

#[test]
fn test_bounded_lru_cache_integration() {
    use app_lib::util::BoundedLruCache;
    let mut cache = BoundedLruCache::new(3);
    cache.insert("key1".to_string(), "val1".to_string());
    cache.insert("key2".to_string(), "val2".to_string());
    cache.insert("key3".to_string(), "val3".to_string());
    assert_eq!(cache.len(), 3);

    // Access key1 so key2 becomes least recently used
    assert_eq!(cache.get(&"key1".to_string()), Some("val1".to_string()));

    // Insert key4 -> evicts key2
    cache.insert("key4".to_string(), "val4".to_string());
    assert_eq!(cache.len(), 3);
    assert_eq!(cache.get(&"key2".to_string()), None);
    assert_eq!(cache.get(&"key1".to_string()), Some("val1".to_string()));
    assert_eq!(cache.get(&"key3".to_string()), Some("val3".to_string()));
    assert_eq!(cache.get(&"key4".to_string()), Some("val4".to_string()));
}

#[test]
fn test_kv_sqlite_roundtrip_integration() {
    let conn = rusqlite::Connection::open_in_memory().unwrap();
    conn.execute(
        "CREATE TABLE IF NOT EXISTS store_kv (
            key TEXT PRIMARY KEY,
            value TEXT NOT NULL
        )",
        [],
    ).unwrap();

    conn.execute(
        "INSERT OR REPLACE INTO store_kv (key, value) VALUES (?1, ?2)",
        rusqlite::params!["codexos-settings", "{\"theme\":\"dark\"}"],
    ).unwrap();

    let mut stmt = conn.prepare("SELECT value FROM store_kv WHERE key = ?1").unwrap();
    let val: String = stmt.query_row(rusqlite::params!["codexos-settings"], |row| row.get(0)).unwrap();
    assert_eq!(val, "{\"theme\":\"dark\"}");
}
