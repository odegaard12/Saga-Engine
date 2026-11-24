# -*- coding: utf-8 -*-
"""23/11/2026 (tarde): lo que quedó «para decidir» del repaso del panel. Un test por punto.

1. La vista previa del laberinto es el laberinto que se juega (tamaño real, a oscuras con «Ver como el jugador»).
2. Ajustes: el menú trae todas las secciones, en orden (misión, mapa, acceso, fotos), y los títulos sin color propio.
3. Nada de «Mission Control» fijo; un valor de serie viejo en inglés no llega al panel.
4. Objetos y recetas con la piel de los demás paneles.
5. Cerrar sesión pregunta, y en el móvil va aparte.
6. «La organización reinició tu partida» en el servidor y en el móvil.
7. Los editores de juego y «Ver más» usan los colores y botones del panel.
Más: CSS muerto fuera, y la CSP deja pasar el script en línea de index.html (por su huella).
Comportamiento del laberinto en tests/js/admin_ajustes_23_11.cjs.
"""
import base64
import hashlib
import json
import os
import re
import shutil
import subprocess
import tempfile
from pathlib import Path

import pytest

os.environ.setdefault("ADMIN_PASS", "test-admin-pass")
os.environ.setdefault("SAGA_DATA_DIR", tempfile.mkdtemp(prefix="saga-test-ajustes-"))

RAIZ = Path(__file__).resolve().parent.parent
FRONT = RAIZ / "frontend" / "src"
ADMIN = FRONT / "admin"
COLOR = re.compile(r"#[0-9a-fA-F]{3,8}\b|rgba?\(\s*\d[^)]*\)")


def leer(rel: str, base: Path = ADMIN) -> str:
    return (base / rel).read_text(encoding="utf-8-sig").replace("\r\n", "\n")


@pytest.fixture(scope="module")
def lab():
    node = shutil.which("node")
    if not node:
        pytest.skip("sin node")
    p = subprocess.run([node, str(RAIZ / "tests" / "js" / "admin_ajustes_23_11.cjs")], capture_output=True, text=True,
                       encoding="utf-8", timeout=180, cwd=str(RAIZ))
    assert p.returncode == 0, p.stderr[-2000:]
    return json.loads(p.stdout.strip().splitlines()[-1])


# --- 1 · Laberinto -------------------------------------------------------------------------------------------------


def test_la_vista_previa_es_el_laberinto_que_se_juega(lab):
    assert [n["filas"] for n in lab["niveles"]] == [21, 21, 23, 25, 25]
    for n in lab["niveles"]:
        p = n["params"]
        assert n["mismoLaberinto"], n["n"]  # mismo generador, mismas casillas, meta, agujeros y llaves que el móvil
        assert n["casillas"] == p["grid_rows"] * p["grid_cols"]
        assert (n["llaves"], n["vidas"], n["agujeros"], n["luz"]) == (p["collectible_count"], p["lives"], p["hole_count"], p["fog_radius"])
        assert n["tiempoS"] == n["tiempoEsperado"] and n["pasos"] <= n["tope"]
        assert n["radioLuz"] == pytest.approx(0.85 * (p["fog_radius"] + 1))


def test_sin_nada_escrito_valen_los_valores_del_servidor(lab):
    from backend.app.runtime.minigames import normalize_minigame_config

    servidor = normalize_minigame_config("circuit_matrix", {"game_id": "tilt_maze"})
    v = lab["vacio"]
    assert (v["filas"], v["columnas"], v["llaves"], v["vidas"], v["agujeros"], v["luz"], v["tiempoS"]) == (
        servidor["grid_rows"], servidor["grid_cols"], servidor["collectible_count"], servidor["lives"],
        servidor["hole_count"], servidor["fog_radius"], servidor["time_limit_s"])
    dificil = normalize_minigame_config("circuit_matrix", {"game_id": "tilt_maze", "difficulty": "hard"})
    assert lab["dificil"] == dificil["grid_rows"] == 25 and lab["nulos"] == 21


def test_dice_si_el_laberinto_es_el_de_todos_o_un_ejemplo(lab):
    assert lab["quien"] == {"semillaPropia": "todos", "deSerie": "cada-jugador", "nivel2": "todos-otro",
                            "nivel2AMano": "cada-jugador", "nivel4": "cada-jugador", "cadaIntento": "cada-intento"}
    assert lab["textos"] == ["3 min", "2 min 30 s", "45 s", "luz grande", "luz media", "luz pequeña"]


def test_las_cuentas_del_panel_son_las_del_movil(lab):
    movil = leer("player/minigames/families/tiltMaze/RuntimeScreen.tsx", FRONT)
    panel = leer("lib/laberintoDelJugador.ts")
    assert "const VISTA = 9" in movil and lab["vista"] == 9
    assert "const radioLuz = 0.85 * (luz + 1)" in movil and "radioLuz: 0.85 * (luz + 1)" in panel
    assert "- 20) / 1.3))" in movil and "Math.floor((reloj - 20) / 1.3)" in panel
    assert "Math.ceil(20 + 1.3 * pasosHastaLaMeta(maze))), 75, 20, 300)" in movil
    assert "Math.ceil(20 + 1.3 * pasos)), 75, 20, 300)" in panel
    # Los colores del tablero, los del juego (tema Pizarra).
    ed = leer("components/tiltMaze/TiltMazeEditor.tsx")
    for var in ("--tilt-oscuro: 3, 6, 13;", "--tilt-suelo: #1c2533;", "--tilt-pared: #e6ebf3;", "--tilt-llave: #fbbf24;"):
        assert var in movil and var in ed, var


def test_el_editor_del_laberinto_tiene_vista_del_jugador_y_tamanos_de_los_niveles():
    ed = leer("components/tiltMaze/TiltMazeEditor.tsx")
    assert "Ver como el jugador" in ed and "aria-pressed={comoJugador}" in ed
    assert "laberintoDelJugador(config)" in ed and "<canvas" in ed
    assert "{ etiqueta: 'Corto', lado: 21 }" in ed and "{ etiqueta: 'Largo', lado: 25 }" in ed
    assert "7×7" not in ed and "rows: 13" not in ed and "Listo para guardar" not in ed
    assert "fog_radius: opcion.valor" in ed  # la luz se puede elegir, como el tamaño


# --- 2 · Ajustes ---------------------------------------------------------------------------------------------------


def test_el_menu_de_ajustes_trae_todas_las_secciones_y_en_orden():
    s = leer("components/SettingsPanel.tsx")
    lista = re.findall(r"\['([a-z0-9]+)', '[^']+'\],", s.split("export const SECCIONES", 1)[1].split("]\n\n", 1)[0])
    assert lista == ["identidad", "prologo", "inicio", "proximidad", "mapa", "mapa3d", "red", "precalentar", "clave",
                     "acceso", "fotos"]
    cuerpo = s.split("export default function SettingsPanel", 1)[1].split("\ntype EstadoRed", 1)[0]
    # Los tres componentes aparte llevan su `data-seccion` dentro; se ponen en su sitio en el orden de la página.
    propios = {"<MapaTresDeLaZona />": "mapa3d", "<RedDeCaminos />": "red", "<PrecalentarMapa />": "precalentar"}
    orden = [m.group(1) or propios[m.group(2)] for m in
             re.finditer(r'data-seccion="([a-z0-9]+)"|(<MapaTresDeLaZona />|<RedDeCaminos />|<PrecalentarMapa />)', cuerpo)]
    assert orden == lista
    todo = s + leer("components/PrecalentarMapa.tsx")
    assert sorted(re.findall(r'data-seccion="([a-z0-9]+)"', todo)) == sorted(lista)
    assert todo.count('className="admin-settings-section-modern">') == 0, "una sección sin `data-seccion` no sale en el menú"
    assert "irASeccion(0)" not in s and "SECCIONES.map(([id, etiqueta])" in s
    assert [g for g in re.findall(r'className="admin-settings-grupo">([^<]+)<', s)] == ["Misión", "Mapa", "Acceso", "Fotos y datos"]


def test_los_titulos_de_ajustes_no_llevan_color_propio():
    for rel in ("components/SettingsPanel.tsx", "components/PrecalentarMapa.tsx"):
        assert "<strong style={{ color:" not in leer(rel), rel
    s = leer("components/SettingsPanel.tsx")
    assert "Login de Jugador" not in s and "<strong>Pantalla de acceso del jugador</strong>" in s
    assert ".saga-floating-body .admin-settings-grupo {" in leer("styles/admin-r7-paneles.css")


# --- 3 · Marca en castellano ---------------------------------------------------------------------------------------


def test_el_panel_no_lleva_mission_control_fijo():
    sh = leer("components/AdminMissionControlShell.tsx")
    assert "Mission Control" not in sh and "<small>{t('admin.missionPanel')}</small>" in sh
    assert "Map workspace" not in sh and "Family counts" not in sh and "admin mission control" not in sh
    i18n = leer("i18n/index.ts", FRONT)
    assert "missionPanel: 'Panel de la misión'" in i18n and "missionPanel: 'Panel da misión'" in i18n


def test_un_valor_de_serie_viejo_en_ingles_no_llega_al_panel():
    from backend.app.runtime.textos_por_defecto import TEXTOS_POR_DEFECTO, texto_o_defecto

    assert texto_o_defecto({"admin_title": "Mission editor"}, "admin_title") == TEXTOS_POR_DEFECTO["admin_title"]
    assert texto_o_defecto({"admin_subtitle": "Map-first control panel"}, "admin_subtitle") == TEXTOS_POR_DEFECTO["admin_subtitle"]
    assert texto_o_defecto({"admin_title": "  "}, "admin_title") == TEXTOS_POR_DEFECTO["admin_title"]
    # Lo que el organizador escribió no se toca, aunque esté en inglés.
    assert texto_o_defecto({"admin_title": "Mission Catoira 2027"}, "admin_title") == "Mission Catoira 2027"
    admin = (RAIZ / "backend" / "app" / "routers" / "admin.py").read_text(encoding="utf-8")
    assert '"admin_title": texto_o_defecto(cfg, "admin_title"),' in admin
    assert '"admin_subtitle": texto_o_defecto(cfg, "admin_subtitle"),' in admin


# --- 4 · Objetos y recetas -----------------------------------------------------------------------------------------


def test_objetos_y_recetas_usa_la_piel_del_panel():
    o = leer("components/ObjectsPanel.tsx")
    assert "CSSProperties" not in o and "style={" not in o and not COLOR.search(o)
    assert o.count('className="admin-settings-section-modern"') == 2 and o.count('className="r7-btn"') == 2
    assert o.count("<ItemIconSvg") == 3  # ingredientes, resultado y la lista de objetos
    assert "onCreateNodesWithItems(missingInputs.map((inp) => ({ id: inp.id, label: inp.label })))" in o
    assert "onClick={() => onSelectStage?.(providerNode)}" in o
    css = leer("styles/admin-r7-paneles.css").split("/* Objetos y recetas (23/11)", 1)[1]
    assert ".r7-objeto {" in css and ".r7-receta {" in css and not COLOR.search(css)


# --- 5 · Cerrar sesión ---------------------------------------------------------------------------------------------


def test_cerrar_sesion_pregunta_y_en_el_movil_va_aparte():
    sh = leer("components/AdminMissionControlShell.tsx")
    assert "function handleLogoutClick() {\n    setConfirmarSalida(true)\n  }" in sh
    assert 'titulo="¿Cerrar la sesión?"' in sh and "<HojaDeConfirmacion" in sh
    confirmar = sh.split('titulo="¿Cerrar la sesión?"', 1)[1].split("/>", 1)[0]
    assert "onLogout()" in confirmar and "onCancelar={() => setConfirmarSalida(false)}" in confirmar
    assert sh.count("onLogout()") == 1, "sólo se cierra desde la confirmación"
    assert "aparte: true," in sh and 'className="saga-hoja-grupo-aparte"' in sh
    assert ".filter((entrada) => !entrada.aparte)" in sh
    css = leer("styles/admin-r5.css")
    assert ".saga-hoja-grupo-aparte {" in css and "border-top: 1px solid var(--r5-borde);" in css


# --- 6 · Texto del jugador -----------------------------------------------------------------------------------------


def test_la_organizacion_reinicio_tu_partida_en_servidor_y_movil():
    from backend.app.runtime.motivos_de_rechazo import MOTIVOS

    frase = "La organización reinició tu partida: este avance era anterior al reinicio."
    assert MOTIVOS["stale_before_reset"] == frase
    t = leer("player/components/textosDePantallas.ts", FRONT)
    gl = "'A organización reiniciou a túa partida: este avance era anterior ao reinicio.'"
    assert f"'{frase}':\n    {gl}," in t
    # La frase de antes sigue traducida: puede estar guardada en la cola de un móvil.
    assert f"'El organizador reinició tu partida: este avance era anterior al reinicio.':\n    {gl}," in t
    # Todas las frases del servidor tienen su traducción.
    for texto in MOTIVOS.values():
        assert f"'{texto}'" in t, texto


# --- 7 · Estilos sueltos -------------------------------------------------------------------------------------------

EDITORES = ["circuitPattern/CircuitPatternEditor.tsx", "cuentaSenales/CuentaSenalesEditor.tsx",
            "interrogatorio/InterrogatorioEditor.tsx", "rumboDoble/RumboDobleEditor.tsx", "sparkRadar/SparkRadarEditor.tsx",
            "trampaPalabras/TrampaPalabrasEditor.tsx", "tiltMaze/TiltMazeEditor.tsx", "sequenceCode/EcoRitmicoEditor.tsx",
            "placeMosaic/PlaceMosaicEditor.tsx"]
#: Colores que se quedan a propósito: la tinta sobre las teclas de color del Eco y el tablero de la foto del Mosaico.
PROPIOS = {"sequenceCode/EcoRitmicoEditor.tsx": {"#0b1424"},
           "placeMosaic/PlaceMosaicEditor.tsx": {"#111315", "rgba(244,244,245,.58)", "rgba(255,255,255,.24)"}}


def test_los_editores_de_juego_usan_los_colores_del_panel():
    for rel in EDITORES:
        t = leer("components/" + rel)
        css = t.split("const CSS = `", 1)[1].split("\n`\n", 1)[0]
        css = "\n".join(linea for linea in css.splitlines() if not re.match(r"\s*--[\w-]+\s*:", linea))
        assert set(COLOR.findall(css)) <= PROPIOS.get(rel, set()), (rel, sorted(set(COLOR.findall(css))))
        assert "#f8fafc" not in css and "var(--r7-" in css, rel  # ni rastro de la tarjeta clara
    hoja = leer("styles/admin-r7-editor.css")
    for var in ("--je-tarjeta:", "--je-sobre-acento:", "--je-acento-suave:", "--je-aviso-suave:", "--je-error-suave:"):
        assert var in hoja.split(".saga-guided-v4-custom-editor {", 1)[1], var


def test_ver_mas_del_registro_es_un_boton_del_panel():
    m = leer("components/MatchLogPanel.tsx")
    assert '<button type="button" className="r7-btn" onClick={() => setMostrar((n) => n + FILAS_POR_PAGINA)}>' in m


# --- CSS muerto ----------------------------------------------------------------------------------------------------


def test_no_queda_css_de_clases_que_nadie_pone():
    muertas = ["admin-login-layout", "admin-console-layout", "admin-sidebar", "admin-node-card", "admin-player-card",
               "admin-family-card", "admin-edit-section", "saga-inspector", "saga-route-list", "saga-node-row",
               "saga-guided-v4-stepper", "r7-jugador-principal", "tme-board"]
    hojas = ["adminStylesParte1.ts", "adminStylesParte2.ts"] + ["styles/" + f.name for f in sorted((ADMIN / "styles").glob("*.css"))]
    fuente = "\n".join(f.read_text(encoding="utf-8") for f in FRONT.rglob("*.tsx"))
    for rel in hojas:
        css = re.sub(r"/\*.*?\*/", "", leer(rel), flags=re.DOTALL)
        for c in muertas:
            assert not re.search(r"\." + re.escape(c) + r"(?![\w-])", css), (rel, c)
    for c in muertas:
        assert not re.search(r"(?<![\w.-])" + re.escape(c) + r"(?![\w-])", fuente), c  # de verdad no las pone nadie
    assert len(leer("adminStylesParte1.ts")) + len(leer("adminStylesParte2.ts")) < 20_000  # eran 57 KB
    assert len(leer("styles/admin-modern-shell.css")) < 160_000
    # Lo que sí se usa sigue ahí.
    assert ".admin-root {" in leer("adminStylesParte1.ts") and ".saga-rail-brand {" in leer("styles/admin-modern-shell.css")


# --- CSP -----------------------------------------------------------------------------------------------------------


def test_la_csp_deja_pasar_el_script_en_linea_de_index_html(tmp_path, monkeypatch):
    from backend.app import build_frontend
    from backend.app.runtime import seguridad_jugador_glue as glue

    html = (RAIZ / "frontend" / "index.html").read_text(encoding="utf-8")
    scripts = [c for c in re.findall(r"<script(?![^>]*\ssrc=)[^>]*>(.*?)</script>", html, flags=re.DOTALL) if c.strip()]
    assert len(scripts) == 1 and "window.__sagaSesion=fetch('/api/jugador/sesion?user='" in scripts[0]
    indice = tmp_path / "index.html"
    indice.write_text(html, encoding="utf-8")
    monkeypatch.setattr(build_frontend, "REACT_INDEX_FILE", indice)
    huella = "'sha256-%s'" % base64.b64encode(hashlib.sha256(scripts[0].encode("utf-8")).digest()).decode()
    assert build_frontend.huellas_de_scripts_en_linea() == (huella,)

    from starlette.requests import Request
    from starlette.responses import Response

    r = glue.apply_security_headers(Response("x", media_type="text/html"), Request({"type": "http", "headers": [], "scheme": "http", "server": ("t", 80), "path": "/", "query_string": b"", "method": "GET"}))
    csp = r.headers["content-security-policy"]
    assert f"script-src 'self' 'wasm-unsafe-eval' blob: {huella};" in csp
    assert "'unsafe-inline'" not in csp.split("script-src", 1)[1].split(";", 1)[0]
    # Si el script cambia, cambia la huella (no se queda la vieja en memoria); sin frontend compilado, ninguna.
    indice.write_text(html.replace("saga_remembered_player", "otra_clave"), encoding="utf-8")
    assert build_frontend.huellas_de_scripts_en_linea() != (huella,)
    monkeypatch.setattr(build_frontend, "REACT_INDEX_FILE", tmp_path / "no-existe.html")
    assert build_frontend.huellas_de_scripts_en_linea() == ()
