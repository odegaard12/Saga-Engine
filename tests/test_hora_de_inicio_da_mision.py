# -*- coding: utf-8 -*-
"""Descargar la misión y pedir permisos con días de antelación, pero no
completar nodos hasta la fecha y hora que diga el organizador
(`mission_launch_at` en la configuración). Pedido explícitamente: "pone
pantalla para que la gente descargue la app unos días antes y tenga todo
bajado pero no se inicie hasta el día/hora que diga yo".

La descarga en sí (FieldPrepPanel, `saveMissionPack`) no toca nada de esto:
sigue funcionando siempre, esté la misión bloqueada o no. Lo único que se
bloquea es COMPLETAR un nodo, por los dos caminos que existen para avanzar:
`/api/advance` (con cobertura) y `node_completed` en `/api/events/sync` (la
cola offline).

Se compara contra la hora del SERVIDOR (`server_time_ms` en /api/config), no
la del móvil.
"""
import os
import tempfile
from datetime import datetime, timedelta, timezone
from pathlib import Path

# Antes de importar main: al importarse carga la configuracion y exige
# ADMIN_PASS, y sin esto iria a la base de datos real del despliegue.
os.environ.setdefault("ADMIN_PASS", "pytest_admin_password")
os.environ.setdefault("SAGA_DATA_DIR", tempfile.mkdtemp(prefix="saga-test-inicio-"))

from fastapi.testclient import TestClient  # noqa: E402

from backend.app.runtime.mission_schedule import mission_is_locked, parse_launch_at  # noqa: E402


# ---------------------------------------------------------------------------
# El módulo puro
# ---------------------------------------------------------------------------

def test_sen_fecha_non_hai_bloqueo():
    assert mission_is_locked("") is False
    assert mission_is_locked(None) is False


def test_fecha_no_futuro_bloquea():
    futuro = (datetime.now(timezone.utc) + timedelta(days=2)).isoformat()
    assert mission_is_locked(futuro) is True


def test_fecha_no_pasado_non_bloquea():
    pasado = (datetime.now(timezone.utc) - timedelta(days=2)).isoformat()
    assert mission_is_locked(pasado) is False


def test_fecha_con_z_final_parsea_ben():
    futuro = (datetime.now(timezone.utc) + timedelta(hours=1)).strftime("%Y-%m-%dT%H:%M:%S") + "Z"
    assert mission_is_locked(futuro) is True


def test_fecha_sen_zona_de_datetime_local_parsea():
    """<input type="datetime-local"> manda sen zona: "2026-12-25T10:00"."""
    momento = parse_launch_at("2099-12-25T10:00")
    assert momento is not None
    assert mission_is_locked("2099-12-25T10:00") is True


def test_fecha_que_non_vale_non_bloquea():
    """Un valor roto en la config no puede dejar la misión bloqueada para
    siempre sin que nadie sepa por qué."""
    assert mission_is_locked("esto no es una fecha") is False


# ---------------------------------------------------------------------------
# Enganchado de verdad: /api/config anuncia la hora del servidor
# ---------------------------------------------------------------------------

def make_client():
    import main
    return TestClient(main.app)


def test_o_config_publico_leva_a_hora_do_servidor_e_a_data_de_inicio(monkeypatch):
    import main

    original_load_config = main.load_config
    monkeypatch.setattr(
        main,
        "load_config",
        lambda: {**original_load_config(), "mission_launch_at": "2099-01-01T10:00"},
    )
    client = make_client()

    respuesta = client.get("/api/config")
    assert respuesta.status_code == 200
    datos = respuesta.json()
    assert datos["mission_launch_at"] == "2099-01-01T10:00"
    assert isinstance(datos["server_time_ms"], int)
    assert datos["server_time_ms"] > 1_700_000_000_000  # una fecha real, no un cero


def test_o_panel_garda_a_data_de_inicio(monkeypatch):
    """/api/admin/save-config armaba la respuesta campo a campo -el mismo
    fallo que ya pasó una vez con player_profiles (ver
    test_admin_player_profiles_save.py)-: si mission_launch_at no está en la
    lista, el panel manda el valor, el servidor contesta "ok" y lo descarta
    en silencio."""
    import main

    monkeypatch.setattr(main, "admin_request_authorized", lambda request, data: True)
    monkeypatch.setattr(main, "admin_password_change_required", lambda: False)

    original = main.load_config()
    try:
        client = make_client()
        respuesta = client.post(
            "/api/admin/save-config",
            json={"config": {"mission_launch_at": "2099-06-15T09:00"}},
        )
        assert respuesta.status_code == 200
        assert main.load_config().get("mission_launch_at") == "2099-06-15T09:00"

        publico = client.get("/api/config").json()
        assert publico["mission_launch_at"] == "2099-06-15T09:00"
    finally:
        main.save_config(original)


# ---------------------------------------------------------------------------
# Enganchado de verdad: /api/advance (con cobertura)
# ---------------------------------------------------------------------------

def seed_player_session(client: TestClient, user: str = "PLAYER 1"):
    import main
    main.clear_player_rate_limits()
    response = client.get(f"/api/game/{user.replace(' ', '%20')}")
    assert response.status_code == 200


def configure_locked_mission(monkeypatch, tmp_path: Path, launch_at: str):
    import main

    sqlite_db = tmp_path / "saga.sqlite3"
    monkeypatch.setenv("SAGA_STORAGE_BACKEND", "sqlite")
    monkeypatch.setenv("SAGA_SQLITE_DB", str(sqlite_db))
    monkeypatch.setattr(main, "GAME_DB", str(tmp_path / "gamestate.json"))
    monkeypatch.setattr(main, "STAGES_DB", str(tmp_path / "stages.json"))
    monkeypatch.setattr(main, "EVENT_LOG_DB", str(tmp_path / "events.json"))
    monkeypatch.setattr(main, "POSITIONS_DB", str(tmp_path / "positions.json"))

    main.save_stages(
        main.STAGES_DB,
        [
            {
                "id": 1,
                "title": "Nodo bloqueado",
                "content": "No se puede completar antes de tiempo",
                "lat": 40.0,
                "lon": -3.0,
                "radius": 25,
                "answer": "OMEGA",
                "minigame": {"type": "signal_hunt", "config": {}},
                "config": {},
            }
        ],
    )
    main.set_player_progress_level("PLAYER 1", 0)

    original_load_config = main.load_config
    monkeypatch.setattr(
        main, "load_config", lambda: {**original_load_config(), "mission_launch_at": launch_at}
    )


def test_advance_rexeitado_antes_de_hora(monkeypatch, tmp_path):
    import main

    futuro = (datetime.now(timezone.utc) + timedelta(days=2)).isoformat()
    configure_locked_mission(monkeypatch, tmp_path, futuro)

    monkeypatch.setenv("SECRET_KEY", "test-secret-key")
    client = make_client()
    seed_player_session(client)

    respuesta = client.post(
        "/api/advance",
        json={"user": "PLAYER 1", "code": "OMEGA"},
    )

    assert respuesta.status_code == 200
    datos = respuesta.json()
    assert datos["status"] == "fail"
    assert datos["reason"] == "mission_not_started_yet"
    assert main.get_player_progress_level("PLAYER 1", 0) == 0, "el código no se llega ni a mirar"


def test_advance_funciona_normal_sen_data_de_inicio(monkeypatch, tmp_path):
    import main

    configure_locked_mission(monkeypatch, tmp_path, "")

    monkeypatch.setenv("SECRET_KEY", "test-secret-key")
    client = make_client()
    seed_player_session(client)

    respuesta = client.post(
        "/api/advance",
        json={"user": "PLAYER 1", "code": "OMEGA"},
    )

    assert respuesta.status_code == 200
    assert respuesta.json()["status"] == "ok"
    assert main.get_player_progress_level("PLAYER 1", 0) == 1


# ---------------------------------------------------------------------------
# Enganchado de verdad: node_completed en la cola offline
# ---------------------------------------------------------------------------

def test_node_completed_rexeitado_antes_de_hora_e_reintentable(monkeypatch, tmp_path):
    """El punto que más importa: rechazado antes de hora, pero NO se guarda
    con ese client_event_id -si no, el próximo intento lo encontraría como
    duplicado y el nodo no se completaría nunca, ni siquiera después de que
    llegue la hora-. En cuanto se desbloquea, el mismo reintento sí cuenta."""
    import main
    from backend.app.storage.event_store import list_events

    futuro = (datetime.now(timezone.utc) + timedelta(days=2)).isoformat()
    configure_locked_mission(monkeypatch, tmp_path, futuro)

    monkeypatch.setenv("SECRET_KEY", "test-secret-key")
    client = make_client()
    seed_player_session(client)

    payload = {
        "user": "PLAYER 1",
        "events": [
            {
                "client_event_id": "adianta-a-hora",
                "type": "node_completed",
                "node_id": "1",
                "payload": {"code": "OMEGA"},
            }
        ],
    }

    primeiro = client.post("/api/events/sync", json=payload)
    assert primeiro.status_code == 200
    evento = primeiro.json()["events"][0]
    assert evento["status"] == "failed"
    assert evento["error"] == "mission_not_started_yet"
    assert main.get_player_progress_level("PLAYER 1", 0) == 0

    # Nada quedó escrito con ese client_event_id: si quedara, el reintento de
    # abajo lo encontraría como duplicado y NUNCA llegaría a aplicarse.
    completados = list_events(main.EVENT_LOG_DB, user="PLAYER 1", event_type="node_completed")
    assert len(completados) == 0

    # Llega la hora -o el móvil reintenta tras encolarlo hace días- y el
    # MISMO evento, con el MISMO client_event_id, se reenvía solo.
    configure_locked_mission(monkeypatch, tmp_path, "")

    segundo = client.post("/api/events/sync", json=payload)
    assert segundo.status_code == 200
    evento2 = segundo.json()["events"][0]
    assert evento2["status"] == "synced"
    assert main.get_player_progress_level("PLAYER 1", 0) == 1
