# -*- coding: utf-8 -*-
"""7/11/2026: lo que vio Óscar en el móvil.

1. Mapa 2D: los retratos de compañeros juntos se tapaban. Ahora se abren en corona medida en pantalla, con una línea
   fina a su sitio real; con más de 6 juntos, un icono con el número que se abre al tocar.
2. Tienda: el muñeco giraba y se balanceaba solo. Ahora quieto, salvo que lo gire el jugador.
3. Tienda lenta: con la caché llena no se pide nada a la red; lo que tarda es montar el estudio 3D (CPU).
"""
import json
import shutil
import subprocess
from pathlib import Path

import pytest

RAIZ = Path(__file__).resolve().parent.parent
SRC = RAIZ / "frontend" / "src" / "player"


def leer(relativo: str) -> str:
    return (SRC / relativo).read_text(encoding="utf-8-sig")


def test_los_retratos_juntos_se_abren_en_corona_sin_taparse():
    node = shutil.which("node")
    if not node:
        pytest.skip("sin node")
    p = subprocess.run([node, str(RAIZ / "tests" / "js" / "corona_7_11.cjs")], capture_output=True, text=True,
                       encoding="utf-8", timeout=120, cwd=str(RAIZ))
    assert p.returncode == 0, p.stderr[-2000:]
    d = json.loads(p.stdout)
    for z in ("z15", "z16", "z17", "z18"):
        assert d[z]["tipos"] == ["jugador"] * 4
        # 7/11 (4): compactos, casi tocándose (0,95 de retrato entre centros), pero sin taparse.
        assert d[z]["ancho"] * 0.9 <= d[z]["minimaPx"] <= d[z]["ancho"] * 1.1, (z, d[z])
        assert d[z]["lineas"] == 4  # las líneas existen, pero el mapa sólo las pinta de z19 en adelante
    # 11/11 (Óscar: «en 2D se ven 5-10 sin agrupar»): 10 juntos (y 11 contigo) se ven todos, en racimo y sin taparse.
    for vista, r in d["diez"].items():
        assert r["tipos"] == ["jugador"] * (11 if vista.endswith("contigo") else 10), (vista, r)
        assert r["minima"] >= 0.93 and r["ancho"] <= 3.5, (vista, r)
    assert d["muchos"] == [["grupo", 12]] and d["solo"] == [[0, 0]]


def test_el_mapa_usa_la_corona_con_retratos_y_pinta_las_lineas():
    m = leer("components/MapSurfaceGL.tsx")
    assert "const conRetratos = !tresD || zoomActual < ZOOM_MINIMO_AVATARES" in m
    assert "      cuerpos," in m and "inclinacion: mapaRef.current?.getPitch() ?? 0," in m
    # 11/11: desde z19 de verdad (`zoomActual` va redondeado a medios y desde 18,75 ya valía 19).
    assert "conRetratos && (mapaRef.current?.getZoom() ?? zoomActual) >= 19 ? lineasDeCorona(elementos) : COLECCION_VACIA" in m
    assert "id: CAPA_OTROS_LINEAS," in m and "type: 'line'," in m.split("id: CAPA_OTROS_LINEAS,", 1)[1][:80]


def test_la_tienda_no_mueve_el_muneco_sola():
    t = leer("avatares3d/mixamo/escenaTienda.ts")
    assert "const GIRO_AUTOMATICO = 0\n" in t
    assert "av.mixer.timeScale = av.gest.length ? 1 : 0" in t


def test_la_tienda_no_vuelve_a_pedir_a_la_red_lo_guardado():
    # Medido con la caché llena (tienda56.mjs): ningún .glb a la red; las caras, del service worker. Lo que tarda la
    # primera apertura es CPU (montar el estudio 3D), no la red: se queda documentado y sin precalentar (no mejoraba).
    t = leer("avatares3d/mixamo/escenaTienda.ts")
    assert "if (!personajeCargado(a.mx))" in t
    assert "precalentarTienda" not in t
