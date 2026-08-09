#!/usr/bin/env python3
"""Run local audit guard suite."""

from __future__ import annotations

import argparse
import subprocess
import sys


def run(cmd: list[str]) -> None:
    print("+", " ".join(cmd), flush=True)
    subprocess.run(cmd, check=True)


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--base", default="origin/main")
    args = parser.parse_args()

    run([sys.executable, "scripts/check_protected_files.py", "--base", args.base])
    run([sys.executable, "scripts/check_repo_privacy.py"])
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
