# -*- coding: utf-8 -*-
"""24/11/2026 (Óscar: «que no se muevan cuando no tienen que moverse»; poca cobertura con muchos jugadores; hojas sin desenfoque).

1. Tu MUÑECO va con las lecturas crudas aceptadas por FiltroGps (`lecturasAceptadas`), suavizadas sólo para dibujar
   (`SuavizadoPropio`: alfa-beta + parado con histéresis de 2 × la precisión); el juego (tarjeta, brújula, abrir el nodo) sigue
   con el ancla de FiltroGps, sin cambios. Lecturas de más de 50 m no lo mueven. El clip va con la velocidad del filtro.
2. Un compañero sin señal más de 95 s NO se funde al volver: se pone al día deslizándose (como mucho ~5 m/s, clip de andar);
   sólo se funde lo que a pie no se hace (más de 3,2 m/s desde su fix anterior, o más de 2 km).
3. Las hojas y velos a pantalla completa ya no desenfocan: velo plano del tema algo más tupido.
Lógica en Node (tests/js/mapa_estable_24_11.cjs); medido en el banco de movimiento y en el navegador (scratchpad).
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
    p = subprocess.run([node, str(RAIZ / "tests" / "js" / "mapa_estable_24_11.cjs")], capture_output=True, text=True,
                       encoding="utf-8", timeout=180, cwd=str(RAIZ))
    assert p.returncode == 0, p.stderr[-2000:]
    return json.loads(p.stdout)


def leer(rel):
    return (SRC / rel).read_text(encoding="utf-8-sig")


def test_parado_con_ruido_tu_muneco_no_se_mueve(d):
    assert d["quieto"] == {"movidas": 0, "maxM": 0, "velocidad": 0}, d["quieto"]


def test_andando_con_ruido_sigue_sin_pararse_y_cerca(d):
    assert d["andar3"]["paradas"] == 0 and d["andar3"]["lagMaxM"] <= 3, d["andar3"]
    assert d["andar8"]["paradas"] == 0 and d["andar8"]["lagMaxM"] <= 6, d["andar8"]
    assert d["prueba"] == 30, "en modo prueba (precisión <= 2 m) pasa tal cual"


def test_tras_un_corte_se_ponen_al_dia_sin_fundidos(d):
    c = d["corte"]
    assert c["fundidosALaVez"] == 0 and c["velDibujoMax"] <= 5.5 and c["clipMax"] <= 2.4, c
    assert c["imposibleSeFunde"] == 0, "300 m en 30 s sí se funde"


def test_el_juego_sigue_con_filtro_gps_y_el_muneco_con_las_crudas():
    g = (SRC / "hooks" / "gpsDecisiones.ts").read_text(encoding="utf-8-sig")
    assert "for (const f of lecturasAceptadas) f(l)\r\n    return this.anclas.fijar('yo', l, l.precision)" in g or \
        "for (const f of lecturasAceptadas) f(l)\n    return this.anclas.fijar('yo', l, l.precision)" in g
    m = leer("components/MapSurfaceGL.tsx")
    assert "const PRECISION_MAX_DIBUJO_M = 50" in m and "lecturasAceptadas.add(alLeer)" in m and "lecturasAceptadas.delete(alLeer)" in m
    assert "if (debugSimulation || performance.now() - crudaEnRef.current > CRUDA_VIGENTE_MS)" in m
    assert "velocidad: fuente.velocidadReal(CLAVE_YO, ahora)" in m
    f = leer("posicion/fuentePosicion.ts")
    assert "alcanceTrasPausa: true," in f and "c.suave ??= new SuavizadoPropio()" in f


def test_las_hojas_no_desenfocan():
    for rel in ("SwipeableSheet.tsx", "InteractionSheet.tsx", "StoryModal.tsx", "FieldCameraCapture.tsx", "FieldPrepPanel.tsx"):
        t = leer("components/" + rel)
        assert "blur(1" not in t, rel
    assert "background: 'rgba(var(--theme-ink-deep), .8)'," in leer("components/SwipeableSheet.tsx")
    assert "backdrop-filter" not in leer("components/UseItemOverlay.tsx")
