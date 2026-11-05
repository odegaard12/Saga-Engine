# -*- coding: utf-8 -*-
"""5/11/2026: las tres propuestas que aprobó Óscar tras el repaso de textos y 3D."""
import json
import shutil
import subprocess
from pathlib import Path

import pytest

RAIZ = Path(__file__).resolve().parent.parent
SRC = RAIZ / "frontend" / "src" / "player"


def leer(relativo: str) -> str:
    return (SRC / relativo).read_text(encoding="utf-8-sig")


def test_la_cabecera_del_juego_se_oculta_si_repite_el_titulo():
    node = shutil.which("node")
    if not node:
        pytest.skip("sin node")
    p = subprocess.run([node, str(RAIZ / "tests" / "js" / "cabecera_5_11.cjs")], capture_output=True, text=True,
                       encoding="utf-8", timeout=120, cwd=str(RAIZ))
    assert p.returncode == 0, p.stderr[-2000:]
    assert json.loads(p.stdout) == {"igual": True, "tildes": True, "distinto": False, "vacio": False}
    # Las tres pantallas con cabecera la usan; el hueco se queda para que la ficha de la derecha no se mueva.
    for f, uso in (
        ("minigames/families/motionChallenge/PulsoHierroRuntimeScreen.tsx", "{cabeceraRepetida(pulso.kicker, title) ? '' : pulso.kicker}"),
        ("minigames/families/motionChallenge/DinamoRuntimeScreen.tsx", "{cabeceraRepetida(tx.kicker, tx.titulo) ? '' : tx.kicker}"),
        ("minigames/families/bearingHunt/FarosRuntimeScreen.tsx", "{cabeceraRepetida(tx.kicker, tx.titulo) ? '' : tx.kicker}"),
    ):
        assert uso in leer(f), f


def test_la_tienda_dice_solo_el_nombre_del_personaje():
    t = leer("avatares3d/mixamo/TiendaDeRopa.tsx")
    assert "{t.personaje} <b>{MX_NOMBRES[aspecto.mx]}</b>" not in t
    assert "<b>{MX_NOMBRES[aspecto.mx]}</b>" in t


def test_la_peana_es_un_blanco_apagado():
    b = leer("components/bolaRenderizada.ts")
    peana = b.split("const peana = new THREE.Mesh(", 1)[1][:300]
    assert "plastico(0xe2e6ea, { roughness: 0.3 })" in peana and "0xf8fafc" not in peana
