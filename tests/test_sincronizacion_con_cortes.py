# -*- coding: utf-8 -*-
"""La cola sin red llega al servidor con cortes y acaba aplicada UNA vez y en orden.

Dos jugadores completan nodos sin cobertura y su cola sube a /api/events/sync
como sube en la calle: la respuesta se pierde y la tanda se reenvía entera, una
tanda llega antes que la anterior, el móvil manda la misma tanda varias veces a
la vez (dos pestañas, un reintento que se cruza), y algún nodo se hizo en línea
por /api/advance y sigue también en la cola.

Se mira sólo el estado final del servidor: nivel de cada jugador, un avance
`synced` por nodo (ni duplicados ni saltos), un tiempo por nodo y la
penalización cobrada una sola vez.
"""
import os
import tempfile
import threading
from datetime import datetime, timedelta, timezone

os.environ.setdefault("ADMIN_PASS", "pytest_admin_password")
os.environ.setdefault("SAGA_DATA_DIR", tempfile.mkdtemp(prefix="saga-test-sync-cortes-"))

from fastapi.testclient import TestClient  # noqa: E402

import main  # noqa: E402
from ruta_de_proba import preparar_mision  # noqa: E402

# Código con el que se supera cada nodo de la ruta de prueba (6 nodos).
CODIGOS = ["OK", "SAGA_QR_1", "OK", "OK", "OK", "OK"]
JUGADORES = ["PLAYER 1", "PLAYER 2"]  # los dos perfiles de la configuración por defecto
PENALIZACION = 15_000


def _movil(jugador):
    """Un móvil con la sesión de su jugador (la cookie la da /api/game)."""
    cliente = TestClient(main.app)
    main.clear_player_rate_limits()
    assert cliente.get("/api/game/" + jugador.replace(" ", "%20")).status_code == 200
    return cliente


def _moviles():
    return {jugador: _movil(jugador) for jugador in JUGADORES}


def _hace(minutos: float) -> str:
    return (datetime.now(timezone.utc) - timedelta(minutes=minutos)).isoformat().replace("+00:00", "Z")


def _avance(jugador: str, nivel: int, penalty_ms: int = 0):
    """Un node_completed tal y como lo encola el móvil sin cobertura."""
    return {
        "client_event_id": f"{jugador}-cola-{nivel}",
        "type": "node_completed",
        "source": "offline_queue",
        "payload": {
            "code": CODIGOS[nivel],
            "level_before": nivel,
            "level_after": nivel + 1,
            "time_spent_ms": 20_000 + nivel * 1_000,
            "penalty_ms": penalty_ms,
            "local_created_at": _hace(40 - nivel * 5),
            "offline_at_creation": True,
            "seq": nivel + 1,
            "evidence": {"v": 1, "via": "qr" if nivel == 1 else "juego"},
        },
    }


def _subir(moviles, jugador, eventos):
    main.clear_player_rate_limits()
    respuesta = moviles[jugador].post("/api/events/sync", json={"user": jugador, "events": eventos})
    assert respuesta.status_code == 200, respuesta.text
    return respuesta.json()


def _avances_aplicados(jugador):
    return [
        e for e in main.list_events(main.EVENT_LOG_DB, user=jugador, event_type="node_completed")
        if e.get("status") == "synced"
    ]


def _comprobar(jugador, nodos, penalizacion=0):
    """Nivel final, un avance por nodo (sin repetidos ni huecos), un tiempo por nodo y la penalización una vez."""
    assert main.get_player_progress_level(jugador, 0) == nodos, jugador
    niveles = sorted(int(e["payload"]["level_before"]) for e in _avances_aplicados(jugador))
    assert niveles == list(range(nodos)), (jugador, niveles)
    tiempos = main.load_player_timers().get(jugador, {})
    assert len(tiempos.get("stage_times_ms", {})) == nodos, (jugador, tiempos)
    assert int(tiempos.get("penalties_ms") or 0) == penalizacion, (jugador, tiempos)


def test_dos_jugadores_con_respuestas_perdidas_y_reenvios(monkeypatch, tmp_path):
    preparar_mision(monkeypatch, tmp_path)
    moviles = _moviles()
    p1, p2 = JUGADORES
    c1 = [_avance(p1, n, penalty_ms=PENALIZACION if n == 2 else 0) for n in range(6)]
    c2 = [_avance(p2, n) for n in range(5)]

    # P1: sube 0-2 y la respuesta se pierde; el móvil reenvía la cola entera (0-3) cuando vuelve la red.
    _subir(moviles, p1, c1[:3])
    _subir(moviles, p2, c2[:2])  # entre medias sube el otro, a su ritmo
    _subir(moviles, p1, c1[:4])
    # P2: la tanda siguiente llega mezclada y con un repetido dentro de la misma tanda.
    _subir(moviles, p2, [c2[4], c2[2], c2[1], c2[3], c2[2]])
    # P1: el resto, dos veces seguidas (la primera respuesta tampoco llegó).
    _subir(moviles, p1, c1[3:])
    segunda = _subir(moviles, p1, c1[3:])
    assert all(e.get("duplicate") for e in segunda["events"]), segunda
    # P2 reenvía toda su cola otra vez al abrir la app: nada cambia.
    _subir(moviles, p2, c2)

    _comprobar(p1, 6, PENALIZACION)
    _comprobar(p2, 5)
    assert main.load_player_timers()[p1].get("finished_at"), "P1 acabó la ruta: su hora de fin queda anotada"
    assert not main.load_player_timers()[p2].get("finished_at")


def test_una_tanda_que_llega_antes_que_la_anterior_no_salta_nodos(monkeypatch, tmp_path):
    """Los nodos 3-4 llegan antes que 0-2 (otra conexión se adelantó); luego llega todo en orden."""
    preparar_mision(monkeypatch, tmp_path)
    moviles = _moviles()
    jugador = JUGADORES[0]
    cola = [_avance(jugador, n) for n in range(5)]

    adelantada = _subir(moviles, jugador, cola[3:])
    assert main.get_player_progress_level(jugador, 0) == 0, "un avance de un nodo al que no ha llegado no se aplica"
    assert not any(e.get("status") == "synced" for e in adelantada["events"]), adelantada

    _subir(moviles, jugador, cola[:3])
    # El móvil no vio aplicados 3-4 y los vuelve a mandar con la cola que le queda.
    _subir(moviles, jugador, cola[3:])

    _comprobar(jugador, 5)


def test_la_misma_tanda_tres_veces_a_la_vez_se_aplica_una(monkeypatch, tmp_path):
    preparar_mision(monkeypatch, tmp_path)
    jugador = JUGADORES[1]
    cola = [_avance(jugador, n, penalty_ms=PENALIZACION if n == 0 else 0) for n in range(5)]
    moviles = [_movil(jugador) for _ in range(3)]
    salida = threading.Barrier(len(moviles))
    respuestas = []

    def subir(movil):
        salida.wait()
        respuestas.append(movil.post("/api/events/sync", json={"user": jugador, "events": cola}))

    main.clear_player_rate_limits()
    hilos = [threading.Thread(target=subir, args=(m,)) for m in moviles]
    for h in hilos:
        h.start()
    for h in hilos:
        h.join(timeout=60)

    assert [r.status_code for r in respuestas] == [200, 200, 200], [r.text for r in respuestas]
    # Cada evento: aplicado en UNA respuesta y repetido en las otras dos.
    for i in range(len(cola)):
        estados = sorted(bool(r.json()["events"][i].get("duplicate")) for r in respuestas)
        assert estados == [False, True, True], (i, [r.json()["events"][i] for r in respuestas])
    _comprobar(jugador, 5, PENALIZACION)


def test_un_nodo_hecho_en_linea_que_sigue_en_la_cola_no_cuenta_dos_veces(monkeypatch, tmp_path):
    """Los nodos 0-1 se hicieron por /api/advance con red; la cola los guardaba igual y sube 0-3."""
    preparar_mision(monkeypatch, tmp_path)
    moviles = _moviles()
    jugador = JUGADORES[1]
    for nivel in range(2):
        main.clear_player_rate_limits()
        r = moviles[jugador].post(
            "/api/advance",
            json={"user": jugador, "code": CODIGOS[nivel], "time_spent_ms": 20_000, "penalty_ms": PENALIZACION},
        )
        assert r.status_code == 200 and r.json()["status"] == "ok", r.text

    _subir(moviles, jugador, [_avance(jugador, n, penalty_ms=PENALIZACION) for n in range(4)])

    assert main.get_player_progress_level(jugador, 0) == 4
    tiempos = main.load_player_timers()[jugador]
    assert len(tiempos["stage_times_ms"]) == 4
    assert tiempos["penalties_ms"] == 4 * PENALIZACION, "una penalización por nodo, no por cada vez que llega"
    de_la_cola = sorted(int(e["payload"]["level_before"]) for e in _avances_aplicados(jugador) if e.get("source") == "offline_queue")
    assert de_la_cola == [2, 3], de_la_cola
