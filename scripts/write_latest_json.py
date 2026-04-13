#!/usr/bin/env python3
"""Write Tauri updater latest.json from release-assets/ (CI release job)."""
from __future__ import annotations

import json
import os
import pathlib
import sys
from datetime import datetime, timezone


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
    root = pathlib.Path("release-assets")

    aarch64_tar = "GitMemo-desktop-macos-aarch64.app.tar.gz"
    x86_64_tar = "GitMemo-desktop-macos-x86_64.app.tar.gz"

    def read_sig(tar_name: str) -> str:
        p = root / f"{tar_name}.sig"
        if not p.is_file():
            print(f"ERROR: missing signature file {p}", file=sys.stderr)
            sys.exit(1)
        return p.read_text().strip()

    s64 = read_sig(aarch64_tar)
    s86 = read_sig(x86_64_tar)
    if not s64 or not s86:
        print(
            "ERROR: empty minisign signature (check TAURI_SIGNING_PRIVATE_KEY on build-desktop)",
            file=sys.stderr,
        )
        sys.exit(1)

    payload = {
        "version": version_num,
        "notes": "See release notes on GitHub",
        "pub_date": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
        "platforms": {
            "darwin-aarch64": {"signature": s64, "url": f"{base}/{aarch64_tar}"},
            "darwin-x86_64": {"signature": s86, "url": f"{base}/{x86_64_tar}"},
        },
    }
    out = root / "latest.json"
    out.write_text(json.dumps(payload, indent=2) + "\n", encoding="utf-8")
    print("Generated", out)
    print(out.read_text(encoding="utf-8"))


if __name__ == "__main__":
    main()
