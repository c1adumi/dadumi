#Requires -Version 5.1
$ErrorActionPreference = 'Stop'

function Write-Info { Write-Host "==> $args" -ForegroundColor Blue }
function Write-Ok   { Write-Host "✓  $args" -ForegroundColor Green }

Write-Info "Uninstalling Dadumi..."

$pkg = Get-Package -Name "Dadumi" -ErrorAction SilentlyContinue
if ($pkg) {
    $pkg | Uninstall-Package -Force
    Write-Ok "Dadumi uninstalled via package manager"
} else {
    $msi = Get-ChildItem "$env:LOCALAPPDATA\Programs" -Filter "Dadumi*" -ErrorAction SilentlyContinue
    if ($msi) { Remove-Item $msi.FullName -Recurse -Force }
    Write-Ok "Dadumi installation files removed"
}

$dataPaths = @(
    "$env:APPDATA\com.gayeonlee.dadumi",
    "$env:LOCALAPPDATA\com.gayeonlee.dadumi"
)
foreach ($path in $dataPaths) {
    if (Test-Path $path) {
        Remove-Item $path -Recurse -Force
        Write-Ok "Removed $path"
    }
}

Write-Ok "Dadumi fully removed"
