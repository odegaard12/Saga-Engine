# -*- coding: utf-8 -*-
"""11/11/2026 (Óscar): «personajes 2D sin pico o halo, solamente su círculo con su foto, el mío que parpadee… y los
personajes juntos en fila no: en rombo o junto pero sin solaparse; en 3D y también en 2D».

- Juntos en el mismo punto (tú + compañeros): racimo (2 lado a lado, 3 en triángulo, 4 en rombo, 5-7 en panal), nunca
  tres en línea si caben en menos, y sin montarse. En 2D (retratos) y en 3D (cuerpos).
- El retrato es sólo el círculo: sin punta, y su coordenada es el centro. Sin aro en el suelo ni aura con GPS.
- El tuyo late con un marcador del DOM y una animación CSS (no con `setPaintProperty`, que repinta el terreno).
Simulación en tests/js/racimo_11_11.cjs.
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
    p = subprocess.run([node, str(RAIZ / "tests" / "js" / "racimo_11_11.cjs")], capture_output=True, text=True,
                       encoding="utf-8", timeout=180, cwd=str(RAIZ))
    assert p.returncode == 0, p.stderr[-2000:]
    return json.loads(p.stdout)


def test_juntos_en_racimo_y_nunca_en_fila(datos):
    for vista, casos in datos["vistas"].items():
        for n, r in casos.items():
            total = int(n) + 1  # tú + n compañeros
            assert r["n"] == total, (vista, n, r)
            assert r["solapes"] == 0, (vista, n, r)
            # 3 y 4 (triángulo y rombo): nunca tres en una recta. De 5 a 7 (panal): como mucho una fila de 3.
            assert r["enFila"] <= (2 if total <= 4 else 3), (vista, n, r)
            # Compacto: nada de una ristra de más de ~2,6 de ancho ni una columna de más de dos filas y media.
            assert r["ancho"] <= 2.7 and r["alto"] <= 2.0, (vista, n, r)


def test_los_huecos_del_racimo_no_se_pisan(datos):
    for n, r in datos["racimo"].items():
        assert r["n"] == int(n) and r["min"] >= 0.999, (n, r)
        assert r["radio"] <= 1.1, (n, r)


def test_el_retrato_es_solo_el_circulo():
    retrato = (SRC / "avatares" / "retratoDeMapa.ts").read_text(encoding="utf-8")
    # Sin punta: el lienzo es cuadrado y la coordenada cae en el centro del círculo.
    assert "export const ALTO_RETRATO_PX = 56" in retrato
    assert "const CY = Y_PUNTA" in retrato
    assert "ctx.lineTo(CX, Y_PUNTA" not in retrato
    mapa = (SRC / "components" / "MapSurfaceGL.tsx").read_text(encoding="utf-8")
    # Ni aro en el suelo bajo el retrato ni aura con GPS (sólo la del modo prueba).
    assert "suelo: `pjs-" not in mapa and "propiedades.suelo" not in mapa
    assert "filter: ['==', ['get', 'aura'], 'debug']" in mapa


def test_el_tuyo_late_sin_repintar_el_mapa():
    mapa = (SRC / "components" / "MapSurfaceGL.tsx").read_text(encoding="utf-8")
    css = (SRC / "components" / "map-surface.css").read_text(encoding="utf-8")
    assert "saga-yo-pulso" in mapa and "new maplibregl.Marker" in mapa
    assert "@keyframes saga-yo-pulso" in css
    # Con «menos movimiento», sin animación (aro fijo más marcado).
    bloque = css.split("@media (prefers-reduced-motion: reduce)")[-1]
    assert ".saga-yo-pulso" in bloque and "animation: none" in bloque
    # El color es el del jugador (currentColor), no uno escrito a mano.
    assert "currentColor" in css.split(".saga-yo-pulso > span")[1].split("}")[0]
