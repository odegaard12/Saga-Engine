# -*- coding: utf-8 -*-
"""22/11 «GPS y minimapa»: trazas de GPS simuladas (quieto con ruido, andando, rebotes, saltos de verdad, lecturas
atrasadas, pérdida y vuelta, el borde del radio) contra el filtro del GPS y las reglas del radio; y que el móvil no
abre nada que el servidor dé por «lejos»."""
import json
import shutil
import subprocess
from pathlib import Path

import pytest

RAIZ = Path(__file__).resolve().parents[1]
SRC = RAIZ / "frontend" / "src"


def leer(*ruta):
    return SRC.joinpath(*ruta).read_text(encoding="utf-8")


@pytest.fixture(scope="module")
def datos():
    node = shutil.which("node")
    if not node:
        pytest.skip("sin node")
    r = subprocess.run([node, str(RAIZ / "tests" / "js" / "gps_y_minimapa.cjs")], capture_output=True, text=True,
                       encoding="utf-8", timeout=60)
    assert r.returncode == 0, r.stderr
    return json.loads(r.stdout)


def test_quieto_el_punto_no_baila(datos):
    q = datos["quieto"]
    assert q["crudo"] > 60, "la traza sí baila: si no, la prueba no prueba nada"
    assert q["cambios"] <= 3 and q["errorFinal"] < 8


def test_andando_no_se_queda_atras(datos):
    a = datos["andando"]
    assert a["descartadas"] == 0 and a["cambios"] >= 20
    assert a["retrasoMedio"] < 4 and a["peorRetraso"] < 15


def test_rebotes_saltos_y_atrasadas(datos):
    assert datos["rebote"] == {"descartadas": 1, "alFinal": 0}
    assert datos["saltoReal"]["descartadas"] == 1 and datos["saltoReal"]["alFinal"] < 5
    assert datos["atrasada"] == {"descartadas": 1, "alFinal": 0}
    assert datos["relojAtras"] == 0, "con el reloj cambiado el GPS no puede quedarse mudo"
    assert datos["perdida"]["descartadas"] == 0 and datos["perdida"]["alFinal"] < 5


def test_el_borde_del_radio_no_parpadea(datos):
    b = datos["borde"]
    assert b["sinH"] >= 10 and b["conH"] <= 2
    assert b["sale"] is False and b["noEntraDeMas"] is False


def test_el_movil_no_abre_lo_que_el_servidor_da_por_lejos(datos):
    from backend.app.runtime import evidencia, proximidad
    # El móvil: radio + margen (35 como mucho) + histéresis. El servidor: radio + precisión (15..100) + 40.
    assert datos["borde"]["margenMaximo"] <= evidencia._PRECISION_MINIMA_M + proximidad.TOLERANCIA_EXTRA_M


def test_respaldo_y_hora_de_la_lectura(datos):
    assert datos["respaldo"] == [True, True, False, True]
    assert datos["hora"] == [5000, 4000, 5000, 5000]


def test_el_gancho_usa_el_filtro_y_rearranca_sin_senal():
    g = leer("player", "hooks", "useGpsDelJugador.ts")
    exito = g[g.index("function onSuccess"):g.index("function cambiarAModoPorRed")]
    assert "filtroGpsRef.current.leer(" in exito and "if (valeLaLectura && !filtrado) return" in exito
    assert "setBrowserGpsPosition(punto)" in exito and "setBrowserGpsPosition(next)" not in exito
    assert "horaDeLaLectura(position.timestamp, Date.now())" in exito
    error = g[g.index("function onError"):]
    assert "if (!denied && reintentoGpsRef.current === null)" in error


def test_el_radio_es_el_mismo_en_todas_partes():
    app = leer("player", "PlayerApp.tsx")
    assert "sigueDentro(unlockDistanceMeters, stageRadius, browserGpsAccuracy" in app
    assert "precisionValeDeRespaldo(browserGpsAccuracy) &&" in app
    qr = app[app.index("function closeQrIfPhysicalScannerNoLongerReachable"):][:1400]
    assert "!sigueDentro(distance, radius" in qr and "distance > radius" not in qr.replace("`distance > radius`", "")
    cp = leer("player", "minigames", "families", "signalHunt", "CheckpointRuntimeScreen.tsx")
    assert "sigueDentro(distance, radius, appPosition ? appAccuracy : null, true)" in cp
    mapa = leer("player", "components", "MapSurfaceGL.tsx")
    assert "mejorMetros - Math.max(0, gpsAccuracyRef.current ?? 0)" in mapa


def test_la_brujula_sin_mapa_gira_por_el_lado_corto():
    b = leer("player", "components", "BrujulaSinMapa.tsx")
    assert "useGiro(rumbo === null ? null : Math.round(giroDeLaFlecha(rumbo, orientacion)))" in b
    assert "rotate(${flecha ?? 0}deg)" in b
    assert "< 2 ? previa" in b, "el sensor a 60 Hz no repinta por cada décima de grado"
