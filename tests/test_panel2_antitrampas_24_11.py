# -*- coding: utf-8 -*-
"""24/11/2026 (panel 2): el antitrampa revisado regla por regla, con datos inventados (sin coordenadas reales).

- Velocidad entre NODOS (en recta, lo mínimo que hay que andar) con confianza logística: nada a 12 km/h, 0,5 a 18,5,
  casi segura a 25. La misma regla en directo y en la cola sin red (las dos pasan por `_comprobar_tiempo_declarado`).
- Hora del avance hacia atrás o antes de la salida.
- GPS clavado en el centro del nodo o congelado (misma posición Y precisión); la precisión repetida sola no (iPhone).
- Rescates sin GPS y saltos del organizador repetidos: llevan la cuenta (`veces`) y el panel los junta.
- El botón «Avisos» cuenta tarjetas (jugador y motivo), no anotaciones: cuatro rescates de uno son 1.
- La lista de avisos va sin coordenadas y con huella: si no cambió, «sin_cambios».
- Un salto al recuperar cobertura con una velocidad posible no se marca como teletransporte.
Las reglas del panel (agrupar, ordenar, «Ver más») en tests/js/panel2_avisos_24_11.cjs.
"""
import json
import os
import shutil
import subprocess
import tempfile
from pathlib import Path

os.environ.setdefault("ADMIN_PASS", "pytest_admin_password")
os.environ.setdefault("SAGA_DATA_DIR", tempfile.mkdtemp(prefix="saga-test-panel2-"))

import pytest  # noqa: E402
from fastapi.testclient import TestClient  # noqa: E402

import main  # noqa: E402
from backend.app.runtime import anti_cheat as ac  # noqa: E402
from backend.app.runtime import avance  # noqa: E402

RAIZ = Path(__file__).resolve().parent.parent
LAT, LON = 10.0, 20.0  # inventado: en medio del mar
#: 0,009 grados de latitud son ~1 km.
UN_KM = 0.009


def nodo(i, lat, lon, radio=20):
    return {"id": f"n{i}", "title": f"Nodo {i}", "location": {"lat": lat, "lon": lon, "radius_m": radio}}


@pytest.fixture
def db(tmp_path):
    return str(tmp_path / "anti_cheat.json")


def motivos(db, user):
    return [e["reason"] for e in ac.list_suspicions(db, user).get(user, [])]


# --- velocidad entre nodos --------------------------------------------------------------------------------------------

def test_la_confianza_es_una_curva_no_un_si_o_no():
    assert ac.confianza_por_velocidad(6) < 0.01
    assert ac.confianza_por_velocidad(12) < 0.1
    assert abs(ac.confianza_por_velocidad(18.5) - 0.5) < 1e-9
    assert ac.confianza_por_velocidad(25) > 0.9
    assert ac.confianza_por_velocidad(13) < ac.confianza_por_velocidad(20) < ac.confianza_por_velocidad(30)
    assert ac.confianza_por_velocidad("nada") == 0.0


def test_andando_o_corriendo_entre_nodos_no_se_marca(db):
    a, b = nodo(1, LAT, LON), nodo(2, LAT + UN_KM, LON)
    # 1 km (menos radios y margen) en 10 min = ~5,5 km/h; en 5 min = ~11 km/h (corriendo).
    assert ac.check_node_to_node_speed(db, "A", a, b, 0, 10 * 60_000) is None
    assert ac.check_node_to_node_speed(db, "A", a, b, 0, 5 * 60_000) is None
    assert motivos(db, "A") == []


def test_un_km_en_un_minuto_se_marca_con_su_confianza(db):
    a, b = nodo(1, LAT, LON), nodo(2, LAT + UN_KM, LON)
    s = ac.check_node_to_node_speed(db, "B", a, b, 1_000, 61_000)
    assert s and s["reason"] == "node_to_node_too_fast"
    e = s["evidence"]
    assert e["prev_node_id"] == "n1" and e["node_id"] == "n2"
    assert e["speed_kmh"] > 50 and e["confianza"] > 0.99 and 900 < e["distance_m"] < 1000
    assert not any(k in e for k in ac.CLAVES_CON_COORDENADAS), "sin coordenadas en la prueba"


def test_nodos_que_se_tocan_o_sin_sitio_no_se_miran(db):
    a = nodo(1, LAT, LON, radio=60)
    b = nodo(2, LAT + 0.001, LON, radio=60)  # ~111 m entre centros < 60 + 60 + 40
    assert ac.check_node_to_node_speed(db, "C", a, b, 0, 1_000) is None
    assert ac.check_node_to_node_speed(db, "C", None, b, 0, 1_000) is None
    assert ac.check_node_to_node_speed(db, "C", {"id": "x"}, b, 0, 1_000) is None
    assert ac.check_node_to_node_speed(db, "C", a, b, 5_000, 1_000) is None, "hacia atrás lo mira otra regla"


# --- hora del avance --------------------------------------------------------------------------------------------------

def test_hora_hacia_atras_y_antes_de_la_salida(db):
    n = nodo(1, LAT, LON)
    hora = 1_800_000_000_000
    assert ac.check_advance_order(db, "D", n, hora, hora - 60_000) is None
    assert ac.check_advance_order(db, "D", n, hora - 60_000, hora) is None, "1 min de desfase: holgura"
    s = ac.check_advance_order(db, "D", n, hora - 20 * 60_000, hora)
    assert s["reason"] == "advance_time_out_of_order" and s["evidence"]["atras_ms"] == 20 * 60_000
    s = ac.check_advance_order(db, "E", n, hora - 3_600_000, None, inicio_ms=hora)
    assert s["reason"] == "advance_before_game_start"
    assert ac.check_advance_order(db, "E", n, hora + 1, None, inicio_ms=hora) is None


# --- patrones de GPS --------------------------------------------------------------------------------------------------

def muestra(lat, lon, acc=5.0):
    return {"lat": lat, "lon": lon, "acc": acc, "src": "real"}


def test_gps_clavado_en_el_centro_del_nodo(db):
    n = nodo(1, LAT, LON)
    assert ac.check_gps_patterns(db, "F", n, [muestra(LAT, LON), muestra(LAT + 0.0001, LON)]) is None, "una sola: azar"
    s = ac.check_gps_patterns(db, "F", n, [muestra(LAT, LON), muestra(LAT, LON + 0.000001)])
    assert s["reason"] == "gps_exact_on_node" and s["evidence"]["muestras"] == 2


def test_gps_congelado_si_pero_precision_redondeada_de_iphone_no(db):
    n = nodo(1, LAT, LON)
    quieto = [muestra(LAT + 0.0003, LON + 0.0003)] * 5
    assert ac.check_gps_patterns(db, "G", n, quieto)["reason"] == "gps_frozen"
    # iPhone: precisión siempre 5 m (redondeada), pero la posición tiembla: es un GPS de verdad.
    temblando = [muestra(LAT + 0.0003 + i * 1e-6, LON + 0.0003) for i in range(8)]
    assert ac.check_gps_patterns(db, "H", n, temblando) is None
    assert ac.check_gps_patterns(db, "H", n, [{**m, "src": "manual"} for m in quieto]) is None, "modo prueba: otra regla"


# --- el botón cuenta tarjetas -----------------------------------------------------------------------------------------

def test_el_boton_cuenta_tarjetas_no_anotaciones(db):
    for _ in range(4):
        ac.record_suspicion(db, "I", "proximity_no_gps_rescue", {"veces": 1})
    ac.record_suspicion(db, "I", "proximity_no_gps", {}, severity="info")
    ac.record_suspicion(db, "J", "impossible_travel_speed", {})
    assert ac.grupos_sin_revisar(ac.list_suspicions(db)) == 2
    for _ in range(2):
        ac.record_suspicion(db, "K", "organizer_advance", {"nodos": 1}, severity="info")
    assert ac.grupos_sin_revisar(ac.list_suspicions(db)) == 2, "dos saltos del organizador: todavía nota"
    ac.record_suspicion(db, "K", "organizer_advance", {"nodos": 1}, severity="info")
    assert ac.grupos_sin_revisar(ac.list_suspicions(db)) == 3, "el tercero sí se mira"
    for e in ac.list_suspicions(db, "J")["J"]:
        ac.mark_reviewed(db, "J", e["at"], e["reason"])
    assert ac.grupos_sin_revisar(ac.list_suspicions(db)) == 2
    assert ac.contar(db, "I", "proximity_no_gps_rescue") == 4


# --- integrado: directo y cola por el mismo sitio ---------------------------------------------------------------------

@pytest.fixture
def ruta(monkeypatch, tmp_path):
    monkeypatch.setattr(main, "TIMERS_DB", str(tmp_path / "timers.json"))
    monkeypatch.setattr(main, "ANTI_CHEAT_DB", str(tmp_path / "anti_cheat.json"))
    nodos = [nodo(0, LAT, LON), nodo(1, LAT + UN_KM, LON), nodo(2, LAT + 2 * UN_KM, LON)]
    monkeypatch.setattr(main, "get_runtime_stages", lambda: nodos)
    original = main.load_config
    monkeypatch.setattr(main, "load_config", lambda: {**original(), "mission_launch_at": "2020-01-01T00:00"})
    return nodos


def test_dos_nodos_a_un_km_en_un_minuto_se_marcan_al_avanzar(ruta):
    hora = 1_800_000_000_000
    assert avance._comprobar_tiempo_declarado("L", ruta[0], 30_000, hora) is None
    s = avance._comprobar_tiempo_declarado("L", ruta[1], 30_000, hora + 60_000)
    assert s and s["reason"] == "node_to_node_too_fast"
    # Andando el siguiente tramo (12 min), nada nuevo.
    avance._comprobar_tiempo_declarado("L", ruta[2], 30_000, hora + 60_000 + 12 * 60_000)
    assert [m for m in motivos(main.ANTI_CHEAT_DB, "L") if m == "node_to_node_too_fast"] == ["node_to_node_too_fast"]


def test_tras_un_salto_del_organizador_no_se_mide_desde_donde_no_estuvo(ruta):
    hora = 1_800_000_000_000
    avance._comprobar_tiempo_declarado("M", ruta[0], 30_000, hora)
    main.record_player_advance("M", hora + 10_000)  # «+1 nodo con tiempo» del panel: sin nodo
    assert avance._comprobar_tiempo_declarado("M", ruta[2], 30_000, hora + 70_000) is None
    assert "node_to_node_too_fast" not in motivos(main.ANTI_CHEAT_DB, "M")


def test_la_cola_con_la_hora_hacia_atras_se_marca(ruta):
    hora = 1_800_000_000_000
    avance._comprobar_tiempo_declarado("N", ruta[0], 30_000, hora)
    s = avance._comprobar_tiempo_declarado("N", ruta[1], 30_000, hora - 30 * 60_000)
    assert s and s["reason"] == "advance_time_out_of_order"


def test_salto_al_volver_la_cobertura_con_velocidad_posible_no_es_teletransporte(tmp_path):
    db, racha = str(tmp_path / "ac.json"), str(tmp_path / "racha.json")
    # 1,2 km tras 10 min sin señal (7 km/h), con buena precisión: lo normal al recuperar el GPS.
    r = ac.check_travel_speed(db, racha, "O", LAT, LON, 1_000, 8, LAT + 1.2 * UN_KM, LON, 1_600, 8, level=2, total_stages=6)
    assert r is None and motivos(db, "O") == []
    # El mismo salto en 30 s sí (salto único grande con buena precisión).
    r = ac.check_travel_speed(db, racha, "P", LAT, LON, 1_000, 8, LAT + 1.2 * UN_KM, LON, 1_030, 8, level=2, total_stages=6)
    assert r and r["reason"] == "impossible_travel_speed"


# --- lo que ve el panel -----------------------------------------------------------------------------------------------

@pytest.fixture
def panel(monkeypatch, tmp_path):
    main.clear_admin_sessions()
    main.ADMIN_LOGIN_ATTEMPTS.clear()
    monkeypatch.setattr(main, "admin_password_change_required", lambda: False)
    monkeypatch.setattr(main, "ANTI_CHEAT_DB", str(tmp_path / "anti_cheat.json"))
    ac.record_suspicion(main.ANTI_CHEAT_DB, "PQ", "impossible_travel_speed",
                        {"speed_kmh": 61, "from": {"lat": 1, "lon": 2}, "to": {"lat": 3, "lon": 4}, "nada": None})
    for _ in range(3):
        ac.record_suspicion(main.ANTI_CHEAT_DB, "PQ", "proximity_no_gps_rescue", {"motivo": "gps_rendido"})
    c = TestClient(main.app)
    c.cookies.set(main.ADMIN_SESSION_COOKIE, main.create_admin_session())
    return c


def test_la_lista_va_sin_coordenadas_y_con_huella(panel):
    r = panel.post("/api/admin/anti-cheat-flags", json={}).json()
    assert r["status"] == "ok" and r["etag"]
    velocidad = [s for s in r["players"][0]["suspicions"] if s["reason"] == "impossible_travel_speed"][0]
    assert velocidad["evidence"] == {"speed_kmh": 61}, "ni coordenadas ni claves vacías"
    otra = panel.post("/api/admin/anti-cheat-flags", json={"etag": r["etag"]}).json()
    assert otra == {"status": "sin_cambios", "etag": r["etag"]}
    ac.record_suspicion(main.ANTI_CHEAT_DB, "PQ", "salio_app", {})
    assert panel.post("/api/admin/anti-cheat-flags", json={"etag": r["etag"]}).json()["status"] == "ok"


def test_el_sondeo_cuenta_tarjetas(panel):
    assert panel.post("/api/admin/mission-status", json={"v": 2}).json()["a"] == 2


# --- reglas del panel en JS ---------------------------------------------------------------------------------------

@pytest.mark.skipif(shutil.which("node") is None, reason="sin node")
def test_reglas_del_panel_en_js():
    salida = subprocess.run(
        [shutil.which("node"), str(RAIZ / "tests" / "js" / "panel2_avisos_24_11.cjs")], capture_output=True, text=True,
        encoding="utf-8", cwd=str(RAIZ), timeout=180,
    )
    assert salida.returncode == 0, salida.stderr[-2000:]
    d = json.loads(salida.stdout.strip().splitlines()[-1])
    # Cuatro rescates de Ana = una tarjeta «4 veces · nodos 1, 2, 3». Un rescate solo dice poco (0,35, gente honesta sin
    # cobertura); cuatro suben a media (0,82), seis a alta.
    assert d["rescate"] == {"veces": 4, "nodos": [1, 2, 3], "gravedad": "media", "resumen": "4 veces · nodos 1, 2, 3",
                            "confianza": 0.82}
    assert d["seis_rescates"] == "alta" and d["un_rescate"] == "media"
    assert d["frases"]["rescate"] == 'Pasó en el nodo 2 con el rescate de Herramientas (GPS rendido).'
    # La velocidad entre nodos con poca confianza (0,55) es media; la de 0,99, alta y primera.
    assert d["orden"][0] == "Beto|node_to_node_too_fast"
    assert d["gravedades"]["Beto|node_to_node_too_fast"] == "alta"
    assert d["gravedades"]["Ciro|node_to_node_too_fast"] == "media"
    # Notas: siguen siendo notas; tres saltos del organizador a uno, sí se revisan (media).
    assert d["gravedades"]["Ana|proximity_no_gps"] == "nota"
    assert d["gravedades"]["Dani|organizer_advance"] == "media"
    assert d["gravedades"]["Eva|organizer_advance"] == "nota"
    assert d["cuenta"] == {"revisar": 4, "notas": 2, "revisados": 1}
    # 15 jugadores con un aviso cada uno: 15 tarjetas, las de entrada son 8.
    assert d["muchos"] == {"tarjetas": 15, "de_entrada": 8}
    assert d["frases"]["nodo"] == "De nodo 1 a nodo 2: 950 m en línea recta en 1 min (57 km/h; a pie no pasa de 13)."
    assert d["frases"]["sin_cifras"] == "Entre dos nodos."
    assert d["minYs"] == ["45 s", "1 min", "3 min 20 s"]
