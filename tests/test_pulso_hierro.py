# -*- coding: utf-8 -*-
"""15/11 (Óscar, «fusiónalo»): «Pulso de hierro» se fusionó con Simón (Eco rítmico, `sequence_code`).

Los nodos ya guardados con `motion_challenge` + `game_id: pulso_hierro` no se reescriben: se sirven y se validan como
Simón (alias en `minigames.alias_de_juego`). Esto comprueba el alias, que ya no se puede crear uno nuevo y que el
servidor acepta tanto la evidencia de Simón como la vieja de Pulso.
"""
import json
import os
import tempfile
from pathlib import Path

os.environ.setdefault("ADMIN_PASS", "pytest_admin_password")
os.environ.setdefault("SAGA_DATA_DIR", tempfile.mkdtemp(prefix="saga-test-pulso-hierro-"))

import main  # noqa: E402
from backend.app.runtime.core_engine import normalize_stage  # noqa: E402
from backend.app.runtime.evidencia import verificar_evidencia  # noqa: E402
from backend.app.runtime.minigames import (  # noqa: E402
    alias_de_juego,
    build_stage_minigame_runtime,
    normalize_minigame_config,
)
from backend.app.runtime.niveles import tabla  # noqa: E402

RAIZ = Path(__file__).resolve().parent.parent
REGISTRO = {g["id"]: g for g in json.loads((RAIZ / "shared" / "game_registry.json").read_text("utf-8"))["games"]}
F = RAIZ / "frontend" / "src"


def _nodo_guardado(**config):
    return {
        "id": "n1",
        "title": "Pulso",
        "lat": 42.0,
        "lon": -8.0,
        "minigame": {"type": "motion_challenge", "config": {"game_id": "pulso_hierro", **config}},
    }


def test_un_nodo_pulso_guardado_se_normaliza_como_simon():
    config = normalize_minigame_config("motion_challenge", {"game_id": "pulso_hierro"})
    assert config["game_id"] == "sequence_code" and config["objective"] == "sequence_order"
    assert config["levels"] == 5 and config["pad_count"] == 4, "sin números propios: lo de siempre de Simón (nivel 2)"
    propios = normalize_minigame_config(
        "motion_challenge", {"game_id": "pulso_hierro", "pulso_target_rounds": 7, "pulso_pad_count": 6}
    )
    assert propios["levels"] == 7 and propios["pad_count"] == 6
    assert not any(k.startswith("pulso_") for k in config)
    assert normalize_minigame_config("circuit_matrix", config) == config, "idempotente"


def test_el_nivel_del_pulso_manda_con_la_tabla_de_simon():
    for nivel in (1, 2, 3, 4, 5):
        config = normalize_minigame_config("motion_challenge", {"game_id": "pulso_hierro", "nivel": nivel})
        esperado = tabla()["juegos"]["sequence_code"]["niveles"][str(nivel)]["params"]
        assert {k: config[k] for k in esperado} == esperado
        assert config["nivel"] == nivel


def test_a_mano_se_traducen_rondas_y_fichas():
    config = normalize_minigame_config(
        "motion_challenge",
        {"game_id": "pulso_hierro", "nivel": 3, "nivel_a_mano": True, "pulso_target_rounds": 99, "pulso_pad_count": 5},
    )
    assert config["levels"] == 8 and config["pad_count"] == 5, "recortado al rango de Simón"


def test_el_motion_challenge_de_siempre_no_cambia():
    assert alias_de_juego("motion_challenge", {"game_id": "shake_charge"}) == ("motion_challenge", {"game_id": "shake_charge"})
    assert normalize_minigame_config("motion_challenge", {})["game_id"] == "shake_charge"


def test_el_nodo_guardado_se_abre_como_eco_ritmico():
    node = normalize_stage(_nodo_guardado())
    assert node["interaction"]["type"] == "circuit_matrix"
    assert node["interaction"]["config"]["game_id"] == "sequence_code"
    runtime = build_stage_minigame_runtime(node)
    assert runtime["type"] == "circuit_matrix" and runtime["label"] == "Eco rítmico"
    # También sin pasar por normalize_stage (nodo en bruto con el tipo viejo).
    en_bruto = build_stage_minigame_runtime({"interaction": {"type": "motion_challenge", "config": {"game_id": "pulso_hierro"}}})
    assert en_bruto["type"] == "circuit_matrix" and en_bruto["config"]["game_id"] == "sequence_code"


def test_el_servidor_valida_un_nodo_pulso_como_simon():
    nodo_bruto = {"interaction": {"type": "motion_challenge", "config": {"game_id": "pulso_hierro"}}}
    simon = {"v": 1, "game": "sequence_code", "fallos": 0, "ms": 90000, "rondas_ok": 6}
    assert verificar_evidencia(nodo_bruto, "p1", simon, penalty_ms=0) == []
    # Un fallo declarado y no cobrado sigue siendo sospechoso, igual que en Simón.
    assert verificar_evidencia(nodo_bruto, "p1", {**simon, "fallos": 3}, penalty_ms=0)
    # Evidencia vieja de Pulso (cola sin conexión de antes de la fusión): se acepta, no se compara con Simón.
    vieja = {"v": 1, "game": "pulso_hierro", "rondas_ok": 5, "fallos": 2}
    assert verificar_evidencia(nodo_bruto, "p1", vieja, penalty_ms=0) == []


def test_la_penalizacion_sin_sensor_de_pulso_sigue_aceptandose():
    ev = {"modo_alternativo": True, "game": "pulso_hierro", "penalizacion_modo_alternativo_ms": 25_000}
    assert main.penalizacion_minima(0, evidencia=ev) == 25_000


def test_no_se_puede_crear_uno_nuevo_y_el_panel_lo_marca_retirado():
    assert REGISTRO["pulso_hierro"]["retired_for"] == "sequence_code" and not REGISTRO["sequence_code"].get("retired_for")
    assert "pulso_hierro" not in tabla()["juegos"], "su escala de niveles ya es la de sequence_code"


def test_el_cliente_ya_no_tiene_pantalla_de_pulso_y_lo_desvia_a_simon():
    assert not (F / "player/minigames/families/motionChallenge/PulsoHierroRuntimeScreen.tsx").exists()
    host = (F / "player/minigames/core/FamilyRuntimeHost.tsx").read_text("utf-8")
    assert "PulsoHierro" not in host
    puente = (F / "player/minigames/core/runtime-bridge.ts").read_text("utf-8")
    assert "gameId === 'pulso_hierro'" in puente and "game_id: 'sequence_code'" in puente
    assert "pulsoHierro" not in (F / "i18n/index.ts").read_text("utf-8")
