from __future__ import annotations

import json
import os
import sys
import urllib.error
import urllib.request
from pathlib import Path


def read_token() -> str:
    token = str(os.getenv("GITHUB_TOKEN") or os.getenv("GH_TOKEN") or "").strip()
    if token:
        return token
    raise RuntimeError("Set GITHUB_TOKEN or GH_TOKEN before updating a pull request.")


def main() -> int:
    token = read_token()
    repository = str(os.getenv("GITHUB_REPOSITORY") or "odegaard12/Saga-Engine").strip()
    pull_number = str(os.getenv("GITHUB_PR_NUMBER") or "").strip()
    if not pull_number:
        raise RuntimeError("Set GITHUB_PR_NUMBER before updating a pull request.")

    body = Path("/tmp/pr_body.md").read_text(encoding="utf-8")
    version = Path(__file__).with_name("VERSION").read_text(encoding="utf-8").strip()
    if not version:
        raise RuntimeError("VERSION must not be empty.")

    data = json.dumps(
        {
            "title": f"release: SAGA Engine v{version} - security hardening and release alignment",
            "body": body,
        }
    ).encode("utf-8")

    req = urllib.request.Request(
        f"https://api.github.com/repos/{repository}/pulls/{pull_number}",
        data=data,
        method="PATCH",
        headers={
            "Authorization": "Bearer " + token,
            "Accept": "application/vnd.github+json",
            "Content-Type": "application/json",
            "User-Agent": "saga-engine-pr-update",
        },
    )

    try:
        with urllib.request.urlopen(req) as response:
            payload = json.loads(response.read())
    except urllib.error.HTTPError as exc:
        print(exc.read().decode("utf-8"), file=sys.stderr)
        return exc.code or 1

    print(payload.get("html_url", "pull request updated"))
    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except Exception as exc:
        print(str(exc), file=sys.stderr)
        raise SystemExit(1)
