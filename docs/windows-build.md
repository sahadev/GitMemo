# Windows Desktop Local Build

Windows desktop installers are built locally instead of in the default CI release
matrix. Run this on a Windows 10/11 x64 machine.

## Prerequisites

- Rust stable with the MSVC toolchain.
- Visual Studio Build Tools with "Desktop development with C++".
- Node.js 20+ and pnpm 9+.
- Python 3 available as `python`, `python3`, or `py -3`.
- Git.

## Build

From the repository root in PowerShell:

```powershell
.\scripts\build_windows_desktop.ps1
```

The installer is written under:

```text
desktop\src-tauri\target\x86_64-pc-windows-msvc\release\bundle\nsis\
```

To also copy the Windows installer into `release-assets\`:

```powershell
.\scripts\build_windows_desktop.ps1 -StageAssets
```

This local Windows build uses `desktop\src-tauri\tauri.windows.conf.json` and
does not generate updater signature artifacts by default. Keep signed updater
artifacts as a separate release step so local Windows builds do not require the
Tauri signing private key.
