import ipaddress
from types import SimpleNamespace

import main
from backend.app.security import client_ip as client_ip_security


class Headers(dict):
    def get(self, key, default=None):
        return super().get(str(key).lower(), default)


class FakeRequest:
    def __init__(self, host="203.0.113.10", headers=None):
        self.client = SimpleNamespace(host=host)
        self.headers = Headers()
        for key, value in (headers or {}).items():
            self.headers[str(key).lower()] = value


def test_client_ip_ignores_proxy_headers_by_default(monkeypatch):
    monkeypatch.setattr(main, "TRUST_PROXY_HEADERS", False)
    request = FakeRequest(
        host="10.0.0.10",
        headers={"x-forwarded-for": "198.51.100.99"},
    )

    assert main.get_client_ip(request) == "10.0.0.10"


def test_client_ip_ignores_proxy_headers_from_untrusted_direct_client(monkeypatch):
    monkeypatch.setattr(main, "TRUST_PROXY_HEADERS", True)
    monkeypatch.setattr(main, "TRUSTED_PROXY_IPS", {"10.0.0.1"})
    monkeypatch.setattr(main, "TRUSTED_PROXY_CIDRS", [])

    request = FakeRequest(
        host="10.0.0.99",
        headers={"x-forwarded-for": "198.51.100.99"},
    )

    assert main.get_client_ip(request) == "10.0.0.99"


def test_client_ip_accepts_x_forwarded_for_from_trusted_proxy_ip(monkeypatch):
    monkeypatch.setattr(main, "TRUST_PROXY_HEADERS", True)
    monkeypatch.setattr(main, "TRUSTED_PROXY_IPS", {"10.0.0.1"})
    monkeypatch.setattr(main, "TRUSTED_PROXY_CIDRS", [])

    request = FakeRequest(
        host="10.0.0.1",
        headers={"x-forwarded-for": "198.51.100.99, 10.0.0.1"},
    )

    assert main.get_client_ip(request) == "198.51.100.99"


def test_client_ip_prefers_cloudflare_header_from_trusted_proxy(monkeypatch):
    monkeypatch.setattr(main, "TRUST_PROXY_HEADERS", True)
    monkeypatch.setattr(main, "TRUSTED_PROXY_IPS", {"10.0.0.1"})
    monkeypatch.setattr(main, "TRUSTED_PROXY_CIDRS", [])

    request = FakeRequest(
        host="10.0.0.1",
        headers={
            "cf-connecting-ip": "198.51.100.77",
            "x-forwarded-for": "198.51.100.99",
        },
    )

    assert main.get_client_ip(request) == "198.51.100.77"


def test_client_ip_accepts_proxy_cidr(monkeypatch):
    monkeypatch.setattr(main, "TRUST_PROXY_HEADERS", True)
    monkeypatch.setattr(main, "TRUSTED_PROXY_IPS", set())
    monkeypatch.setattr(main, "TRUSTED_PROXY_CIDRS", [ipaddress.ip_network("10.0.0.0/24")])

    request = FakeRequest(
        host="10.0.0.50",
        headers={"x-real-ip": "198.51.100.50"},
    )

    assert main.get_client_ip(request) == "198.51.100.50"


def test_first_forwarded_ip_rejects_invalid_values():
    assert client_ip_security.first_forwarded_ip("not-an-ip, 198.51.100.1") == ""
    assert client_ip_security.first_forwarded_ip("198.51.100.1, 10.0.0.1") == "198.51.100.1"
