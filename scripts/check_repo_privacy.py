#!/usr/bin/env python3
"""Repository privacy guard for tracked files.

Blocks common accidental leaks:
- environment files
- local databases
- logs/backups/temp artifacts
- private keys
- common token formats
- runtime state files that should stay local
"""

from __future__ import annotations

import re
import subprocess
import sys
from pathlib import Path


FORBIDDEN_FILENAME_PATTERNS = [
    (re.compile(r"(^|/)\.env(\.|$)"), "environment file"),
    (re.compile(r"\.(sqlite|sqlite3|db|db3)$", re.IGNORECASE), "local database file"),
    (re.compile(r"\.(bak|backup|old|tmp|temp|log)$", re.IGNORECASE), "backup/temp/log file"),
    (re.compile(r"(^|/)(id_rsa|id_dsa|id_ecdsa|id_ed25519)$"), "private SSH key"),
    (re.compile(r"\.(pem|key|p12|pfx)$", re.IGNORECASE), "private key/certificate bundle"),
    (re.compile(r"(^|/)(backup|backups|dump|dumps)(/|$)", re.IGNORECASE), "backup/dump directory"),
    (re.compile(r"(^|/)(gamestate|positions|events|admin_auth)\.json$", re.IGNORECASE), "runtime state file"),
    (re.compile(r"(^|/)saga\.sqlite3$", re.IGNORECASE), "runtime SQLite database"),
]

SECRET_CONTENT_PATTERNS = [
    (re.compile(r"-----BEGIN (RSA |DSA |EC |OPENSSH )?PRIVATE KEY-----"), "private key material"),
    (re.compile(r"ghp_[A-Za-z0-9_]{20,}"), "GitHub personal access token"),
    (re.compile(r"github_pat_[A-Za-z0-9_]{20,}"), "GitHub fine-grained token"),
    (re.compile(r"sk-(proj-)?[A-Za-z0-9]{20,}"), "OpenAI-style secret key"),
    (re.compile(r"xox[baprs]-[A-Za-z0-9-]{20,}"), "Slack token"),
    (re.compile(r"AKIA[0-9A-Z]{16}"), "AWS access key id"),
    (re.compile(r"AIza[0-9A-Za-z\-_]{35}"), "Google API key"),
]

TEXT_EXTENSIONS = {
    ".py",
    ".js",
    ".jsx",
    ".ts",
    ".tsx",
    ".json",
    ".yml",
    ".yaml",
    ".toml",
    ".ini",
    ".cfg",
    ".conf",
    ".md",
    ".html",
    ".css",
    ".sh",
    ".ps1",
    ".txt",
}

SKIP_CONTENT_SCAN_FILENAMES = {
    "package-lock.json",
    "requirements.lock",
}


ALLOWED_TEMPLATE_FILES = {
    ".env.example",
}

SKIP_PATH_PARTS = {
    ".git",
    "node_modules",
    "dist",
    "build",
    ".venv",
    "__pycache__",
}


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


def should_skip_path(path: Path) -> bool:
    parts = set(path.parts)
    return bool(parts & SKIP_PATH_PARTS)


def scan_filename(path: Path) -> list[str]:
    normalized = path.as_posix()
    if normalized in ALLOWED_TEMPLATE_FILES:
        return []

    findings = []
    for pattern, label in FORBIDDEN_FILENAME_PATTERNS:
        if pattern.search(normalized):
            findings.append(f"{normalized}: forbidden filename ({label})")
    return findings


def looks_text_scannable(path: Path) -> bool:
    if path.as_posix() in ALLOWED_TEMPLATE_FILES:
        return True
    if path.name in SKIP_CONTENT_SCAN_FILENAMES:
        return False
    return path.suffix.lower() in TEXT_EXTENSIONS


def scan_content(path: Path) -> list[str]:
    if not looks_text_scannable(path):
        return []

    try:
        raw = path.read_bytes()
    except OSError as exc:
        return [f"{path.as_posix()}: could not read file: {exc}"]

    if b"\0" in raw:
        return []

    text = raw.decode("utf-8", errors="replace")
    findings = []

    for line_no, line in enumerate(text.splitlines(), start=1):
        for pattern, label in SECRET_CONTENT_PATTERNS:
            if pattern.search(line):
                findings.append(f"{path.as_posix()}:{line_no}: possible secret ({label})")

    return findings


def main() -> int:
    findings: list[str] = []

    for path in tracked_files():
        if should_skip_path(path):
            continue
        findings.extend(scan_filename(path))
        findings.extend(scan_content(path))

    if not findings:
        print("Repository privacy guard passed.")
        return 0

    print("ERROR: repository privacy guard found potential leaks:")
    for finding in findings:
        print(f"- {finding}")

    print()
    print("Remove secrets/runtime data/backups from the repository before merging.")
    print("If this is a false positive, adjust the guard with a narrow allowlist and explain why in the PR.")
    return 1


if __name__ == "__main__":
    raise SystemExit(main())
