# -*- coding: utf-8 -*-
"""Caza de fallos del 30/09/2026, S12 y A8: Actividad y Registro de partida
enseñaban lo más VIEJO.

`ORDER BY created_at ASC ... LIMIT n` devolvía el principio de la ruta (LIMIT 5000
≈ 3 h de 14 jugadores) y nunca lo último; el filtro de fechas usaba la hora de
SUBIDA y no la de ocurrencia (una cola sin cobertura llega horas después); y el
tope de 20 000 filas podaba el principio de la partida, avances incluidos, por
culpa de miles de muestras de GPS.
"""
import os
import tempfile
from datetime import datetime, timedelta, timezone

os.environ.setdefault("ADMIN_PASS", "pytest_admin_password")
os.environ.setdefault("SAGA_DATA_DIR", tempfile.mkdtemp(prefix="saga-test-listados-"))

from fastapi.testclient import TestClient  # noqa: E402

import main  # noqa: E402
from backend.app.storage import match_log_store as almacen  # noqa: E402
from backend.app.storage import sqlite_store  # noqa: E402
from ruta_de_proba import preparar_mision  # noqa: E402

USUARIO = "PLAYER 1"
AHORA = datetime(2026, 9, 30, 12, 0, 0, tzinfo=timezone.utc)


def _iso(minutos):
    return (AHORA + timedelta(minutes=minutos)).isoformat().replace("+00:00", "Z")


# ---------------------------------------------------------------------------
# Eventos (Actividad)
# ---------------------------------------------------------------------------

def test_los_eventos_con_limite_son_los_mas_recientes_de_viejo_a_nuevo(tmp_path):
    ruta = str(tmp_path / "eventos.sqlite3")
    for i in range(30):
        sqlite_store.append_sqlite_event(
            ruta,
            {"type": "qr_scanned", "user": USUARIO, "created_at": _iso(i), "payload": {"n": i}},
        )

    ultimos = sqlite_store.list_sqlite_events(ruta, limit=5)

    assert [e["payload"]["n"] for e in ultimos] == [25, 26, 27, 28, 29]
    todos = sqlite_store.list_sqlite_events(ruta)
    assert [e["payload"]["n"] for e in todos] == list(range(30)), "sin límite siguen en orden cronológico"


def test_el_panel_de_actividad_recibe_lo_ultimo(monkeypatch, tmp_path):
    preparar_mision(monkeypatch, tmp_path)
    monkeypatch.setattr(main, "admin_request_authorized", lambda request, data: True)
    for i in range(12):
        main.append_event(
            main.EVENT_LOG_DB,
            {"type": "team_ready", "user": USUARIO, "created_at": _iso(i), "payload": {"n": i}},
        )

    resposta = TestClient(main.app).post("/api/admin/events", json={"limit": 4}).json()

    assert [e["payload"]["n"] for e in resposta["events"]] == [8, 9, 10, 11]


def test_el_panel_recibe_los_totales_y_los_pendientes_reales_no_los_del_limite(monkeypatch, tmp_path):
    """«N pendientes» se contaba sobre los 200 eventos que trae el panel (A17)."""
    preparar_mision(monkeypatch, tmp_path)
    monkeypatch.setattr(main, "admin_request_authorized", lambda request, data: True)
    for i in range(30):
        main.append_event(
            main.EVENT_LOG_DB,
            {"type": "team_ready", "user": USUARIO, "status": "pending" if i % 3 == 0 else "synced", "created_at": _iso(i)},
        )

    resposta = TestClient(main.app).post("/api/admin/events", json={"limit": 5}).json()

    assert len(resposta["events"]) == 5
    assert resposta["total_count"] == 30
    assert resposta["pending_count"] == 10


def test_se_puede_excluir_tipos_pesados_del_listado(tmp_path):
    ruta = str(tmp_path / "eventos.sqlite3")
    sqlite_store.append_sqlite_event(ruta, {"type": "position_track", "user": USUARIO, "payload": {"samples": []}})
    sqlite_store.append_sqlite_event(ruta, {"type": "qr_scanned", "user": USUARIO})

    tipos = [e["type"] for e in sqlite_store.list_sqlite_events(ruta, exclude_types=("position_track",))]

    assert tipos == ["qr_scanned"]


# ---------------------------------------------------------------------------
# Registro de partida
# ---------------------------------------------------------------------------

def _rellenar(ruta, ocurrencias, tipo="advance", severity=None):
    """Filas SUBIDAS ahora que OCURRIERON en los minutos indicados."""
    for i, minuto in enumerate(ocurrencias):
        almacen.append_entry(
            ruta,
            event_type=tipo,
            user=USUARIO,
            payload={"i": i},
            severity=severity,
            client_created_at=_iso(minuto),
        )


def test_el_registro_con_limite_devuelve_las_mas_recientes_por_ocurrencia(tmp_path):
    ruta = str(tmp_path / "match_log.sqlite3")
    _rellenar(ruta, range(10))

    ultimas = almacen.list_entries(ruta, limit=3)

    assert [e["payload"]["i"] for e in ultimas] == [7, 8, 9]


def test_los_filtros_de_fecha_usan_cuando_paso_no_cuando_se_subio(tmp_path):
    ruta = str(tmp_path / "match_log.sqlite3")
    # Subida AYER pero ocurrida HOY a las 12:30 (llegó tarde de una cola sin cobertura)...
    almacen.append_entry(
        ruta, event_type="advance", user=USUARIO, payload={"quien": "tarde"},
        client_created_at=_iso(30), created_at=_iso(-24 * 60),
    )
    # ...y subida HOY pero ocurrida AYER.
    almacen.append_entry(
        ruta, event_type="advance", user=USUARIO, payload={"quien": "temprano"},
        client_created_at=_iso(-24 * 60), created_at=_iso(31),
    )

    desde_hoy = almacen.list_entries(ruta, date_from=_iso(0), date_to=_iso(60))

    assert [e["payload"]["quien"] for e in desde_hoy] == ["tarde"]


def test_los_filtros_de_fecha_aceptan_zonas_horarias_y_z(tmp_path):
    ruta = str(tmp_path / "match_log.sqlite3")
    _rellenar(ruta, [0, 10, 20])
    # 12:10 UTC escrito con +02:00 es 14:10; y con Z es la misma hora de reloj.
    desde = (AHORA + timedelta(minutes=10)).astimezone(timezone(timedelta(hours=2))).isoformat()

    filas = almacen.list_entries(ruta, date_from=desde)

    assert [e["payload"]["i"] for e in filas] == [1, 2]


def test_solo_sospechas_se_filtra_en_la_consulta_y_no_despues_del_limite(tmp_path):
    ruta = str(tmp_path / "match_log.sqlite3")
    almacen.append_entry(
        ruta, event_type="suspicion", user=USUARIO, severity="suspicion",
        payload={"reason": "vieja"}, client_created_at=_iso(0),
    )
    _rellenar(ruta, range(1, 40), tipo="session_open")  # 39 filas normales, más nuevas

    from backend.app.runtime import match_log

    sospechas = match_log.list_timeline(ruta, limit=5, only_suspicions=True)

    assert [e["payload"]["reason"] for e in sospechas] == ["vieja"], "con el filtro tras el límite se perdía"


def test_cada_entrada_lleva_su_occurred_at_normalizado(tmp_path):
    ruta = str(tmp_path / "match_log.sqlite3")
    almacen.append_entry(ruta, event_type="advance", user=USUARIO, client_created_at="2026-09-30T14:00:00+02:00")

    fila = almacen.list_entries(ruta)[0]

    assert fila["occurred_at"] == "2026-09-30T12:00:00.000000+00:00"


def test_las_bases_antiguas_calculan_occurred_at_al_abrirse(tmp_path):
    import sqlite3

    ruta = str(tmp_path / "match_log.sqlite3")
    conn = sqlite3.connect(ruta)
    conn.execute(
        """
        CREATE TABLE match_log (
            id TEXT PRIMARY KEY, type TEXT NOT NULL, user TEXT NOT NULL DEFAULT '',
            display_name TEXT NOT NULL DEFAULT '', severity TEXT, created_at TEXT NOT NULL,
            client_created_at TEXT, payload_json TEXT NOT NULL DEFAULT '{}'
        )
        """
    )
    conn.execute(
        "INSERT INTO match_log (id, type, user, created_at, client_created_at) VALUES (?,?,?,?,?)",
        ("ml_vieja", "advance", USUARIO, _iso(500), _iso(3)),
    )
    conn.commit()
    conn.close()

    fila = almacen.list_entries(ruta, date_from=_iso(0), date_to=_iso(10))

    assert [e["id"] for e in fila] == ["ml_vieja"], "se filtra por la hora del móvil, no la de subida"


# ---------------------------------------------------------------------------
# El tope: primero las posiciones, nunca los avances ni las sospechas
# ---------------------------------------------------------------------------

def test_al_llegar_al_tope_se_podan_las_posiciones_y_no_los_avances_ni_las_sospechas(tmp_path, monkeypatch):
    ruta = str(tmp_path / "match_log.sqlite3")
    monkeypatch.setattr(almacen, "MAX_ROWS_PER_MATCH", 20)

    _rellenar(ruta, range(0, 5), tipo="advance")
    _rellenar(ruta, range(5, 8), tipo="suspicion", severity="suspicion")
    _rellenar(ruta, range(8, 48), tipo="position_sample")  # 40 muestras: muchas más que el tope

    assert almacen.count_entries(ruta) == 20
    todas = almacen.list_entries(ruta)
    tipos = [e["type"] for e in todas]
    assert tipos.count("advance") == 5, "los avances no se podan"
    assert tipos.count("suspicion") == 3, "las sospechas no se podan"
    posiciones = [e["payload"]["i"] for e in todas if e["type"] == "position_sample"]
    assert posiciones == list(range(28, 40)), "de las posiciones se quedan las MÁS RECIENTES"


def test_aunque_todo_sea_protegido_el_tope_no_borra_avances(tmp_path, monkeypatch):
    ruta = str(tmp_path / "match_log.sqlite3")
    monkeypatch.setattr(almacen, "MAX_ROWS_PER_MATCH", 10)

    _rellenar(ruta, range(0, 25), tipo="advance")

    assert almacen.count_entries(ruta) == 25


def test_pasadas_las_posiciones_se_podan_las_notas_menores_antes_que_lo_protegido(tmp_path, monkeypatch):
    ruta = str(tmp_path / "match_log.sqlite3")
    monkeypatch.setattr(almacen, "MAX_ROWS_PER_MATCH", 12)

    _rellenar(ruta, range(0, 6), tipo="advance")
    _rellenar(ruta, range(6, 20), tipo="session_open")

    tipos = [e["type"] for e in almacen.list_entries(ruta)]
    assert tipos.count("advance") == 6
    assert almacen.count_entries(ruta) == 12
