# -*- coding: utf-8 -*-
"""El latido trae de vuelta la tabla de equipo.

El jugador mandaba «aquí estoy yo» y acto seguido preguntaba «¿dónde están los
demás?», los dos cada 5 segundos. Es la misma conversación partida en dos, y
sumaba 1 440 peticiones por hora y por móvil: tres cuartas partes de todo lo que
recibía la Raspberry, que con trece jugadores eran casi 7 peticiones por segundo
sostenidas durante tres horas.

Al devolver la tabla en el propio latido, el móvil deja de pedirla aparte.
"""
import os
import tempfile

os.environ.setdefault("ADMIN_PASS", "pytest_admin_password")
os.environ.setdefault("SAGA_DATA_DIR", tempfile.mkdtemp(prefix="saga-test-latido-"))

from fastapi import FastAPI  # noqa: E402
from fastapi.testclient import TestClient  # noqa: E402

import main  # noqa: E402
from backend.app.routers import game as game_router  # noqa: E402


def _cliente(monkeypatch):
    monkeypatch.setattr(main, "require_player_session", lambda *a, **k: None)
    monkeypatch.setattr(main, "enforce_player_rate_limit", lambda *a, **k: None)
    # El limitador de latidos es por tiempo real y aquí se mandan seguidos.
    main.HEARTBEAT_LAST_SEEN_BY_KEY.clear()

    app = FastAPI()
    app.include_router(game_router.router)
    return TestClient(app)


def _un_jugador():
    perfiles = main.get_player_profiles(main.load_config())
    assert perfiles, "la misión de pruebas necesita al menos un jugador"
    return perfiles[0].get("id")


def test_o_latido_devolve_o_equipo_cando_se_pide(monkeypatch):
    cliente = _cliente(monkeypatch)
    user = _un_jugador()

    resposta = cliente.post(
        "/api/heartbeat",
        json={"user": user, "lat": 42.4, "lon": -8.6, "gps_status": "ok", "equipo": True},
    )

    corpo = resposta.json()
    assert resposta.status_code == 200
    assert corpo["status"] == "ok"
    assert "team" in corpo, "sin esto el móvil tiene que volver a pedirla aparte"
    assert isinstance(corpo["team"]["profiles"], list)
    assert corpo["team"]["profiles"], "la tabla no puede llegar vacía"


def test_o_latido_de_sempre_segue_igual(monkeypatch):
    """Un cliente viejo no puede empezar a recibir 6 KB de más en cada latido."""
    cliente = _cliente(monkeypatch)
    user = _un_jugador()

    corpo = cliente.post(
        "/api/heartbeat",
        json={"user": user, "lat": 42.4, "lon": -8.6, "gps_status": "ok"},
    ).json()

    assert corpo["status"] == "ok"
    assert "live_status" in corpo
    assert "team" not in corpo


def test_a_tabla_do_latido_e_a_mesma_que_a_do_endpoint(monkeypatch):
    """Si divergen, el mapa del grupo enseñaría cosas distintas según de dónde venga."""
    cliente = _cliente(monkeypatch)
    user = _un_jugador()

    do_latido = cliente.post(
        "/api/heartbeat",
        json={"user": user, "lat": 42.4, "lon": -8.6, "gps_status": "ok", "equipo": True},
    ).json()["team"]

    do_endpoint = cliente.get("/api/team/%s" % user).json()

    assert [p["user"] for p in do_latido["profiles"]] == [
        p["user"] for p in do_endpoint["profiles"]
    ]
    assert do_latido["total_nodes"] == do_endpoint["total_nodes"]


def test_as_fotos_non_viaxan_no_latido(monkeypatch):
    """Van por /api/player-avatar, que se cachea. Aquí serían 6 KB cada 5 s."""
    cliente = _cliente(monkeypatch)
    user = _un_jugador()

    corpo = cliente.post(
        "/api/heartbeat",
        json={"user": user, "lat": 42.4, "lon": -8.6, "gps_status": "ok", "equipo": True},
    ).json()

    for perfil in corpo["team"]["profiles"]:
        assert not str(perfil.get("avatar_url") or "").startswith("data:")
