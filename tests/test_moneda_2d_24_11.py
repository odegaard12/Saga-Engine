# -*- coding: utf-8 -*-
"""24/11/2026 (Óscar, tras 6.12.18): «en 2D los retratos ya no esquivan la moneda del nodo; que la esquiven, pero debes hacerlo bien».

Al quitar el racimo de la vista 2D (`planDeRetratos`), la fuente sólo apartaba del disco de 5 m del poste, y en 2D la moneda
mide ~26 m de suelo a z17,5. Ahora, en 2D, la moneda es un obstáculo más de la relajación de las personas, del tamaño con que se
ve (moneda + retrato + 6 px, en metros a este zoom); en 3D no cuenta, y el fundido de vista la mete y la saca poco a poco.

Lógica en Node (tests/js/moneda_2d_24_11.cjs) y estáticos del camino. Medido en el navegador: scratchpad moneda-2d (moneda.mjs).
"""
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
    if not node or not (RAIZ / "frontend" / "node_modules" / "typescript").exists():
        pytest.skip("sin node o sin frontend/node_modules")
    p = subprocess.run([node, str(RAIZ / "tests" / "js" / "moneda_2d_24_11.cjs")], capture_output=True, text=True,
                       encoding="utf-8", timeout=180, cwd=str(RAIZ))
    assert p.returncode == 0, p.stderr[-2000:]
    return json.loads(p.stdout)


def leer(rel):
    return (SRC / rel).read_text(encoding="utf-8-sig")


# ---------------------------------------------------------------- 1. lógica

def test_nadie_tapa_una_moneda_y_se_aparta_lo_justo(d):
    u = d["uno"]
    # 4 estados × 8 zooms (z16-z19,5) × 8 distancias × 3 rumbos: el hueco con el canto de la moneda es el margen (6 px).
    assert u["casos"] == 768 and u["margen"] == 6, u
    assert u["peorHuecoPx"] >= u["margen"] - 0.05, u
    assert all(v >= 5.95 for v in u["porZoom"].values()), u["porZoom"]
    # Quien no la pisa, quieto; quien la pisa, sólo hasta su borde (hacia fuera); tú nunca.
    assert u["quietosMovidos"] == 0 and u["peorExcesoM"] <= 0.01 and u["yoMovido"] == 0, u


def test_con_mucha_gente_y_monedas_cerca_ni_monedas_ni_retratos_se_tapan(d):
    m = d["muchos"]
    assert m["casos"] == 32 and m["yoMovido"] == 0, m
    assert m["peorHuecoMonedaPx"] >= 5.5, m
    assert m["peorHuecoRetratosPx"] >= 0, m


def test_monedas_que_se_pisan_entre_si_no_atrapan_a_nadie(d):
    # De lejos (z16-z17,5) las monedas cercanas se pisan en pantalla: la gente sale de la unión, no rebota dentro.
    p = d["pegadas"]
    assert p["casos"] == 14 and p["peorHuecoMonedaPx"] >= 5.95, p
    # Y sin pisarse entre ellos (con tú lejos y tú encima del nodo en juego): la salida busca hueco también entre la gente.
    assert p["peorHuecoRetratosPx"] >= 0, p


def test_tu_encima_de_la_moneda_no_te_mueves(d):
    t = d["tuEncima"]
    assert t["casos"] == 24 and t["yoMovido"] == 0, t
    assert t["peorHuecoMonedaPx"] >= 5.95 and t["peorHuecoRetratosPx"] >= 0, t


def test_no_depende_del_orden_ni_cambia_el_3d(d):
    assert d["orden"] == {"casos": 200, "distintos": 0}
    assert d["tresD"]["distintos"] == 0 and d["tresD"]["casos"] == 24, d["tresD"]


def test_lejos_nadie_se_aparta_y_entra_con_el_zoom(d):
    lj = d["lejos"]
    assert lj["mpp14"] == 0 and lj["mpp15"] == 0 and lj["mediaEn155"] == 0.5 and lj["enteraEn16"] == 1, lj


def test_zoom_y_cambio_de_vista_sin_saltos(d):
    c = d["continuo"]
    # Pellizco z15 -> z19,5 -> z15 en 3 s y el fundido 2D <-> 3D de 250 ms: unos píxeles por fotograma, nunca un salto.
    assert c["pellizcoPeorPasoPx"] <= 8 and c["fundidoPeorPasoPx"] <= 4 and c["objetivoPorMilesimaPx"] <= 0.5, c
    assert c["yoMovido"] == 0, c


def test_coste_por_dibujo(d):
    c = d["coste"]
    # 15 jugadores (11 en tres nodos) y 20 nodos, los dos mundos (2D y 3D) por dibujo. En Node con las pruebas en paralelo
    # oscila (0,5-3 ms); en Chromium, ~0,8 ms todo `__sagaPos` (scratchpad moneda-2d). El tope sólo caza un bucle desbocado.
    assert c["msPorFotogramaCon"] < 8 and c["msPorFotogramaSin"] < 5, c


# ---------------------------------------------------------------- 2. estáticos del camino

def test_la_moneda_se_mide_con_la_separacion_y_cuenta_solo_en_2d():
    m = leer("components/MapSurfaceGL.tsx")
    # Medida en el mismo sitio que la separación (antes de cada cálculo de la fuente) y sin crear nada.
    assert "medirMonedas(mapa.getZoom(), lat ?? mapa.getCenter().lat, fuente.monedas)" in m
    assert m.count("ponerSeparacion(") == 4
    # Peso: sólo con las monedas puestas y con el retrato a la vista (1 − mezcla del cuerpo).
    # 24/11: también tu retrato ('al-lado'); con las alternativas, tú no cuentas.
    assert "if (!monedasRef.current || (id === CLAVE_YO && TU_SOBRE_LA_MONEDA !== 'al-lado')) return 0" in m
    assert "return 1 - (capa ? capa.mezcla(id) : enTresDRef.current.has(id) ? 1 : 0)" in m
    # El fundido de vista recoloca los retratos.
    assert "sincronizarTresDRef.current()\r\n            movilRef.current?.arrancar()" in m or "sincronizarTresDRef.current()\n            movilRef.current?.arrancar()" in m
    # Cada poste lleva su moneda (radio con canto y chapa) y la del nodo en juego el mínimo del toque.
    assert "monedaPx: radioDeMonedaPx(estadoMoneda(indice))," in m and "toquePx: indice === currentLevel ? 36 : 0," in m
    assert "monedaPx: n.monedaPx, toquePx: n.toquePx" in m
    # Tú sobre la moneda: se elige aquí (24/11, Óscar: al lado, como los demás).
    assert "const TU_SOBRE_LA_MONEDA: 'al-lado' | 'encima' | 'translucido' = 'al-lado'" in m


def test_la_fuente_sigue_siendo_pura_y_sin_basura_por_pasada():
    s = leer("posicion/fuentePosicion.ts")
    for prohibido in ("maplibre", "document.", "window.", "getZoom", "getBearing", "getPitch", "project(", "unproject("):
        assert prohibido not in s, prohibido
    cuerpo = s.split("function separarPersonas(")[1].split("\ntype Cadena")[0]
    bucle = cuerpo.split("for (let pasada = 0;")[1].split("if (!algo) break")[0]
    assert "{ e:" not in bucle and "=> ({" not in bucle, "la relajación no crea objetos en cada pasada"
    assert "const HOLGURA_M = 0.001" in s
    # Quien sigue encima de una moneda sale al punto libre más cercano de la unión (hacia fuera de una o donde se cortan dos).
    assert "const salidaMasCercana = (g: " in s and "if (!s.sitio || s.d > tope) s = salidaMasCercana(g, duros)" in s and "if (tuyo && sep > 0) duros.push({ ...tuyo, r: sep })" in s
    assert "export function radioDeMonedaM(" in s and "pesoMoneda: ((id: string) => number) | null = null" in s


def test_radios_de_las_monedas_son_los_del_dibujo():
    j = leer("components/jugadoresEnMapa.ts")
    i = leer("components/mapa/iconos.ts")
    # Los radios de `dibujarMoneda` (21, 18, 15,5) y su chapa ✓ (a 0,72·r, radio 7): si cambia el dibujo, cambia aquí.
    assert "const r = estado === 'actual' ? 21 : estado === 'siguiente' ? 18 : 15.5" in i
    assert "const x = c + r * 0.72" in i and "ctx.arc(x, y, 7, 0, Math.PI * 2)" in i
    assert "return 15.5 * 0.72 * Math.SQRT2 + 7.75" in j and "export const MARGEN_MONEDA_PX = 6" in j
    # El retrato: aro de 25 px de 56 (retratoDeMapa.ts).
    assert "const R_EXTERIOR = 25" in leer("avatares/retratoDeMapa.ts")
