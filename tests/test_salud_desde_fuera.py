# -*- coding: utf-8 -*-
"""24/10/2026: /api/salud es pública (la usan Docker, keepalived y la vigilancia),
pero desde internet sólo debe decir si está bien o mal: nada de versión, disco ni mapa."""
from fastapi.testclient import TestClient

import main


def test_desde_internet_solo_dice_el_estado():
    cliente = TestClient(main.app)
    r = cliente.get("/api/salud", headers={"CF-Connecting-IP": "203.0.113.7"})
    assert r.status_code in (200, 503)
    assert set(r.json()) == {"estado"}, r.json()


def test_desde_dentro_trae_el_detalle():
    cliente = TestClient(main.app)
    r = cliente.get("/api/salud")
    cuerpo = r.json()
    assert "version" in cuerpo and "disco" in cuerpo and "base_de_datos" in cuerpo


def test_una_ip_publica_sin_cabecera_de_cloudflare_tambien_es_de_fuera():
    from backend.app.routers import integraciones
    from starlette.requests import Request

    def peticion(host, cabeceras=()):
        return Request({"type": "http", "headers": list(cabeceras), "client": (host, 1234)})

    assert integraciones._peticion_de_dentro(peticion("127.0.0.1"))
    assert integraciones._peticion_de_dentro(peticion("172.17.0.1"))
    assert integraciones._peticion_de_dentro(peticion("192.168.1.20"))
    assert not integraciones._peticion_de_dentro(peticion("8.8.8.8"))
    assert not integraciones._peticion_de_dentro(peticion("172.17.0.1", [(b"cf-connecting-ip", b"203.0.113.7")]))
