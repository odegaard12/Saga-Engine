import json
import os
import sys
import tempfile
from pathlib import Path
from types import SimpleNamespace

os.environ.setdefault("ADMIN_PASS", "pytest_admin_password")
os.environ.setdefault("SAGA_DATA_DIR", tempfile.mkdtemp(prefix="saga-test-data-"))

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from fastapi.testclient import TestClient  # noqa: E402

import main  # noqa: E402


def make_client():
    return TestClient(main.app)


def test_admin_login_sets_http_only_session_cookie():
    client = make_client()

    response = client.post(
        "/api/admin/login",
        json={"password": "pytest_admin_password"},
    )

    assert response.status_code == 200
    assert response.json()["status"] == "ok"

    cookie_header = response.headers.get("set-cookie", "")
    assert main.ADMIN_SESSION_COOKIE in cookie_header
    assert "HttpOnly" in cookie_header
    assert "SameSite=lax" in cookie_header or "SameSite=Lax" in cookie_header


def test_admin_react_overview_accepts_session_cookie_without_password():
    client = make_client()

    login = client.post(
        "/api/admin/login",
        json={"password": "pytest_admin_password"},
    )
    assert login.status_code == 200

    response = client.post("/api/admin/react-overview", json={})

    assert response.status_code == 200
    assert response.json()["status"] == "ok"


def test_admin_reset_rejects_unauthenticated_mutation():
    client = make_client()

    main.set_player_progress_level("PLAYER 1", 4)

    response = client.post("/api/reset", json={"user": "PLAYER 1"})

    assert response.status_code == 403

    assert main.get_player_progress_level("PLAYER 1", 0) == 4


def test_admin_reset_accepts_session_cookie():
    client = make_client()

    main.set_player_progress_level("PLAYER 1", 4)

    login = client.post(
        "/api/admin/login",
        json={"password": "pytest_admin_password"},
    )
    assert login.status_code == 200

    response = client.post("/api/reset", json={"user": "PLAYER 1"})

    assert response.status_code == 200
    assert response.json()["status"] == "ok"

    assert main.get_player_progress_level("PLAYER 1", 0) == 0


def test_player_payload_does_not_expose_answer_or_rune_secrets():
    client = make_client()

    main.save_json(
        main.STAGES_DB,
        [
            {
                "id": 0,
                "title": "Secret node",
                "lat": 42.0,
                "lon": -8.0,
                "radius": 50,
                "type": "signal_hunt",
                "content": "Find the hidden signal.",
                "config": {
                    "objective": "proximity_lock",
                    "source_radius_m": 75,
                    "lock_threshold": 65,
                    "hold_ms": 1500,
                },
                "answer": "SECRET_ANSWER_SHOULD_NOT_LEAK",
                "rune": "SECRET_RUNE_SHOULD_NOT_LEAK",
            }
        ],
    )
    main.save_json(main.GAME_DB, {"PLAYER 1": 0})

    response = client.get("/api/game/PLAYER%201")

    assert response.status_code == 200

    payload_text = json.dumps(response.json(), sort_keys=True)
    assert "SECRET_ANSWER_SHOULD_NOT_LEAK" not in payload_text
    assert "SECRET_RUNE_SHOULD_NOT_LEAK" not in payload_text
    assert '"answer"' not in payload_text
    assert '"rune"' not in payload_text


def test_admin_save_requires_authentication():
    client = make_client()

    response = client.post("/api/admin/save", json={"stages": []})

    assert response.status_code == 403


def test_json_save_uses_atomic_replace_and_leaves_valid_json():
    target = Path(os.environ["SAGA_DATA_DIR"]) / "atomic-test.json"
    payload = {"status": "ok", "items": [1, 2, 3]}

    main.save_json(str(target), payload)

    assert target.exists()
    assert main.load_json(str(target), {}) == payload
    assert not list(target.parent.glob(".atomic-test.json.*.tmp"))


def make_fake_request(headers=None, host="10.0.0.10"):
    return SimpleNamespace(
        headers=headers or {},
        client=SimpleNamespace(host=host),
    )


def test_client_ip_ignores_forwarded_headers_by_default(monkeypatch):
    monkeypatch.setattr(main, "TRUST_PROXY_HEADERS", False)

    request = make_fake_request(
        headers={
            "x-forwarded-for": "203.0.113.10",
            "cf-connecting-ip": "203.0.113.11",
        },
        host="10.0.0.10",
    )

    assert main.get_client_ip(request) == "10.0.0.10"


def test_client_ip_accepts_forwarded_headers_only_from_trusted_proxy(monkeypatch):
    monkeypatch.setattr(main, "TRUST_PROXY_HEADERS", True)
    monkeypatch.setattr(main, "TRUSTED_PROXY_IPS", {"10.0.0.10"})
    monkeypatch.setattr(main, "TRUSTED_PROXY_CIDRS", [])

    request = make_fake_request(
        headers={"x-forwarded-for": "203.0.113.10, 198.51.100.20"},
        host="10.0.0.10",
    )

    assert main.get_client_ip(request) == "203.0.113.10"


def test_client_ip_rejects_forwarded_headers_from_untrusted_client(monkeypatch):
    monkeypatch.setattr(main, "TRUST_PROXY_HEADERS", True)
    monkeypatch.setattr(main, "TRUSTED_PROXY_IPS", {"10.0.0.99"})
    monkeypatch.setattr(main, "TRUSTED_PROXY_CIDRS", [])

    request = make_fake_request(
        headers={"x-forwarded-for": "203.0.113.10"},
        host="10.0.0.10",
    )

    assert main.get_client_ip(request) == "10.0.0.10"


def test_client_ip_rejects_invalid_forwarded_header(monkeypatch):
    monkeypatch.setattr(main, "TRUST_PROXY_HEADERS", True)
    monkeypatch.setattr(main, "TRUSTED_PROXY_IPS", {"10.0.0.10"})
    monkeypatch.setattr(main, "TRUSTED_PROXY_CIDRS", [])

    request = make_fake_request(
        headers={"x-forwarded-for": "not-an-ip"},
        host="10.0.0.10",
    )

    assert main.get_client_ip(request) == "10.0.0.10"
