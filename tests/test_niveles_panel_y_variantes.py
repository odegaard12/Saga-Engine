# -*- coding: utf-8 -*-
"""30/10: selector de nivel 1-5 en el panel y variantes difíciles en el cliente.

El servidor ya mandaba fog_radius, reverse, rotate_pieces, allow_reference y double_tap_ratio, pero ningún juego los
leía. Sin esos campos (sin nivel, o nivel 2) cada juego se juega EXACTAMENTE como antes: las comprobaciones de abajo
fijan también los valores por defecto.
"""
from pathlib import Path

RAIZ = Path(__file__).resolve().parents[1]
F = RAIZ / "frontend" / "src"
FAM = F / "player" / "minigames" / "families"


def leer(*p):
    return (F.joinpath(*p) if p[0] != "fam" else FAM.joinpath(*p[1:])).read_text(encoding="utf-8")


def test_el_panel_tiene_el_selector_y_marca_los_retoques_a_mano():
    ed = leer("admin", "components", "AdminGameEditor.tsx")
    assert "<SelectorDeNivel" in ed and "marcarNivelAMano(selectedGame.id, config," in ed
    assert "key === 'nivel' || key === 'nivel_a_mano'" in ed, "el nivel no se edita como campo suelto"
    sel = leer("admin", "components", "niveles", "SelectorDeNivel.tsx")
    assert "Como está" in sel and "estimacionDeNivel" in sel and "textoDeNivel" in sel
    assert "nivel_a_mano: false" in sel and "{ ...siguiente, nivel_a_mano: true }" in sel
    assert "Si lo cambias con gente jugando" in sel


def test_laberinto_niebla_y_17x17():
    s = leer("fam", "tiltMaze", "RuntimeScreen.tsx")
    assert "clamp(config.grid_rows, 9, 5, 17)" in s and "clamp(config.grid_cols, 9, 5, 17)" in s
    assert "const niebla = clamp(config.fog_radius, 0, 0, 8)" in s, "sin fog_radius no hay niebla (como hoy)"
    assert "index !== maze.goal" in s and "enNiebla ? 'fog' : ''" in s


def test_matriz_al_reves_y_7x7():
    s = leer("fam", "circuitMatrix", "RuntimeScreen.tsx")
    assert "const alReves = resolved.config.reverse === true" in s
    assert "path[path.length - 1 - selected.length]" in s
    c = leer("fam", "circuitMatrix", "circuitConfig.ts")
    assert "profile.rows), 4, 7)" in c and "profile.cols), 4, 7)" in c


def test_mosaico_piezas_giradas_y_referencia_opcional():
    s = leer("fam", "placeMosaic", "RuntimeScreen.tsx")
    assert "clampInteger(config.grid_size ?? config.grid_cols, 3, 2, 5)" in s
    assert "const girarPiezas = config.rotate_pieces === true" in s
    assert "const conReferencia = config.allow_reference !== false" in s, "por defecto sigue habiendo referencia"
    assert "value === index && !(giros?.[value] ?? 0)" in s, "resuelto = en su sitio Y derecha"


def test_radar_doble_toque():
    s = leer("fam", "sparkRadar", "RuntimeScreen.tsx")
    assert "readNumber(config, 'double_tap_ratio', 0)" in s, "sin el campo no hay dobles (como hoy)"
    assert "spark.doble && !spark.tocada" in s


def test_juegos_antiguos_acordes_a_d1():
    css = leer("player", "components", "minijuegos-hoja.css")
    assert ".motion-button:not(.secondary):not(.danger):not(.success)" in css, "el «Iniciar» blanco pasa al azul"
    assert ".circuit-status strong" in css and ".motion-title" in css
    assert "@media (max-height: 760px)" in css
    radar = leer("fam", "sparkRadar", "RuntimeScreen.tsx")
    assert "#042f2e" not in radar and "background: 'var(--theme-primary)'" in radar
