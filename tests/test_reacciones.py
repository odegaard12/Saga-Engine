# -*- coding: utf-8 -*-
"""Gestos y mensajes rápidos que ven los demás (5.59, `POST /api/reaccion`).

Sólo claves de catálogo (nada de texto libre: hay menores), una cada 1,5 s como mucho, y viajan en la tabla del
equipo del latido mientras son recientes. En el móvil: una fila de gestos y otra de mensajes, y bocadillos.
"""
import os
import tempfile
from pathlib import Path

os.environ.setdefault("ADMIN_PASS", "pytest_admin_password")
os.environ.setdefault("SAGA_DATA_DIR", tempfile.mkdtemp(prefix="saga-test-reacciones-"))

from fastapi import FastAPI  # noqa: E402
from fastapi.testclient import TestClient  # noqa: E402

import main  # noqa: E402
from backend.app.routers import game as game_router  # noqa: E402
from backend.app.runtime import live_positions as lp  # noqa: E402

FRONT = Path(__file__).resolve().parent.parent / "frontend" / "src"
GESTOS = ("ge__salute",)


def test_solo_claves_del_catalogo_y_con_freno():
    lp.REACCIONES.clear()
    assert lp.anotar_reaccion("a", None, "insulto libre", 100.0, GESTOS) is None
    assert lp.anotar_reaccion("a", "ge__bailar", None, 100.0, GESTOS) is None
    assert lp.anotar_reaccion("a", None, None, 100.0, GESTOS) is None
    r = lp.anotar_reaccion("a", "ge__salute", "hola", 100.0, GESTOS)
    assert r and r["gesto"] == "ge__salute" and r["mensaje"] == "hola"
    assert lp.anotar_reaccion("a", None, "vamos", 100.5, GESTOS) is None, "demasiado seguida"
    otra = lp.anotar_reaccion("a", None, "vamos", 102.0, GESTOS)
    assert otra and otra["id"] != r["id"]


def test_caduca_y_no_se_reenvia_para_siempre():
    lp.REACCIONES.clear()
    lp.anotar_reaccion("b", None, "aqui", 1000.0, GESTOS)
    assert lp.reaccion_vigente("b", 1010.0)["mensaje"] == "aqui"
    assert lp.reaccion_vigente("b", 1000.0 + lp.REACCION_VIGENTE_SECONDS + 1) is None
    assert lp.reaccion_vigente("nadie", 1000.0) is None


def test_el_endpoint_y_la_tabla_del_equipo(monkeypatch):
    lp.REACCIONES.clear()
    monkeypatch.setattr(main, "require_player_session", lambda *a, **k: None)
    monkeypatch.setattr(main, "exigir_ser_del_grupo", lambda *a, **k: None)
    monkeypatch.setattr(main, "enforce_player_rate_limit", lambda *a, **k: None)
    main.HEARTBEAT_LAST_SEEN_BY_KEY.clear()
    app = FastAPI()
    app.include_router(game_router.router)
    cliente = TestClient(app)
    user = main.get_player_profiles(main.load_config())[0].get("id")

    assert cliente.post("/api/reaccion", json={"user": user, "mensaje": "<b>hola</b>"}).status_code == 400
    assert cliente.post("/api/reaccion", json={"user": user, "mensaje": "hola", "gesto": "ge__salute"}).status_code == 200

    tabla = cliente.post("/api/heartbeat", json={"user": user, "gps_status": "ok", "equipo": True}).json()["team"]
    mio = next(p for p in tabla["profiles"] if p.get("user") == user)
    assert mio["reaccion"]["mensaje"] == "hola" and mio["reaccion"]["gesto"] == "ge__salute"


def test_el_catalogo_del_movil_es_el_del_servidor():
    import re

    fuente = (FRONT / "player" / "avatares3d" / "mixamo" / "reacciones.ts").read_text(encoding="utf-8")
    ids = tuple(re.findall(r"\{ id: '(\w+)', icono:", fuente))
    assert ids == lp.MENSAJES_RAPIDOS
    menu = (FRONT / "player" / "avatares3d" / "mixamo" / "MenuDeGestos.tsx").read_text(encoding="utf-8")
    assert "MENSAJES_RAPIDOS.map(" in menu and "alMensaje(m.id)" in menu
    mapa = (FRONT / "player" / "components" / "MapSurfaceGL.tsx").read_text(encoding="utf-8")
    assert "reaccionesVistasRef.current.has(r.id)" in mapa, "cada reacción de otro se pinta una sola vez"
    assert "enviarReaccion({ user: usuarioYo, gesto: GESTO_SALUDAR, mensaje: 'hola' })" in mapa
