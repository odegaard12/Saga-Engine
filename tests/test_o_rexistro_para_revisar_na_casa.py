# -*- coding: utf-8 -*-
"""Rexistro de partida: para repasar a ruta na casa.

Non basta con ter as filas: hai que poder ver CANDO pasou cada cousa (a hora do
móbil, non a de subida), que tramos foron sen cobertura, canto tardaron en
chegar e que xogadas cheiran mal. Aquí probamos o que fai iso posible no
servidor: ordenar por ocorrencia, os filtros «só sospeitas» e «só sen
cobertura», os rexeitamentos, e que a exportación segue escapando fórmulas.
"""
import csv
import io
import os
import tempfile
from datetime import datetime, timedelta, timezone

os.environ.setdefault("ADMIN_PASS", "pytest_admin_password")
os.environ.setdefault("SAGA_DATA_DIR", tempfile.mkdtemp(prefix="saga-test-rexistro-casa-"))

from fastapi.testclient import TestClient  # noqa: E402

import main  # noqa: E402
from ruta_de_proba import preparar_mision  # noqa: E402

USUARIO = "PLAYER 1"


def _iso(minutos_atras):
    return (datetime.now(timezone.utc) - timedelta(minutes=minutos_atras)).isoformat().replace("+00:00", "Z")


def _sincronizar(cliente, eventos):
    return cliente.post("/api/events/sync", json={"user": USUARIO, "events": eventos}).json()


def _cliente(monkeypatch, tmp_path):
    preparar_mision(monkeypatch, tmp_path)
    cliente = TestClient(main.app)
    assert cliente.get("/api/game/PLAYER%201").status_code == 200
    return cliente


def _mesturado():
    """Un tramo sen cobertura subido de golpe, en desorde de subida."""
    return [
        {
            "client_event_id": "e-qr",
            "type": "qr_scanned",
            "node_id": "102",
            "payload": {"local_created_at": _iso(8), "offline_at_creation": True, "code": "SAGA_QR_1"},
        },
        {
            "client_event_id": "e-abrir",
            "type": "node_opened",
            "node_id": "101",
            "payload": {"local_created_at": _iso(20), "offline_at_creation": True},
        },
        {
            "client_event_id": "e-av",
            "type": "node_completed",
            "payload": {
                "code": "OK",
                "level_before": 0,
                "time_spent_ms": 20_000,
                "local_created_at": _iso(15),
                "offline_at_creation": True,
            },
        },
    ]


def test_a_liña_de_tempo_ordénase_por_cando_pasou_non_por_cando_se_subiu(monkeypatch, tmp_path):
    cliente = _cliente(monkeypatch, tmp_path)
    _sincronizar(cliente, _mesturado())

    por_subida = [e["type"] for e in main.match_log_list_timeline(user=USUARIO) if e["type"] != "session_open"]
    por_ocorrencia = main.match_log_list_timeline(user=USUARIO, by_occurrence=True)
    tipos = [e["type"] for e in por_ocorrencia if e["type"] in {"node_opened", "advance", "qr_scanned"}]

    assert tipos == ["node_opened", "advance", "qr_scanned"], "20 min, 15 min e 8 min antes"
    assert all(e["occurred_at"] for e in por_ocorrencia)
    assert por_subida  # o orde de rexistro segue estando dispoñible


def test_o_filtro_so_sen_cobertura(monkeypatch, tmp_path):
    cliente = _cliente(monkeypatch, tmp_path)
    _sincronizar(cliente, _mesturado())

    sen_rede = main.match_log_list_timeline(user=USUARIO, only_offline=True)
    assert sen_rede
    assert all(e["payload"].get("offline") or e["type"] == "offline_sync_batch" for e in sen_rede)
    assert "session_open" not in [e["type"] for e in sen_rede]


def test_o_filtro_so_sospeitas(monkeypatch, tmp_path):
    cliente = _cliente(monkeypatch, tmp_path)
    main.set_player_progress_level(USUARIO, 1)
    _sincronizar(
        cliente,
        [
            {
                "client_event_id": "e-mal",
                "type": "node_completed",
                "payload": {
                    "code": "SAGA_QR_1",
                    "level_before": 1,
                    "time_spent_ms": 9_000,
                    "local_created_at": _iso(5),
                    "evidence": {"v": 1, "via": "qr", "qr": {"raw": "OUTRO"}},
                },
            }
        ],
    )

    sospeitas = main.match_log_list_timeline(user=USUARIO, only_suspicions=True)
    assert sospeitas
    assert all(e["type"] == "suspicion" or e.get("severity") == "suspicion" for e in sospeitas)
    assert sospeitas[0]["payload"]["reason"] == "evidence_qr_mismatch"


def test_un_avance_rexeitado_deixa_rastro_no_rexistro(monkeypatch, tmp_path):
    cliente = _cliente(monkeypatch, tmp_path)

    corpo = _sincronizar(
        cliente,
        [
            {
                "client_event_id": "e-lixo",
                "type": "node_completed",
                "payload": {"code": "CODIGO_QUE_NON_VALE", "level_before": 0, "local_created_at": _iso(3)},
            }
        ],
    )
    assert corpo["events"][0]["status"] == "failed"

    rexeitados = [e for e in main.match_log_list_timeline(user=USUARIO) if e["type"] == "advance_rejected"]
    assert len(rexeitados) == 1
    assert rexeitados[0]["payload"]["error"] == "invalid_completion_code"
    assert rexeitados[0]["client_created_at"]


def test_o_endpoint_do_panel_devolve_ordenado_e_acepta_os_filtros(monkeypatch, tmp_path):
    cliente = _cliente(monkeypatch, tmp_path)
    _sincronizar(cliente, _mesturado())
    monkeypatch.setattr(main, "admin_request_authorized", lambda request, data: True)

    todo = cliente.post("/api/admin/match-log", json={"user": USUARIO}).json()
    assert todo["status"] == "ok"
    ocorreu = [e["occurred_at"] for e in todo["entries"]]
    assert ocorreu == sorted(ocorreu)

    so_rede = cliente.post("/api/admin/match-log", json={"user": USUARIO, "solo_sin_cobertura": True}).json()
    assert 0 < so_rede["count"] < todo["count"]

    ningunha = cliente.post("/api/admin/match-log", json={"user": USUARIO, "solo_sospechas": True}).json()
    assert ningunha["count"] == 0


def test_a_exportacion_csv_leva_as_columnas_de_revision_e_segue_escapando_formulas(monkeypatch, tmp_path):
    cliente = _cliente(monkeypatch, tmp_path)
    _sincronizar(cliente, _mesturado())
    main._match_log.record(
        main.MATCH_LOG_DB, active=True, event_type="info_note", user=USUARIO, display_name="=cmd|'/c calc'!A1"
    )
    monkeypatch.setattr(main, "admin_request_authorized", lambda request, data: True)

    resposta = cliente.post("/api/admin/match-log/export", json={"user": USUARIO, "formato": "csv"})
    assert resposta.text.startswith("\ufeff"), "o BOM fai que Excel lea as tildes"
    filas = list(csv.DictReader(io.StringIO(resposta.text.lstrip("\ufeff")), delimiter=";"))

    assert {"occurred_at", "offline", "sync_delay_ms", "node_id"} <= set(filas[0].keys())
    diferidas = [f for f in filas if f["offline"] == "True"]
    assert diferidas and all(f["sync_delay_ms"] for f in diferidas)

    perigosas = [f for f in filas if "cmd" in f["display_name"]]
    assert perigosas and all(f["display_name"].startswith("'") for f in perigosas), (
        "unha celda que empeza por = ten que levar a comiña que a desactiva"
    )


def test_a_purga_con_borrar_segue_borrando_todo(monkeypatch, tmp_path):
    cliente = _cliente(monkeypatch, tmp_path)
    _sincronizar(cliente, _mesturado())
    assert main.match_log_count(user=USUARIO) > 0

    main.match_log_purge(user=USUARIO)
    assert main.match_log_count(user=USUARIO) == 0
