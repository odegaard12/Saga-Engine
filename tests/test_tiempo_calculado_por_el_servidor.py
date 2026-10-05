# -*- coding: utf-8 -*-
"""El tiempo de la clasificación lo decide el servidor (decide un premio de verdad).

Regla (ver backend/app/runtime/tiempos_de_nodo.py):
    tiempo del nodo = max(declarado por el móvil, observado por el servidor entre
                          la apertura del nodo y el avance aceptado), observado
                          acotado a 30 min;
    total = suma de los nodos + penalizaciones (las mínimas del servidor siempre).

Se prueba con una misión sintética de seis nodos (tests/ruta_de_proba.py): con
red, sin red (cola offline), con el reloj del móvil manipulado y el desempate por
la hora de fin. Nada de datos reales.
"""
import os
import tempfile
import time
from datetime import datetime, timezone

os.environ.setdefault("ADMIN_PASS", "pytest_admin_password")
os.environ.setdefault("SAGA_DATA_DIR", tempfile.mkdtemp(prefix="saga-test-tiempo-servidor-"))

import pytest  # noqa: E402
from fastapi.testclient import TestClient  # noqa: E402

import main  # noqa: E402
from backend.app.runtime import tiempos_de_nodo  # noqa: E402
from ruta_de_proba import preparar_mision  # noqa: E402

UNO = "PLAYER 1"
DOS = "PLAYER 2"
MIN = 60_000


def _iso(ms):
    return datetime.fromtimestamp(ms / 1000.0, tz=timezone.utc).isoformat().replace("+00:00", "Z")


def _ahora():
    return int(time.time() * 1000)


@pytest.fixture
def sitio(monkeypatch, tmp_path):
    preparar_mision(monkeypatch, tmp_path)
    monkeypatch.setattr(main, "PERSONAJES_DB", str(tmp_path / "personajes.json"))
    monkeypatch.setattr(main, "admin_request_authorized", lambda request, data: True)
    monkeypatch.setattr(main, "MANUAL_POSITION_NOTICE_DB", str(tmp_path / "aviso_manual.json"))
    main.set_player_progress_level(DOS, 0)
    uno = TestClient(main.app)
    assert uno.get("/api/game/PLAYER%201").status_code == 200
    return uno


def _cliente_de(usuario):
    cliente = TestClient(main.app)
    assert cliente.get(f"/api/game/{usuario.replace(' ', '%20')}").status_code == 200
    return cliente


def _sync(cliente, eventos, usuario=UNO, **extra):
    r = cliente.post("/api/events/sync", json={"user": usuario, "events": eventos, **extra})
    assert r.status_code == 200, r.text
    return r.json()["events"]


def _abrir(cid, nodo, en_ms):
    return {"client_event_id": cid, "type": "node_opened", "node_id": str(nodo),
            "payload": {"local_created_at": _iso(en_ms)}}


def _completar(cid, nivel, en_ms, declarado, codigo="OK", **payload):
    return {"client_event_id": cid, "type": "node_completed", "source": "offline_queue",
            "payload": {"code": codigo, "level_before": nivel, "time_spent_ms": declarado,
                        "local_created_at": _iso(en_ms), **payload}}


def _advance(cliente, nivel, usuario=UNO, **extra):
    r = cliente.post("/api/advance", json={"user": usuario, "code": "OK", "level_before": nivel, **extra})
    assert r.status_code == 200, r.text
    assert r.json()["status"] == "ok", r.json()
    return r.json()


def _registro(nivel, usuario=UNO):
    return main.load_player_timers()[usuario]["nodos"][str(nivel)]


# ---------------------------------------------------------------- la regla pura

def test_la_regla_pura_toma_el_mayor_y_acota_el_observado():
    t = tiempos_de_nodo.tiempo_de_nodo
    assert t(5_000, 1_000_000, 1_240_000)["applied_ms"] == 240_000
    assert t(5_000, 1_000_000, 1_240_000)["fuente"] == "observado"
    assert t(300_000, 1_000_000, 1_240_000)["applied_ms"] == 300_000, "declarar más sólo perjudica a quien lo hace"
    assert t(5_000, None, 1_240_000)["fuente"] == "sin_apertura"
    assert t(5_000, 1_000_000, None)["fuente"] == "sin_hora"
    largo = t(1_000, 1_000, 1_000 + 3 * 3600_000)
    assert largo["observed_ms"] == tiempos_de_nodo.TOPE_OBSERVADO_MS
    # La apertura no puede ser anterior al avance anterior, ni posterior a este.
    assert t(0, 1_000, 10_000, anterior_ms=8_000)["observed_ms"] == 2_000
    assert t(0, 12_000, 10_000)["observed_ms"] is None
    # Nada en el futuro del servidor.
    assert t(0, 5_000, 99_000, ahora_ms=20_000)["observed_ms"] == 15_000
    assert t("basura", None, None)["applied_ms"] == 0


# ---------------------------------------------------------------- con red

def test_con_red_cuenta_lo_que_el_servidor_vio_desde_que_se_abrio_el_nodo(sitio):
    _sync(sitio, [_abrir("o-1", 101, _ahora() - 4 * MIN)])
    _advance(sitio, 0, time_spent_ms=5_000)  # el móvil dice 5 s

    reg = _registro(0)
    assert reg["declared_ms"] == 5_000
    assert 4 * MIN - 2_000 <= reg["observed_ms"] <= 4 * MIN + 5_000
    assert reg["applied_ms"] == reg["observed_ms"] and reg["fuente"] == "observado"
    assert main.get_player_total_time_ms(UNO) == reg["applied_ms"]


def test_sin_apertura_vale_lo_declarado(sitio):
    _advance(sitio, 0, time_spent_ms=42_000)
    reg = _registro(0)
    assert reg["fuente"] == "sin_apertura" and reg["observed_ms"] is None
    assert main.get_player_total_time_ms(UNO) == 42_000


def test_una_apertura_que_llega_despues_del_avance_recalcula_el_nodo(sitio):
    _advance(sitio, 0, time_spent_ms=1_000)
    assert main.get_player_total_time_ms(UNO) == 1_000

    # La apertura estaba en la cola y sube en la tanda siguiente.
    _sync(sitio, [_abrir("o-tarde", 101, _ahora() - 3 * MIN)])

    reg = _registro(0)
    assert reg["fuente"] == "observado" and reg["observed_ms"] >= 3 * MIN - 2_000
    assert main.get_player_total_time_ms(UNO) == reg["applied_ms"]


def test_las_penalizaciones_minimas_del_servidor_se_suman_siempre(sitio):
    _sync(sitio, [_abrir("o-p", 101, _ahora() - 2 * MIN)])
    # El móvil pide 0 de penalización con el modo alternativo: el servidor pone su mínimo.
    _advance(sitio, 0, time_spent_ms=1_000, penalty_ms=0, evidence={"modo_alternativo": True})

    reg = _registro(0)
    total = main.get_player_total_time_ms(UNO)
    assert reg["penalty_ms"] == main.PENALIZACION_MODO_ALTERNATIVO_MS
    assert reg["applied_ms"] >= 2 * MIN - 2_000, "lo observado no se come la penalización"
    assert total == reg["applied_ms"] + main.PENALIZACION_MODO_ALTERNATIVO_MS
    assert main.penalizacion_minima(0, manual=True) == main.PENALIZACION_CODIGO_A_MANO_MS


# ---------------------------------------------------------------- sin red

def test_sin_red_se_usa_la_hora_del_evento_y_no_la_de_la_subida(sitio):
    t0 = _ahora() - 30 * MIN
    eventos = [
        _abrir("a-0", 101, t0),
        _completar("c-0", 0, t0 + 3 * MIN, 20_000),       # 3 min observados, dice 20 s
        _abrir("a-1", 102, t0 + 10 * MIN),
        _completar("c-1", 1, t0 + 11 * MIN, 90_000),      # 1 min observado, dice 90 s
    ]
    respuesta = _sync(sitio, eventos)
    assert [e["status"] for e in respuesta if e["type"] == "node_completed"] == ["synced", "synced"]

    assert _registro(0)["applied_ms"] == 3 * MIN and _registro(0)["origen"] == "offline"
    assert _registro(1)["applied_ms"] == 90_000 and _registro(1)["fuente"] == "declarado"
    # El caminar entre nodos (7 min) no cuenta.
    assert main.get_player_total_time_ms(UNO) == 3 * MIN + 90_000


def test_una_apertura_anterior_al_avance_previo_se_recorta(sitio):
    t0 = _ahora() - 20 * MIN
    _sync(sitio, [
        _completar("c-0", 0, t0, 1_000),
        _abrir("a-1-falsa", 102, t0 - 10 * MIN),           # antes de superar el nodo anterior: imposible
        _completar("c-1", 1, t0 + 2 * MIN, 1_000),
    ])
    assert _registro(1)["observed_ms"] == 2 * MIN


def test_acabar_sin_cobertura_guarda_la_hora_real_de_fin(sitio):
    t0 = _ahora() - 60 * MIN
    eventos = [_completar(f"c-{i}", i, t0 + i * MIN, 1_000) for i in range(6)]
    _sync(sitio, eventos)

    entrada = main.load_player_timers()[UNO]
    assert entrada["finished_at"] == pytest.approx(t0 + 5 * MIN, abs=1_000), "la hora en que pasó, no la de la subida"
    estado = main.project_live_profile_status({"id": UNO}, {})
    assert estado["finished"] is True and estado["finished_at"] == entrada["finished_at"]


# ---------------------------------------------------------------- reloj manipulado

def test_un_reloj_adelantado_se_corrige_con_client_sent_at(sitio):
    adelanto = 2 * 3600_000
    real = _ahora() - 10 * MIN
    eventos = [
        _abrir("a-0", 101, real + adelanto),
        _completar("c-0", 0, real + 5 * MIN + adelanto, 1_000),
    ]
    _sync(sitio, eventos, client_sent_at_ms=_ahora() + adelanto)

    reg = _registro(0)
    assert reg["observed_ms"] == pytest.approx(5 * MIN, abs=2_000)
    assert reg["completed_at_ms"] <= _ahora()


def test_un_reloj_del_futuro_sin_corregir_no_inventa_tiempo_y_queda_marcado(sitio):
    futuro = _ahora() + 3 * 3600_000
    _sync(sitio, [_abrir("a-0", 101, futuro), _completar("c-0", 0, futuro + 4 * MIN, 7_000)])

    reg = _registro(0)
    assert reg["completed_at_ms"] <= _ahora(), "nada en el futuro del servidor"
    assert (reg["observed_ms"] or 0) < 2_000 and reg["applied_ms"] == 7_000
    razones = [s["reason"] for s in main.list_anti_cheat_suspicions().get(UNO, [])]
    assert "offline_event_timestamp_in_future" in razones


def test_un_movil_que_declara_casi_nada_no_baja_su_tiempo(sitio):
    """El caso del premio: declarar 0 s no sirve si el servidor vio el nodo abierto."""
    _sync(sitio, [_abrir("a-0", 101, _ahora() - 6 * MIN)])
    _advance(sitio, 0, time_spent_ms=0)
    assert main.get_player_total_time_ms(UNO) >= 6 * MIN - 2_000


# ---------------------------------------------------------------- desempate y panel

def test_a_igual_tiempo_desempata_quien_acabo_antes(sitio):
    dos = _cliente_de(DOS)
    t0 = _ahora() - 90 * MIN
    _sync(dos, [_completar(f"d-{i}", i, t0 + i * MIN, 10_000) for i in range(6)], usuario=DOS)
    _sync(sitio, [_completar(f"u-{i}", i, t0 + 30 * MIN + i * MIN, 10_000) for i in range(6)])

    tabla = sitio.get("/api/team/PLAYER%201").json()["profiles"]
    por_id = {p["user"]: p for p in tabla}
    assert por_id[UNO]["total_time_ms"] == por_id[DOS]["total_time_ms"] == 60_000
    assert por_id[DOS]["finished_at"] < por_id[UNO]["finished_at"]


def test_el_panel_ensena_declarado_observado_aplicado_y_sospechas(sitio):
    _sync(sitio, [_abrir("a-0", 101, _ahora() - 3 * MIN)])
    _advance(sitio, 0, time_spent_ms=2_000)
    _advance(sitio, 1, time_spent_ms=40 * MIN)  # no cabe entre dos avances: sospecha

    r = sitio.post("/api/admin/tiempos", json={})
    assert r.status_code == 200, r.text
    (jugador,) = [j for j in r.json()["jugadores"] if j["user"] == UNO]
    primero, segundo = jugador["nodos"]
    assert primero["declared_ms"] == 2_000 and primero["observed_ms"] >= 3 * MIN - 2_000
    assert primero["applied_ms"] == primero["observed_ms"]
    assert segundo["applied_ms"] == segundo["declared_ms"] == 40 * MIN
    assert "declared_time_exceeds_observed" in [s["reason"] for s in segundo["sospechas"]]
    assert jugador["total_time_ms"] == main.get_player_total_time_ms(UNO)


def test_reiniciar_borra_aperturas_y_registros(sitio):
    _sync(sitio, [_abrir("a-0", 101, _ahora() - MIN)])
    _advance(sitio, 0, time_spent_ms=1_000)
    _sync(sitio, [_abrir("a-1", 102, _ahora())])
    main.clear_all_player_timers(UNO)
    entrada = main.load_player_timers()[UNO]
    assert "nodos" not in entrada and "aperturas" not in entrada
