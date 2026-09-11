# -*- coding: utf-8 -*-
"""El banco de pruebas, enganchado al panel de administración. Jugadores
simulados (`SIM_XX`) recorriendo la misión REAL por los mismos caminos que
un móvil de verdad -sesión, heartbeat, /api/advance, la cola offline-, con
perfil de dispositivo y de red. Ver backend/app/runtime/simulation_bench.py
y POST /api/admin/simulation/run · /cleanup en admin.py.
"""
import os
import tempfile

os.environ.setdefault("ADMIN_PASS", "pytest_admin_password")
os.environ.setdefault("SAGA_DATA_DIR", tempfile.mkdtemp(prefix="saga-test-banco-"))

import pytest  # noqa: E402
from fastapi.testclient import TestClient  # noqa: E402

import main  # noqa: E402
from backend.app.runtime import simulation_bench  # noqa: E402
from backend.app.runtime.simulation_bench import (  # noqa: E402
    borrar_rastro_de_simulacion,
    hay_progreso_real_en_marcha,
    nombre_simulado,
    perfiles_temporales_con_sim,
    quitar_perfiles_sim,
    zonas_muertas_aleatorias,
)


def make_client():
    return TestClient(main.app)


@pytest.fixture(autouse=True)
def estado_limpo():
    """Los tests comparten SAGA_DATA_DIR -y por tanto game_state.json- dentro
    de este fichero: sin esto, SIM_01 arrancaba en el nivel que le dejara el
    test anterior.

    El limitador de peticiones (PLAYER_RATE_LIMITS) también es compartido
    -vive en memoria del proceso, no en SAGA_DATA_DIR- y tampoco lo resetea
    nada: con SIM_01 repitiéndose en cada test de este fichero, ~15 tests
    después bastaba para superar ADVANCE_RATE_LIMIT_MAX y que /api/advance
    devolviera 429 (sin 'status' en el cuerpo) en un test que en nada tenía
    que ver con límites de peticiones. Encontrado con las pruebas de partida
    larga -las últimas del fichero, y las que más llamadas hacen por test-,
    fallando con un nodo distinto cada vez según qué otros tests hubieran
    corrido antes: la pista de que era un limitador acumulado, no un fallo
    de lógica de verdad.
    """
    main.save_game_state(main.GAME_DB, {})
    main.clear_player_rate_limits()
    yield


@pytest.fixture(autouse=True)
def paso_instantaneo(monkeypatch):
    """El banco espera ahora un paseo real entre nodos con cobertura (ver
    simulation_bench.PASO_HUMANO_MPS): sin esto, los nodos de prueba de más
    arriba -0.01° de separación, más de 1 km- hacían que este fichero
    tardara MINUTOS en correr, con cada test durmiendo de verdad decenas de
    segundos por una distancia que aquí no representa nada real, solo dos
    coordenadas distintas para probar lógica.

    A velocidad casi infinita el paseo se queda en fracciones de milisegundo
    -el código que calcula la distancia y duerme se sigue ejecutando y
    probando igual-, sin importar qué factor_velocidad traiga cada perfil
    (ruta_larga_caotica trae el suyo propio, distinto del por defecto)."""
    monkeypatch.setattr(simulation_bench, "PASO_HUMANO_MPS", 1_000_000_000.0)
    yield


def configurar(monkeypatch):
    monkeypatch.setattr(main, "admin_request_authorized", lambda request, data: True)
    monkeypatch.setattr(main, "admin_password_change_required", lambda: False)
    monkeypatch.setenv("SECRET_KEY", "test-secret-key")

    main.save_stages(
        main.STAGES_DB,
        [
            {
                "id": "n1",
                "title": "Nodo 1",
                "type": "checkpoint",
                "lat": 42.10,
                "lon": -8.80,
                "radius": 9999,
                "entry": {"mode": "gps", "require_proximity": True},
                "success": {"conditions": [{"kind": "answer", "value": "OK"}]},
            },
            {
                "id": "n2",
                "title": "Nodo 2",
                "type": "checkpoint",
                "lat": 42.11,
                "lon": -8.81,
                "radius": 9999,
                "entry": {"mode": "gps", "require_proximity": True},
                "success": {"conditions": [{"kind": "answer", "value": "OK"}]},
            },
        ],
    )


def configurar_ruta_larga(monkeypatch, n):
    """Como `configurar`, pero con N nodos -para el perfil "corte", que
    necesita ruta suficiente para que caiga algo dentro de la franja 35-65%."""
    monkeypatch.setattr(main, "admin_request_authorized", lambda request, data: True)
    monkeypatch.setattr(main, "admin_password_change_required", lambda: False)
    monkeypatch.setenv("SECRET_KEY", "test-secret-key")

    main.save_stages(
        main.STAGES_DB,
        [
            {
                "id": f"n{i + 1}",
                "title": f"Nodo {i + 1}",
                "type": "checkpoint",
                "lat": 42.10 + i * 0.01,
                "lon": -8.80 - i * 0.01,
                "radius": 9999,
                "entry": {"mode": "gps", "require_proximity": True},
                "success": {"conditions": [{"kind": "answer", "value": "OK"}]},
            }
            for i in range(n)
        ],
    )


# ---------------------------------------------------------------------------
# Funciones puras
# ---------------------------------------------------------------------------

def test_nombre_simulado():
    assert nombre_simulado(0) == "SIM_01"
    assert nombre_simulado(9) == "SIM_10"


def test_hai_progreso_real_ignora_os_sim():
    perfiles = [{"id": "ALFA"}, {"id": "SIM_01"}]
    niveles = {"ALFA": 2, "SIM_01": 5}
    assert hay_progreso_real_en_marcha(perfiles, niveles) == ["ALFA"]


def test_hai_progreso_real_baleiro_se_ninguen_empezou():
    perfiles = [{"id": "ALFA"}]
    niveles = {"ALFA": 0}
    assert hay_progreso_real_en_marcha(perfiles, niveles) == []


def test_perfiles_temporales_con_sim_engade_ao_final():
    base = [{"id": "ALFA"}]
    perfiles = perfiles_temporales_con_sim(base, ["SIM_01", "SIM_02"])
    assert [p["id"] for p in perfiles] == ["ALFA", "SIM_01", "SIM_02"]
    assert base == [{"id": "ALFA"}], "non muta a lista orixinal"


def test_quitar_perfiles_sim_so_quita_o_prefixo():
    perfiles = [{"id": "ALFA"}, {"id": "SIM_01"}, {"id": "BETA"}, {"id": "SIM_02"}]
    assert [p["id"] for p in quitar_perfiles_sim(perfiles)] == ["ALFA", "BETA"]


def test_zonas_mortas_aleatorias_non_se_pisan_e_repiten_coa_mesma_semente():
    tramos = zonas_muertas_aleatorias(6, duracion_min=0.05, duracion_max=0.14, semilla=42)
    assert len(tramos) == 6

    for ini, fin in tramos:
        assert 0.0 <= ini < fin <= 1.0

    ordenados = sorted(tramos)
    for (ini_a, fin_a), (ini_b, fin_b) in zip(ordenados, ordenados[1:]):
        assert fin_a <= ini_b, "dous tramos non poden pisarse"

    # Mesma semente, mesmo resultado -para poder repetir unha proba "longa"
    # exactamente igual-.
    assert zonas_muertas_aleatorias(6, semilla=42) == zonas_muertas_aleatorias(6, semilla=42)


def test_borrar_rastro_so_toca_o_sim():
    niveles = {"ALFA": 3, "SIM_01": 2, "SIM_02": 1}
    timers = {"ALFA": {"a": 1}, "SIM_01": {"b": 2}}
    posiciones = {"ALFA": {"lat": 1}, "SIM_02": {"lat": 2}}

    borrados = borrar_rastro_de_simulacion(niveles=niveles, timers=timers, posiciones=posiciones)

    assert borrados == ["SIM_01", "SIM_02"]
    assert niveles == {"ALFA": 3}
    assert timers == {"ALFA": {"a": 1}}
    assert posiciones == {"ALFA": {"lat": 1}}


# ---------------------------------------------------------------------------
# De verdad, contra POST /api/admin/simulation/run
# ---------------------------------------------------------------------------

def test_o_banco_manda_heartbeat_de_verdade(monkeypatch):
    """get_runtime_stages() -lo que usa esta simulación siempre- normaliza
    las coordenadas a stage["location"]["lat"/"lon"], no a stage["lat"]
    a secas. Con el nombre plano, /api/heartbeat nunca se mandaba -en
    NINGUNA prueba, ni siquiera con cobertura buena-, pese a que el
    docstring del módulo lo prometía. Esto comprueba que de verdad se
    manda, no que el código "no dé error".

    No se exige que TODOS respondan 200: con cobertura "buena" (0-80 ms de
    retraso) el jugador simulado se mueve más rápido que el límite real de
    /api/heartbeat -2 s entre latidos del mismo jugador, ver
    HEARTBEAT_MIN_INTERVAL_SECONDS-, así que un 429 aquí es esperable y no
    rompe nada -el `except` de _peticion solo atrapa fallos de red, no
    códigos de estado-. Es una diferencia real entre el banco (sin tiempo
    de caminar entre nodos) y un jugador de verdad, anotada, no un bug."""
    configurar(monkeypatch)
    client = make_client()

    respuesta = client.post(
        "/api/admin/simulation/run",
        json={"player_count": 1, "device": "android", "network": "buena"},
    )

    assert respuesta.status_code == 200
    jugador = respuesta.json()["report"]["players"][0]
    latidos = [p for p in jugador["peticiones"] if p["tipo"] == "heartbeat"]
    assert len(latidos) == 2, "un heartbeat por cada uno de los dos nodos de la ruta"
    assert all(p["estado"] in (200, 429) for p in latidos)
    assert jugador["errores"] == [], "un 429 de heartbeat no debe contar como error del jugador"


def test_o_banco_recorre_a_ruta_de_verdade(monkeypatch):
    configurar(monkeypatch)
    client = make_client()

    respuesta = client.post(
        "/api/admin/simulation/run",
        json={"player_count": 2, "device": "mixed", "network": "buena"},
    )

    assert respuesta.status_code == 200
    datos = respuesta.json()
    assert datos["status"] == "ok"
    informe = datos["report"]
    assert informe["player_count"] == 2
    assert informe["stage_count"] == 2
    for jugador in informe["players"]:
        assert jugador["errores"] == []
        assert jugador["nivel_final"] == 2

    assert main.get_player_progress_level("SIM_01", 0) == 2
    assert main.get_player_progress_level("SIM_02", 0) == 2


def test_o_banco_require_sesion_de_administrador(monkeypatch):
    main.save_stages(main.STAGES_DB, [])
    client = make_client()

    respuesta = client.post("/api/admin/simulation/run", json={"player_count": 1})
    assert respuesta.status_code == 403


def test_o_banco_sen_cobertura_manda_a_cola_de_golpe(monkeypatch):
    configurar(monkeypatch)
    client = make_client()

    respuesta = client.post(
        "/api/admin/simulation/run",
        json={"player_count": 1, "device": "iphone", "network": "sin_cobertura"},
    )

    assert respuesta.status_code == 200
    jugador = respuesta.json()["report"]["players"][0]
    assert jugador["errores"] == []
    assert jugador["nivel_final"] == 2
    # Toda la ruta se manda en UNA petición, como el móvil que sale del monte
    # con la cola llena -no una petición por nodo-.
    assert len(jugador["peticiones"]) == 1
    assert jugador["peticiones"][0]["tipo"] == "events_sync_lote"


def test_o_banco_simula_un_corte_a_mitade_de_ruta(monkeypatch):
    """El caso que máis importaba probar: non "todo ou nada", un tramo morto
    no medio -unha vagoada- e que ao saír del se manda todo o pendente de
    golpe, en orde, sen perder nin duplicar nada."""
    configurar_ruta_larga(monkeypatch, 8)
    client = make_client()

    respuesta = client.post(
        "/api/admin/simulation/run",
        json={"player_count": 1, "device": "android", "network": "corte"},
    )

    assert respuesta.status_code == 200
    jugador = respuesta.json()["report"]["players"][0]
    assert jugador["errores"] == []
    assert jugador["nivel_final"] == 8

    # Con 8 nodos y la franja 35-65 %, algo tiene que haber caído en corte.
    assert len(jugador["nodos_en_corte"]) > 0

    # Y ese tramo se manda en un ÚNICO lote, no nodo a nodo.
    lotes = [p for p in jugador["peticiones"] if p["tipo"] == "events_sync_lote"]
    assert len(lotes) == 1

    assert main.get_player_progress_level("SIM_01", 0) == 8


def test_o_banco_a_saltos_cruza_e_volve_varias_veces(monkeypatch):
    """El caso que "corte" no prueba: no UN tramo muerto, sino entrar y
    salir de cobertura VARIAS veces en la misma ruta -cada cruce tiene que
    vaciar su propia cola, sin perder ni duplicar nada-."""
    configurar_ruta_larga(monkeypatch, 9)
    client = make_client()

    respuesta = client.post(
        "/api/admin/simulation/run",
        json={"player_count": 1, "device": "android", "network": "a_saltos"},
    )

    assert respuesta.status_code == 200
    jugador = respuesta.json()["report"]["players"][0]
    assert jugador["errores"] == []
    assert jugador["nivel_final"] == 9

    # patron_saltos=(3, 1): nodos 0, 3, 6 sin cobertura -tres grupos
    # separados, no uno solo-.
    assert jugador["nodos_en_corte"] == [0, 3, 6]

    # Y cada uno de los tres cruces manda su propio lote: no uno solo al
    # final (eso sería "sin_cobertura" mal implementado), tres.
    lotes = [p for p in jugador["peticiones"] if p["tipo"] == "events_sync_lote"]
    assert len(lotes) == 3

    assert main.get_player_progress_level("SIM_01", 0) == 9


def test_o_banco_ruta_larga_caotica_non_perde_nin_duplica_nada(monkeypatch):
    """"Todas las casuísticas a la vez": empieza sin cobertura, seis cortes
    sueltos más repartidos sin patrón, GPS degradado todo el rato. Una ruta
    de 30 nodos -no las 8-10 de las pruebas de siempre- para que de verdad
    se note si algo se pierde por el camino."""
    configurar_ruta_larga(monkeypatch, 30)
    client = make_client()

    respuesta = client.post(
        "/api/admin/simulation/run",
        json={"player_count": 3, "device": "mixed", "network": "ruta_larga_caotica"},
    )

    assert respuesta.status_code == 200
    informe = respuesta.json()["report"]
    assert informe["players_with_errors"] == 0

    for jugador in informe["players"]:
        assert jugador["errores"] == []
        assert jugador["nivel_final"] == 30
        # zona_muerta (0.0-0.08) + zonas_muertas (6 tramos sueltos): más de
        # un grupo de nodos en corte, no un tramo único.
        assert len(jugador["nodos_en_corte"]) > 5
        lotes = [p for p in jugador["peticiones"] if p["tipo"] == "events_sync_lote"]
        assert len(lotes) >= 5, "cada cruce de vuelta a cobertura manda su propio lote"

        assert main.get_player_progress_level(jugador["nombre"], 0) == 30


def test_o_banco_cliente_antigo_avanza_sen_level_before(monkeypatch):
    """El comentario de game.py::advance promete que un movil sin
    level_before "sigue funcionando igual que antes". Esto lo comprueba de
    verdad -no se fia del comentario-."""
    configurar_ruta_larga(monkeypatch, 5)
    client = make_client()

    respuesta = client.post(
        "/api/admin/simulation/run",
        json={"player_count": 1, "device": "android", "network": "cliente_antiguo"},
    )

    assert respuesta.status_code == 200
    jugador = respuesta.json()["report"]["players"][0]
    assert jugador["errores"] == []
    assert jugador["nivel_final"] == 5

    # Ninguna peticion de este perfil llevaba level_before: si el servidor
    # de verdad lo necesitara, se habria parado en el primer nodo.
    avances = [p for p in jugador["peticiones"] if p["tipo"] == "advance"]
    assert len(avances) == 5
    assert all(p["estado"] == 200 for p in avances)

    assert main.get_player_progress_level("SIM_01", 0) == 5


def test_o_banco_non_toca_a_ruta_con_xente_de_verdade_xogando(monkeypatch):
    configurar(monkeypatch)
    monkeypatch.setattr(main, "get_player_profiles", lambda cfg=None: [{"id": "ALFA"}])
    main.set_player_progress_level("ALFA", 1, desde_admin=True)

    client = make_client()
    respuesta = client.post("/api/admin/simulation/run", json={"player_count": 1, "network": "buena"})

    assert respuesta.status_code == 409
    assert "ALFA" in respuesta.json()["players_in_progress"]
    # Y no se lanzó nada de verdad.
    assert main.get_player_progress_level("SIM_01", 0) == 0


def test_o_banco_deixase_forzar_aínda_con_xente_xogando(monkeypatch):
    configurar(monkeypatch)
    monkeypatch.setattr(main, "get_player_profiles", lambda cfg=None: [{"id": "ALFA"}])
    main.set_player_progress_level("ALFA", 1, desde_admin=True)

    client = make_client()
    respuesta = client.post(
        "/api/admin/simulation/run",
        json={"player_count": 1, "network": "buena", "force": True},
    )

    assert respuesta.status_code == 200


def test_o_banco_reconoce_o_eco_como_duplicado(monkeypatch):
    """O perfil "mala" reenvía a veces a mesma petición -un móvil que cre que
    a primeira se perdeu-. O servidor ten que collela como duplicado."""
    configurar(monkeypatch)
    monkeypatch.setitem(
        simulation_bench.PERFILES_RED,
        "mala",
        {"retraso_ms": (0, 5), "duplicado_prob": 1.0, "sin_cobertura": False},
    )

    client = make_client()
    respuesta = client.post(
        "/api/admin/simulation/run",
        json={"player_count": 1, "network": "mala"},
    )

    assert respuesta.status_code == 200
    jugador = respuesta.json()["report"]["players"][0]
    assert jugador["errores"] == []
    ecos = [p for p in jugador["peticiones"] if p["tipo"] == "advance_eco"]
    assert len(ecos) == 2, "un eco por cada uno de los dos nodos"
    assert jugador["nivel_final"] == 2, "el eco no puede avanzar de más"


def test_o_borrado_limpa_o_rastro_pero_non_a_xente_de_verdade(monkeypatch):
    configurar(monkeypatch)
    client = make_client()

    client.post("/api/admin/simulation/run", json={"player_count": 1, "network": "buena"})
    main.set_player_progress_level("ALFA_DE_VERDADE", 1, desde_admin=True)
    assert main.get_player_progress_level("SIM_01", 0) == 2

    respuesta = client.post("/api/admin/simulation/cleanup", json={})
    assert respuesta.status_code == 200
    assert "SIM_01" in respuesta.json()["cleaned"]

    assert main.get_player_progress_level("SIM_01", 0) == 0
    assert main.get_player_progress_level("ALFA_DE_VERDADE", 0) == 1


# ---------------------------------------------------------------------------
# Partida larga con pausa: POST /api/admin/simulation/long-session
# ---------------------------------------------------------------------------

def test_a_partida_longa_garda_o_nivel_na_pausa_e_o_final(monkeypatch):
    configurar_ruta_larga(monkeypatch, 8)
    client = make_client()

    respuesta = client.post(
        "/api/admin/simulation/long-session",
        json={"device": "android", "pause_at": 0.5},
    )

    assert respuesta.status_code == 200
    informe = respuesta.json()["report"]
    assert informe["errores"] == []
    assert informe["stage_count"] == 8
    assert informe["punto_de_pausa"] == 4
    assert informe["nivel_tras_pausa"] == 4, "a segunda sesion arrincou dun nivel que xa non era 0"
    assert informe["nivel_final"] == 8

    assert main.get_player_progress_level("SIM_01", 0) == 8


def test_a_partida_longa_non_repite_nin_perde_nada_na_costura(monkeypatch):
    """A comprobación que de verdade importa: os dous lotes de peticións
    -antes e despois da pausa- non se pisan os niveis un ao outro."""
    configurar_ruta_larga(monkeypatch, 6)
    client = make_client()

    respuesta = client.post(
        "/api/admin/simulation/long-session",
        json={"device": "iphone", "pause_at": 0.33},
    )

    assert respuesta.status_code == 200
    informe = respuesta.json()["report"]
    assert informe["punto_de_pausa"] == 2
    assert informe["nivel_tras_pausa"] == 2
    assert informe["nivel_final"] == 6
    assert len(informe["peticiones_primera_sesion"]) > 0
    assert len(informe["peticiones_segunda_sesion"]) > 0


def test_a_partida_longa_require_sesion_de_administrador():
    client = make_client()
    respuesta = client.post("/api/admin/simulation/long-session", json={})
    assert respuesta.status_code == 403


def test_a_partida_longa_non_toca_a_ruta_con_xente_de_verdade_xogando(monkeypatch):
    configurar_ruta_larga(monkeypatch, 6)
    monkeypatch.setattr(main, "get_player_profiles", lambda cfg=None: [{"id": "ALFA"}])
    main.set_player_progress_level("ALFA", 1, desde_admin=True)

    client = make_client()
    respuesta = client.post("/api/admin/simulation/long-session", json={})

    assert respuesta.status_code == 409
    assert main.get_player_progress_level("SIM_01", 0) == 0


# ---------------------------------------------------------------------------
# Sesión de navegador de verdad (Playwright): .../browser-session/start · /stop
#
# A diferencia de /run, aquí no se ejecuta nada -solo se abre la puerta para
# que un navegador de verdad entre como SIM_XX-. Ver sim/playwright-bench/.
# ---------------------------------------------------------------------------

def test_o_browser_session_start_rexistra_perfis_e_devolve_tokens(monkeypatch):
    configurar(monkeypatch)
    monkeypatch.setattr(main, "get_player_profiles", lambda cfg=None: [{"id": "ALFA"}])
    client = make_client()

    respuesta = client.post(
        "/api/admin/simulation/browser-session/start", json={"player_count": 2}
    )

    assert respuesta.status_code == 200
    datos = respuesta.json()
    assert datos["status"] == "ok"
    assert datos["cookie_name"] == main.PLAYER_SESSION_COOKIE
    nombres = [p["name"] for p in datos["players"]]
    assert nombres == ["SIM_01", "SIM_02"]

    cfg = main.load_config()
    ids = [p["id"] for p in cfg["player_profiles"]]
    assert ids == ["ALFA", "SIM_01", "SIM_02"], "ALFA sigue, y los SIM_XX quedan registrados"

    for jugador in datos["players"]:
        datos_token = main.player_session_security.read_player_session_token(
            jugador["token"], secret=main.get_session_signing_secret()
        )
        assert datos_token["user"] == jugador["name"]


def test_o_browser_session_stop_quita_os_perfis_pero_non_a_xente_de_verdade(monkeypatch):
    configurar(monkeypatch)
    monkeypatch.setattr(main, "get_player_profiles", lambda cfg=None: [{"id": "ALFA"}])
    client = make_client()

    client.post("/api/admin/simulation/browser-session/start", json={"player_count": 1})
    assert "SIM_01" in [p["id"] for p in main.load_config()["player_profiles"]]

    respuesta = client.post("/api/admin/simulation/browser-session/stop", json={})
    assert respuesta.status_code == 200

    ids = [p["id"] for p in main.load_config()["player_profiles"]]
    assert ids == ["ALFA"]


def test_o_browser_session_require_sesion_de_administrador(monkeypatch):
    client = make_client()

    inicio = client.post("/api/admin/simulation/browser-session/start", json={"player_count": 1})
    assert inicio.status_code == 403

    fin = client.post("/api/admin/simulation/browser-session/stop", json={})
    assert fin.status_code == 403
