# -*- coding: utf-8 -*-
"""14/11 (auditoría de ajustes): lo que el organizador escribe llega al jugador, los ajustes no mienten y no se guardan basuras.

Cada prueba falla sin el arreglo correspondiente.
"""
import json
import os
import re
import shutil
import subprocess
import tempfile
from pathlib import Path

os.environ.setdefault("ADMIN_PASS", "pytest_admin_password")
os.environ.setdefault("SAGA_DATA_DIR", tempfile.mkdtemp(prefix="saga-test-ajustes-"))

import pytest  # noqa: E402
from fastapi.testclient import TestClient  # noqa: E402

import main  # noqa: E402
from backend.app.runtime.textos_por_defecto import TEXTOS_POR_DEFECTO  # noqa: E402

RAIZ = Path(__file__).resolve().parent.parent
FRONT = RAIZ / "frontend" / "src"


def _sin_comentarios(ruta: Path) -> str:
    t = ruta.read_text(encoding="utf-8")
    t = re.sub(r"/\*.*?\*/", "", t, flags=re.DOTALL)
    return re.sub(r"(?m)//.*$", "", t)


@pytest.fixture
def panel(monkeypatch, tmp_path):
    cfg = {}
    monkeypatch.setattr(main, "load_config", lambda: dict(cfg))
    monkeypatch.setattr(main, "save_config", lambda nuevo: (cfg.clear(), cfg.update(nuevo)))
    main.clear_admin_sessions()
    main.ADMIN_LOGIN_ATTEMPTS.clear()
    monkeypatch.setattr(main, "admin_password_change_required", lambda: False)
    token = main.create_admin_session()
    c = TestClient(main.app)
    c.cookies.set(main.ADMIN_SESSION_COOKIE, token)
    c.cfg = cfg
    return c


# --- 2 y 9: «Pantalla de inicio de sesión» llega al login -------------------------------------------------------


def test_lo_que_se_escribe_para_el_login_sale_en_api_config(panel):
    sin = TestClient(main.app).get("/api/config").json()
    # Sin escribir nada: vacío (el login usa el nombre de la misión y la historia), NO «Acceso protegido» ni un «PUT …».
    assert sin["login_title"] == "" and sin["login_subtitle"] == "" and sin["login_instructions"] == ""
    r = panel.post(
        "/api/admin/save-config",
        json={"config": {"login_title": "Bienvenidos a la ruta", "login_subtitle": "Elige tu nombre", "login_instructions": "Pulsa tu nombre."}},
    )
    assert r.status_code == 200, r.text
    ahora = TestClient(main.app).get("/api/config").json()
    assert (ahora["login_title"], ahora["login_subtitle"], ahora["login_instructions"]) == (
        "Bienvenidos a la ruta",
        "Elige tu nombre",
        "Pulsa tu nombre.",
    )


def test_el_login_usa_esos_textos_y_los_de_la_mision_de_respaldo():
    f = _sin_comentarios(FRONT / "login" / "LoginApp.tsx")
    for campo in ("login_title", "login_subtitle", "login_instructions"):
        assert f"config.{campo}" in f, campo
    for respaldo in ("config.site_name", "config.story_title", "config.story_text"):
        assert respaldo in f, respaldo


def test_el_panel_tiene_un_solo_campo_de_subtitulo_del_login():
    panel_tsx = _sin_comentarios(FRONT / "admin" / "components" / "SettingsPanel.tsx")
    assert panel_tsx.count("onUpdateMissionDraft('login_subtitle'") == 1


# --- 15: una sola fuente de textos por defecto ------------------------------------------------------------------


def test_los_textos_por_defecto_son_los_mismos_en_servidor_y_panel():
    en_json = json.loads((RAIZ / "shared" / "textos_por_defecto.json").read_text(encoding="utf-8"))
    assert TEXTOS_POR_DEFECTO == en_json
    for fichero in ("admin/AdminApp.tsx", "admin/components/SettingsPanel.tsx"):
        t = _sin_comentarios(FRONT / fichero)
        assert "TEXTOS_POR_DEFECTO" in t, fichero
        for literal in ("'Control de misión'", "'Panel de la misión'", "'Mission Control'", "'SAGA Engine'"):
            assert literal not in t, (fichero, literal)
        for literal in ('"Control de misión"', '"Panel de control con mapa"', '"Acceso protegido"'):
            assert literal not in t, (fichero, literal)


def test_la_config_publica_no_ensena_placeholders_ni_ingles_viejo(panel):
    panel.cfg.update({"site_name": "PUT TITLE HERE", "admin_title": "Mission Control", "admin_subtitle": "PUT ADMIN SUBTITLE HERE"})
    c = TestClient(main.app).get("/api/config").json()
    assert c["site_name"] == TEXTOS_POR_DEFECTO["site_name"]
    assert c["admin_title"] == TEXTOS_POR_DEFECTO["admin_title"]
    assert c["admin_subtitle"] == TEXTOS_POR_DEFECTO["admin_subtitle"]


def test_guardar_sin_texto_pone_los_por_defecto_en_castellano(panel):
    r = panel.post("/api/admin/save-config", json={"config": {"site_name": "", "admin_title": "", "admin_subtitle": ""}})
    assert r.status_code == 200
    assert panel.cfg["admin_title"] == "Control de misión" and panel.cfg["admin_subtitle"] == "Panel de control con mapa"
    assert panel.cfg["site_name"] == TEXTOS_POR_DEFECTO["site_name"]


# --- 22, 7, 14: lo que se guarda -------------------------------------------------------------------------------


def test_una_fecha_de_salida_con_basura_es_un_400_no_un_guardado(panel):
    r = panel.post("/api/admin/save-config", json={"config": {"mission_launch_at": "mañana por la tarde"}})
    assert r.status_code == 400 and r.json()["detail"] == "invalid_mission_launch_at"
    assert not panel.cfg.get("mission_launch_at")
    assert panel.post("/api/admin/save-config", json={"config": {"mission_launch_at": "2026-12-01T09:00"}}).status_code == 200
    assert panel.post("/api/admin/save-config", json={"config": {"mission_launch_at": ""}}).status_code == 200


def test_el_token_de_mapbox_del_entorno_no_se_escribe_en_config(panel, monkeypatch):
    monkeypatch.setenv("MAPBOX_TOKEN", "pk.token-del-entorno")
    panel.cfg["mapbox_token"] = "pk.token-del-entorno"  # lo que copia load_config del entorno
    assert panel.post("/api/admin/save-config", json={"config": {"site_name": "X"}}).status_code == 200
    assert "mapbox_token" not in panel.cfg


def test_el_idioma_de_la_mision_se_guarda_y_no_hay_ingles(panel):
    assert panel.post("/api/admin/save-config", json={"config": {"ui_lang": "gl"}}).status_code == 200
    assert panel.cfg["ui_lang"] == "gl"
    assert panel.post("/api/admin/save-config", json={"config": {"ui_lang": "en"}}).status_code == 200
    assert panel.cfg["ui_lang"] == "es"


def test_cambiar_el_zoom_no_cambia_la_huella_de_la_mision():
    a = main.mission_revision({"map_center": [40.0, -3.0], "map_zoom": 13})
    b = main.mission_revision({"map_center": [40.0, -3.0], "map_zoom": 19})
    assert a == b
    assert a != main.mission_revision({"map_center": [41.0, -3.0], "map_zoom": 13})


def test_el_panel_no_manda_los_campos_sin_efecto_ni_los_ensena():
    app = _sin_comentarios(FRONT / "admin" / "AdminApp.tsx")
    cuerpo = app.split("function buildMissionConfigPayload")[1].split("function ")[0]
    for campo in ("mapbox_token:", "mapbox_style:", "prologue_image_url:", "payload.map_zoom"):
        assert campo not in cuerpo, campo
    panel_tsx = _sin_comentarios(FRONT / "admin" / "components" / "SettingsPanel.tsx")
    for campo in ("mapbox_token", "mapbox_style", "prologue_image_url", "map_zoom"):
        assert f"'{campo}'" not in panel_tsx, campo


def test_el_resumen_del_panel_dice_lo_que_decide_el_servidor(panel, monkeypatch):
    monkeypatch.setattr(main, "CLAVE_TEMPORAL", "clave-del-entorno")
    monkeypatch.setenv("SAGA_CADUCAR_RASTROS", "1")
    r = panel.post("/api/admin/react-overview", json={})
    assert r.status_code == 200, r.text
    cfg = r.json()["config"]
    assert cfg["mission_pass_from_env"] is True and cfg["position_expiry_active"] is True and cfg["ui_lang"] in ("es", "gl")


# --- lógica del cliente en Node ----------------------------------------------------------------------------------


@pytest.fixture(scope="module")
def js():
    node = shutil.which("node")
    if not node or not (RAIZ / "frontend" / "node_modules" / "typescript").exists():
        pytest.skip("sin Node o sin dependencias del frontend")
    p = subprocess.run(
        [node, str(RAIZ / "tests" / "js" / "ajustes_14_11.cjs")], capture_output=True, text=True, encoding="utf-8", timeout=180
    )
    assert p.returncode == 0, p.stderr[-2000:]
    return json.loads(p.stdout)


def test_un_campo_numerico_vacio_o_con_letras_no_vale_0(js):
    vacio, blanco, letras, cero, decimal, grande, negativo = js["numero"]
    assert vacio is None and blanco is None and letras is None
    assert cero == 0 and decimal == 8 and grande == 365 and negativo == 0


def test_el_panel_valida_los_dias_de_las_fotos_antes_de_guardar():
    app = _sin_comentarios(FRONT / "admin" / "AdminApp.tsx")
    assert "pon un número de días entre 0 y 365" in app
    assert "NO se borran nunca" in app and "window.confirm" in app
    for fichero in ("admin/components/AdminGameEditor.tsx", "admin/components/vestuario/DesbloqueablesPanel.tsx"):
        assert "CampoNumero" in _sin_comentarios(FRONT / fichero), fichero


def test_la_bateria_baja_de_ayer_no_cuenta(js):
    a = js["ahorro"]
    assert a["sinMarca"] is False and a["deAyer"] is False  # antes: con '1' guardado, true toda la sesión
    assert a["reciente"] is True and a["manualSi"] is True and a["manualNoGanaALaBateria"] is False


def test_los_textos_por_defecto_del_cliente_son_los_del_json(js):
    assert js["defectos"] == TEXTOS_POR_DEFECTO


# --- el jugador: ahorro, store, login, botón principal, Herramientas -----------------------------------------------


def test_el_boton_de_ahorro_no_miente_y_no_ofrece_auto_en_iphone():
    h = _sin_comentarios(FRONT / "player" / "components" / "PlayerHud.tsx")
    assert "setAhorroNoSeGuarda(true)" in h
    assert "const hayBateria" in h and "hayBateria ? ['', '1', '0'] : ['0', '1']" in h
    assert "guardado === '1' || guardado === '0' ? guardado : ''" in h
    assert "hasta que cierres y abras la app" in h and "ata que peches e abras a app" in h


def test_lo_guardado_del_store_es_de_un_jugador():
    s = _sin_comentarios(FRONT / "player" / "store" / "usePlayerStore.ts")
    assert "usuario: usuarioDeLaUrl()" in s and "merge:" in s and "g.usuario !== yo" in s
    assert "recordarJugador" not in s  # leer la URL no debe recordar a nadie


def test_el_login_descarta_un_idioma_que_ya_no_existe():
    f = _sin_comentarios(FRONT / "login" / "LoginApp.tsx")
    assert "isLocale(stored)" in f and "removeItem('saga_locale')" in f


def test_el_boton_principal_se_vuelve_a_pintar_al_cambiar_de_idioma():
    h = _sin_comentarios(FRONT / "player" / "components" / "PlayerHud.tsx")
    assert "<span key={locale} style={primaryTitulo}>" in h


def test_herramientas_usa_colores_del_tema_y_botones_de_44():
    h = _sin_comentarios(FRONT / "player" / "components" / "PlayerHud.tsx")
    assert h.count("minHeight: 44") >= 3  # Cambiar de jugador, Español/Galego, Avanzado
    m = _sin_comentarios(FRONT / "player" / "components" / "MissionPackPanel.tsx")
    assert "rgba(226, 238, 255" not in m and "rgba(226, 238, 255" not in h
    assert "var(--s-acento-texto" in h and "var(--s-acento-texto" in m


def test_los_avisos_del_panel():
    p = _sin_comentarios(FRONT / "admin" / "components" / "SettingsPanel.tsx")
    assert p.count("Se aplica al recargar la app") >= 2
    assert "SAGA_CLAVE_TEMPORAL" in p and "Se activa en el servidor, no desde este panel" in p
    assert "Idioma de la misión" in p and "Galego" in p and "English" not in p
