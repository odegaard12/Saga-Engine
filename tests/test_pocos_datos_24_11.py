# -*- coding: utf-8 -*-
"""24/11/2026: el panel en «pocos datos» (entrar en la partida gastando lo mínimo).

- El sondeo `mission-status` compacto (`v: 2`): dos huellas (fichas y posiciones a ~10 m), sólo las fichas que cambian,
  posiciones como listas relativas, y cuántos avisos del antitrampa quedan sin revisar en el mismo sondeo.
- El ritmo se adapta (45 s quieto o con «Pocos datos», 10 s tras una acción) y lo viejo se dice («datos de hace 3 min»).
- El mapa con UNA capa (`/map-tiles`) y ninguna con «Pocos datos»; sin Overpass mirando la partida; lo que falla fuera no
  se repide a cada toque; los fallos de Overpass ya no acaban en `client-errors`.
- La pantalla de entrada no baja el panel entero antes de teclear; la ficha no repide `/api/config`.
Comportamiento del frontend en tests/js/pocos_datos_24_11.cjs.
"""
import json
import os
import shutil
import subprocess
import tempfile
from pathlib import Path

os.environ.setdefault("ADMIN_PASS", "pytest_admin_password")
os.environ.setdefault("SAGA_DATA_DIR", tempfile.mkdtemp(prefix="saga-test-pocos-datos-"))

import pytest  # noqa: E402
from fastapi.testclient import TestClient  # noqa: E402

import main  # noqa: E402

RAIZ = Path(__file__).resolve().parent.parent
FRONT = RAIZ / "frontend" / "src"


def leer(*partes: str) -> str:
    return FRONT.joinpath(*partes).read_text(encoding="utf-8-sig")


# --- servidor: el sondeo compacto ---------------------------------------------------------------------------------------

@pytest.fixture
def panel(monkeypatch, tmp_path):
    main.clear_admin_sessions()
    main.ADMIN_LOGIN_ATTEMPTS.clear()
    monkeypatch.setattr(main, "admin_password_change_required", lambda: False)
    perfiles = [
        {"id": "PD_A", "display_name": "Ana", "avatar_url": ""},
        {"id": "PD_B", "display_name": "Beto", "avatar_url": ""},
    ]
    monkeypatch.setattr(main, "get_player_profiles", lambda cfg=None: list(perfiles))
    monkeypatch.setattr(main, "get_runtime_stages", lambda: [{"id": f"n{i}", "presentation": {"title": f"Nodo {i}"}} for i in range(3)])
    niveles = {"PD_A": 1, "PD_B": 0}
    monkeypatch.setattr(main, "load_player_progress", lambda *a, **k: dict(niveles))
    ahora = int(main.time.time())
    posiciones = {
        "PD_A": {"last_seen": ahora, "lat": 42.12346, "lon": -8.65432, "gps_status": "ok", "pos_at": ahora},
        "PD_B": {"last_seen": ahora, "lat": 42.124, "lon": -8.655, "gps_status": "ok", "pos_at": ahora},
    }
    monkeypatch.setattr(main, "load_live_positions", lambda *a, **k: {k2: dict(v) for k2, v in posiciones.items()})
    sospechas = {"PD_A": [{"reason": "x", "severity": "suspicion", "at": 1}, {"reason": "y", "severity": "info", "at": 2}]}
    monkeypatch.setattr(main._anti_cheat, "list_suspicions", lambda *a, **k: sospechas)
    token = main.create_admin_session()
    c = TestClient(main.app)
    c.cookies.set(main.ADMIN_SESSION_COOKIE, token)
    c.niveles, c.posiciones, c.perfiles, c.sospechas = niveles, posiciones, perfiles, sospechas
    return c


def test_sin_sesion_el_sondeo_compacto_da_403():
    r = TestClient(main.app).post("/api/admin/mission-status", json={"v": 2})
    assert r.status_code == 403 and "PD_A" not in r.text


def test_la_primera_vez_trae_las_fichas_y_las_posiciones_relativas(panel):
    j = panel.post("/api/admin/mission-status", json={"v": 2}).json()
    assert j["v"] == 2 and j["e"] and j["q"] and j["a"] == 1  # 1 sospecha sin revisar (la nota no cuenta)
    assert [f["user"] for f in j["f"]] == ["PD_A", "PD_B"] and j["f"][0]["level"] == 1
    # Ni coordenadas ni la hora del latido en la ficha: eso va en `p`.
    assert all("lat" not in f and "last_seen" not in f for f in j["f"])
    base_lat, base_lon = j["o"]
    assert (base_lat, base_lon) == (4212346, -865432)
    assert j["p"][0] == [0, 0, 0, 0] and j["p"][1][:3] == [1, 4212400 - base_lat, -865500 - base_lon]


def test_sin_cambios_solo_viaja_la_hora_y_andando_solo_las_posiciones(panel):
    a = panel.post("/api/admin/mission-status", json={"v": 2}).json()
    b = panel.post("/api/admin/mission-status", json={"v": 2, "e": a["e"], "q": a["q"]}).json()
    assert set(b) == {"status", "v", "server_ts", "e", "q", "a"} and b["e"] == a["e"]
    # Un latido nuevo sin moverse 10 m no cambia nada.
    panel.posiciones["PD_A"]["last_seen"] += 5
    panel.posiciones["PD_A"]["lat"] += 0.00003
    c = panel.post("/api/admin/mission-status", json={"v": 2, "e": a["e"], "q": a["q"]}).json()
    assert "p" not in c and "f" not in c and "fd" not in c
    # Andando 50 m: sólo posiciones.
    panel.posiciones["PD_A"]["lat"] += 0.0005
    d = panel.post("/api/admin/mission-status", json={"v": 2, "e": a["e"], "q": a["q"]}).json()
    assert "p" in d and d["q"] != a["q"] and "f" not in d and "fd" not in d and d["e"] == a["e"]


def test_al_pasar_de_nodo_solo_viaja_esa_ficha(panel):
    a = panel.post("/api/admin/mission-status", json={"v": 2}).json()
    panel.niveles["PD_B"] = 2
    b = panel.post("/api/admin/mission-status", json={"v": 2, "e": a["e"], "q": a["q"]}).json()
    assert "f" not in b and [f["user"] for f in b["fd"]] == ["PD_B"] and b["fd"][0]["level"] == 2
    assert "ids" not in b and b["e"] != a["e"]
    # Quien se va de la misión: viaja el orden nuevo.
    panel.perfiles.pop(0)
    c = panel.post("/api/admin/mission-status", json={"v": 2, "e": b["e"], "q": b["q"]}).json()
    assert c["ids"] == ["PD_B"] and c["fd"] == []


def test_una_huella_desconocida_trae_las_fichas_enteras(panel):
    j = panel.post("/api/admin/mission-status", json={"v": 2, "e": "nunca-vista", "q": 7}).json()
    assert len(j["f"]) == 2 and "p" in j


def test_un_aviso_revisado_no_cuenta(panel):
    panel.sospechas["PD_A"][0]["revisada_en"] = 123
    assert panel.post("/api/admin/mission-status", json={"v": 2}).json()["a"] == 0


def test_sin_conexion_la_ficha_lleva_su_ultima_senal(panel):
    panel.posiciones["PD_B"]["last_seen"] -= 3600
    panel.posiciones["PD_B"]["pos_at"] -= 3600
    j = panel.post("/api/admin/mission-status", json={"v": 2}).json()
    b = next(f for f in j["f"] if f["user"] == "PD_B")
    assert b["presence"] == "offline" and b["last_seen"] == panel.posiciones["PD_B"]["last_seen"]


def test_el_formato_de_siempre_sigue_igual_sin_v(panel):
    j = panel.post("/api/admin/mission-status", json={}).json()
    assert j["status"] == "ok" and j["etag"] and len(j["profiles"]) == 2 and "v" not in j


def test_el_compacto_pesa_menos(panel):
    viejo = panel.post("/api/admin/mission-status", json={}).text
    a = panel.post("/api/admin/mission-status", json={"v": 2}).json()
    panel.posiciones["PD_A"]["lat"] += 0.001
    andando = panel.post("/api/admin/mission-status", json={"v": 2, "e": a["e"], "q": a["q"]}).text
    assert len(andando) < len(viejo) / 2, (len(andando), len(viejo))


# --- frontend: comportamiento ------------------------------------------------------------------------------------------

@pytest.fixture(scope="module")
def datos():
    node = shutil.which("node")
    if not node:
        pytest.skip("sin node")
    p = subprocess.run([node, str(RAIZ / "tests" / "js" / "pocos_datos_24_11.cjs")], capture_output=True, text=True,
                       encoding="utf-8", timeout=180, cwd=str(RAIZ))
    assert p.returncode == 0, p.stderr[-2000:]
    salida = json.loads(p.stdout.strip().splitlines()[-1])
    errores = {k: v for k, v in salida.items() if isinstance(v, dict) and "__error" in v}
    assert not errores, errores
    return salida


def test_el_compacto_se_convierte_en_la_lista_de_siempre(datos):
    c = datos["compacto"]
    assert c["r1"] == [["A", 2, "live", 42.0001, -8.6002, 996], ["B", 1, "offline", 42, -8.6, 900]]
    assert c["r2"][0][3] == 42.0003 and c["r2"][0][5] == 1013  # la señal de A es la de su posición nueva
    assert c["r3"][0][5] == 1030 and c["r3"][1][5] == 900  # en vivo según el servidor: ahora; sin conexión: la suya
    assert [x[:3] for x in c["r4"]] == [["A", 2, "live"], ["B", 2, "live"], ["C", 0, "live"]]
    assert [x[0] for x in c["r5"]] == ["B", "C"]
    assert c["cambios"] == [True, True, False, True]


def test_el_ritmo_se_adapta(datos):
    r = datos["ritmo"]
    assert (r["normal"], r["media"], r["dosQuietos"], r["tresQuietos"], r["pocos"]) == (15000, 25000, 15000, 45000, 45000)
    assert r["trasAccion"] == 10000 and r["accionPasada"] == 15000
    assert r["lentoTrasAccion"] == 20000  # nunca más deprisa que 4 veces lo que tardó la última respuesta
    assert r["tope"] == 120000


def test_lo_viejo_se_dice(datos):
    v = datos["viejos"]
    assert (v["reciente"], v["unMinutoJusto"], v["viejo"], v["turnoLargo"], v["sinDatos"]) == (None, None, 180, None, None)
    assert v["textos"] == ["datos de hace 40 s", "datos de hace 3 min", "datos de hace 2 h"]


def test_el_bucle_manda_las_huellas_y_entiende_un_servidor_viejo(datos):
    b = datos["bucle"]
    assert b["cuerpos"] == [{"v": 2}, {"v": 2, "e": "E1", "q": "Q1"}, {"v": 2, "e": "E1", "q": "Q1"}, {"v": 2, "etag": "VIEJO"}]
    assert [x["avisos"] for x in b["vistos"]] == [3, 4, 4, 4]
    assert [x["nivel"] for x in b["vistos"]] == [1, 1, 7, 7]


def test_el_interruptor_de_pocos_datos(datos):
    i = datos["interruptor"]
    assert i["porLaRed"] == [True, True]
    assert i["apagadoAMano"] == [False, False, "0"]  # lo elegido manda sobre la red
    assert i["cuatroG"] is False and i["dosG"] is True and i["funcion"] == [False, True, False]


def test_los_fallos_de_overpass_no_van_a_client_errors(datos):
    assert datos["vigilancia"] == {"propia": True, "propiaEntera": True, "overpass": False, "envio": False, "teselas": False}


# --- frontend: sobre el código (lo que necesita un navegador) -------------------------------------------------------------

def test_el_mapa_lleva_una_capa_y_ninguna_con_pocos_datos():
    mapa = leer("admin", "AdminMissionMap.tsx")
    capa = mapa[mapa.index("if (mapTileMode === 'satellite-osm')"):mapa.index("} else if (mapTileMode === 'cyclosm')")]
    assert capa.count("L.tileLayer(") == 1 and "/map-tiles/{z}/{x}/{y}.png" in capa
    assert "updateWhenIdle: true" in capa and "keepBuffer: 1" in capa
    assert "arcgisonline" not in capa and "waymarkedtrails" not in capa
    assert "if (pocos) return" in mapa and "admin-mapa-liso" in mapa
    assert ".leaflet-container.admin-mapa-liso" in leer("admin", "styles", "admin-r7.css")


def test_sin_overpass_mirando_la_partida_y_sin_repetir_lo_que_fallo():
    mapa = leer("admin", "AdminMissionMap.tsx")
    assert "const editandoTrazado = Boolean(freeShape || selectedStage) && !pocos" in mapa
    assert "if (!map || !pathsGroup || !editandoTrazado) return" in mapa
    # Ni los caminos a 500 m de cada nodo al redibujar la ruta (antes, 3 a Overpass por cada acción o zoom).
    assert "if (editandoTrazado && waypoints.length > 0) {" in mapa and "caminosCercanos.get(clave)" in mapa
    assert "Date.now() - caminosFallaronMs < ESPERA_TRAS_FALLO_EXTERNO_MS" in mapa
    assert "pocos || rutaFallidaHacePoco(coordString)" in mapa and "rutasFallidas.set(coordString, Date.now())" in mapa
    # Las cachés son del panel, no de cada mapa montado.
    assert "useRef<Map<string, any>>(rutasEnCache)" in mapa and "useRef<Map<string, number>>(desnivelesEnCache)" in mapa
    assert "console.error('Overpass" not in mapa
    # Sin desnivel (open-meteo) en pocos datos.
    assert mapa.count("} else if (!pocos) {\r\n") + mapa.count("} else if (!pocos) {\n") == 2


def test_la_entrada_no_baja_el_panel_antes_de_teclear():
    app = leer("admin", "AdminApp.tsx")
    montaje = app[app.index("installAdminFetchClock()\n") if "installAdminFetchClock()\n" in app else app.index("installAdminFetchClock()"):]
    montaje = montaje[:montaje.index("return () => {")]
    assert "precargarShell()" in montaje and "if (payload.status === 'ok') precargarShell()" in montaje
    assert "if (calidadDeRed() !== 'mala') precargarShell()" not in app
    campo = app[app.index('id="admin-clave"'):]
    campo = campo[:campo.index("/>")]
    assert "precargarShell()" in campo


def test_la_ficha_no_repide_la_configuracion_y_pocos_datos_quita_fotos_y_caras():
    retrato = leer("admin", "components", "RetratoDePersonaje.tsx")
    assert "publicaGuardada()" in retrato
    app = leer("admin", "AdminApp.tsx")
    assert app.count("guardarPublica(") == 2
    jugadores = leer("admin", "components", "PlayersPanel.tsx")
    assert "{pocos ? null : <RetratoDePersonaje" in jugadores
    assert jugadores.count("&& !pocos ?") == 2


def test_la_cola_dice_nombres_y_la_lista_dice_de_cuando_son_los_datos():
    jugadores = leer("admin", "components", "PlayersPanel.tsx")
    assert "${nombreDe(op.profileId)}: " in jugadores and "<PendientesDeEnvio pendientes={pendientes} nombreDe={nombreDe} />" in jugadores
    assert "textoDatosDeHace(viejosS)" in jugadores and "datosViejosS: viejosS" in jugadores
    estado = leer("admin", "lib", "estadoDeJugador.ts")
    assert "o.datosViejosS ? chipDeDatosViejos(o.datosViejosS)" in estado


def test_el_interruptor_esta_en_el_menu():
    shell = leer("admin", "components", "AdminMissionControlShell.tsx")
    assert "id: 'pocos-datos'" in shell and "fijarPocosDatos(!pocosDatos)" in shell
