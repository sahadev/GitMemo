# Windows Remote Control

This repo uses plain OpenSSH for authorized remote control of a Windows build
machine. The Windows computer does not need an AI tool installed.

## Browser-Based LAN Pairing

From the repository root on the Mac:

```bash
node scripts/start_windows_pairing_server.mjs
```

Open the printed URL from the Windows computer. The page provides:

- an elevated PowerShell command to bootstrap OpenSSH Server;
- an elevated PowerShell command to install the build environment;
- a LAN Agent command that works without SSH and keeps polling the Mac;
- buttons to test SSH, control the LAN Agent, and start a Windows build from the Mac.

The service stores temporary pairing state under `target/windows-pairing/`.

If OpenSSH Server is unavailable, use **Fallback: LAN Agent Without SSH** from
the page. Start that command in an elevated PowerShell window on Windows and
keep the window open. The Mac queues commands through the pairing page, and the
Windows agent polls for the next command over the LAN.

Long-running LAN Agent jobs can be cancelled from the Build Jobs section. New
agent sessions send periodic progress heartbeats, so the Mac can ask Windows to
terminate a stuck child process instead of waiting for the full timeout.

LAN Agent builds write a temporary Cargo config into the copied project and use
the sparse registry mirror at `https://rsproxy.cn/index/`. npm is configured to
use `https://registry.npmmirror.com` for the remote build.

## Manual Flow

Use this flow if you do not want to run the LAN pairing server.

### 1. Create A Dedicated SSH Key On The Mac

From the repository root:

```bash
scripts/create_windows_ssh_key.sh
```

Copy the printed public key.

### 2. Bootstrap SSH On Windows

On the Windows computer, open PowerShell as Administrator.

Copy `scripts/bootstrap_windows_ssh.ps1` to the Windows computer, then run:

```powershell
.\bootstrap_windows_ssh.ps1 -PublicKey "PASTE_PUBLIC_KEY_HERE"
```

The script installs and starts OpenSSH Server, adds the public key to
`authorized_keys`, opens a local-subnet firewall rule, and prints the Windows
IPv4 addresses.

From the Mac, test:

```bash
ssh -i ~/.ssh/gitmemo_windows_ed25519 USERNAME@WINDOWS_IP "hostname"
```

### 3. Install The Windows Build Environment

After SSH works, copy and run this on Windows from an Administrator PowerShell:

```powershell
.\install_windows_build_env.ps1
```

It installs Git, Node.js LTS, Python, Rustup, and Visual Studio Build Tools
through `winget`. Open a new PowerShell or SSH session afterward so PATH changes
take effect.

### 4. Trigger A Windows Build From The Mac

From the repository root on the Mac:

```bash
scripts/windows_remote_build.sh USERNAME@WINDOWS_IP
```

The script uploads the current working tree, runs
`scripts\build_windows_desktop.ps1 -StageAssets` on Windows, and downloads the
resulting artifacts to:

```text
release-assets/windows/
```

## Security Notes

- Keep the private key on the Mac only.
- The bootstrap firewall rule defaults to `LocalSubnet`, not the public
  internet.
- Remove the key from Windows `authorized_keys` to revoke this access.
