# -*- coding: utf-8 -*-
"""Contrato 6 (motivos de rechazo) y S11 (tiempo declarado imposible).

- `/api/events/sync` devolvía sólo el código interno de un rechazo: el jugador nunca
  se enteraba de que un nodo suyo no había contado (caza de fallos J3). Ahora cada
  evento rechazado lleva `stage_id`/`node_id` y un `motivo` corto en castellano.
- El tiempo por nodo y el total de la clasificación los declara el móvil. El
  servidor sólo ve CUÁNDO llega cada avance: si lo declarado no cabe entre dos
  avances, deja una SOSPECHA. Sólo flag: ni el avance ni la clasificación cambian.
"""
import os
import tempfile
import time
from datetime import datetime, timedelta, timezone

os.environ.setdefault("ADMIN_PASS", "pytest_admin_password")
os.environ.setdefault("SAGA_DATA_DIR", tempfile.mkdtemp(prefix="saga-test-motivos-"))

import pytest  # noqa: E402
from fastapi.testclient import TestClient  # noqa: E402

import main  # noqa: E402
from backend.app.runtime import anti_cheat, motivos_de_rechazo  # noqa: E402
from ruta_de_proba import preparar_mision  # noqa: E402

USUARIO = "PLAYER 1"
RAZON = "declared_time_exceeds_observed"


def _iso(minutos_atras):
    return (datetime.now(timezone.utc) - timedelta(minutes=minutos_atras)).isoformat().replace("+00:00", "Z")


@pytest.fixture
def sitio(monkeypatch, tmp_path):
    preparar_mision(monkeypatch, tmp_path)
    cliente = TestClient(main.app)
    assert cliente.get("/api/game/PLAYER%201").status_code == 200
    return cliente


def _sync(cliente, eventos):
    resposta = cliente.post("/api/events/sync", json={"user": USUARIO, "events": eventos})
    assert resposta.status_code == 200, resposta.text
    return resposta.json()["events"]


def _avance(cid, codigo="OK", level_before=0, **payload):
    return {
        "client_event_id": cid,
        "type": "node_completed",
        "source": "offline_queue",
        "payload": {"code": codigo, "level_before": level_before, **payload},
    }


def _sospechas(razon=RAZON):
    return [s for s in main.list_anti_cheat_suspicions().get(USUARIO, []) if s["reason"] == razon]


# ---------------------------------------------------------------------------
# Contrato 6: motivo + nodo en cada rechazo
# ---------------------------------------------------------------------------

def test_un_codigo_invalido_dice_el_nodo_y_el_motivo_en_castellano(sitio):
    (evento,) = _sync(sitio, [_avance("r-1", codigo="NO_VALE")])

    assert evento["status"] == "failed" and evento["error"] == "invalid_completion_code"
    assert evento["node_id"] == "101" and evento["stage_id"] == "101"
    assert evento["motivo"] == motivos_de_rechazo.MOTIVOS["invalid_completion_code"]
    assert "código" in evento["motivo"].lower()


def test_un_avance_eco_dice_de_que_nodo_era(sitio):
    main.set_player_progress_level(USUARIO, 3)  # el servidor ya va por delante

    (evento,) = _sync(sitio, [_avance("r-2", level_before=1)])

    assert evento["status"] == "ignored" and evento["error"] == "already_advanced"
    assert evento["stage_id"] == "102", "el nodo al que decía llegar (índice 1), no el que le toca ahora"
    assert evento["motivo"]


def test_un_nodo_cuyo_objeto_falta_lo_explica(sitio):
    stages = main.load_stages(main.STAGES_DB)
    stages[0]["requirements"] = {"items": [{"item_id": "llave", "quantity": 1}]}
    main.save_stages(main.STAGES_DB, stages)

    (evento,) = _sync(sitio, [_avance("r-3")])

    assert evento["error"] == "missing_required_item"
    assert evento["stage_id"] == "101"
    assert "objeto" in evento["motivo"].lower()


def test_la_mision_aun_no_empezada_tambien_lleva_motivo(monkeypatch, tmp_path):
    preparar_mision(monkeypatch, tmp_path, launch_at=(datetime.now(timezone.utc) + timedelta(days=2)).isoformat())
    cliente = TestClient(main.app)
    assert cliente.get("/api/game/PLAYER%201").status_code == 200

    (evento,) = _sync(cliente, [_avance("r-4")])

    assert evento["error"] == "mission_not_started_yet" and evento["status"] == "failed"
    assert evento["stage_id"] == "101"
    assert "empezado" in evento["motivo"]


def test_lo_aceptado_no_lleva_motivo_y_los_duplicados_conservan_el_del_original(sitio):
    (bueno,) = _sync(sitio, [_avance("ok-1")])
    assert bueno["status"] == "synced" and bueno["motivo"] is None and bueno["stage_id"] == "101"

    (malo,) = _sync(sitio, [_avance("malo-1", codigo="NO_VALE", level_before=1)])
    (repetido,) = _sync(sitio, [_avance("malo-1", codigo="NO_VALE", level_before=1)])

    assert repetido["duplicate"] is True
    assert repetido["motivo"] == malo["motivo"] and repetido["motivo"]


def test_los_eventos_que_no_son_avances_no_llevan_motivo(sitio):
    (evento,) = _sync(sitio, [{"client_event_id": "q-1", "type": "qr_scanned", "node_id": "102", "payload": {}}])

    assert evento["motivo"] is None and evento["stage_id"] == "102"


# ---------------------------------------------------------------------------
# S11: tiempo declarado imposible (sólo flag)
# ---------------------------------------------------------------------------

def _advance(cliente, level_before, **extra):
    resposta = cliente.post(
        "/api/advance", json={"user": USUARIO, "code": "OK", "level_before": level_before, **extra}
    )
    assert resposta.status_code == 200, resposta.text
    return resposta.json()


def test_un_tiempo_declarado_que_no_cabe_entre_dos_avances_deja_una_sospecha_pero_avanza(sitio):
    assert _advance(sitio, 0, time_spent_ms=1_000)["status"] == "ok"
    assert _sospechas() == [], "el primer avance no tiene anterior con el que compararse"

    # Han pasado décimas de segundo y el móvil dice que estuvo diez minutos en el nodo.
    corpo = _advance(sitio, 1, time_spent_ms=600_000)

    assert corpo["status"] == "ok" and corpo["level"] == 2, "es un flag: el avance no se bloquea"
    (sospecha,) = _sospechas()
    assert sospecha["evidence"]["declared_ms"] == 600_000
    assert sospecha["evidence"]["observed_ms"] < 60_000
    assert sospecha["severity"] == "suspicion"


def test_no_cambia_la_clasificacion_lo_declarado_se_guarda_tal_cual(sitio):
    _advance(sitio, 0, time_spent_ms=1_000)
    _advance(sitio, 1, time_spent_ms=600_000)

    assert main.get_player_stage_time_ms(USUARIO, 1) == 600_000
    assert main.get_player_total_time_ms(USUARIO) == 601_000


def test_un_tiempo_plausible_no_marca_nada(sitio):
    _advance(sitio, 0, time_spent_ms=500)
    _advance(sitio, 1, time_spent_ms=800)
    _advance(sitio, 2, time_spent_ms=0)

    assert _sospechas() == []


def test_en_la_cola_se_compara_con_la_hora_en_que_paso_no_con_la_de_subida(sitio):
    # Dos avances hechos con dos minutos de diferencia y subidos de golpe.
    eventos = [
        _avance("c-1", level_before=0, local_created_at=_iso(10), time_spent_ms=30_000),
        _avance("c-2", level_before=1, local_created_at=_iso(8), time_spent_ms=90_000),  # cabe: 2 min
    ]
    _sync(sitio, eventos)
    assert _sospechas() == []

    otros = [_avance("c-3", level_before=2, local_created_at=_iso(7.9), time_spent_ms=15 * 60_000)]  # no cabe
    _sync(sitio, otros)

    (sospecha,) = _sospechas()
    assert sospecha["evidence"]["declared_ms"] == 900_000
    assert 0 < sospecha["evidence"]["observed_ms"] < 20_000


def test_un_evento_de_la_cola_sin_hora_no_marca_ni_mueve_el_ancla(sitio):
    _sync(sitio, [_avance("s-1", level_before=0, local_created_at=_iso(5), time_spent_ms=1_000)])
    ancla = main.load_player_timers()[USUARIO]["last_advance_at_ms"]

    _sync(sitio, [_avance("s-2", level_before=1, time_spent_ms=99 * 60_000)])

    assert _sospechas() == []
    assert main.load_player_timers()[USUARIO]["last_advance_at_ms"] == ancla


def test_reiniciar_al_jugador_borra_el_ancla(sitio):
    _advance(sitio, 0, time_spent_ms=1)
    assert main.load_player_timers()[USUARIO].get("last_advance_at_ms")

    main.clear_all_player_timers(USUARIO)

    assert "last_advance_at_ms" not in main.load_player_timers()[USUARIO]


def test_la_funcion_pura_respeta_la_holgura():
    nodo = {"id": "n1"}
    assert anti_cheat.check_declared_time_vs_observed("/tmp/no-se-escribe", "u", nodo, 50_000, 10_000) is None
    assert anti_cheat.check_declared_time_vs_observed("/tmp/no-se-escribe", "u", nodo, 0, 10_000) is None
    assert anti_cheat.check_declared_time_vs_observed("/tmp/no-se-escribe", "u", nodo, 5_000, None) is None
    assert anti_cheat.check_declared_time_vs_observed("/tmp/no-se-escribe", "u", nodo, "basura", 10_000) is None
