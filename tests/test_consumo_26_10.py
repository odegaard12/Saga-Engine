# -*- coding: utf-8 -*-
"""26/10, consumo con poca cobertura: banda muerta de la tabla de equipo y latido adaptativo del móvil.

Un jugador conectado pero parado cambiaba su entrada en cada latido (last_seen sube 30 s y el GPS parado baila unos
metros), así que la tabla por diferencias nunca se libraba de mandarlo. Ahora la huella ignora ese ruido, y un móvil
que lleva rato parado y lejos del nodo late cada 60-90 s en vez de cada 30 (módulo puro, TODAVÍA SIN ENGANCHAR en el hook).
"""
import json
import os
import shutil
import subprocess

import pytest

from backend.app.runtime import equipo_delta as ed

RAIZ = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
T0 = 1_800_000_000
LAT, LON = 40.4153, -3.6828
M = 1 / 111_320.0


def _perfil(user, lat=LAT, lon=LON, visto=T0, rumbo=90, presencia="live", **extra):
    return {"user": user, "presence": presencia, "last_seen": visto, "lat": round(lat, 6), "lon": round(lon, 6),
            "heading": rumbo, "level": 1, "is_self": False, **extra}


@pytest.fixture(autouse=True)
def _estado_limpio():
    ed._perfiles.clear()
    ed._posiciones.clear()
    ed._ids = ()
    ed._ids_rev = 0
    ed._rev = 0
    yield


def _ronda(perfiles, epoca=None, rev=None):
    t = ed.a_diferencias(perfiles, epoca, rev)
    return t, [p["user"] for p in t["profiles"]]


def test_un_jugador_parado_con_ruido_de_gps_no_vuelve_a_viajar():
    a, b = "A", "B"
    t, quien = _ronda([_perfil(a), _perfil(b)])
    assert t["completo"] and quien == [a, b]
    epoca, rev = t["epoca"], t["rev"]
    # B sigue parado: +30 s de last_seen, 3 m de baile, rumbo 4° distinto. A no cambia.
    for i in range(1, 4):
        t, quien = _ronda(
            [_perfil(a), _perfil(b, lat=LAT + 3 * M * (-1) ** i, lon=LON + 2 * M, visto=T0 + 30 * i, rumbo=90 + 4)],
            epoca, rev,
        )
        assert not t["completo"] and quien == [], "el ruido de un jugador parado no debe viajar (ronda %d)" % i
        rev = t["rev"]


def test_lo_que_de_verdad_cambia_si_viaja():
    a = "A"
    t, _ = _ronda([_perfil(a)])
    epoca, rev = t["epoca"], t["rev"]
    # 1) se movió 10 m (más que la banda)
    t, quien = _ronda([_perfil(a, lat=LAT + 10 * M, visto=T0 + 30)], epoca, rev)
    assert quien == [a] and t["profiles"][0]["lat"] == round(LAT + 10 * M, 6), "viaja con su posición de AHORA"
    rev = t["rev"]
    # 2) pasan más de 2 min de last_seen
    t, quien = _ronda([_perfil(a, lat=LAT + 10 * M, visto=T0 + 400)], epoca, rev)
    assert quien == [a]
    rev = t["rev"]
    # 3) cruza un umbral de presencia (en vivo -> sin señal)
    t, quien = _ronda([_perfil(a, lat=LAT + 10 * M, visto=T0 + 400, presencia="stale")], epoca, rev)
    assert quien == [a]
    rev = t["rev"]
    # 4) gira más de 10°
    t, quien = _ronda([_perfil(a, lat=LAT + 10 * M, visto=T0 + 400, presencia="stale", rumbo=140)], epoca, rev)
    assert quien == [a]


def test_la_posicion_de_referencia_no_se_arrastra_poco_a_poco():
    """Cuatro pasos de 4 m en la misma dirección suman 16 m: tienen que acabar viajando (la banda se mide contra lo MANDADO)."""
    a = "A"
    t, _ = _ronda([_perfil(a)])
    epoca, rev = t["epoca"], t["rev"]
    mandados = 0
    for i in range(1, 5):
        t, quien = _ronda([_perfil(a, lat=LAT + 4 * i * M)], epoca, rev)
        rev = t["rev"]
        mandados += len(quien)
    assert mandados >= 1, "sin referencia fija, un paseo lento de 16 m no se mandaría nunca"


def test_la_tabla_sigue_siendo_la_misma_vista_desde_el_movil():
    """Con el ruido ignorado, la copia del móvil nunca se aleja de la tabla completa más de la banda ni 2 min de last_seen."""
    a, b = "A", "B"
    t, _ = _ronda([_perfil(a), _perfil(b)])
    epoca, rev = t["epoca"], t["rev"]
    copia = {p["user"]: p for p in t["profiles"]}
    for i in range(1, 30):
        completa = [_perfil(a, lat=LAT + (i * 7) * M, visto=T0 + 30 * i), _perfil(b, lat=LAT + (i % 3) * M, visto=T0 + 30 * i)]
        t, _ = _ronda(completa, epoca, rev)
        rev = t["rev"]
        for p in t["profiles"]:
            copia[p["user"]] = p
        for real in completa:
            c = copia[real["user"]]
            assert abs(c["lat"] - real["lat"]) / M < ed.BANDA_MUERTA_M + 0.5
            assert real["last_seen"] - c["last_seen"] < ed.CUBO_LAST_SEEN_S + 30
            assert c["presence"] == real["presence"]


# ---- el latido adaptativo del móvil (módulo puro, vía Node) ----
def _js():
    node = shutil.which("node")
    if not node:
        pytest.skip("sin node")
    r = subprocess.run([node, os.path.join(RAIZ, "tests", "js", "latido_adaptativo.cjs")], capture_output=True, text=True, timeout=60)
    assert r.returncode == 0, r.stderr
    return json.loads(r.stdout)


def test_el_movil_late_mas_espaciado_solo_parado_y_lejos():
    j = _js()
    assert j["andando"] == 30_000 and j["ahorro"] == 60_000
    assert j["parado30s"] == 30_000, "medio minuto parado todavía no cuenta"
    assert j["parado1min"] == 60_000 and j["parado5min"] == 90_000
    assert j["paradoCercaDelNodo"] == 30_000, "a menos de 250 m del nodo, como siempre"
    assert j["paradoSinSaberElNodo"] == 90_000
    assert j["paradoSinCobertura"] == 30_000, "sin cobertura ya manda el ciclo de «uno de cada cuatro»"
    assert j["paradoConAhorro"] == 90_000
    assert j["sinPosicion"] == 30_000
    # nunca más de 90 s: el servidor da por «en vivo» hasta 180 s
    assert max(j[k] for k in ("andando", "ahorro", "parado1min", "parado5min", "paradoSinSaberElNodo", "paradoConAhorro")) <= 90_000
    assert j["traza"] == [0, 0, 30_000, 60_000, 0, 338_000, 0]
    assert j["cienM"] == 100
