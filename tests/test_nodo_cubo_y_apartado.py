# -*- coding: utf-8 -*-
"""24/10: el cubo del icono del nodo, más grande y legible, y el avatar que se aparta del poste (variante avA).

* 23/11: el apartado del poste ya no es de la capa de cuerpos sino de la fuente de posición (ver test_posicion_fuente.py).
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


def test_la_capa_usa_el_apartado_solo_para_el_dibujo():
    s = CAPA.read_text(encoding="utf-8")
    # 23/11: la capa NO aparta: pinta donde dice la fuente de posición (`dibujo`). El apartado (geográfico, en metros) vive en
    # posicion/fuentePosicion.ts (tests/test_posicion_fuente.py).
    assert "apartarDelPoste" not in s and "const mc = real" in s
    # La velocidad se mide con el punto real: apartarse no puede parecer que anda.
    # 20/11: y con SU escala (la `m` del punto apartado cambia con la latitud del apartado e inventaba metros).
    assert "sitioReal = j.real ? maplibregl.MercatorCoordinate.fromLngLat([j.real.lon, j.real.lat]) : real" in s
    assert "anadirMuestra(e.muestras, { t: ctx.ahora, x: sitioReal.x / mReal, y: sitioReal.y / mReal })" in s


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
