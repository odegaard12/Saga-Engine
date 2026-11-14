# -*- coding: utf-8 -*-
"""15/11 (posiciones con 10-15 jugadores y poca cobertura): un compañero con un hueco de cobertura ya no sale «en línea»
clavado en su sitio viejo (el servidor marca «visto hace poco» a 2,5 latidos de SU móvil, y con el GPS parado), la regla de
saltar latidos no empeora la frescura con pérdida, y «visto hace N» sólo sale cuando no está en línea y con hora exacta."""
import json
import os
import shutil
import subprocess
import tempfile
from pathlib import Path

import pytest

os.environ.setdefault("ADMIN_PASS", "pytest_admin_password")
os.environ.setdefault("SAGA_DATA_DIR", tempfile.mkdtemp(prefix="saga-test-pos-1511-"))

import main  # noqa: E402
from backend.app.runtime import equipo_delta  # noqa: E402
from backend.app.runtime import live_positions as lp  # noqa: E402

RAIZ = Path(__file__).resolve().parents[1]
SRC = RAIZ / "frontend" / "src"
AHORA = 1_800_000_000


def leer(*ruta):
    return SRC.joinpath(*ruta).read_text(encoding="utf-8")


def _estado(uid, raw, now=AHORA):
    return main.project_live_profile_status({"id": uid}, raw, now=now, total_nodes=5, timers={}, progress={})


@pytest.fixture(autouse=True)
def _limpio():
    lp.INTERVALO_EN_VIVO.clear()
    yield
    lp.INTERVALO_EN_VIVO.clear()


def test_umbral_de_stale_sale_del_intervalo_del_movil():
    assert lp.umbral_stale("a", AHORA) == lp.HEARTBEAT_STALE_SECONDS  # sin dato: 180 s como siempre
    lp.anotar_intervalo("a", 30, AHORA)
    assert lp.umbral_stale("a", AHORA) == 75
    lp.anotar_intervalo("a", 60, AHORA)
    assert lp.umbral_stale("a", AHORA) == 150
    # El dato caduca: sin latidos nuevos vuelve al valor fijo.
    assert lp.umbral_stale("a", AHORA + lp.INTERVALO_VIGENTE_SECONDS + 1) == lp.HEARTBEAT_STALE_SECONDS


@pytest.mark.parametrize("malo", [None, "x", float("nan"), 0, 5, 9.9, 301, 10_000, -30, [30], {}])
def test_un_intervalo_invalido_no_cambia_nada(malo):
    lp.anotar_intervalo("a", malo, AHORA)
    assert "a" not in lp.INTERVALO_EN_VIVO
    assert lp.umbral_stale("a", AHORA) == lp.HEARTBEAT_STALE_SECONDS


def test_el_umbral_tiene_suelo_y_techo():
    lp.anotar_intervalo("a", 10, AHORA)
    assert lp.umbral_stale("a", AHORA) == lp.STALE_MIN_SECONDS
    lp.anotar_intervalo("a", 300, AHORA)
    assert lp.umbral_stale("a", AHORA) == lp.STALE_MAX_SECONDS


def test_un_hueco_de_dos_minutos_ya_no_sale_en_linea():
    """Latido de 30 s, el móvil calla 100 s: antes «en línea» (180 s fijos), ahora «visto hace poco»."""
    raw = {"last_seen": AHORA - 100, "lat": 42.6, "lon": -8.7, "pos_at": AHORA - 100, "gps_status": "ok"}
    assert _estado("a", raw)["presence"] == "live"  # sin el intervalo declarado: igual que antes
    lp.anotar_intervalo("a", 30, AHORA)
    est = _estado("a", raw)
    assert est["presence"] == "stale"
    assert est["pos_at"] == AHORA - 100  # la hora exacta de su posición viaja (no está en línea)
    # Con el ahorro (60 s) esos 100 s son un latido y medio: todavía en línea.
    lp.anotar_intervalo("a", 60, AHORA)
    assert _estado("a", raw)["presence"] == "live"
    # ...y a los 160 s ya no.
    assert _estado("a", {**raw, "last_seen": AHORA - 160, "pos_at": AHORA - 160})["presence"] == "stale"


def test_sin_conexion_sigue_a_los_diez_minutos():
    lp.anotar_intervalo("a", 30, AHORA)
    raw = {"last_seen": AHORA - 601, "lat": 42.6, "lon": -8.7, "pos_at": AHORA - 601}
    assert _estado("a", raw)["presence"] == "offline"
    assert _estado("a", {"last_seen": 0})["presence"] == "offline"


def test_un_gps_parado_deja_la_posicion_vieja_como_visto_hace_poco():
    """Latidos sin coordenadas: `last_seen` sube pero la posición es de hace 4 min. No se ve «en línea» ahí."""
    raw = {"last_seen": AHORA - 5, "lat": 42.6, "lon": -8.7, "pos_at": AHORA - 240, "gps_status": "unavailable"}
    est = _estado("a", raw)
    assert est["presence"] == "stale"
    assert est["pos_at"] == AHORA - 240
    # Con el GPS refrescándose cada 90 s (parado en un sitio) sigue en línea, y entonces `pos_at` no viaja.
    ok = _estado("a", {**raw, "pos_at": AHORA - 90})
    assert ok["presence"] == "live"
    assert "pos_at" not in ok
    # Sin posición guardada no hay nada que envejecer.
    assert _estado("a", {"last_seen": AHORA - 5})["presence"] == "live"


def test_la_huella_ignora_el_ruido_en_linea_pero_no_la_hora_exacta_del_que_no_lo_esta():
    en_linea = {"user": "a", "presence": "live", "last_seen": 1_800_000_010}
    otro = {**en_linea, "last_seen": 1_800_000_040}  # 30 s después, mismo cubo de 2 min
    assert equipo_delta._huella(en_linea) == equipo_delta._huella(otro)
    parado = {"user": "a", "presence": "stale", "last_seen": 1_800_000_010, "pos_at": 1_800_000_010}
    mas_tarde = {**parado, "last_seen": 1_800_000_040}
    assert equipo_delta._huella(parado) != equipo_delta._huella(mas_tarde)  # exacto: «hace 3 min» no puede ser «hace 5»


def test_el_latido_guarda_el_intervalo_que_declara_el_movil(monkeypatch, tmp_path):
    from fastapi.testclient import TestClient
    from ruta_de_proba import preparar_mision

    preparar_mision(monkeypatch, tmp_path)
    original = main.load_config
    monkeypatch.setattr(
        main,
        "load_config",
        lambda: {**original(), "player_profiles": [{"id": "PLAYER 1", "display_name": "PLAYER 1", "color": "#22c55e"}]},
    )
    monkeypatch.setattr(main, "require_player_session", lambda *a, **k: None)
    monkeypatch.setattr(main, "enforce_player_rate_limit", lambda *a, **k: None)
    main.HEARTBEAT_LAST_SEEN_BY_KEY.clear()
    c = TestClient(main.app)
    cuerpo = {"user": "PLAYER 1", "lat": 40.4, "lon": -3.6, "accuracy": 6, "gps_status": "ok"}
    r = c.post("/api/heartbeat", json={**cuerpo, "intervalo_s": 60})
    assert r.status_code == 200, r.text
    assert lp.INTERVALO_EN_VIVO["PLAYER 1"][0] == 60.0
    main.HEARTBEAT_LAST_SEEN_BY_KEY.clear()
    # Un valor absurdo no rompe el latido ni pisa el dato bueno.
    r = c.post("/api/heartbeat", json={**cuerpo, "intervalo_s": "mucho"})
    assert r.status_code == 200, r.text
    assert lp.INTERVALO_EN_VIVO["PLAYER 1"][0] == 60.0


def test_saltar_latidos_solo_tras_dos_fallos_seguidos():
    node = shutil.which("node")
    if not node:
        pytest.skip("sin node")
    r = subprocess.run(
        [node, str(RAIZ / "tests" / "js" / "posiciones_15_11.cjs")], capture_output=True, text=True, encoding="utf-8"
    )
    assert r.returncode == 0, r.stderr
    d = json.loads(r.stdout)
    assert d["unFalloNoSalta"] is False and d["sinFallosNoSalta"] is False
    assert d["dosFallosSaltaAl30"] is True and d["dosFallosReintentaAl60"] is False
    assert d["avion"] == [True, True, True, False, True, False]
    assert d["intervalo60"] is False  # con 60 s entre latidos no hay nada que saltar
    sim = d["sim"]
    assert sim["p0"]["ahora"] == sim["p0"]["antes"]  # con buena red, nada cambia
    assert sim["p0.3"]["ahora"]["ok"] > sim["p0.3"]["antes"]["ok"]  # con 30 % de pérdida llegan MÁS latidos
    assert sim["p0.9"]["ahora"]["intentos"] <= sim["p0.9"]["antes"]["intentos"] * 1.1  # con la barra muerta, la radio no se despierta más


def test_el_cliente_manda_su_intervalo_y_pinta_al_que_lleva_rato_sin_senal():
    lt = leer("player", "hooks", "useLatidoYCola.ts")
    assert "intervalo_s: intervaloS" in lt and "fallosSeguidos += 1" in lt and "fallosSeguidos = 0" in lt
    assert "intervaloS = conexionAhorradora() || ahorroActivo(window.localStorage) ? 60 : 30" in lt
    assert "intervalo_s?: number" in leer("shared", "api.ts")
    assert "pos_at?: number" in leer("types", "player.ts")
    mapa = leer("player", "components", "MapSurfaceGL.tsx")
    assert "el.presencia === 'offline' ? 0.7 : el.presencia === 'recent' ? 0.82 : 1" in mapa
    pop = leer("player", "components", "jugadoresEnMapa.ts")
    assert "if (tipo !== 'live') {" in pop and "haceCuanto(jugador.pos_at ?? jugador.last_seen)" in pop
