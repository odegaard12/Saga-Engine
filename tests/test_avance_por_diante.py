# -*- coding: utf-8 -*-
"""El móvil que va por delante del servidor no pierde el nodo.

Sin cobertura el móvil completa nodos igual y los deja en su cola. Si al
recuperar la red manda un avance ANTES de vaciar esa cola, el servidor no puede
aplicarlo: no sabe por qué nodo va el jugador.

Antes eso se contestaba con `status: ok` y el nivel del servidor. El móvil sólo
mira `status`, así que lo daba por bueno: el nodo no quedaba anotado en ninguna
parte y a la siguiente lectura el jugador aparecía varios nodos atrás. Eso es
el "lo completé y me mandó a repetirlo" de la prueba de campo, y combinado con
el avance repetido produjo el salto del nodo 5 al 7.

Ir por detrás (un eco) y ir por delante (falta sincronizar) son cosas distintas
y ahora se contestan distinto. Ver tests/test_avance_repetido.py para el eco.
"""
import os
import tempfile

os.environ.setdefault("ADMIN_PASS", "pytest_admin_password")
os.environ.setdefault("SAGA_DATA_DIR", tempfile.mkdtemp(prefix="saga-test-diante-"))

from fastapi import FastAPI  # noqa: E402
from fastapi.testclient import TestClient  # noqa: E402

import main  # noqa: E402
from backend.app.routers import game as game_router  # noqa: E402


def _cliente(monkeypatch):
    monkeypatch.setattr(main, "require_player_session", lambda *a, **k: None)
    monkeypatch.setattr(main, "enforce_player_rate_limit", lambda *a, **k: None)

    app = FastAPI()
    app.include_router(game_router.router)
    return TestClient(app)


def test_o_servidor_di_que_vai_por_detras(monkeypatch):
    cliente = _cliente(monkeypatch)
    main.set_player_progress_level("Diante", 0)
    main.set_player_progress_level("Diante", 2)

    # El móvil hizo los nodos 2 y 3 en modo avión y ahora manda el 4.
    resposta = cliente.post(
        "/api/advance",
        json={"user": "Diante", "code": "OK", "time_spent_ms": 4000, "level_before": 4},
    )

    corpo = resposta.json()
    assert resposta.status_code == 200
    assert corpo["status"] == "behind", "no puede contestar ok: no ha avanzado nada"
    assert corpo["server_level"] == 2
    assert corpo["level_before"] == 4


def test_ir_por_diante_non_move_ao_xogador(monkeypatch):
    cliente = _cliente(monkeypatch)
    main.set_player_progress_level("Diante2", 0)
    main.set_player_progress_level("Diante2", 1)

    cliente.post(
        "/api/advance",
        json={"user": "Diante2", "code": "OK", "time_spent_ms": 4000, "level_before": 5},
    )

    assert main.get_player_progress_level("Diante2", 0) == 1


def test_ir_por_diante_tampouco_anota_tempo(monkeypatch):
    cliente = _cliente(monkeypatch)
    main.set_player_progress_level("Diante3", 0)
    main.set_player_progress_level("Diante3", 1)

    cliente.post(
        "/api/advance",
        json={"user": "Diante3", "code": "OK", "time_spent_ms": 30000, "level_before": 6},
    )

    estado = main.project_live_profile_status(main.get_player_profile("Diante3"))
    assert estado["total_time_ms"] == 0


def test_o_nivel_do_servidor_vai_sempre_na_resposta(monkeypatch):
    """El móvil necesita el número para saber si reconcilia o si el código está mal."""
    cliente = _cliente(monkeypatch)
    main.set_player_progress_level("Diante4", 0)
    main.set_player_progress_level("Diante4", 3)

    por_diante = cliente.post(
        "/api/advance",
        json={"user": "Diante4", "code": "OK", "level_before": 9},
    ).json()
    por_detras = cliente.post(
        "/api/advance",
        json={"user": "Diante4", "code": "OK", "level_before": 1},
    ).json()
    codigo_malo = cliente.post(
        "/api/advance",
        json={"user": "Diante4", "code": "ESTO_NON_VALE", "level_before": 3},
    ).json()

    assert por_diante["level"] == 3
    assert por_detras["level"] == 3
    assert codigo_malo["level"] == 3
    assert codigo_malo["status"] == "fail"
