# -*- coding: utf-8 -*-
"""26/10: niveles 1-5 de los minijuegos (backend/app/runtime/niveles.py + niveles_minijuegos.json).

Contrato: sin `nivel` no cambia NADA; el nivel 2 es lo de hoy (los valores por defecto del normalizador); con `nivel`
manda la tabla; con `nivel_a_mano` manda lo que escribió el organizador; el cliente lee la misma tabla (generada).
"""
import json
import shutil
import subprocess
from pathlib import Path

import pytest

from backend.app.runtime import niveles
from backend.app.runtime.minigames import normalize_minigame_config

RAIZ = Path(__file__).resolve().parent.parent
TABLA = niveles.tabla()
JUEGOS = TABLA["juegos"]

# clave de la tabla -> (tipo técnico, config mínima que identifica al juego)
TIPO_DE = {
    "tilt_maze": ("circuit_matrix", {"game_id": "tilt_maze"}),
    "spark_radar": ("circuit_matrix", {"game_id": "spark_radar"}),
    "logic_circuit": ("circuit_matrix", {"game_id": "logic_circuit"}),
    "place_mosaic": ("circuit_matrix", {"game_id": "place_mosaic"}),
    "sequence_code": ("circuit_matrix", {"game_id": "sequence_code"}),
    "trampa_palabras": ("word_trap", {}),
    "pulso_hierro": ("motion_challenge", {"game_id": "pulso_hierro"}),
    "shake_charge": ("motion_challenge", {"game_id": "shake_charge"}),
    "rumbo_doble": ("bearing_hunt", {"game_id": "rumbo_doble"}),
    "cuenta_senales": ("signal_hunt", {"game_id": "cuenta_senales"}),
    "audio_challenge": ("audio_challenge", {}),
    "interrogatorio": ("circuit_matrix", {"game_id": "interrogatorio"}),
    "mastermind": ("circuit_matrix", {"game_id": "mastermind"}),
    "balanza": ("circuit_matrix", {"game_id": "balanza"}),
}


def _norm(clave, **extra):
    tipo, base = TIPO_DE[clave]
    return normalize_minigame_config(tipo, {**base, **extra})


def test_la_tabla_tiene_los_cinco_niveles_de_cada_juego_y_todos_estan_cubiertos():
    assert set(JUEGOS) == set(TIPO_DE)
    assert set(TABLA["estimacion"]) == {"1", "2", "3", "4", "5"} == set(TABLA["nombres_de_nivel"])
    for clave, juego in JUEGOS.items():
        assert set(juego["niveles"]) == {"1", "2", "3", "4", "5"}, clave
        claves = {tuple(sorted(n["params"])) for n in juego["niveles"].values()}
        assert len(claves) == 1, f"{clave}: todos los niveles fijan los mismos parámetros"
        assert all(n["texto"] for n in juego["niveles"].values()), clave


@pytest.mark.parametrize("clave", sorted(JUEGOS))
def test_el_nivel_dos_es_lo_de_hoy(clave):
    """Sin `nivel` y con nivel 2 sale lo mismo en los parámetros que fija la tabla: las misiones no cambian."""
    sin = _norm(clave)
    con = _norm(clave, nivel=2)
    for parametro in JUEGOS[clave]["niveles"]["2"]["params"]:
        assert con[parametro] == sin[parametro], f"{clave}.{parametro}: el nivel 2 no es lo de hoy"
    assert "nivel" not in sin, "sin `nivel` no se inventa uno"
    assert con["nivel"] == 2 and con["nivel_a_mano"] is False


@pytest.mark.parametrize("clave", sorted(JUEGOS))
def test_cada_nivel_llega_entero_al_jugador(clave):
    """El normalizador no recorta ni cambia ningún valor de la tabla (topes bien puestos)."""
    for nivel in range(1, 6):
        salida = _norm(clave, nivel=nivel)
        for parametro, valor in JUEGOS[clave]["niveles"][str(nivel)]["params"].items():
            assert salida[parametro] == valor, f"{clave} N{nivel}.{parametro}: {salida[parametro]!r} != {valor!r}"
        assert salida["nivel"] == nivel


def test_sin_nivel_la_config_no_cambia_aunque_traiga_valores_raros():
    antes = normalize_minigame_config("circuit_matrix", {"game_id": "tilt_maze", "hole_count": 5, "grid_rows": 9})
    assert antes["hole_count"] == 5 and antes["grid_rows"] == 9 and "nivel" not in antes


def test_con_nivel_manda_la_tabla_y_a_mano_manda_el_organizador():
    manda = _norm("tilt_maze", nivel=3, hole_count=2, grid_rows=7)
    assert manda["hole_count"] == 16 and manda["grid_rows"] == 13
    a_mano = _norm("tilt_maze", nivel=3, nivel_a_mano=True, hole_count=2, grid_rows=7)
    assert a_mano["hole_count"] == 2 and a_mano["grid_rows"] == 7
    assert a_mano["nivel"] == 3 and a_mano["nivel_a_mano"] is True


def test_nivel_de_acota_y_tolera_basura():
    assert niveles.nivel_de({}) == niveles.NIVEL_POR_DEFECTO == 2
    assert niveles.nivel_de({"nivel": None}) == 2
    assert niveles.nivel_de({"nivel": "x"}) == 2
    assert niveles.nivel_de({"nivel": True}) == 2
    assert niveles.nivel_de({"nivel": 0}) == 1
    assert niveles.nivel_de({"nivel": 99}) == 5
    assert niveles.nivel_de({"nivel": "4"}) == 4
    assert niveles.nivel_de({"nivel": 3.9}) == 3


def test_un_juego_sin_niveles_ignora_el_campo():
    salida = normalize_minigame_config("signal_hunt", {"game_id": "mapa_mudo", "nivel": 5})
    assert "nivel" not in salida


def test_los_niveles_suben_de_dificultad_en_lo_que_mide_el_tiempo():
    """Sanidad de la tabla: más nivel, más (o igual) tarea. No es una medida de duración (falta calibrar)."""
    def valores(clave, parametro):
        return [JUEGOS[clave]["niveles"][str(n)]["params"][parametro] for n in range(1, 6)]

    for clave, parametro in (("tilt_maze", "hole_count"), ("tilt_maze", "grid_rows"), ("spark_radar", "target_hits"),
                             ("logic_circuit", "path_length"), ("trampa_palabras", "n_rounds"), ("sequence_code", "levels"),
                             ("pulso_hierro", "pulso_target_rounds"), ("shake_charge", "energy_target")):
        v = valores(clave, parametro)
        assert v == sorted(v), f"{clave}.{parametro} no crece con el nivel: {v}"
    for clave, parametro in (("spark_radar", "spawn_interval_ms"), ("trampa_palabras", "time_limit_s"),
                             ("sequence_code", "step_ms"), ("pulso_hierro", "pulso_tap_window_ms"),
                             ("logic_circuit", "preview_cell_ms")):
        v = valores(clave, parametro)
        assert v == sorted(v, reverse=True), f"{clave}.{parametro} no baja con el nivel: {v}"


def test_el_cliente_lee_la_misma_tabla_generada():
    node = shutil.which("node")
    if not node:
        pytest.skip("sin Node no se puede comprobar la tabla generada")
    r = subprocess.run([node, str(RAIZ / "frontend" / "scripts" / "generar-niveles.mjs"), "--check"],
                       capture_output=True, text=True, cwd=str(RAIZ))
    assert r.returncode == 0, r.stderr or "niveles.generado.ts desincronizado: node frontend/scripts/generar-niveles.mjs"


def test_el_helper_del_cliente_tiene_el_contrato():
    ts = (RAIZ / "frontend" / "src" / "player" / "minigames" / "core" / "nivel.ts").read_text(encoding="utf-8")
    for nombre in ("export function nivelDe", "export function porNivel", "export function parametrosDeNivel",
                   "export function textoDeNivel", "export const NIVEL_POR_DEFECTO"):
        assert nombre in ts, nombre
    assert "NIVEL_POR_DEFECTO: Nivel = 2" in ts
