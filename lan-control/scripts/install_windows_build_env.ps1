param(
    [switch]$SkipVisualStudioBuildTools
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

function Assert-Administrator {
    $identity = [Security.Principal.WindowsIdentity]::GetCurrent()
    $principal = [Security.Principal.WindowsPrincipal]::new($identity)
    if (-not $principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) {
        throw "Run this script from an elevated PowerShell window."
    }
}

function Require-Command {
    param([string]$Name)

    if (-not (Get-Command $Name -ErrorAction SilentlyContinue)) {
        throw "Missing required command: $Name"
    }
}

function Add-PathEntry {
    param([string]$Path)

    if (-not $Path -or -not (Test-Path $Path)) {
        return
    }

    $entries = $env:PATH -split ";"
    if ($entries -notcontains $Path) {
        $env:PATH = "$Path;$env:PATH"
    }
}

function Install-WingetPackage {
    param(
        [string]$Id,
        [string[]]$ExtraArgs = @()
    )

    Write-Host ""
    Write-Host "==> winget install $Id"
    $args = @(
        "install",
        "--id", $Id,
        "-e",
        "--accept-source-agreements",
        "--accept-package-agreements",
        "--disable-interactivity"
    ) + $ExtraArgs
    & winget @args
}

function Install-Rustup {
    Write-Host ""
    Write-Host "==> install Rustup non-interactively"

    $rustup = Get-Command rustup -ErrorAction SilentlyContinue
    if ($rustup) {
        Write-Host "Rustup is already available at $($rustup.Source)"
        return
    }

    $installer = Join-Path $env:TEMP "rustup-init.exe"
    Invoke-WebRequest "https://win.rustup.rs/x86_64" -UseBasicParsing -OutFile $installer
    & $installer -y --default-host x86_64-pc-windows-msvc --default-toolchain stable --profile default
}

Assert-Administrator
Require-Command "winget"

Install-WingetPackage -Id "Git.Git" -ExtraArgs @("--silent")
Install-WingetPackage -Id "OpenJS.NodeJS.LTS" -ExtraArgs @("--silent")
Install-WingetPackage -Id "Python.Python.3.12" -ExtraArgs @("--silent")

Add-PathEntry "C:\Program Files\Git\cmd"
Add-PathEntry "C:\Program Files\nodejs"
Add-PathEntry (Join-Path $env:LOCALAPPDATA "Programs\Python\Python312")
Add-PathEntry (Join-Path $env:LOCALAPPDATA "Programs\Python\Python312\Scripts")
Add-PathEntry (Join-Path $env:USERPROFILE ".cargo\bin")

Install-Rustup
Add-PathEntry (Join-Path $env:USERPROFILE ".cargo\bin")

if (-not $SkipVisualStudioBuildTools) {
    Install-WingetPackage `
        -Id "Microsoft.VisualStudio.2022.BuildTools" `
        -ExtraArgs @(
            "--silent",
            "--override",
            "--wait --quiet --add Microsoft.VisualStudio.Workload.VCTools --includeRecommended"
        )
}

Write-Host ""
Write-Host "Enabling pnpm through Corepack when Node is available..."
$node = Get-Command node -ErrorAction SilentlyContinue
if ($node) {
    & corepack enable
    & corepack prepare pnpm@9 --activate
} else {
    Write-Host "Node was installed but is not on PATH in this shell yet. Open a new PowerShell session and run:"
    Write-Host "  corepack enable"
    Write-Host "  corepack prepare pnpm@9 --activate"
}

Write-Host ""
Write-Host "Build environment installation finished."
Write-Host "Restarting sshd so future remote sessions pick up PATH changes..."
Restart-Service sshd -ErrorAction SilentlyContinue
Write-Host "Open a new PowerShell or SSH session before using newly installed tools."
