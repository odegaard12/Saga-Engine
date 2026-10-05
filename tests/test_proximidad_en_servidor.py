# -*- coding: utf-8 -*-
"""Proximidad al nodo comprobada en el SERVIDOR (5.49).

Regla (ver backend/app/runtime/proximidad.py):
- tolerancia = radio + precisión (15..100 m, 50 si no la hay) + 40 m;
- modo prueba y rescate sin GPS pasan SIEMPRE, con nota neutra por nodo;
- lejos con GPS real: sospecha, nunca bloqueo... salvo con el interruptor
  `require_server_proximity` encendido, y sólo si la precisión es fiable.
"""
import os
import tempfile
import time

os.environ.setdefault("ADMIN_PASS", "pytest_admin_password")
os.environ.setdefault("SAGA_DATA_DIR", tempfile.mkdtemp(prefix="saga-test-proximidad-"))

from fastapi import FastAPI  # noqa: E402
from fastapi.testclient import TestClient  # noqa: E402

import main  # noqa: E402
from backend.app.routers import game as game_router  # noqa: E402
from backend.app.runtime import proximidad  # noqa: E402
from backend.app.storage.json_store import save_json  # noqa: E402
from backend.app.storage.runtime_store import save_stages  # noqa: E402

LAT, LON = 42.600, -8.700
CERCA = (LAT + 0.0005, LON)  # ~55 m: dentro de 40 + 15 + 40
LEJOS = (LAT + 0.01, LON)  # ~1,1 km


def _mision(entry_mode="gps"):
    save_stages(
        main.STAGES_DB,
        [
            {
                "id": "p0",
                "title": "Nodo 0",
                "lat": LAT,
                "lon": LON,
                "radius": 40,
                "entry_mode": entry_mode,
                "type": "signal_hunt",
                "config": {"game_id": "spark_radar", "success_code": "CLAVE7"},
            },
            {
                "id": "p1",
                "title": "Nodo 1",
                "lat": LAT,
                "lon": LON + 0.01,
                "radius": 40,
                "type": "signal_hunt",
                "config": {"game_id": "spark_radar"},
            },
        ],
    )


def _limpiar(usuario):
    save_json(main.ANTI_CHEAT_DB, {})
    save_json(main.MANUAL_POSITION_NOTICE_DB, {})
    main.set_player_progress_level(usuario, 0)
    main.clear_live_position(usuario)


def _cliente(monkeypatch, exigir=False):
    monkeypatch.setattr(main, "require_player_session", lambda *a, **k: None)
    monkeypatch.setattr(main, "enforce_player_rate_limit", lambda *a, **k: None)
    original = main.load_config

    def _config():
        cfg = dict(original())
        cfg["require_server_proximity"] = exigir
        return cfg

    monkeypatch.setattr(main, "load_config", _config)
    app = FastAPI()
    app.include_router(game_router.router)
    return TestClient(app)


def _gps(punto, acc=10, src="real"):
    return {"t": int(time.time() * 1000), "lat": punto[0], "lon": punto[1], "acc": acc, "src": src}


def _avanzar(cliente, usuario, gps=None, code="OK", manual=False):
    evidencia = {"v": 1, "via": "juego"}
    if gps is not None:
        evidencia["gps"] = gps
    return cliente.post(
        "/api/advance",
        json={"user": usuario, "code": code, "manual": manual, "level_before": 0, "time_spent_ms": 20000, "evidence": evidencia},
    ).json()


def _notas(usuario):
    return main.list_anti_cheat_suspicions(usuario).get(usuario) or []


def _motivos(usuario):
    return [n["reason"] for n in _notas(usuario)]


# --- Por defecto: anota, no bloquea --------------------------------------------


def test_cerca_avanza_sin_nada_que_anotar(monkeypatch):
    cliente = _cliente(monkeypatch)
    _mision()
    _limpiar("ProxCerca")
    r = _avanzar(cliente, "ProxCerca", [_gps(CERCA)])
    assert r["status"] == "ok" and r["level"] == 1
    assert not [m for m in _motivos("ProxCerca") if m.startswith("proximity_")]


def test_lejos_se_anota_pero_avanza(monkeypatch):
    cliente = _cliente(monkeypatch)
    _mision()
    _limpiar("ProxLejos")
    r = _avanzar(cliente, "ProxLejos", [_gps(LEJOS)])
    assert r["status"] == "ok", "por defecto NUNCA bloquea"
    assert main.get_player_progress_level("ProxLejos", 0) == 1
    nota = [n for n in _notas("ProxLejos") if n["reason"] == proximidad.RAZON_LEJOS][0]
    assert nota["severity"] == "suspicion"
    assert nota["evidence"]["distancia_minima_m"] > 1000
    assert nota["evidence"]["bloqueado"] is False
    assert "lat" not in nota["evidence"] and "lon" not in nota["evidence"], "sin coordenadas de nadie"


def test_basta_una_muestra_cerca(monkeypatch):
    cliente = _cliente(monkeypatch)
    _mision()
    _limpiar("ProxMezcla")
    r = _avanzar(cliente, "ProxMezcla", [_gps(LEJOS), _gps(CERCA)])
    assert r["status"] == "ok"
    assert proximidad.RAZON_LEJOS not in _motivos("ProxMezcla")


def test_la_posicion_en_vivo_reciente_cuenta(monkeypatch):
    cliente = _cliente(monkeypatch)
    _mision()
    _limpiar("ProxVivo")
    main.upsert_live_position_for_user(
        "ProxVivo", {"lat": CERCA[0], "lon": CERCA[1], "accuracy": 8, "last_seen": int(time.time())}
    )
    r = _avanzar(cliente, "ProxVivo", [])
    assert r["status"] == "ok"
    assert not [m for m in _motivos("ProxVivo") if m.startswith("proximity_")]


def test_la_precision_amplia_la_tolerancia_con_tope():
    _mision()
    nodo = main.get_runtime_stages()[0]
    a_150 = (LAT + 150 / 111_320, LON)
    # Con 90 m de precisión: 40 + 90 + 40 = 170 m -> cerca.
    v = proximidad.evaluar_proximidad(nodo, {"gps": [_gps(a_150, acc=90)]})
    assert v["veredicto"] == proximidad.CERCA
    # Con 10 m: 40 + 15 + 40 = 95 m -> lejos.
    v = proximidad.evaluar_proximidad(nodo, {"gps": [_gps(a_150, acc=10)]})
    assert v["veredicto"] == proximidad.LEJOS
    # Con 900 m declarados el margen se queda en 100: 180 m. A 1,1 km, lejos.
    v = proximidad.evaluar_proximidad(nodo, {"gps": [_gps(LEJOS, acc=900)]}, exigir=True)
    assert v["veredicto"] == proximidad.LEJOS
    assert v["precision_fiable"] is False
    assert v["bloquea"] is False, "un GPS que se declara malo se anota, no se bloquea"


def test_modo_prueba_pasa_siempre_y_queda_nota_por_nodo(monkeypatch):
    cliente = _cliente(monkeypatch, exigir=True)
    _mision()
    _limpiar("ProxPrueba")
    r = _avanzar(cliente, "ProxPrueba", [_gps(LEJOS, src="manual")])
    assert r["status"] == "ok", "el modo prueba existe para quien tiene el GPS roto: nunca se bloquea"
    nota = [n for n in _notas("ProxPrueba") if n["reason"] == proximidad.RAZON_MODO_PRUEBA][0]
    assert nota["severity"] == "info"
    assert nota["evidence"]["node_id"] == "p0"
    # Se ve en la revisión de tiempos (panel y exportación), sin penalizar.
    registro = main.load_player_timers()["ProxPrueba"]["nodos"]["0"]
    assert registro["proximidad"] == "modo_prueba" and registro["prueba"] is True
    assert int(main.load_player_timers()["ProxPrueba"].get("penalties_ms") or 0) == 0


def test_modo_prueba_por_la_marca_de_sesion(monkeypatch):
    cliente = _cliente(monkeypatch, exigir=True)
    _mision()
    _limpiar("ProxPruebaSesion")
    monkeypatch.setattr(main, "es_modo_prueba", lambda pid: True)
    r = _avanzar(cliente, "ProxPruebaSesion", [_gps(LEJOS)])
    assert r["status"] == "ok"
    assert proximidad.RAZON_MODO_PRUEBA in _motivos("ProxPruebaSesion")


def test_sin_gps_pasa_y_deja_nota_sin_gps(monkeypatch):
    cliente = _cliente(monkeypatch, exigir=True)
    _mision()
    _limpiar("ProxSinGps")
    r = _avanzar(cliente, "ProxSinGps", None)
    assert r["status"] == "ok", "el rescate de 45 s sin GPS no se bloquea nunca"
    nota = [n for n in _notas("ProxSinGps") if n["reason"] == proximidad.RAZON_SIN_GPS][0]
    assert nota["severity"] == "info" and nota["evidence"]["node_id"] == "p0"
    assert main.load_player_timers()["ProxSinGps"]["nodos"]["0"]["proximidad"] == "sin_gps"


def test_un_nodo_sin_entrada_gps_no_se_mira(monkeypatch):
    cliente = _cliente(monkeypatch, exigir=True)
    _mision(entry_mode="qr")
    _limpiar("ProxQr")
    r = _avanzar(cliente, "ProxQr", [_gps(LEJOS)])
    assert r["status"] == "ok"
    assert not [m for m in _motivos("ProxQr") if m.startswith("proximity_")]


# --- Interruptor «exigir proximidad en servidor» -------------------------------


def test_interruptor_rechaza_gps_real_lejos_con_motivo_claro(monkeypatch):
    cliente = _cliente(monkeypatch, exigir=True)
    _mision()
    _limpiar("ProxExigido")
    r = _avanzar(cliente, "ProxExigido", [_gps(LEJOS)])
    assert r["status"] == "fail"
    assert r["reason"] == "too_far_from_node"
    assert r["level"] == 0 and r["distance_m"] > 1000
    assert "lejos" in r["message"]
    assert main.get_player_progress_level("ProxExigido", 0) == 0
    nota = [n for n in _notas("ProxExigido") if n["reason"] == proximidad.RAZON_LEJOS][0]
    assert nota["evidence"]["bloqueado"] is True


def test_interruptor_deja_pasar_al_que_esta_cerca(monkeypatch):
    cliente = _cliente(monkeypatch, exigir=True)
    _mision()
    _limpiar("ProxExigidoCerca")
    assert _avanzar(cliente, "ProxExigidoCerca", [_gps(CERCA)])["status"] == "ok"


def test_interruptor_apagado_por_defecto():
    assert proximidad.exigir_proximidad({}) is False
    assert proximidad.exigir_proximidad({"require_server_proximity": True}) is True
    assert proximidad.exigir_proximidad({"require_server_proximity": "0"}) is False


# --- Sin cobertura: se juzga con las muestras de la cola -----------------------


def _evento(gps, cid):
    return {
        "type": "node_completed",
        "client_event_id": cid,
        "payload": {
            "code": "OK",
            "level_before": 0,
            "time_spent_ms": 20000,
            "local_created_at": "2026-10-05T10:00:00Z",
            "evidence": {"v": 1, "via": "juego", **({"gps": gps} if gps is not None else {})},
        },
    }


def _sync(cliente, usuario, gps, cid):
    return cliente.post("/api/events/sync", json={"user": usuario, "events": [_evento(gps, cid)]}).json()


def test_offline_lejos_se_anota_y_avanza(monkeypatch):
    cliente = _cliente(monkeypatch)
    _mision()
    _limpiar("ProxOffLejos")
    monkeypatch.setattr(main, "resolve_known_player_profile", lambda u, cfg=None: {"id": u, "display_name": u})
    # Una posición en vivo CERCA no salva un avance hecho sin cobertura lejos:
    # sólo cuentan las muestras de la cola.
    main.upsert_live_position_for_user(
        "ProxOffLejos", {"lat": CERCA[0], "lon": CERCA[1], "accuracy": 5, "last_seen": int(time.time())}
    )
    r = _sync(cliente, "ProxOffLejos", [_gps(LEJOS)], "off-lejos-1")
    assert r["events"][0]["status"] == "synced"
    assert main.get_player_progress_level("ProxOffLejos", 0) == 1
    assert proximidad.RAZON_LEJOS in _motivos("ProxOffLejos")


def test_offline_cerca_no_anota(monkeypatch):
    cliente = _cliente(monkeypatch)
    _mision()
    _limpiar("ProxOffCerca")
    monkeypatch.setattr(main, "resolve_known_player_profile", lambda u, cfg=None: {"id": u, "display_name": u})
    r = _sync(cliente, "ProxOffCerca", [_gps(CERCA)], "off-cerca-1")
    assert r["events"][0]["status"] == "synced"
    assert not [m for m in _motivos("ProxOffCerca") if m.startswith("proximity_")]


def test_offline_con_interruptor_rechaza_definitivo_con_motivo(monkeypatch):
    cliente = _cliente(monkeypatch, exigir=True)
    _mision()
    _limpiar("ProxOffExigido")
    monkeypatch.setattr(main, "resolve_known_player_profile", lambda u, cfg=None: {"id": u, "display_name": u})
    r = _sync(cliente, "ProxOffExigido", [_gps(LEJOS)], "off-exigido-1")
    evento = r["events"][0]
    assert evento["status"] == "failed" and evento["error"] == "too_far_from_node"
    assert "lejos" in evento["motivo"]
    assert main.get_player_progress_level("ProxOffExigido", 0) == 0
    # Reintentar da lo mismo: se contesta como duplicado del rechazo.
    otra = _sync(cliente, "ProxOffExigido", [_gps(LEJOS)], "off-exigido-1")["events"][0]
    assert otra["duplicate"] is True and otra["error"] == "too_far_from_node"


def test_offline_modo_prueba_y_sin_gps_pasan_con_interruptor(monkeypatch):
    cliente = _cliente(monkeypatch, exigir=True)
    _mision()
    _limpiar("ProxOffPrueba")
    monkeypatch.setattr(main, "resolve_known_player_profile", lambda u, cfg=None: {"id": u, "display_name": u})
    r = _sync(cliente, "ProxOffPrueba", [_gps(LEJOS, src="manual")], "off-prueba-1")
    assert r["events"][0]["status"] == "synced"
    _limpiar("ProxOffSinGps")
    r = _sync(cliente, "ProxOffSinGps", None, "off-singps-1")
    assert r["events"][0]["status"] == "synced"
    assert proximidad.RAZON_SIN_GPS in _motivos("ProxOffSinGps")


# --- Panel / exportación ----------------------------------------------------------


def test_la_revision_de_tiempos_lista_los_nodos_en_modo_prueba_y_sin_gps(monkeypatch):
    from backend.app.routers import desbloqueos as router_desbloqueos

    cliente = _cliente(monkeypatch)
    _mision()
    _limpiar("ProxPanel")
    monkeypatch.setattr(
        main, "get_player_profiles", lambda cfg=None: [{"id": "ProxPanel", "display_name": "ProxPanel"}]
    )
    _avanzar(cliente, "ProxPanel", [_gps(LEJOS, src="manual")])
    cliente.post(
        "/api/advance",
        json={"user": "ProxPanel", "code": "OK", "level_before": 1, "time_spent_ms": 20000, "evidence": {"v": 1}},
    )
    datos = router_desbloqueos._tiempos_para_revisar(main)
    jugador = datos["jugadores"][0]
    assert jugador["nodos_modo_prueba"] == ["p0"]
    assert jugador["nodos_sin_gps"] == ["p1"]
    assert jugador["suspicion_count"] == 0, "usar el modo prueba no es una sospecha ni penaliza"
