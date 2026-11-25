# -*- coding: utf-8 -*-
"""24/11: «+1 nodo» del panel con el tiempo que tardó el jugador.

- Coleccionable o punto de control sin juego: se entrega lo suyo y NO se suma tiempo (como hasta ahora).
- Nodo con reto (minijuego, QR, mapa mudo): el organizador apunta el tiempo que vio en el móvil («2:54») y queda como
  el tiempo de ESE nodo, el mismo registro que deja el avance del jugador: suma al total y a la clasificación, la
  sospecha del antitrampas sale igual y el registro lo marca como «avance del organizador».
- «Un nodo atrás» lo deshace exacto; el `op_id` hace que un reintento no repita nada; un tiempo raro se rechaza claro.
JS del lector de tiempos en tests/js/avance_con_tiempo_24_11.cjs.

Misión sintética (nada de datos reales):
  0 (701) minijuego sequence_code con premio «llave»
  1 (702) coleccionable «brujula»
  2 (703) punto de control
  3 (704) minijuego final
"""
import json
import os
import shutil
import subprocess
import tempfile
import uuid
from pathlib import Path

os.environ.setdefault("ADMIN_PASS", "pytest_admin_password")
os.environ.setdefault("SAGA_DATA_DIR", tempfile.mkdtemp(prefix="saga-test-avance-tiempo-"))

import pytest  # noqa: E402
from fastapi.testclient import TestClient  # noqa: E402

import main  # noqa: E402
from backend.app.routers.game import construir_tabla_de_equipo  # noqa: E402
from backend.app.runtime import cambios_del_jugador as _cambios  # noqa: E402
from backend.app.storage import match_log_store as _registro  # noqa: E402
from ruta_de_proba import preparar_mision  # noqa: E402

RAIZ = Path(__file__).resolve().parent.parent
USUARIO = "PLAYER 1"
OTRO = "PLAYER 2"
BASE = {"lat": 40.5, "lon": -3.5, "radius": 25}
CHECK = {"type": "checkpoint", "config": {}}
SIMON = {"type": "circuit_matrix", "config": {"game_id": "sequence_code"}}


def mision():
    return [
        {"id": 701, "title": "Simón", **BASE, "minigame": SIMON,
         "config": {"game_id": "sequence_code", "reward_item_id": "llave", "reward_item_label": "Llave"}},
        {"id": 702, "title": "Brújula", **BASE, "minigame": CHECK, "physical_node_kind": "collectible",
         "physical_item_id": "brujula", "physical_item_label": "Brújula", "config": {}},
        {"id": 703, "title": "Paso", **BASE, "minigame": CHECK, "config": {}},
        {"id": 704, "title": "Final", **BASE, "minigame": SIMON, "config": {"game_id": "sequence_code"}},
    ]


@pytest.fixture
def panel(monkeypatch, tmp_path):
    preparar_mision(monkeypatch, tmp_path)
    main.save_stages(main.STAGES_DB, mision())
    main.set_player_progress_level(USUARIO, 0)
    main.set_player_progress_level(OTRO, 0)
    monkeypatch.setattr(main, "ADMIN_OPS_DB", str(tmp_path / "admin_ops.json"))
    monkeypatch.setattr(main, "PERSONAJES_DB", str(tmp_path / "personajes.json"))
    monkeypatch.setattr(main, "MANUAL_POSITION_NOTICE_DB", str(tmp_path / "aviso_manual.json"))
    monkeypatch.setattr(main, "admin_request_authorized", lambda request, data: True)
    estado = {"cfg": dict(main.load_config())}
    estado["cfg"].pop("desbloqueables", None)
    monkeypatch.setattr(main, "load_config", lambda: dict(estado["cfg"]))
    monkeypatch.setattr(main, "save_config", lambda cfg: estado.update(cfg=dict(cfg)))
    main._desbloqueos_glue.olvidar_pendientes()
    return TestClient(main.app)


def _op():
    return "op-" + uuid.uuid4().hex[:16]


def _pedir(cliente, accion, **extra):
    return cliente.post("/api/admin/profile-action", json={"profile_id": USUARIO, "action": accion, **extra})


def _accion(cliente, accion, **extra):
    r = _pedir(cliente, accion, **extra)
    assert r.status_code == 200, r.text
    return r.json()


def _entrada(user=USUARIO):
    return main.load_player_timers().get(user) or {}


def _total(user=USUARIO):
    return main.get_player_total_time_ms(user)


def _con_tiempo(ms, nodo="701", **extra):
    return {"tiempo_modo": "nodo", "tiempo_ms": ms, "nodo_id": nodo, **extra}


# ---------------------------------------------------------------- coleccionable: objeto sin tiempo

def test_coleccionable_da_el_objeto_y_no_suma_tiempo(panel):
    main.set_player_progress_level(USUARIO, 1)
    r = _accion(panel, "level_next", tiempo_modo="ninguno")
    assert r["level"] == 2 and [e["item_id"] for e in r["entregado"]] == ["brujula"]
    assert r["tiempo_cobrado_ms"] == 0 and "tiempo_del_nodo_ms" not in r
    assert _total() == 0 and "1" not in (_entrada().get("nodos") or {})


@pytest.mark.parametrize("nivel, nodo", [(1, "702"), (2, "703")])
def test_coleccionable_o_punto_de_control_no_admite_tiempo(panel, nivel, nodo):
    main.set_player_progress_level(USUARIO, nivel)
    r = _pedir(panel, "level_next", **_con_tiempo(174_000, nodo))
    assert r.status_code == 400 and r.json()["detail"] == "node without time" and "sin tiempo" in r.json()["mensaje"]
    assert main.get_player_progress_level(USUARIO, 0) == nivel and _total() == 0


def test_la_vista_general_dice_que_nodos_llevan_tiempo(panel):
    stages = panel.post("/api/admin/react-overview", json={}).json()["stages"]
    assert [s.get("lleva_tiempo") for s in stages] == [True, False, False, True]


# ---------------------------------------------------------------- juego: tiempo del nodo, como si lo hubiera jugado

def test_juego_apunta_el_tiempo_en_el_nodo_y_suma_al_total(panel):
    rev_antes = _cambios.rev(USUARIO)
    r = _accion(panel, "level_next", **_con_tiempo(174_000))
    assert r["level"] == 1 and r["tiempo_del_nodo_ms"] == 174_000 and r["avance_del_organizador"] is True
    assert r["tiempo_cobrado_ms"] == 0  # no es una penalización: es el tiempo del nodo
    assert [e["item_id"] for e in r["entregado"]] == ["llave"]
    assert r["tiempo"]["total_time_ms"] == 174_000 and _total() == 174_000
    entrada = _entrada()
    assert entrada["stage_times_ms"]["0"] == 174_000 and not entrada.get("penalties_ms")
    registro = entrada["nodos"]["0"]
    assert registro["node_id"] == "701" and registro["applied_ms"] == 174_000 and registro["fuente"] == "organizador"
    assert registro["origen"] == "organizador" and registro["avance_del_organizador"] and not registro["perfecto"]
    assert entrada.get("started_at") and entrada.get("last_advance_at_ms")
    # El móvil se entera a la vez (la revisión sube en el candado común).
    assert _cambios.rev(USUARIO) != rev_antes


def test_el_tiempo_apuntado_manda_aunque_el_movil_abriera_el_nodo_hace_rato(panel):
    # Abrió el reto hace 20 min (se le colgó el móvil): lo que vale es lo que dice el organizador, no el observado.
    main._player_timers.record_node_opened(main.TIMERS_DB, USUARIO, "701", main._now_ms() - 20 * 60_000)
    _accion(panel, "level_next", **_con_tiempo(90_000))
    assert _entrada()["stage_times_ms"]["0"] == 90_000
    # Una apertura que llega después por la cola no lo recalcula.
    main._player_timers.record_node_opened(main.TIMERS_DB, USUARIO, "701", main._now_ms() - 30 * 60_000)
    assert _entrada()["stage_times_ms"]["0"] == 90_000 and _total() == 90_000


def test_la_clasificacion_lo_cuenta_como_un_tiempo_jugado(panel):
    _accion(panel, "level_next", **_con_tiempo(174_000))
    main.set_player_progress_level(OTRO, 1)
    main.record_player_stage_time(OTRO, 0, 200_000)
    tabla = {p["user"]: p for p in construir_tabla_de_equipo(USUARIO)["profiles"]}
    assert tabla[USUARIO]["total_time_ms"] == 174_000 and tabla[OTRO]["total_time_ms"] == 200_000
    orden = sorted((tabla[USUARIO], tabla[OTRO]), key=main._player_timers.clave_de_clasificacion)
    assert [j["user"] for j in orden] == [USUARIO, OTRO]


def test_ultimo_nodo_con_tiempo_acaba_como_cualquier_otro_final(panel):
    main.set_player_progress_level(USUARIO, 3)
    r = _accion(panel, "level_next", **_con_tiempo(60_000, "704"))
    assert r["finished"] is True and r["tiempo_del_nodo_ms"] == 60_000
    entrada = _entrada()
    assert entrada.get("finished_at") and not entrada.get("terminada_por_panel")
    # Sin tiempo, sigue siendo «terminada por el panel» (no apta para premio).
    main.set_player_progress_level(USUARIO, 3, desde_admin=True)
    _accion(panel, "level_next")
    assert _entrada().get("terminada_por_panel") is True


def test_un_tiempo_imposible_deja_la_sospecha_del_antitrampas(panel):
    _accion(panel, "level_next", **_con_tiempo(1_000))
    assert _entrada()["nodos"]["0"]["sospechoso"] is True
    razones = [s.get("reason") for s in main.list_anti_cheat_suspicions().get(USUARIO, [])]
    assert "completion_faster_than_possible" in razones


def test_queda_en_el_registro_como_avance_del_organizador(panel):
    _accion(panel, "level_next", **_con_tiempo(174_000))
    filas = _registro.list_entries(main.MATCH_LOG_DB, user=USUARIO, event_type="accion_de_admin")
    huella = next(f["payload"] for f in filas if f["payload"]["accion"] == "level_next")
    assert huella["avance_del_organizador"] is True and huella["tiempo_del_nodo_ms"] == 174_000
    assert huella["node_id"] == "701" and huella["tiempo_cobrado_ms"] == 0


# ---------------------------------------------------------------- retroceder: deshace exacto

def test_retroceder_borra_el_tiempo_apuntado_y_lo_devuelve(panel):
    _accion(panel, "level_next", **_con_tiempo(174_000))
    antes = json.dumps(_entrada().get("penalties_ms"))
    r = _accion(panel, "level_prev", op_id=_op())
    assert r["level"] == 0 and r["tiempo_borrado_ms"] == 174_000 and r["tiempo"]["total_time_ms"] == 0
    assert any("174 s" in a for a in r["avisos"])
    entrada = _entrada()
    assert not entrada.get("stage_times_ms", {}).get("0") and "0" not in (entrada.get("nodos") or {})
    assert json.dumps(entrada.get("penalties_ms")) == antes and _total() == 0
    # Y se puede volver a pasar con otro tiempo: cuenta el nuevo, no el mayor.
    _accion(panel, "level_next", **_con_tiempo(120_000))
    assert _total() == 120_000


# ---------------------------------------------------------------- op_id: un reintento no repite

def test_el_mismo_op_id_no_avanza_dos_veces_ni_suma_dos_veces(panel):
    op = _op()
    a = _accion(panel, "level_next", op_id=op, **_con_tiempo(174_000))
    b = _accion(panel, "level_next", op_id=op, **_con_tiempo(174_000))
    assert a["level"] == b["level"] == 1 and b["repetida"] is True and _total() == 174_000
    # El mismo op_id con otro tiempo no es un reintento.
    c = _pedir(panel, "level_next", op_id=op, **_con_tiempo(10_000))
    assert c.status_code == 409 and c.json()["detail"] == "op_id reused"
    atras = _op()
    _accion(panel, "level_prev", op_id=atras)
    otra = _accion(panel, "level_prev", op_id=atras)
    assert otra["repetida"] is True and main.get_player_progress_level(USUARIO, 0) == 0 and _total() == 0


def test_desde_la_cola_no_se_aplica_si_el_jugador_ya_paso_ese_nodo(panel):
    main.set_player_progress_level(USUARIO, 1)  # lo superó él mientras la acción esperaba cobertura
    r = _pedir(panel, "level_next", op_id=_op(), **_con_tiempo(174_000, "701"))
    assert r.status_code == 409 and r.json()["detail"] == "node changed" and "no se ha tocado nada" in r.json()["mensaje"]
    assert main.get_player_progress_level(USUARIO, 0) == 1 and _total() == 0


# ---------------------------------------------------------------- validación

@pytest.mark.parametrize("valor, trozo", [
    (-5_000, "negativo"),
    (500, "al menos 1 s"),
    (31 * 60_000, "tope"),
    ("abc", "no es un número"),
    (None, "Falta"),
    (True, "Falta"),
    (1500.5, "enteros"),
])
def test_tiempos_raros_se_rechazan_con_un_mensaje_claro(panel, valor, trozo):
    r = _pedir(panel, "level_next", tiempo_modo="nodo", tiempo_ms=valor, nodo_id="701")
    assert r.status_code == 400 and r.json()["detail"] == "invalid tiempo_ms" and trozo in r.json()["mensaje"]
    assert main.get_player_progress_level(USUARIO, 0) == 0 and _total() == 0


def test_el_tiempo_jugado_solo_va_con_un_nodo_adelante(panel):
    r = _pedir(panel, "mark_finished", **_con_tiempo(60_000))
    assert r.status_code == 400 and r.json()["detail"] == "invalid tiempo_modo"


def test_el_tope_de_un_nodo_se_acepta(panel):
    assert _accion(panel, "level_next", **_con_tiempo(30 * 60_000))["tiempo_del_nodo_ms"] == 30 * 60_000


# ---------------------------------------------------------------- autorización

def test_sin_sesion_de_organizador_no_se_toca_nada(panel, monkeypatch):
    monkeypatch.undo()  # quita también el «siempre autorizado»; la misión se vuelve a dejar abajo
    r = TestClient(main.app).post(
        "/api/admin/profile-action", json={"profile_id": USUARIO, "action": "level_next", **_con_tiempo(60_000)}
    )
    assert r.status_code == 403


# ---------------------------------------------------------------- lector de tiempos del panel (JS)

NODE = shutil.which("node")


def test_el_lector_de_tiempos_del_panel():
    if not NODE:
        pytest.skip("sin node")
    p = subprocess.run(
        [NODE, str(RAIZ / "tests" / "js" / "avance_con_tiempo_24_11.cjs")], capture_output=True, text=True, cwd=RAIZ,
        encoding="utf-8",
    )
    assert p.returncode == 0, p.stderr
    d = json.loads(p.stdout)
    assert d["leidos"] == {
        "2:54": 174, "02:54": 174, "174": 174, "0:05": 5, "30:00": 1800, " 1:30 ": 90, "1'30": 90, "1.30": 90,
    }
    assert all(v is None for v in d["malos"].values()), d["malos"]
    assert d["etiqueta"] == ["2:54", "0:05", "30:00"]
    assert d["tecleado"] == ["", "0:05", "0:54", "2:54", "2:54", "12:34", "34:56"]
