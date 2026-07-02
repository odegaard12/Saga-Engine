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
    raise RuntimeError("Set GITHUB_TOKEN or GH_TOKEN before creating a release.")


def main() -> int:
    token = read_token()
    repository = str(os.getenv("GITHUB_REPOSITORY") or "odegaard12/Saga-Engine").strip()
    body = Path(__file__).with_name("RELEASE_NOTES.md").read_text(encoding="utf-8")
    version = Path(__file__).with_name("VERSION").read_text(encoding="utf-8").strip() or "2.0.1"

    data = json.dumps(
        {
            "tag_name": f"v{version}",
            "target_commitish": os.getenv("GITHUB_TARGET_BRANCH", "main"),
            "name": f"SAGA Engine v{version}",
            "body": body,
            "draft": False,
            "prerelease": False,
        }
    ).encode("utf-8")

    req = urllib.request.Request(
        f"https://api.github.com/repos/{repository}/releases",
        data=data,
        method="POST",
        headers={
            "Authorization": "Bearer " + token,
            "Accept": "application/vnd.github+json",
            "Content-Type": "application/json",
            "User-Agent": "saga-engine-release",
        },
    )

    try:
        with urllib.request.urlopen(req) as response:
            payload = json.loads(response.read())
    except urllib.error.HTTPError as exc:
        print(exc.read().decode("utf-8"), file=sys.stderr)
        return exc.code or 1

    print(payload.get("html_url", "release created"))
    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except Exception as exc:
        print(str(exc), file=sys.stderr)
        raise SystemExit(1)
