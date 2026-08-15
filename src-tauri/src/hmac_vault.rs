use ring::rand::SecureRandom;
use ring::{hmac, rand};

use crate::error::AppResult;

const MAX_VAULT_DATA_BYTES: usize = 50 * 1024 * 1024; // 50 MB

#[tauri::command]
pub fn generate_hmac_proof(vault_data: String, secret_key: String) -> AppResult<String> {
    if secret_key.trim().is_empty() {
        return Err(crate::error::AppError::Custom("HMAC secret key cannot be empty".to_string()));
    }
    if vault_data.len() > MAX_VAULT_DATA_BYTES {
        return Err(crate::error::AppError::Custom("Vault payload exceeds maximum size limit (50 MB)".to_string()));
    }

    // Generate a secure random nonce
    let rng = rand::SystemRandom::new();
    let mut nonce = [0u8; 16];
    rng.fill(&mut nonce)
        .map_err(|_| "Failed to generate secure nonce")?;

    // Use HMAC-SHA256 for cryptographic commitment
    let key = hmac::Key::new(hmac::HMAC_SHA256, secret_key.as_bytes());

    // Sign the data + nonce
    let mut combined_data = vault_data.into_bytes();
    combined_data.extend_from_slice(&nonce);

    let signature = hmac::sign(&key, &combined_data);

    // Return proof containing nonce and signature
    let proof = format!("{}:{}", hex::encode(nonce), hex::encode(signature.as_ref()));
    Ok(proof)
}

#[tauri::command]
pub fn verify_hmac_proof(
    proof_hash: String,
    expected_vault_data: String,
    secret_key: String,
) -> AppResult<bool> {
    if secret_key.trim().is_empty() {
        return Err(crate::error::AppError::Custom("HMAC verification key cannot be empty".to_string()));
    }
    if expected_vault_data.len() > MAX_VAULT_DATA_BYTES {
        return Err(crate::error::AppError::Custom("Expected vault payload exceeds maximum size limit (50 MB)".to_string()));
    }

    let parts: Vec<&str> = proof_hash.split(':').collect();
    if parts.len() != 2 {
        return Err(crate::error::AppError::Custom("Invalid proof format".to_string()));
    }

    let nonce = hex::decode(parts[0]).map_err(|_| "Invalid nonce encoding")?;
    let signature_bytes = hex::decode(parts[1]).map_err(|_| "Invalid signature encoding")?;

    let key = hmac::Key::new(hmac::HMAC_SHA256, secret_key.as_bytes());

    let mut combined_data = expected_vault_data.into_bytes();
    combined_data.extend_from_slice(&nonce);

    // Constant-time verification
    match hmac::verify(&key, &combined_data, &signature_bytes) {
        Ok(_) => Ok(true),
        Err(_) => Ok(false),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_cryptographic_commitment() {
        let vault = "My Super Secret Source Code".to_string();
        let key = "MyPrivateKey123".to_string();

        // 1. Generate Proof
        let proof = generate_hmac_proof(vault.clone(), key.clone()).unwrap();
        assert!(proof.contains(':'));

        // 2. Verify with correct data
        let is_valid = verify_hmac_proof(proof.clone(), vault.clone(), key.clone()).unwrap();
        assert!(is_valid, "Valid proof should pass verification");

        // 3. Verify with wrong data (Tampered)
        let tampered_vault = "My Super Secret Source Codf".to_string();
        let is_invalid = verify_hmac_proof(proof.clone(), tampered_vault, key.clone()).unwrap();
        assert!(!is_invalid, "Tampered data should fail verification");

        // 4. Verify with wrong key
        let wrong_key = "MyPrivateKey124".to_string();
        let is_invalid_key = verify_hmac_proof(proof, vault, wrong_key).unwrap();
        assert!(!is_invalid_key, "Wrong key should fail verification");
    }

    #[test]
    fn test_empty_key_fails() {
        assert!(generate_hmac_proof("data".to_string(), "".to_string()).is_err());
        assert!(verify_hmac_proof("aa:bb".to_string(), "data".to_string(), "".to_string()).is_err());
    }
}
