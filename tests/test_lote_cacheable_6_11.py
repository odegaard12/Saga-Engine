# -*- coding: utf-8 -*-
"""6/11: el lote de teselas por GET versionado, para que Cloudflare lo guarde en el punto de encuentro.

Por POST ningún intermediario puede guardarlo, y con 15 móviles a la vez cada uno se bajaba los ~90 MB de teselas de
la Pi. Por GET, con la versión del plan en la URL, la respuesta es la misma para todos: completa va inmutable; con un
hueco de verdad, sin caché (Cloudflare no puede quedarse con un lote roto para siempre).
"""
import os
import tempfile

os.environ.setdefault("ADMIN_PASS", "pytest_admin_password")
os.environ.setdefault("SAGA_DATA_DIR", tempfile.mkdtemp(prefix="saga-test-lote-"))

import pytest  # noqa: E402
from fastapi.testclient import TestClient  # noqa: E402

import main  # noqa: E402
from backend.app.routers import public  # noqa: E402

RUTAS = ["/map-tiles/15/100/200.png", "/map-tiles/15/101/200.png", "/dem-tiles/12/50/60.png?v=abc"]


@pytest.fixture()
def cliente(monkeypatch):
    monkeypatch.setattr(main, "enforce_player_rate_limit", lambda *a, **k: None)
    monkeypatch.setattr(public._teselas, "caja_de_la_mision", lambda: None)
    monkeypatch.setattr(public._teselas, "tesela_permitida", lambda z, x, y, caja: True)
    fallan = set()

    async def falsa(cliente, tipo, z, x, y):
        return None if (z, x, y) in fallan else (b"PNG%d" % x, "image/png")

    monkeypatch.setattr(public, "_tesela_para_lote", falsa)
    return TestClient(main.app), fallan


def test_el_lote_completo_por_get_va_inmutable(cliente):
    c, _ = cliente
    r = c.get("/api/teselas/lote/p1abc", params={"t": ",".join(RUTAS)})
    assert r.status_code == 200 and r.content.startswith(b"SAGT")
    assert r.headers["cache-control"] == "public, max-age=31536000, immutable"
    assert "no-store" not in r.headers.get("cdn-cache-control", "")


def test_un_lote_con_huecos_no_se_guarda(cliente):
    c, fallan = cliente
    fallan.add((15, 101, 200))
    r = c.get("/api/teselas/lote/p1abc", params={"t": ",".join(RUTAS)})
    assert r.status_code == 200 and r.headers["cache-control"] == "no-store"


def test_la_version_se_valida_y_el_post_sigue_igual(cliente):
    c, _ = cliente
    assert c.get("/api/teselas/lote/mal.version!", params={"t": RUTAS[0]}).status_code in (400, 404)
    r = c.post("/api/teselas/lote", json={"teselas": RUTAS})
    assert r.status_code == 200 and r.headers["cache-control"] == "no-store"
