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
                             ("trampa_palabras", "n_rounds"), ("sequence_code", "levels"),
                             ("pulso_hierro", "pulso_target_rounds"), ("shake_charge", "energy_target")):
        v = valores(clave, parametro)
        assert v == sorted(v), f"{clave}.{parametro} no crece con el nivel: {v}"
    # 15/11: el circuito del nivel 3 y 5 se repite AL REVÉS (9 y 12 casillas, más cortas a propósito): repetirlo del
    # revés cuenta como 1,3 veces más difícil, y con eso sigue creciendo.
    circuito = [n["params"]["path_length"] * (1.3 if n["params"]["reverse"] else 1) for n in JUEGOS["logic_circuit"]["niveles"].values()]
    assert circuito == sorted(circuito), f"logic_circuit no crece con el nivel: {circuito}"
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


# ---------------------------------------------------------------------------
# 15/11/2026: decisiones de Óscar tras la crítica con bots (solo parámetros: los niveles altos deben poder completarse).
# ---------------------------------------------------------------------------
def _params(clave, nivel):
    return JUEGOS[clave]["niveles"][str(nivel)]["params"]


def test_15_11_simon_rondas_tope_y_fallo_de_diez_segundos():
    assert [_params("sequence_code", n)["levels"] for n in range(1, 6)] == [4, 5, 6, 6, 7]
    assert {_params("sequence_code", n)["penalty_s"] for n in range(1, 6)} == {10}
    sin_nivel = normalize_minigame_config("circuit_matrix", {"game_id": "sequence_code"})
    assert sin_nivel["levels"] == 5 and sin_nivel["penalty_s"] == 10
    ts = (RAIZ / "frontend" / "src" / "player" / "minigames" / "families" / "sequenceCode" / "EcoRitmicoRuntimeScreen.tsx").read_text(encoding="utf-8")
    assert "const TOPE_GOLPES = 6" in ts and "Math.min(TOPE_GOLPES, ronda + 2)" in ts
    assert "semillaDelIntento(cfg, stage?.id, 0)" in ts, "al reintentar sale la MISMA secuencia"


def test_15_11_circuito_casillas_y_dos_errores():
    assert [(_params("logic_circuit", n)["path_length"], _params("logic_circuit", n)["reverse"]) for n in range(2, 6)] == [
        (10, False), (9, True), (13, False), (12, True)]
    assert {_params("logic_circuit", n)["max_errors"] for n in range(2, 6)} == {2}


def test_15_11_laberinto_n2_tres_vidas_120_s_y_un_laberinto_por_nodo():
    n2 = _params("tilt_maze", 2)
    assert n2["lives"] == 3 and n2["time_limit_s"] == 120
    from backend.app.runtime.minigames import project_seeds_for_player

    cfg = normalize_minigame_config("circuit_matrix", {"game_id": "tilt_maze", "nivel": 2})
    uno = project_seeds_for_player(cfg, 7, "ana")["maze_seed"]
    otro = project_seeds_for_player(cfg, 7, "bea")["maze_seed"]
    assert uno == otro, "en el nivel 2 todos los jugadores de un nodo juegan el mismo laberinto"
    assert uno != project_seeds_for_player(cfg, 8, "ana")["maze_seed"], "pero cada nodo tiene el suyo"
    # Sin nivel, o en otro nivel, sigue habiendo un laberinto por jugador.
    cfg3 = normalize_minigame_config("circuit_matrix", {"game_id": "tilt_maze", "nivel": 3})
    assert project_seeds_for_player(cfg3, 7, "ana")["maze_seed"] != project_seeds_for_player(cfg3, 7, "bea")["maze_seed"]
    cfg0 = normalize_minigame_config("circuit_matrix", {"game_id": "tilt_maze"})
    assert project_seeds_for_player(cfg0, 7, "ana")["maze_seed"] != project_seeds_for_player(cfg0, 7, "bea")["maze_seed"]
    # Una semilla puesta a propósito por el organizador manda siempre.
    fija = normalize_minigame_config("circuit_matrix", {"game_id": "tilt_maze", "nivel": 2, "maze_seed": "mia"})
    assert project_seeds_for_player(fija, 7, "ana") == {"maze_seed": "mia"}


def test_15_11_mosaico_n3_sin_giros_dinamo_y_pulso_n5():
    assert [_params("place_mosaic", n)["rotate_pieces"] for n in range(1, 6)] == [False, False, False, True, True]
    assert [_params("shake_charge", n)["dinamo_segundos"] for n in range(1, 6)] == [12, 12, 15, 15, 18]
    n5 = _params("pulso_hierro", 5)
    assert n5["pulso_growth_per_round"] == 1 and n5["pulso_tap_window_ms"] >= 1800, "el nivel 5 ya no crece de 2 en 2"


def test_15_11_trampa_diez_segundos_y_dos_extras():
    from backend.app.runtime.minigames import WORD_TRAP_MAX_EXTRA_ROUNDS, WORD_TRAP_PENALTY_MS

    assert WORD_TRAP_PENALTY_MS == 10_000 and WORD_TRAP_MAX_EXTRA_ROUNDS == 2


def test_15_11_el_modo_sin_sensor_cuesta_25_s_en_faros_y_pulso_y_60_s_en_laberinto_y_dinamo():
    base = RAIZ / "frontend" / "src" / "player" / "minigames"
    mod = (base / "core" / "modoAlternativo.ts").read_text(encoding="utf-8")
    assert "PENALIZACION_MODO_ALTERNATIVO_LENTO_MS = 25_000" in mod and "PENALIZACION_MODO_ALTERNATIVO_MS = 60_000" in mod
    for ruta in ("bearingHunt/FarosRuntimeScreen.tsx", "motionChallenge/PulsoHierroRuntimeScreen.tsx"):
        assert "PENALIZACION_MODO_ALTERNATIVO_LENTO_MS" in (base / "families" / ruta).read_text(encoding="utf-8"), ruta
    for ruta in ("tiltMaze/RuntimeScreen.tsx", "motionChallenge/DinamoRuntimeScreen.tsx"):
        fuente = (base / "families" / ruta).read_text(encoding="utf-8")
        assert "LENTO" not in fuente.replace("lentos", "").replace("lento,", ""), f"{ruta}: aquí los botones son más rápidos: sigue en 60 s"


def test_15_11_las_paredes_del_laberinto_usan_variables_del_tema_y_tienen_contraste():
    fuente = (RAIZ / "frontend" / "src" / "player" / "minigames" / "families" / "tiltMaze" / "RuntimeScreen.tsx").read_text(encoding="utf-8")
    assert "border-color:var(--theme-text, #fff)" in fuente and "background:var(--theme-bg, #0a0c0e)" in fuente
    assert "rgba(var(--theme-done), 0.2);background:transparent" not in fuente, "las paredes a 0,2 de alfa eran 1,12-1,56:1"

    def lum(rgb):
        def lin(c):
            c /= 255
            return c / 12.92 if c <= 0.03928 else ((c + 0.055) / 1.055) ** 2.4
        return 0.2126 * lin(rgb[0]) + 0.7152 * lin(rgb[1]) + 0.0722 * lin(rgb[2])

    def hexa(h):
        return tuple(int(h[i:i + 2], 16) for i in (1, 3, 5))

    temas = (RAIZ / "frontend" / "src" / "mobile-themes.css").read_text(encoding="utf-8")
    # (texto, fondo) de cada tema con el trazo al 85 % sobre el fondo, como en el color-mix de la pared.
    for nombre, texto, fondo in (("glass", "#ffffff", "#020617"), ("flame-red", "#ffffff", "#331613"), ("dia", "#1c2530", "#f3efe7")):
        assert fondo in temas, nombre
        t, f = hexa(texto), hexa(fondo)
        mezcla = tuple(t[i] * 0.85 + f[i] * 0.15 for i in range(3))
        a, b = sorted((lum(mezcla), lum(f)), reverse=True)
        assert (a + 0.05) / (b + 0.05) >= 3, nombre


def test_15_11_cuenta_senales_la_pista_corto_largo_sale_una_vez_por_pregunta():
    fuente = (RAIZ / "frontend" / "src" / "player" / "minigames" / "families" / "signalHunt" / "CuentaSenalesRuntimeScreen.tsx").read_text(encoding="utf-8")
    assert "pistaUsadaRef.current.has(preguntaIdx)" in fuente
