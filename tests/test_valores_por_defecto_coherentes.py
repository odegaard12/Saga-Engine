# -*- coding: utf-8 -*-
"""Lo que propone el panel es lo que se juega.

El panel copia el `default_config` del registro (shared/game_registry.json) a
cada nodo nuevo, y lo que se juega de verdad es lo que normaliza el servidor
(`normalize_minigame_config`, backend/app/runtime/minigames.py). Si los dos
discrepan, los valores «endurecidos» del servidor no llegan nunca a un nodo
nuevo: pasó con el laberinto (9×9, 3 vidas, 360 ms frente a 11×11, 1 vida,
290 ms), el circuito, Caza-Señales, rumbo, trampa de palabras y relevo.

Aquí se fija que, para esos juegos, normalizar una config vacía y normalizar
el `default_config` del registro da lo mismo, y que el panel (ejecutado de
verdad con tests/js/registro_frontend.cjs) guarda esos mismos números y no
enseña campos que nadie lee.
"""
import copy
import json
import shutil
import subprocess
from pathlib import Path

import pytest

from backend.app.runtime.minigames import normalize_minigame_config

RAIZ = Path(__file__).resolve().parent.parent
REGISTRO = json.loads((RAIZ / "shared" / "game_registry.json").read_text(encoding="utf-8"))
POR_ID = {g["id"]: g for g in REGISTRO["games"]}

# Campos que no son de dificultad y se excluyen a propósito de la comparación.
EXCLUIDOS = {
    # Campo muerto (el servidor da 2 sin config, "normal" con la del registro;
    # ninguno de los dos cambia nada: el servidor ya manda filas, recorrido,
    # errores y ritmo resueltos). El panel no lo enseña.
    "logic_circuit": {"difficulty"},
    # El banco de preguntas es contenido, no un ajuste: sin config el servidor
    # rellena con plantillas, el registro trae ejemplos escritos.
    "trampa_palabras": {"questions"},
    # Sólo se emite si viene en la config (ver normalize_minigame_config); su
    # valor por defecto se comprueba aparte.
    "team_relay": {"required_members"},
}

JUEGOS = [
    "tilt_maze",
    "logic_circuit",
    "spark_radar",
    "bearing_hunt",
    "rumbo_doble",
    "trampa_palabras",
    "team_relay",
]


def _sin(config, claves):
    return {k: v for k, v in config.items() if k not in claves}


@pytest.mark.parametrize("game_id", JUEGOS)
def test_registro_propone_lo_mismo_que_aplica_el_servidor(game_id):
    juego = POR_ID[game_id]
    familia = juego["family"]
    # Sólo la identidad del juego (qué juego es), ningún número.
    identidad = {k: v for k, v in juego["default_config"].items() if k in ("game_id", "objective")}
    servidor = normalize_minigame_config(familia, {"game_id": game_id, **identidad})
    registro = normalize_minigame_config(familia, copy.deepcopy(juego["default_config"]))
    excluir = EXCLUIDOS.get(game_id, set())
    assert _sin(registro, excluir) == _sin(servidor, excluir)
    # Y el registro no trae números que el servidor luego cambie.
    for clave, valor in juego["default_config"].items():
        if clave in excluir:
            continue
        assert servidor.get(clave) == valor, f"{game_id}.{clave}: registro {valor!r}, servidor {servidor.get(clave)!r}"


def test_relevo_pide_dos_por_defecto_como_el_servidor():
    servidor = normalize_minigame_config("signal_hunt", {"game_id": "team_relay", "required_members": None})
    assert POR_ID["team_relay"]["default_config"]["required_members"] == servidor["required_members"] == 2


def test_laberinto_paso_de_la_bola_como_el_servidor():
    """El panel ponía 360 ms y la bola iba a saltos en los nodos nuevos."""
    assert POR_ID["tilt_maze"]["default_config"]["step_cooldown_ms"] == 290


def test_mosaico_guarda_lo_que_se_juega():
    """Antes se guardaba 2500 y se jugaba 5000 (remapeo en el editor y en el
    móvil). Ahora el nodo nuevo guarda 5000, que el servidor respeta tal cual
    y el móvil juega tal cual (>= 4000, sin remapeo)."""
    preview = POR_ID["place_mosaic"]["default_config"]["preview_ms"]
    assert preview == 5000
    assert normalize_minigame_config("circuit_matrix", copy.deepcopy(POR_ID["place_mosaic"]["default_config"]))[
        "preview_ms"
    ] == 5000


# ---------------------------------------------------------------------------
# Panel (frontend), ejecutado de verdad
# ---------------------------------------------------------------------------


@pytest.fixture(scope="module")
def frontend():
    node = shutil.which("node")
    if not node:
        pytest.skip("no hay Node para ejecutar los módulos TS del admin")
    if not (RAIZ / "frontend" / "node_modules" / "typescript").exists():
        pytest.skip("frontend/node_modules sin instalar")
    res = subprocess.run(
        [node, str(RAIZ / "tests" / "js" / "registro_frontend.cjs")],
        capture_output=True, text=True, encoding="utf-8", timeout=120, cwd=str(RAIZ),
    )
    assert res.returncode == 0, res.stderr[-2000:]
    return json.loads(res.stdout)


@pytest.mark.parametrize("game_id", JUEGOS + ["place_mosaic"])
def test_panel_guarda_los_numeros_del_registro(frontend, game_id):
    """Lo que guarda el panel al pulsar «Guardar» en un nodo nuevo conserva los
    valores por defecto (= los del servidor), sin pisarlos con los suyos."""
    guardado = frontend["juegos"][game_id]["guardado"]
    for clave, valor in POR_ID[game_id]["default_config"].items():
        if clave in EXCLUIDOS.get(game_id, set()):
            continue
        assert guardado.get(clave) == valor, f"{game_id}.{clave}: panel {guardado.get(clave)!r}, registro {valor!r}"


@pytest.mark.parametrize(
    "game_id,muertos",
    [
        ("team_relay", {"source_radius_m", "lock_threshold", "hold_ms"}),
        ("pulso_hierro", {"difficulty"}),
        ("logic_circuit", {"difficulty"}),
        ("spark_radar", {"difficulty"}),
    ],
)
def test_panel_no_ensena_campos_que_nadie_lee(frontend, game_id, muertos):
    claves = set(frontend["juegos"][game_id]["clavesGuiadas"] or [])
    assert not (claves & muertos), f"{game_id}: el panel enseña {sorted(claves & muertos)}"


def test_relevo_sigue_ensenando_jugadores_necesarios(frontend):
    assert "required_members" in frontend["juegos"]["team_relay"]["clavesGuiadas"]
