# -*- coding: utf-8 -*-
"""El selector enseña, sólo como información, cuántos jugadores llevan ya cada personaje.

`GET /api/personaje/{user}` añade `en_uso` (`{"Ch01": 2}`): un recuento de LOS DEMÁS, sin ids ni
nombres, que no bloquea la elección (lo que bloquea es la configuración entera, ver
test_avatares_mixamo.py).
"""
import json
import os
import tempfile

os.environ.setdefault("ADMIN_PASS", "pytest_admin_password")
os.environ.setdefault("SAGA_DATA_DIR", tempfile.mkdtemp(prefix="saga-test-en-uso-"))

from fastapi import FastAPI  # noqa: E402
from fastapi.testclient import TestClient  # noqa: E402

import main  # noqa: E402
from backend.app.routers import game as game_router  # noqa: E402
from backend.app.runtime import personajes as pj  # noqa: E402


def _cfg(mx="Ch01", **kw):
    base = {"mx": mx, "top": 0, "pants": 10, "hair": 4}
    base.update(kw)
    return {"character": "peregrino", "parts": base}


def test_la_cuenta_no_incluye_al_propio_jugador_ni_los_personajes_sin_nadie():
    configs = {"Ana": _cfg("Ch01"), "Bea": _cfg("Ch01", top=3), "Cris": _cfg("Ch22")}
    assert pj.cuenta_por_personaje(configs, "Ana") == {"Ch01": 1, "Ch22": 1}
    assert pj.cuenta_por_personaje(configs, "Zoe") == {"Ch01": 2, "Ch22": 1}
    assert pj.cuenta_por_personaje({}, "Ana") == {}


def test_un_jugador_de_la_version_2d_cuenta_en_su_personaje_3d():
    # «vikingo» a secas (sin parts) es el Ch31 con los colores de serie.
    configs = {"Ana": {"character": "vikingo"}, "Bea": _cfg("Ch31", top=2)}
    assert pj.cuenta_por_personaje(configs, "Cris") == {"Ch31": 2}


def test_la_api_devuelve_el_recuento_sin_ids_ni_nombres(monkeypatch, tmp_path):
    monkeypatch.setattr(main, "require_player_session", lambda *a, **k: None)
    monkeypatch.setattr(main, "PERSONAJES_DB", str(tmp_path / "personajes.json"))
    monkeypatch.setattr(main, "resolve_known_player_profile",
                        lambda u: {"id": str(u)} if u in ("Ana", "Bea", "Cris") else None)
    app = FastAPI()
    app.include_router(game_router.router)
    c = TestClient(app)
    for quien, cfg in (("Ana", _cfg("Ch01")), ("Bea", _cfg("Ch01", top=5))):
        assert c.post("/api/personaje", json={"user": quien, "character": cfg["character"], "avatar": cfg}).status_code == 200

    estado = c.get("/api/personaje/Cris").json()
    assert estado["en_uso"] == {"Ch01": 2}
    # Sólo números: ni ids ni nombres de jugadores en ninguna parte de la respuesta.
    for nombre in ("Ana", "Bea"):
        assert nombre not in json.dumps(estado)

    # Quien ya lleva uno no se cuenta a sí mismo.
    assert c.get("/api/personaje/Ana").json()["en_uso"] == {"Ch01": 1}

    # Informativo: elegir un personaje que ya lleva otro NO se bloquea (distinto aspecto).
    libre = _cfg("Ch01", top=9)
    assert c.post("/api/personaje", json={"user": "Cris", "character": libre["character"], "avatar": libre}).status_code == 200
    assert c.get("/api/personaje/Cris").json()["en_uso"] == {"Ch01": 2}
