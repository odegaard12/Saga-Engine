# -*- coding: utf-8 -*-
"""20/11/2026: el cartel plano (fuera del tope 3D) conserva el rumbo del mundo y no mira siempre a la cámara; y el ahorro «Auto»
funciona en iPhone (sin batería) por rendimiento real."""
import json
import shutil
import subprocess
from pathlib import Path

import pytest

RAIZ = Path(__file__).resolve().parent.parent
SRC = RAIZ / "frontend" / "src" / "player"


@pytest.fixture(scope="module")
def d():
    node = shutil.which("node")
    if not node:
        pytest.skip("sin node")
    p = subprocess.run([node, str(RAIZ / "tests" / "js" / "cartel_y_ahorro_20_11.cjs")], capture_output=True, text=True,
                       encoding="utf-8", timeout=120, cwd=str(RAIZ))
    assert p.returncode == 0, p.stderr[-2000:]
    return json.loads(p.stdout)


def test_cartel_con_el_rumbo_del_mundo(d):
    for c in d["cartel"]:
        assert abs(c["relMundo"]) <= 180
    # un jugador mirando al SO (225°): con la cámara al norte (bearing 0) lo ve de cara; con la cámara hacia el sur (180) de espaldas => espejo
    por_b = {c["b"]: c for c in d["cartel"]}
    assert por_b[0]["espejo"] is False and por_b[180]["espejo"] is True
    # dentro del límite el cartel conserva su yaw de MUNDO (h = π − rumbo = -45°) gire como gire la cámara; no es «-bearing»
    assert por_b[0]["rotY"] == por_b[90]["rotY"] == -45
    assert all(x["espejo"] is False and x["rotY"] == -x["b"] for x in d["deCara"])
    assert d["sinRumbo"]["espejo"] is True  # norte, de espaldas a una cámara al norte
    assert max(abs(a - b) for a, b in zip(d["cruce"], d["cruce"][1:] + d["cruce"][:1])) <= 60  # 359°->1°: sin vuelta de 358°
    # el giro respecto a la cámara está acotado a 60°
    assert all(abs(x) <= 60 for x in d["noSiempreACamara"])


def test_ahorro_auto_por_fps(d):
    assert d["fpsBajosDisparaUnaVez"] == 1
    assert d["fpsBuenosNunca"] == 0 and d["siNoEstaEnLaCalidadMinimaNunca"] == 0 and d["pausasLargasNoCuentan"] == 0
    a = d["ahorro"]
    assert a["nada"] is False and a["fpsVigente"] is True and a["fpsCaducado"] is False
    assert a["manualNoGanaALosFps"] is False and a["manualSi"] is True and a["bateria"] is True
    assert a["automatico"] == [True, False, False]
    assert d["anotado"] == {"saga:fps-bajos": "1", "saga:fps-bajos-t": "1234"}


def test_codigo_fuente_cartel_y_ahorro():
    capa = (SRC / "avatares3d" / "mixamo" / "capaAvatares.ts").read_text(encoding="utf-8")
    assert "e.foto.rotation.y = -ctx.rumbo" not in capa and "orientacionDelCartel(rb, ctx.rumbo)" in capa
    assert "e.foto.scale.x = cartel.espejo ? -1 : 1" in capa
    assert "vigilanteDeFps.muestra(ctx.dt * 1000, fpsMedios, calidad === 'baja')" in capa and "anotarFpsBajos(window.localStorage)" in capa
    hud = (SRC / "components" / "PlayerHud.tsx").read_text(encoding="utf-8")
    assert "automático (si el móvil va lento)" in hud and "automático (batería < 20 % o si va lento)" in hud
    assert "automático (< 20 %)" not in hud  # no promete un criterio que no puede medir
