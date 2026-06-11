#!/bin/bash
set -e

echo ""
echo "  GitMemo Installer"
echo "  =================="
echo ""

# Detect platform
OS="$(uname -s)"
ARCH="$(uname -m)"

case "${OS}-${ARCH}" in
    Darwin-arm64)  BINARY="gitmemo-macos-aarch64" ;;
    Darwin-x86_64) BINARY="gitmemo-macos-x86_64" ;;
    Linux-x86_64)  BINARY="gitmemo-linux-x86_64" ;;
    Linux-aarch64) BINARY="gitmemo-linux-aarch64" ;;
    *)
        echo "  ✗ Unsupported platform: ${OS} ${ARCH}"
        echo ""
        echo "  Build from source instead:"
        echo "    git clone https://github.com/sahadev/GitMemo.git"
        echo "    cd GitMemo && cargo install --path ."
        exit 1
        ;;
esac

echo "  Platform: ${OS} ${ARCH}"
echo "  Binary:   ${BINARY}"
echo ""

MANIFEST_URL="${GITMEMO_CLI_MANIFEST_URL:-https://github.com/sahadev/GitMemo/releases/latest/download/cli-latest.json}"
MANIFEST=$(curl --connect-timeout 5 --max-time 20 -fsSL "${MANIFEST_URL}" 2>/dev/null || true)
if [ -z "${MANIFEST}" ]; then
    MANIFEST=$(curl --connect-timeout 5 --max-time 20 -fsSL "https://api.github.com/repos/sahadev/GitMemo/releases?per_page=50" 2>/dev/null | python3 -c '
import json, sys
asset_name = sys.argv[1]
try:
    releases = json.load(sys.stdin)
except Exception:
    releases = []
for release in releases if isinstance(releases, list) else []:
    tag = release.get("tag_name", "")
    assets = release.get("assets") or []
    match = next((asset for asset in assets if asset.get("name") == asset_name), None)
    if match:
        payload = {
            "version": tag.removeprefix("v"),
            "tag": tag,
            "assets": {"current": {"name": asset_name, "url": match.get("browser_download_url", "")}},
        }
        print(json.dumps(payload))
        break
' "${BINARY}" || true)
fi
if [ -z "${MANIFEST}" ]; then
    echo "  ✗ Failed to detect latest CLI version."
    echo "    Try: https://github.com/sahadev/GitMemo/releases"
    exit 1
fi

VERSION=$(printf '%s' "${MANIFEST}" | python3 -c 'import json,sys; print(json.load(sys.stdin).get("version",""))' 2>/dev/null || echo "")
URL=$(printf '%s' "${MANIFEST}" | python3 -c 'import json,sys; data=json.load(sys.stdin); print((data.get("assets",{}).get(sys.argv[1],{}) or {}).get("url",""))' "${BINARY}" 2>/dev/null || echo "")
if [ -z "${URL}" ]; then
    URL=$(printf '%s' "${MANIFEST}" | python3 -c 'import json,sys; data=json.load(sys.stdin); assets=data.get("assets",{}); print(next((v.get("url","") for v in assets.values() if v.get("name")==sys.argv[1]), ""))' "${BINARY}" 2>/dev/null || echo "")
fi
if [ -z "${VERSION}" ] || [ -z "${URL}" ]; then
    echo "  ✗ Failed to parse CLI release metadata."
    echo "    Manifest: ${MANIFEST_URL}"
    exit 1
fi

echo "  Version:  v${VERSION#v}"
echo ""

TMPFILE=$(mktemp)

echo "  Downloading..."
curl --connect-timeout 5 --max-time 300 -fsSL "${URL}" -o "${TMPFILE}" 2>/dev/null || true

# Verify download
if [ ! -s "${TMPFILE}" ]; then
    rm -f "${TMPFILE}"
    echo "  ✗ Download failed. Possible causes:"
    echo "    - No release published yet"
    echo "    - Network issue (try setting https_proxy)"
    echo ""
    echo "  Build from source instead:"
    echo "    git clone https://github.com/sahadev/GitMemo.git"
    echo "    cd GitMemo && cargo install --path ."
    exit 1
fi

# Verify it's a real binary, not an HTML error page
FILETYPE=$(file "${TMPFILE}")
case "${FILETYPE}" in
    *Mach-O*|*ELF*)
        # Valid binary
        ;;
    *)
        rm -f "${TMPFILE}"
        echo "  ✗ Downloaded file is not a valid binary."
        echo "    Got: ${FILETYPE}"
        echo "    The release may not exist yet for your platform."
        echo ""
        echo "  Build from source instead:"
        echo "    git clone https://github.com/sahadev/GitMemo.git"
        echo "    cd GitMemo && cargo install --path ."
        exit 1
        ;;
esac

chmod +x "${TMPFILE}"

# Install
INSTALL_DIR="/usr/local/bin"

# Ensure install directory exists
if [ ! -d "${INSTALL_DIR}" ]; then
    echo "  Creating ${INSTALL_DIR} (requires sudo)..."
    sudo mkdir -p "${INSTALL_DIR}"
fi

if [ -w "${INSTALL_DIR}" ]; then
    mv "${TMPFILE}" "${INSTALL_DIR}/gitmemo"
else
    echo "  Installing to ${INSTALL_DIR} (requires sudo)..."
    sudo mv "${TMPFILE}" "${INSTALL_DIR}/gitmemo"
fi

echo ""
echo "  ✓ GitMemo v${VERSION#v} installed successfully!"
echo ""
echo "  Get started:"
echo "    gitmemo init"
echo ""
