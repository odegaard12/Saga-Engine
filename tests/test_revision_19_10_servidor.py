# -*- coding: utf-8 -*-
"""Arreglos del servidor de la revisión del 19/10/2026, uno por prueba.

Con la ruta sintética de seis nodos (tests/ruta_de_proba.py): nada de datos reales.
La proximidad (GPS manual fuera de modo prueba y `pos_at`) está en
tests/test_proximidad_en_servidor.py, junto a sus ayudantes.
"""
import json
import os
import shutil
import subprocess
import tempfile
import time
from pathlib import Path
from datetime import datetime, timezone

os.environ.setdefault("ADMIN_PASS", "pytest_admin_password")
os.environ.setdefault("SAGA_DATA_DIR", tempfile.mkdtemp(prefix="saga-test-revision-19-10-"))

import pytest  # noqa: E402
from fastapi.testclient import TestClient  # noqa: E402

import main  # noqa: E402
from backend.app.routers import admin as admin_router  # noqa: E402
from backend.app.routers import desbloqueos as desbloqueos_router  # noqa: E402
from backend.app.routers import game as game_router  # noqa: E402
from backend.app.runtime import exportar_partida, revisiones  # noqa: E402
from ruta_de_proba import preparar_mision  # noqa: E402

UNO = "PLAYER 1"
MIN = 60_000


def _ahora():
    return int(time.time() * 1000)


def _iso(ms):
    return datetime.fromtimestamp(ms / 1000.0, tz=timezone.utc).isoformat().replace("+00:00", "Z")


@pytest.fixture
def sitio(monkeypatch, tmp_path):
    preparar_mision(monkeypatch, tmp_path)
    monkeypatch.setattr(main, "PERSONAJES_DB", str(tmp_path / "personajes.json"))
    monkeypatch.setattr(main, "MANUAL_POSITION_NOTICE_DB", str(tmp_path / "aviso_manual.json"))
    cliente = TestClient(main.app)
    assert cliente.get("/api/game/PLAYER%201").status_code == 200
    return cliente


def _sync(cliente, eventos):
    r = cliente.post("/api/events/sync", json={"user": UNO, "events": eventos})
    assert r.status_code == 200, r.text
    return r.json()["events"]


def _abrir(cid, nodo, en_ms):
    return {"client_event_id": cid, "type": "node_opened", "node_id": str(nodo), "payload": {"local_created_at": _iso(en_ms)}}


def _completar(cid, nivel, en_ms=None, declarado=1_000, **payload):
    if en_ms is not None:
        payload["local_created_at"] = _iso(en_ms)
    return {"client_event_id": cid, "type": "node_completed", "source": "offline_queue",
            "payload": {"code": "OK", "level_before": nivel, "time_spent_ms": declarado, **payload}}


def _advance(cliente, nivel, **extra):
    r = cliente.post("/api/advance", json={"user": UNO, "code": "OK", "level_before": nivel, **extra})
    assert r.status_code == 200 and r.json()["status"] == "ok", r.text
    return r.json()


def _entrada():
    return main.load_player_timers()[UNO]


# 1 ------------------------------------------------------------------------------

def test_una_apertura_de_antes_del_reinicio_no_infla_el_primer_nodo(sitio):
    main.bump_reset_marker(UNO)
    reinicio = main.player_progress_reset_at(UNO)
    _sync(sitio, [_abrir("o-vieja", 101, reinicio - 30 * MIN)])  # de la partida borrada
    _advance(sitio, 0, time_spent_ms=1_000)
    registro = _entrada()["nodos"]["0"]
    assert registro["fuente"] == "sin_apertura" and registro["applied_ms"] == 1_000


def test_una_apertura_de_antes_de_la_salida_cuenta_desde_la_salida(monkeypatch, tmp_path, sitio):
    salida = _ahora() - 2 * MIN
    preparar_mision(monkeypatch, tmp_path, launch_at=_iso(salida))
    _sync(sitio, [_abrir("o-pronto", 101, salida - 60 * MIN)])  # abrió el nodo una hora antes de salir
    _advance(sitio, 0, time_spent_ms=1_000)
    registro = _entrada()["nodos"]["0"]
    assert registro["opened_at_ms"] == salida
    assert registro["observed_ms"] <= 2 * MIN + 5_000, "no cuenta la hora de antes de la salida"


# 2 ------------------------------------------------------------------------------

def test_retroceder_desde_el_panel_quita_la_penalizacion_de_los_nodos_deshechos(sitio):
    t0 = _ahora() - 10 * MIN
    _sync(sitio, [_completar("c-0", 0, t0), _completar("c-1", 1, t0 + MIN, penalty_ms=60_000)])
    assert _entrada()["penalties_ms"] == 60_000

    main.set_player_progress_level(UNO, 1, desde_admin=True)  # vuelve a hacer el nodo 1

    assert _entrada()["penalties_ms"] == 0, "rehacerlo no puede costar dos veces"
    assert list(_entrada()["nodos"]) == ["0"]


# 5 ------------------------------------------------------------------------------

def test_un_avance_sin_hora_se_fecha_ahora_y_con_reinicio_se_descarta(sitio):
    (sin_hora,) = _sync(sitio, [_completar("c-sin-hora", 0)])
    assert sin_hora["status"] == "synced"
    registro = _entrada()["nodos"]["0"]
    assert registro["fuente"] != "sin_hora" and abs(registro["completed_at_ms"] - _ahora()) < 10_000

    main.bump_reset_marker(UNO)
    (tras_reinicio,) = _sync(sitio, [_completar("c-sin-hora-2", 1)])
    assert tras_reinicio["status"] == "ignored" and tras_reinicio["error"] == "stale_before_reset"
    assert main.get_player_progress_level(UNO) == 1


# 6 ------------------------------------------------------------------------------

def test_finalizar_desde_el_panel_pone_finished_at_y_bajar_lo_quita(sitio):
    admin_router._aplicar_accion_de_perfil(main, UNO, "mark_finished")
    assert _entrada().get("finished_at"), "Finalizar es acabar: tiene que desempatar"

    admin_router._aplicar_accion_de_perfil(main, UNO, "level_prev")
    assert "finished_at" not in _entrada(), "quien vuelve atrás ya no ha acabado"


# 7 ------------------------------------------------------------------------------

def test_quitar_un_objeto_solo_gasta_lo_recogido_por_eventos(sitio):
    admin_router._aplicar_accion_de_perfil(main, UNO, "give_item:llave", 1)
    # El móvil sube una copia con 3 (forjadas en la mesa de trabajo: sin evento).
    copia = admin_router._mochila_saneada(main, UNO)
    copia["items"] = [{"item_id": "llave", "label": "llave", "state": "collected", "quantity": 3}]
    main.save_player_inventory(UNO, copia, desde_admin=True)
    assert main.count_player_inventory_item(UNO, "llave") == 3

    admin_router._aplicar_accion_de_perfil(main, UNO, "remove_item:llave")
    assert main.count_player_inventory_item(UNO, "llave") == 0

    # Antes se anotaban 3 gastadas contra 1 recogida: la siguiente llave desaparecía.
    admin_router._anotar_evento_de_mochila(main, UNO, "llave", "llave", 1, "collected")
    assert main.count_player_inventory_item(UNO, "llave") == 1


def test_saltar_un_coleccionable_desde_el_panel_lo_entrega_como_evento(monkeypatch, sitio):
    etapas = [dict(e) for e in main.get_runtime_stages()]
    etapas[0].update({"physical_node_kind": "collectible", "physical_item_id": "concha"})
    monkeypatch.setattr(main, "get_runtime_stages", lambda *a, **k: etapas)

    admin_router._aplicar_accion_de_perfil(main, UNO, "level_next")

    eventos, _ = main._eventos_y_copia_de_mochila(UNO)
    recogidas = [e for e in eventos if e.get("type") == "inventory_item_collected"
                 and (e.get("payload") or {}).get("inventory_item_id") == "concha"]
    assert len(recogidas) == 1, "sólo en la copia, el móvil lo pisaba en su siguiente subida"
    assert main.count_player_inventory_item(UNO, "concha") == 1


# 8 ------------------------------------------------------------------------------

def test_la_clasificacion_no_manda_al_final_un_total_cero(monkeypatch, sitio):
    perfiles = [{"id": j, "display_name": j} for j in ("CERO", "CINCO", "SIN_EMPEZAR", "EMPEZADO")]
    monkeypatch.setattr(main, "get_player_profiles", lambda cfg=None: perfiles)
    main.save_player_timers({
        "CERO": {"stage_times_ms": {"0": 4_000, "1": 1_000}, "descuento_ms": 5_000, "started_at": 1},
        "CINCO": {"stage_times_ms": {"0": 4_000, "1": 1_000}, "started_at": 1},
        "EMPEZADO": {"stage_times_ms": {}, "penalties_ms": 3_000, "started_at": 1},
    })
    # CERO y CINCO, TERMINADOS (nivel = todos los nodos): con nivel 2 de seis la
    # prueba miraba a dos jugadores a medias y no al caso del premio.
    todos = len(main.get_runtime_stages())
    for jugador, nivel in (("CERO", todos), ("CINCO", todos), ("SIN_EMPEZAR", 0), ("EMPEZADO", 0)):
        main.set_player_progress_level(jugador, nivel)

    # 23/10: un solo criterio, el del móvil. El terminado con total 0 (todo
    # devuelto) va DETRÁS del terminado con tiempo: un 0 no es un tiempo real.
    esperado = ["CINCO", "CERO", "EMPEZADO", "SIN_EMPEZAR"]
    orden = [j["user"] for j in desbloqueos_router._tiempos_para_revisar(main)["jugadores"]]
    assert orden == esperado, "panel de Tiempos"

    filas = exportar_partida._con_posiciones(exportar_partida._clasificacion(main)["jugadores"])
    assert [f["user"] for f in filas] == esperado, "exportación"
    assert [f["finished"] for f in filas] == [True, True, False, False]
    # Los dos sin nodos y sin tiempo empatan en el puesto: el nombre sólo los ordena.
    assert [f["posicion"] for f in filas] == [1, 2, 3, 3]

    node = shutil.which("node")
    if not node or not (Path(main.__file__).parent / "frontend" / "node_modules" / "typescript").exists():
        pytest.skip("sin Node o sin frontend/node_modules: falta comprobar el móvil")
    raiz = Path(main.__file__).parent
    res = subprocess.run([node, str(raiz / "tests" / "js" / "logica_jugador.cjs")],
                         capture_output=True, text=True, encoding="utf-8", timeout=180, cwd=str(raiz))
    assert res.returncode == 0, res.stderr[-2000:]
    assert json.loads(res.stdout)["clasificacion"]["totalCero"] == esperado, "clasificación del móvil"


# 9 ------------------------------------------------------------------------------

def test_la_tabla_del_latido_no_relee_lo_que_ya_le_pasan(monkeypatch, sitio):
    cfg, timers, progreso = main.load_config(), main.load_player_timers(), main.load_player_progress()

    def _no(*a, **k):
        raise AssertionError("ya se lo pasaron: no hace falta releerlo")

    for nombre in ("load_config", "load_player_timers", "load_player_progress"):
        monkeypatch.setattr(main, nombre, _no)
    tabla = game_router.construir_tabla_de_equipo(UNO, cfg=cfg, timers=timers, progress=progreso)
    assert tabla["profiles"]


def test_la_huella_de_las_fotos_se_memoriza():
    foto = "data:image/jpeg;base64," + "A" * 50_000
    revisiones._huella_corta.cache_clear()
    perfiles = [{"id": "X", "avatar_url": foto}]
    primera = revisiones.mission_revision("n", {}, perfiles)
    assert revisiones.mission_revision("n", {}, [{"id": "X", "avatar_url": "".join([foto])}]) == primera
    assert revisiones._huella_corta.cache_info().hits >= 1
