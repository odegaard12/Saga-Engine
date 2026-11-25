# -*- coding: utf-8 -*-
"""23/11/2026: UNA sola fuente de verdad de la posición de los jugadores (Óscar: «que se queden donde están, mueva la cámara
lo que mueva; yo siempre en mi posición real; las caras sin saltos; nada de teletransportes»).

Tres niveles (como en el informe de la auditoría):
1. Lógica pura en Node (tests/js/posicion_fuente.cjs, módulo `posicion/fuentePosicion.ts`): propiedades.
2. Navegador (scratchpad, `?depurar-mapa` + `window.__sagaPos()`): orbitar, panear, inclinar y hacer zoom con todos quietos.
3. Estáticos: lo que se borró no puede volver (cuadrante de la cámara, apartarDelPoste, conCorro...).
"""
import json
import shutil
import subprocess
from pathlib import Path

import pytest

RAIZ = Path(__file__).resolve().parent.parent
SRC = RAIZ / "frontend" / "src"


@pytest.fixture(scope="module")
def d():
    node = shutil.which("node")
    if not node or not (RAIZ / "frontend" / "node_modules" / "typescript").exists():
        pytest.skip("sin node o sin frontend/node_modules")
    p = subprocess.run([node, str(RAIZ / "tests" / "js" / "posicion_fuente.cjs")], capture_output=True, text=True,
                       encoding="utf-8", timeout=180, cwd=str(RAIZ))
    assert p.returncode == 0, p.stderr[-2000:]
    return json.loads(p.stdout)


# ---------------------------------------------------------------- 1. lógica

def test_el_dibujo_no_depende_del_orden_de_llegada(d):
    assert d["ordenDeLlegada"]["casos"] == 200 and d["ordenDeLlegada"]["distintos"] == 0
    assert d["quieto"]["igual"] is True, "asentado, el mismo dibujo en cualquier instante (la cámara ni es una entrada)"


def test_tu_dibujo_es_tu_real_y_el_apartado_tiene_tope_y_disco(d):
    w = d["mundo"]
    assert w["casos"] == 300 and w["yoMovido"] == 0, w
    assert w["maxApartado"] <= w["TOPE"] == 8, w
    # Sólo se aparta quien está dentro del disco del poste, y nadie queda pegado a otro ni a ti.
    assert w["fueraDelDisco"] == 0 and w["pegados"] == 0, w
    e = d["encimaDelPoste"]
    assert e["yoApartado"] == 0 and e["minAlYo"] >= 1.6 - 1e-6 and e["maxApartado"] <= 8, e


def test_un_id_lejano_no_mueve_a_nadie(d):
    l = d["lejano"]
    assert l["movidosPorLejano"] == 0, l
    # Quitar uno de los de junto al poste recoloca a los demás dentro del tope (animado en el mapa), no al otro lado del mapa.
    assert l["maxPorCercano"] <= 16, l


def test_si_llega_alguien_los_demas_se_animan_sin_saltar(d):
    # 66 ms por fotograma: como mucho 2 m (el apartado es una animación exponencial de ~0,6 s, nunca un salto de 8 m).
    assert 0 < d["llegaUnoCerca"]["maxPasoPorFotograma"] <= 2.0, d["llegaUnoCerca"]


def test_lo_que_no_cabe_va_al_abanico_y_nadie_pasa_del_tope(d):
    a = d["abanico"]
    assert a["enAbanico"] > 0 and a["abanicosDistintos"] == 1 and a["maxApartado"] <= 8, a


def test_el_jitter_dentro_de_la_banda_no_mueve_a_nadie(d):
    # Precisión 8, ruido de ±10 m, parado 30 min: banda muerta max(precisión, 12 m). Antes: 19 saltos de hasta 18 m.
    assert d["jitter"] == {"cambios": 0, "deriva": 0}, d["jitter"]


def test_llegadas_tardias_se_deslizan_al_ritmo_del_latido_sin_correr(d):
    t = d["tarde"]
    assert t["velocidadMaxMps"] <= 3.2 + 1e-6, t  # nunca más deprisa que un trote
    assert t["llegaEnMs"] >= 30000, t              # 25 m al ritmo de un latido de 30 s (antes, 8 s a 3 m/s y parado)
    assert d["salto"]["sinDeslizar"] is True       # sólo más de 300 m es un salto
    assert d["salto"]["fundido"] == [0, 0.5, 1, 1] and d["salto"]["sinFundirSiNoSalta"] == 1  # …y con un fundido corto


def test_cruzar_z16_no_hace_saltar_a_nadie(d):
    assert d["cruceZ16"]["peorSaltoM"] <= 1.0, d["cruceZ16"]  # antes: hasta ~185 m (centroide del grupo a su sitio)
    assert d["cruceZ16"]["fundido"] == [1, 0.5, 0]


# ---------------------------------------------------------------- 3. estáticos

def _fuentes():
    for p in SRC.rglob("*.ts*"):
        if p.suffix in (".ts", ".tsx"):
            yield p, p.read_text(encoding="utf-8-sig")


def test_lo_borrado_no_vuelve():
    for p, s in _fuentes():
        for palabra in ("cuadranteDeLaCamara", "apartarDelPoste", "conCorro", "postesDeNodos", "corroSuave", "corroPropioRef",
                        "CLAVE_PROPIO_EN_PLAN", "ProyeccionDelMapa", "rumboSuave", "lejosDelPlanRef"):
            assert palabra not in s, f"{palabra} reapareció en {p.relative_to(RAIZ)}"
    assert not (SRC / "player" / "avatares3d" / "mixamo" / "apartarDelNodo.ts").exists()


def test_la_capa_y_el_mapa_solo_leen_dibujo():
    capa = (SRC / "player" / "avatares3d" / "mixamo" / "capaAvatares.ts").read_text(encoding="utf-8-sig")
    assert "const mc = real" in capa
    mapa = (SRC / "player" / "components" / "MapSurfaceGL.tsx").read_text(encoding="utf-8-sig")
    # 24/11: tu RETRATO en 2D sale de la moneda (`retratoPropio`); tu cuerpo, la cámara y tu aro 3D siguen en tu real.
    assert "fuente.dibujo(base.clave, ahora)" in mapa
    assert "const sitioPropio = (TU_SOBRE_LA_MONEDA === 'al-lado' ? fuente.retratoPropio(CLAVE_YO, ahora) : null) ?? posYo" in mapa
    assert "ventana.__sagaPos" in mapa and "has('depurar-mapa')" in mapa


def test_la_fuente_es_pura():
    s = (SRC / "player" / "posicion" / "fuentePosicion.ts").read_text(encoding="utf-8-sig")
    for prohibido in ("maplibre", "document.", "window.", "getZoom", "getBearing", "getPitch", "project(", "unproject("):
        assert prohibido not in s, prohibido
    assert "export function apartadosDelMundo(" in s and "export function posicionesDelMundo(" in s
