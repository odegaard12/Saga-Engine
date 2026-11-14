# -*- coding: utf-8 -*-
"""15/11: entrar al panel con MUY poca cobertura en una sola ida y vuelta.

`POST /api/admin/arranque` junta la vista general ligera, los nodos guardados, la configuración pública y el estado en vivo;
el login puede traerlo ya en su respuesta (`arranque: true`); con las huellas de lo ya recibido el servidor no repite lo que
no cambió; y el estado en vivo contesta «sin cambios» si nada se movió. Seguridad: las mismas puertas que la vista general.
"""
import os
import tempfile

os.environ.setdefault("ADMIN_PASS", "pytest_admin_password")
os.environ.setdefault("SAGA_DATA_DIR", tempfile.mkdtemp(prefix="saga-test-admin-arranque-"))

import pytest  # noqa: E402
from fastapi.testclient import TestClient  # noqa: E402

import main  # noqa: E402


@pytest.fixture
def panel(monkeypatch, tmp_path):
    main.clear_admin_sessions()
    main.ADMIN_LOGIN_ATTEMPTS.clear()
    monkeypatch.setattr(main, "admin_password_change_required", lambda: False)
    monkeypatch.setattr(main, "ADMIN_OPS_DB", str(tmp_path / "admin_ops.json"))
    perfiles = [
        {"id": "ARR_A", "display_name": "Ana", "avatar_url": ""},
        {"id": "ARR_B", "display_name": "Beto", "avatar_url": ""},
    ]
    monkeypatch.setattr(main, "get_player_profiles", lambda cfg=None: perfiles)
    monkeypatch.setattr(main, "get_runtime_stages", lambda: [{"id": f"n{i}", "presentation": {"title": f"Nodo {i}"}} for i in range(3)])
    niveles = {"ARR_A": 1, "ARR_B": 0}
    monkeypatch.setattr(main, "load_player_progress", lambda *a, **k: dict(niveles))
    token = main.create_admin_session()
    c = TestClient(main.app)
    c.cookies.set(main.ADMIN_SESSION_COOKIE, token)
    c.niveles = niveles
    return c


def test_sin_sesion_el_arranque_da_403_y_no_enseña_nada():
    r = TestClient(main.app).post("/api/admin/arranque", json={})
    assert r.status_code == 403 and "stages" not in r.text and "overview" not in r.text


def test_el_arranque_trae_las_cuatro_partes_en_una_respuesta(panel):
    r = panel.post("/api/admin/arranque", json={})
    assert r.status_code == 200
    j = r.json()
    assert j["status"] == "ok"
    assert j["overview"]["status"] == "ok" and len(j["overview"]["profiles"]) == 2
    assert j["stages"]["status"] == "ok" and isinstance(j["stages"]["stages"], list)
    assert j["stages"]["stages_revision"] == j["overview"]["stages_revision"]
    assert "site_name" in j["config"] and "server_time_ms" in j["config"]
    assert j["live"]["status"] == "ok" and {p["user"] for p in j["live"]["profiles"]} == {"ARR_A", "ARR_B"}
    assert set(j["huellas"]) == {"overview", "stages", "config"}
    # La vista general va ligera: las fotos como URL, nunca incrustadas.
    assert "data:image" not in r.text


def test_la_vista_y_los_nodos_son_los_mismos_que_dan_sus_endpoints_de_siempre(panel):
    j = panel.post("/api/admin/arranque", json={}).json()
    vista = panel.post("/api/admin/react-overview", json={"ligero": True}).json()
    nodos = panel.post("/api/admin/stages", json={}).json()
    assert j["overview"] == vista
    assert j["stages"] == nodos


def test_con_las_huellas_de_lo_ya_recibido_no_se_repite_lo_que_no_cambio(panel):
    primera = panel.post("/api/admin/arranque", json={}).json()
    segunda = panel.post("/api/admin/arranque", json={"huellas": primera["huellas"]}).json()
    assert segunda["overview"] == {"sin_cambios": True}
    assert segunda["stages"] == {"sin_cambios": True}
    assert segunda["config"] == {"sin_cambios": True}
    assert segunda["huellas"] == primera["huellas"]  # estables: sin la hora del servidor dentro
    # El estado en vivo va SIEMPRE (lo que se mueve; es pequeño).
    assert segunda["live"]["status"] in ("ok", "sin_cambios")


def test_una_huella_vieja_o_falsa_trae_la_parte_entera(panel):
    j = panel.post("/api/admin/arranque", json={"huellas": {"overview": "0000", "stages": 5, "config": None}}).json()
    assert j["overview"]["status"] == "ok" and j["stages"]["status"] == "ok" and "sin_cambios" not in j["config"]


def test_si_cambian_los_nodos_se_manda_la_parte_cambiada(panel, monkeypatch):
    primera = panel.post("/api/admin/arranque", json={}).json()
    nodos = main.load_stages(main.STAGES_DB)
    monkeypatch.setattr(main, "load_stages", lambda *a, **k: list(nodos) + [{"id": "nuevo", "type": "checkpoint", "title": "Nuevo", "lat": 1.0, "lon": 1.0}])
    segunda = panel.post("/api/admin/arranque", json={"huellas": primera["huellas"]}).json()
    assert "sin_cambios" not in segunda["stages"] and len(segunda["stages"]["stages"]) == len(nodos) + 1
    assert segunda["huellas"]["stages"] != primera["huellas"]["stages"]


def test_con_la_clave_por_cambiar_el_arranque_no_da_datos(panel, monkeypatch):
    monkeypatch.setattr(main, "admin_password_change_required", lambda: True)
    j = panel.post("/api/admin/arranque", json={}).json()
    assert j["status"] == "password_change_required" and "stages" not in j


# --- el login trae el arranque -------------------------------------------------------------------------------------------

def test_el_login_con_arranque_true_trae_ya_lo_que_pide_el_panel(panel):
    c = TestClient(main.app)
    r = c.post("/api/admin/login", json={"password": os.environ["ADMIN_PASS"], "arranque": True})
    assert r.status_code == 200
    j = r.json()
    assert j["status"] == "ok" and j["arranque"]["status"] == "ok"
    assert j["arranque"]["stages"]["status"] == "ok" and j["arranque"]["live"]["status"] == "ok"
    assert main.ADMIN_SESSION_COOKIE in r.headers.get("set-cookie", "")


def test_el_login_sin_arranque_sigue_como_siempre(panel):
    r = TestClient(main.app).post("/api/admin/login", json={"password": os.environ["ADMIN_PASS"]})
    assert r.status_code == 200 and "arranque" not in r.json()


def test_con_la_clave_mal_el_login_no_da_ni_el_arranque(panel):
    r = TestClient(main.app).post("/api/admin/login", json={"password": "mala", "arranque": True})
    assert r.status_code == 401 and "arranque" not in r.text and "stages" not in r.text


def test_con_la_clave_por_cambiar_el_login_no_trae_el_arranque(panel, monkeypatch):
    monkeypatch.setattr(main, "admin_password_change_required", lambda: True)
    j = TestClient(main.app).post("/api/admin/login", json={"password": os.environ["ADMIN_PASS"], "arranque": True}).json()
    assert j["must_change"] is True and "arranque" not in j


def test_un_fallo_al_preparar_el_arranque_no_impide_entrar(panel, monkeypatch):
    from backend.app.routers import admin

    def _rota(*a, **k):
        raise RuntimeError("disco roto")

    monkeypatch.setattr(admin, "_arranque", _rota)
    r = TestClient(main.app).post("/api/admin/login", json={"password": os.environ["ADMIN_PASS"], "arranque": True})
    assert r.status_code == 200 and r.json()["status"] == "ok" and "arranque" not in r.json()


# --- estado en vivo con huella ------------------------------------------------------------------------------------------------

def test_el_estado_en_vivo_dice_sin_cambios_si_nada_se_movio(panel):
    a = panel.post("/api/admin/mission-status", json={}).json()
    assert a["status"] == "ok" and a["etag"] and len(a["profiles"]) == 2
    b = panel.post("/api/admin/mission-status", json={"etag": a["etag"]}).json()
    assert b == {"status": "sin_cambios", "server_ts": b["server_ts"], "etag": a["etag"]}
    # Un cambio (alguien avanza) trae la lista entera con otra huella.
    panel.niveles["ARR_B"] = 2
    c = panel.post("/api/admin/mission-status", json={"etag": a["etag"]}).json()
    assert c["status"] == "ok" and c["etag"] != a["etag"]
    assert {p["user"]: p["level"] for p in c["profiles"]}["ARR_B"] == 2


def test_una_huella_que_no_es_texto_se_ignora(panel):
    j = panel.post("/api/admin/mission-status", json={"etag": {"x": 1}}).json()
    assert j["status"] == "ok" and j["etag"]
