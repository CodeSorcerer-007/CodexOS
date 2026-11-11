# CodexOS Upgrading Guide

This guide details how CodexOS preserves your workspaces, settings, and files across application updates.

---

## In-Place Upgrades

CodexOS is engineered for non-destructive in-place upgrades:

1. **User Data Separation:**  
   All personal configurations, workspace history, SQLite key-value databases, and encrypted vaults reside in your user profile:
   ```
   %APPDATA%\com.codexos.app
   ```
   The installer replaces only the application binaries in `%LOCALAPPDATA%\Programs\CodexOS` and **never overwrites or purges your user data directory**.

2. **Workspaces & Tabs:**  
   Your active tabs, pinned directories, and recent history are preserved across restarts and updates.

3. **Registry Integrity:**  
   In-place upgrades update existing HKCU context menu and startup paths in-place. No duplicate keys or orphaned entries are created.

---

## Upgrade Methods

### Method 1: In-App Auto-Updater

1. Launch CodexOS.
2. Navigate to **Settings** $\rightarrow$ **Diagnostics & Updates**.
3. If an update is detected, click **Download and Install Update**.
4. CodexOS verifies the cryptographic Minisign signature of the update payload and restarts into the new version.

---

### Method 2: Running the Bootstrapper

Run `Install-CodexOS.bat` or the PowerShell installer:
```powershell
.\Install-CodexOS.bat
```
The bootstrapper automatically detects your existing installation, closes any active CodexOS processes gracefully, downloads the new version, and performs the in-place upgrade.

---

### Method 3: Manual Installer Upgrade

1. Download the new version installer (`CodexOS_x.x.x_x64-setup.exe` or `.msi`).
2. Close CodexOS if running.
3. Run the installer. It will automatically detect the previous version and overwrite application files while preserving all settings.

---

## Troubleshooting Upgrade Issues

### "File in Use" Warning During Upgrade
If the installer reports that `CodexOS.exe` cannot be overwritten:
1. Ensure all CodexOS windows are closed.
2. Check Task Manager (`Ctrl+Shift+Esc`) for any background `CodexOS.exe` instances.
3. End task or run in PowerShell:
   ```powershell
   Stop-Process -Name "CodexOS" -Force -ErrorAction SilentlyContinue
   ```
4. Re-run the installer.
