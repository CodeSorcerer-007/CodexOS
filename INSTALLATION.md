# CodexOS Installation Guide

CodexOS is a lightweight, developer-centric Windows file manager and control center.

You do **NOT** need to install Git, Node.js, Rust, npm, or any developer SDKs to run CodexOS.

---

## System Requirements

- **Operating System:** Windows 10 (Build 19041+) or Windows 11 (64-bit).
- **Architecture:** `x64` (AMD64) or `ARM64` (Windows 11 with x64 emulation).
- **Runtime:** Microsoft Edge WebView2 Evergreen Runtime (preinstalled on Windows 10/11).
- **Disk Space:** ~80 MB for installation, ~100 MB free recommended.

---

## Installation Methods

### Method 1: One-Click BAT Bootstrapper (Recommended for Most Users)

1. Download [`Install-CodexOS.bat`](https://raw.githubusercontent.com/CodeSorcerer-007/CodexOS/main/Install-CodexOS.bat).
2. Double-click `Install-CodexOS.bat`.
3. The bootstrapper will:
   - Detect your Windows architecture.
   - Query GitHub Releases for the latest verified release.
   - Download the installer over HTTPS to a safe temporary location.
   - Verify SHA-256 integrity and code signature.
   - Launch the installer and clean up temporary files.

*PowerShell alternative (one-line command):*
```powershell
irm https://raw.githubusercontent.com/CodeSorcerer-007/CodexOS/main/Install-CodexOS.bat | cmd
```
Or directly via the PowerShell bootstrapper:
```powershell
iex (iwr -UseBasicParsing 'https://raw.githubusercontent.com/CodeSorcerer-007/CodexOS/main/scripts/Install-CodexOS.ps1')
```

---

### Method 2: Standalone Setup Executable (NSIS `.exe`)

- **File:** `CodexOS_2.3.0_x64-setup.exe`
- **Install Scope:** Per-User (`%LOCALAPPDATA%\CodexOS`).
- **Elevation:** Does **not** require Administrator privileges.
- **Features:**
  - Creates Start Menu shortcut.
  - Automatically registers per-user Explorer context menus ("Open with CodexOS").
  - Seamless in-place upgrades.

**Interactive Install:**
Double-click the `.exe` and follow the on-screen prompts.

**Silent / Unattended Install:**
```powershell
.\CodexOS_2.3.0_x64-setup.exe /S
```

---

### Method 3: Windows Installer Package (`.msi`)

- **File:** `CodexOS_2.3.0_x64_en-US.msi`
- **Install Scope:** Per-Machine or Enterprise Deployment via GPO / Microsoft Intune / SCCM.
- **Elevation:** Standard Windows Installer elevation.

**Interactive Install:**
Double-click the `.msi` file.

**Silent / Scripted Install:**
```powershell
msiexec.exe /i CodexOS_2.3.0_x64_en-US.msi /qn /norestart
```

---

## Windows SmartScreen Notice

CodexOS is an open-source application built directly from GitHub Actions releases. Unless an enterprise Extended Validation (EV) certificate was configured during bundling, Windows SmartScreen may present an *"Unknown Publisher"* prompt on fresh downloads.

To proceed safely:
1. Click **More info**.
2. Click **Run anyway**.

You can verify the SHA-256 checksum of your downloaded installer against the official release manifest before running.

---

## Verifying Installer Integrity

Open PowerShell in the download folder:
```powershell
Get-FileHash .\CodexOS_2.3.0_x64-setup.exe -Algorithm SHA256
```
Compare the output against the `SHA256SUMS.txt` published on the [GitHub Release](https://github.com/CodeSorcerer-007/CodexOS/releases).

---

## Post-Installation Verification

1. Launch CodexOS from the Start Menu or run `codexos` in Command Prompt / PowerShell.
2. In Windows Explorer:
   - On Windows 10: Right-click any folder or background $\rightarrow$ **Open with CodexOS**.
   - On Windows 11: Right-click any folder $\rightarrow$ **Show more options** (Shift+F10) $\rightarrow$ **Open with CodexOS**.
3. Open **Settings** $\rightarrow$ **Windows Explorer & Shell Integration** to customize context menu verbs and login startup behavior.
