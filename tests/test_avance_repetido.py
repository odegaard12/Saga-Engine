# -*- coding: utf-8 -*-
"""Un avance repetido no salta un nodo.

Con cobertura mala una petición puede tardar más que el corte del móvil: el
móvil la da por perdida y la vuelve a mandar, pero la primera SÍ había llegado.
Sin protección, la segunda avanzaba otro nodo y el jugador se saltaba uno entero
sin enterarse. Medido en la Raspberry antes del arreglo: mandando dos veces el
nodo 1, el jugador acababa en el 3.

El móvil manda ahora desde qué nodo cree que avanza. Si no cuadra, es un eco de
algo ya hecho: se contesta que sí, con el nivel real, y no se toca nada.
"""
import os
import tempfile

os.environ.setdefault("ADMIN_PASS", "pytest_admin_password")
os.environ.setdefault("SAGA_DATA_DIR", tempfile.mkdtemp(prefix="saga-test-eco-"))

from fastapi import FastAPI  # noqa: E402
from fastapi.testclient import TestClient  # noqa: E402

import main  # noqa: E402
from backend.app.routers import game as game_router  # noqa: E402


def _cliente(monkeypatch):
    # El pase de jugador y el límite de peticiones se comprueban aparte.
    monkeypatch.setattr(main, "require_player_session", lambda *a, **k: None)
    monkeypatch.setattr(main, "enforce_player_rate_limit", lambda *a, **k: None)

    app = FastAPI()
    app.include_router(game_router.router)
    return TestClient(app)


def test_un_eco_non_avanza_nodo(monkeypatch):
    cliente = _cliente(monkeypatch)
    main.set_player_progress_level("Eco", 0)
    main.set_player_progress_level("Eco", 3)

    # El móvil reintenta creyendo que sigue en el 2, pero ya está en el 3.
    resposta = cliente.post(
        "/api/advance",
        json={"user": "Eco", "code": "OK", "time_spent_ms": 5000, "level_before": 2},
    )

    assert resposta.status_code == 200
    assert resposta.json().get("duplicate") is True
    assert resposta.json().get("level") == 3
    assert main.get_player_progress_level("Eco", 0) == 3, "el eco no puede mover a nadie"


def test_un_eco_tampouco_anota_tempo(monkeypatch):
    cliente = _cliente(monkeypatch)
    main.set_player_progress_level("Eco2", 0)
    main.set_player_progress_level("Eco2", 2)

    cliente.post(
        "/api/advance",
        json={"user": "Eco2", "code": "OK", "time_spent_ms": 9000, "level_before": 1},
    )

    estado = main.project_live_profile_status(main.get_player_profile("Eco2"))
    assert estado["total_time_ms"] == 0


def test_cando_o_nivel_cadra_non_se_bloquea(monkeypatch):
    cliente = _cliente(monkeypatch)
    main.set_player_progress_level("Eco3", 0)
    main.set_player_progress_level("Eco3", 2)

    resposta = cliente.post(
        "/api/advance",
        json={"user": "Eco3", "code": "OK", "time_spent_ms": 3000, "level_before": 2},
    )

    # No se marca como eco: es un avance legítimo. Que llegue a completarse
    # depende ya del nodo y de su código, que se prueba en otro sitio.
    assert resposta.json().get("duplicate") is not True


def test_un_movil_que_non_manda_o_nivel_non_se_bloquea(monkeypatch):
    cliente = _cliente(monkeypatch)
    main.set_player_progress_level("Eco4", 0)
    main.set_player_progress_level("Eco4", 2)

    resposta = cliente.post("/api/advance", json={"user": "Eco4", "code": "OK"})

    assert resposta.json().get("duplicate") is not True
