# -*- coding: utf-8 -*-
"""7/11/2026: los nodos (Óscar eligió la A).

1. En 2D, o con el mapa sin inclinar, el nodo es sólo su moneda con el número, sin poste ni peana; el estado va en el
   tamaño (actual con halo, siguiente normal, pendientes pequeños y apagados, hechos grises con ✓).
2. Con el mapa inclinado, los nodos 3D de siempre. El cambio va por un umbral de inclinación con histéresis: un solo
   cambio de diseño al cruzarlo, sin fundidos que repinten el terreno.
3. Los nodos cercanos o apilados se abren en arco compacto alrededor de su punto, sin taparse y a ~1 moneda como mucho.
4. Los retratos esquivan la moneda (2D) o el poste (3D) del nodo en su sitio ya repartido.
5. Mapa mudo fuera del reparto; el aro de entrada, en el punto real; se abre tocando su moneda.
"""
import json
import shutil
import subprocess
from pathlib import Path

import pytest
from fuente_del_mapa import fuente_del_mapa  # noqa: E402

RAIZ = Path(__file__).resolve().parent.parent
COMP = RAIZ / "frontend" / "src" / "player" / "components"


def mapa() -> str:
    return fuente_del_mapa()


def simulacion() -> dict:
    node = shutil.which("node")
    if not node:
        pytest.skip("sin node")
    p = subprocess.run([node, str(RAIZ / "tests" / "js" / "reparto_nodos_7_11.cjs")], capture_output=True, text=True,
                       encoding="utf-8", timeout=120, cwd=str(RAIZ))
    assert p.returncode == 0, p.stderr[-2000:]
    return json.loads(p.stdout)


def test_en_2d_el_nodo_es_su_moneda_sin_poste_y_el_estado_va_en_el_tamano():
    m = mapa()
    assert "function dibujarMoneda(" in m
    cuerpo = m.split("function dibujarMoneda(", 1)[1][:2900]
    assert "const r = estado === 'actual' ? 21 : estado === 'siguiente' ? 18 : 15.5" in cuerpo
    assert "ctx.globalAlpha = estado === 'pendiente' ? 0.82 : 1" in cuerpo
    assert "if (hecho) {" in cuerpo and "lineTo(x + 3.4, y - 2.6)" in cuerpo  # la chapa ✓
    assert "icono: `moneda-${indice + 1}-${estadoMoneda(indice)}-${tipoDelNodo(nodo)}`," in m
    # 20/11: la moneda 2D va en su capa (centrada) y el poste en la suya; el modo sólo cambia opacidades.
    assert "ponerDiseno(vivo, CAPA_NODOS_ICONOS, 'icon-anchor', 'bottom')" in m and "id: CAPA_NODOS_MONEDAS_2D," in m
    assert "ponerDiseno(vivo, CAPA_NODOS_VOLUMEN, 'visibility', 'none')" in m  # sin disco de suelo


def test_moneda_o_poste_cambia_al_cruzar_el_umbral_de_inclinacion_sin_fundido():
    m = mapa()
    assert "const enTresD = !monedasRef.current" in m
    assert "const ahora = !tresDRef.current || mapa.getPitch() < (antes ? 12 : 8)" in m
    assert "mapa.on('pitch', alInclinar)" in m and "if (ahora === antes) return" in m


def test_los_nodos_cercanos_se_abren_en_arco_sin_taparse_y_cerca_de_su_sitio():
    d = simulacion()
    assert d["casos"] == 144 and d["solapes"] == 0, d["peores"]
    assert d["lejos"] == 0 and d["maxDist"] <= 1.1, d
    m = mapa()
    assert "debajoDelActual" not in m  # los apilados ya no se esconden
    assert "const alGirarLaVista = () => setGiroDeLaVista((v) => v + 1)" in m  # se reparte TODO al soltar el mapa
    assert "mapa.on('moveend', alGirarLaVista)" in m


def test_los_retratos_esquivan_la_moneda_del_nodo_en_su_sitio_repartido():
    d = simulacion()
    assert d["casosRetrato"] == 72 and d["tapanMoneda"] == 0
    m = mapa()
    # 24/11: el mapa ya no usa el racimo de la vista 2D (`planDeRetratos`, que sigue probado aquí como función pura): en las
    # dos vistas manda la fuente de posición (disco del poste de 5 m y tope de 8 m, y separación entre personas).
    assert "pintarNodosRef.current()" in m and "const plan = planDeJugadores(otrosAnclados, lejos ? zoomDeReparto(zoom) : ZOOM_DEL_REPARTO, { lejos, racimos: false })" in m
    # 21/11: los jugadores evitan los nodos donde quedan al zoom fijo del reparto (recolocar nodos al hacer zoom los movía).
    assert "repartirNodos(repartibles, ZOOM_DEL_REPARTO, 0, 0, false)" in m
    # 24/11 (moneda 2D): y cada poste lleva su moneda (test_moneda_2d_24_11.py).
    assert "postesRef.current = repartibles.map((n) => ({ ...(sitiosDelReparto.get(n.clave) ?? { lat: n.lat, lon: n.lon })," in m


def test_mapa_mudo_fuera_del_reparto_entrada_en_su_punto_y_se_toca_en_su_sitio():
    m = mapa()
    assert "const repartibles = base.filter((n) => !n.mudo)" in m
    assert "filter: ['all', ['==', ['get', 'entrada'], true], ['!=', ['get', 'mapaMudo'], true]]," in m
    assert "properties: { ...n.props, entrada: true }, geometry: { type: 'Point' as const, coordinates: [n.lon, n.lat] }" in m
    assert "if (Math.hypot(evento.point.x - punto.x, evento.point.y - punto.y) <= umbral || enSuMoneda) alNodo()" in m


def test_tu_retrato_no_se_mueve_ni_justo_en_el_nodo():
    # 23/11 (Óscar: «siempre me veo en mi posición real»): tu retrato, tu cuerpo y tu aro van en tu posición filtrada y son un
    # obstáculo fijo que los demás esquivan (antes tu retrato se apartaba de la moneda hasta decenas de metros).
    m = mapa()
    assert "propio: racimos ? propioAncla : null," not in m, "24/11: sin racimo en 2D; los demás te hacen sitio en la fuente"
    assert "const sitioPropio = (TU_SOBRE_LA_MONEDA === 'al-lado' ? fuente.retratoPropio(CLAVE_YO, ahora) : null) ?? posYo" in m and "coordinates: [sitioPropio.lon, sitioPropio.lat]" in m
    j = (COMP / "jugadoresEnMapa.ts").read_text(encoding="utf-8")
    assert "CLAVE_PROPIO_EN_PLAN" not in j
