# CodexOS One-Click Windows Installer Script
# Usage in PowerShell: iwr -useb https://raw.githubusercontent.com/CodeSorcerer-007/CodexOS/main/install.ps1 | iex

$ErrorActionPreference = 'Stop'
$repo = "CodeSorcerer-007/CodexOS"
$apiUrl = "https://api.github.com/repos/$repo/releases/latest"

Write-Host "===========================================" -ForegroundColor Cyan
Write-Host "       CodexOS Windows Installer           " -ForegroundColor Cyan
Write-Host "===========================================" -ForegroundColor Cyan

try {
    Write-Host "Checking latest release on GitHub..." -ForegroundColor Yellow
    $release = Invoke-RestMethod -Uri $apiUrl -Headers @{ "User-Agent" = "CodexOS-Installer" }
    $tag = $release.tag_name
    Write-Host "Latest release found: $tag" -ForegroundColor Green

    # Look for Windows MSI or EXE setup asset
    $asset = $release.assets | Where-Object { $_.name -like "*.msi" -or $_.name -like "*setup*.exe" -or $_.name -like "*.exe" } | Select-Object -First 1

    if (-not $asset) {
        Write-Host "No Windows pre-compiled installer found in latest release ($tag)." -ForegroundColor Red
        Write-Host "Please visit https://github.com/$repo/releases to download manually." -ForegroundColor Yellow
        exit 1
    }

    $downloadUrl = $asset.browser_download_url
    $fileName = $asset.name
    $tempPath = Join-Path $env:TEMP $fileName

    Write-Host "Downloading $fileName..." -ForegroundColor Yellow
    Invoke-WebRequest -Uri $downloadUrl -OutFile $tempPath

    Write-Host "Launching installer..." -ForegroundColor Green
    if ($fileName.EndsWith(".msi")) {
        Start-Process msiexec.exe -ArgumentList "/i `"$tempPath`"" -Wait
    } else {
        Start-Process -FilePath $tempPath -Wait
    }

    Write-Host "`nCodexOS installation complete! Launch it from your Start Menu." -ForegroundColor Green
} catch {
    Write-Host "Installation failed: $_" -ForegroundColor Red
    Write-Host "Please download the installer directly from https://github.com/$repo/releases" -ForegroundColor Yellow
}
