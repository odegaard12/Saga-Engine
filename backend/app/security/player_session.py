from __future__ import annotations

import base64
import hashlib
import hmac
import json
import time
from typing import Any


def _urlsafe_b64encode(raw: bytes) -> str:
    return base64.urlsafe_b64encode(raw).decode("ascii").rstrip("=")


def _urlsafe_b64decode(raw: str) -> bytes:
    padding = "=" * (-len(raw) % 4)
    return base64.urlsafe_b64decode(f"{raw}{padding}".encode("ascii"))


def _sign(value: str, secret: str) -> str:
    return hmac.new(secret.encode("utf-8"), value.encode("utf-8"), hashlib.sha256).hexdigest()


def create_player_session_token(
    user: str,
    *,
    ttl_seconds: int,
    secret: str,
    now: int | None = None,
) -> str:
    issued_at = int(now or time.time())
    payload = {
        "user": str(user or "").strip(),
        "iat": issued_at,
        "exp": issued_at + int(ttl_seconds),
    }
    encoded = _urlsafe_b64encode(json.dumps(payload, separators=(",", ":"), sort_keys=True).encode("utf-8"))
    signature = _sign(encoded, secret)
    return f"{encoded}.{signature}"


def read_player_session_token(token: str | None, *, secret: str, now: int | None = None) -> dict[str, Any] | None:
    raw = str(token or "").strip()
    if not raw or "." not in raw:
        return None

    encoded, signature = raw.rsplit(".", 1)
    expected = _sign(encoded, secret)
    if not hmac.compare_digest(signature, expected):
        return None

    try:
        payload = json.loads(_urlsafe_b64decode(encoded).decode("utf-8"))
    except (ValueError, UnicodeDecodeError, json.JSONDecodeError):
        return None

    if not isinstance(payload, dict):
        return None

    user = str(payload.get("user") or "").strip()
    exp = int(payload.get("exp") or 0)
    current = int(now or time.time())
    if not user or exp <= current:
        return None

    payload["user"] = user
    payload["exp"] = exp
    return payload


def verify_player_session_token(token: str | None, *, user: str, secret: str, now: int | None = None) -> bool:
    payload = read_player_session_token(token, secret=secret, now=now)
    if not payload:
        return False
    return hmac.compare_digest(str(payload.get("user") or ""), str(user or "").strip())


def player_cookie_settings(request, ttl_seconds: int) -> dict[str, Any]:
    secure = (request.url.scheme or "").lower() == "https"
    return {
        "httponly": True,
        "samesite": "lax",
        "secure": secure,
        "path": "/",
        "max_age": int(ttl_seconds),
    }
