# -*- coding: utf-8 -*-
"""11/11 (auditoría): el aviso «OK» sólo supera un nodo si el jugador entró en él, llegó o juega en modo prueba.

Antes `POST /api/advance {"code": "OK"}` desde la consola superaba cualquier nodo de minijuego, llegada o
coleccionable sin jugar ni estar allí. Regla (main.aviso_sin_entrada; Óscar: «con GPS malo, si entró, llegó o si hizo
debug»): vale con la apertura del nodo (evento `node_opened` o `evidence.abierto_ms`), con cercanía, o en modo prueba.
"""
import os
import tempfile
import time

os.environ.setdefault("ADMIN_PASS", "pytest_admin_password")
os.environ.setdefault("SAGA_DATA_DIR", tempfile.mkdtemp(prefix="saga-test-ok-entrada-"))

import pytest  # noqa: E402
from fastapi import FastAPI  # noqa: E402
from fastapi.testclient import TestClient  # noqa: E402

import main  # noqa: E402
from backend.app.routers import game as game_router  # noqa: E402
from backend.app.runtime import motivos_de_rechazo  # noqa: E402
from backend.app.storage.json_store import save_json  # noqa: E402
from backend.app.storage.runtime_store import save_stages  # noqa: E402

LAT, LON = 40.400, -3.700
CERCA = (LAT + 0.0003, LON)
LEJOS = (LAT + 0.01, LON)


@pytest.fixture
def cliente(monkeypatch):
    monkeypatch.setattr(main, "EXIGIR_ENTRADA_PARA_OK", True)
    monkeypatch.setattr(main, "require_player_session", lambda *a, **k: None)
    monkeypatch.setattr(main, "enforce_player_rate_limit", lambda *a, **k: None)
    monkeypatch.setattr(main, "resolve_known_player_profile", lambda u, cfg=None: {"id": u, "display_name": u})
    save_stages(
        main.STAGES_DB,
        [
            {
                "id": "e0", "title": "Nodo 0", "lat": LAT, "lon": LON, "radius": 40, "entry_mode": "gps",
                "type": "signal_hunt", "config": {"game_id": "spark_radar", "success_code": "CLAVE7"},
            },
            {"id": "e1", "title": "Nodo 1", "lat": LAT, "lon": LON + 0.01, "radius": 40, "type": "signal_hunt",
             "config": {"game_id": "spark_radar"}},
        ],
    )
    app = FastAPI()
    app.include_router(game_router.router)
    return TestClient(app)


def _nuevo(usuario):
    save_json(main.ANTI_CHEAT_DB, {})
    save_json(main.MANUAL_POSITION_NOTICE_DB, {})
    main.clear_all_player_timers(usuario)
    main.set_player_progress_level(usuario, 0)
    main.clear_live_position(usuario)
    return usuario


def _gps(punto, src="real"):
    return {"t": int(time.time() * 1000), "lat": punto[0], "lon": punto[1], "acc": 10, "src": src}


def _avanzar(cliente, usuario, evidencia=None, code="OK", manual=False):
    cuerpo = {"user": usuario, "code": code, "manual": manual, "level_before": 0, "time_spent_ms": 20000}
    if evidencia is not None:
        cuerpo["evidence"] = evidencia
    return cliente.post("/api/advance", json=cuerpo).json()


def _evento(cid, evidencia, tipo="node_completed", nodo=None):
    carga = {"local_created_at": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())}
    if tipo == "node_completed":
        carga.update({"code": "OK", "level_before": 0, "time_spent_ms": 20000, "evidence": evidencia})
    evento = {"type": tipo, "client_event_id": cid, "payload": carga}
    if nodo:
        evento["node_id"] = nodo
    return evento


def _sync(cliente, usuario, eventos):
    return cliente.post("/api/events/sync", json={"user": usuario, "events": eventos}).json()["events"]


# --- En línea ------------------------------------------------------------------


def test_ok_a_pelo_desde_la_consola_se_rechaza(cliente):
    u = _nuevo("OkPelo")
    for evidencia in (None, {"v": 1, "via": "juego"}, {"v": 1, "abierto_ms": 0}, {"v": 1, "abierto_ms": "x"}):
        r = _avanzar(cliente, u, evidencia)
        assert r["status"] == "fail" and r["reason"] == motivos_de_rechazo.SIN_ENTRADA, r
        assert r["message"]
    assert main.get_player_progress_level(u, 0) == 0


def test_con_apertura_y_sin_gps_se_acepta(cliente):
    """GPS malo: abrió el nodo y lo jugó. No se queda bloqueado."""
    u = _nuevo("OkAbierto")
    r = _avanzar(cliente, u, {"v": 1, "via": "juego", "abierto_ms": int(time.time() * 1000) - 30000})
    assert r["status"] == "ok" and r["level"] == 1


def test_con_la_apertura_que_ya_vio_el_servidor_se_acepta(cliente):
    """Móvil con la aplicación vieja (no manda `abierto_ms`): vale el `node_opened` que subió por la cola."""
    u = _nuevo("OkEvento")
    _sync(cliente, u, [_evento("abre-1", None, tipo="node_opened", nodo="e0")])
    assert _avanzar(cliente, u, {"v": 1, "via": "juego"})["status"] == "ok"


def test_la_apertura_de_otro_nodo_no_vale(cliente):
    u = _nuevo("OkOtroNodo")
    _sync(cliente, u, [_evento("abre-otro", None, tipo="node_opened", nodo="e1")])
    assert _avanzar(cliente, u, {"v": 1, "via": "juego"})["reason"] == motivos_de_rechazo.SIN_ENTRADA


def test_cerca_del_nodo_se_acepta_y_lejos_sin_abrir_no(cliente):
    u = _nuevo("OkCerca")
    assert _avanzar(cliente, u, {"v": 1, "gps": [_gps(LEJOS)]})["reason"] == motivos_de_rechazo.SIN_ENTRADA
    assert _avanzar(cliente, u, {"v": 1, "gps": [_gps(CERCA)]})["status"] == "ok"


def test_modo_prueba_o_depuracion_se_acepta(cliente, monkeypatch):
    assert _avanzar(cliente, _nuevo("SIM_ok"), {"v": 1})["status"] == "ok"  # jugador simulado
    u = _nuevo("OkPrueba")
    monkeypatch.setattr(main, "es_modo_prueba", lambda pid: pid == u)
    assert _avanzar(cliente, u, {"v": 1})["status"] == "ok"


def test_el_codigo_del_nodo_y_el_tecleado_no_cambian(cliente):
    """La regla es sólo para el aviso «OK»: el código propio del nodo sigue valiendo como siempre."""
    u = _nuevo("OkCodigo")
    assert _avanzar(cliente, u, {"v": 1}, code="CLAVE7", manual=True)["status"] == "ok"
    u2 = _nuevo("OkTecleado")
    r = _avanzar(cliente, u2, {"v": 1, "abierto_ms": 5}, code="OK", manual=True)
    assert r["status"] != "ok" and r.get("reason") != motivos_de_rechazo.SIN_ENTRADA  # «OK» tecleado nunca valió


# --- Por la cola (sin cobertura) -----------------------------------------------


def test_offline_en_cola_con_su_apertura_se_acepta(cliente):
    u = _nuevo("OkCola")
    r = _sync(cliente, u, [_evento("cola-1", {"v": 1, "via": "juego", "abierto_ms": int(time.time() * 1000) - 60000})])
    assert r[0]["status"] == "synced", r
    assert main.get_player_progress_level(u, 0) == 1


def test_offline_la_apertura_va_delante_en_la_misma_tanda(cliente):
    """Aplicación vieja sin cobertura: el `node_opened` y el avance suben juntos, en orden."""
    u = _nuevo("OkTanda")
    r = _sync(cliente, u, [
        _evento("tanda-abre", None, tipo="node_opened", nodo="e0"),
        _evento("tanda-ok", {"v": 1, "via": "juego"}),
    ])
    assert r[1]["status"] == "synced", r
    assert main.get_player_progress_level(u, 0) == 1


def test_offline_sin_apertura_es_rechazo_definitivo_y_no_reintenta(cliente):
    u = _nuevo("OkColaMal")
    r = _sync(cliente, u, [_evento("mal-1", {"v": 1, "via": "juego"})])
    assert r[0]["status"] == "failed" and r[0]["error"] == motivos_de_rechazo.SIN_ENTRADA, r
    assert r[0]["motivo"] == motivos_de_rechazo.MOTIVOS[motivos_de_rechazo.SIN_ENTRADA]
    assert main.get_player_progress_level(u, 0) == 0
    # Los móviles con la aplicación vieja buscan `invalid_completion_code` para dejar de insistir.
    assert "invalid_completion_code" in r[0]["error"]
    # El mismo evento otra vez: cerrado, no vuelve a evaluarse ni a avanzar.
    otra = _sync(cliente, u, [_evento("mal-1", {"v": 1, "via": "juego"})])
    assert otra[0]["status"] in ("failed", "duplicate", "ignored") and main.get_player_progress_level(u, 0) == 0


def test_reiniciar_borra_las_entradas(cliente):
    u = _nuevo("OkReinicio")
    _sync(cliente, u, [_evento("abre-r", None, tipo="node_opened", nodo="e0")])
    main.clear_all_player_timers(u)
    assert _avanzar(cliente, u, {"v": 1})["reason"] == motivos_de_rechazo.SIN_ENTRADA
