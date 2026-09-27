# -*- coding: utf-8 -*-
"""Un `time_spent_ms` que no es un número no puede tirar el servidor abajo.

`penalty_ms` y `level_before` ya venían protegidos con un `try/except` porque
son datos que manda el móvil sin ninguna garantía de forma -cliente viejo,
IndexedDB a medias, un bug en el propio móvil-. `time_spent_ms` se quedó fuera
de esa protección en dos sitios que hacen `int(time_spent_ms)` a pelo:

  - `/api/advance` (backend/app/routers/game.py): un valor no numérico tiraba
    la petición entera con un 500 en vez de avanzar el nodo, que es lo único
    que de verdad importa.
  - `apply_synced_player_event` (main.py), que es a donde llega cada evento de
    `/api/events/sync`: como el bucle de `sync_player_events` no atrapa nada
    por evento, UN SOLO evento corrupto de la cola offline tiraba abajo la
    sincronización de TODA la tanda -hasta 100 eventos-, incluidos los que
    estaban perfectamente bien.

`sanitize_event_payload` (backend/app/runtime/player_events.py) deja pasar
cualquier string como valor de payload sin comprobar que sea un número, así
que este payload es exactamente lo que puede llegar desde un móvil real.
"""
import os
import tempfile

os.environ.setdefault("ADMIN_PASS", "pytest_admin_password")
os.environ.setdefault("SAGA_DATA_DIR", tempfile.mkdtemp(prefix="saga-test-tempo-"))

from fastapi import FastAPI  # noqa: E402
from fastapi.testclient import TestClient  # noqa: E402

import main  # noqa: E402
from backend.app.routers import game as game_router  # noqa: E402


FAKE_STAGE = {"id": "node-1", "title": "Node 1", "answer": "OK"}


def _cliente(monkeypatch):
    monkeypatch.setattr(main, "require_player_session", lambda *a, **k: None)
    monkeypatch.setattr(main, "enforce_player_rate_limit", lambda *a, **k: None)

    # Un solo nodo activo que acepta "OK", para no depender de un stages.json
    # real: lo que se prueba aquí es el `time_spent_ms`, no la mecánica de nodos.
    monkeypatch.setattr(main, "get_runtime_stages", lambda: [FAKE_STAGE])
    monkeypatch.setattr(main, "stage_accepts_code", lambda stage, code, manual=False: code == "OK")
    monkeypatch.setattr(
        main,
        "evaluate_stage_item_requirement",
        lambda stage, profile_id: {"ok": True, "required": False, "consume": False},
    )
    # /api/events/sync exige un perfil CONOCIDO (resolve_known_player_profile
    # mira la config de jugadores reales). No depender de qué perfiles trae la
    # config por defecto -eso varía según qué otro test se haya ejecutado antes
    # y haya fijado ya SAGA_DATA_DIR en este mismo proceso.
    monkeypatch.setattr(
        main, "resolve_known_player_profile", lambda user, cfg=None: {"id": user}
    )

    app = FastAPI()
    app.include_router(game_router.router)
    return TestClient(app)


def test_avance_con_tempo_corrupto_non_peta(monkeypatch):
    cliente = _cliente(monkeypatch)
    main.set_player_progress_level("Tempo1", 0)

    resposta = cliente.post(
        "/api/advance",
        json={"user": "Tempo1", "code": "OK", "time_spent_ms": "non-e-un-numero"},
    )

    assert resposta.status_code == 200, "un dato corrupto no puede devolver un 500"
    assert resposta.json().get("status") == "ok", "el nodo tiene que avanzar igual"


def test_sync_con_tempo_corrupto_non_bloquea_a_tanda(monkeypatch):
    """El evento malo se guarda como corrupto, pero no impide sincronizar el resto."""
    cliente = _cliente(monkeypatch)
    main.set_player_progress_level("Tempo2", 0)

    resposta = cliente.post(
        "/api/events/sync",
        json={
            "user": "Tempo2",
            "events": [
                {
                    "type": "node_completed",
                    "payload": {"code": "OK", "time_spent_ms": "non-e-un-numero"},
                },
            ],
        },
    )

    assert resposta.status_code == 200, "un evento corrupto no puede tirar toda la tanda"
    corpo = resposta.json()
    assert corpo["accepted"] == 1
    # El nodo se aplica igual: lo único que se descarta es el tiempo corrupto.
    assert main.get_player_progress_level("Tempo2", 0) == 1
