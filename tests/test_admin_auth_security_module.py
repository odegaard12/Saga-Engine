import time
from types import SimpleNamespace

from backend.app.security import admin_auth


class DummyResponse:
    def __init__(self):
        self.cookies = {}
        self.deleted = []

    def set_cookie(self, key, value, **kwargs):
        self.cookies[key] = {"value": value, **kwargs}

    def delete_cookie(self, key, **kwargs):
        self.deleted.append({"key": key, **kwargs})


class DummyRequest:
    def __init__(self, scheme="https", cookies=None):
        self.url = SimpleNamespace(scheme=scheme)
        self.cookies = cookies or {}


def test_admin_password_hash_verify_and_change_required(tmp_path):
    auth_db = tmp_path / "admin_auth.json"

    admin_auth.set_admin_password(
        str(auth_db),
        "pytest_strong_admin_password",
        must_change=True,
        source="pytest",
    )

    assert admin_auth.verify_admin_password(str(auth_db), "pytest_strong_admin_password") is True
    assert admin_auth.verify_admin_password(str(auth_db), "wrong") is False
    assert admin_auth.admin_password_change_required(str(auth_db)) is True


def test_ensure_admin_auth_bootstraps_from_env_value(tmp_path):
    auth_db = tmp_path / "admin_auth.json"

    admin_auth.ensure_admin_auth(
        str(auth_db),
        bootstrap_admin_pass="pytest_strong_admin_password",
        allow_default_admin=False,
        admin_reset=False,
    )

    assert admin_auth.verify_admin_password(str(auth_db), "pytest_strong_admin_password") is True


def test_admin_session_create_verify_and_cookie_settings():
    sessions = {}
    token = admin_auth.create_admin_session(sessions, ttl_seconds=3600)

    assert admin_auth.verify_admin_session_token(sessions, token) is True

    response = DummyResponse()
    request = DummyRequest(scheme="https")

    admin_auth.set_admin_session_cookie(response, request, token, ttl_seconds=3600)

    cookie = response.cookies["saga_admin_session"]
    assert cookie["value"] == token
    assert cookie["httponly"] is True
    assert cookie["secure"] is True
    assert cookie["samesite"] == "lax"


def test_admin_session_expires():
    sessions = {
        "expired": {
            "created_at": int(time.time()) - 10,
            "expires_at": int(time.time()) - 1,
        }
    }

    assert admin_auth.verify_admin_session_token(sessions, "expired") is False
    assert "expired" not in sessions


def test_legacy_payload_disabled_by_default(monkeypatch, tmp_path):
    auth_db = tmp_path / "admin_auth.json"
    sessions = {}

    admin_auth.set_admin_password(str(auth_db), "pytest_strong_admin_password")
    monkeypatch.delenv("SAGA_ALLOW_LEGACY_ADMIN_PASSWORD_PAYLOAD", raising=False)

    request = DummyRequest(cookies={})

    assert (
        admin_auth.admin_request_authorized(
            request,
            {"password": "pytest_strong_admin_password"},
            auth_path=str(auth_db),
            sessions=sessions,
        )
        is False
    )


def test_legacy_payload_enabled_explicitly(monkeypatch, tmp_path):
    auth_db = tmp_path / "admin_auth.json"
    sessions = {}

    admin_auth.set_admin_password(str(auth_db), "pytest_strong_admin_password")
    monkeypatch.setenv("SAGA_ALLOW_LEGACY_ADMIN_PASSWORD_PAYLOAD", "1")

    request = DummyRequest(cookies={})

    assert (
        admin_auth.admin_request_authorized(
            request,
            {"password": "pytest_strong_admin_password"},
            auth_path=str(auth_db),
            sessions=sessions,
        )
        is True
    )


def test_login_attempt_lockout_flow():
    attempts = {}
    ip = "203.0.113.10"

    admin_auth.register_admin_login_failure(
        attempts,
        ip,
        max_attempts=2,
        window_seconds=600,
        lock_seconds=60,
        now=1000,
    )
    assert admin_auth.get_admin_lock_remaining_seconds(
        attempts,
        ip,
        window_seconds=600,
        now=1000,
    ) == 0

    admin_auth.register_admin_login_failure(
        attempts,
        ip,
        max_attempts=2,
        window_seconds=600,
        lock_seconds=60,
        now=1001,
    )
    assert admin_auth.get_admin_lock_remaining_seconds(
        attempts,
        ip,
        window_seconds=600,
        now=1001,
    ) == 60

    admin_auth.clear_admin_login_state(attempts, ip)
    assert attempts == {}
