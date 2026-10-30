# -*- coding: utf-8 -*-
"""30/10: juegos de lógica nuevos (Interrogatorio, Mastermind, Balanza).

El caso lo genera el móvil con una semilla por nodo+jugador (mismo tamaño para todos, contenido distinto para cada
uno); el servidor normaliza los parámetros, aplica el nivel, manda la semilla y revisa la evidencia (fallos pagados y
que no se resuelva en un suspiro). La lógica pura se ejecuta en Node (tests/js/juegos_logica.cjs).
"""
import json
import os
import shutil
import subprocess
import tempfile
from pathlib import Path

import pytest

os.environ.setdefault("ADMIN_PASS", "pytest_admin_password")
os.environ.setdefault("SAGA_DATA_DIR", tempfile.mkdtemp(prefix="saga-test-logica-"))

from backend.app.runtime.evidencia import verificar_evidencia  # noqa: E402
from backend.app.runtime.minigames import normalize_minigame_config, project_seeds_for_player  # noqa: E402

RAIZ = Path(__file__).resolve().parents[1]
JUEGOS = ("interrogatorio", "mastermind", "balanza")


def test_la_logica_pura_da_casos_unicos_y_pistas_correctas():
    node = shutil.which("node")
    if not node or not (RAIZ / "frontend" / "node_modules" / "typescript").exists():
        pytest.skip("sin node o sin frontend/node_modules")
    r = json.loads(subprocess.run([node, str(RAIZ / "tests" / "js" / "juegos_logica.cjs")], capture_output=True,
                                  text=True, check=True, encoding="utf-8").stdout)
    assert r["unicos"] == r["casos"] == r["culpableCuadra"], "todo caso del Interrogatorio tiene UNA solución"
    assert r["distintos"] >= r["casos"] - 5, "casos distintos por semilla: no hay banco que memorizar"
    assert r["metaUsado"] > 0 and r["reglas"] == ["una_mentira", "una_verdad"]
    assert r["mismo"], "la misma semilla da el mismo caso (sin red, tras recargar)"
    assert r["pistas"] == [{"exactas": 4, "casi": 0}, {"exactas": 0, "casi": 4}, {"exactas": 1, "casi": 2},
                           {"exactas": 0, "casi": 0}]
    assert r["sinRepetir"]
    assert r["pesadas"] == [-1, 0, 1, 0]
    assert r["bolasDistintas"] == 9
    assert r["resoluble"] == [True, True, True, True, False], "los 5 niveles de la Balanza son resolubles"


@pytest.mark.parametrize("juego", JUEGOS)
def test_el_servidor_normaliza_y_acota(juego):
    cfg = normalize_minigame_config("circuit_matrix", {"game_id": juego, "penalty_s": 9999, "suspects": 99,
                                                       "code_length": 1, "balls": 1000})
    assert cfg["game_id"] == juego and cfg["completion_method"] == "puzzle"
    assert cfg["penalty_s"] == 120
    assert normalize_minigame_config("circuit_matrix", cfg) == cfg, "normalizar dos veces no cambia nada"
    if juego == "interrogatorio":
        assert cfg["suspects"] == 5
    if juego == "mastermind":
        assert cfg["code_length"] == 3
    if juego == "balanza":
        assert cfg["balls"] == 27


def test_el_nivel_manda_y_el_cinco_es_el_mas_dificil():
    m5 = normalize_minigame_config("circuit_matrix", {"game_id": "mastermind", "nivel": 5})
    assert (m5["code_length"], m5["symbols"], m5["repeats"], m5["rounds"]) == (5, 8, True, 3)
    b2 = normalize_minigame_config("circuit_matrix", {"game_id": "balanza", "nivel": 2})
    assert (b2["balls"], b2["weighings"], b2["rounds"]) == (9, 2, 3)
    i1 = normalize_minigame_config("circuit_matrix", {"game_id": "interrogatorio", "nivel": 1})
    assert (i1["suspects"], i1["cases"], i1["meta"]) == (3, 4, False)


def test_el_nivel_dos_dura_mas_que_un_minuto():
    """Óscar 30/10: 2-4 min en N2. Sin `meta`/rondas el nivel 2 se resolvía en ~40 s."""
    i2 = normalize_minigame_config("circuit_matrix", {"game_id": "interrogatorio", "nivel": 2})
    assert i2["cases"] >= 4 and i2["meta"] is True
    assert normalize_minigame_config("circuit_matrix", {"game_id": "mastermind", "nivel": 2})["rounds"] >= 2
    assert normalize_minigame_config("circuit_matrix", {"game_id": "balanza", "nivel": 2})["rounds"] >= 3
    assert normalize_minigame_config("circuit_matrix", {"game_id": "interrogatorio"})["meta"] is True, "N2 = defecto"


@pytest.mark.parametrize("juego", JUEGOS)
def test_semilla_distinta_por_jugador_y_estable(juego):
    cfg = {"game_id": juego}
    a = project_seeds_for_player(cfg, 7, "ANA")["seed"]
    assert a == project_seeds_for_player(cfg, 7, "ANA")["seed"]
    assert a != project_seeds_for_player(cfg, 7, "BEA")["seed"]
    assert a != project_seeds_for_player(cfg, 8, "ANA")["seed"]


@pytest.mark.parametrize("juego", JUEGOS)
def test_la_semilla_llega_al_movil(juego):
    """Sin `seed` en lo que se manda, el móvil caía a `nodo-<id>`: el mismo caso para todo el mundo."""
    from backend.app.runtime.mision import project_stage_for_player
    nodo = {"id": 7, "title": "x", "lat": 0, "lon": 0, "radius": 30,
            "minigame": {"type": "circuit_matrix", "config": {"game_id": juego}}, "config": {"game_id": juego}}
    a = project_stage_for_player(nodo, include_runtime=True, player_id="ANA")
    b = project_stage_for_player(nodo, include_runtime=True, player_id="BEA")
    assert a["config"]["seed"] == a["minigame"]["config"]["seed"] == project_seeds_for_player({"game_id": juego}, 7, "ANA")["seed"]
    assert a["config"]["seed"] != b["config"]["seed"]


def _nodo(juego):
    return {"id": 7, "type": "minigame", "minigame": {"type": "circuit_matrix", "config": {"game_id": juego, "penalty_s": 30}},
            "config": {"game_id": juego, "penalty_s": 30}}


@pytest.mark.parametrize("juego", JUEGOS)
def test_la_evidencia_caza_fallos_sin_pagar_y_partidas_relampago(juego):
    motivos = lambda h: {x.get("reason") or x.get("motivo") for x in h}  # noqa: E731
    bien = verificar_evidencia(_nodo(juego), "ANA", {"juego": juego, "fallos": 2, "ms": 95000}, penalty_ms=60000)
    assert not {"evidence_penalty_mismatch", "evidence_too_fast"} & motivos(bien)
    sin_pagar = verificar_evidencia(_nodo(juego), "ANA", {"juego": juego, "fallos": 2, "ms": 95000}, penalty_ms=0)
    assert "evidence_penalty_mismatch" in motivos(sin_pagar)
    relampago = verificar_evidencia(_nodo(juego), "ANA", {"juego": juego, "fallos": 0, "ms": 900}, penalty_ms=0)
    assert "evidence_too_fast" in motivos(relampago)
    sin_partida = verificar_evidencia(_nodo(juego), "ANA", None, penalty_ms=0)
    assert sin_partida, "completar con «OK» sin partida queda anotado"


def test_casos_propios_del_interrogatorio():
    """30/10: el organizador escribe sus casos; los que están a medio escribir se descartan y nada de eso llega a
    Mastermind o Balanza."""
    bueno = {"pregunta": "¿Quién?", "regla": "Sólo uno dice la verdad.", "culpable": 1,
             "sospechosos": [{"nombre": "Panadero", "frase": "Fue el farero."}, {"nombre": "Farero", "frase": "Yo no fui."}]}
    roto = {"sospechosos": [{"nombre": "Solo", "frase": "x"}], "culpable": 0}
    fuera = {**bueno, "culpable": 5}
    cfg = normalize_minigame_config("circuit_matrix", {"game_id": "interrogatorio", "casos_propios": [bueno, roto, fuera, "x"] + [bueno] * 10})
    assert cfg["casos_propios"][0] == bueno and len(cfg["casos_propios"]) == 8
    assert normalize_minigame_config("circuit_matrix", cfg) == cfg
    assert normalize_minigame_config("circuit_matrix", {"game_id": "interrogatorio"})["casos_propios"] == []
    assert "casos_propios" not in normalize_minigame_config("circuit_matrix", {"game_id": "balanza", "casos_propios": [bueno]})
