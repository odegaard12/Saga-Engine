# -*- coding: utf-8 -*-
"""Caza de fallos del 30/09/2026, S17 y contrato 7: el reloj del móvil no es de fiar.

`stale_before_reset` comparaba la hora del MÓVIL (`payload.local_created_at`) con el
`reset_at` del SERVIDOR. Con el reloj del móvil adelantado, un avance de la partida
borrada resucitaba; con el reloj atrasado, un avance legítimo se descartaba. Ahora
`POST /api/events/sync` acepta `client_sent_at_ms` (la hora del móvil al enviar) y
corrige las horas de la tanda con el desfase respecto al servidor. Sin ese campo,
el comportamiento es el de siempre.
"""
import os
import tempfile
import time
from datetime import datetime, timezone

os.environ.setdefault("ADMIN_PASS", "pytest_admin_password")
os.environ.setdefault("SAGA_DATA_DIR", tempfile.mkdtemp(prefix="saga-test-reloxo-"))

import pytest  # noqa: E402
from fastapi.testclient import TestClient  # noqa: E402

import main  # noqa: E402
from backend.app.routers.admin import reiniciar_jugador_por_completo  # noqa: E402
from backend.app.runtime import reloj_del_movil as reloj  # noqa: E402
from ruta_de_proba import preparar_mision  # noqa: E402

USUARIO = "PLAYER 1"
UNA_HORA = 3_600_000


def _iso(ms):
    return datetime.fromtimestamp(ms / 1000, timezone.utc).isoformat(timespec="milliseconds").replace("+00:00", "Z")


def _avance(local_ms, cid):
    return {
        "client_event_id": cid,
        "type": "node_completed",
        "source": "offline_queue",
        "payload": {"code": "OK", "level_before": 0, "local_created_at": _iso(local_ms)},
    }


@pytest.fixture
def sitio(monkeypatch, tmp_path):
    preparar_mision(monkeypatch, tmp_path)
    cliente = TestClient(main.app)
    assert cliente.get("/api/game/PLAYER%201").status_code == 200
    reiniciar_jugador_por_completo(main, USUARIO)
    main.set_player_progress_level(USUARIO, 0)
    time.sleep(0.03)  # que «ahora» quede claramente después del reinicio
    return cliente


def _sync(cliente, eventos, **extra):
    resposta = cliente.post("/api/events/sync", json={"user": USUARIO, "events": eventos, **extra})
    assert resposta.status_code == 200, resposta.text
    return resposta.json()


# ---------------------------------------------------------------------------
# El desfase
# ---------------------------------------------------------------------------

def test_el_desfase_es_la_hora_del_servidor_menos_la_del_movil():
    assert reloj.calcular_desfase_ms(1_000_000_000_000 - UNA_HORA, 1_000_000_000_000) == UNA_HORA
    assert reloj.calcular_desfase_ms(1_000_000_000_000 + UNA_HORA, 1_000_000_000_000) == -UNA_HORA


def test_sin_dato_o_con_el_reloj_en_hora_o_con_basura_no_se_corrige_nada():
    ahora = 1_000_000_000_000
    assert reloj.calcular_desfase_ms(None, ahora) == 0
    assert reloj.calcular_desfase_ms(ahora - 800, ahora) == 0  # el tiempo de red no es un desfase
    for basura in ("nada", float("inf"), float("nan"), -5, 0, True, [], {}):
        assert reloj.calcular_desfase_ms(basura, ahora) == 0
    assert reloj.calcular_desfase_ms(1, ahora) == 0, "una hora de 1970 es basura, no un desfase de décadas"


def test_corregir_un_evento_conserva_la_hora_original_y_mueve_las_muestras():
    ahora = 1_800_000_000_000
    crudo = {
        "type": "position_track",
        "payload": {"local_created_at": _iso(ahora - UNA_HORA - 60_000), "samples": [{"t": ahora - UNA_HORA - 5_000}]},
    }

    corregido = reloj.corregir_evento(crudo, UNA_HORA, ahora)

    assert corregido["payload"]["local_created_at"] == _iso(ahora - 60_000)
    assert corregido["payload"]["local_created_at_device"] == crudo["payload"]["local_created_at"]
    assert corregido["payload"]["samples"][0]["t"] == ahora - 5_000
    assert corregido["payload"]["clock_offset_ms"] == UNA_HORA
    assert crudo["payload"]["samples"][0]["t"] == ahora - UNA_HORA - 5_000, "no muta el original"


def test_una_hora_corregida_nunca_queda_en_el_futuro_del_servidor():
    ahora = 1_800_000_000_000
    assert reloj.corregir_hora(ahora + 10_000, 0, ahora) == ahora


# ---------------------------------------------------------------------------
# El caso de verdad: el reinicio del organizador
# ---------------------------------------------------------------------------

def test_reloj_atrasado_con_client_sent_at_un_avance_legitimo_de_despues_del_reinicio_cuenta(sitio):
    reset_ms = main.player_reset_at(USUARIO)
    ahora = int(time.time() * 1000)
    # El jugador avanzó un minuto DESPUÉS del reinicio (hora del servidor), pero su
    # móvil va una hora atrasado: su hora local parece anterior al reinicio.
    local_ms = reset_ms + 60_000 - UNA_HORA

    corpo = _sync(sitio, [_avance(local_ms, "a-1")], client_sent_at_ms=ahora - UNA_HORA)

    assert corpo["events"][0]["status"] == "synced", corpo
    assert main.get_player_progress_level(USUARIO, 0) == 1
    assert abs(corpo["clock_offset_ms"] - UNA_HORA) < 5_000
    assert corpo["server_time_ms"] >= ahora


def test_reloj_adelantado_con_client_sent_at_un_avance_de_antes_del_reinicio_no_resucita(sitio):
    reset_ms = main.player_reset_at(USUARIO)
    ahora = int(time.time() * 1000)
    # Lo hizo un minuto ANTES del reinicio, pero el móvil va una hora adelantado.
    local_ms = reset_ms - 60_000 + UNA_HORA

    corpo = _sync(sitio, [_avance(local_ms, "b-1")], client_sent_at_ms=ahora + UNA_HORA)

    assert corpo["events"][0]["status"] == "ignored"
    assert corpo["events"][0]["error"] == "stale_before_reset"
    assert main.get_player_progress_level(USUARIO, 0) == 0


def test_sin_client_sent_at_se_conserva_el_comportamiento_de_siempre(sitio):
    """«Ausente → comportamiento actual»: se confía en la hora del móvil, para bien o para mal."""
    reset_ms = main.player_reset_at(USUARIO)

    atrasado = _sync(sitio, [_avance(reset_ms + 60_000 - UNA_HORA, "c-1")])
    assert atrasado["events"][0]["error"] == "stale_before_reset"
    assert atrasado["clock_offset_ms"] == 0

    adelantado = _sync(sitio, [_avance(reset_ms - 60_000 + UNA_HORA, "c-2")])
    assert adelantado["events"][0]["status"] == "synced"


def test_el_registro_ordena_con_la_hora_corregida_y_guarda_la_del_movil(sitio):
    ahora = int(time.time() * 1000)
    sucedio_en_servidor = ahora - 120_000  # hace dos minutos, hora del servidor
    evento = {
        "client_event_id": "q-1",
        "type": "qr_scanned",
        "node_id": "102",
        "payload": {"local_created_at": _iso(sucedio_en_servidor - UNA_HORA), "raw_value": "x"},
    }

    _sync(sitio, [evento], client_sent_at_ms=ahora - UNA_HORA)

    fila = next(e for e in main.match_log_list_timeline(user=USUARIO) if e["type"] == "qr_scanned")
    ocurrio = datetime.fromisoformat(fila["client_created_at"].replace("Z", "+00:00")).timestamp() * 1000
    assert abs(ocurrio - sucedio_en_servidor) < 5_000, "el Registro debe ordenar con la hora corregida"
    assert fila["payload"]["local_created_at_device"] == _iso(sucedio_en_servidor - UNA_HORA)
    assert abs(fila["payload"]["clock_offset_ms"] - UNA_HORA) < 5_000
