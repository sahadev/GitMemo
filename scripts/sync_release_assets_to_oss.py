#!/usr/bin/env python3
"""Upload release-assets/ to Aliyun OSS and prune old release directories.

Expected environment:
  VERSION_TAG                  e.g. v1.0.65
  ALIYUN_ACCESS_KEY_ID
  ALIYUN_ACCESS_KEY_SECRET
  ALIYUN_OSS_BUCKET
  ALIYUN_OSS_REGION           e.g. cn-hangzhou or oss-cn-hangzhou

Optional environment:
  ALIYUN_OSS_PREFIX           default: releases
  ALIYUN_OSS_KEEP_RELEASES    default: 1
  ALIYUN_OSS_ENDPOINT         e.g. https://oss-cn-hangzhou.aliyuncs.com
  ALIYUN_OSS_PUBLIC_BASE_URL  e.g. https://download.example.com
  RELEASE_ASSETS_DIR          default: release-assets

This script uploads all files to:
  {prefix}/{VERSION_TAG}/{filename}

It also writes mirror manifests:
  latest.json
  {prefix}/latest.json
  {prefix}/{VERSION_TAG}/latest.json
  cli-latest.json (when present)
  {prefix}/cli-latest.json (when present)
  {prefix}/{VERSION_TAG}/cli-latest.json (when present)
  downloads.json
  {prefix}/downloads.json
  {prefix}/{VERSION_TAG}/downloads.json

The OSS latest.json is rewritten so Tauri updater URLs point to OSS instead of
GitHub. The local release-assets/latest.json is not modified.
"""
from __future__ import annotations

import json
import os
import pathlib
import re
import sys
from typing import Any

try:
    import oss2
except ImportError:
    print("ERROR: missing dependency 'oss2'. Install with: python3 -m pip install oss2", file=sys.stderr)
    sys.exit(1)


ROOT = pathlib.Path(os.environ.get("RELEASE_ASSETS_DIR", "release-assets"))


def require_env(name: str) -> str:
    value = os.environ.get(name, "").strip()
    if not value:
        print(f"ERROR: {name} env required", file=sys.stderr)
        sys.exit(1)
    return value


def normalize_region(raw: str) -> str:
    region = raw.strip()
    if region.startswith("https://"):
        region = region.removeprefix("https://")
    elif region.startswith("http://"):
        region = region.removeprefix("http://")
    region = region.rstrip("/")
    if region.endswith(".aliyuncs.com"):
        region = region.removesuffix(".aliyuncs.com")
    if region.startswith("oss-"):
        region = region.removeprefix("oss-")
    return region


def endpoint_for_region(raw: str) -> str:
    explicit = os.environ.get("ALIYUN_OSS_ENDPOINT", "").strip()
    if explicit:
        if explicit.startswith("http://") or explicit.startswith("https://"):
            return explicit.rstrip("/")
        return f"https://{explicit.rstrip('/')}"
    return f"https://oss-{normalize_region(raw)}.aliyuncs.com"


def public_base_url(bucket_name: str, region: str) -> str:
    explicit = os.environ.get("ALIYUN_OSS_PUBLIC_BASE_URL", "").strip()
    if explicit:
        return explicit.rstrip("/")
    return f"https://{bucket_name}.oss-{normalize_region(region)}.aliyuncs.com"


def object_url(base_url: str, key: str) -> str:
    return f"{base_url}/{key}"


def parse_version(tag: str) -> tuple[int, ...]:
    match = re.match(r"^v?(\d+(?:\.\d+)*)(?:[-+].*)?$", tag)
    if not match:
        return (0,)
    return tuple(int(part) for part in match.group(1).split("."))


def put_json(bucket: Any, key: str, payload: dict[str, Any]) -> None:
    bucket.put_object(key, json.dumps(payload, indent=2, ensure_ascii=False).encode("utf-8") + b"\n")
    print(f"Uploaded {key}")


def iter_asset_files() -> list[pathlib.Path]:
    if not ROOT.is_dir():
        return []
    return sorted(
        path
        for path in ROOT.rglob("*")
        if path.is_file() and not path.name.startswith(".")
    )


def rewrite_latest_json(version_tag: str, prefix: str, base_url: str) -> dict[str, Any]:
    latest_path = ROOT / "latest.json"
    if not latest_path.is_file():
        print(f"ERROR: missing {latest_path}; run scripts/write_latest_json.py first", file=sys.stderr)
        sys.exit(1)

    payload = json.loads(latest_path.read_text(encoding="utf-8"))
    for platform in payload.get("platforms", {}).values():
        url = platform.get("url", "")
        name = url.rsplit("/", 1)[-1]
        if name:
            platform["url"] = object_url(base_url, f"{prefix}/{version_tag}/{name}")
    return payload


def rewrite_cli_latest_json(version_tag: str, prefix: str, base_url: str) -> dict[str, Any] | None:
    cli_latest_path = ROOT / "cli-latest.json"
    if not cli_latest_path.is_file():
        return None

    payload = json.loads(cli_latest_path.read_text(encoding="utf-8"))
    local_asset_names = {path.name for path in iter_asset_files()}
    for asset in payload.get("assets", {}).values():
        name = asset.get("name", "")
        if name in local_asset_names:
            asset["url"] = object_url(base_url, f"{prefix}/{version_tag}/{name}")
    return payload


def build_downloads_manifest(version_tag: str, prefix: str, base_url: str) -> dict[str, Any]:
    def find_one(pattern: str) -> str:
        matches = sorted(p.name for p in iter_asset_files() if re.match(pattern, p.name))
        if not matches:
            print(f"ERROR: no asset matching {pattern} in {ROOT}", file=sys.stderr)
            sys.exit(1)
        return matches[-1]

    def find_optional(patterns: list[str]) -> str | None:
        matches: list[str] = []
        for pattern in patterns:
            matches.extend(
                p.name
                for p in iter_asset_files()
                if not p.name.endswith(".sig") and re.match(pattern, p.name)
            )
        if not matches:
            return None
        return sorted(set(matches), key=asset_priority)[0]

    aarch64_dmg = find_one(r"^GitMemo_v?.+_aarch64\.dmg$")
    x86_64_dmg = find_one(r"^GitMemo_v?.+_(?:x86_64|x64)\.dmg$")
    assets = {
        "macosAppleSilicon": {
            "name": aarch64_dmg,
            "url": object_url(base_url, f"{prefix}/{version_tag}/{aarch64_dmg}"),
        },
        "macosIntel": {
            "name": x86_64_dmg,
            "url": object_url(base_url, f"{prefix}/{version_tag}/{x86_64_dmg}"),
        },
    }

    windows_installer = find_optional(
        [
            r"^GitMemo.*(?:setup|x64|x86_64|windows).*\.exe$",
            r"^GitMemo.*(?:setup|x64|x86_64|windows).*\.msi$",
        ]
    )
    if windows_installer:
        assets["windowsDesktop"] = {
            "name": windows_installer,
            "url": object_url(base_url, f"{prefix}/{version_tag}/{windows_installer}"),
        }

    return {
        "version": version_tag,
        "assets": assets,
    }


def asset_priority(name: str) -> tuple[int, str]:
    lower = name.lower()
    if lower.endswith(".exe"):
        return (0, lower)
    if lower.endswith(".msi"):
        return (1, lower)
    return (2, lower)


def upload_assets(bucket: Any, version_tag: str, prefix: str) -> None:
    if not ROOT.is_dir():
        print(f"ERROR: missing assets directory {ROOT}", file=sys.stderr)
        sys.exit(1)

    files = iter_asset_files()
    if not files:
        print(f"ERROR: no files found in {ROOT}", file=sys.stderr)
        sys.exit(1)

    for path in files:
        key = f"{prefix}/{version_tag}/{path.name}"
        bucket.put_object_from_file(key, str(path))
        print(f"Uploaded {key}")


def list_release_dirs(bucket: Any, prefix: str) -> list[str]:
    release_dirs: set[str] = set()
    scan_prefix = f"{prefix}/"
    for obj in oss2.ObjectIterator(bucket, prefix=scan_prefix):
        parts = obj.key.split("/")
        if len(parts) >= 3 and re.match(r"^v?\d+\.\d+\.\d+", parts[1]):
            release_dirs.add(parts[1])
    return sorted(release_dirs, key=parse_version, reverse=True)


def prune_old_releases(bucket: Any, prefix: str, keep: int) -> None:
    if keep < 1:
        print("ERROR: ALIYUN_OSS_KEEP_RELEASES must be >= 1", file=sys.stderr)
        sys.exit(1)

    release_dirs = list_release_dirs(bucket, prefix)
    for version in release_dirs[keep:]:
        delete_prefix = f"{prefix}/{version}/"
        keys = [obj.key for obj in oss2.ObjectIterator(bucket, prefix=delete_prefix)]
        if not keys:
            continue
        print(f"Pruning {delete_prefix} ({len(keys)} objects)")
        for i in range(0, len(keys), 1000):
            bucket.batch_delete_objects(keys[i : i + 1000])


def main() -> None:
    version_tag = require_env("VERSION_TAG")
    key_id = require_env("ALIYUN_ACCESS_KEY_ID")
    key_secret = require_env("ALIYUN_ACCESS_KEY_SECRET")
    bucket_name = require_env("ALIYUN_OSS_BUCKET")
    region = require_env("ALIYUN_OSS_REGION")
    prefix = os.environ.get("ALIYUN_OSS_PREFIX", "releases").strip().strip("/") or "releases"
    keep = int(os.environ.get("ALIYUN_OSS_KEEP_RELEASES", "1"))

    endpoint = endpoint_for_region(region)
    base_url = public_base_url(bucket_name, region)
    print(f"Syncing {ROOT} to oss://{bucket_name}/{prefix}/{version_tag}/")
    print(f"Endpoint: {endpoint}")
    print(f"Public base URL: {base_url}")
    print(f"Keeping latest {keep} release director{'y' if keep == 1 else 'ies'}")

    auth = oss2.Auth(key_id, key_secret)
    bucket = oss2.Bucket(auth, endpoint, bucket_name)

    upload_assets(bucket, version_tag, prefix)

    latest_json = rewrite_latest_json(version_tag, prefix, base_url)
    cli_latest_json = rewrite_cli_latest_json(version_tag, prefix, base_url)
    downloads_json = build_downloads_manifest(version_tag, prefix, base_url)

    put_json(bucket, "latest.json", latest_json)
    put_json(bucket, f"{prefix}/latest.json", latest_json)
    put_json(bucket, f"{prefix}/{version_tag}/latest.json", latest_json)
    if cli_latest_json is not None:
        put_json(bucket, "cli-latest.json", cli_latest_json)
        put_json(bucket, f"{prefix}/cli-latest.json", cli_latest_json)
        put_json(bucket, f"{prefix}/{version_tag}/cli-latest.json", cli_latest_json)
    put_json(bucket, "downloads.json", downloads_json)
    put_json(bucket, f"{prefix}/downloads.json", downloads_json)
    put_json(bucket, f"{prefix}/{version_tag}/downloads.json", downloads_json)

    prune_old_releases(bucket, prefix, keep)


if __name__ == "__main__":
    main()
