import os
import tempfile
from pathlib import Path

os.environ.setdefault("ADMIN_PASS", "pytest_admin_password")
os.environ.setdefault("SAGA_DATA_DIR", tempfile.mkdtemp(prefix="saga-test-data-"))

from fastapi.testclient import TestClient  # noqa: E402

import main  # noqa: E402
from backend.app.security import admin_auth as admin_auth_security  # noqa: E402


class DummyRequest:
    def __init__(self, cookies=None):
        self.cookies = cookies or {}


def reset_admin_test_state():
    main.clear_admin_sessions()
    main.ADMIN_LOGIN_ATTEMPTS.clear()


def test_admin_cookie_session_still_authorizes_when_legacy_payload_disabled(monkeypatch):
    reset_admin_test_state()
    monkeypatch.delenv("SAGA_ALLOW_LEGACY_ADMIN_PASSWORD_PAYLOAD", raising=False)

    token = main.create_admin_session()
    request = DummyRequest(cookies={main.ADMIN_SESSION_COOKIE: token})

    assert main.admin_request_authorized(request, {}) is True


def test_legacy_admin_password_payload_is_rejected_by_default(monkeypatch):
    reset_admin_test_state()
    monkeypatch.delenv("SAGA_ALLOW_LEGACY_ADMIN_PASSWORD_PAYLOAD", raising=False)
    monkeypatch.setattr(admin_auth_security, "verify_admin_password", lambda auth_path, password: password == "pytest_strong_admin_password")

    request = DummyRequest()

    assert (
        main.admin_request_authorized(
            request,
            {"password": "pytest_strong_admin_password"},
        )
        is False
    )


def test_legacy_admin_password_payload_can_be_enabled_explicitly(monkeypatch):
    reset_admin_test_state()
    monkeypatch.setenv("SAGA_ALLOW_LEGACY_ADMIN_PASSWORD_PAYLOAD", "1")
    monkeypatch.setattr(admin_auth_security, "verify_admin_password", lambda auth_path, password: password == "pytest_strong_admin_password")

    request = DummyRequest()

    assert (
        main.admin_request_authorized(
            request,
            {"password": "pytest_strong_admin_password"},
        )
        is True
    )


def test_legacy_admin_password_payload_flag_does_not_accept_wrong_password(monkeypatch):
    reset_admin_test_state()
    monkeypatch.setenv("SAGA_ALLOW_LEGACY_ADMIN_PASSWORD_PAYLOAD", "1")
    monkeypatch.setattr(admin_auth_security, "verify_admin_password", lambda auth_path, password: password == "pytest_strong_admin_password")

    request = DummyRequest()

    assert (
        main.admin_request_authorized(
            request,
            {"password": "wrong-password"},
        )
        is False
    )


def test_admin_login_wrong_password_returns_401_without_unbound_response(monkeypatch):
    reset_admin_test_state()
    monkeypatch.setattr(main, "verify_admin_password", lambda password: False)

    client = TestClient(main.app)
    response = client.post("/api/admin/login", json={"password": "wrong-password"})

    assert response.status_code == 401
