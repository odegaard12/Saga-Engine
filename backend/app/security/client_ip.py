"""Trusted proxy and client IP helpers.

Proxy headers are ignored by default. They are only accepted when explicitly
enabled and the direct client is a trusted proxy IP/CIDR.
"""

from __future__ import annotations

import ipaddress
import os
from typing import Any


def split_env_csv(value: Any) -> list[str]:
    return [item.strip() for item in str(value or "").split(",") if item.strip()]


def parse_trusted_proxy_cidrs(value: Any) -> list[ipaddress._BaseNetwork]:
    networks: list[ipaddress._BaseNetwork] = []
    for item in split_env_csv(value):
        try:
            networks.append(ipaddress.ip_network(item, strict=False))
        except ValueError:
            print(f"[WARN] Ignoring invalid TRUSTED_PROXY_CIDRS entry: {item}")
    return networks


TRUST_PROXY_HEADERS = (os.getenv("TRUST_PROXY_HEADERS") or "0").strip() == "1"
TRUSTED_PROXY_IPS = set(split_env_csv(os.getenv("TRUSTED_PROXY_IPS") or ""))
TRUSTED_PROXY_CIDRS = parse_trusted_proxy_cidrs(os.getenv("TRUSTED_PROXY_CIDRS") or "")


def request_client_host(request) -> str:
    client = getattr(request, "client", None)
    if client and getattr(client, "host", None):
        return str(client.host).strip()
    return ""


def ip_in_trusted_proxy_cidrs(ip_text: Any, trusted_proxy_cidrs=None) -> bool:
    networks = TRUSTED_PROXY_CIDRS if trusted_proxy_cidrs is None else trusted_proxy_cidrs
    try:
        parsed = ipaddress.ip_address(str(ip_text or "").strip())
    except ValueError:
        return False
    return any(parsed in network for network in networks)


def is_trusted_proxy_client(host: Any, trusted_proxy_ips=None, trusted_proxy_cidrs=None) -> bool:
    host = str(host or "").strip()
    if not host:
        return False

    trusted_ips = TRUSTED_PROXY_IPS if trusted_proxy_ips is None else trusted_proxy_ips
    if host in trusted_ips:
        return True

    return ip_in_trusted_proxy_cidrs(host, trusted_proxy_cidrs)


def first_forwarded_ip(value: Any) -> str:
    first = str(value or "").split(",")[0].strip()

    try:
        ipaddress.ip_address(first)
    except ValueError:
        return ""

    return first


def get_client_ip(
    request,
    *,
    trust_proxy_headers: bool | None = None,
    trusted_proxy_ips=None,
    trusted_proxy_cidrs=None,
) -> str:
    direct_host = request_client_host(request) or "unknown"
    trust_headers = TRUST_PROXY_HEADERS if trust_proxy_headers is None else bool(trust_proxy_headers)

    if not trust_headers:
        return direct_host

    if not is_trusted_proxy_client(
        direct_host,
        trusted_proxy_ips=trusted_proxy_ips,
        trusted_proxy_cidrs=trusted_proxy_cidrs,
    ):
        return direct_host

    cf_connecting_ip = first_forwarded_ip(getattr(request, "headers", {}).get("cf-connecting-ip"))
    if cf_connecting_ip:
        return cf_connecting_ip

    forwarded = first_forwarded_ip(getattr(request, "headers", {}).get("x-forwarded-for"))
    if forwarded:
        return forwarded

    real_ip = first_forwarded_ip(getattr(request, "headers", {}).get("x-real-ip"))
    if real_ip:
        return real_ip

    return direct_host
