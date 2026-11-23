# -*- coding: utf-8 -*-
"""7/11/2026 (Óscar: «en 3D deben aparecer sí o sí los personajes; si no caben o se solapan, una foto en abanico»).

- 23/11: el abanico es SÓLO para quien no cabe en el anillo del poste (lo decide la fuente de posición: tests/test_posicion_fuente.py).
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
    # 23/11: quién va al abanico lo decide la fuente de posición (los que no caben en el anillo del poste), cada dibujo.
    assert "fuente.abanico(base.clave)" in mapa
