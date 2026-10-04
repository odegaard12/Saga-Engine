# -*- coding: utf-8 -*-
"""Auditoría del 04/10/2026, minijuegos (lado servidor).

- Simón y laberinto fijo: la semilla de serie era la misma para todos
  («saga-simon», «saga-maze»). Ahora una por nodo y jugador, salvo semilla
  puesta a propósito por el organizador.
- Desafío de audio: umbral y tiempo sostenido configurables y que llegan al móvil.
- Relevo de equipo: `required_members` cuenta a quien juega (mínimo 2).
"""
from backend.app.runtime.core_engine import normalize_stage
from backend.app.runtime.minigames import normalize_minigame_config, project_seeds_for_player
from backend.app.runtime.mision import project_stage_for_player


def _nodo(game_id, tipo="circuit_matrix", **config):
    return normalize_stage(
        {
            "id": 77,
            "title": "Juego",
            "lat": 40.5,
            "lon": -3.5,
            "radius": 25,
            "minigame": {"type": tipo, "config": {"game_id": game_id}},
            "config": {"game_id": game_id, **config},
        }
    )


def _config_del_jugador(nodo, jugador):
    proyectado = project_stage_for_player(nodo, include_runtime=True, player_id=jugador)
    return proyectado["minigame"]["config"], proyectado["config"]


def test_simon_sin_semilla_da_una_por_jugador_y_no_fijada():
    nodo = _nodo("sequence_code")
    de_a, editor_a = _config_del_jugador(nodo, "A")
    de_b, _ = _config_del_jugador(nodo, "B")
    assert de_a["seed"] and de_b["seed"] and de_a["seed"] != de_b["seed"]
    assert de_a["seed_fixed"] is False
    assert editor_a["seed"] == de_a["seed"], "las dos copias de la config dicen lo mismo"
    # Estable para el mismo jugador (recargas, sin conexión).
    assert _config_del_jugador(nodo, "A")[0]["seed"] == de_a["seed"]


def test_simon_con_la_semilla_de_serie_vieja_tambien_es_por_jugador():
    nodo = _nodo("sequence_code", seed="saga-simon")
    assert _config_del_jugador(nodo, "A")[0]["seed"] != _config_del_jugador(nodo, "B")[0]["seed"]


def test_simon_con_semilla_del_organizador_es_la_misma_para_todos_y_fijada():
    nodo = _nodo("sequence_code", seed="patron-del-dia")
    de_a, _ = _config_del_jugador(nodo, "A")
    de_b, _ = _config_del_jugador(nodo, "B")
    assert de_a["seed"] == de_b["seed"] == "patron-del-dia"
    assert de_a["seed_fixed"] is True


def test_el_normalizador_ya_no_pone_semillas_de_serie():
    assert normalize_minigame_config("circuit_matrix", {"game_id": "sequence_code"})["seed"] == ""
    assert normalize_minigame_config("circuit_matrix", {"game_id": "tilt_maze"})["maze_seed"] == ""


def test_laberinto_fijo_por_jugador_salvo_semilla_del_organizador():
    nodo = _nodo("tilt_maze")
    assert _config_del_jugador(nodo, "A")[0]["maze_seed"] != _config_del_jugador(nodo, "B")[0]["maze_seed"]

    fijo = _nodo("tilt_maze", maze_seed="laberinto-7")
    assert _config_del_jugador(fijo, "A")[0]["maze_seed"] == _config_del_jugador(fijo, "B")[0]["maze_seed"] == "laberinto-7"


def test_laberinto_aleatorio_no_se_toca():
    assert project_seeds_for_player({"game_id": "tilt_maze", "pattern_mode": "random_each_game"}, 1, "A") == {}


def test_audio_trae_umbral_y_sostenido_por_defecto_y_recortados():
    defecto = normalize_minigame_config("audio_challenge", {})
    assert defecto["volume_threshold"] == 95
    assert defecto["sustain_ms"] == 2500

    recortado = normalize_minigame_config("audio_challenge", {"volume_threshold": 999, "sustain_ms": 10})
    assert recortado["volume_threshold"] == 220
    assert recortado["sustain_ms"] == 1000


def test_audio_la_config_llega_al_jugador():
    nodo = normalize_stage(
        {
            "id": 78,
            "title": "Sopla",
            "lat": 40.5,
            "lon": -3.5,
            "radius": 25,
            "minigame": {"type": "audio_challenge", "config": {}},
            "config": {"volume_threshold": 120, "sustain_ms": 4000},
        }
    )
    config = project_stage_for_player(nodo, include_runtime=True, player_id="A")["minigame"]["config"]
    assert config["volume_threshold"] == 120
    assert config["sustain_ms"] == 4000


def test_relevo_cuenta_a_quien_juega_y_no_baja_de_dos():
    config = normalize_minigame_config("signal_hunt", {"game_id": "team_relay", "required_members": 1})
    assert config["required_members"] == 2
