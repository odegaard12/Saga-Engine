# -*- coding: utf-8 -*-
"""Eco rítmico (30/10, sustituye al Simón con el id `sequence_code`): el motor del móvil y lo que guarda el servidor."""
import json
import shutil
import subprocess
from pathlib import Path

import pytest

from backend.app.runtime.minigames import normalize_minigame_config

RAIZ = Path(__file__).resolve().parent.parent
ECO = RAIZ / "frontend" / "src" / "player" / "minigames" / "families" / "sequenceCode" / "eco.ts"

GUION = """
import { generarRonda, ritmoCorrecto } from %s
const r = generarRonda('s:r3', 7, 4, 40)
const sinLargas = generarRonda('s:r3', 7, 4, 0)
console.log(JSON.stringify({
  igual: JSON.stringify(r) === JSON.stringify(generarRonda('s:r3', 7, 4, 40)),
  largo: r.fichas.length, ultimo: r.pulsos[6], hayLarga: r.pulsos.includes(2), sinLargas: sinLargas.pulsos.includes(2),
  rango: r.fichas.every((f) => f >= 0 && f < 4),
  // corto, LARGO, corto: a 600 ms de pulso, y el mismo ritmo tocado lento (todo ×1,4)
  bien: ritmoCorrecto([1, 2, 1, 1], [600, 1200, 600], 600),
  lento: ritmoCorrecto([1, 2, 1, 1], [840, 1680, 840], 600),
  plano: ritmoCorrecto([1, 2, 1, 1], [600, 600, 600], 600),
  sinLargo: ritmoCorrecto([1, 1, 1], [300, 900], 600),
}))
"""


@pytest.mark.skipif(not shutil.which("node"), reason="sin node")
def test_motor_del_eco(tmp_path):
    guion = tmp_path / "eco.mts"
    guion.write_text(GUION % json.dumps(ECO.as_uri()), encoding="utf-8")
    salida = subprocess.run(["node", str(guion)], capture_output=True, text=True, timeout=60)
    assert salida.returncode == 0, salida.stderr
    r = json.loads(salida.stdout)
    assert r["igual"] and r["largo"] == 7 and r["rango"]
    assert r["ultimo"] == 1, "el último golpe no se puede medir: siempre corto"
    assert r["hayLarga"] and not r["sinLargas"]
    assert r["bien"] and r["lento"], "el ritmo se mide contra el pulso del jugador, no contra el reloj"
    assert not r["plano"], "tocar el largo como un corto es fallar el ritmo"
    assert r["sinLargo"], "sin golpes largos sólo cuenta la memoria"


def test_el_servidor_guarda_los_ajustes_del_eco():
    cfg = normalize_minigame_config(
        "circuit_matrix",
        {"game_id": "sequence_code", "levels": 99, "long_notes": 0, "penalty_s": 1, "sequence": ["a", "b"]},
    )
    assert cfg["levels"] == 8 and cfg["long_notes"] == 0 and cfg["penalty_s"] == 5
    assert "sequence" not in cfg
