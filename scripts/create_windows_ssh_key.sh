#!/usr/bin/env bash
set -euo pipefail

key="${GITMEMO_WINDOWS_SSH_KEY:-$HOME/.ssh/gitmemo_windows_ed25519}"

if [[ ! -f "$key" ]]; then
  mkdir -p "$(dirname "$key")"
  ssh-keygen -t ed25519 -f "$key" -N "" -C "gitmemo-windows-remote" >/dev/null
fi

chmod 600 "$key"

echo "Private key:"
echo "  $key"
echo ""
echo "Public key:"
cat "$key.pub"
