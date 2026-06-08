param(
    [Parameter(Mandatory = $true)]
    [string]$PublicKey,

    [int]$Port = 22,

    [string]$PairingServerUrl = "",

    [string]$PairingToken = "",

    [switch]$AllowAnyRemoteAddress
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

function Add-UniqueLine {
    param(
        [string]$Path,
        [string]$Line
    )

    $dir = Split-Path -Parent $Path
    New-Item -ItemType Directory -Force -Path $dir | Out-Null

    if (-not (Test-Path $Path)) {
        New-Item -ItemType File -Force -Path $Path | Out-Null
    }

    $existing = Get-Content -Path $Path -ErrorAction SilentlyContinue
    if ($existing -notcontains $Line) {
        Add-Content -Path $Path -Value $Line
    }
}

function Protect-UserAuthorizedKeys {
    param([string]$Path)

    $sshDir = Split-Path -Parent $Path
    icacls $sshDir /inheritance:r /grant "$env:USERNAME:(OI)(CI)F" /grant "SYSTEM:(OI)(CI)F" | Out-Null
    icacls $Path /inheritance:r /grant "$env:USERNAME:F" /grant "SYSTEM:F" | Out-Null
}

function Protect-AdminAuthorizedKeys {
    param([string]$Path)

    icacls $Path /inheritance:r /grant "Administrators:F" /grant "SYSTEM:F" | Out-Null
}

function Get-SshdService {
    Get-Service -Name "sshd" -ErrorAction SilentlyContinue
}

function Register-OpenSshServerIfPossible {
    $installScript = Join-Path $env:WINDIR "System32\OpenSSH\install-sshd.ps1"
    if (Test-Path $installScript) {
        Write-Host "Registering OpenSSH Server service with install-sshd.ps1..."
        & powershell -NoProfile -ExecutionPolicy Bypass -File $installScript | Out-Host
    }

    if (Get-SshdService) {
        return
    }

    $sshdExe = Join-Path $env:WINDIR "System32\OpenSSH\sshd.exe"
    if (Test-Path $sshdExe) {
        Write-Host "Registering OpenSSH Server service with sshd.exe -install..."
        & $sshdExe -install | Out-Host
    }
}

function Ensure-OpenSshServer {
    if (Get-SshdService) {
        return
    }

    Write-Host "Installing OpenSSH Server optional capability..."
    $capability = Get-WindowsCapability -Online |
        Where-Object { $_.Name -like "OpenSSH.Server*" } |
        Select-Object -First 1

    if (-not $capability) {
        throw "OpenSSH Server optional capability was not found on this Windows installation."
    }

    if ($capability.State -ne "Installed") {
        Add-WindowsCapability -Online -Name $capability.Name | Out-Host
    }

    Start-Sleep -Seconds 2
    Register-OpenSshServerIfPossible

    if (-not (Get-SshdService)) {
        Write-Host ""
        Write-Host "OpenSSH diagnostics:"
        $openSshCapabilities = Get-WindowsCapability -Online |
            Where-Object { $_.Name -like "OpenSSH.*" } |
            Select-Object Name, State
        $openSshCapabilities | Format-Table -AutoSize | Out-Host
        Get-ChildItem (Join-Path $env:WINDIR "System32\OpenSSH") -ErrorAction SilentlyContinue |
            Format-Table Name, Length -AutoSize | Out-Host

        $serverCapability = $openSshCapabilities |
            Where-Object { $_.Name -like "OpenSSH.Server*" } |
            Select-Object -First 1
        if ($serverCapability -and $serverCapability.State -eq "InstallPending") {
            throw "OpenSSH Server is InstallPending. Restart Windows, reopen the LAN pairing page, then run Bootstrap SSH again."
        }

        throw "OpenSSH Server was installed or present, but the sshd service was not registered. Install OpenSSH Server from Windows Optional Features, then rerun this script."
    }
}

Assert-Administrator

$key = $PublicKey.Trim()
if (-not ($key -match "^(ssh-ed25519|ssh-rsa|ecdsa-sha2-nistp256) ")) {
    throw "PublicKey does not look like an OpenSSH public key."
}

Ensure-OpenSshServer

Start-Service -Name "sshd"
Set-Service -Name "sshd" -StartupType Automatic

$firewallRuleName = "GitMemo-OpenSSH-Server-TCP-$Port"
$remoteAddress = if ($AllowAnyRemoteAddress) { "Any" } else { "LocalSubnet" }
$existingRule = Get-NetFirewallRule -Name $firewallRuleName -ErrorAction SilentlyContinue
if (-not $existingRule) {
    New-NetFirewallRule `
        -Name $firewallRuleName `
        -DisplayName "GitMemo OpenSSH Server TCP $Port" `
        -Enabled True `
        -Direction Inbound `
        -Protocol TCP `
        -Action Allow `
        -LocalPort $Port `
        -RemoteAddress $remoteAddress | Out-Null
}

$userAuthorizedKeys = Join-Path $HOME ".ssh\authorized_keys"
Add-UniqueLine -Path $userAuthorizedKeys -Line $key
Protect-UserAuthorizedKeys -Path $userAuthorizedKeys

$currentIdentity = [Security.Principal.WindowsIdentity]::GetCurrent()
$currentPrincipal = [Security.Principal.WindowsPrincipal]::new($currentIdentity)
if ($currentPrincipal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) {
    $adminAuthorizedKeys = Join-Path $env:ProgramData "ssh\administrators_authorized_keys"
    Add-UniqueLine -Path $adminAuthorizedKeys -Line $key
    Protect-AdminAuthorizedKeys -Path $adminAuthorizedKeys
}

Restart-Service -Name "sshd"

$addresses = Get-NetIPAddress -AddressFamily IPv4 |
    Where-Object {
        $_.IPAddress -notlike "127.*" -and
        $_.IPAddress -notlike "169.254.*" -and
        $_.PrefixOrigin -ne "WellKnown"
    } |
    Select-Object -ExpandProperty IPAddress

Write-Host ""
Write-Host "GitMemo Windows SSH bootstrap complete."
Write-Host "User:       $env:USERNAME"
Write-Host "Host name:  $env:COMPUTERNAME"
Write-Host "Port:       $Port"
Write-Host "Firewall:   $remoteAddress"
Write-Host "IPv4:"
$addresses | ForEach-Object { Write-Host "  $_" }
Write-Host ""
Write-Host "From the Mac, test with:"
$addresses | ForEach-Object {
    Write-Host "  ssh -i ~/.ssh/gitmemo_windows_ed25519 -p $Port $env:USERNAME@$_ `"hostname`""
}

if ($PairingServerUrl) {
    try {
        $pairingUri = "$($PairingServerUrl.TrimEnd('/'))/api/pair"
        if ($PairingToken) {
            $pairingUri = "$pairingUri?token=$PairingToken"
        }

        $payload = @{
            username = $env:USERNAME
            computerName = $env:COMPUTERNAME
            port = $Port
            addresses = @($addresses)
        } | ConvertTo-Json -Depth 4

        Invoke-RestMethod `
            -Method Post `
            -Uri $pairingUri `
            -ContentType "application/json" `
            -Body $payload | Out-Null

        Write-Host ""
        Write-Host "Paired with GitMemo LAN service."
    } catch {
        Write-Host ""
        Write-Warning "SSH was configured, but pairing callback failed: $($_.Exception.Message)"
    }
}
