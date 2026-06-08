param(
    [string]$Target = "x86_64-pc-windows-msvc",
    [switch]$SkipInstall,
    [switch]$StageAssets
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

$Root = Split-Path -Parent $PSScriptRoot
Set-Location $Root

function Require-Command {
    param([string]$Name)

    if (-not (Get-Command $Name -ErrorAction SilentlyContinue)) {
        throw "Missing required command: $Name"
    }
}

function Invoke-Step {
    param(
        [string]$Name,
        [scriptblock]$Action
    )

    Write-Host ""
    Write-Host "==> $Name"
    & $Action
}

function Invoke-Native {
    param(
        [string]$FilePath,
        [string[]]$Arguments
    )

    & $FilePath @Arguments
    if ($LASTEXITCODE -ne 0) {
        throw "$FilePath exited with code $LASTEXITCODE"
    }
}

Require-Command "rustup"
Require-Command "cargo"
Require-Command "node"
Require-Command "pnpm"

Invoke-Step "Sync desktop version files" {
    Invoke-Native "node" @("scripts/run-python.mjs", "scripts/sync_desktop_version.py")
}

Invoke-Step "Install Rust target $Target" {
    Invoke-Native "rustup" @("target", "add", $Target)
}

if (-not $SkipInstall) {
    Invoke-Step "Install desktop dependencies" {
        Invoke-Native "pnpm" @("--dir", "desktop", "install", "--frozen-lockfile", "--prod=false")
    }
}

Invoke-Step "Build Windows NSIS installer" {
    Invoke-Native "pnpm" @(
        "--dir", "desktop",
        "exec", "tauri", "build",
        "--config", "src-tauri/tauri.windows.conf.json",
        "--target", $Target,
        "--bundles", "nsis"
    )
}

$BundleDir = Join-Path $Root "desktop/src-tauri/target/$Target/release/bundle/nsis"
$ArtifactExtensions = @(".exe", ".msi", ".zip", ".sig")
$Artifacts = Get-ChildItem -Path $BundleDir -File -ErrorAction SilentlyContinue |
    Where-Object { $_.Extension -in $ArtifactExtensions }

if (-not $Artifacts) {
    throw "No Windows bundle artifacts found in $BundleDir"
}

Write-Host ""
Write-Host "Windows bundle artifacts:"
$Artifacts | ForEach-Object {
    Write-Host ("  {0} ({1:n0} bytes)" -f $_.FullName, $_.Length)
}

if ($StageAssets) {
    $ReleaseAssets = Join-Path $Root "release-assets"
    New-Item -ItemType Directory -Force -Path $ReleaseAssets | Out-Null
    $Artifacts | ForEach-Object {
        Copy-Item -Force -Path $_.FullName -Destination (Join-Path $ReleaseAssets $_.Name)
    }

    Write-Host ""
    Write-Host "Copied Windows artifacts to $ReleaseAssets"
}
