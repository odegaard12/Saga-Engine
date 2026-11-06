# -*- coding: utf-8 -*-
"""5/11: la pista frío/caliente de mapa mudo se calcula en el móvil con el GPS (sin red ni latido).

El servidor manda celdas saladas por banda (`arrival.calor`), nunca el punto. Aquí se repite la cuenta del móvil
(`calorDelMapaMudo` en frontend/src/player/utils/mapaMudo.ts) y se comprueba que da frío lejos y caliente encima.
"""
import math
import os
import tempfile
from pathlib import Path

os.environ.setdefault("ADMIN_PASS", "pytest_admin_password")
os.environ.setdefault("SAGA_DATA_DIR", tempfile.mkdtemp(prefix="saga-test-mapa-mudo-calor-"))

from backend.app.runtime.mision import mapa_mudo_hash_celda, project_stage_for_player  # noqa: E402

RAIZ = Path(__file__).resolve().parents[1]
M = 111320.0


def _nodo(**config):
    return {
        "id": "nodo-mm-calor",
        "version": 2,
        "enabled": True,
        "presentation": {"title": "Busca", "content": "x"},
        "location": {"lat": 40.0, "lon": -3.0, "radius_m": 20},
        "entry": {"mode": "gps", "require_proximity": True, "allow_debug_bypass": True,
                  "allow_manual_fallback_without_gps": False},
        "interaction": {"type": "signal_hunt",
                        "config": {"game_id": "mapa_mudo", "objective": "mapa_mudo", "search_radius_m": 250, **config}},
        "success": {"conditions": [{"kind": "minigame_ok", "value": "OK"}]},
        "messages": {"hint": "", "gps_unavailable": "", "locked": ""},
        "requirements": {"items": []},
    }


def _banda(p, lat, lon):
    """Lo mismo que calorDelMapaMudo en el móvil."""
    llegada = p["config"]["arrival"]
    calor = llegada["calor"]
    dy = (lat - p["lat"]) * M
    dx = (lon - p["lon"]) * M * max(0.2, math.cos(math.radians(p["lat"])))
    h = mapa_mudo_hash_celda(llegada["sal"], math.floor(dx / calor["celda_m"]), math.floor(dy / calor["celda_m"]))
    return "caliente" if h in calor["caliente"] else "templado" if h in calor["templado"] else "frio"


def test_sin_pista_lleva_calor_y_va_de_frio_a_caliente():
    p = project_stage_for_player(_nodo(), include_runtime=True, completed=False)
    assert "40.0" not in str(p["config"]["arrival"]), "el punto real no viaja"
    paso = 1 / M  # 1 m
    assert _banda(p, 40.0 + 240 * paso, -3.0) == "frio"
    assert _banda(p, 40.0 + 120 * paso, -3.0) == "templado"
    assert _banda(p, 40.0 + 5 * paso, -3.0) == "caliente"
    assert _banda(p, 40.0, -3.0) == "caliente"


def test_con_texto_y_sin_pista_activada_no_lleva_calor():
    p = project_stage_for_player(_nodo(clue_text="Busca la fuente."), include_runtime=True, completed=False)
    assert "calor" not in p["config"]["arrival"]
    p = project_stage_for_player(_nodo(clue_text="Busca.", hot_cold_hint=True), include_runtime=True, completed=False)
    assert p["config"]["arrival"]["calor"]["caliente"]


def test_el_movil_lo_calcula_con_su_gps_y_el_hud_lo_pinta():
    util = (RAIZ / "frontend/src/player/utils/mapaMudo.ts").read_text(encoding="utf-8")
    assert "export function calorDelMapaMudo(" in util and "hashDeCelda(llegada.sal, Math.floor(dx / calor.celda_m)" in util
    app = (RAIZ / "frontend/src/player/PlayerApp.tsx").read_text(encoding="utf-8")
    assert "calorDelMapaMudo(currentStage, displayPosition, stagePosition)" in app
    hud = (RAIZ / "frontend/src/player/components/PlayerHud.tsx").read_text(encoding="utf-8")
    assert "const hotCold = calorMapaMudo ||" in hud
