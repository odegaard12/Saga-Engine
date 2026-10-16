# -*- coding: utf-8 -*-
"""Auditoría 15/10/2026, fase 4: robots, noindex, idioma/título, versión, CSP y centro del mapa."""
import os
import tempfile
from pathlib import Path

os.environ.setdefault("ADMIN_PASS", "pytest_admin_password")
os.environ.setdefault("SAGA_DATA_DIR", tempfile.mkdtemp(prefix="saga-test-fase4-"))

from fastapi.testclient import TestClient  # noqa: E402

import main  # noqa: E402
from backend.app import build_frontend  # noqa: E402
from backend.app.routers import public  # noqa: E402

RAIZ = Path(__file__).resolve().parent.parent
c = TestClient(main.app)


def test_robots_y_noindex():
    r = c.get("/robots.txt")
    assert r.status_code == 200 and "Disallow: /" in r.text
    assert r.headers.get("x-robots-tag") == "noindex, nofollow"


def test_csp_sin_eval_y_con_dominios_concretos():
    csp = c.get("/robots.txt").headers["content-security-policy"]
    assert "'unsafe-eval'" not in csp and "'wasm-unsafe-eval'" in csp
    assert "https: " not in csp and "ws:" not in csp
    assert "https://server.arcgisonline.com" in csp and "https://*.basemaps.cartocdn.com" in csp


def test_la_version_exacta_solo_para_los_de_dentro(monkeypatch):
    monkeypatch.setattr(main, "CLAVE_TEMPORAL", "")
    monkeypatch.setattr(main, "mission_unlocked", lambda request: False)
    monkeypatch.setattr(main, "admin_request_authorized", lambda request, data=None: False)
    assert c.get("/api/version", headers={"cf-connecting-ip": "203.0.113.9"}).json() == {"status": "ok"}
    assert "version" in c.get("/api/version").json()  # directa: la Pi y la LAN
    monkeypatch.setattr(main, "mission_unlocked", lambda request: True)
    assert "version" in c.get("/api/version", headers={"cf-connecting-ip": "203.0.113.9"}).json()


def test_idioma_y_titulo_de_la_mision(monkeypatch):
    monkeypatch.setattr(main, "load_config", lambda: {"ui_lang": "gl", "site_name": "SAGA GIA", "admin_title": "O Eco"})
    html = build_frontend._idioma_y_titulo('<html class="x" lang="es"><head><title>SAGA</title></head></html>')
    assert 'lang="gl"' in html and "<title>O Eco · SAGA GIA</title>" in html


def test_centro_del_mapa_desde_los_nodos(monkeypatch):
    monkeypatch.setattr(public._teselas, "caja_de_la_mision", lambda: (42.0, 42.2, -8.8, -8.6))
    assert public._centro_del_mapa({"map_center": [40.4168, -3.7038]}) == [42.1, -8.7]
    assert public._centro_del_mapa({"map_center": [43.0, -8.0]}) == [43.0, -8.0]


def test_index_con_noindex():
    # El zoom de página se queda bloqueado EN EL JUEGO a propósito (30/09: pellizcar es del mapa; el panel sí
    # amplía, ver test_jugadores_zoom_camara_30_09).
    assert 'name="robots" content="noindex, nofollow"' in (RAIZ / "frontend" / "index.html").read_text(encoding="utf-8")
