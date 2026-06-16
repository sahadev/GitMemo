# GitMemo Downloads

Current source version: v1.0.134

## Official Links

- Website: https://gitmemo.kakacut.cn/
- GitHub repository: https://github.com/sahadev/GitMemo
- GitHub Releases: https://github.com/sahadev/GitMemo/releases/latest

## Android APK

- APK URL: https://gitmemo.kakacut.cn/mobile/gitmemo-android-v1.0.134-arm64-v8a-release.apk
- APK filename: gitmemo-android-v1.0.134-arm64-v8a-release.apk
- ABI: arm64-v8a
- Package type: release APK

The Android release published on the website is arm64-v8a only. This is the mainstream ABI for modern 64-bit Android phones.

## Desktop

Desktop packages are published through GitHub Releases when available.

- Apple Silicon: look for a GitMemo desktop DMG or app archive for aarch64 / Apple Silicon.
- Intel: look for a GitMemo desktop DMG or app archive for x86_64 / Intel.
- Windows: setup `.exe` for Windows 10/11 x64.
  - Stable URL: https://gitmemo.kakacut.cn/desktop/windows/gitmemo-windows-x64-setup.exe
  - Versioned filename: gitmemo-windows-v1.0.134-x64-setup.exe
  - Note: current Windows installers are unsigned and may show a SmartScreen warning.

## CLI

On macOS and Linux, install with:

```bash
bash <(curl -fsSL https://github.com/sahadev/GitMemo/raw/main/scripts/install.sh)
```

On Windows, build the CLI from source with Cargo unless a release explicitly attaches a Windows CLI binary.
