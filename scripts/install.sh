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

# Get latest version via redirect
VERSION=$(curl -sI "https://github.com/sahadev/GitMemo/releases/latest" 2>/dev/null | grep -i "^location:" | grep -oE 'v[0-9]+\.[0-9]+\.[0-9]+[a-zA-Z0-9._-]*' || echo "")
if [ -z "${VERSION}" ]; then
    echo "  ✗ Failed to detect latest version."
    echo "    Try: https://github.com/sahadev/GitMemo/releases"
    exit 1
fi
echo "  Version:  ${VERSION}"
echo ""

# Download specific version (avoid CDN cache issues with /latest/)
TMPFILE=$(mktemp)
URL="https://github.com/sahadev/GitMemo/releases/download/${VERSION}/${BINARY}"

echo "  Downloading..."
curl -fsSL "${URL}" -o "${TMPFILE}" 2>/dev/null || true

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
if [ -w "${INSTALL_DIR}" ]; then
    mv "${TMPFILE}" "${INSTALL_DIR}/gitmemo"
else
    echo "  Installing to ${INSTALL_DIR} (requires sudo)..."
    sudo mv "${TMPFILE}" "${INSTALL_DIR}/gitmemo"
fi

echo ""
echo "  ✓ GitMemo ${VERSION} installed successfully!"
echo ""
echo "  Get started:"
echo "    gitmemo init"
echo ""
