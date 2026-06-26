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

$cpuArch = (Get-CimInstance Win32_Processor -Property Architecture | Select-Object -First 1).Architecture
$arch = switch ($cpuArch) {
    9  { "x64" }
    12 { "arm64" }
    default { Write-Fail "Unsupported architecture: $cpuArch" }
}

$asset = $release.assets | Where-Object { $_.name -like "*_${arch}_en-US.msi" } | Select-Object -First 1
if (-not $asset) {
    $asset = $release.assets | Where-Object { $_.name -like "*_${arch}-setup.exe" } | Select-Object -First 1
}
if (-not $asset -and $arch -eq "arm64") {
    Write-Info "arm64 asset not found, falling back to x64 (emulated)"
    $asset = $release.assets | Where-Object { $_.name -like "*_x64_en-US.msi" } | Select-Object -First 1
}
if (-not $asset) { Write-Fail "No Windows asset found for $arch in release $version" }

$tmpFile = Join-Path $env:TEMP $asset.name
Write-Info "Downloading $($asset.browser_download_url)..."
Invoke-WebRequest -Uri $asset.browser_download_url -OutFile $tmpFile -UseBasicParsing

if ($tmpFile -like "*.msi") {
    Write-Info "Installing .msi package..."
    $proc = Start-Process msiexec.exe -ArgumentList "/i `"$tmpFile`" /quiet /norestart" -Wait -PassThru
    if ($proc.ExitCode -ne 0 -and $proc.ExitCode -ne 3010) {
        Write-Fail "MSI installation failed with exit code $($proc.ExitCode)"
    }
    if ($proc.ExitCode -eq 3010) {
        Write-Info "Installation succeeded. A reboot may be required."
    }
} else {
    Write-Info "Running installer..."
    $proc = Start-Process $tmpFile -ArgumentList "/S" -Wait -PassThru
    if ($proc.ExitCode -ne 0) {
        Write-Fail "Installer failed with exit code $($proc.ExitCode)"
    }
}

Remove-Item $tmpFile -Force
Write-Ok "Dadumi $version installed"
