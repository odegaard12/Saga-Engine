# -*- coding: utf-8 -*-
"""7/11/2026 (Óscar: «en 3D deben aparecer sí o sí los personajes; si no caben o se solapan, una foto en abanico»).

- El abanico es SÓLO para quien no tiene sitio cerca del suyo sin tapar un nodo u otro jugador; tú nunca vas; por
  debajo de los cuerpos (2D, retratos) no existe. Los que quedan en el mapa no se tapan ni tapan nodos, y el abanico
  tampoco.
- Fuera del tope de cuerpos animados, imagen fija de su personaje (no retrato redondo).
- El gobernador de calidad vuelve a subir (un escalón, hasta su techo) tras un buen rato holgado.
Pantalla simulada en tests/js/abanico_7_11.cjs.
"""
import json
import shutil
import subprocess
from pathlib import Path

import pytest

RAIZ = Path(__file__).resolve().parent.parent
SRC = RAIZ / "frontend" / "src" / "player"


@pytest.fixture(scope="module")
def datos():
    node = shutil.which("node")
    if not node:
        pytest.skip("sin node")
    p = subprocess.run([node, str(RAIZ / "tests" / "js" / "abanico_7_11.cjs")], capture_output=True, text=True,
                       encoding="utf-8", timeout=180, cwd=str(RAIZ))
    assert p.returncode == 0, p.stderr[-2000:]
    return json.loads(p.stdout)


def test_abanico_solo_para_quien_no_cabe(datos):
    h = datos["holgados"]
    assert h["enAbanico"] == 0 and h["total"] == 5, h
    # 8/11 (Óscar: «si caben otros, ¿por qué ellos no?»): con hueco en pantalla, nadie al abanico.
    a = datos["apretados"]
    assert a["total"] == 31 and a["enAbanico"] == 0, a
    assert a["solapes"] == 0 and a["nodo"] == 0, a
    d = datos["desbordados"]
    # Ni con 150 en el mismo punto hace falta: el abanico queda de reserva (sin hueco en la pantalla).
    assert d["total"] == 151 and not d["propioEnAbanico"], d
    assert d["solapes"] == 0 and d["nodo"] == 0 and d["abanicoSobre"] == 0, d
    assert datos["sinCuerpos"] == 0


def test_gobernador_vuelve_a_subir(datos):
    g = datos["gobernador"]
    assert [c for _, c in g["baja"]] == ["media", "baja"], g
    # No sube mientras no pasen 30 s desde la última bajada…
    assert g["pronto"] == [], g
    # … y luego sube de uno en uno hasta donde arrancó.
    assert [c for _, c in g["luego"]] == ["media", "alta"] and g["final"] == "alta", g
    assert g["luego"][1][0] - g["luego"][0][0] >= 12, g
    assert datos["gobernadorTecho"] == 0 and datos["gobernadorFijado"] == 0
    assert datos["gobernadorTirones"] == []
    # 11/11: quien no aguanta el escalón de arriba no lo reintenta sin parar (la espera se duplica con cada bajada).
    assert datos["gobernadorVaiven"] <= 6, datos["gobernadorVaiven"]


def test_fuera_del_tope_imagen_fija_y_abanico_cableado():
    capa = (SRC / "avatares3d" / "mixamo" / "capaAvatares.ts").read_text(encoding="utf-8-sig")
    assert "for (const clave of sel.porTope)" in capa and "prepararFoto(e, ctx.renderer" in capa
    assert "ocultos.has(e.clave)" in capa and "gobernador.techo = c" in capa
    foto = (SRC / "avatares3d" / "mixamo" / "fotoDePersonaje.ts").read_text(encoding="utf-8-sig")
    assert "crearAvatarParaFoto" in foto and "fotos.get(clave)" in foto
    mapa = (SRC / "components" / "MapSurfaceGL.tsx").read_text(encoding="utf-8-sig")
    assert "ocultos: () => enAbanicoRef.current" in mapa and "abanicosRef.current.poner(" in mapa
    assert "filter((base) => !enAbanico.has(base.clave))" in mapa
