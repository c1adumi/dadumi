#Requires -Version 5.1
$ErrorActionPreference = 'Stop'

function Write-Info { Write-Host "==> $args" -ForegroundColor Blue }
function Write-Ok   { Write-Host "✓  $args" -ForegroundColor Green }

function Remove-IfExists($path) {
    if (Test-Path $path) {
        Remove-Item $path -Recurse -Force
        Write-Ok "Removed $path"
    }
}

Write-Info "Uninstalling Dadumi..."

$proc = Get-Process -Name "Dadumi" -ErrorAction SilentlyContinue
if ($proc) {
    Write-Info "Stopping Dadumi..."
    $proc | Stop-Process -Force
    Start-Sleep -Seconds 1
}

$pkg = Get-Package -Name "Dadumi" -ErrorAction SilentlyContinue
if ($pkg) {
    $pkg | Uninstall-Package -Force
    Write-Ok "Dadumi uninstalled via package manager"
} else {
    $regPaths = @(
        "HKLM:\SOFTWARE\Microsoft\Windows\CurrentVersion\Uninstall\*",
        "HKCU:\SOFTWARE\Microsoft\Windows\CurrentVersion\Uninstall\*"
    )
    $uninstallStr = $null
    foreach ($rp in $regPaths) {
        $entry = Get-ItemProperty $rp -ErrorAction SilentlyContinue |
                 Where-Object { $_.DisplayName -like "Dadumi*" } |
                 Select-Object -First 1
        if ($entry) { $uninstallStr = $entry.UninstallString; break }
    }

    if ($uninstallStr) {
        Write-Info "Running uninstaller: $uninstallStr"
        $uninstallStr = $uninstallStr -replace '"', ''
        Start-Process $uninstallStr -ArgumentList "/S" -Wait
        Write-Ok "Dadumi uninstalled"
    } else {
        Remove-IfExists "$env:LOCALAPPDATA\Programs\dadumi"
        Remove-IfExists "$env:LOCALAPPDATA\Programs\Dadumi"
        Write-Ok "Dadumi installation files removed"
    }
}

$dataPaths = @(
    "$env:APPDATA\dadumi",
    "$env:APPDATA\Dadumi",
    "$env:APPDATA\com.gayeonlee.dadumi",
    "$env:LOCALAPPDATA\dadumi",
    "$env:LOCALAPPDATA\Dadumi",
    "$env:LOCALAPPDATA\com.gayeonlee.dadumi",
    "$env:LOCALAPPDATA\dadumi\EBWebView",
    "$env:TEMP\dadumi*"
)
foreach ($path in $dataPaths) {
    if ($path -like "*`**") {
        Get-Item $path -ErrorAction SilentlyContinue | ForEach-Object {
            Remove-Item $_.FullName -Recurse -Force
            Write-Ok "Removed $($_.FullName)"
        }
    } else {
        Remove-IfExists $path
    }
}

Write-Ok "Dadumi fully removed — no files left behind"
