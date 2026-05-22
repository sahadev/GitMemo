#!/usr/bin/env python3

import json
import os
import re
import sys
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]


def read_root_version() -> str:
    cargo_toml = (ROOT / "Cargo.toml").read_text(encoding="utf-8")
    match = re.search(r'^version = "([^"]+)"', cargo_toml, re.MULTILINE)
    if not match:
        raise SystemExit("Failed to read version from Cargo.toml")
    return match.group(1)


def write_json(path: Path, update):
    data = json.loads(path.read_text(encoding="utf-8"))
    update(data)
    path.write_text(json.dumps(data, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


def replace_first_version(path: Path, version: str):
    content = path.read_text(encoding="utf-8")
    updated, count = re.subn(
        r'^version = "[^"]+"',
        f'version = "{version}"',
        content,
        count=1,
        flags=re.MULTILINE,
    )
    if count != 1:
        raise SystemExit(f"Failed to update version in {path}")
    path.write_text(updated, encoding="utf-8")


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


def oss_public_base_url() -> str | None:
    explicit = os.environ.get("ALIYUN_OSS_PUBLIC_BASE_URL", "").strip()
    if explicit:
        return explicit.rstrip("/")

    bucket = os.environ.get("ALIYUN_OSS_BUCKET", "").strip()
    region = os.environ.get("ALIYUN_OSS_REGION", "").strip()
    if not bucket or not region:
        return None

    return f"https://{bucket}.oss-{normalize_region(region)}.aliyuncs.com"


def update_tauri_config(data: dict, version: str):
    data["version"] = version

    base_url = oss_public_base_url()
    if not base_url:
        return

    oss_endpoint = f"{base_url}/latest.json"
    updater = data.setdefault("plugins", {}).setdefault("updater", {})
    existing = updater.get("endpoints") or []
    github_endpoints = [endpoint for endpoint in existing if "github.com" in endpoint.lower()]
    if not github_endpoints:
        github_endpoints = ["https://github.com/sahadev/gitmemo/releases/latest/download/latest.json"]
    updater["endpoints"] = [oss_endpoint, *github_endpoints]


def main():
    version = sys.argv[1] if len(sys.argv) > 1 else read_root_version()

    write_json(ROOT / "desktop" / "package.json", lambda data: data.__setitem__("version", version))
    write_json(ROOT / "desktop" / "src-tauri" / "tauri.conf.json", lambda data: update_tauri_config(data, version))
    replace_first_version(ROOT / "desktop" / "src-tauri" / "Cargo.toml", version)

    print(f"Synchronized desktop versions to {version}")


if __name__ == "__main__":
    main()
