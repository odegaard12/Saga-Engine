# -*- coding: utf-8 -*-
"""Caza de fallos del 30/09/2026, S8: fuerza bruta y CPU en los inicios de sesión.

- El bloqueo por intentos fallidos contaba por dirección exacta: quien ataca desde
  IPv6 tiene un /64 entero y cambia de dirección cuando quiere.
- PBKDF2 (200 000 vueltas: décimas de segundo, más en la Raspberry) corría en el
  bucle de eventos: cada intento de login paraba a todos los jugadores.
"""
import asyncio
import os
import tempfile

os.environ.setdefault("ADMIN_PASS", "pytest_admin_password")
os.environ.setdefault("SAGA_DATA_DIR", tempfile.mkdtemp(prefix="saga-test-fuerza-bruta-"))

from fastapi.testclient import TestClient  # noqa: E402

import main  # noqa: E402
from backend.app.security import client_ip  # noqa: E402
from ruta_de_proba import preparar_mision  # noqa: E402


def test_ipv6_se_agrupa_por_su_prefijo_64():
    a = client_ip.lockout_key("2001:db8:1:2:aaaa:bbbb:cccc:dddd")
    b = client_ip.lockout_key("2001:db8:1:2:1111:2222:3333:4444")
    otro = client_ip.lockout_key("2001:db8:1:3:aaaa:bbbb:cccc:dddd")

    assert a == b == "2001:db8:1:2::/64"
    assert otro != a


def test_ipv4_y_lo_que_no_es_una_ip_quedan_como_estaban():
    assert client_ip.lockout_key("203.0.113.9") == "203.0.113.9"
    assert client_ip.lockout_key("unknown") == "unknown"
    assert client_ip.lockout_key("") == ""
    # Una IPv4 «mapeada» en IPv6 cuenta como la IPv4 que es.
    assert client_ip.lockout_key("::ffff:203.0.113.9") == "203.0.113.9"
    assert client_ip.lockout_key("fe80::1%eth0").endswith("/64")


def _clientes_del_mismo_64(monkeypatch):
    direcciones = iter(
        "2001:db8:aa:bb:%x:%x:%x:%x" % (i, i + 1, i + 2, i + 3) for i in range(1, 50)
    )
    monkeypatch.setattr(main, "get_client_ip", lambda request: next(direcciones))


def test_el_login_de_admin_se_bloquea_aunque_el_atacante_cambie_de_direccion_en_su_64(monkeypatch):
    main.ADMIN_LOGIN_ATTEMPTS.clear()
    _clientes_del_mismo_64(monkeypatch)
    monkeypatch.setattr(main, "verify_admin_password", lambda password: False)
    cliente = TestClient(main.app)

    codigos = [
        cliente.post("/api/admin/login", json={"password": "intento-%d" % i}).status_code
        for i in range(main.ADMIN_LOGIN_MAX_ATTEMPTS + 2)
    ]

    assert codigos[: main.ADMIN_LOGIN_MAX_ATTEMPTS] == [401] * main.ADMIN_LOGIN_MAX_ATTEMPTS
    assert codigos[main.ADMIN_LOGIN_MAX_ATTEMPTS :] == [429, 429]
    main.ADMIN_LOGIN_ATTEMPTS.clear()


def test_otro_64_distinto_no_hereda_el_bloqueo(monkeypatch):
    main.ADMIN_LOGIN_ATTEMPTS.clear()
    monkeypatch.setattr(main, "verify_admin_password", lambda password: False)
    cliente = TestClient(main.app)

    monkeypatch.setattr(main, "get_client_ip", lambda request: "2001:db8:aa:bb::1")
    for i in range(main.ADMIN_LOGIN_MAX_ATTEMPTS):
        cliente.post("/api/admin/login", json={"password": "x%d" % i})
    assert cliente.post("/api/admin/login", json={"password": "x"}).status_code == 429

    monkeypatch.setattr(main, "get_client_ip", lambda request: "2001:db8:cc:dd::1")
    assert cliente.post("/api/admin/login", json={"password": "x"}).status_code == 401
    main.ADMIN_LOGIN_ATTEMPTS.clear()


def test_el_pbkdf2_del_login_de_admin_no_corre_en_el_bucle_de_eventos(monkeypatch):
    main.ADMIN_LOGIN_ATTEMPTS.clear()
    en_el_bucle = []

    def verificar(password):
        try:
            asyncio.get_running_loop()
            en_el_bucle.append(True)
        except RuntimeError:
            en_el_bucle.append(False)  # un hilo aparte: sin bucle
        return False

    monkeypatch.setattr(main, "verify_admin_password", verificar)
    TestClient(main.app).post("/api/admin/login", json={"password": "x"})

    assert en_el_bucle == [False]
    main.ADMIN_LOGIN_ATTEMPTS.clear()


def test_el_pbkdf2_de_la_clave_de_mision_tampoco_corre_en_el_bucle(monkeypatch, tmp_path):
    preparar_mision(monkeypatch, tmp_path)
    main.set_mission_password("clave-de-mision-123")
    try:
        en_el_bucle = []
        real = main.check_mission_password

        def comprobar(password):
            try:
                asyncio.get_running_loop()
                en_el_bucle.append(True)
            except RuntimeError:
                en_el_bucle.append(False)
            return real(password)

        monkeypatch.setattr(main, "check_mission_password", comprobar)
        cliente = TestClient(main.app)

        malo = cliente.post("/api/mission/unlock", json={"password": "no"})
        bueno = cliente.post("/api/mission/unlock", json={"password": "clave-de-mision-123"})

        assert malo.status_code == 403 and bueno.status_code == 200
        assert en_el_bucle == [False, False]
    finally:
        main.set_mission_password("")
        main.MISSION_UNLOCK_ATTEMPTS.clear()
