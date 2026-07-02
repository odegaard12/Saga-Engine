"""Admin authentication helpers.

This module keeps password hashing, admin sessions, legacy payload compatibility
and login lockout logic outside main.py.
"""

from __future__ import annotations

import hashlib
import hmac
import os
import secrets
import time
from typing import Any

from backend.app.storage.runtime_store import load_document, save_document


def now_ts() -> int:
    return int(time.time())


def hash_password(password: str, salt: str | None = None, iterations: int = 200000) -> dict[str, Any]:
    salt = salt or secrets.token_hex(16)
    dk = hashlib.pbkdf2_hmac(
        "sha256",
        str(password or "").encode("utf-8"),
        salt.encode("utf-8"),
        iterations,
    )
    return {
        "salt": salt,
        "password_hash": dk.hex(),
        "iterations": iterations,
    }


def load_admin_auth(path: str) -> dict[str, Any]:
    data = load_document(path, 'admin_auth', {})
    return data if isinstance(data, dict) else {}


def save_admin_auth(path: str, data: dict[str, Any]) -> None:
    save_document(path, 'admin_auth', data)


def load_admin_sessions(path: str) -> dict[str, dict[str, Any]]:
    data = load_document(path, "admin_sessions", {})
    return data if isinstance(data, dict) else {}


def save_admin_sessions(path: str, sessions: dict[str, dict[str, Any]]) -> None:
    safe_sessions = sessions if isinstance(sessions, dict) else {}
    save_document(path, "admin_sessions", safe_sessions)


def verify_admin_password(path: str, password: str | None) -> bool:
    auth = load_admin_auth(path)
    salt = auth.get("salt")
    expected = auth.get("password_hash")
    iterations = int(auth.get("iterations") or 200000)

    if not salt or not expected:
        return False

    dk = hashlib.pbkdf2_hmac(
        "sha256",
        str(password or "").encode("utf-8"),
        str(salt).encode("utf-8"),
        iterations,
    ).hex()

    return hmac.compare_digest(dk, str(expected))


def is_weak_admin_password(password: str | None) -> bool:
    p = str(password or "").strip()
    weak = {
        "",
        "CHANGE_ME",
        "admin",
        "password",
        "12345678",
    }
    return len(p) < 10 or p in weak


def set_admin_password(
    path: str,
    password: str,
    *,
    must_change: bool = False,
    source: str = "manual",
) -> dict[str, Any]:
    data = hash_password(password)
    auth = {
        "salt": data["salt"],
        "password_hash": data["password_hash"],
        "iterations": data["iterations"],
        "must_change": bool(must_change),
        "source": source,
    }
    save_admin_auth(path, auth)
    return auth


def admin_password_change_required(path: str) -> bool:
    auth = load_admin_auth(path)
    return bool(auth.get("must_change"))


def ensure_admin_auth(
    path: str,
    *,
    bootstrap_admin_pass: str,
    allow_default_admin: bool = False,
    admin_reset: bool = False,
) -> None:
    auth = load_admin_auth(path)
    bootstrap_admin_pass = str(bootstrap_admin_pass or "").strip()

    if admin_reset:
        if not bootstrap_admin_pass:
            raise RuntimeError("ADMIN_RESET=1 requires ADMIN_PASS.")
        set_admin_password(
            path,
            bootstrap_admin_pass,
            must_change=is_weak_admin_password(bootstrap_admin_pass),
            source="reset",
        )
        print("[WARN] Admin password reset from environment.")
        return

    if auth.get("password_hash") and auth.get("salt"):
        return

    if bootstrap_admin_pass:
        set_admin_password(
            path,
            bootstrap_admin_pass,
            must_change=is_weak_admin_password(bootstrap_admin_pass),
            source="bootstrap",
        )
        print("[INFO] Admin password initialized from ADMIN_PASS.")
        return

    if allow_default_admin:
        set_admin_password(path, "CHANGE_ME", must_change=True, source="fallback")
        print("[WARN] ADMIN_PASS not set. Using development fallback CHANGE_ME because ALLOW_DEFAULT_ADMIN=1")
        return

    raise RuntimeError("ADMIN_PASS is required. Set ADMIN_PASS, or enable ALLOW_DEFAULT_ADMIN=1 only for local development.")


def prune_admin_sessions(sessions: dict[str, dict[str, Any]], now: int | None = None) -> None:
    now = int(now or now_ts())
    expired = [
        token
        for token, session in sessions.items()
        if int(session.get("expires_at") or 0) <= now
    ]
    for token in expired:
        sessions.pop(token, None)


def create_admin_session(sessions: dict[str, dict[str, Any]], ttl_seconds: int) -> str:
    prune_admin_sessions(sessions)
    token = secrets.token_urlsafe(32)
    now = now_ts()
    sessions[token] = {
        "created_at": now,
        "expires_at": now + int(ttl_seconds),
    }
    return token


def create_persistent_admin_session(path: str, ttl_seconds: int) -> str:
    sessions = load_admin_sessions(path)
    token = create_admin_session(sessions, ttl_seconds)
    save_admin_sessions(path, sessions)
    return token


def verify_admin_session_token(
    sessions: dict[str, dict[str, Any]],
    token: str | None,
) -> bool:
    token = str(token or "").strip()
    if not token:
        return False

    prune_admin_sessions(sessions)
    session = sessions.get(token)
    if not session:
        return False

    if int(session.get("expires_at") or 0) <= now_ts():
        sessions.pop(token, None)
        return False

    return True


def verify_persistent_admin_session_token(path: str, token: str | None) -> bool:
    sessions = load_admin_sessions(path)
    valid = verify_admin_session_token(sessions, token)
    save_admin_sessions(path, sessions)
    return valid


def clear_persistent_admin_session(path: str, token: str | None) -> None:
    sessions = load_admin_sessions(path)
    raw = str(token or "").strip()
    if raw:
        sessions.pop(raw, None)
    save_admin_sessions(path, sessions)


def clear_all_admin_sessions(path: str) -> None:
    save_admin_sessions(path, {})


def admin_cookie_settings(request, ttl_seconds: int) -> dict[str, Any]:
    secure = (request.url.scheme or "").lower() == "https"
    return {
        "httponly": True,
        "samesite": "lax",
        "secure": secure,
        "path": "/",
        "max_age": int(ttl_seconds),
    }


def set_admin_session_cookie(response, request, token: str, ttl_seconds: int) -> None:
    response.set_cookie(
        "saga_admin_session",
        token,
        **admin_cookie_settings(request, ttl_seconds),
    )


def clear_admin_session_cookie(response, request) -> None:
    response.delete_cookie(
        "saga_admin_session",
        path="/",
        secure=(request.url.scheme or "").lower() == "https",
        httponly=True,
        samesite="lax",
    )


def get_admin_password_from_payload(data: Any) -> str:
    if not isinstance(data, dict):
        return ""

    for key in ("password", "admin_password", "admin_pass", "admin_key", "key"):
        value = data.get(key)
        if value:
            return str(value)

    return ""


def legacy_admin_password_payload_enabled() -> bool:
    return (os.getenv("SAGA_ALLOW_LEGACY_ADMIN_PASSWORD_PAYLOAD") or "0").strip() == "1"


def admin_request_authorized(
    request,
    data: Any = None,
    *,
    auth_path: str,
    sessions: dict[str, dict[str, Any]],
) -> bool:
    cookie_token = request.cookies.get("saga_admin_session")
    if verify_admin_session_token(sessions, cookie_token):
        return True

    if not legacy_admin_password_payload_enabled():
        return False

    return verify_admin_password(auth_path, get_admin_password_from_payload(data or {}))


def prune_admin_login_attempts(
    attempts_by_ip: dict[str, dict[str, Any]],
    *,
    window_seconds: int,
    now: float | None = None,
) -> None:
    now = now or time.time()
    stale_keys = []

    for ip, state in attempts_by_ip.items():
        locked_until = float(state.get("locked_until") or 0)
        attempts = [
            ts for ts in state.get("attempts", [])
            if now - ts <= window_seconds
        ]

        if locked_until <= now and not attempts:
            stale_keys.append(ip)
        else:
            state["attempts"] = attempts
            if locked_until <= now:
                state["locked_until"] = 0

    for ip in stale_keys:
        attempts_by_ip.pop(ip, None)


def get_admin_login_state(
    attempts_by_ip: dict[str, dict[str, Any]],
    ip: str,
    *,
    window_seconds: int,
    now: float | None = None,
) -> dict[str, Any]:
    now = now or time.time()
    prune_admin_login_attempts(attempts_by_ip, window_seconds=window_seconds, now=now)

    state = attempts_by_ip.setdefault(ip, {"attempts": [], "locked_until": 0})
    state["attempts"] = [
        ts for ts in state.get("attempts", [])
        if now - ts <= window_seconds
    ]

    if float(state.get("locked_until") or 0) <= now:
        state["locked_until"] = 0

    return state


def clear_admin_login_state(attempts_by_ip: dict[str, dict[str, Any]], ip: str) -> None:
    attempts_by_ip.pop(ip, None)


def register_admin_login_failure(
    attempts_by_ip: dict[str, dict[str, Any]],
    ip: str,
    *,
    max_attempts: int,
    window_seconds: int,
    lock_seconds: int,
    now: float | None = None,
) -> dict[str, Any]:
    now = now or time.time()
    state = get_admin_login_state(
        attempts_by_ip,
        ip,
        window_seconds=window_seconds,
        now=now,
    )
    state["attempts"].append(now)

    if len(state["attempts"]) >= max_attempts:
        state["locked_until"] = now + lock_seconds

    return state


def get_admin_lock_remaining_seconds(
    attempts_by_ip: dict[str, dict[str, Any]],
    ip: str,
    *,
    window_seconds: int,
    now: float | None = None,
) -> int:
    now = now or time.time()
    state = get_admin_login_state(
        attempts_by_ip,
        ip,
        window_seconds=window_seconds,
        now=now,
    )
    locked_until = float(state.get("locked_until") or 0)
    return max(0, int(locked_until - now))
