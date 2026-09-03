# -*- coding: utf-8 -*-
"""required_members (4.9.53) tiene que sobrevivir a normalize_minigame_config.

Encontrado con sim/playwright-bench, no a ojo: admin.py guardaba el número
que ponía el organizador, pero al leerlo de vuelta -normalize_stage, lo que
ve el jugador- se perdía, porque el campo no estaba en el whitelist de
signal_hunt. El jugador siempre veía el 2 por defecto, nunca lo que se
configuró para ese nodo en concreto.
"""
import os
import tempfile

os.environ.setdefault("ADMIN_PASS", "pytest_admin_password")
os.environ.setdefault("SAGA_DATA_DIR", tempfile.mkdtemp(prefix="saga-test-relevo-"))

from backend.app.runtime.minigames import normalize_minigame_config  # noqa: E402


def test_required_members_sobrevive_a_normalize():
    config = normalize_minigame_config(
        "signal_hunt",
        {"objective": "team_relay", "game_id": "team_relay", "required_members": 4},
    )
    assert config["required_members"] == 4


def test_required_members_se_recorta_a_un_rango_razoable():
    config = normalize_minigame_config(
        "signal_hunt",
        {"game_id": "team_relay", "required_members": 999},
    )
    assert config["required_members"] == 20


def test_required_members_ausente_non_aparece():
    # Un nodo signal_hunt normal -sin team_relay- non debe gañar un campo
    # que non pidiu ninguén.
    config = normalize_minigame_config("signal_hunt", {"objective": "proximity_lock"})
    assert "required_members" not in config
