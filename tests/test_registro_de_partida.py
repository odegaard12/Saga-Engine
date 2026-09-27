# -*- coding: utf-8 -*-
"""Registro de partida (backend/app/runtime/match_log.py): a bitácora por
xogador para revisar despois da ruta e detectar trampas.

Só se escribe mentres a misión está PROGRAMADA (`mission_launch_at` posta na
configuración) e ACTIVA (esa hora xa chegou -ver mission_schedule.py-). Fóra
dese intervalo -sen data programada, ou antes de hora- non se anota nada.
"""
import os
import tempfile
from datetime import datetime, timedelta, timezone
from pathlib import Path

os.environ.setdefault("ADMIN_PASS", "pytest_admin_password")
os.environ.setdefault("SAGA_DATA_DIR", tempfile.mkdtemp(prefix="saga-test-rexistro-"))

from fastapi.testclient import TestClient  # noqa: E402

import main  # noqa: E402


def make_client():
    return TestClient(main.app)


def seed_player_session(client: TestClient, user: str = "PLAYER 1"):
    main.clear_player_rate_limits()
    response = client.get(f"/api/game/{user.replace(' ', '%20')}")
    assert response.status_code == 200


def configure_mission(monkeypatch, tmp_path: Path, launch_at: str):
    """Un nodo, un jugador, y la fecha de inicio que pida el test."""
    sqlite_db = tmp_path / "saga.sqlite3"
    monkeypatch.setenv("SAGA_STORAGE_BACKEND", "sqlite")
    monkeypatch.setenv("SAGA_SQLITE_DB", str(sqlite_db))
    monkeypatch.setenv("SECRET_KEY", "test-secret-key")
    monkeypatch.setattr(main, "GAME_DB", str(tmp_path / "gamestate.json"))
    monkeypatch.setattr(main, "STAGES_DB", str(tmp_path / "stages.json"))
    monkeypatch.setattr(main, "EVENT_LOG_DB", str(tmp_path / "events.json"))
    monkeypatch.setattr(main, "POSITIONS_DB", str(tmp_path / "positions.json"))

    main.save_stages(
        main.STAGES_DB,
        [
            {
                "id": 1,
                "title": "Nodo do rexistro",
                "content": "Para probar o Rexistro de partida",
                "lat": 40.0,
                "lon": -3.0,
                "radius": 25,
                "answer": "OMEGA",
                "minigame": {"type": "signal_hunt", "config": {}},
                "config": {},
            }
        ],
    )

    original_load_config = main.load_config
    monkeypatch.setattr(
        main, "load_config", lambda: {**original_load_config(), "mission_launch_at": launch_at}
    )


def limpar_rexistro(user: str | None = None):
    main.match_log_purge(user=user)
    main._match_log.reset_rate_state()
    main.HEARTBEAT_LAST_SEEN_BY_KEY.clear()


# ---------------------------------------------------------------------------
# Fóra da ventá activa: nada que anotar
# ---------------------------------------------------------------------------

def test_sen_data_programada_non_se_anota_nada(monkeypatch, tmp_path):
    configure_mission(monkeypatch, tmp_path, "")
    limpar_rexistro("PLAYER 1")

    client = make_client()
    seed_player_session(client)
    client.post("/api/advance", json={"user": "PLAYER 1", "code": "OMEGA"})

    assert main.match_log_count(user="PLAYER 1") == 0


def test_antes_de_hora_non_se_anota_nada(monkeypatch, tmp_path):
    futuro = (datetime.now(timezone.utc) + timedelta(days=2)).isoformat()
    configure_mission(monkeypatch, tmp_path, futuro)
    limpar_rexistro("PLAYER 1")

    client = make_client()
    seed_player_session(client)
    client.post("/api/advance", json={"user": "PLAYER 1", "code": "OMEGA"})

    assert main.match_log_count(user="PLAYER 1") == 0


# ---------------------------------------------------------------------------
# Misión activa: cada tipo de evento queda anotado
# ---------------------------------------------------------------------------

def test_avance_con_cobertura_queda_anotado(monkeypatch, tmp_path):
    configure_mission(monkeypatch, tmp_path, "2020-01-01T00:00")
    limpar_rexistro("PLAYER 1")

    client = make_client()
    seed_player_session(client)
    respuesta = client.post("/api/advance", json={"user": "PLAYER 1", "code": "OMEGA"})
    assert respuesta.json()["status"] == "ok"

    entradas = main.match_log_list_timeline(user="PLAYER 1")
    tipos = [entrada["type"] for entrada in entradas]
    assert "advance" in tipos


def test_avance_sen_cobertura_pola_cola_offline_queda_anotado(monkeypatch, tmp_path):
    configure_mission(monkeypatch, tmp_path, "2020-01-01T00:00")
    limpar_rexistro("PLAYER 1")

    client = make_client()
    seed_player_session(client)
    payload = {
        "user": "PLAYER 1",
        "events": [
            {
                "client_event_id": "offline-1",
                "type": "node_completed",
                "node_id": "1",
                "payload": {"code": "OMEGA"},
            }
        ],
    }
    respuesta = client.post("/api/events/sync", json=payload)
    assert respuesta.json()["events"][0]["status"] == "synced"

    entradas = main.match_log_list_timeline(user="PLAYER 1")
    tipos = [entrada["type"] for entrada in entradas]
    assert "advance" in tipos


def test_evento_de_xogador_xenerico_queda_anotado(monkeypatch, tmp_path):
    """node_opened, QR, mochila... pasan todos polo mismo camiño xenérico."""
    configure_mission(monkeypatch, tmp_path, "2020-01-01T00:00")
    limpar_rexistro("PLAYER 1")

    client = make_client()
    seed_player_session(client)
    payload = {
        "user": "PLAYER 1",
        "events": [
            {"client_event_id": "qr-1", "type": "qr_scanned", "node_id": "1", "payload": {}},
        ],
    }
    respuesta = client.post("/api/events/sync", json=payload)
    assert respuesta.status_code == 200

    entradas = main.match_log_list_timeline(user="PLAYER 1")
    tipos = [entrada["type"] for entrada in entradas]
    assert "qr_scanned" in tipos


def test_heartbeat_respecta_a_taxa_dunha_mostraxe_cada_30s(monkeypatch, tmp_path):
    configure_mission(monkeypatch, tmp_path, "2020-01-01T00:00")
    limpar_rexistro("PLAYER 1")

    client = make_client()
    seed_player_session(client)

    r1 = client.post(
        "/api/heartbeat", json={"user": "PLAYER 1", "lat": 40.0001, "lon": -3.0001, "gps_status": "ok"}
    )
    assert r1.status_code == 200

    entradas = main.match_log_list_timeline(user="PLAYER 1", event_type="position_sample")
    assert len(entradas) == 1, "primeiro latido: unha soa mostra"

    # Un segundo latido inmediato (< 30 s despois) non debe engadir outra fila.
    import time as _time

    main._match_log._LAST_POSITION_SAMPLE_AT["PLAYER 1"] = _time.time()
    main.HEARTBEAT_LAST_SEEN_BY_KEY.clear()  # sortear o límite PROPIO do heartbeat (2 s), non o do rexistro
    r2 = client.post(
        "/api/heartbeat", json={"user": "PLAYER 1", "lat": 40.0002, "lon": -3.0002, "gps_status": "ok"}
    )
    assert r2.status_code == 200
    entradas_despois = main.match_log_list_timeline(user="PLAYER 1", event_type="position_sample")
    assert len(entradas_despois) == 1, "dentro dos 30 s non se engade outra mostra"


def test_orixe_manual_do_heartbeat_queda_anotado(monkeypatch, tmp_path):
    configure_mission(monkeypatch, tmp_path, "2020-01-01T00:00")
    limpar_rexistro("PLAYER 1")

    client = make_client()
    seed_player_session(client)
    respuesta = client.post(
        "/api/heartbeat",
        json={"user": "PLAYER 1", "lat": 40.0, "lon": -3.0, "gps_status": "ok", "source": "manual"},
    )
    assert respuesta.status_code == 200

    entradas = main.match_log_list_timeline(user="PLAYER 1", event_type="position_sample")
    assert len(entradas) == 1
    assert entradas[0]["payload"]["source"] == "manual"

    # E o motor antitrampas anota ademais a nota "info" neutra na mesma liña de tempo.
    notas = main.match_log_list_timeline(user="PLAYER 1", event_type="info_note")
    assert len(notas) == 1
    assert notas[0]["severity"] == "info"


def test_sospeita_do_motor_antitrampas_queda_anotada(monkeypatch, tmp_path):
    configure_mission(monkeypatch, tmp_path, "2020-01-01T00:00")
    limpar_rexistro("PLAYER 1")

    main.match_log_record("session_open", "PLAYER 1")  # sesión activa de mentira
    main._anti_cheat.record_suspicion(
        main.ANTI_CHEAT_DB, "PLAYER 1", "impossible_travel_speed", {"speed_kmh": 999}
    )

    entradas = main.match_log_list_timeline(user="PLAYER 1", event_type="suspicion")
    assert len(entradas) == 1
    assert entradas[0]["severity"] == "suspicion"
    assert entradas[0]["payload"]["reason"] == "impossible_travel_speed"


# ---------------------------------------------------------------------------
# Panel de admin: autenticación, listaxe e exportación
# ---------------------------------------------------------------------------

def test_endpoint_de_listaxe_esixe_autenticacion(monkeypatch, tmp_path):
    configure_mission(monkeypatch, tmp_path, "2020-01-01T00:00")
    monkeypatch.setattr(main, "admin_request_authorized", lambda request, data: False)

    client = make_client()
    respuesta = client.post("/api/admin/match-log", json={})
    assert respuesta.status_code == 403


def test_endpoint_de_listaxe_devolve_as_entradas(monkeypatch, tmp_path):
    configure_mission(monkeypatch, tmp_path, "2020-01-01T00:00")
    monkeypatch.setattr(main, "admin_request_authorized", lambda request, data: True)
    limpar_rexistro("PLAYER 1")
    main.match_log_record("session_open", "PLAYER 1")

    client = make_client()
    respuesta = client.post("/api/admin/match-log", json={"user": "PLAYER 1"})
    assert respuesta.status_code == 200
    datos = respuesta.json()
    assert datos["status"] == "ok"
    assert datos["count"] >= 1
    assert any(entrada["type"] == "session_open" for entrada in datos["entries"])


def test_exportacion_json(monkeypatch, tmp_path):
    configure_mission(monkeypatch, tmp_path, "2020-01-01T00:00")
    monkeypatch.setattr(main, "admin_request_authorized", lambda request, data: True)
    limpar_rexistro("PLAYER 1")
    main.match_log_record("session_open", "PLAYER 1")

    client = make_client()
    respuesta = client.post("/api/admin/match-log/export", json={"user": "PLAYER 1", "formato": "json"})
    assert respuesta.status_code == 200
    datos = respuesta.json()
    assert datos["status"] == "ok"
    assert len(datos["entries"]) >= 1


def test_exportacion_csv(monkeypatch, tmp_path):
    configure_mission(monkeypatch, tmp_path, "2020-01-01T00:00")
    monkeypatch.setattr(main, "admin_request_authorized", lambda request, data: True)
    limpar_rexistro("PLAYER 1")
    main.match_log_record("session_open", "PLAYER 1")

    client = make_client()
    respuesta = client.post("/api/admin/match-log/export", json={"user": "PLAYER 1", "formato": "csv"})
    assert respuesta.status_code == 200
    assert "text/csv" in respuesta.headers["content-type"]
    corpo = respuesta.text
    assert "session_open" in corpo
    assert corpo.startswith("created_at,")


def test_exportacion_csv_escapa_celas_que_parecen_formulas(monkeypatch, tmp_path):
    """Un nome de xogador que empece por `=`/`+`/`-`/`@` non pode executar nada
    ao abrir o CSV nunha folla de cálculo (CSV injection, OWASP).

    `main.match_log_to_csv` -a mesma función que usa o export- ten que
    escapar iso cunha comilla simple por diante, para que Excel/Sheets o lea
    como texto e non como o comezo dunha fórmula.
    """
    configure_mission(monkeypatch, tmp_path, "2020-01-01T00:00")
    limpar_rexistro("=cmd|'/c calc'!A1")

    main.match_log_record(
        "session_open",
        "=cmd|'/c calc'!A1",
        payload={"@evil": "SUM(A1:A9)"},
    )

    entradas = main.match_log_list_timeline(user="=cmd|'/c calc'!A1")
    assert entradas

    corpo = main.match_log_to_csv(entradas)
    # A celda leva a comilla por diante -por iso segue aparecendo "=cmd|" no
    # texto-, pero nunca sen escapar: nin ao comezo de liña nin xusto despois
    # dunha coma (que é onde comeza unha cela nova no CSV).
    assert not corpo.startswith("=cmd|")
    assert ",=cmd|" not in corpo
    assert "'=cmd|" in corpo
    assert ",@evil=" not in corpo
    assert "'@evil=" in corpo

    limpar_rexistro("=cmd|'/c calc'!A1")


# ---------------------------------------------------------------------------
# Purga de datos personais
# ---------------------------------------------------------------------------

def test_a_purga_de_datos_persoais_borra_o_rexistro(monkeypatch, tmp_path):
    configure_mission(monkeypatch, tmp_path, "2020-01-01T00:00")
    monkeypatch.setattr(main, "admin_request_authorized", lambda request, data: True)
    limpar_rexistro("PLAYER 1")
    main.match_log_record("session_open", "PLAYER 1")
    assert main.match_log_count(user="PLAYER 1") >= 1

    client = make_client()
    respuesta = client.post(
        "/api/admin/datos-personales",
        json={"confirmacion": "BORRAR", "fotos": False, "posiciones": True},
    )
    assert respuesta.status_code == 200
    datos = respuesta.json()
    assert datos["status"] == "ok"
    assert "registro_de_partida" in datos["borrado"]

    assert main.match_log_count(user="PLAYER 1") == 0
