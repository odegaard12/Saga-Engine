# -*- coding: utf-8 -*-
"""Anti-trampas del lado del servidor: velocidad, cercanía, tiempo y reloj.

Antes de esto no había NINGUNA comprobación de plausibilidad en el servidor:
`evaluate_entry` (backend/app/runtime/core_engine.py) calcula si un jugador
puede ENTRAR a un nodo según su distancia, pero nadie la llama en el
servidor -sólo existe replicada en el cliente, para la pantalla-, así que
`/api/advance` y `/api/events/sync` aceptaban un nodo completado sin mirar
dónde estaba el jugador, en cuánto tiempo, ni si el reloj del evento tenía
sentido. El único anti-trampas real vivía en el cliente (ver
tests/test_anti_trampas.py, salir de la aplicación durante un reto).

Política: FLAG, no bloqueo. Cada prueba de aquí comprueba dos cosas a la
vez -que la sospecha se anota Y que el jugador avanza igual-, porque una
comprobación que bloquea a alguien con GPS ruidoso o que jugó sin cobertura
sería peor que no tener nada.
"""
import os
import tempfile
import time
from datetime import datetime, timezone

os.environ.setdefault("ADMIN_PASS", "pytest_admin_password")
os.environ.setdefault("SAGA_DATA_DIR", tempfile.mkdtemp(prefix="saga-test-anti-trampas-"))

from fastapi import FastAPI  # noqa: E402
from fastapi.testclient import TestClient  # noqa: E402

import main  # noqa: E402
from backend.app.routers import game as game_router  # noqa: E402
from backend.app.storage.runtime_store import save_stages  # noqa: E402
from backend.app.runtime import anti_cheat as _anti_cheat  # noqa: E402

# Un punto en Catoira y otro a ~111 km (1º de latitud): de sobra para
# "imposible", cerca para "GPS ruidoso pero honesto".
LAT_BASE, LON_BASE = 42.600, -8.700
LAT_LEJOS = LAT_BASE + 1.0


def _preparar_nodo(lat=LAT_BASE, lon=LON_BASE, radius=40):
    save_stages(
        main.STAGES_DB,
        [
            {
                "id": "n0",
                "title": "Nodo 0",
                "lat": lat,
                "lon": lon,
                "radius": radius,
                "type": "checkpoint",
                "config": {"game_id": "simple_checkpoint", "success_code": "OK"},
                "success": {"code": "OK"},
            }
        ],
    )


def _limpiar_sospechas():
    from backend.app.storage.json_store import save_json
    save_json(main.ANTI_CHEAT_DB, {})


def _cliente(monkeypatch):
    monkeypatch.setattr(main, "require_player_session", lambda *a, **k: None)
    monkeypatch.setattr(main, "enforce_player_rate_limit", lambda *a, **k: None)
    # El limitador de latidos es por tiempo real; con varias pruebas seguidas
    # mandando latidos del mismo jugador de la misión de pruebas, se limpia.
    main.HEARTBEAT_LAST_SEEN_BY_KEY.clear()

    app = FastAPI()
    app.include_router(game_router.router)
    return TestClient(app)


def _un_jugador_coñecido():
    """El latido exige un perfil ya dado de alta (ver resolve_known_player_profile).

    Las pruebas de velocidad usan este, no un nombre inventado: con uno que no
    existe en la configuración de la misión el latido contesta 404 antes de
    llegar a ninguna comprobación anti-trampas.
    """
    perfiles = main.get_player_profiles(main.load_config())
    assert perfiles, "la misión de pruebas necesita al menos un jugador"
    return perfiles[0].get("id")


# --- Velocidad imposible entre dos latidos ---------------------------------


def test_velocidade_imposible_entre_dous_latidos_queda_anotada(monkeypatch):
    cliente = _cliente(monkeypatch)
    _limpiar_sospechas()
    usuario = _un_jugador_coñecido()
    main.set_player_progress_level(usuario, 0)

    # El punto "anterior" se deja hace 5 s -no dos latidos seguidos en el
    # mismo tick de reloj, que el limitador de peticiones y la resolución en
    # segundos de `last_seen` dejarían sin diferencia de tiempo que medir-.
    main.upsert_live_position_for_user(
        usuario, {"lat": LAT_BASE, "lon": LON_BASE, "accuracy": 8, "last_seen": int(time.time()) - 5}
    )
    # 111 km en esos 5 segundos: ningún jugador a pie hace esto.
    cliente.post("/api/heartbeat", json={"user": usuario, "lat": LAT_LEJOS, "lon": LON_BASE, "accuracy": 8})

    sospechas = main.list_anti_cheat_suspicions(usuario)[usuario]
    assert sospechas, "un salto de 111 km en 5 s tenía que quedar anotado"
    assert sospechas[-1]["reason"] == "impossible_travel_speed"

    # El latido en sí no se bloquea: la posición se guarda igual.
    posicion = main.get_live_position(usuario)
    assert posicion["lat"] == LAT_LEJOS


def test_xogador_honesto_con_gps_ruidoso_non_se_flaguea(monkeypatch):
    """Caminar 10 m de verdad, con un GPS que dice que igual son 60.

    Esta es la prueba que de verdad importa: un GPS de móvil normal en el
    monte fácilmente "salta" varias decenas de metros entre dos lecturas sin
    que el jugador se haya movido nada. Si esto se flaguea, el anti-trampas
    hace más daño que las trampas.
    """
    cliente = _cliente(monkeypatch)
    _limpiar_sospechas()
    usuario = _un_jugador_coñecido()
    main.set_player_progress_level(usuario, 0)

    main.upsert_live_position_for_user(
        usuario, {"lat": LAT_BASE, "lon": LON_BASE, "accuracy": 45, "last_seen": int(time.time()) - 5}
    )
    # Un pequeño desplazamiento real (~10 m) 5 s después, con un GPS igual de
    # ruidoso: nada de esto debería parecer una carrera imposible.
    cliente.post(
        "/api/heartbeat",
        json={"user": usuario, "lat": LAT_BASE + 0.0001, "lon": LON_BASE, "accuracy": 45},
    )

    assert main.list_anti_cheat_suspicions(usuario)[usuario] == []


def test_primeiro_latido_da_sesion_non_ten_anterior_que_comparar(monkeypatch):
    """Sin un punto "antes", no hay velocidad que calcular."""
    cliente = _cliente(monkeypatch)
    _limpiar_sospechas()
    usuario = _un_jugador_coñecido()
    main.set_player_progress_level(usuario, 0)
    main.upsert_live_position_for_user(usuario, {})

    cliente.post("/api/heartbeat", json={"user": usuario, "lat": LAT_LEJOS, "lon": LON_BASE, "accuracy": 8})

    assert main.list_anti_cheat_suspicions(usuario)[usuario] == []


# --- Nodo completado sin estar cerca ---------------------------------------


def test_nodo_completado_sen_estar_cerca_queda_anotado_pero_avanza(monkeypatch):
    cliente = _cliente(monkeypatch)
    _preparar_nodo()
    _limpiar_sospechas()
    usuario = "LonxeDoNodo"
    main.set_player_progress_level(usuario, 0)
    # El jugador dice estar a un grado de latitud del nodo -~111 km-.
    main.upsert_live_position_for_user(usuario, {"lat": LAT_LEJOS, "lon": LON_BASE, "accuracy": 10})

    resposta = cliente.post(
        "/api/advance",
        json={"user": usuario, "code": "OK", "time_spent_ms": 15000, "level_before": 0},
    )

    assert resposta.json()["status"] == "ok"
    assert main.get_player_progress_level(usuario, 0) == 1, "la sospecha no puede bloquear el avance"

    sospechas = main.list_anti_cheat_suspicions(usuario)[usuario]
    assert any(s["reason"] == "node_completed_without_proximity" for s in sospechas)


def test_nodo_completado_cerca_non_se_flaguea(monkeypatch):
    cliente = _cliente(monkeypatch)
    _preparar_nodo()
    _limpiar_sospechas()
    usuario = "CercaDoNodo"
    main.set_player_progress_level(usuario, 0)
    main.upsert_live_position_for_user(usuario, {"lat": LAT_BASE, "lon": LON_BASE, "accuracy": 10})

    cliente.post(
        "/api/advance",
        json={"user": usuario, "code": "OK", "time_spent_ms": 15000, "level_before": 0},
    )

    assert main.list_anti_cheat_suspicions(usuario)[usuario] == []


def test_sen_posicion_coñecida_non_se_flaguea_por_proximidade(monkeypatch):
    """Sin GPS no hay nada que comparar: no se flaguea por no tener GPS."""
    cliente = _cliente(monkeypatch)
    _preparar_nodo()
    _limpiar_sospechas()
    usuario = "SenGps"
    main.set_player_progress_level(usuario, 0)

    cliente.post(
        "/api/advance",
        json={"user": usuario, "code": "OK", "time_spent_ms": 15000, "level_before": 0},
    )

    assert main.list_anti_cheat_suspicions(usuario)[usuario] == []


# --- Reto superado demasiado rápido -----------------------------------------


def test_reto_superado_en_tempo_imposible_queda_anotado(monkeypatch):
    cliente = _cliente(monkeypatch)
    _preparar_nodo()
    _limpiar_sospechas()
    usuario = "MoiRapido"
    main.set_player_progress_level(usuario, 0)
    main.upsert_live_position_for_user(usuario, {"lat": LAT_BASE, "lon": LON_BASE, "accuracy": 10})

    cliente.post(
        "/api/advance",
        json={"user": usuario, "code": "OK", "time_spent_ms": 40, "level_before": 0},
    )

    sospechas = main.list_anti_cheat_suspicions(usuario)[usuario]
    assert any(s["reason"] == "completion_faster_than_possible" for s in sospechas)
    assert main.get_player_progress_level(usuario, 0) == 1


def test_reto_con_tempo_normal_non_se_flaguea(monkeypatch):
    cliente = _cliente(monkeypatch)
    _preparar_nodo()
    _limpiar_sospechas()
    usuario = "TempoNormal"
    main.set_player_progress_level(usuario, 0)
    main.upsert_live_position_for_user(usuario, {"lat": LAT_BASE, "lon": LON_BASE, "accuracy": 10})

    cliente.post(
        "/api/advance",
        json={"user": usuario, "code": "OK", "time_spent_ms": 20000, "level_before": 0},
    )

    assert main.list_anti_cheat_suspicions(usuario)[usuario] == []


# --- Eventos offline con fecha futura ---------------------------------------


def _evento_node_completed(local_created_at_iso, level_before=0):
    return {
        "type": "node_completed",
        "source": "offline_queue",
        "client_event_id": f"futuro:{local_created_at_iso}",
        "payload": {
            "code": "OK",
            "level_before": level_before,
            "local_created_at": local_created_at_iso,
        },
    }


def test_evento_offline_con_data_futura_queda_anotado(monkeypatch):
    _preparar_nodo()
    _limpiar_sospechas()
    usuario = "RelojAdiantado"
    main.set_player_progress_level(usuario, 0)
    main.upsert_live_position_for_user(usuario, {"lat": LAT_BASE, "lon": LON_BASE, "accuracy": 10})

    # Media hora en el futuro: muy por encima del margen de reloj (5 min).
    futuro = datetime.fromtimestamp(time.time() + 1800, timezone.utc).isoformat().replace("+00:00", "Z")
    perfil = main.get_player_profile(usuario)
    normalizado = main.normalize_player_event(_evento_node_completed(futuro), usuario, perfil)
    guardado = main.apply_synced_player_event(normalizado, usuario, perfil)

    assert guardado["status"] == "synced", "la sospecha no puede bloquear la sincronización"
    sospechas = main.list_anti_cheat_suspicions(usuario)[usuario]
    assert any(s["reason"] == "offline_event_timestamp_in_future" for s in sospechas)


def test_evento_offline_con_desfase_de_reloj_pequeno_non_se_flaguea(monkeypatch):
    """El reloj de un móvil sin red puede ir un poco adelantado, y no es trampa."""
    _preparar_nodo()
    _limpiar_sospechas()
    usuario = "RelojUnPocoAdiantado"
    main.set_player_progress_level(usuario, 0)
    main.upsert_live_position_for_user(usuario, {"lat": LAT_BASE, "lon": LON_BASE, "accuracy": 10})

    # 30 s por delante: dentro del margen de tolerancia (5 min).
    casi_ahora = datetime.fromtimestamp(time.time() + 30, timezone.utc).isoformat().replace("+00:00", "Z")
    perfil = main.get_player_profile(usuario)
    normalizado = main.normalize_player_event(_evento_node_completed(casi_ahora), usuario, perfil)
    main.apply_synced_player_event(normalizado, usuario, perfil)

    assert main.list_anti_cheat_suspicions(usuario)[usuario] == []


# --- El propio cálculo de distancia -----------------------------------------


def test_haversine_distancia_cero_no_mesmo_punto():
    assert _anti_cheat.haversine_m(LAT_BASE, LON_BASE, LAT_BASE, LON_BASE) == 0


def test_haversine_un_grado_de_latitude_son_preto_de_111_km():
    distancia = _anti_cheat.haversine_m(LAT_BASE, LON_BASE, LAT_LEJOS, LON_BASE)
    assert 110_000 < distancia < 112_000
