# Commercial Enterprise GA: Code Signing, Notarization & Auto-Updater Runbook

This guide details the exact procedures for configuring production certificates, Apple notarization, and Tauri auto-updater keys for **CodexOS Enterprise General Availability (GA)** releases.

---

## 1. Tauri Auto-Updater Keypair Setup

The Tauri updater validates artifact signatures using a Minisign Ed25519 keypair before allowing background installation.

### 1.1 Generate Keypair
Run using the Tauri CLI:
```bash
npx @tauri-apps/cli signer generate -w ~/.tauri/codexos.key
```

This outputs:
- **Private Key**: e.g., `dW50cnVzdGVkIGNvbW1lbnQ6IG1pbmlzaWduIHNlY3JldCBrZXk...`
- **Public Key**: e.g., `dW50cnVzdGVkIGNvbW1lbnQ6IG1pbmlzaWduIHB1YmxpYyBrZXk...`

### 1.2 Store Secrets in GitHub Repository
Navigate to **Settings > Secrets and variables > Actions** and add:
- `TAURI_SIGNING_PRIVATE_KEY`: Content of the generated private key.
- `TAURI_SIGNING_PRIVATE_KEY_PASSWORD`: Password chosen during generation (or empty if passwordless).

### 1.3 Add Public Key to `tauri.conf.json`
Update `plugins.updater.pubkey` in `src-tauri/tauri.conf.json` with your generated public key.

---

## 2. Windows Authenticode Signing

Eliminates the Windows SmartScreen warning (*"Windows protected your PC / Unknown Publisher"*) and builds trust with corporate antivirus solutions.

### 2.1 Certificate Options
- **EV (Extended Validation) Certificate**: Recommended for Enterprise GA. Provides immediate SmartScreen reputation without downloads warmup. Usually delivered via hardware HSM or Cloud HSM (Azure Key Vault / DigiCert ONE).
- **Standard OV Certificate**: Stored as a `.pfx` file.

### 2.2 GitHub Actions Configuration
Export your code-signing certificate as base64:
```powershell
[Convert]::ToBase64String([IO.File]::ReadAllBytes("path\to\certificate.pfx")) | Set-Clipboard
```
Add to GitHub Secrets:
- `WINDOWS_CERTIFICATE`: The base64-encoded `.pfx` file.
- `WINDOWS_CERTIFICATE_PASSWORD`: The password for the `.pfx` file.

---

## 3. macOS Code Signing & Apple Notarization

Bypasses macOS Gatekeeper (*"App cannot be opened because Apple cannot check it for malicious software"*).

### 3.1 Prerequisites
1. **Apple Developer Account** (Organization or Individual).
2. **Developer ID Application Certificate** downloaded from developer.apple.com.
3. **App-Specific Password** generated at [appleid.apple.com](https://appleid.apple.com).

### 3.2 Export Certificate (.p12)
1. Open **Keychain Access** on macOS.
2. Locate your **Developer ID Application: <Your Name / Company> (<TEAM_ID>)** certificate and private key.
3. Right-click > **Export**, choose `.p12` format with a strong password.
4. Convert to base64:
   ```bash
   base64 -i Certificate.p12 | pbcopy
   ```

### 3.3 GitHub Actions Secrets
Add the following secrets to GitHub:
- `APPLE_CERTIFICATE`: Base64 string of the `.p12` certificate.
- `APPLE_CERTIFICATE_PASSWORD`: Password protecting the `.p12`.
- `APPLE_SIGNING_IDENTITY`: e.g. `Developer ID Application: Your Company LLC (TEAMID123)`.
- `APPLE_ID`: Your Apple ID email (e.g. `dev@company.com`).
- `APPLE_PASSWORD`: The generated App-Specific Password (e.g. `abcd-efgh-ijkl-mnop`).
- `APPLE_TEAM_ID`: Your 10-character Apple Team ID.

---

## 4. Release Process & Verification Checklist

When releasing a new version:
1. Bump version in `package.json`, `src-tauri/Cargo.toml`, and `src-tauri/tauri.conf.json`.
2. Commit and push tag:
   ```bash
   git tag v2.1.0
   git push origin v2.1.0
   ```
3. GitHub Actions builds the matrix:
   - Signs Windows `.msi` and `.exe` installers.
   - Signs and notarizes macOS `.dmg` and `.app`.
   - Generates signed updater archives (`.tar.gz`, `.sig`).
   - Produces `latest.json` manifest for automatic client updates.
4. Verify by clicking **Check for Updates** within CodexOS Settings.
