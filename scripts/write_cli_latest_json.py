#!/usr/bin/env python3
"""Write independent GitMemo CLI update metadata.

The desktop app can release more often than the CLI. This manifest points to the
latest release that actually contains CLI binaries, so desktop-only releases do
not manufacture fake CLI updates.
"""
from __future__ import annotations

import json
import os
import pathlib
import sys
import urllib.error
import urllib.request
from datetime import datetime, timezone
from typing import Any


PLATFORM_ASSETS = {
    "darwin-aarch64": "gitmemo-macos-aarch64",
    "darwin-x86_64": "gitmemo-macos-x86_64",
    "linux-x86_64": "gitmemo-linux-x86_64",
    "linux-aarch64": "gitmemo-linux-aarch64",
    "windows-x86_64": "gitmemo-windows-x86_64.exe",
}


def main() -> None:
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

    root = pathlib.Path(os.environ.get("RELEASE_ASSETS_DIR", "release-assets"))
    root.mkdir(parents=True, exist_ok=True)

    requested_tag = os.environ.get("CLI_VERSION_TAG", "").strip()
    local_assets = local_cli_assets(root)
    uses_local_assets = bool(requested_tag and local_assets)
    if uses_local_assets:
        tag = requested_tag
        asset_names = list(local_assets.values())
    else:
        tag, asset_names = find_latest_cli_release(repository, requested_tag)

    version_source = os.environ.get("CLI_VERSION", "").strip() if uses_local_assets else ""
    version = (version_source or tag).removeprefix("v")
    base = f"https://github.com/{repository}/releases/download/{tag}"
    release_url = f"https://github.com/{repository}/releases/tag/{tag}"
    available = set(asset_names)
    assets = {
        platform: {
            "name": name,
            "url": f"{base}/{name}",
        }
        for platform, name in PLATFORM_ASSETS.items()
        if name in available
    }

    if not assets:
        print(f"ERROR: release {tag} has no GitMemo CLI assets", file=sys.stderr)
        sys.exit(1)

    notes = os.environ.get("CLI_RELEASE_NOTES", "").strip()
    if not notes:
        notes = f"See CLI release notes: {release_url}"

    payload = {
        "version": version,
        "tag": tag,
        "notes": [notes],
        "release_url": release_url,
        "pub_date": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
        "assets": assets,
    }

    out = root / "cli-latest.json"
    out.write_text(json.dumps(payload, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    print("Generated", out)
    print(out.read_text(encoding="utf-8"))


def local_cli_assets(root: pathlib.Path) -> dict[str, str]:
    if not root.is_dir():
        return {}
    names = {path.name for path in root.iterdir() if path.is_file()}
    return {
        platform: name
        for platform, name in PLATFORM_ASSETS.items()
        if name in names
    }


def find_latest_cli_release(repository: str, requested_tag: str | None) -> tuple[str, list[str]]:
    if requested_tag:
        release = fetch_release(repository, requested_tag)
        names = asset_names(release)
        if any(name in PLATFORM_ASSETS.values() for name in names):
            return requested_tag, names

    for release in fetch_releases(repository):
        tag = str(release.get("tag_name", "")).strip()
        names = asset_names(release)
        if tag and any(name in PLATFORM_ASSETS.values() for name in names):
            return tag, names

    print("ERROR: no release with GitMemo CLI assets found", file=sys.stderr)
    sys.exit(1)


def fetch_release(repository: str, tag: str) -> dict[str, Any]:
    return fetch_json(f"https://api.github.com/repos/{repository}/releases/tags/{tag}")


def fetch_releases(repository: str) -> list[dict[str, Any]]:
    payload = fetch_json(f"https://api.github.com/repos/{repository}/releases?per_page=50")
    if not isinstance(payload, list):
        print("ERROR: GitHub releases response was not a list", file=sys.stderr)
        sys.exit(1)
    return payload


def fetch_json(url: str) -> Any:
    headers = {
        "Accept": "application/vnd.github+json",
        "User-Agent": "gitmemo-release-script",
    }
    token = os.environ.get("GITHUB_TOKEN") or os.environ.get("GH_TOKEN")
    if token:
        headers["Authorization"] = f"Bearer {token}"
    request = urllib.request.Request(url, headers=headers)
    try:
        with urllib.request.urlopen(request, timeout=20) as response:
            return json.loads(response.read().decode("utf-8"))
    except (urllib.error.URLError, json.JSONDecodeError) as e:
        print(f"ERROR: failed to fetch {url}: {e}", file=sys.stderr)
        sys.exit(1)


def asset_names(release: dict[str, Any]) -> list[str]:
    assets = release.get("assets") or []
    return [
        str(asset.get("name", "")).strip()
        for asset in assets
        if isinstance(asset, dict) and asset.get("name")
    ]


if __name__ == "__main__":
    main()
