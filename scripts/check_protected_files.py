#!/usr/bin/env python3
"""Guard protected files against accidental edits in audit/refactor PRs."""

from __future__ import annotations

import argparse
import os
import subprocess
import sys


PROTECTED_FILES = [
    "data/stages.json",
]

ALLOW_ENV = "SAGA_ALLOW_PROTECTED_STAGES_CHANGE"


def run_git(args: list[str]) -> str:
    result = subprocess.run(
        ["git", *args],
        check=True,
        text=True,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
    )
    return result.stdout.strip()


def resolve_base_ref(base: str) -> str:
    candidates = [base]

    if not base.startswith("origin/") and base not in {"HEAD", "FETCH_HEAD"}:
        candidates.append(f"origin/{base}")

    for candidate in candidates:
        try:
            run_git(["rev-parse", "--verify", candidate])
            return candidate
        except subprocess.CalledProcessError:
            continue

    raise SystemExit(f"Could not resolve base ref: {base}")


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument(
        "--base",
        default=os.getenv("GITHUB_BASE_REF") or "origin/main",
        help="Base ref to compare against. Defaults to GITHUB_BASE_REF or origin/main.",
    )
    args = parser.parse_args()

    if os.getenv(ALLOW_ENV) == "1":
        print(f"[WARN] Protected file guard bypassed because {ALLOW_ENV}=1")
        return 0

    base_ref = resolve_base_ref(args.base)
    changed = run_git(["diff", "--name-only", f"{base_ref}...HEAD", "--", *PROTECTED_FILES])
    changed_files = [line.strip() for line in changed.splitlines() if line.strip()]

    if not changed_files:
        print("Protected file guard passed.")
        return 0

    print("ERROR: protected file changes detected:")
    for filename in changed_files:
        print(f"- {filename}")

    print()
    print("These files are protected against accidental edits in audit/refactor PRs.")
    print("Do not modify data/stages.json unless the PR is explicitly about mission/stage content.")
    print(f"For an intentional stage-content PR only, rerun with {ALLOW_ENV}=1.")
    return 1


if __name__ == "__main__":
    raise SystemExit(main())
