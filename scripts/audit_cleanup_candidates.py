#!/usr/bin/env python3
"""Audit cleanup candidates without deleting anything.

The report intentionally avoids copying matched line contents, so it does not
accidentally publish secrets or local paths while reviewing cleanup candidates.
"""

from __future__ import annotations

import argparse
import re
import subprocess
from collections import defaultdict
from pathlib import Path


TEXT_EXTENSIONS = {
    ".py",
    ".js",
    ".jsx",
    ".ts",
    ".tsx",
    ".json",
    ".yml",
    ".yaml",
    ".md",
    ".html",
    ".css",
    ".sh",
    ".txt",
}

SKIP_PARTS = {
    ".git",
    ".venv",
    "node_modules",
    "dist",
    "build",
    "__pycache__",
}

SKIP_FILES = {
    "package-lock.json",
    "requirements.lock",
    "docs/security/cleanup-audit-report.md",
}

PATTERNS = [
    # Narrow old-route patterns: these are more actionable than broad mentions of
    # "classic admin" in docs that intentionally explain the retired boundary.
    ("old_route_reference", re.compile(r"/admin-classic|admin\.html|classic-admin", re.IGNORECASE)),

    # Stale storage wording. Current docs should say JSON is the default and
    # SQLite is optional, not that SAGA is JSON-only.
    ("json_only_persistence", re.compile(r"json-only|JSON only|solo JSON|only JSON", re.IGNORECASE)),

    # Explicit cleanup markers.
    ("cleanup_marker", re.compile(r"\bTODO\b|\bFIXME\b|delete me|remove later|temporary hack", re.IGNORECASE)),

    # Strong obsolete markers. Avoid broad terms like "retired" because current
    # docs legitimately state that the classic admin has been retired.
    ("obsolete_marker", re.compile(r"\bobsolete\b|\bobsoleto\b|\bdeprecated\b", re.IGNORECASE)),
]


def run_git(args: list[str]) -> str:
    result = subprocess.run(
        ["git", *args],
        check=True,
        text=False,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
    )
    return result.stdout.decode("utf-8", errors="replace")


def tracked_files() -> list[Path]:
    raw = run_git(["ls-files", "-z"])
    return [Path(item) for item in raw.split("\0") if item]


def should_skip(path: Path) -> bool:
    if path.as_posix() in SKIP_FILES:
        return True
    if set(path.parts) & SKIP_PARTS:
        return True
    if path.suffix.lower() not in TEXT_EXTENSIONS:
        return True
    return False


def scan_file(path: Path) -> dict[str, list[int]]:
    try:
        raw = path.read_bytes()
    except OSError:
        return {}

    if b"\0" in raw:
        return {}

    text = raw.decode("utf-8", errors="replace")
    hits: dict[str, list[int]] = defaultdict(list)

    for line_no, line in enumerate(text.splitlines(), start=1):
        for label, pattern in PATTERNS:
            if pattern.search(line):
                hits[label].append(line_no)

    return dict(hits)


def build_report() -> tuple[dict[str, dict[str, list[int]]], dict[str, int]]:
    findings: dict[str, dict[str, list[int]]] = {}
    totals: dict[str, int] = defaultdict(int)

    for path in tracked_files():
        if should_skip(path):
            continue

        hits = scan_file(path)
        if not hits:
            continue

        findings[path.as_posix()] = hits
        for label, lines in hits.items():
            totals[label] += len(lines)

    return findings, dict(totals)


def render_markdown(findings: dict[str, dict[str, list[int]]], totals: dict[str, int]) -> str:
    lines = [
        "# Cleanup audit report",
        "",
        "This report lists cleanup candidates found in tracked text files.",
        "",
        "It intentionally records file paths, categories and line numbers only. It does not copy matched line content, so it avoids accidentally publishing secrets, local paths or operational details.",
        "",
        "## Summary",
        "",
    ]

    if not findings:
        lines.append("No cleanup candidates found.")
        lines.append("")
        return "\n".join(lines)

    for label in sorted(totals):
        lines.append(f"- `{label}`: {totals[label]} hit(s)")

    lines.extend(["", "## Files", ""])

    for filename in sorted(findings):
        lines.append(f"### `{filename}`")
        lines.append("")
        for label in sorted(findings[filename]):
            joined = ", ".join(str(line) for line in findings[filename][label])
            lines.append(f"- `{label}`: line(s) {joined}")
        lines.append("")

    lines.extend(
        [
            "## Cleanup rule",
            "",
            "Do not delete files or code solely because they appear in this report.",
            "",
            "Review each candidate and remove only confirmed obsolete references in focused PRs.",
            "",
            "Never modify `data/stages.json` from cleanup PRs.",
            "",
        ]
    )

    return "\n".join(lines)


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument(
        "--write",
        default="",
        help="Optional Markdown output path.",
    )
    args = parser.parse_args()

    findings, totals = build_report()
    markdown = render_markdown(findings, totals)

    if args.write:
        output = Path(args.write)
        output.parent.mkdir(parents=True, exist_ok=True)
        output.write_text(markdown, encoding="utf-8")
        print(f"Wrote cleanup audit report to {output}")
    else:
        print(markdown)

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
