#Requires -Version 5.1
$ErrorActionPreference = 'Stop'

$REPO = "c1adumi/dadumi"

function Write-Info { Write-Host "==> $args" -ForegroundColor Blue }
function Write-Ok   { Write-Host "✓  $args" -ForegroundColor Green }
function Write-Fail { Write-Host "ERROR: $args" -ForegroundColor Red; exit 1 }

Write-Info "Fetching latest release from GitHub..."

$release = Invoke-RestMethod "https://api.github.com/repos/$REPO/releases/latest"
$version = $release.tag_name
Write-Info "Latest version: $version"

$arch = if ([System.Environment]::Is64BitOperatingSystem) { "x64" } else { Write-Fail "32-bit Windows is not supported." }

$asset = $release.assets | Where-Object { $_.name -like "*_${arch}_en-US.msi" } | Select-Object -First 1
if (-not $asset) {
    $asset = $release.assets | Where-Object { $_.name -like "*_${arch}-setup.exe" } | Select-Object -First 1
}
if (-not $asset) { Write-Fail "No Windows asset found for $arch in release $version" }

$tmpFile = Join-Path $env:TEMP $asset.name
Write-Info "Downloading $($asset.browser_download_url)..."
Invoke-WebRequest -Uri $asset.browser_download_url -OutFile $tmpFile -UseBasicParsing

if ($tmpFile -like "*.msi") {
    Write-Info "Installing .msi package..."
    Start-Process msiexec.exe -ArgumentList "/i `"$tmpFile`" /quiet /norestart" -Wait
} else {
    Write-Info "Running installer..."
    Start-Process $tmpFile -ArgumentList "/S" -Wait
}

Remove-Item $tmpFile -Force
Write-Ok "Dadumi $version installed"
