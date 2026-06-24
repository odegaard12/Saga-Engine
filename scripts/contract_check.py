#!/usr/bin/env python3
"""SAGA backend/frontend contract checks.

These checks intentionally use only Python stdlib so they can run in CI without
adding a test dependency. They protect the current family-native runtime/admin
contract while the backend is being modularized.
"""

from __future__ import annotations

import importlib
import os
import sys
import tempfile
from pathlib import Path
from typing import Any

REPO_ROOT = Path(__file__).resolve().parents[1]
if str(REPO_ROOT) not in sys.path:
    sys.path.insert(0, str(REPO_ROOT))


def assert_equal(actual: Any, expected: Any, label: str) -> None:
    if actual != expected:
        raise AssertionError(f"{label}: expected {expected!r}, got {actual!r}")


def assert_true(value: Any, label: str) -> None:
    if not value:
        raise AssertionError(label)


def import_main_with_temp_runtime():
    tmp = tempfile.TemporaryDirectory()
    os.environ["SAGA_DATA_DIR"] = tmp.name
    os.environ.setdefault("ADMIN_PASS", "contract_test_admin_password")
    os.environ.setdefault("ALLOW_DEFAULT_ADMIN", "0")

    main = importlib.import_module("main")
    return main, tmp


def check_minigame_normalization() -> None:
    from backend.app.runtime.minigames import (
        SUPPORTED_MINIGAME_TYPES,
        normalize_minigame_config,
    )

    assert_true("signal_hunt" in SUPPORTED_MINIGAME_TYPES, "signal_hunt supported")
    assert_true("bearing_hunt" in SUPPORTED_MINIGAME_TYPES, "bearing_hunt supported")
    assert_true("circuit_matrix" in SUPPORTED_MINIGAME_TYPES, "circuit_matrix supported")

    tilt_maze = normalize_minigame_config(
        "circuit_matrix",
        {
            "objective": "balance_maze",
            "game_id": "tilt_maze",
            "completion_method": "motion",
            "difficulty": "normal",
            "grid_rows": 9,
            "grid_cols": 9,
            "pattern_mode": "fixed",
            "maze_seed": "contract-maze",
            "time_limit_s": 75,
            "lives": 3,
            "hole_count": 4,
            "collectible_count": 2,
            "sensor_enabled": True,
        },
    )

    assert_equal(
        tilt_maze["objective"],
        "balance_maze",
        "tilt maze objective",
    )

    assert_equal(
        tilt_maze["game_id"],
        "tilt_maze",
        "tilt maze game id",
    )

    assert_equal(
        tilt_maze["grid_rows"],
        9,
        "tilt maze rows",
    )

    assert_equal(
        tilt_maze["grid_cols"],
        9,
        "tilt maze cols",
    )

    assert_equal(
        tilt_maze["time_limit_s"],
        75,
        "tilt maze time",
    )

    assert_equal(
        tilt_maze["lives"],
        3,
        "tilt maze lives",
    )


    bearing = normalize_minigame_config(
        "bearing_hunt",
        {
            "objective": "single_lock",
            "target_bearing_deg": 270,
            "tolerance_deg": 12,
            "hold_ms": 1200,
        },
    )
    assert_equal(bearing["objective"], "single_lock", "bearing objective")
    assert_equal(bearing["target_bearing_deg"], 270.0, "bearing target")
    assert_equal(bearing["tolerance_deg"], 12, "bearing tolerance")
    assert_equal(bearing["hold_ms"], 1200, "bearing hold")

    signal = normalize_minigame_config(
        "signal_hunt",
        {
            "objective": "proximity_lock",
            "source_radius_m": 75,
            "lock_threshold": 65,
            "hold_ms": 1500,
        },
    )
    assert_equal(signal["objective"], "proximity_lock", "signal objective")
    assert_equal(signal["source_radius_m"], 75.0, "signal radius")
    assert_equal(signal["lock_threshold"], 65, "signal threshold")

    fixed_path = [
        "0:4",
        "0:3",
        "0:2",
        "0:1",
        "0:0",
        "1:0",
        "2:0",
        "3:0",
        "4:0",
        "4:1",
        "4:2",
        "4:3",
        "4:4",
        "3:4",
        "2:4",
        "2:3",
        "2:2",
    ]

    circuit = normalize_minigame_config(
        "circuit_matrix",
        {
            "objective": "path_restore",
            "game_id": "logic_circuit",
            "completion_method": "puzzle",
            "grid_cols": 5,
            "grid_rows": 5,
            "difficulty": "normal",
            "max_errors": 3,
            "preview_cell_ms": 460,
            "path_length": len(fixed_path),
            "pattern_mode": "fixed",
            "path_cells": fixed_path,
            "seed": "",
        },
    )

    assert_equal(
        circuit["objective"],
        "path_restore",
        "circuit objective",
    )

    assert_equal(
        circuit["game_id"],
        "logic_circuit",
        "circuit game id",
    )

    assert_equal(
        circuit["completion_method"],
        "puzzle",
        "circuit completion method",
    )

    assert_equal(
        circuit["grid_cols"],
        5,
        "circuit cols",
    )

    assert_equal(
        circuit["grid_rows"],
        5,
        "circuit rows",
    )

    assert_equal(
        circuit["difficulty"],
        "normal",
        "circuit difficulty",
    )

    assert_equal(
        circuit["max_errors"],
        3,
        "circuit max errors",
    )

    assert_equal(
        circuit["preview_cell_ms"],
        460,
        "circuit preview timing",
    )

    assert_equal(
        circuit["pattern_mode"],
        "fixed",
        "circuit fixed mode",
    )

    assert_equal(
        circuit["path_cells"],
        fixed_path,
        "circuit fixed path",
    )

    assert_equal(
        circuit["path_length"],
        len(fixed_path),
        "circuit fixed path length",
    )


    duplicate_path = normalize_minigame_config(
        "circuit_matrix",
        {
            "grid_cols": 5,
            "grid_rows": 5,
            "pattern_mode": "fixed",
            "path_length": 5,
            "path_cells": [
                "0:0",
                "0:1",
                "0:1",
                "0:2",
                "0:3",
            ],
        },
    )

    assert_equal(
        duplicate_path["pattern_mode"],
        "fixed",
        "circuit duplicate remains fixed but invalid",
    )

    assert_equal(
        duplicate_path["path_cells"],
        [],
        "circuit duplicate path rejected",
    )

    jump_path = normalize_minigame_config(
        "circuit_matrix",
        {
            "grid_cols": 5,
            "grid_rows": 5,
            "pattern_mode": "fixed",
            "path_length": 5,
            "path_cells": [
                "0:0",
                "0:1",
                "2:1",
                "2:2",
                "2:3",
            ],
        },
    )

    assert_equal(
        jump_path["path_cells"],
        [],
        "circuit jumping path rejected",
    )

    short_path = normalize_minigame_config(
        "circuit_matrix",
        {
            "grid_cols": 5,
            "grid_rows": 5,
            "pattern_mode": "fixed",
            "path_length": 3,
            "path_cells": [
                "0:0",
                "0:1",
                "0:2",
            ],
        },
    )

    assert_equal(
        short_path["path_cells"],
        [],
        "circuit short path rejected",
    )

    random_circuit = normalize_minigame_config(
        "circuit_matrix",
        {
            "grid_cols": 5,
            "grid_rows": 5,
            "difficulty": "normal",
            "pattern_mode": "random_each_game",
            "path_length": 11,
            "path_cells": fixed_path,
        },
    )

    assert_equal(
        random_circuit["pattern_mode"],
        "random_each_game",
        "circuit random mode preserved",
    )

    assert_equal(
        random_circuit["path_cells"],
        [],
        "circuit random mode ignores fixed cells",
    )

    assert_equal(
        random_circuit["path_length"],
        11,
        "circuit random length preserved",
    )


    sample_mosaic_image = (
        "data:image/png;base64,"
        + "AA=="
    )

    place_mosaic = normalize_minigame_config(
        "circuit_matrix",
        {
            "objective": "image_mosaic",
            "game_id": "place_mosaic",
            "completion_method": "puzzle",
            "image_data_url": (
                sample_mosaic_image
            ),
            "image_alt": "Molino",
            "grid_size": 3,
            "preview_ms": 2500,
            "max_moves": 30,
            "require_final_question": True,
            "final_question": (
                "¿Qué hay sobre la puerta?"
            ),
            "final_choices": [
                "Escudo",
                "Campana",
                "Ventana",
            ],
            "final_correct_index": 0,
        },
    )

    assert_equal(
        place_mosaic["objective"],
        "image_mosaic",
        "mosaic objective",
    )

    assert_equal(
        place_mosaic["game_id"],
        "place_mosaic",
        "mosaic game id",
    )

    assert_equal(
        place_mosaic["image_data_url"],
        sample_mosaic_image,
        "mosaic image preserved",
    )

    assert_equal(
        place_mosaic["grid_size"],
        3,
        "mosaic grid size",
    )

    assert_equal(
        place_mosaic["final_correct_index"],
        0,
        "mosaic correct answer",
    )


    sequence_code = normalize_minigame_config(
        "circuit_matrix",
        {
            "objective": "sequence_order",
            "game_id": "sequence_code",
            "completion_method": "sequence",
            "sequence": [
                "NORTE",
                "RÍO",
                "TORRE",
            ],
            "difficulty": "normal",
            "max_attempts": 3,
            "hint_text": "Ordena las pistas.",
        },
    )

    assert_equal(
        sequence_code["objective"],
        "sequence_order",
        "sequence objective",
    )

    assert_equal(
        sequence_code["game_id"],
        "sequence_code",
        "sequence game id",
    )

    assert_equal(
        sequence_code["completion_method"],
        "sequence",
        "sequence completion method",
    )

    assert_equal(
        sequence_code["sequence"],
        ["NORTE", "RÍO", "TORRE"],
        "sequence tokens",
    )

    assert_equal(
        sequence_code["max_attempts"],
        3,
        "sequence max attempts",
    )

    duplicate_sequence = normalize_minigame_config(
        "circuit_matrix",
        {
            "game_id": "sequence_code",
            "sequence": [
                "NORTE",
                "norte",
                "TORRE",
            ],
        },
    )

    assert_equal(
        duplicate_sequence["sequence"],
        [],
        "duplicate sequence rejected",
    )

    short_sequence = normalize_minigame_config(
        "circuit_matrix",
        {
            "game_id": "sequence_code",
            "sequence": [
                "UNO",
                "DOS",
            ],
        },
    )

    assert_equal(
        short_sequence["sequence"],
        [],
        "short sequence rejected",
    )


def check_stage_runtime_contract(main) -> None:
    raw_bearing = {
        "id": 7,
        "title": "Bearing contract node",
        "type": "bearing_hunt",
        "lat": 42.0,
        "lon": -8.0,
        "radius": 50,
        "content": "Point the device to the target bearing.",
        "config": {
            "objective": "single_lock",
            "target_bearing_deg": 270,
            "tolerance_deg": 12,
            "hold_ms": 1200,
        },
        "minigame": {
            "type": "bearing_hunt",
            "version": "v1",
            "label": "Bearing Hunt",
            "config": {
                "objective": "single_lock",
                "target_bearing_deg": 270,
                "tolerance_deg": 12,
                "hold_ms": 1200,
            },
        },
    }

    node = main.normalize_stage(raw_bearing)
    assert_equal(node["interaction"]["type"], "bearing_hunt", "normalize_stage bearing type")
    assert_equal(
        node["interaction"]["config"]["target_bearing_deg"],
        270.0,
        "normalize_stage bearing target",
    )

    runtime = main.build_stage_minigame_runtime(node)
    assert_equal(runtime["type"], "bearing_hunt", "runtime minigame type")
    assert_equal(runtime["label"], "Bearing Hunt", "runtime minigame label")

    # /api/admin/react-overview summarizes runtime-normalized stages from get_runtime_stages().
    summary = main._admin_react_stage_summary(node, 0)
    assert_equal(summary["type"], "bearing_hunt", "admin overview bearing type")
    assert_equal(summary["label"], "Bearing Hunt", "admin overview bearing label")
    # The current overview contract only requires the family identity to survive.
    # Detailed config editing can be covered by a later schema/editor contract.


    raw_mosaic = {
        "id": 8,
        "title": "Mosaic contract node",
        "type": "circuit_matrix",
        "lat": 42.0,
        "lon": -8.0,
        "radius": 50,
        "content": (
            "Reconstruye la fotografía."
        ),
        "config": {
            "objective": "image_mosaic",
            "game_id": "place_mosaic",
            "completion_method": "puzzle",
            "image_data_url": (
                "data:image/png;base64,"
                + "AA=="
            ),
            "grid_size": 3,
            "preview_ms": 2500,
            "max_moves": 0,
            "require_final_question": False,
            "final_choices": [
                "Escudo",
                "Campana",
            ],
            "final_correct_index": 0,
        },
        "minigame": {
            "type": "circuit_matrix",
            "version": "v1",
            "label": "Mosaico del lugar",
            "config": {
                "objective": "image_mosaic",
                "game_id": "place_mosaic",
                "completion_method": "puzzle",
                "image_data_url": (
                    "data:image/png;base64,"
                    + "AA=="
                ),
                "grid_size": 3,
                "preview_ms": 2500,
                "max_moves": 0,
                "require_final_question": False,
                "final_choices": [
                    "Escudo",
                    "Campana",
                ],
                "final_correct_index": 0,
            },
        },
    }

    mosaic_node = main.normalize_stage(
        raw_mosaic
    )

    mosaic_runtime = (
        main.build_stage_minigame_runtime(
            mosaic_node
        )
    )

    assert_equal(
        mosaic_runtime["label"],
        "Mosaico del lugar",
        "mosaic runtime label",
    )

    assert_equal(
        mosaic_runtime["config"]["game_id"],
        "place_mosaic",
        "mosaic runtime game id",
    )

    assert_equal(
        mosaic_runtime["config"]["grid_size"],
        3,
        "mosaic runtime grid size",
    )

    assert_equal(
        main.stage_accepts_code(
            raw_mosaic,
            "OK",
        ),
        True,
        "mosaic completion accepts OK",
    )


    raw_sequence = {
        "id": 9,
        "title": "Sequence contract node",
        "type": "circuit_matrix",
        "lat": 42.0,
        "lon": -8.0,
        "radius": 50,
        "content": "Order the clues.",
        "config": {
            "objective": "sequence_order",
            "game_id": "sequence_code",
            "completion_method": "sequence",
            "sequence": [
                "NORTE",
                "RÍO",
                "TORRE",
            ],
            "max_attempts": 3,
            "hint_text": "Ordena las pistas.",
        },
        "minigame": {
            "type": "circuit_matrix",
            "version": "v1",
            "label": "Código secuencial",
            "config": {
                "objective": "sequence_order",
                "game_id": "sequence_code",
                "completion_method": "sequence",
                "sequence": [
                    "NORTE",
                    "RÍO",
                    "TORRE",
                ],
                "max_attempts": 3,
                "hint_text": "Ordena las pistas.",
            },
        },
    }

    sequence_node = main.normalize_stage(
        raw_sequence
    )

    assert_equal(
        sequence_node["interaction"]["type"],
        "circuit_matrix",
        "sequence runtime family",
    )

    sequence_runtime = (
        main.build_stage_minigame_runtime(
            sequence_node
        )
    )

    assert_equal(
        sequence_runtime["label"],
        "Código secuencial",
        "sequence runtime label",
    )

    assert_equal(
        sequence_runtime["config"]["game_id"],
        "sequence_code",
        "sequence runtime game id",
    )

    assert_equal(
        sequence_runtime["config"]["sequence"],
        ["NORTE", "RÍO", "TORRE"],
        "sequence runtime tokens",
    )


    assert_equal(
        main.stage_accepts_code(
            raw_sequence,
            "OK",
        ),
        True,
        "sequence completion accepts minigame OK",
    )

    assert_equal(
        main.stage_accepts_code(
            raw_sequence,
            "WRONG",
        ),
        False,
        "sequence completion rejects wrong code",
    )

    sequence_inside = main.evaluate_entry(
        sequence_node,
        distance_m=20,
        gps_available=True,
        debug_enabled=False,
    )

    assert_equal(
        sequence_inside["can_enter"],
        True,
        "sequence GPS entry inside radius",
    )

    sequence_outside = main.evaluate_entry(
        sequence_node,
        distance_m=80,
        gps_available=True,
        debug_enabled=False,
    )

    assert_equal(
        sequence_outside["can_enter"],
        False,
        "sequence GPS entry outside radius",
    )

    assert_equal(
        sequence_outside["reason"],
        "out_of_range",
        "sequence outside radius reason",
    )

    sequence_debug = main.evaluate_entry(
        sequence_node,
        distance_m=None,
        gps_available=False,
        debug_enabled=True,
    )

    assert_equal(
        sequence_debug["can_enter"],
        True,
        "sequence debug bypass",
    )

    assert_equal(
        sequence_debug["reason"],
        "debug_bypass",
        "sequence debug bypass reason",
    )


def check_minigame_precedence_contract(main) -> None:
    raw_mixed = {
        "id": 8,
        "title": "Mixed contract node",
        "type": "signal_hunt",
        "config": {
            "objective": "proximity_lock",
            "source_radius_m": 75,
            "lock_threshold": 65,
            "hold_ms": 1500,
        },
        "minigame": {
            "type": "bearing_hunt",
            "version": "v1",
            "label": "Bearing Hunt",
            "config": {
                "objective": "single_lock",
                "target_bearing_deg": 180,
                "tolerance_deg": 10,
                "hold_ms": 1000,
            },
        },
    }

    node = main.normalize_stage(raw_mixed)
    assert_equal(
        node["interaction"]["type"],
        "bearing_hunt",
        "minigame block type must win over stale top-level type",
    )

    # /api/admin/react-overview summarizes runtime-normalized stages from get_runtime_stages().
    summary = main._admin_react_stage_summary(node, 0)
    assert_equal(
        summary["type"],
        "bearing_hunt",
        "admin overview must project minigame type over stale top-level type",
    )


def main() -> None:
    check_minigame_normalization()
    imported_main, tmp = import_main_with_temp_runtime()
    try:
        check_stage_runtime_contract(imported_main)
        check_minigame_precedence_contract(imported_main)
    finally:
        tmp.cleanup()

    print("SAGA contract checks passed")


if __name__ == "__main__":
    main()
