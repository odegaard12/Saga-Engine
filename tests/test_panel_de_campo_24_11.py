# -*- coding: utf-8 -*-
"""24/11/2026: el panel de campo (dirección B elegida por el organizador) para el día de partida.

- Al entrar se ve el panel de campo: mapa con los jugadores (iniciales y estado), tres cifras que filtran, la hoja con
  quien necesita atención y su ficha en esa misma hoja; «Avisos» con tarjetas Alta/Media/Nota; «Más» con interruptores.
  El editor de siempre sigue a un toque desde «Más» y vuelve al de campo desde su menú.
- «Revisado» y «Penalizar» desde un aviso: el servidor guarda la marca (idempotente) y deja de contarla.
- Sigue el tema de la misión: sólo tokens, sin colores a mano, sin emojis en la navegación, sin cristal ni degradados.
Comportamiento de lib/campo.ts en tests/js/panel_de_campo_24_11.cjs.
"""
import json
import os
import re
import shutil
import subprocess
import tempfile
from pathlib import Path

os.environ.setdefault("ADMIN_PASS", "pytest_admin_password")
os.environ.setdefault("SAGA_DATA_DIR", tempfile.mkdtemp(prefix="saga-test-panel-campo-"))

import pytest  # noqa: E402
from fastapi.testclient import TestClient  # noqa: E402

import main  # noqa: E402

RAIZ = Path(__file__).resolve().parent.parent
ADMIN = RAIZ / "frontend" / "src" / "admin"


def leer(*partes: str) -> str:
    return ADMIN.joinpath(*partes).read_text(encoding="utf-8-sig")


# --- servidor: «Revisado» y «Penalizar» ------------------------------------------------------------------------------------

@pytest.fixture
def panel(monkeypatch, tmp_path):
    main.clear_admin_sessions()
    main.ADMIN_LOGIN_ATTEMPTS.clear()
    monkeypatch.setattr(main, "admin_password_change_required", lambda: False)
    monkeypatch.setattr(main, "ANTI_CHEAT_DB", str(tmp_path / "anti_cheat.json"))
    ac = main._anti_cheat
    rapida = ac.record_suspicion(main.ANTI_CHEAT_DB, "PC_A", "impossible_travel_speed", {"speed_kmh": 61})
    nota = ac.record_suspicion(main.ANTI_CHEAT_DB, "PC_A", "proximity_no_gps", {}, severity="info")
    token = main.create_admin_session()
    c = TestClient(main.app)
    c.cookies.set(main.ADMIN_SESSION_COOKIE, token)
    c.rapida, c.nota = rapida, nota
    return c


def revisar(c, entrada, **extra):
    return c.post("/api/admin/anti-cheat-flags/revisar", json={"profile_id": "PC_A", "at": entrada["at"], "reason": entrada["reason"], **extra})


def test_sin_sesion_no_se_marca_nada(panel):
    r = TestClient(main.app).post("/api/admin/anti-cheat-flags/revisar", json={"profile_id": "PC_A", "at": panel.rapida["at"], "reason": "impossible_travel_speed"})
    assert r.status_code == 403
    assert not any(e.get("revisada_en") for e in main._anti_cheat.list_suspicions(main.ANTI_CHEAT_DB)["PC_A"])


def test_revisado_se_guarda_y_deja_de_contar(panel):
    antes = panel.post("/api/admin/mission-status", json={"v": 2}).json()["a"]
    r = revisar(panel, panel.rapida, op_id="op-1")
    j = r.json()
    assert r.status_code == 200 and j["status"] == "ok" and j["revisada_como"] == "revisado" and j["revisada_en"] > 0
    assert j["sin_revisar"] == antes - 1
    assert panel.post("/api/admin/mission-status", json={"v": 2}).json()["a"] == antes - 1
    # La anotación y su prueba se conservan; sólo lleva la marca.
    guardada = main._anti_cheat.list_suspicions(main.ANTI_CHEAT_DB)["PC_A"][0]
    assert guardada["evidence"] == {"speed_kmh": 61} and guardada["revisada_como"] == "revisado"
    # El panel la ve marcada en la lista de siempre.
    lista = panel.post("/api/admin/anti-cheat-flags", json={}).json()["players"][0]["suspicions"]
    assert any(s.get("revisada_en") for s in lista)


def test_es_idempotente_la_primera_marca_manda(panel):
    a = revisar(panel, panel.rapida, como="penalizado").json()
    b = revisar(panel, panel.rapida, como="revisado").json()  # un reintento de la cola, o un segundo móvil
    assert a["revisada_como"] == b["revisada_como"] == "penalizado" and a["revisada_en"] == b["revisada_en"]


def test_un_como_raro_se_queda_en_revisado(panel):
    assert revisar(panel, panel.nota, como="borrar").json()["revisada_como"] == "revisado"


def test_datos_que_faltan_o_aviso_que_no_existe(panel):
    assert panel.post("/api/admin/anti-cheat-flags/revisar", json={"profile_id": "PC_A"}).status_code == 400
    assert panel.post("/api/admin/anti-cheat-flags/revisar", json={"profile_id": "PC_A", "at": "x", "reason": "y"}).status_code == 400
    r = panel.post("/api/admin/anti-cheat-flags/revisar", json={"profile_id": "PC_A", "at": 123, "reason": "impossible_travel_speed"})
    assert r.status_code == 404
    r = panel.post("/api/admin/anti-cheat-flags/revisar", json={"profile_id": "OTRO", "at": panel.rapida["at"], "reason": "impossible_travel_speed"})
    assert r.status_code == 404


def test_la_entrada_trae_ya_la_cifra_de_avisos(panel):
    j = panel.post("/api/admin/arranque", json={}).json()
    assert j["live"]["a"] == 1


# --- lib/campo.ts ---------------------------------------------------------------------------------------------------------

@pytest.fixture(scope="module")
def datos():
    node = shutil.which("node")
    if not node:
        pytest.skip("sin node")
    p = subprocess.run([node, str(RAIZ / "tests" / "js" / "panel_de_campo_24_11.cjs")], capture_output=True, text=True,
                       encoding="utf-8", timeout=180, cwd=str(RAIZ))
    assert p.returncode == 0, p.stderr[-2000:]
    return json.loads(p.stdout.strip().splitlines()[-1])


def test_grupos_de_arriba(datos):
    assert datos["grupos"] == ["atencion", "atencion", "atencion", "ruta", "fin"]
    assert datos["cuenta"] == {"ruta": 2, "atencion": 1, "fin": 1}


def test_alejado_se_agrupa_por_nodo_y_el_peor_estado_no_se_esconde(datos):
    r = datos["racimos"]
    assert r["lejosSueltos"] == ["C"]
    assert ["n3", ["A", "B"], "sin_conexion"] in r["lejosRacimos"] and any(x[0] == "fin" for x in r["lejosRacimos"])
    assert r["cercaSueltos"] == 5 and r["cercaRacimos"] == 0


def test_cada_aviso_dice_su_gravedad_y_una_frase_con_numeros(datos):
    f = datos["frases"]
    assert f["velocidad"] == {"titulo": "Demasiado rápido", "frase": "840 m en 49 s (61 km/h)."}
    assert f["rapido"]["frase"] == "Lo superó en 2.1 s en el nodo 3 (mínimo creíble 6 s)."
    assert f["lejos"]["frase"] == "Superó el nodo 4 a 410 m (margen 75 m, GPS ±12 m)."
    assert f["futuro"]["frase"] == "Un evento sin red llegó con la hora 6 min adelantada en el nodo 1."
    assert f["respuesta"]["titulo"] != f["respuesta"]["frase"].rstrip(".")  # la frase explica, no repite el título
    assert f["desconocido"] == {"titulo": "Aviso del servidor", "frase": "Anotado por el servidor."}
    assert f["sinNodo"]["frase"] == "Cambió de aplicación con un juego abierto."
    assert datos["gravedad"] == ["alta", "media", "nota", "alta"]


def test_la_lista_de_avisos_ordena_y_separa_lo_revisado(datos):
    a = datos["avisos"]
    assert a["orden"][0] == "A|300|salio_app"
    assert a["revisar"] == ["A|100|impossible_travel_speed"]  # lo marcado aquí ya no está para revisar
    assert a["notas"] == ["A|50|proximity_no_gps"]
    assert set(a["revisados"]) == {"A|300|salio_app", "B|200|completion_faster_than_possible"}
    assert a["cuenta"] == {"revisar": 1, "notas": 1, "revisados": 2}


def test_dos_letras_tinta_y_hace_cuanto(datos):
    assert datos["letras"] == ["FA", "MR", "LO", "ZQ", "?"]
    assert datos["tinta"] == [True, False, True]
    assert datos["hace"] == ["hace 6 s", "hace 3 min", "hace 2 h"]


# --- sobre el código ------------------------------------------------------------------------------------------------------

def test_al_entrar_se_ve_el_panel_de_campo_y_el_editor_sigue_a_un_toque():
    app = leer("AdminApp.tsx")
    assert "const importarCampo = () => import('./components/campo/PanelDeCampo')" in app
    # 25/11: por defecto, el editor completo en PC y el de campo en el móvil; la elección se recuerda en el dispositivo.
    assert "'(min-width: 1024px) and (pointer: fine)').matches ? 'editor' : 'campo'" in app
    assert "window.localStorage.setItem(CLAVE_MODO, nuevo)" in app
    assert "{modo === 'campo' ? (" in app and "cambiarModo('editor')" in app and "cambiarModo('campo')" in app
    # Lo que se baja mientras se teclea la clave es lo que se va a ver (el de campo, no el editor entero).
    assert "(leerModo() === 'editor' ? importarShell() : importarCampo())" in app
    shell = leer("components", "AdminMissionControlShell.tsx")
    assert "onAbrirCampo" in shell and "'Panel de campo (directo)'" in shell
    mas = leer("components", "campo", "MasDeCampo.tsx")
    for panel in ("'players'", "'match-log'", "'tiempos'", "'avisos'", "'exportar'", "'mission'", "'none'"):
        assert f"p.onAbrirEditor({panel})" in mas


def test_revisado_y_penalizar_van_por_la_cola_con_op_id():
    acciones = leer("lib", "accionesDeJugador.ts")
    assert "revision: '/api/admin/anti-cheat-flags/revisar'" in acciones
    app = leer("AdminApp.tsx")
    bloque = app[app.index("async function revisarAviso"):app.index("async function runAjusteDeTiempo")]
    assert "lanzarOperacion(" in bloque and "nuevoOpId()" in bloque and "tipo: 'revision'" in bloque
    campo = leer("components", "campo", "PanelDeCampo.tsx")
    # Penalizar = el «sumar tiempo» de siempre (cola, op_id) + la marca de penalizado.
    # 24/11 (panel 2): por tarjeta (jugador y motivo): se penaliza una vez y se marcan todos sus avisos.
    assert "props.onAjustarTiempo(g.profileId, segundos" in campo and "revisar(g, 'penalizado')" in campo


def test_la_ficha_de_campo_reutiliza_la_de_siempre_con_botones_grandes():
    ficha = leer("components", "FichaDeCampo.tsx")
    assert "variante === 'campo'" in ficha and 'className="campo-cuatro"' in ficha
    campo = leer("components", "campo", "PanelDeCampo.tsx")
    assert 'variante="campo"' in campo and "<Deshacer" in campo
    css = leer("styles", "admin-campo.css")
    assert "min-height: 68px" in css and "min-height: 52px" in css  # para el pulgar


def test_el_mapa_de_campo_no_pide_nada_fuera_y_agrupa_alejado():
    mapa = leer("components", "campo", "MapaDeCampo.tsx")
    assert mapa.count("L.tileLayer(") == 1 and "/map-tiles/{z}/{x}/{y}.png" in mapa and "if (pocos) return" in mapa
    for fuera in ("overpass", "routing.openstreetmap", "open-meteo", "arcgisonline", "fetch("):
        assert fuera not in mapa.lower()
    assert "agruparPorNodo(pines" in mapa and "escapeHtml(p.iniciales)" in mapa


def test_sigue_el_tema_con_tokens_y_sin_adornos():
    css = leer("styles", "admin-campo.css")
    sin_comentarios = re.sub(r"/\*.*?\*/", "", css, flags=re.DOTALL)
    for linea in sin_comentarios.splitlines():
        if re.match(r"^\s*--[\w-]+\s*:", linea):
            continue
        assert not re.search(r"#[0-9a-fA-F]{3,8}\b|rgba?\(\s*\d", linea), linea
    assert "gradient" not in sin_comentarios and "backdrop-filter" not in sin_comentarios and "blur(" not in sin_comentarios
    assert "body[data-tema-admin='dia'] .campo" in css  # Día: papel y tinta, bordes gruesos


def test_sin_emojis_en_la_navegacion_del_panel_de_campo():
    emoji = re.compile("[\U0001F300-\U0001FAFF☀-➿]")
    for f in ("PanelDeCampo.tsx", "AvisosDeCampo.tsx", "MasDeCampo.tsx", "MapaDeCampo.tsx"):
        assert not emoji.search(leer("components", "campo", f)), f
    assert "<svg viewBox=\"0 0 24 24\"" in leer("components", "campo", "PanelDeCampo.tsx")


def test_no_se_recoge_la_bateria():
    for f in ("PanelDeCampo.tsx", "MapaDeCampo.tsx"):
        assert "bater" not in leer("components", "campo", f).lower()
    assert "getBattery" not in (RAIZ / "frontend" / "src" / "player" / "PlayerApp.tsx").read_text(encoding="utf-8")
