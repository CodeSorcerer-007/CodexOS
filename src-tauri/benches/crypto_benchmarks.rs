use std::time::Duration;

use argon2::{Algorithm, Argon2, Params, Version};
use chacha20poly1305::{
    aead::{Aead, KeyInit},
    ChaCha20Poly1305, Key, Nonce,
};
use criterion::{black_box, criterion_group, criterion_main, BenchmarkId, Criterion, Throughput};

/// Benchmark 1: Argon2id password key derivation latency
/// using production parameters from vault.rs (t_cost=3, m_cost=65536, p_cost=4).
fn bench_argon2id_kdf(c: &mut Criterion) {
    let mut group = c.benchmark_group("argon2id_key_derivation");
    group.sample_size(10);
    group.measurement_time(Duration::from_secs(5));

    let params = Params::new(65536, 3, 4, Some(32))
        .expect("Valid Argon2 parameters (t_cost=3, m_cost=65536, p_cost=4, key_len=32)");
    let argon2 = Argon2::new(Algorithm::Argon2id, Version::V0x13, params);

    let password = b"CodexOS-Production-Master-Passphrase-2026";
    let salt = [0x5au8; 16];

    group.bench_function("t3_m65536_p4", |b| {
        b.iter(|| {
            let mut derived_key = [0u8; 32];
            argon2
                .hash_password_into(black_box(password), black_box(&salt), &mut derived_key)
                .expect("Argon2 key derivation failed");
            black_box(derived_key);
        });
    });

    group.finish();
}

/// Benchmark 2: ChaCha20-Poly1305 symmetric encryption and decryption throughput
/// across buffer sizes (64B, 1KB, 64KB, 1MB) using criterion::Throughput::Bytes.
fn bench_chacha20poly1305_throughput(c: &mut Criterion) {
    let key_bytes = [0x42u8; 32];
    let key = Key::from_slice(&key_bytes);
    let cipher = ChaCha20Poly1305::new(key);
    let nonce_bytes = [0x24u8; 12];
    let nonce = Nonce::from_slice(&nonce_bytes);

    let buffer_sizes: [usize; 4] = [
        64,          // 64B
        1024,        // 1KB
        64 * 1024,   // 64KB
        1024 * 1024, // 1MB
    ];

    // Encryption throughput group
    {
        let mut enc_group = c.benchmark_group("chacha20poly1305_encryption");
        for &size in &buffer_sizes {
            let plaintext = vec![0x37u8; size];
            let label = match size {
                64 => "64B".to_string(),
                1024 => "1KB".to_string(),
                65536 => "64KB".to_string(),
                1048576 => "1MB".to_string(),
                other => format!("{other}B"),
            };

            enc_group.throughput(Throughput::Bytes(size as u64));
            enc_group.bench_with_input(BenchmarkId::new("encrypt", &label), &plaintext, |b, pt| {
                b.iter(|| {
                    let ct = cipher
                        .encrypt(black_box(nonce), black_box(pt.as_slice()))
                        .expect("ChaCha20Poly1305 encryption failed");
                    black_box(ct);
                });
            });
        }
        enc_group.finish();
    }

    // Decryption throughput group
    {
        let mut dec_group = c.benchmark_group("chacha20poly1305_decryption");
        for &size in &buffer_sizes {
            let plaintext = vec![0x37u8; size];
            let ciphertext = cipher
                .encrypt(nonce, plaintext.as_slice())
                .expect("Failed to create ciphertext for benchmark");
            let label = match size {
                64 => "64B".to_string(),
                1024 => "1KB".to_string(),
                65536 => "64KB".to_string(),
                1048576 => "1MB".to_string(),
                other => format!("{other}B"),
            };

            dec_group.throughput(Throughput::Bytes(size as u64));
            dec_group.bench_with_input(
                BenchmarkId::new("decrypt", &label),
                &ciphertext,
                |b, ct| {
                    b.iter(|| {
                        let pt = cipher
                            .decrypt(black_box(nonce), black_box(ct.as_slice()))
                            .expect("ChaCha20Poly1305 decryption failed");
                        black_box(pt);
                    });
                },
            );
        }
        dec_group.finish();
    }
}

criterion_group!(
    name = crypto_benches;
    config = Criterion::default();
    targets = bench_argon2id_kdf, bench_chacha20poly1305_throughput
);
criterion_main!(crypto_benches);
