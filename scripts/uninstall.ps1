#Requires -Version 5.1
$ErrorActionPreference = 'Stop'

function Write-Info { Write-Host "==> $args" -ForegroundColor Blue }
function Write-Ok   { Write-Host "✓  $args" -ForegroundColor Green }
function Write-Warn { Write-Host "⚠  $args" -ForegroundColor Yellow }

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
    if ($uninstallStr -match '(?i)MsiExec\.exe\s+(/[IX]\{[^}]+\})') {
        $proc = Start-Process "msiexec.exe" -ArgumentList "/x $($Matches[1]) /qn /norestart" -Wait -PassThru
        if ($proc.ExitCode -ne 0 -and $proc.ExitCode -ne 3010) {
            Write-Warn "Uninstaller exited with code $($proc.ExitCode)"
        }
    } else {
        $exePath = ($uninstallStr -replace '"', '').Trim()
        if (Test-Path $exePath) {
            Start-Process $exePath -ArgumentList "/S" -Wait
        }
    }
    Write-Ok "Dadumi uninstalled"
} else {
    Remove-IfExists "$env:LOCALAPPDATA\Programs\dadumi"
    Remove-IfExists "$env:LOCALAPPDATA\Programs\Dadumi"
    Write-Ok "Dadumi installation files removed"
}

$dataPaths = @(
    "$env:APPDATA\com.gayeonlee.dadumi",
    "$env:LOCALAPPDATA\com.gayeonlee.dadumi",
    "$env:LOCALAPPDATA\com.gayeonlee.dadumi\EBWebView",
    "$env:APPDATA\dadumi",
    "$env:APPDATA\Dadumi",
    "$env:LOCALAPPDATA\dadumi",
    "$env:LOCALAPPDATA\Dadumi",
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

Write-Ok "Dadumi fully removed"
