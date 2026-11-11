<#
.SYNOPSIS
    CodexOS Production Bootstrapper & Installer Script
.DESCRIPTION
    Installs, upgrades, or reinstalls CodexOS on Windows without requiring Node.js, Rust, Git, or developer tooling.
    Downloads official signed/verified release artifacts from GitHub, checks SHA-256 hashes, verifies Authenticode signatures, and launches the installer.
.PARAMETER Version
    Specific release version tag to install (e.g. "v2.3.0"). Defaults to "latest".
.PARAMETER InstallerType
    Type of installer to download and execute: "exe" (NSIS per-user, default) or "msi" (WiX machine-wide).
.PARAMETER Silent
    Run installation non-interactively.
.PARAMETER LocalInstaller
    Path to a local .exe or .msi file to verify and install without downloading.
.PARAMETER ExpectedHash
    Optional expected SHA-256 hash to enforce strict cryptographic integrity verification.
.PARAMETER Help
    Displays syntax and usage information and exits.
#>

[CmdletBinding()]
param(
    [string]$Version = "latest",
    [ValidateSet("exe", "msi")]
    [string]$InstallerType = "exe",
    [switch]$Silent,
    [string]$LocalInstaller = "",
    [string]$ExpectedHash = "",
    [Alias("h", "?")]
    [switch]$Help
)

$ErrorActionPreference = "Stop"

function Write-Step([string]$msg) {
    Write-Host "`n[CodexOS] $msg" -ForegroundColor Cyan
}

function Write-Success([string]$msg) {
    Write-Host "[SUCCESS] $msg" -ForegroundColor Green
}

function Write-Warn([string]$msg) {
    Write-Host "[WARNING] $msg" -ForegroundColor Yellow
}

function Write-Err([string]$msg) {
    Write-Host "[ERROR] $msg" -ForegroundColor Red
}

function Show-Header {
    Write-Host "============================================================" -ForegroundColor DarkCyan
    Write-Host "               CODEXOS WINDOWS INSTALLER                    " -ForegroundColor White -BackgroundColor DarkBlue
    Write-Host "     Lightweight Developer File Manager & Control Center    " -ForegroundColor DarkCyan
    Write-Host "============================================================" -ForegroundColor DarkCyan
}

function Show-Help {
    Show-Header
    Write-Host ""
    Write-Host "USAGE:" -ForegroundColor Yellow
    Write-Host "  Install-CodexOS.bat [options]"
    Write-Host "  powershell -ExecutionPolicy Bypass -File .\scripts\Install-CodexOS.ps1 [options]"
    Write-Host ""
    Write-Host "OPTIONS:" -ForegroundColor Yellow
    Write-Host "  -Version <tag>           Target release version tag (e.g. 'v2.3.0', default: 'latest')"
    Write-Host "  -InstallerType <exe|msi> Package format: 'exe' (NSIS per-user) or 'msi' (WiX system-wide)"
    Write-Host "  -Silent                  Execute unattended installation (no interactive prompts)"
    Write-Host "  -LocalInstaller <path>   Verify and install an existing local .exe or .msi bundle"
    Write-Host "  -ExpectedHash <sha256>   Enforce explicit SHA-256 cryptographic integrity hash"
    Write-Host "  -Help, -h, -?            Show this help reference and exit"
    Write-Host ""
    Write-Host "EXIT CODES:" -ForegroundColor Yellow
    Write-Host "  0  Success or Help output"
    Write-Host "  1  Invalid argument, unsupported OS architecture, or process failure"
    Write-Host "  2  Cryptographic integrity check failed (SHA-256 hash mismatch)"
    Write-Host "  3  Digital signature verification failed (tampered / corrupt binary)"
    Write-Host "  4  Network download error"
    Write-Host "  5  Installer executable exited with an error code"
    Write-Host ""
}

# Handle -Help request immediately without triggering any install steps
if ($Help) {
    Show-Help
    exit 0
}

Show-Header

# ------------------------------------------------------------------------------
# 1. Architecture Detection & Compatibility
# ------------------------------------------------------------------------------
Write-Step "Detecting system architecture..."
$arch = $env:PROCESSOR_ARCHITECTURE
if ($env:PROCESSOR_ARCHITEW6432) {
    $arch = $env:PROCESSOR_ARCHITEW6432
}

if ($arch -eq "AMD64") {
    Write-Host "  Architecture: x64 (AMD64) - Fully Supported" -ForegroundColor Gray
} elseif ($arch -eq "ARM64") {
    $osBuild = [Environment]::OSVersion.Version.Build
    if ($osBuild -ge 22000) {
        Write-Host "  Architecture: ARM64 detected (Windows 11 build $osBuild)." -ForegroundColor Yellow
        Write-Host "  Notice: Native ARM64 installers are not currently distributed." -ForegroundColor Yellow
        Write-Host "  Running official x64 release via Windows 11 x64 emulation." -ForegroundColor Gray
    } else {
        Write-Err "Architecture: Windows 10 ARM64 (build $osBuild) detected."
        Write-Err "Windows 10 on ARM does not support 64-bit (x64) emulation. Windows 11 on ARM64 or a standard x64 PC is required."
        exit 1
    }
} elseif ($arch -eq "x86") {
    Write-Err "Architecture: 32-bit x86 detected. 32-bit Windows is not supported."
    Write-Err "CodexOS is a 64-bit developer tool requiring a 64-bit (x64) version of Windows 10 or Windows 11."
    exit 1
} else {
    Write-Err "Unsupported architecture: $arch. CodexOS requires a 64-bit (x64) Windows operating system."
    exit 1
}

# ------------------------------------------------------------------------------
# 2. Existing Installation & Running Process Detection
# ------------------------------------------------------------------------------
Write-Step "Checking for existing installations and running instances..."
$candidatePaths = @(
    "$env:LOCALAPPDATA\CodexOS\app.exe",
    "$env:LOCALAPPDATA\CodexOS\CodexOS.exe",
    "$env:LOCALAPPDATA\Programs\CodexOS\CodexOS.exe",
    "$env:ProgramFiles\CodexOS\CodexOS.exe"
)

$existingExe = $null
foreach ($path in $candidatePaths) {
    if (Test-Path $path) {
        $existingExe = $path
        break
    }
}

if ($existingExe) {
    try {
        $installedVer = (Get-Item $existingExe).VersionInfo.ProductVersion
        Write-Host "  Found existing CodexOS installation at: $existingExe (v$installedVer)" -ForegroundColor Yellow
        Write-Host "  This installer will perform a safe in-place upgrade (preserving settings & workspaces)." -ForegroundColor Gray
    } catch {
        Write-Host "  Found existing CodexOS installation at: $existingExe" -ForegroundColor Yellow
    }
} else {
    Write-Host "  No previous installation detected. Performing fresh installation." -ForegroundColor Gray
}

# Check for running processes
$runningProcesses = Get-Process -Name "CodexOS", "codexos" -ErrorAction SilentlyContinue
if ($runningProcesses) {
    Write-Warn "CodexOS is currently running. Attempting graceful shutdown..."
    foreach ($proc in $runningProcesses) {
        try {
            $proc.CloseMainWindow() | Out-Null
            $proc.WaitForExit(3000)
        } catch {}
        if (-not $proc.HasExited) {
            Write-Warn "Closing process $($proc.Id)..."
            Stop-Process -Id $proc.Id -Force -ErrorAction SilentlyContinue
        }
    }
}

# ------------------------------------------------------------------------------
# 3. Acquire Installer File (Local or Download)
# ------------------------------------------------------------------------------
$tempDir = [System.IO.Path]::Combine([System.IO.Path]::GetTempPath(), "CodexOS_Installer_" + [System.Guid]::NewGuid().ToString("N"))
$null = New-Item -ItemType Directory -Path $tempDir -Force

$installerPath = ""
$cleanupTemp = $true
$expectedChecksum = $ExpectedHash

try {
    if ($LocalInstaller -and (Test-Path $LocalInstaller)) {
        Write-Step "Using local installer file: $LocalInstaller"
        $installerPath = (Resolve-Path $LocalInstaller).Path
        $cleanupTemp = $false
    } else {
        # Enforce TLS 1.2 / 1.3
        [Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12 -bor [Net.SecurityProtocolType]::Tls13

        $repo = "CodeSorcerer-007/CodexOS"
        Write-Step "Querying release metadata from GitHub ($repo)..."

        $releaseApiUrl = if ($Version -eq "latest") {
            "https://api.github.com/repos/$repo/releases/latest"
        } else {
            "https://api.github.com/repos/$repo/releases/tags/$Version"
        }

        $headers = @{
            "User-Agent" = "CodexOS-Installer-Bootstrapper"
            "Accept"     = "application/vnd.github.v3+json"
        }

        $releaseJson = $null
        try {
            $releaseJson = Invoke-RestMethod -Uri $releaseApiUrl -Headers $headers -Method Get -TimeoutSec 15
        } catch {
            Write-Warn "GitHub API query encountered: $($_.Exception.Message)"
            Write-Host "  Attempting direct release download fallback..." -ForegroundColor Gray
        }

        $assetUrl = $null
        $assetName = $null
        $checksumUrl = $null

        if ($releaseJson -and $releaseJson.assets) {
            $tag = $releaseJson.tag_name
            Write-Host "  Target Release: $tag ($($releaseJson.name))" -ForegroundColor Green

            foreach ($asset in $releaseJson.assets) {
                $name = $asset.name
                if ($InstallerType -eq "exe" -and ($name -like "*x64*setup.exe" -or $name -like "*setup.exe" -or $name -like "*.exe")) {
                    $assetUrl = $asset.browser_download_url
                    $assetName = $name
                } elseif ($InstallerType -eq "msi" -and ($name -like "*x64*.msi" -or $name -like "*.msi")) {
                    $assetUrl = $asset.browser_download_url
                    $assetName = $name
                }
                if ($name -like "*sha256*" -or $name -like "*checksum*") {
                    $checksumUrl = $asset.browser_download_url
                }
            }
        }

        # Fallback URL if release API was rate-limited or unavailable
        if (-not $assetUrl) {
            $verTag = if ($Version -eq "latest") { "v2.3.0" } else { $Version }
            $cleanVer = $verTag.TrimStart('v')
            if ($InstallerType -eq "exe") {
                $assetName = "CodexOS_${cleanVer}_x64-setup.exe"
            } else {
                $assetName = "CodexOS_${cleanVer}_x64_en-US.msi"
            }
            $assetUrl = "https://github.com/$repo/releases/download/$verTag/$assetName"
            $checksumUrl = "https://github.com/$repo/releases/download/$verTag/SHA256SUMS.txt"
            Write-Host "  Using direct download URL: $assetUrl" -ForegroundColor Gray
        }

        # Download Checksums manifest if available and expectedChecksum not specified
        if (-not $expectedChecksum -and $checksumUrl) {
            try {
                $sumsFile = Join-Path $tempDir "SHA256SUMS.txt"
                $progressPreference = 'SilentlyContinue'
                Invoke-WebRequest -Uri $checksumUrl -OutFile $sumsFile -UseBasicParsing -TimeoutSec 20
                if (Test-Path $sumsFile) {
                    $lines = Get-Content $sumsFile
                    foreach ($line in $lines) {
                        if ($line -match "([a-fA-F0-9]{64})\s+\*?(.+)") {
                            $hash = $matches[1]
                            $file = $matches[2].Trim()
                            if ($file -eq $assetName -or $file -like "*$assetName*") {
                                $expectedChecksum = $hash
                                break
                            }
                        }
                    }
                }
            } catch {
                Write-Warn "Could not fetch SHA256SUMS.txt manifest: $($_.Exception.Message)"
            }
        }

        Write-Step "Downloading $assetName via HTTPS..."
        $downloadDest = Join-Path $tempDir $assetName

        $progressPreference = 'SilentlyContinue'
        try {
            Invoke-WebRequest -Uri $assetUrl -OutFile $downloadDest -UseBasicParsing -TimeoutSec 180
        } catch {
            Write-Err "Download failed from: $assetUrl ($($_.Exception.Message))"
            exit 4
        }
        $installerPath = $downloadDest
        Write-Success "Downloaded successfully to temporary location."
    }

    # --------------------------------------------------------------------------
    # 4. Checksum & Cryptographic Integrity Verification
    # --------------------------------------------------------------------------
    Write-Step "Computing SHA-256 integrity hash..."
    $computedHash = (Get-FileHash -Path $installerPath -Algorithm SHA256).Hash
    Write-Host "  Computed SHA-256: $computedHash" -ForegroundColor Yellow

    if ($expectedChecksum) {
        Write-Host "  Expected SHA-256: $expectedChecksum" -ForegroundColor Gray
        if ($computedHash.Trim().ToLowerInvariant() -ne $expectedChecksum.Trim().ToLowerInvariant()) {
            Write-Err "Integrity check failed: Computed SHA-256 hash does NOT match the official release checksum."
            Write-Err "The downloaded file may be corrupted, truncated, or tampered with."
            if ($cleanupTemp) {
                Write-Err "Deleting unverified temporary download and aborting installation."
                if (Test-Path $installerPath) {
                    Remove-Item -Path $installerPath -Force -ErrorAction SilentlyContinue
                }
            } else {
                Write-Err "Aborting installation of unverified local installer."
            }
            exit 2
        }
        Write-Success "Integrity check passed: SHA-256 matches release manifest."
    } else {
        Write-Host "  Notice: No published checksum manifest found for automatic verification." -ForegroundColor Gray
    }

    # --------------------------------------------------------------------------
    # 5. Authenticode Signature Verification
    # --------------------------------------------------------------------------
    Write-Step "Verifying Authenticode code signature..."
    try {
        $sig = Get-AuthenticodeSignature -FilePath $installerPath
        switch ($sig.Status) {
            "Valid" {
                Write-Success "Signed by trusted publisher: $($sig.SignerCertificate.Subject)"
                Write-Host "  Certificate Thumbprint: $($sig.SignerCertificate.Thumbprint)" -ForegroundColor Gray
            }
            "NotSigned" {
                Write-Host "  [INFO] Unsigned Community Build: This artifact is an open-source build without an Authenticode certificate." -ForegroundColor Yellow
                Write-Host "  Windows SmartScreen may display: 'Windows protected your PC / Unknown Publisher'." -ForegroundColor Gray
                Write-Host "  To proceed interactively: Click 'More info', then 'Run anyway'." -ForegroundColor Gray
            }
            "HashMismatch" {
                Write-Err "CRITICAL SECURITY WARNING: Authenticode signature hash mismatch ($($sig.StatusMessage))!"
                Write-Err "The file has been modified or corrupted after being signed. Aborting installation."
                if ($cleanupTemp -and (Test-Path $installerPath)) {
                    Remove-Item -Path $installerPath -Force -ErrorAction SilentlyContinue
                }
                exit 3
            }
            "BadDigest" {
                Write-Err "CRITICAL SECURITY WARNING: Bad digest signature ($($sig.StatusMessage))!"
                Write-Err "The file has been corrupted or altered. Aborting installation."
                if ($cleanupTemp -and (Test-Path $installerPath)) {
                    Remove-Item -Path $installerPath -Force -ErrorAction SilentlyContinue
                }
                exit 3
            }
            "UntrustedRoot" {
                Write-Warn "Signed with a certificate from an untrusted root authority: $($sig.SignerCertificate.Subject)"
            }
            default {
                Write-Warn "Authenticode Signature Status: $($sig.Status) ($($sig.StatusMessage))"
            }
        }
    } catch {
        Write-Warn "Could not inspect Authenticode signature: $($_.Exception.Message)"
    }

    # --------------------------------------------------------------------------
    # 6. Execute Installer
    # --------------------------------------------------------------------------
    Write-Step "Launching CodexOS installer..."
    $exitCode = 0

    if ($installerPath.EndsWith(".msi", [System.StringComparison]::OrdinalIgnoreCase)) {
        $msiArgs = @("/i", "`"$installerPath`"")
        if ($Silent) {
            $msiArgs += "/qn"
        }
        $proc = Start-Process -FilePath "msiexec.exe" -ArgumentList $msiArgs -Wait -PassThru
        $exitCode = $proc.ExitCode
    } else {
        $exeArgs = @()
        if ($Silent) {
            $exeArgs += "/S"
        }
        $proc = Start-Process -FilePath $installerPath -ArgumentList $exeArgs -Wait -PassThru
        $exitCode = $proc.ExitCode
    }

    if ($exitCode -eq 0) {
        Write-Success "CodexOS installation completed successfully!"
        Write-Host "  CodexOS is ready. You can launch it from the Start Menu or terminal via 'codexos'." -ForegroundColor Green
    } else {
        Write-Err "Installer executable exited with code: $exitCode"
        exit 5
    }

} catch {
    Write-Err "Installation error: $($_.Exception.Message)"
    exit 1
} finally {
    if ($cleanupTemp -and (Test-Path $tempDir)) {
        Remove-Item -Path $tempDir -Recurse -Force -ErrorAction SilentlyContinue
    }
}
