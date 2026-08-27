# -*- coding: utf-8 -*-
"""sparkRadar, el último de los cinco minijuegos de docs/plan-de-mejora.md,
4.2. A diferencia de los otros cuatro, aquí las formas no viven en una
plantilla CSS sino en objetos `CSSProperties` de React -mismo bloqueo, otra
sintaxis-.

De las 8 formas en línea, 4 son decorativas (tarjetas del HUD, barra de
progreso, resumen, botón) y pasan a las variables del tema. Las otras 4 —el
radar, sus anillos, el barrido y el blip que se toca— se dejan en `'50%'` a
propósito: **son** un radar, tienen que leerse como un radar en cualquier
tema. Es información (la forma del propio juego), no decoración, igual que
la bola de tiltMaze o los alfileres del mapa.
"""
import re
from pathlib import Path

RAIZ = Path(__file__).resolve().parent.parent
RUNTIME = RAIZ / "frontend" / "src" / "player" / "minigames" / "families" / "sparkRadar" / "RuntimeScreen.tsx"


def codigo() -> str:
    return RUNTIME.read_text(encoding="utf-8")


def constante(nombre: str) -> str:
    texto = codigo()
    marca = f"const {nombre}: CSSProperties = {{"
    inicio = texto.index(marca)
    return texto[inicio : texto.index("\n}", inicio)]


SEGUEN_O_TEMA = {
    "hudBlock": "card",
    "progressTrack": "pill",
    "resumo": "card",
    "primaryButton": "card",
}

RADAR_SEN_TOCAR = ("radar", "sweep", "sparkButton")


def test_o_que_e_decorativo_segue_a_variable_do_tema():
    for nombre, escala in SEGUEN_O_TEMA.items():
        b = constante(nombre)
        assert re.search(rf"borderRadius:\s*'var\(--theme-radius-{escala}", b), (
            f"{nombre} sigue con una forma clavada en píxeles"
        )


def test_o_radar_e_o_que_toca_seguen_redondos_en_calquera_tema():
    for nombre in RADAR_SEN_TOCAR:
        assert f"const {nombre}" in codigo() or f"function {nombre}" in codigo(), (
            f"no se encontró {nombre}"
        )

    # ring() es una función, no una constante; se comprueba aparte.
    assert "borderRadius: '50%'" in codigo(), (
        "el radar dejó de ser redondo, o alguien lo cambió sin tocar el comentario"
    )
    assert "NO siguen al tema" in codigo(), (
        "falta el comentario que explica por qué el radar no sigue al tema"
    )
