#!/usr/bin/env bash
set -euo pipefail

usage() {
  cat <<'EOF'
Usage:
  scripts/windows_remote_build.sh user@host [ssh_port]

This uploads the current working tree to the Windows host over SSH, runs the
Windows NSIS build script there, and downloads release-assets/windows/.
EOF
}

if [[ "${1:-}" == "-h" || "${1:-}" == "--help" || $# -lt 1 ]]; then
  usage
  exit 0
fi

remote="$1"
port="${2:-22}"
root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
key="${GITMEMO_WINDOWS_SSH_KEY:-$HOME/.ssh/gitmemo_windows_ed25519}"
archive="$(mktemp -t gitmemo-windows-remote.XXXXXX.tar.gz)"
remote_root='GitMemoRemote'
remote_archive="$remote_root/GitMemo.tar.gz"
local_output="$root/release-assets/windows"

cleanup() {
  rm -f "$archive"
}
trap cleanup EXIT

if [[ ! -f "$key" ]]; then
  echo "Missing SSH key: $key" >&2
  echo "Set GITMEMO_WINDOWS_SSH_KEY or run scripts/create_windows_ssh_key.sh first." >&2
  exit 1
fi

echo "==> Creating source archive"
COPYFILE_DISABLE=1 tar \
  --exclude ".git" \
  --exclude ".DS_Store" \
  --exclude "*/.DS_Store" \
  --exclude "._*" \
  --exclude "*/._*" \
  --exclude "target" \
  --exclude "desktop/src-tauri/target" \
  --exclude "desktop/node_modules" \
  --exclude "desktop/dist" \
  --exclude "website/node_modules" \
  --exclude "website/dist" \
  --exclude "release-assets" \
  -czf "$archive" \
  -C "$root" .

ssh_args=(-i "$key" -p "$port" -o IdentitiesOnly=yes)

echo "==> Preparing remote directory"
ssh "${ssh_args[@]}" "$remote" \
  'powershell -NoProfile -ExecutionPolicy Bypass -Command "New-Item -ItemType Directory -Force -Path (Join-Path $HOME ''GitMemoRemote'') | Out-Null"'

echo "==> Uploading source archive"
scp -i "$key" -P "$port" "$archive" "$remote:$remote_archive"

echo "==> Building on Windows"
ssh "${ssh_args[@]}" "$remote" 'powershell -NoProfile -ExecutionPolicy Bypass -Command "
$ErrorActionPreference = ''Stop''
$remoteRoot = Join-Path $HOME ''GitMemoRemote''
$project = Join-Path $remoteRoot ''GitMemo''
$archive = Join-Path $remoteRoot ''GitMemo.tar.gz''
if (Test-Path $project) { Remove-Item -Recurse -Force $project }
New-Item -ItemType Directory -Force -Path $project | Out-Null
tar -xzf $archive -C $project
& powershell -NoProfile -ExecutionPolicy Bypass -File (Join-Path $project ''scripts\build_windows_desktop.ps1'') -StageAssets
"'

mkdir -p "$local_output"

echo "==> Downloading Windows release assets"
scp -i "$key" -P "$port" "$remote:$remote_root/GitMemo/release-assets/*" "$local_output/" || {
  echo "No remote release assets were downloaded." >&2
  exit 1
}

echo ""
echo "Windows assets downloaded to:"
echo "  $local_output"
