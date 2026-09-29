# -*- coding: utf-8 -*-
"""«Mapa mudo»: o móbil sabe se chegou sen saber onde está o sitio.

O móbil só ten o círculo difuso (150 m ou máis). Antes «chegar» era estar dentro
dese círculo, así que o nodo completábase a 250 m do punto real. Agora o
servidor manda, en vez do punto, as celdas dunha cuadrícula que cobren o radio
REAL, cada unha como hash salgado; o móbil pasa a súa posición a celda, hashea e
mira se está no conxunto. Funciona sen cobertura. Trade-off documentado en
`mapa_mudo_verificador` (mision.py): mesmo nivel de defensa que o hash das
respostas; a barreira de verdade é a revisión das mostras de GPS no servidor.

Aquí móntase en Python a MESMA conta que fai o móbil (utils/mapaMudo.ts) para
comprobar que un punto cadra e que outro a 200 m non.
"""
import hashlib
import json
import math
import os
import tempfile

os.environ.setdefault("ADMIN_PASS", "pytest_admin_password")
os.environ.setdefault("SAGA_DATA_DIR", tempfile.mkdtemp(prefix="saga-test-mm-chegada-"))

from backend.app.runtime.core_engine import normalize_stage  # noqa: E402
from backend.app.runtime.mision import (  # noqa: E402
    MAPA_MUDO_CELDA_M,
    fuzzy_search_circle,
    mapa_mudo_hash_celda,
    mapa_mudo_verificador,
    project_stage_for_player,
)
from ruta_de_proba import LAT_MAPA_MUDO, LON_MAPA_MUDO, ruta_de_seis_nodos  # noqa: E402

METROS_POR_GRAO = 111320.0


def _nodo():
    return normalize_stage(ruta_de_seis_nodos()[4])


def _chegou_como_o_movil(pos_lat, pos_lon, margen_m, origen, verificador):
    """A conta de `haLlegadoAlMapaMudo` (mapaMudo.ts), en Python."""
    celda = verificador["celda_m"]
    conxunto = set(verificador["hashes"])
    dy = (pos_lat - origen["lat"]) * METROS_POR_GRAO
    dx = (pos_lon - origen["lon"]) * METROS_POR_GRAO * max(0.2, math.cos(math.radians(origen["lat"])))
    for i in range(math.floor((dx - margen_m) / celda), math.floor((dx + margen_m) / celda) + 1):
        for j in range(math.floor((dy - margen_m) / celda), math.floor((dy + margen_m) / celda) + 1):
            cx = min(max(dx, i * celda), (i + 1) * celda)
            cy = min(max(dy, j * celda), (j + 1) * celda)
            if math.hypot(dx - cx, dy - cy) > margen_m:
                continue
            if mapa_mudo_hash_celda(verificador["sal"], i, j) in conxunto:
                return True
    return False


def _desprazar(metros_norte, metros_leste):
    return (
        LAT_MAPA_MUDO + metros_norte / METROS_POR_GRAO,
        LON_MAPA_MUDO + metros_leste / (METROS_POR_GRAO * math.cos(math.radians(LAT_MAPA_MUDO))),
    )


def _proxeccion():
    nodo = project_stage_for_player(ruta_de_seis_nodos()[4], include_runtime=True, player_id="xogador")
    verificador = nodo["config"]["arrival"]
    origen = {"lat": nodo["lat"], "lon": nodo["lon"]}
    return nodo, verificador, origen


def test_o_paquete_leva_o_verificador_e_nada_do_punto_real():
    nodo, verificador, _ = _proxeccion()

    assert verificador["celda_m"] == MAPA_MUDO_CELDA_M
    assert 1 <= len(verificador["hashes"]) <= 400
    assert nodo["minigame"]["config"]["arrival"] == verificador, "tamén na config do minixogo"

    def numeros(valor):
        if isinstance(valor, dict):
            for hijo in valor.values():
                yield from numeros(hijo)
        elif isinstance(valor, list):
            for hijo in valor:
                yield from numeros(hijo)
        elif isinstance(valor, float):
            yield valor

    # Ningún número do paquete é o punto real (nin a 1 m dun deles).
    for numero in numeros(nodo):
        assert abs(numero - LAT_MAPA_MUDO) > 1e-5 and abs(numero - LON_MAPA_MUDO) > 1e-5
    # Os hashes non son coordenadas nin índices lexibles.
    assert all(len(h) == 16 and all(c in "0123456789abcdef" for c in h) for h in verificador["hashes"])


def test_no_punto_real_o_movil_chega_e_a_200_m_non():
    _, verificador, origen = _proxeccion()

    lat, lon = _desprazar(0, 0)
    assert _chegou_como_o_movil(lat, lon, 0, origen, verificador)

    # Dentro do radio real (20 m), medio radio para o norte.
    lat, lon = _desprazar(10, 0)
    assert _chegou_como_o_movil(lat, lon, 0, origen, verificador)

    # O que antes completaba o nodo: estar dentro do círculo difuso, a 200 m.
    lat, lon = _desprazar(200, 0)
    assert not _chegou_como_o_movil(lat, lon, 0, origen, verificador)
    lat, lon = _desprazar(0, -200)
    assert not _chegou_como_o_movil(lat, lon, 0, origen, verificador)


def test_a_precision_do_gps_perdoase_igual_que_nun_nodo_normal():
    _, verificador, origen = _proxeccion()

    # 45 m ao norte: fóra do radio (20 m) pero cun GPS de ±35 m cadra.
    lat, lon = _desprazar(45, 0)
    assert not _chegou_como_o_movil(lat, lon, 0, origen, verificador)
    assert _chegou_como_o_movil(lat, lon, 35, origen, verificador)


def test_o_centro_difuso_do_paquete_e_o_mesmo_que_usa_o_verificador():
    nodo = normalize_stage(ruta_de_seis_nodos()[4])
    circulo = fuzzy_search_circle(nodo["id"], LAT_MAPA_MUDO, LON_MAPA_MUDO, 250)
    verificador = mapa_mudo_verificador(nodo, circulo["lat"], circulo["lon"])
    assert verificador == _proxeccion()[1]


def test_o_hash_e_sha256_recortado_e_cadra_co_que_fai_o_movil():
    """sha256Hex(`${sal}:${i}:${j}`).slice(0, 16), en utils/mapaMudo.ts."""
    esperado = hashlib.sha256(b"abc123:-4:7").hexdigest()[:16]
    assert mapa_mudo_hash_celda("abc123", -4, 7) == esperado


def test_un_mapa_mudo_xa_completado_amosa_o_punto_real_e_non_leva_verificador():
    nodo = project_stage_for_player(
        ruta_de_seis_nodos()[4], include_runtime=True, completed=True, player_id="xogador"
    )
    assert nodo["kind"] == "checkpoint"
    assert "arrival" not in json.dumps(nodo)
