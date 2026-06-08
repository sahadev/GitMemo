#!/usr/bin/env python3
"""Write Tauri updater latest.json from RELEASE_ASSETS_DIR."""
from __future__ import annotations

import json
import os
import pathlib
import re
import sys
from datetime import datetime, timezone
from typing import Iterable


def main() -> None:
    version_tag = os.environ.get("VERSION_TAG", "").strip()
    if not version_tag:
        print("ERROR: VERSION_TAG env required", file=sys.stderr)
        sys.exit(1)

    version_num = version_tag.removeprefix("v")
    repository = (
        os.environ.get("RELEASE_REPOSITORY")
        or os.environ.get("GITHUB_REPOSITORY")
        or ""
    ).strip()
    if not repository:
        print(
            "ERROR: RELEASE_REPOSITORY or GITHUB_REPOSITORY env required",
            file=sys.stderr,
        )
        sys.exit(1)

    base = f"https://github.com/{repository}/releases/download/{version_tag}"
    root = pathlib.Path(os.environ.get("RELEASE_ASSETS_DIR", "release-assets"))

    aarch64_tar, s64 = required_signed_asset(
        root,
        "macOS Apple Silicon updater archive",
        ["GitMemo-desktop-macos-aarch64.app.tar.gz", "GitMemo.app.tar.gz"],
    )
    x86_64_tar, s86 = required_signed_asset(
        root,
        "macOS Intel updater archive",
        ["GitMemo-desktop-macos-x86_64.app.tar.gz", "GitMemo.app.tar.gz"],
    )

    payload = {
        "version": version_num,
        "notes": "See release notes on GitHub",
        "pub_date": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
        "platforms": {
            "darwin-aarch64": {"signature": s64, "url": f"{base}/{aarch64_tar}"},
            "darwin-x86_64": {"signature": s86, "url": f"{base}/{x86_64_tar}"},
        },
    }

    windows = optional_signed_asset(
        root,
        [
            r"^GitMemo.*(?:setup|x64|x86_64|windows).*\.exe$",
            r"^GitMemo.*(?:setup|x64|x86_64|windows).*\.msi$",
            r"^GitMemo.*(?:nsis|msi|x64|x86_64|windows).*\.zip$",
        ],
    )
    if windows is not None:
        windows_asset, windows_sig = windows
        payload["platforms"]["windows-x86_64"] = {
            "signature": windows_sig,
            "url": f"{base}/{windows_asset}",
        }

    out = root / "latest.json"
    out.write_text(json.dumps(payload, indent=2) + "\n", encoding="utf-8")
    print("Generated", out)
    print(out.read_text(encoding="utf-8"))


def required_signed_asset(
    root: pathlib.Path,
    label: str,
    names: Iterable[str],
) -> tuple[str, str]:
    for name in names:
        asset = root / name
        if asset.is_file():
            signature = read_signature(root, name)
            if signature:
                return name, signature
            print(
                f"ERROR: empty minisign signature for {label} (check TAURI_SIGNING_PRIVATE_KEY on build-desktop)",
                file=sys.stderr,
            )
            sys.exit(1)

    print(f"ERROR: missing {label} in {root}", file=sys.stderr)
    sys.exit(1)


def optional_signed_asset(
    root: pathlib.Path,
    patterns: Iterable[str],
) -> tuple[str, str] | None:
    compiled = [re.compile(pattern) for pattern in patterns]
    candidates = []

    if not root.is_dir():
        return None

    for path in root.iterdir():
        if not path.is_file() or path.name.endswith(".sig"):
            continue
        if any(pattern.match(path.name) for pattern in compiled):
            candidates.append(path.name)

    for name in sorted(candidates, key=windows_asset_priority):
        signature_path = root / f"{name}.sig"
        if not signature_path.is_file():
            continue
        signature = signature_path.read_text(encoding="utf-8").strip()
        if signature:
            return name, signature

    return None


def windows_asset_priority(name: str) -> tuple[int, str]:
    lower = name.lower()
    if lower.endswith(".exe"):
        return (0, lower)
    if lower.endswith(".msi"):
        return (1, lower)
    return (2, lower)


def read_signature(root: pathlib.Path, asset_name: str) -> str:
    path = root / f"{asset_name}.sig"
    if not path.is_file():
        print(f"ERROR: missing signature file {path}", file=sys.stderr)
        sys.exit(1)
    return path.read_text(encoding="utf-8").strip()


if __name__ == "__main__":
    main()
