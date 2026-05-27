#!/usr/bin/env python3
"""Upload website/public/website/assets to Aliyun OSS.

Expected environment:
  ALIYUN_ACCESS_KEY_ID
  ALIYUN_ACCESS_KEY_SECRET
  ALIYUN_OSS_BUCKET
  ALIYUN_OSS_REGION           e.g. cn-hangzhou or oss-cn-hangzhou

Optional environment:
  ALIYUN_OSS_ENDPOINT         e.g. https://oss-cn-hangzhou.aliyuncs.com
  WEBSITE_ASSETS_DIR          default: website/public/website/assets
  WEBSITE_OSS_PREFIX          default: website/assets
"""
from __future__ import annotations

import mimetypes
import os
import pathlib
import sys
from typing import Any

try:
    import oss2
except ImportError:
    print("ERROR: missing dependency 'oss2'. Install with: python3 -m pip install oss2", file=sys.stderr)
    sys.exit(1)


ROOT = pathlib.Path(__file__).resolve().parents[1]


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


def cache_control_for(path: pathlib.Path) -> str:
    if path.suffix.lower() in {".png", ".jpg", ".jpeg", ".webp", ".avif", ".svg"}:
        return "public, max-age=31536000, immutable"
    return "public, max-age=3600"


def put_file(bucket: Any, key: str, path: pathlib.Path) -> None:
    headers = {"Cache-Control": cache_control_for(path)}
    content_type, _ = mimetypes.guess_type(path.name)
    if content_type:
        headers["Content-Type"] = content_type
    bucket.put_object_from_file(key, str(path), headers=headers)
    print(f"Uploaded {key}")


def main() -> None:
    key_id = require_env("ALIYUN_ACCESS_KEY_ID")
    key_secret = require_env("ALIYUN_ACCESS_KEY_SECRET")
    bucket_name = require_env("ALIYUN_OSS_BUCKET")
    region = require_env("ALIYUN_OSS_REGION")
    assets_dir = pathlib.Path(
        os.environ.get("WEBSITE_ASSETS_DIR", str(ROOT / "website" / "public" / "website" / "assets"))
    )
    prefix = os.environ.get("WEBSITE_OSS_PREFIX", "website/assets").strip().strip("/") or "website/assets"

    if not assets_dir.is_dir():
        print(f"ERROR: missing website assets directory {assets_dir}", file=sys.stderr)
        sys.exit(1)

    files = sorted(path for path in assets_dir.rglob("*") if path.is_file())
    if not files:
        print(f"ERROR: no files found in {assets_dir}", file=sys.stderr)
        sys.exit(1)

    endpoint = endpoint_for_region(region)
    auth = oss2.Auth(key_id, key_secret)
    bucket = oss2.Bucket(auth, endpoint, bucket_name)

    print(f"Syncing {assets_dir} to oss://{bucket_name}/{prefix}/")
    for path in files:
        rel_path = path.relative_to(assets_dir).as_posix()
        put_file(bucket, f"{prefix}/{rel_path}", path)


if __name__ == "__main__":
    main()
