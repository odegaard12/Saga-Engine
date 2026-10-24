# -*- coding: utf-8 -*-
"""24/10: el cubo del icono del nodo, más grande y legible, y el avatar que se aparta del poste (variante avA).

* El apartado es una función pura (apartarDelNodo.ts), ejecutada en Node: dónde se pinta el cuerpo dado el avatar,
  los postes y el rumbo del mapa, con histéresis para que el GPS en el borde no lo haga saltar.
* El cubo: lado y resolución de su cara fijados en bolaRenderizada.ts, y que no pise la moneda.
"""
import json
import math
import re
import shutil
import subprocess
from pathlib import Path

import pytest

RAIZ = Path(__file__).resolve().parent.parent
BOLA = RAIZ / "frontend" / "src" / "player" / "components" / "bolaRenderizada.ts"
CAPA = RAIZ / "frontend" / "src" / "player" / "avatares3d" / "mixamo" / "capaAvatares.ts"


@pytest.fixture(scope="module")
def ap():
    node = shutil.which("node")
    if not node or not (RAIZ / "frontend" / "node_modules" / "typescript").exists():
        pytest.skip("sin node o sin frontend/node_modules")
    r = subprocess.run([node, str(RAIZ / "tests" / "js" / "apartar_del_nodo.cjs")], capture_output=True, text=True, encoding="utf-8")
    assert r.returncode == 0, r.stderr
    return json.loads(r.stdout)


def test_se_aparta_a_la_derecha_y_hacia_la_camara(ap):
    k = ap["constantes"]
    assert 30 <= k["APARTA_PX"] <= 50 and k["VUELVE_PX"] > k["APARTA_PX"]
    for caso in ("encima", "cerca"):
        assert ap[caso]["apartado"] is True
        # Rumbo 0: derecha = este (+x), hacia la cámara = sur (+y), relativo al poste (no al avatar).
        assert ap[caso]["punto"] == {"x": 1000 + k["LADO_PX"], "y": 1000 + k["DELANTE_PX"]}
    # Fuera de la zona del poste apartado lejos de él: ya no cae encima.
    assert math.hypot(k["LADO_PX"], k["DELANTE_PX"]) > k["APARTA_PX"]


def test_fuera_se_queda_en_su_sitio(ap):
    for caso in ("lejos", "sinPostes", "franjaFuera"):
        assert ap[caso]["apartado"] is False
    assert ap["lejos"]["punto"] == {"x": 1060, "y": 1000}


def test_histeresis_y_rumbo(ap):
    k = ap["constantes"]
    assert ap["franjaDentro"]["apartado"] is True
    # Mapa girado 90°: la derecha de la pantalla es el sur y la cámara queda al oeste.
    p = ap["girado90"]["punto"]
    assert abs(p["x"] - (1000 - k["DELANTE_PX"])) < 1e-9 and abs(p["y"] - (1000 + k["LADO_PX"])) < 1e-9
    # Con dos postes, se aparta del más cercano.
    assert ap["masCercano"]["punto"]["x"] == 1035 + k["LADO_PX"]


def test_la_capa_usa_el_apartado_solo_para_el_dibujo():
    s = CAPA.read_text(encoding="utf-8")
    assert "apartarDelPoste(" in s
    # La velocidad se mide con el punto real: apartarse no puede parecer que anda.
    assert "anadirMuestra(e.muestras, { t: ctx.ahora, x: real.x / m, y: real.y / m })" in s


def _num(nombre, s):
    m = re.search(rf"const {nombre} = ([\d.]+)$", s, re.M)
    assert m, nombre
    return float(m.group(1))


def test_cubo_mas_grande_nitido_y_sin_pisar_la_moneda():
    s = BOLA.read_text(encoding="utf-8")
    lado, res = _num("LADO_CUBO", s), _num("RES_CARA_CUBO", s)
    assert 0.9 * 1.4 <= lado <= 0.9 * 1.6, "un 40-60 % más que el 0,9 de antes"
    assert res >= 1024
    assert "RoundedBoxGeometry(LADO_CUBO, LADO_CUBO, LADO_CUBO" in s and "cubo.position.y = CENTRO_CUBO" in s
    # 24/10 tarde: «demasiado bajos los palitos». Todo cuelga del tramo de poste a la vista bajo el cubo, que en 5.90
    # era 2,13 m: ahora entre +20 % («media») y +40 % («alta»), nunca el 1,5 aplastado de 5.92.0.
    tramo, hueco = _num("TRAMO_POSTE", s), _num("HUECO_CUBO_MONEDA", s)
    assert 2.13 * 1.15 <= tramo <= 2.13 * 1.45
    assert "CENTRO_CUBO = ALTO_PEANA + TRAMO_POSTE + MEDIA_CUBO" in s
    assert "CENTRO_MONEDA = CENTRO_CUBO + MEDIA_CUBO + HUECO_CUBO_MONEDA + RADIO_MONEDA + CANTO_MONEDA" in s
    # El poste llega a la moneda (tramo visible también entre cubo y moneda) y la imagen crece con el nodo.
    assert "CylinderGeometry(0.08, 0.1, ALTO_POSTE" in s and "ALTO_POSTE = CENTRO_MONEDA - RADIO_MONEDA / 2" in s
    assert "export const ALTO_BOLA_PX = Math.round(" in s
    # En pantalla (cámara a 32°) la esquina de atrás del cubo sube y la moneda se acorta: el canto de la moneda queda
    # por encima de la arista del cubo, con poste a la vista entre los dos.
    fi = math.radians(32)
    media = lado / 2 * (math.cos(0.12) + math.sin(0.12) * math.sqrt(2))
    cubo_arriba = 1.076  # silueta del cubo girado, en pantalla, sobre su centro (para lado 1,3)
    hueco_pantalla = (media + hueco) * math.cos(fi) - cubo_arriba * lado / 1.3
    assert hueco_pantalla > 0.1
    # El check de hecho, en el canto a la derecha: abajo del todo pisaba el cubo; arriba tapaba el número.
    assert "chapa.position.set(RADIO_MONEDA * 0.85, -RADIO_MONEDA * 0.5, 0.2)" in s
