#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
DESKTOP_DIR="$ROOT_DIR/desktop"
ANDROID_DIR="$DESKTOP_DIR/src-tauri/gen/android"
APK_SOURCE="$ANDROID_DIR/app/build/outputs/apk/universal/release/app-universal-release.apk"
APK_OUTPUT="$ANDROID_DIR/app/build/outputs/apk/universal/release/gitmemo-android-arm64-v8a-release.apk"
ANDROID_SDK="${ANDROID_HOME:-${ANDROID_SDK_ROOT:-$HOME/Library/Android/sdk}}"

if [ -z "${JAVA_HOME:-}" ]; then
    if [ -x "/opt/homebrew/opt/openjdk@17/bin/java" ]; then
        export JAVA_HOME="/opt/homebrew/opt/openjdk@17"
    elif [ -x "/opt/homebrew/opt/openjdk@21/bin/java" ]; then
        export JAVA_HOME="/opt/homebrew/opt/openjdk@21"
    else
        echo "JAVA_HOME is not set and no Homebrew OpenJDK was found." >&2
        exit 1
    fi
fi

export ANDROID_HOME="$ANDROID_SDK"
export ANDROID_SDK_ROOT="$ANDROID_SDK"

cd "$DESKTOP_DIR"
pnpm tauri android build --apk --target aarch64

if [ ! -f "$APK_SOURCE" ]; then
    echo "Expected APK was not generated: $APK_SOURCE" >&2
    exit 1
fi

abis="$(
    unzip -Z1 "$APK_SOURCE" 2>/dev/null \
        | awk -F/ '$1 == "lib" && $2 != "" && $NF ~ /\.so$/ { print $2 }' \
        | sort -u \
        | paste -sd ',' -
)"

if [ "$abis" != "arm64-v8a" ]; then
    echo "Unexpected APK ABI list: ${abis:-none}" >&2
    exit 1
fi

cp "$APK_SOURCE" "$APK_OUTPUT"
echo "$APK_OUTPUT"
