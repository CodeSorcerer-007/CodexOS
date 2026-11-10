# CodexOS Uninstallation Guide

This document describes how to cleanly remove CodexOS and restore Windows Explorer defaults.

---

## Standard Uninstallation

CodexOS registers with Windows as a standard application:

1. Open **Windows Settings** (`Win + I`).
2. Navigate to **Apps** $\rightarrow$ **Installed apps** (or **Apps & features** on Windows 10).
3. Search for **CodexOS**.
4. Click the three dots (`...`) $\rightarrow$ select **Uninstall**.
5. Follow the uninstallation wizard.

### Installer Specific Uninstallation Behavior
- **NSIS Setup (.exe, Recommended):** Runs within the active user session and automatically executes native pre-uninstall hooks ([`src-tauri/nsis-hooks.nsh`](file:///e:/Github/CodexOS/src-tauri/nsis-hooks.nsh)) to purge all CodexOS HKCU context-menu entries and startup keys before removing application files from `%LOCALAPPDATA%\CodexOS`.
- **WiX MSI Package (.msi, Enterprise):** Runs with elevated machine privileges under the `NT AUTHORITY\SYSTEM` account to remove system files from `C:\Program Files\CodexOS` and shortcuts from `C:\Users\Public`. Because the `SYSTEM` account cannot traverse individual user hives, if users registered context menus in their own `HKEY_CURRENT_USER` hive, they can run [`scripts/unregister-context-menu.reg`](file:///e:/Github/CodexOS/scripts/unregister-context-menu.reg) or toggle the setting off in CodexOS prior to uninstallation.

---

## User Data Preservation Policy

To prevent accidental data loss, the uninstaller **preserves your local workspace configurations, key-value databases, and encrypted vaults by default**:
```
%APPDATA%\com.codexos.app
```

### Complete Purge (Optional)
If you wish to permanently delete all local application data and settings, delete this folder manually in PowerShell:
```powershell
Remove-Item -Path "$env:APPDATA\com.codexos.app" -Recurse -Force -ErrorAction SilentlyContinue
```

---

## Standalone Registry Rollback (Manual Clean)

If you installed CodexOS in portable mode or wish to verify that no registry entries remain, execute the clean rollback registry script:

```powershell
reg import .\scripts\unregister-context-menu.reg
```
Or double-click [`scripts/unregister-context-menu.reg`](file:///e:/Github/CodexOS/scripts/unregister-context-menu.reg).

This script targets exclusively:
- `[-HKEY_CURRENT_USER\Software\Classes\Directory\shell\CodexOS]`
- `[-HKEY_CURRENT_USER\Software\Classes\Directory\Background\shell\CodexOS]`
- `[-HKEY_CURRENT_USER\Software\Classes\Drive\shell\CodexOS]`
- `[HKEY_CURRENT_USER\Software\Microsoft\Windows\CurrentVersion\Run]` with `"CodexOS"=-`

It touches no system files, requires zero administrative privileges, and leaves all standard Windows associations completely untouched.
