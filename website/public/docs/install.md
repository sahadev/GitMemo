# GitMemo Installation

This page is the canonical machine-readable install reference for GitMemo.

## Do Not Use npm, yarn, or pnpm

GitMemo is not distributed as an npm CLI package. There is no supported npm, yarn, or pnpm global install command for GitMemo. The supported CLI path is the official shell installer below, or building from source with Cargo.

## CLI Install

On macOS and Linux, use the official installer script:

```bash
bash <(curl -fsSL https://github.com/sahadev/GitMemo/raw/main/scripts/install.sh)
```

The script detects the platform and downloads the matching CLI binary from GitHub Releases.

Supported CLI binaries published in GitHub Releases:

- `gitmemo-macos-aarch64`
- `gitmemo-macos-x86_64`
- `gitmemo-linux-x86_64`
- `gitmemo-linux-aarch64`

On Windows, build the CLI from source with Cargo unless a release explicitly attaches a Windows CLI binary.

If no binary matches the platform, build from source:

```bash
git clone https://github.com/sahadev/GitMemo.git
cd GitMemo
cargo install --path .
```

## Initialize

```bash
gitmemo init
gitmemo init --editor claude
gitmemo init --editor cursor
gitmemo init --editor codex
gitmemo init --editor all
gitmemo init --lang zh
gitmemo init --path /path/to/your/repo
```

## Verify

```bash
gitmemo note "hello world"
gitmemo status
```

## Desktop Installers

Download Desktop installers from GitMemo download page or GitHub Releases:

https://github.com/sahadev/GitMemo/releases/latest

Use the `.dmg` or `.app.tar.gz` asset for the appropriate Mac architecture. For Windows 10/11 x64, use the setup `.exe` from https://gitmemo.kakacut.cn/desktop/windows/gitmemo-windows-x64-setup.exe. Current Windows installers are unsigned and may show a SmartScreen warning.
