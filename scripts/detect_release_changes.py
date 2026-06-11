#!/usr/bin/env python3
"""Detect which GitMemo release surfaces changed between two Git refs.

The repository is not split into Rust workspace crates yet, so CI needs a
single place to make conservative release decisions from changed file paths.
"""
from __future__ import annotations

import argparse
import subprocess
import sys
from dataclasses import dataclass
from typing import Iterable


OUTPUT_KEYS = (
    "core_changed",
    "cli_changed",
    "desktop_changed",
    "website_changed",
    "release_infra_changed",
    "release_changed",
)

CORE_FILES = {
    "Cargo.toml",
    "Cargo.lock",
    "src/lib.rs",
}

CLI_FILES = {
    "src/main.rs",
    "scripts/install.sh",
}

CLI_PREFIXES = (
    "src/cli/",
    "src/commands/",
)

CORE_PREFIXES = (
    "src/inject/",
    "src/mcp/",
    "src/platform/",
    "src/services/",
    "src/storage/",
    "src/utils/",
)

DESKTOP_PREFIXES = (
    "desktop/",
)

WEBSITE_PREFIXES = (
    "website/",
)

RELEASE_INFRA_FILES = {
    ".github/workflows/ci.yml",
    "scripts/detect_release_changes.py",
    "scripts/generate_changelog.py",
    "scripts/sync_desktop_version.py",
    "scripts/sync_release_assets_to_oss.py",
    "scripts/sync_website_assets_to_oss.py",
    "scripts/write_cli_latest_json.py",
    "scripts/write_latest_json.py",
}

RELEASE_INFRA_PREFIXES = (
    ".github/actions/",
)


@dataclass(frozen=True)
class ReleaseChanges:
    core_changed: bool
    cli_changed: bool
    desktop_changed: bool
    website_changed: bool
    release_infra_changed: bool
    release_changed: bool

    def outputs(self) -> dict[str, bool]:
        return {key: bool(getattr(self, key)) for key in OUTPUT_KEYS}


def normalize_path(path: str) -> str:
    return path.strip().replace("\\", "/").removeprefix("./")


def is_ignored_path(path: str) -> bool:
    return not path or path == ".DS_Store" or path.endswith("/.DS_Store")


def has_prefix(path: str, prefixes: Iterable[str]) -> bool:
    return any(path.startswith(prefix) for prefix in prefixes)


def is_cli_specific_path(path: str) -> bool:
    return path in CLI_FILES or has_prefix(path, CLI_PREFIXES)


def is_core_path(path: str) -> bool:
    if path in CORE_FILES or has_prefix(path, CORE_PREFIXES):
        return True
    return path.startswith("src/") and not is_cli_specific_path(path)


def is_desktop_path(path: str) -> bool:
    return has_prefix(path, DESKTOP_PREFIXES)


def is_website_path(path: str) -> bool:
    return has_prefix(path, WEBSITE_PREFIXES)


def is_release_infra_path(path: str) -> bool:
    return path in RELEASE_INFRA_FILES or has_prefix(path, RELEASE_INFRA_PREFIXES)


def detect_release_changes(paths: Iterable[str], bootstrap: bool = False) -> ReleaseChanges:
    if bootstrap:
        return ReleaseChanges(
            core_changed=True,
            cli_changed=True,
            desktop_changed=True,
            website_changed=True,
            release_infra_changed=True,
            release_changed=True,
        )

    changed_paths = [
        normalized
        for path in paths
        if not is_ignored_path((normalized := normalize_path(path)))
    ]

    core_changed = any(is_core_path(path) for path in changed_paths)
    cli_changed = core_changed or any(is_cli_specific_path(path) for path in changed_paths)
    desktop_changed = core_changed or any(is_desktop_path(path) for path in changed_paths)
    website_changed = any(is_website_path(path) for path in changed_paths)
    release_infra_changed = any(is_release_infra_path(path) for path in changed_paths)
    release_changed = any(
        (
            core_changed,
            cli_changed,
            desktop_changed,
            website_changed,
            release_infra_changed,
        )
    )

    return ReleaseChanges(
        core_changed=core_changed,
        cli_changed=cli_changed,
        desktop_changed=desktop_changed,
        website_changed=website_changed,
        release_infra_changed=release_infra_changed,
        release_changed=release_changed,
    )


def changed_files(base: str | None, head: str) -> list[str]:
    if not base:
        return []
    result = subprocess.run(
        ["git", "diff", "--name-only", f"{base}..{head}"],
        check=True,
        text=True,
        stdout=subprocess.PIPE,
    )
    return [line for line in result.stdout.splitlines() if line.strip()]


def print_outputs(changes: ReleaseChanges) -> None:
    for key, value in changes.outputs().items():
        print(f"{key}={'true' if value else 'false'}")


def print_summary(paths: list[str], changes: ReleaseChanges, bootstrap: bool) -> None:
    print("Release change detection:", file=sys.stderr)
    if bootstrap:
        print("- bootstrap release: treating all surfaces as changed", file=sys.stderr)
    elif paths:
        print("- changed files:", file=sys.stderr)
        for path in paths:
            print(f"  - {normalize_path(path)}", file=sys.stderr)
    else:
        print("- changed files: none", file=sys.stderr)

    print("- decision:", file=sys.stderr)
    for key, value in changes.outputs().items():
        print(f"  - {key}={'true' if value else 'false'}", file=sys.stderr)


def self_test() -> None:
    cases = [
        (
            "desktop only",
            ["desktop/src/pages/SettingsPage.tsx"],
            {"cli_changed": False, "desktop_changed": True, "release_changed": True},
        ),
        (
            "website only",
            ["website/src/app/page.tsx"],
            {"cli_changed": False, "website_changed": True, "release_changed": True},
        ),
        (
            "cli command",
            ["src/commands/upgrade.rs"],
            {"core_changed": False, "cli_changed": True, "desktop_changed": False},
        ),
        (
            "shared core",
            ["src/storage/database.rs"],
            {"core_changed": True, "cli_changed": True, "desktop_changed": True},
        ),
        (
            "install script",
            ["scripts/install.sh"],
            {"core_changed": False, "cli_changed": True, "desktop_changed": False},
        ),
        (
            "release infra",
            [".github/workflows/ci.yml", "scripts/write_cli_latest_json.py"],
            {"cli_changed": False, "release_infra_changed": True, "release_changed": True},
        ),
        (
            "docs ignored for release surfaces",
            ["docs/usage.md", "AGENTS.md"],
            {"cli_changed": False, "desktop_changed": False, "release_changed": False},
        ),
        (
            "metadata ignored",
            ["src/.DS_Store"],
            {"core_changed": False, "cli_changed": False, "release_changed": False},
        ),
    ]

    for name, paths, expected in cases:
        outputs = detect_release_changes(paths).outputs()
        for key, value in expected.items():
            actual = outputs[key]
            if actual is not value:
                raise AssertionError(
                    f"{name}: expected {key}={value}, got {actual}; outputs={outputs}"
                )

    bootstrap_outputs = detect_release_changes([], bootstrap=True).outputs()
    for key in OUTPUT_KEYS:
        if bootstrap_outputs[key] is not True:
            raise AssertionError(f"bootstrap: expected {key}=True")

    print("detect_release_changes self-test passed")


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--base", help="Base git ref. Omit with --bootstrap.")
    parser.add_argument("--head", default="HEAD", help="Head git ref. Defaults to HEAD.")
    parser.add_argument(
        "--changed-file",
        action="append",
        default=[],
        help="Provide changed files directly instead of running git diff.",
    )
    parser.add_argument(
        "--bootstrap",
        action="store_true",
        help="Treat this as the first release and mark all surfaces as changed.",
    )
    parser.add_argument(
        "--summary",
        action="store_true",
        help="Print a human-readable summary to stderr.",
    )
    parser.add_argument("--self-test", action="store_true", help="Run script self-tests.")
    return parser.parse_args()


def main() -> None:
    args = parse_args()
    if args.self_test:
        self_test()
        return

    paths = args.changed_file or changed_files(args.base, args.head)
    changes = detect_release_changes(paths, bootstrap=args.bootstrap)
    if args.summary:
        print_summary(paths, changes, args.bootstrap)
    print_outputs(changes)


if __name__ == "__main__":
    main()
