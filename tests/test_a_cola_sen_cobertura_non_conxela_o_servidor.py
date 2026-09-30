# -*- coding: utf-8 -*-
"""Caza de fallos del 30/09/2026, S2: volcar la cola de posiciones que el móvil
guardó sin cobertura congelaba el servidor.

Medido entonces: 10 eventos `position_track` tardaban 17 s (1,7 s el décimo, y
creciendo) y un lote de 50 ≈ 80 s con el bucle de eventos bloqueado: 15 jugadores
saliendo de una zona sin cobertura eran minutos sin latidos ni avances. Tres
causas: cada muestra abría su conexión y hacía su commit; cada muestra releía la
configuración para saber si el Registro está activo; y para saber si un evento
ya estaba guardado se leían y decodificaban TODOS los eventos del jugador.
"""
import os
import sqlite3
import tempfile
import time
from datetime import datetime, timedelta, timezone

os.environ.setdefault("ADMIN_PASS", "pytest_admin_password")
os.environ.setdefault("SAGA_DATA_DIR", tempfile.mkdtemp(prefix="saga-test-cola-"))

from fastapi.testclient import TestClient  # noqa: E402

import main  # noqa: E402
from backend.app.storage import match_log_store, sqlite_store  # noqa: E402
from ruta_de_proba import preparar_mision  # noqa: E402

USUARIO = "PLAYER 1"
EVENTOS = 50
MOSTRAS = 60


def _iso(minutos_atras):
    return (datetime.now(timezone.utc) - timedelta(minutes=minutos_atras)).isoformat().replace("+00:00", "Z")


def _rastro(i):
    base = int((datetime.now(timezone.utc) - timedelta(minutes=45)).timestamp() * 1000) + i * 60_000
    return {
        "client_event_id": "rastro-%d" % i,
        "type": "position_track",
        "payload": {
            "local_created_at": _iso(40),
            "offline_at_creation": True,
            "samples": [
                {"t": base + j * 500, "lat": 40.0 + j * 0.0001, "lon": -3.0, "acc": 10, "src": "real"}
                for j in range(MOSTRAS)
            ],
        },
    }


def _cliente(monkeypatch, tmp_path):
    preparar_mision(monkeypatch, tmp_path)
    cliente = TestClient(main.app)
    assert cliente.get("/api/game/PLAYER%201").status_code == 200
    return cliente


def test_50_eventos_de_posicions_sobe_rapido_e_non_cadra_unha_conexion_por_mostra(monkeypatch, tmp_path):
    cliente = _cliente(monkeypatch, tmp_path)
    eventos = [_rastro(i) for i in range(EVENTOS)]

    conexions_ao_rexistro = []
    real = sqlite3.connect

    def contada(*args, **kwargs):
        if args and str(args[0]).endswith("match_log.sqlite3"):
            conexions_ao_rexistro.append(1)
        return real(*args, **kwargs)

    monkeypatch.setattr(sqlite3, "connect", contada)

    inicio = time.perf_counter()
    resposta = cliente.post("/api/events/sync", json={"user": USUARIO, "events": eventos})
    duracion = time.perf_counter() - inicio

    assert resposta.status_code == 200
    assert resposta.json()["accepted"] == EVENTOS

    # Medido: ≈ 80 s antes. Con margen de sobra para un CI lento, pero lejos de
    # aquello.
    assert duracion < 20, "50 eventos tardaron %.1f s" % duracion

    # Ni una conexión por muestra (3 000) ni un commit por muestra: una por evento
    # más las de la tanda.
    assert len(conexions_ao_rexistro) <= EVENTOS + 6, len(conexions_ao_rexistro)

    monkeypatch.setattr(sqlite3, "connect", real)
    mostras = main.match_log_list_timeline(user=USUARIO, event_type="position_sample", limit=20000)
    assert len(mostras) == EVENTOS * MOSTRAS
    assert all(m["client_created_at"] for m in mostras)


def test_todas_as_mostras_dun_evento_van_nunha_soa_transaccion(tmp_path):
    ruta = str(tmp_path / "match_log.sqlite3")
    match_log_store.init_schema(ruta)

    commits = []
    real = sqlite3.connect

    class Contada(sqlite3.Connection):
        def commit(self):
            commits.append(1)
            return super().commit()

    def contada(*args, **kwargs):
        kwargs.setdefault("factory", Contada)
        return real(*args, **kwargs)

    sqlite3.connect = contada
    try:
        filas = match_log_store.append_entries(
            ruta,
            [
                {"event_type": "position_sample", "user": "PLAYER 1", "payload": {"lat": 40.0 + i / 1000}}
                for i in range(MOSTRAS)
            ],
        )
    finally:
        sqlite3.connect = real

    assert filas == MOSTRAS
    assert len(commits) == 1
    assert match_log_store.count_entries(ruta) == MOSTRAS


def test_o_rexistro_pregunta_unha_vez_por_tanda_se_esta_activo(monkeypatch, tmp_path):
    cliente = _cliente(monkeypatch, tmp_path)
    chamadas = []
    real = main.match_log_is_active
    monkeypatch.setattr(main, "match_log_is_active", lambda *a, **k: chamadas.append(1) or real(*a, **k))

    resposta = cliente.post(
        "/api/events/sync",
        json={"user": USUARIO, "events": [_rastro(i) for i in range(10)]},
    )

    assert resposta.status_code == 200
    # Antes: unha vez por CADA mostra (600).
    assert len(chamadas) <= 2, len(chamadas)


def test_un_evento_repetido_identificase_polo_indice_sen_ler_todos_os_eventos(monkeypatch, tmp_path):
    cliente = _cliente(monkeypatch, tmp_path)
    eventos = [_rastro(i) for i in range(5)]
    primeira = cliente.post("/api/events/sync", json={"user": USUARIO, "events": eventos})
    assert primeira.status_code == 200

    def prohibido(*args, **kwargs):
        raise AssertionError("a idempotencia non pode recorrer todos os eventos do xogador")

    monkeypatch.setattr(sqlite_store, "list_sqlite_events", prohibido)
    antes = main.match_log_count(user=USUARIO)

    segunda = cliente.post("/api/events/sync", json={"user": USUARIO, "events": eventos})

    assert segunda.status_code == 200
    assert [e["duplicate"] for e in segunda.json()["events"]] == [True] * 5
    assert main.match_log_count(user=USUARIO) == antes + 1, "só a fila da tanda; as mostras non se duplican"


def test_a_columna_client_event_id_enchese_nas_bases_antigas(tmp_path):
    """Unha base creada antes do índice gaña a columna e recheda o que xa tiña."""
    ruta = str(tmp_path / "vella.sqlite3")
    conn = sqlite3.connect(ruta)
    conn.execute(
        """
        CREATE TABLE events (
            id TEXT PRIMARY KEY, type TEXT NOT NULL, status TEXT NOT NULL, source TEXT NOT NULL,
            created_at TEXT NOT NULL, user TEXT NOT NULL DEFAULT '', team_id TEXT NOT NULL DEFAULT '',
            node_id TEXT NOT NULL DEFAULT '', payload_json TEXT NOT NULL DEFAULT '{}',
            synced_at TEXT, error TEXT
        )
        """
    )
    conn.execute(
        "INSERT INTO events (id, type, status, source, created_at, user, payload_json) VALUES (?,?,?,?,?,?,?)",
        ("evt_vello", "qr_scanned", "synced", "player", "2026-01-01T00:00:00+00:00", "PLAYER 1",
         '{"client_event_id": "cola-vella-1", "note": "x"}'),
    )
    conn.commit()
    conn.close()

    achado = sqlite_store.find_sqlite_event_by_client_id(ruta, "PLAYER 1", "cola-vella-1")

    assert achado is not None and achado["id"] == "evt_vello"
    assert sqlite_store.find_sqlite_event_by_client_id(ruta, "PLAYER 2", "cola-vella-1") is None
    assert sqlite_store.find_sqlite_event_by_client_id(ruta, "PLAYER 1", "non-existe") is None
