# -*- coding: utf-8 -*-
"""30/10: la webapp bien integrada (manifiesto, Atrás de Android, sin rebote) y el modo ahorro de batería."""
import json
import os
import tempfile
from pathlib import Path

os.environ.setdefault("ADMIN_PASS", "pytest_admin_password")
os.environ.setdefault("SAGA_DATA_DIR", tempfile.mkdtemp(prefix="saga-test-pwa-"))

from fastapi.testclient import TestClient  # noqa: E402

import main  # noqa: E402

RAIZ = Path(__file__).resolve().parents[1]
FRONT = RAIZ / "frontend"


def test_el_manifiesto_tiene_id_maskable_aparte_y_sin_pantalla_completa():
    m = json.loads((FRONT / "public" / "manifest.webmanifest").read_text(encoding="utf-8"))
    assert m["id"] == "/" and m["display"] == "standalone" and m["orientation"] == "portrait"
    assert all(i.get("purpose") in ("any", "maskable") for i in m["icons"]), "«any maskable» junto recorta el icono"
    assert {"192x192", "512x512"} <= {i["sizes"] for i in m["icons"] if i["purpose"] == "maskable"}
    assert "fullscreen" not in m.get("display_override", []), "a pantalla completa no se ve la hora ni la cobertura"


def test_el_manifiesto_servido_lleva_el_color_del_tema(monkeypatch):
    from backend.app import build_frontend as bf

    monkeypatch.setattr(bf, "tema_de_la_mision", lambda: "theme-ria")
    datos = TestClient(main.app).get("/manifest.webmanifest").json()
    assert datos["theme_color"] == datos["background_color"] == bf.COLOR_DE_BARRA["theme-ria"]


def test_atras_cierra_las_hojas_y_no_hay_rebote():
    app = (FRONT / "src" / "player" / "PlayerApp.tsx").read_text(encoding="utf-8")
    for hoja in ("useAtrasCierra(rankingOpen", "useAtrasCierra(toolsOpen", "useAtrasCierra(activePanel !== null"):
        assert hoja in app
    gancho = (FRONT / "src" / "player" / "hooks" / "useAtrasCierra.ts").read_text(encoding="utf-8")
    assert "pushState" in gancho and "history.back()" in gancho and "pila.pop()?.cerrar()" in gancho
    assert "overscroll-behavior: none" in (FRONT / "src" / "mobile-themes.css").read_text(encoding="utf-8")


def test_modo_ahorro_de_bateria():
    c = (FRONT / "src" / "player" / "components" / "conmutadoresMapa.ts").read_text(encoding="utf-8")
    assert "CONMUTADORES_DE_AHORRO: readonly ConmutadorDelMapa[] = ['pr2', 'sinedificios', 'sinsombra']" in c
    assert "b.level < 0.2" in c and "!b.charging" in c
    mapa = (FRONT / "src" / "player" / "components" / "MapSurfaceGL.tsx").read_text(encoding="utf-8")
    assert "conAhorro(conmutadoresActivos, ahorroActivo(window.localStorage))" in mapa
    assert "CLAVE_AHORRO" in (FRONT / "src" / "player" / "components" / "PlayerHud.tsx").read_text(encoding="utf-8")
