# -*- coding: utf-8 -*-
"""Eco rítmico (30/10, sustituye al Simón con el id `sequence_code`): el motor del móvil y lo que guarda el servidor.

22/11 («B mejorada», punto y raya): el largo se toca dejando el dedo en la ficha; se juzga lo que dura cada golpe."""
import json
import shutil
import subprocess
from pathlib import Path

import pytest

from backend.app.runtime.minigames import normalize_minigame_config

RAIZ = Path(__file__).resolve().parent.parent
FAMILIA = RAIZ / "frontend" / "src" / "player" / "minigames" / "families" / "sequenceCode"
NODE = shutil.which("node")


@pytest.fixture(scope="module")
def motor():
    if not NODE:
        pytest.skip("sin node")
    salida = subprocess.run([NODE, str(RAIZ / "tests" / "js" / "eco_ritmico.cjs")], capture_output=True, text=True,
                            encoding="utf-8", timeout=60)
    assert salida.returncode == 0, salida.stderr
    return json.loads(salida.stdout)


def test_motor_del_eco(motor):
    r = motor
    assert r["igual"] and r["largo"] == 7 and r["rango"]
    assert r["hayLarga"] and not r["sinLargas"]
    assert r["ultimaLarga"] > 0, "con el dedo se mide también el último golpe: puede ser raya"


def test_punto_y_raya_se_juzgan_por_lo_que_dura_el_dedo(motor):
    r = motor
    # El umbral sale del pulso de la ronda y se queda entre 300 y 560 ms.
    assert r["t620"]["umbral"] == 372 and r["t260"]["umbral"] == 300 and r["t1200"]["umbral"] == 560
    for t in (r["t620"], r["t260"], r["t1200"]):
        assert t["luzLarga"] >= 1.5 * t["umbral"], "la raya de la escucha se ve claramente más larga que el aro"
        assert t["luzCorta"] <= 0.6 * t["umbral"], "quien imite el punto de la escucha no llega a raya"
    assert not r["toqueNormal"] and not r["toqueLento"], "un toque normal, incluso lento, nunca es raya"
    assert r["alCerrar"] and r["mantener"], "soltar justo cuando se cierra el aro ya cuenta como raya"
    assert r["puntoBien"] == {"ficha": 0, "raya": False, "ok": True, "fallo": None}
    assert r["rayaBien"]["ok"] and r["rayaBien"]["raya"]
    assert r["rayaCorta"]["fallo"] == "ritmo" and not r["rayaCorta"]["raya"]
    assert r["puntoLargo"]["fallo"] == "ritmo" and r["puntoLargo"]["raya"]
    assert r["fichaMal"]["fallo"] == "ficha", "la ficha equivocada manda sobre la duración"


def test_el_dedo_se_mide_bien_en_el_movil():
    s = (FAMILIA / "EcoRitmicoRuntimeScreen.tsx").read_text(encoding="utf-8")
    assert "ritmoCorrecto" not in s and "tiempos.current" not in s, "ya no se juzga el hueco entre toques"
    assert "onPointerCancel=" in s and "setPointerCapture" in s
    assert "onContextMenu={(e) => e.preventDefault()}" in s
    # Un segundo dedo con el primero en una ficha no cuenta.
    assert "if (pulsadaRef.current) return" in s
    css = (FAMILIA / "eco.css").read_text(encoding="utf-8")
    ficha = css.split(".eco-ficha {")[1].split("}")[0]
    assert "touch-action: none;" in ficha and "-webkit-touch-callout: none;" in ficha and "user-select: none;" in ficha
    # La línea de punto y raya reserva su alto: no salta al pasar de «Escucha» a «Tu turno».
    assert "height: 56px;" in css.split(".eco-linea {")[1].split("}")[0]


def test_el_servidor_guarda_los_ajustes_del_eco():
    cfg = normalize_minigame_config(
        "circuit_matrix",
        {"game_id": "sequence_code", "levels": 99, "long_notes": 0, "penalty_s": 1, "sequence": ["a", "b"]},
    )
    assert cfg["levels"] == 8 and cfg["long_notes"] == 0 and cfg["penalty_s"] == 5
    assert "sequence" not in cfg
