#!/usr/bin/env python3
"""Compare two design-screenshot baselines and report changed area per page.

Facts only: which pages differ, how many pixels differ, and how large the
bounding box of the change is relative to the screen. No judgement about
whether a change is good.

Usage
    python3 scripts/design-diff.py OLD_DIR NEW_DIR
    python3 scripts/design-diff.py OLD_DIR NEW_DIR --json
    python3 scripts/design-diff.py OLD_DIR NEW_DIR --threshold 12 --out report.md

Both directories must contain a manifest.json written by
scripts/design-screenshots.mjs (pages mode) plus one PNG per shot.

Output: a Markdown table on stdout (or --out file): theme/page, changed pixel
ratio, changed-region ratio, region box. --json prints the same as JSON.

Requires Pillow (PIL). Exit code 0 on success, 2 on unusable input.
"""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

try:
    from PIL import Image, ImageChops
except ImportError:  # pragma: no cover
    sys.stderr.write(
        "design-diff: Pillow is required (python3 -m pip install pillow)\n"
    )
    raise SystemExit(2)


def load_manifest(directory: Path) -> dict:
    manifest = directory / "manifest.json"
    if not manifest.exists():
        raise SystemExit(f"design-diff: no manifest.json in {directory}")
    return json.loads(manifest.read_text("utf-8"))


def key_of(shot: dict) -> str:
    return f"{shot.get('theme', 'dark')}/{shot.get('viewport', 'desktop')}/{shot['route']}"


def compare(old: Path, new: Path, threshold: int) -> dict:
    a = Image.open(old).convert("RGB")
    b = Image.open(new).convert("RGB")
    same_size = a.size == b.size
    if not same_size:
        # Compare the overlapping area; size changes are reported separately.
        width = min(a.width, b.width)
        height = min(a.height, b.height)
        a = a.crop((0, 0, width, height))
        b = b.crop((0, 0, width, height))

    diff = ImageChops.difference(a, b)
    cutoff = (lambda v: 255 if v > threshold else 0)
    red, green, blue = diff.split()
    mask = ImageChops.lighter(
        ImageChops.lighter(red.point(cutoff), green.point(cutoff)),
        blue.point(cutoff),
    )
    histogram = mask.histogram()
    changed = histogram[255] if len(histogram) > 255 else 0
    total = a.width * a.height
    box = mask.getbbox()

    box_pixels = 0
    if box is not None:
        box_pixels = (box[2] - box[0]) * (box[3] - box[1])

    return {
        "old_size": list(Image.open(old).size),
        "new_size": list(Image.open(new).size),
        "same_size": same_size,
        "threshold": threshold,
        "changed_pixels": changed,
        "changed_ratio": round(changed / total * 100, 3),
        "region_pixels": box_pixels,
        "region_ratio": round(box_pixels / total * 100, 3),
        "region_box": list(box) if box else None,
    }


def main() -> int:
    parser = argparse.ArgumentParser(add_help=True, description="Compare design screenshot baselines")
    parser.add_argument("old", type=Path)
    parser.add_argument("new", type=Path)
    parser.add_argument("--threshold", type=int, default=8, help="per-channel difference ignored as noise (default 8)")
    parser.add_argument("--json", action="store_true", help="print JSON instead of Markdown")
    parser.add_argument("--out", type=Path, help="also write the Markdown report to this file")
    args = parser.parse_args()

    old_manifest = load_manifest(args.old)
    new_manifest = load_manifest(args.new)
    old_shots = {key_of(s): s for s in old_manifest["shots"]}
    new_shots = {key_of(s): s for s in new_manifest["shots"]}

    rows = []
    for key in sorted(set(old_shots) | set(new_shots)):
        o = old_shots.get(key)
        n = new_shots.get(key)
        if o is None:
            rows.append({"key": key, "status": "新增", "changed_ratio": 100.0, "region_ratio": 100.0, "region_box": None})
            continue
        if n is None:
            rows.append({"key": key, "status": "缺失", "changed_ratio": 100.0, "region_ratio": 100.0, "region_box": None})
            continue
        old_path = args.old / o["file"]
        new_path = args.new / n["file"]
        if not old_path.exists() or not new_path.exists():
            rows.append({"key": key, "status": "文件缺失", "changed_ratio": None, "region_ratio": None, "region_box": None})
            continue
        result = compare(old_path, new_path, args.threshold)
        status = "无变化" if result["changed_pixels"] == 0 else "有变化"
        rows.append({"key": key, "status": status, **result})

    changed_rows = [r for r in rows if r["status"] != "无变化"]
    changed_rows.sort(key=lambda r: (r.get("changed_ratio") or 0), reverse=True)

    if args.json:
        payload = {
            "old": str(args.old),
            "new": str(args.new),
            "oldGeneratedAt": old_manifest.get("generatedAt"),
            "newGeneratedAt": new_manifest.get("generatedAt"),
            "threshold": args.threshold,
            "total_shots": len(rows),
            "changed_shots": len(changed_rows),
            "rows": changed_rows,
        }
        sys.stdout.write(json.dumps(payload, ensure_ascii=False, indent=2) + "\n")
        return 0

    lines = []
    lines.append(f"# 截图差分：{args.new} ← {args.old}")
    lines.append("")
    lines.append(
        f"- 对比基线：{old_manifest.get('generatedAt')} → {new_manifest.get('generatedAt')}"
    )
    lines.append(f"- 截图总数：{len(rows)}，有变化：{len(changed_rows)}")
    lines.append(f"- 像素阈值：单通道差值 > {args.threshold}")
    lines.append("")
    if not changed_rows:
        lines.append("所有页面逐像素一致。")
    else:
        lines.append("| 主题/页面 | 变化像素占比 | 变化区域占屏 | 区域框 (x0,y0,x1,y1) |")
        lines.append("|---|---:|---:|---|")
        for row in changed_rows:
            if row["status"] != "有变化":
                lines.append(f"| {row['key']} | — | — | {row['status']} |")
                continue
            box = row.get("region_box")
            box_text = f"({box[0]}, {box[1]}, {box[2]}, {box[3]})" if box else "—"
            size_note = ""
            if not row.get("same_size"):
                size_note = f" 尺寸 {row['old_size']}→{row['new_size']}"
            lines.append(
                f"| {row['key']}{size_note} | {row['changed_ratio']:.2f}% | "
                f"{row['region_ratio']:.2f}% | {box_text} |"
            )

    report = "\n".join(lines) + "\n"
    sys.stdout.write(report)
    if args.out:
        args.out.write_text(report, "utf-8")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
