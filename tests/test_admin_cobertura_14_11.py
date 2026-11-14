# -*- coding: utf-8 -*-
"""14/11: el panel de administración con poca cobertura.

Una petición del panel puede aplicarse y perderse la RESPUESTA: el reintento no puede repetirla (op_id), sumar tiempo a
un jugador no le mueve el nivel, y la vista general ligera lleva las fotos como URL cacheables sin que guardar las pierda.
"""
import base64
import io
import os
import tempfile
import uuid

os.environ.setdefault("ADMIN_PASS", "pytest_admin_password")
os.environ.setdefault("SAGA_DATA_DIR", tempfile.mkdtemp(prefix="saga-test-admin-cobertura-"))

import pytest  # noqa: E402
from fastapi.testclient import TestClient  # noqa: E402

import main  # noqa: E402
from backend.app.routers import admin  # noqa: E402
from backend.app.runtime import operaciones_admin as ops  # noqa: E402
from backend.app.runtime import player_timers as pt  # noqa: E402


def _jpeg(color):
    from PIL import Image

    b = io.BytesIO()
    Image.new("RGB", (16, 16), color).save(b, "JPEG")
    return "data:image/jpeg;base64," + base64.b64encode(b.getvalue()).decode()


FOTO_A = _jpeg((200, 30, 30))
FOTO_B = _jpeg((30, 30, 200))


@pytest.fixture
def panel(monkeypatch, tmp_path):
    main.clear_admin_sessions()
    main.ADMIN_LOGIN_ATTEMPTS.clear()
    monkeypatch.setattr(main, "admin_password_change_required", lambda: False)
    # Un fichero de operaciones y de relojes propios: ningún estado compartido con otros tests.
    monkeypatch.setattr(main, "ADMIN_OPS_DB", str(tmp_path / "admin_ops.json"))
    monkeypatch.setattr(main, "TIMERS_DB", str(tmp_path / "timers.json"))
    perfiles = [
        {"id": "COB_A", "display_name": "Ana", "avatar_url": FOTO_A},
        {"id": "COB_B", "display_name": "Beto", "avatar_url": FOTO_B},
        {"id": "COB_SIN", "display_name": "Sin foto", "avatar_url": ""},
    ]
    monkeypatch.setattr(main, "get_player_profiles", lambda cfg=None: perfiles)
    monkeypatch.setattr(main, "get_runtime_stages", lambda: [{"id": f"n{i}", "presentation": {"title": f"Nodo {i}"}} for i in range(6)])
    niveles = {}
    monkeypatch.setattr(main, "get_player_progress_level", lambda user, default=0: niveles.get(user, default))
    monkeypatch.setattr(main, "load_player_progress", lambda *a, **k: dict(niveles))

    def _poner(user, level, penalty_ms=0, desde_admin=False, **k):
        niveles[user] = level
        if penalty_ms:
            main.add_player_penalty(user, penalty_ms)

    monkeypatch.setattr(main, "set_player_progress_level", _poner)
    token = main.create_admin_session()
    c = TestClient(main.app)
    c.cookies.set(main.ADMIN_SESSION_COOKIE, token)
    c.niveles = niveles
    return c


def _op():
    return "op-" + uuid.uuid4().hex[:16]


# ---------------------------------------------------------------------------
# Registro de operaciones
# ---------------------------------------------------------------------------

def test_op_id_valido_solo_acepta_ids_razonables():
    assert ops.id_valido("op-12345678") == "op-12345678"
    for malo in ("", None, "corto", "x" * 65, "con espacio 1234", "a/b/c/d/e/f/g/h", "<script>alert(1)</script>"):
        assert ops.id_valido(malo) == ""


def test_el_registro_recuerda_y_distingue_jugador_y_accion(tmp_path):
    db = str(tmp_path / "o.json")
    ops.anotar(db, "op-aaaaaaaa", "ana", "level_next", {"status": "ok", "level": 3})
    assert ops.buscar(db, "op-aaaaaaaa", "ana", "level_next") == {"status": "ok", "level": 3}
    # Otro jugador con el mismo id: no es suyo.
    assert ops.buscar(db, "op-aaaaaaaa", "beto", "level_next") is None
    # El mismo id para OTRA acción no es un reintento.
    with pytest.raises(ops.OperacionReutilizada):
        ops.buscar(db, "op-aaaaaaaa", "ana", "level_prev")


def test_el_registro_poda_lo_viejo_y_lo_que_sobra(tmp_path, monkeypatch):
    db = str(tmp_path / "o.json")
    ops.anotar(db, "op-viejoooo", "ana", "x", {"a": 1}, ahora_s=1_000)
    ops.anotar(db, "op-nuevooo1", "ana", "x", {"a": 2}, ahora_s=1_000 + ops.EDAD_MAXIMA_S + 5)
    assert ops.buscar(db, "op-viejoooo", "ana") is None  # caducó
    monkeypatch.setattr(ops, "MAXIMO", 5)
    for i in range(12):
        ops.anotar(db, f"op-lote{i:04d}", "ana", "x", {"i": i}, ahora_s=5_000_000 + i)
    guardadas = [i for i in range(12) if ops.buscar(db, f"op-lote{i:04d}", "ana")]
    assert guardadas == [7, 8, 9, 10, 11]  # solo las 5 más recientes


# ---------------------------------------------------------------------------
# Sumar y restar tiempo
# ---------------------------------------------------------------------------

def test_sumar_y_restar_tiempo_no_baja_de_cero_ni_toca_los_nodos(tmp_path):
    db = str(tmp_path / "t.json")
    pt.record_player_stage_time(db, "u", 0, 30_000)
    r = pt.ajustar_tiempo_admin(db, "u", 45_000, "op-1", "falló el juego")
    assert r == {"aplicado_ms": 45_000, "ajuste_admin_ms": 45_000, "total_time_ms": 75_000}
    assert pt.get_player_total_time_ms(db, "u") == 75_000
    # Restar de más: se queda en 0, no en negativo.
    r = pt.ajustar_tiempo_admin(db, "u", -500_000, "op-2")
    assert r["total_time_ms"] == 0 and r["aplicado_ms"] == -75_000
    assert pt.load_player_timers(db)["u"]["stage_times_ms"] == {"0": 30_000}  # los nodos, intactos


def test_el_ajuste_tiene_tope_por_vez_y_un_reinicio_lo_borra(tmp_path):
    db = str(tmp_path / "t.json")
    r = pt.ajustar_tiempo_admin(db, "u", 10 * 3600 * 1000)
    assert r["aplicado_ms"] == pt.AJUSTE_ADMIN_MAXIMO_MS
    pt.clear_all_player_timers(db, "u")
    assert pt.get_player_total_time_ms(db, "u") == 0
    assert "ajuste_admin_ms" not in pt.load_player_timers(db)["u"]


def test_el_registro_de_ajustes_se_acota(tmp_path):
    db = str(tmp_path / "t.json")
    for i in range(60):
        pt.ajustar_tiempo_admin(db, "u", 1000, f"op-{i}")
    assert len(pt.load_player_timers(db)["u"]["ajustes_admin"]) == pt.AJUSTES_ADMIN_GUARDADOS


def test_endpoint_tiempo_es_idempotente_y_no_mueve_el_nivel(panel):
    panel.niveles["COB_A"] = 3
    op = _op()
    cuerpo = {"profile_id": "COB_A", "segundos": 45, "motivo": "se equivocó en el juego", "op_id": op}
    r1 = panel.post("/api/admin/jugador/tiempo", json=cuerpo)
    assert r1.status_code == 200, r1.text
    assert r1.json()["aplicado_ms"] == 45_000 and not r1.json().get("repetida")
    # La respuesta se perdió: el panel repite la MISMA operación.
    r2 = panel.post("/api/admin/jugador/tiempo", json=cuerpo)
    assert r2.json()["repetida"] is True and r2.json()["ajuste_admin_ms"] == 45_000
    # Una operación NUEVA sí suma.
    r3 = panel.post("/api/admin/jugador/tiempo", json={**cuerpo, "op_id": _op(), "segundos": 15})
    assert r3.json()["ajuste_admin_ms"] == 60_000
    assert panel.niveles["COB_A"] == 3  # no le hace retroceder ni avanzar
    # Y llega el tiempo y la ficha en la propia respuesta (el panel no pide la vista general otra vez).
    assert r3.json()["tiempo"]["total_time_ms"] == 60_000 and r3.json()["perfil"]["id"] == "COB_A"


def test_endpoint_tiempo_restar_y_validaciones(panel):
    base = {"profile_id": "COB_A", "op_id": _op()}
    assert panel.post("/api/admin/jugador/tiempo", json={**base, "segundos": 120}).status_code == 200
    r = panel.post("/api/admin/jugador/tiempo", json={"profile_id": "COB_A", "op_id": _op(), "segundos": -60})
    assert r.json()["aplicado_ms"] == -60_000 and r.json()["ajuste_admin_ms"] == 60_000
    assert panel.post("/api/admin/jugador/tiempo", json={**base, "op_id": _op(), "segundos": 0}).status_code == 400
    assert panel.post("/api/admin/jugador/tiempo", json={"profile_id": "NOEXISTE", "segundos": 5}).status_code == 404
    assert panel.post("/api/admin/jugador/tiempo", json={"segundos": 5}).status_code == 404
    # Un valor disparatado se acota en 6 h.
    r = panel.post("/api/admin/jugador/tiempo", json={"profile_id": "COB_B", "op_id": _op(), "segundos": 10**9})
    assert r.json()["aplicado_ms"] == 6 * 3600 * 1000


def test_endpoint_tiempo_exige_sesion_de_administrador():
    sin_sesion = TestClient(main.app)
    assert sin_sesion.post("/api/admin/jugador/tiempo", json={"profile_id": "COB_A", "segundos": 5}).status_code == 403


def test_un_op_id_de_otro_jugador_o_de_otra_accion_no_se_da_por_hecho(panel):
    op = _op()
    ra = panel.post("/api/admin/jugador/tiempo", json={"profile_id": "COB_A", "segundos": 30, "op_id": op})
    assert ra.status_code == 200
    # El mismo id para OTRO jugador es una operación nueva (no se la regalan a Beto como hecha).
    rb = panel.post("/api/admin/jugador/tiempo", json={"profile_id": "COB_B", "segundos": 30, "op_id": op})
    assert rb.status_code == 200 and not rb.json().get("repetida") and rb.json()["ajuste_admin_ms"] == 30_000
    # El mismo id para OTRA acción del mismo jugador se rechaza: no es un reintento.
    r = panel.post("/api/admin/profile-action", json={"profile_id": "COB_A", "action": "level_next", "op_id": op})
    assert r.status_code == 409 and r.json()["detail"] == "op_id reused"
    assert panel.niveles.get("COB_A", 0) == 0  # y no se avanzó nada


# ---------------------------------------------------------------------------
# profile-action con op_id
# ---------------------------------------------------------------------------

def test_avanzar_con_el_mismo_op_id_dos_veces_avanza_una_sola(panel):
    op = _op()
    cuerpo = {"profile_id": "COB_A", "action": "level_next", "op_id": op}
    r1 = panel.post("/api/admin/profile-action", json=cuerpo)
    r2 = panel.post("/api/admin/profile-action", json=cuerpo)
    assert r1.json()["level"] == 1 and not r1.json().get("repetida")
    assert r2.json()["level"] == 1 and r2.json()["repetida"] is True
    assert panel.niveles["COB_A"] == 1
    # Con otro op_id (otra pulsación) sí avanza.
    r3 = panel.post("/api/admin/profile-action", json={**cuerpo, "op_id": _op()})
    assert r3.json()["level"] == 2 and panel.niveles["COB_A"] == 2


def test_sin_op_id_o_con_uno_invalido_todo_sigue_como_antes(panel):
    panel.post("/api/admin/profile-action", json={"profile_id": "COB_B", "action": "level_next"})
    panel.post("/api/admin/profile-action", json={"profile_id": "COB_B", "action": "level_next", "op_id": "corto"})
    assert panel.niveles["COB_B"] == 2  # sin idempotencia, como la versión de siempre


def test_la_respuesta_trae_la_ficha_y_el_tiempo(panel):
    r = panel.post("/api/admin/profile-action", json={"profile_id": "COB_A", "action": "level_next", "op_id": _op()}).json()
    assert r["perfil"]["id"] == "COB_A" and r["perfil"]["level"] == 1
    assert "avatar_url" not in r["perfil"]  # la foto no viaja con cada acción
    assert set(r["tiempo"]) == {"total_time_ms", "penalties_ms", "ajuste_admin_ms"}


def test_la_repeticion_no_vuelve_a_auditar(panel, monkeypatch):
    llamadas = []
    monkeypatch.setattr(admin, "_auditar", lambda *a, **k: llamadas.append(a[1]))
    cuerpo = {"profile_id": "COB_A", "action": "level_next", "op_id": _op()}
    panel.post("/api/admin/profile-action", json=cuerpo)
    panel.post("/api/admin/profile-action", json=cuerpo)
    assert llamadas == ["jugador:level_next"]


# ---------------------------------------------------------------------------
# Vista general ligera y fotos por URL
# ---------------------------------------------------------------------------

def _ligero(panel):
    r = panel.post("/api/admin/react-overview", json={"ligero": True})
    assert r.status_code == 200, r.text
    return r.json()


def test_la_vista_ligera_cambia_las_fotos_por_url_y_la_completa_no(panel):
    completa = panel.post("/api/admin/react-overview", json={}).json()
    assert completa["player_profiles"][0]["avatar_url"].startswith("data:image/jpeg")
    ligera = _ligero(panel)
    urls = [p["avatar_url"] for p in ligera["player_profiles"]]
    assert urls[0].startswith("/api/admin/foto/COB_A?v=") and urls[1].startswith("/api/admin/foto/COB_B?v=")
    assert urls[2] == ""  # sin foto, sin URL
    assert urls[0] != urls[1]  # la huella cambia con la foto
    assert len(str(ligera["player_profiles"])) < len(str(completa["player_profiles"])) // 2


def test_la_foto_se_sirve_cacheable_con_etag_y_solo_con_sesion(panel):
    url = _ligero(panel)["player_profiles"][0]["avatar_url"]
    r = panel.get(url)
    assert r.status_code == 200 and r.headers["content-type"] == "image/jpeg"
    assert r.content[:2] == b"\xff\xd8"
    assert "immutable" in r.headers["cache-control"] and "private" in r.headers["cache-control"]
    assert r.headers["cdn-cache-control"] == "no-store"
    r304 = panel.get(url, headers={"If-None-Match": r.headers["etag"]})
    assert r304.status_code == 304
    assert TestClient(main.app).get(url).status_code == 403  # las caras no son públicas
    assert panel.get("/api/admin/foto/NOEXISTE").status_code == 404
    assert panel.get("/api/admin/foto/COB_SIN").status_code == 404


def test_guardar_con_las_url_de_la_vista_ligera_conserva_las_fotos(panel, monkeypatch):
    cfg = {"player_profiles": [{"id": "COB_A", "avatar_url": FOTO_A}, {"id": "COB_B", "avatar_url": FOTO_B}], "players": ["COB_A", "COB_B"]}
    guardado = {}
    monkeypatch.setattr(main, "load_config", lambda: dict(cfg))
    monkeypatch.setattr(main, "save_config", lambda c: guardado.update(c))
    fichas = [
        {"id": "COB_A", "display_name": "Ana", "avatar_url": "/api/admin/foto/COB_A?v=cae2e1cc83"},
        # Se le CAMBIÓ el id a la ficha en el panel: conserva la foto del id que tenía.
        {"id": "COB_RENOMBRADO", "display_name": "Beto", "avatar_url": "/api/admin/foto/COB_B?v=13a16ce0e7"},
        # Una foto nueva (data URI) manda; una URL de un id sin foto deja la ficha sin foto.
        {"id": "COB_NUEVO", "display_name": "N", "avatar_url": FOTO_B},
        {"id": "COB_FANTASMA", "display_name": "F", "avatar_url": "/api/admin/foto/NADIE?v=0000000000"},
    ]
    r = panel.post("/api/admin/save-config", json={"config": {"player_profiles": fichas}})
    assert r.status_code == 200, r.text
    por_id = {p["id"]: p["avatar_url"] for p in guardado["player_profiles"]}
    assert por_id == {"COB_A": FOTO_A, "COB_RENOMBRADO": FOTO_B, "COB_NUEVO": FOTO_B, "COB_FANTASMA": ""}


def test_quitar_la_foto_a_proposito_sigue_funcionando(panel, monkeypatch):
    cfg = {"player_profiles": [{"id": "COB_A", "avatar_url": FOTO_A}], "players": ["COB_A"]}
    guardado = {}
    monkeypatch.setattr(main, "load_config", lambda: dict(cfg))
    monkeypatch.setattr(main, "save_config", lambda c: guardado.update(c))
    panel.post("/api/admin/save-config", json={"config": {"player_profiles": [{"id": "COB_A", "avatar_url": ""}]}})
    assert guardado["player_profiles"][0]["avatar_url"] == ""


def test_una_foto_que_no_es_raster_se_deja_inline_en_la_vista_ligera():
    svg = "data:image/svg+xml;base64,PHN2Zy8+"
    assert admin.foto_por_url("X", svg) == svg
    assert admin.foto_por_url("X", "https://ejemplo.org/a.jpg") == "https://ejemplo.org/a.jpg"
    assert admin.foto_por_url("a b/c", FOTO_A).startswith("/api/admin/foto/a%20b%2Fc?v=")


def test_el_tiempo_sumado_llega_a_la_vista_en_vivo_y_a_la_tabla_de_tiempos(panel):
    panel.post("/api/admin/jugador/tiempo", json={"profile_id": "COB_A", "segundos": 90, "op_id": _op(), "motivo": "juego en 30 s mal hecho"})
    tiempos = panel.post("/api/admin/tiempos", json={}).json()
    ana = next(j for j in tiempos["jugadores"] if j["user"] == "COB_A")
    assert ana["ajuste_admin_ms"] == 90_000 and ana["total_time_ms"] >= 90_000
    assert ana["ajustes_admin"][-1]["motivo"] == "juego en 30 s mal hecho"
