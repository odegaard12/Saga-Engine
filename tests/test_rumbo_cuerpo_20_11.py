# -*- coding: utf-8 -*-
"""20/11/2026 (Óscar): «al girar la cámara los personajes giran y andan sin moverse». El cuerpo mira como el móvil y anda sólo si se mueve."""
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
    if not node:
        pytest.skip("sin node")
    p = subprocess.run([node, str(RAIZ / "tests" / "js" / "rumbo_cuerpo_20_11.cjs")], capture_output=True, text=True,
                       encoding="utf-8", timeout=120, cwd=str(RAIZ))
    assert p.returncode == 0, p.stderr[-2000:]
    return json.loads(p.stdout)


def test_andar_solo_con_movimiento_real(d):
    assert d["quieto"]["andando"] is False and d["ruido"]["andando"] is False
    assert d["este"] == {"andando": True, "rumbo": 90}
    assert d["norte"] == {"andando": True, "rumbo": 0}


def test_rumbo_del_movil_no_de_la_camara(d):
    assert d["quietoBrujulaSO"] == 225 and set(d["camaraNoEntra"]) == {225}
    assert d["andandoEste"] == 90
    assert d["sinBrujulaConGps"] == 120 and d["sinNada_ultimo"] == 33 and d["sinNadaDeNada"] is None
    assert abs(d["reposoNorte"] - 3.14159265) < 1e-6


def test_brujula_sin_saltos(d):
    assert d["cruceSinVuelta"] and d["zonaMuerta"] == 100 and d["caduca"] is None
    assert d["iOS"] == 225 and d["android"] == 225 and d["sinDato"] is None
    assert d["latidoQuieto"] == 225 and d["latidoAndando"] == 90


def test_codigo_fuente():
    capa = (SRC / "avatares3d" / "mixamo" / "capaAvatares.ts").read_text(encoding="utf-8")
    # 20/11: sólo queda el saludo al tocar (mira a la cámara ~2 s); el cartel plano ya usa el rumbo del mundo (orientacionDelCartel)
    assert "av.goal = -ctx.rumbo" in capa and capa.count("-ctx.rumbo") == 1
    assert "sitioReal" in capa and "RUMBO_DE_REPOSO" in capa
    assert "let nodosEnCapa = false" in (SRC / "components" / "nodosTresD.ts").read_text(encoding="utf-8")


def test_fila_de_temas_en_rejilla_y_permiso_de_brujula_reutilizado():
    hud = (SRC / "components" / "PlayerHud.tsx").read_text(encoding="utf-8")
    assert "gridTemplateColumns: 'repeat(2, minmax(0, 1fr))'" in hud and "minHeight: 44" in hud and "overflowWrap: 'anywhere'" in hud
    assert "flex: '1 1 0'," not in hud.split("data-saga-tema-jugador")[1].split("elegirTemaDelJugador(id)")[0]
    # La brújula del cuerpo reutiliza el permiso de orientación que ya pide el flujo de permisos (un gesto, recordado).
    perm = (SRC / "hooks" / "usePermisos.ts").read_text(encoding="utf-8")
    assert "Orientacion.requestPermission()" in perm and "recordar(CLAVE_MOVIMIENTO)" in perm and "alPrimerToque" in perm
    br = (SRC / "avatares" / "rumboPropio.ts").read_text(encoding="utf-8")
    assert "addEventListener('deviceorientationabsolute'" in br and "addEventListener('deviceorientation'" in br


def test_ahorro_no_cambia_la_semantica_de_los_cuerpos():
    capa = (SRC / "avatares3d" / "mixamo" / "capaAvatares.ts").read_text(encoding="utf-8")
    # El apartado junto al poste es geográfico (rumbo 0), no el de la cámara: girar el mapa no hace dar vueltas a nadie.
    assert "apartarDelPoste({ x: real.x * pxMapa, y: real.y * pxMapa }, postes, 0, e.apartado)" in capa
    # El ahorro reduce fotogramas, no cuerpos: el tope en ahorro es el de 'media' (el cartel mira a la cámara).
    assert "elegirEnTresD(cands, enAhorro && calidad === 'baja' ? 'media' : calidad)" in capa
