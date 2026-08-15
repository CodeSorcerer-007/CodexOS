# ADR 003: Cryptographic Architecture (Argon2id + ChaCha20-Poly1305)

## Status
Accepted

## Context
CodexOS contains an offline Vault for API keys, SSH credentials, database connection strings, and certificates. Sensitive secrets must be encrypted at rest and resistant to GPU brute-force attacks.

## Decision
Key derivation uses **Argon2id** with salt & memory cost configuration. Authenticated encryption uses **ChaCha20-Poly1305**.

## Rationale
1. **Argon2id**: Winner of the Password Hashing Competition; offers memory-hard defense against custom ASIC and GPU cracking attempts.
2. **ChaCha20-Poly1305**: Provides constant-time AEAD encryption without reliance on AES-NI hardware instructions, preventing side-channel timing attacks across all supported CPU architectures.
3. **Zeroization**: In-memory key buffers wrap values with `zeroize::Zeroize` to scrub key material on drop.

## Consequences
- Master key derivation requires ~100–200ms CPU memory allocations on unlock, which is acceptable for security-critical desktop unlock events.
