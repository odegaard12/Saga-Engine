# -*- coding: utf-8 -*-
"""Anti-trampas del lado del servidor: velocidad, tiempo y reloj.

Antes de esto no había NINGUNA comprobación de plausibilidad en el servidor:
`evaluate_entry` (backend/app/runtime/core_engine.py) calcula si un jugador
puede ENTRAR a un nodo según su distancia, pero nadie la llama en el
servidor -sólo existe replicada en el cliente, para la pantalla-, así que
`/api/advance` y `/api/events/sync` aceptaban un nodo completado sin mirar en
cuánto tiempo ni si el reloj del evento tenía sentido. El único anti-trampas
real vivía en el cliente (ver tests/test_anti_trampas.py, salir de la
aplicación durante un reto).

Política: FLAG, no bloqueo. Cada prueba de aquí comprueba dos cosas a la
vez -que la sospecha se anota Y que el jugador avanza igual-, porque una
comprobación que bloquea a alguien con GPS ruidoso o que jugó sin cobertura
sería peor que no tener nada.

⚠️ No hay pruebas de "nodo completado lejos de su sitio": esa comprobación se
quitó del todo (ver backend/app/runtime/anti_cheat.py). El GPS en el monte
falla demasiado a menudo para que valiera la pena, y acusaba a jugadores
honestos casi tan seguido como a quien hacía trampa.
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
from backend.app.storage.json_store import save_json  # noqa: E402
from backend.app.runtime import anti_cheat as _anti_cheat  # noqa: E402

# Un punto en Catoira y otro a ~111 km (1º de latitud): de sobra para
# "imposible", cerca para "GPS ruidoso pero honesto".
LAT_BASE, LON_BASE = 42.600, -8.700
LAT_LEJOS = LAT_BASE + 1.0


def _preparar_nodo(lat=LAT_BASE, lon=LON_BASE, radius=40):
    """Una misión de un solo nodo -checkpoint-, para las pruebas que no
    necesitan "estar entre dos nodos" (tiempo de reto, reloj del evento)."""
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


def _preparar_nodo_minixogo(lat=LAT_BASE, lon=LON_BASE, radius=40, game_id="spark_radar"):
    """Un checkpoint (n0) seguido de un minijuego (n1).

    Hace falta un `n0` para poder completarlo y quedar "entre nodos" en `n1`
    -condición de check_travel_speed- y para las pruebas de tiempo de reto,
    que sólo se comprueban en un minijuego, no en un checkpoint.
    """
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
                "config": {"game_id": "simple_checkpoint"},
            },
            {
                "id": "n1",
                "title": "Nodo 1",
                "lat": lat,
                "lon": lon,
                "radius": radius,
                "type": "signal_hunt",
                "config": {"game_id": game_id},
            },
        ],
    )


def _limpiar_sospechas():
    save_json(main.ANTI_CHEAT_DB, {})
    save_json(main.SPEED_STREAK_DB, {})
    save_json(main.COMPLETION_TIME_SAMPLES_DB, {})
    save_json(main.MANUAL_POSITION_NOTICE_DB, {})


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


def _latido(cliente, usuario, lat, lon, accuracy, hace_s=0, source=None):
    """Un latido, con la posición "anterior" dejada `hace_s` segundos antes.

    Sin ese hueco, dos latidos seguidos en el mismo tick de reloj -el
    limitador de peticiones y la resolución en segundos de `last_seen`- no
    dejan diferencia de tiempo que medir.

    Y aparte del `enforce_player_rate_limit` que ya se parchea en `_cliente`,
    el propio latido tiene SU limitador de verdad -por IP y tiempo real, no
    mockeable- para no saturar la Raspberry: dos latidos seguidos DE VERDAD
    en la misma prueba lo disparan con un 429 antes de llegar a ninguna
    comprobación anti-trampas. Aquí no importa -las pruebas simulan tramos
    espaciados, nunca latidos reales pegados-, así que se limpia antes de
    cada uno.

    `source` deja mandar `manual` (posición debug) igual que hace el cliente
    real (ver PlayerApp.tsx, heartbeatSourceRef).
    """
    main.HEARTBEAT_LAST_SEEN_BY_KEY.clear()
    if hace_s:
        anterior = main.get_live_position(usuario) or {}
        main.upsert_live_position_for_user(
            usuario,
            {**anterior, "last_seen": int(time.time()) - hace_s},
        )
    body = {"user": usuario, "lat": lat, "lon": lon, "accuracy": accuracy}
    if source:
        body["source"] = source
    return cliente.post("/api/heartbeat", json=body)


# --- Velocidad imposible ENTRE NODOS, sostenida ------------------------------


def test_viaxe_en_coche_a_pe_do_primeiro_nodo_non_se_flaguea(monkeypatch):
    """De casa al primer nodo se puede ir en coche: no hay "entre nodos" que vigilar."""
    cliente = _cliente(monkeypatch)
    _preparar_nodo_minixogo()
    _limpiar_sospechas()
    usuario = _un_jugador_coñecido()
    main.set_player_progress_level(usuario, 0)  # Aún no completó ni el primer nodo.

    main.upsert_live_position_for_user(
        usuario, {"lat": LAT_BASE, "lon": LON_BASE, "accuracy": 8, "last_seen": int(time.time()) - 5}
    )
    # 111 km en 5 s: velocidad de coche/avión, imposible a pie -pero antes de
    # completar el primer nodo, así que no cuenta.
    _latido(cliente, usuario, LAT_LEJOS, LON_BASE, 8)

    assert main.list_anti_cheat_suspicions(usuario)[usuario] == []


def test_un_salto_de_gps_soamente_entre_nodos_non_se_flaguea(monkeypatch):
    """Ya entre nodos, un ÚNICO tramo implausible no basta: puede ser un GPS ruidoso."""
    cliente = _cliente(monkeypatch)
    _preparar_nodo_minixogo()
    _limpiar_sospechas()
    usuario = _un_jugador_coñecido()
    main.set_player_progress_level(usuario, 1)  # Completó n0, va camino de n1.

    main.upsert_live_position_for_user(
        usuario, {"lat": LAT_BASE, "lon": LON_BASE, "accuracy": 8, "last_seen": int(time.time()) - 5}
    )
    _latido(cliente, usuario, LAT_LEJOS, LON_BASE, 8)
    assert main.list_anti_cheat_suspicions(usuario)[usuario] == [], (
        "un único tramo implausible no puede bastar: es justo lo que un GPS ruidoso hace solo"
    )

    # Y si el siguiente tramo vuelve a ser plausible, la racha se olvida:
    # otro salto suelto más adelante tampoco debería flaguear de golpe.
    _latido(cliente, usuario, LAT_LEJOS, LON_BASE, 8, hace_s=5)
    assert main.list_anti_cheat_suspicions(usuario)[usuario] == []


def test_velocidade_imposible_sostida_entre_nodos_queda_anotada(monkeypatch):
    """DOS tramos consecutivos implausibles entre nodos sí es sospechoso."""
    cliente = _cliente(monkeypatch)
    _preparar_nodo_minixogo()
    _limpiar_sospechas()
    usuario = _un_jugador_coñecido()
    main.set_player_progress_level(usuario, 1)  # Completó n0, va camino de n1.

    main.upsert_live_position_for_user(
        usuario, {"lat": LAT_BASE, "lon": LON_BASE, "accuracy": 8, "last_seen": int(time.time()) - 5}
    )
    # Primer salto: aún no flaguea -es sólo el primer tramo de la racha-.
    _latido(cliente, usuario, LAT_LEJOS, LON_BASE, 8)
    assert main.list_anti_cheat_suspicions(usuario)[usuario] == []

    # Segundo tramo, también implausible, que sigue desde el punto anterior:
    # dos de dos, ya no es un salto suelto.
    _latido(cliente, usuario, LAT_LEJOS + 1.0, LON_BASE, 8, hace_s=5)

    sospechas = main.list_anti_cheat_suspicions(usuario)[usuario]
    assert sospechas, "dos tramos consecutivos de velocidad imposible tenían que quedar anotados"
    assert sospechas[-1]["reason"] == "impossible_travel_speed"
    assert sospechas[-1]["evidence"]["consecutive_segments"] >= 2

    # El latido en sí no se bloquea: la posición se guarda igual.
    posicion = main.get_live_position(usuario)
    assert posicion["lat"] == LAT_LEJOS + 1.0


def test_xogador_honesto_con_gps_ruidoso_non_se_flaguea(monkeypatch):
    """Caminar 10 m de verdad, con un GPS que dice que igual son 60.

    Esta es la prueba que de verdad importa: un GPS de móvil normal en el
    monte fácilmente "salta" varias decenas de metros entre dos lecturas sin
    que el jugador se haya movido nada. Si esto se flaguea, el anti-trampas
    hace más daño que las trampas.
    """
    cliente = _cliente(monkeypatch)
    _preparar_nodo_minixogo()
    _limpiar_sospechas()
    usuario = _un_jugador_coñecido()
    main.set_player_progress_level(usuario, 1)

    main.upsert_live_position_for_user(
        usuario, {"lat": LAT_BASE, "lon": LON_BASE, "accuracy": 45, "last_seen": int(time.time()) - 5}
    )
    # Un pequeño desplazamiento real (~10 m) 5 s después, con un GPS igual de
    # ruidoso: nada de esto debería parecer una carrera imposible.
    _latido(cliente, usuario, LAT_BASE + 0.0001, LON_BASE, 45)

    assert main.list_anti_cheat_suspicions(usuario)[usuario] == []


def test_primeiro_latido_da_sesion_non_ten_anterior_que_comparar(monkeypatch):
    """Sin un punto "antes", no hay velocidad que calcular."""
    cliente = _cliente(monkeypatch)
    _preparar_nodo_minixogo()
    _limpiar_sospechas()
    usuario = _un_jugador_coñecido()
    main.set_player_progress_level(usuario, 1)
    main.upsert_live_position_for_user(usuario, {})

    _latido(cliente, usuario, LAT_LEJOS, LON_BASE, 8)

    assert main.list_anti_cheat_suspicions(usuario)[usuario] == []


def test_velocidade_imposible_ao_rematar_a_mision_non_se_flaguea(monkeypatch):
    """Con la misión ya acabada no hay "entre nodos" que vigilar."""
    cliente = _cliente(monkeypatch)
    _preparar_nodo_minixogo()
    _limpiar_sospechas()
    usuario = _un_jugador_coñecido()
    main.set_player_progress_level(usuario, 2)  # len(stages) == 2: ya acabó.

    main.upsert_live_position_for_user(
        usuario, {"lat": LAT_BASE, "lon": LON_BASE, "accuracy": 8, "last_seen": int(time.time()) - 5}
    )
    _latido(cliente, usuario, LAT_LEJOS, LON_BASE, 8)
    _latido(cliente, usuario, LAT_LEJOS + 1.0, LON_BASE, 8, hace_s=5)

    assert main.list_anti_cheat_suspicions(usuario)[usuario] == []


# --- Posición manual/debug: nunca velocidad implausible, nota neutra -------


def test_teletransporte_manual_entre_nodos_non_se_flaguea(monkeypatch):
    """Dos latidos MANUALES con velocidad imposible: es justo lo que el modo
    prueba tiene que permitir -teletransportarse a mano-, nunca sospecha."""
    cliente = _cliente(monkeypatch)
    _preparar_nodo_minixogo()
    _limpiar_sospechas()
    usuario = _un_jugador_coñecido()
    main.set_player_progress_level(usuario, 1)

    main.upsert_live_position_for_user(
        usuario,
        {"lat": LAT_BASE, "lon": LON_BASE, "accuracy": 8, "last_seen": int(time.time()) - 5, "source": "manual"},
    )
    _latido(cliente, usuario, LAT_LEJOS, LON_BASE, 8, source="manual")
    _latido(cliente, usuario, LAT_LEJOS + 1.0, LON_BASE, 8, hace_s=5, source="manual")

    sospechas = main.list_anti_cheat_suspicions(usuario)[usuario]
    assert not any(s["reason"] == "impossible_travel_speed" for s in sospechas)


def test_cambio_de_manual_a_gps_real_non_se_flaguea(monkeypatch):
    """Real -> manual -> real: ninguno de los dos saltos cuenta como velocidad."""
    cliente = _cliente(monkeypatch)
    _preparar_nodo_minixogo()
    _limpiar_sospechas()
    usuario = _un_jugador_coñecido()
    main.set_player_progress_level(usuario, 1)

    main.upsert_live_position_for_user(
        usuario, {"lat": LAT_BASE, "lon": LON_BASE, "accuracy": 8, "last_seen": int(time.time()) - 5, "source": "player"}
    )
    # Salto real -> manual, lejísimos: no debería contar como tramo 1 de la racha.
    _latido(cliente, usuario, LAT_LEJOS, LON_BASE, 8, source="manual")
    # Vuelta a GPS real, otro salto lejos: tampoco debería contar.
    _latido(cliente, usuario, LAT_BASE, LON_BASE, 8, hace_s=5, source="player")

    sospechas = main.list_anti_cheat_suspicions(usuario)[usuario]
    assert not any(s["reason"] == "impossible_travel_speed" for s in sospechas)


def test_posicion_manual_deixa_nota_neutra_unha_soa_vez_por_sesion(monkeypatch):
    """Usar el modo prueba se anota, pero como nota INFO, no como sospecha, y
    como mucho una vez mientras siga en manual."""
    cliente = _cliente(monkeypatch)
    _preparar_nodo_minixogo()
    _limpiar_sospechas()
    usuario = _un_jugador_coñecido()
    main.set_player_progress_level(usuario, 1)
    main.upsert_live_position_for_user(
        usuario, {"lat": LAT_BASE, "lon": LON_BASE, "accuracy": 8, "last_seen": int(time.time()) - 5, "source": "manual"}
    )

    _latido(cliente, usuario, LAT_BASE, LON_BASE, 8, source="manual")
    _latido(cliente, usuario, LAT_BASE, LON_BASE, 8, hace_s=5, source="manual")

    notas = [
        s for s in main.list_anti_cheat_suspicions(usuario)[usuario]
        if s["reason"] == "manual_position_used"
    ]
    assert len(notas) == 1, "dos latidos manuales seguidos: una sola nota, no dos"
    assert notas[0]["severity"] == "info"

    # Vuelve a GPS real y a manual otra vez: es otra sesión, se anota de nuevo.
    _latido(cliente, usuario, LAT_BASE, LON_BASE, 8, hace_s=5, source="player")
    _latido(cliente, usuario, LAT_BASE, LON_BASE, 8, hace_s=5, source="manual")
    notas = [
        s for s in main.list_anti_cheat_suspicions(usuario)[usuario]
        if s["reason"] == "manual_position_used"
    ]
    assert len(notas) == 2


# --- Reto superado demasiado rápido (sólo minijuegos) -----------------------


def test_reto_superado_en_tempo_imposible_queda_anotado(monkeypatch):
    cliente = _cliente(monkeypatch)
    _preparar_nodo_minixogo()
    _limpiar_sospechas()
    usuario = "MoiRapido"
    main.set_player_progress_level(usuario, 1)  # En n1, el minijuego.
    main.upsert_live_position_for_user(usuario, {"lat": LAT_BASE, "lon": LON_BASE, "accuracy": 10, "last_seen": int(time.time())})

    cliente.post(
        "/api/advance",
        json={"user": usuario, "code": "OK", "time_spent_ms": 40, "level_before": 1},
    )

    sospechas = main.list_anti_cheat_suspicions(usuario)[usuario]
    assert any(s["reason"] == "completion_faster_than_possible" for s in sospechas)
    assert main.get_player_progress_level(usuario, 0) == 2


def test_reto_con_tempo_normal_non_se_flaguea(monkeypatch):
    cliente = _cliente(monkeypatch)
    _preparar_nodo_minixogo()
    _limpiar_sospechas()
    usuario = "TempoNormal"
    main.set_player_progress_level(usuario, 1)
    main.upsert_live_position_for_user(usuario, {"lat": LAT_BASE, "lon": LON_BASE, "accuracy": 10, "last_seen": int(time.time())})

    cliente.post(
        "/api/advance",
        json={"user": usuario, "code": "OK", "time_spent_ms": 20000, "level_before": 1},
    )

    assert main.list_anti_cheat_suspicions(usuario)[usuario] == []


def test_checkpoint_superado_ao_instante_non_se_flaguea(monkeypatch):
    """Un checkpoint se supera con un toque: no hay partida que cronometrar."""
    cliente = _cliente(monkeypatch)
    _preparar_nodo_minixogo()
    _limpiar_sospechas()
    usuario = "CheckpointInstantaneo"
    main.set_player_progress_level(usuario, 0)  # En n0, el checkpoint.
    main.upsert_live_position_for_user(usuario, {"lat": LAT_BASE, "lon": LON_BASE, "accuracy": 10, "last_seen": int(time.time())})

    cliente.post(
        "/api/advance",
        json={"user": usuario, "code": "OK", "time_spent_ms": 0, "level_before": 0},
    )

    assert main.list_anti_cheat_suspicions(usuario)[usuario] == [], (
        "un checkpoint no juega partida ninguna: 0 ms es lo normal, no una trampa"
    )
    assert main.get_player_progress_level(usuario, 0) == 1


# --- Mínimo de tiempo: suelo conservador + red de seguridad por mediana ----


def test_circuito_de_17s_non_se_flaguea(monkeypatch):
    """logic_circuit medido en la ruta real (~17 s) no puede quedar marcado:
    muy por encima del suelo genérico de 2 s, sin necesidad de mediana."""
    cliente = _cliente(monkeypatch)
    _preparar_nodo_minixogo(game_id="logic_circuit")
    _limpiar_sospechas()
    usuario = "Circuito17s"
    main.set_player_progress_level(usuario, 1)
    main.upsert_live_position_for_user(usuario, {"lat": LAT_BASE, "lon": LON_BASE, "accuracy": 10, "last_seen": int(time.time())})

    cliente.post(
        "/api/advance",
        json={"user": usuario, "code": "OK", "time_spent_ms": 17000, "level_before": 1},
    )

    assert main.list_anti_cheat_suspicions(usuario)[usuario] == []


def test_minixogo_sen_entrada_na_taboa_usa_o_suelo_xenerico(monkeypatch):
    """Un game_id sin suelo físico propio no queda sin comprobar: cae en el
    suelo genérico de MIN_PLAUSIBLE_STAGE_MS."""
    cliente = _cliente(monkeypatch)
    _preparar_nodo_minixogo(game_id="minixogo_novo_sen_taboa")
    _limpiar_sospechas()
    usuario = "SenTaboa"
    main.set_player_progress_level(usuario, 1)
    main.upsert_live_position_for_user(usuario, {"lat": LAT_BASE, "lon": LON_BASE, "accuracy": 10, "last_seen": int(time.time())})

    cliente.post(
        "/api/advance",
        json={"user": usuario, "code": "OK", "time_spent_ms": 40, "level_before": 1},
    )

    sospechas = main.list_anti_cheat_suspicions(usuario)[usuario]
    assert any(s["reason"] == "completion_faster_than_possible" for s in sospechas)
    assert sospechas[-1]["evidence"]["min_plausible_ms"] == _anti_cheat.MIN_PLAUSIBLE_STAGE_MS


def test_tempo_de_1s_con_mediana_da_mision_en_1_2s_non_se_flaguea(monkeypatch):
    """Un minijuego cuya mediana real en esta misión ya es de 1-2 s: un nuevo
    tiempo de 1 s está por debajo del suelo genérico (2 s), pero cerca de lo
    que de verdad se está viendo aquí -no es sospechoso, es rápido de verdad.

    Las cinco partidas previas (1.2-1.8 s) también quedan por debajo del
    suelo genérico y sin base propia todavía para juzgarlas -así que se
    flaguean ellas mismas, como el resto de este minijuego "rápido de serie"-;
    lo que importa aquí es que quedan REGISTRADAS, y que con esas cinco ya
    apuntadas, la SEXTA (la que se comprueba) deja de flaguearse."""
    cliente = _cliente(monkeypatch)
    _preparar_nodo_minixogo(game_id="spark_radar")
    _limpiar_sospechas()

    for i, ms in enumerate([1200, 1400, 1500, 1600, 1800]):
        jugador = f"Previo{i}"
        main.set_player_progress_level(jugador, 1)
        main.upsert_live_position_for_user(jugador, {"lat": LAT_BASE, "lon": LON_BASE, "accuracy": 10, "last_seen": int(time.time())})
        cliente.post(
            "/api/advance",
            json={"user": jugador, "code": "OK", "time_spent_ms": ms, "level_before": 1},
        )

    usuario = "Rapido1s"
    main.set_player_progress_level(usuario, 1)
    main.upsert_live_position_for_user(usuario, {"lat": LAT_BASE, "lon": LON_BASE, "accuracy": 10, "last_seen": int(time.time())})

    cliente.post(
        "/api/advance",
        json={"user": usuario, "code": "OK", "time_spent_ms": 1000, "level_before": 1},
    )

    assert main.list_anti_cheat_suspicions(usuario)[usuario] == []


def test_tempo_absurdo_de_0_3s_con_mediana_de_20s_si_se_flaguea(monkeypatch):
    """Con una mediana real de ~20 s en esta misión, 0.3 s sigue siendo
    absurdo -la red de seguridad no perdona TODO lo que esté bajo el suelo,
    sólo lo que está cerca de la mediana observada."""
    cliente = _cliente(monkeypatch)
    _preparar_nodo_minixogo(game_id="logic_circuit")
    _limpiar_sospechas()

    for i, ms in enumerate([18000, 19000, 20000, 21000, 22000]):
        jugador = f"Normal{i}"
        main.set_player_progress_level(jugador, 1)
        main.upsert_live_position_for_user(jugador, {"lat": LAT_BASE, "lon": LON_BASE, "accuracy": 10, "last_seen": int(time.time())})
        cliente.post(
            "/api/advance",
            json={"user": jugador, "code": "OK", "time_spent_ms": ms, "level_before": 1},
        )
    for i in range(5):
        assert main.list_anti_cheat_suspicions(f"Normal{i}")[f"Normal{i}"] == []

    usuario = "Absurdo0_3s"
    main.set_player_progress_level(usuario, 1)
    main.upsert_live_position_for_user(usuario, {"lat": LAT_BASE, "lon": LON_BASE, "accuracy": 10, "last_seen": int(time.time())})

    cliente.post(
        "/api/advance",
        json={"user": usuario, "code": "OK", "time_spent_ms": 300, "level_before": 1},
    )

    sospechas = main.list_anti_cheat_suspicions(usuario)[usuario]
    assert any(s["reason"] == "completion_faster_than_possible" for s in sospechas)


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
    main.upsert_live_position_for_user(usuario, {"lat": LAT_BASE, "lon": LON_BASE, "accuracy": 10, "last_seen": int(time.time())})

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
    main.upsert_live_position_for_user(usuario, {"lat": LAT_BASE, "lon": LON_BASE, "accuracy": 10, "last_seen": int(time.time())})

    # 30 s por delante: dentro del margen de tolerancia (5 min).
    casi_ahora = datetime.fromtimestamp(time.time() + 30, timezone.utc).isoformat().replace("+00:00", "Z")
    perfil = main.get_player_profile(usuario)
    normalizado = main.normalize_player_event(_evento_node_completed(casi_ahora), usuario, perfil)
    main.apply_synced_player_event(normalizado, usuario, perfil)

    # Sin muestras de GPS en la cola queda la nota NEUTRA «sin GPS» (5.49,
    # proximidad en el servidor); sospechas, ninguna.
    assert [s for s in main.list_anti_cheat_suspicions(usuario)[usuario] if s.get("severity") != "info"] == []


# --- Salir de la app / abrir el selector durante un minijuego (cliente) -----


def test_evento_de_saida_da_app_reportado_polo_cliente_queda_anotado(monkeypatch):
    """El cliente ya decidió que fue una salida (useAntiTrampas.ts); el
    servidor sólo la anota -no la vuelve a evaluar, no puede: no ve la
    pantalla del móvil-."""
    _preparar_nodo_minixogo()
    _limpiar_sospechas()
    usuario = "SairDaApp"
    main.set_player_progress_level(usuario, 1)

    evento = {
        "type": "qr_scanned",
        "source": "manual",
        "node_id": "n1",
        "client_event_id": "salida:1",
        "payload": {
            "anti_cheat_reason": "left_app_during_minigame",
            "game_id": "spark_radar",
            "stage_title": "Nodo 1",
        },
    }
    perfil = main.get_player_profile(usuario)
    normalizado = main.normalize_player_event(evento, usuario, perfil)
    main.apply_synced_player_event(normalizado, usuario, perfil)

    sospechas = main.list_anti_cheat_suspicions(usuario)[usuario]
    assert any(s["reason"] == "left_app_during_minigame" for s in sospechas)
    assert sospechas[-1]["evidence"]["node_id"] == "n1"
    assert sospechas[-1]["evidence"]["game_id"] == "spark_radar"


def test_evento_de_selector_de_apps_reportado_polo_cliente_queda_anotado(monkeypatch):
    _preparar_nodo_minixogo()
    _limpiar_sospechas()
    usuario = "SelectorDeApps"
    main.set_player_progress_level(usuario, 1)

    evento = {
        "type": "qr_scanned",
        "source": "manual",
        "node_id": "n1",
        "client_event_id": "selector:1",
        "payload": {
            "anti_cheat_reason": "opened_app_switcher_during_minigame",
            "game_id": "spark_radar",
            "stage_title": "Nodo 1",
        },
    }
    perfil = main.get_player_profile(usuario)
    normalizado = main.normalize_player_event(evento, usuario, perfil)
    main.apply_synced_player_event(normalizado, usuario, perfil)

    sospechas = main.list_anti_cheat_suspicions(usuario)[usuario]
    assert any(s["reason"] == "opened_app_switcher_during_minigame" for s in sospechas)


# --- El propio cálculo de distancia -----------------------------------------


def test_haversine_distancia_cero_no_mesmo_punto():
    assert _anti_cheat.haversine_m(LAT_BASE, LON_BASE, LAT_BASE, LON_BASE) == 0


def test_haversine_un_grado_de_latitude_son_preto_de_111_km():
    distancia = _anti_cheat.haversine_m(LAT_BASE, LON_BASE, LAT_LEJOS, LON_BASE)
    assert 110_000 < distancia < 112_000
