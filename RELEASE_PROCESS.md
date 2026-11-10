# CodexOS Release Process

This document outlines the standard release procedure, automated packaging pipeline, and quality gates for CodexOS.

---

## 1. Version Alignment Checklist

Before tagging a new release, ensure version numbers match across all project manifests:

1. `package.json` (`version`)
2. `src-tauri/Cargo.toml` (`[package] version`)
3. `src-tauri/tauri.conf.json` (`version`)
4. `src/App.tsx` (titlebar badge)
5. `src/services/updaterService.ts` (`currentVersion`)
6. `CHANGELOG.md` (new section with release notes)

Run `cargo check` in `src-tauri` to synchronize `src-tauri/Cargo.lock`.

---

## 2. Pre-Release Local Verification Gate

Every check must pass with zero errors before pushing a release tag:

```powershell
# 1. Frontend validation
npm run lint
npx tsc -b
npm test

# 2. Rust validation
cd src-tauri
cargo fmt --all -- --check
cargo clippy -- -D warnings
cargo test
cd ..

# 3. Production build test
npm run build
```

---

## 3. GitHub Actions Release Automation

CodexOS uses [`.github/workflows/release.yml`](.github/workflows/release.yml) to produce automated multi-platform builds.

### Triggering a Release
Push a semantic version tag:
```bash
git tag v2.3.0
git push origin v2.3.0
```

### Pipeline Workflow:
1. **`test` Job (Ubuntu):**
   - Runs `npm ci`, `npm test`, `npm run lint`, and `npx tsc -b`.
2. **`test-rust` Job (Ubuntu):**
   - Runs `cargo fmt --all -- --check`, `cargo clippy -- -D warnings`, `cargo test`, and `cargo deny`.
3. **`build` Job (Windows, Linux, macOS):**
   - Builds NSIS (`.exe`) and WiX (`.msi`) installers on Windows.
   - Signs updater payloads using `TAURI_SIGNING_PRIVATE_KEY`.
   - Generates `SHA256SUMS.txt` checksum manifest.
   - Uploads `Install-CodexOS.bat` and `scripts/Install-CodexOS.ps1`.
   - Creates a GitHub Draft Release.

---

## 4. Release Artifacts Generated

| Artifact | Platform | Description |
| :--- | :--- | :--- |
| `CodexOS_2.3.0_x64-setup.exe` | Windows | NSIS Per-User Installer |
| `CodexOS_2.3.0_x64_en-US.msi` | Windows | WiX Machine-Wide Installer |
| `Install-CodexOS.bat` | Windows | One-click bootstrapper script |
| `Install-CodexOS.ps1` | Windows | PowerShell installation engine |
| `latest.json` | All | Tauri Auto-Updater manifest |
| `SHA256SUMS.txt` | All | Cryptographic SHA-256 verification manifest |

---

## 5. Security & Signing Secrets

The following GitHub repository secrets configure production code signing:

- `WINDOWS_CERTIFICATE` & `WINDOWS_CERTIFICATE_PASSWORD`: Authenticode certificate for SmartScreen trust.
- `TAURI_SIGNING_PRIVATE_KEY` & `TAURI_SIGNING_PRIVATE_KEY_PASSWORD`: Minisign key for cryptographic auto-updates.
- `APPLE_CERTIFICATE`, `APPLE_ID`, `APPLE_PASSWORD`, `APPLE_TEAM_ID`: macOS Developer ID and Apple Notarization credentials.

*Note:* If secrets are absent (e.g. in community forks), the build produces unsigned release artifacts while displaying community build notices in the bootstrapper.
