use ring::{hmac, rand};
use ring::rand::SecureRandom;


#[tauri::command]
pub fn generate_hmac_proof(vault_data: String, secret_key: String) -> Result<String, String> {
    // Generate a secure random nonce
    let rng = rand::SystemRandom::new();
    let mut nonce = [0u8; 16];
    rng.fill(&mut nonce).map_err(|_| "Failed to generate secure nonce")?;

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
pub fn verify_hmac_proof(proof_hash: String, expected_vault_data: String, secret_key: String) -> Result<bool, String> {
    let parts: Vec<&str> = proof_hash.split(':').collect();
    if parts.len() != 2 {
        return Err("Invalid proof format".to_string());
    }

    let nonce = hex::decode(parts[0]).map_err(|_| "Invalid nonce encoding")?;
    let signature_bytes = hex::decode(parts[1]).map_err(|_| "Invalid signature encoding")?;

    let key = hmac::Key::new(hmac::HMAC_SHA256, secret_key.as_bytes());
    
    let mut combined_data = expected_vault_data.into_bytes();
    combined_data.extend_from_slice(&nonce);

    // Constant-time verification
    match hmac::verify(&key, &combined_data, &signature_bytes) {
        Ok(_) => Ok(true),
        Err(_) => Ok(false)
    }
}

// Add a hex module since we don't have the crate installed
mod hex {
    pub fn encode(data: impl AsRef<[u8]>) -> String {
        data.as_ref().iter().map(|b| format!("{:02x}", b)).collect()
    }
    
    pub fn decode(s: &str) -> Result<Vec<u8>, ()> {
        if s.len() % 2 != 0 { return Err(()); }
        let mut out = Vec::with_capacity(s.len() / 2);
        for i in (0..s.len()).step_by(2) {
            out.push(u8::from_str_radix(&s[i..i+2], 16).map_err(|_| ())?);
        }
        Ok(out)
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
}
