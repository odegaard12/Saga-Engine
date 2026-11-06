# -*- coding: utf-8 -*-
"""6/11: tres temas completos (Pizarra, Día, Solpor) sobre un solo juego de tokens --s-*.

- Pizarra es «ria» (el id no cambia) y es el tema por defecto: quien no toque nada ve lo de siempre.
- Día y Solpor declaran todos los tokens y, de ellos, los alias de siempre (--theme-*, --saga-pizarra-*, --r5/--r7).
- El mapa lee sus colores de los tokens al montarse y sólo vuelve a pintar si cambia el tema (nada en bucle).
"""
import re
from pathlib import Path

RAIZ = Path(__file__).resolve().parents[1]
CSS = (RAIZ / "frontend/src/mobile-themes.css").read_text(encoding="utf-8")
MAPA = (RAIZ / "frontend/src/player/components/MapSurfaceGL.tsx").read_text(encoding="utf-8")
TEMA_TS = (RAIZ / "frontend/src/shared/tema.ts").read_text(encoding="utf-8")
MAIN = (RAIZ / "main.py").read_text(encoding="utf-8")


def _bloque(selector):
    i = CSS.index(selector)
    return CSS[i : CSS.index("}", i)]


def _tokens(bloque):
    return dict(re.findall(r"(--s-[a-z0-9-]+):\s*([^;]+);", bloque))


def test_pizarra_es_ria_y_va_por_defecto():
    assert "{ id: 'ria', etiqueta: 'Pizarra" in TEMA_TS
    assert "export const TEMA_POR_DEFECTO: IdDeTema = 'ria'" in TEMA_TS
    assert 'theme = str(value or "ria")' in MAIN and '"player_theme": "ria"' in MAIN
    assert "var(--s-" not in _bloque("html.theme-ria,\nbody.theme-ria {"), "los alias de Pizarra no cambian"


def test_dia_y_solpor_declaran_todos_los_tokens_y_los_alias():
    raiz = _tokens(_bloque(":root {\n  --s-fondo:"))
    for tema in ("dia", "solpor"):
        b = _bloque(f"body.theme-{tema} {{")
        tokens = _tokens(b)
        assert set(raiz) <= set(tokens), f"a {tema} le faltan {sorted(set(raiz) - set(tokens))}"
        for alias in ("--theme-card: var(--s-superficie)", "--saga-pizarra: var(--s-superficie)", "--r5-fondo: var(--s-superficie)"):
            assert alias in b, f"{tema}: falta {alias}"


def test_el_mapa_de_pizarra_es_el_de_siempre():
    raiz = _tokens(_bloque(":root {\n  --s-fondo:"))
    for token, color in re.findall(r"\['(--s-[a-z-]+)', '(#[0-9a-f]{6})'\]", MAPA):
        assert raiz[token].strip() == color, f"{token}: Pizarra {raiz[token]} y el respaldo del mapa {color}"


def test_el_mapa_lee_los_tokens_al_montar_y_al_cambiar_el_tema():
    assert "refrescarColoresDelMapa()\n" in MAPA.split("new maplibregl.Map({")[0], "antes de crear el mapa"
    assert "attributeFilter: ['class']" in MAPA and "if (!refrescarColoresDelMapa() || !mapa) return" in MAPA
    assert "'line-color': colorDeLaRuta()" in MAPA and "'#16a34a', // no-tema" not in MAPA


def test_en_dia_los_botones_redondos_del_mapa_no_quedan_blanco_sobre_blanco():
    assert re.search(r"body\.theme-dia(?:\.theme-dia)* \[data-saga-map-control\] button[^{]*\{\s*color: var\(--s-texto\)", CSS)


def test_tanda3_el_panel_lleva_el_tema_y_pizarra_cae_en_su_color_de_siempre():
    """El panel lleva `data-tema-admin` (no la clase, que lo pintaría con las reglas del jugador) y sus colores son
    `var(--a-…, color de hoy)`: los --a-* sólo los declaran Día y Solpor, así que en Pizarra sale el de siempre."""
    app = (RAIZ / "frontend/src/admin/AdminApp.tsx").read_text(encoding="utf-8")
    assert "document.body.dataset.temaAdmin = temaDelPanel" in app
    raiz = CSS[: CSS.index("html.theme-dia,")]
    assert "--a-" not in re.sub(r"/\*.*?\*/", "", raiz, flags=re.DOTALL), "los --a-* no pueden existir en Pizarra"
    for tema in ("dia", "solpor"):
        assert f"body[data-tema-admin='{tema}']" in CSS
        assert "--a-texto: var(--s-texto);" in _bloque(f"body.theme-{tema} {{")
    shell = (RAIZ / "frontend/src/admin/styles/admin-modern-shell.css").read_text(encoding="utf-8")
    assert shell.count("var(--a-") > 700
    assert not re.search(r"var\(--a-[a-z0-9-]+\)", shell), "siempre con el color de hoy de respaldo"


def test_tanda3_el_jugador_elige_tema_en_herramientas_y_dia_se_lee():
    hud = (RAIZ / "frontend/src/player/components/PlayerHud.tsx").read_text(encoding="utf-8")
    assert "data-saga-tema-jugador" in hud and "elegirTemaDelJugador(id)" in hud
    assert "ponerClase(temaDelJugador() || tema)" in TEMA_TS
    assert "rgba(var(--s-aviso-rgb, 252, 211, 77), 0.72)" in (RAIZ / "frontend/src/player/components/minijuegos-hoja.css").read_text(encoding="utf-8")
    assert "body.theme-dia [data-saga-tiempo='chip'] b" in CSS


def test_tanda4_los_juegos_leen_el_tema_y_dia_y_solpor_ya_no_los_pisan():
    """Los colores fijos de los juegos pasan a `var(--a-…, color de hoy)` (Pizarra igual, píxel a píxel) y las reglas
    de Día y Solpor que pisaban hojas y juegos (.mg-*, .lg-*, .pulso-*) desaparecen."""
    tras = CSS[CSS.index("/* === 6/11 · Temas Pizarra"):]
    assert not re.search(r"\.(mg|lg|pulso)-", re.sub(r"/\*.*?\*/", "", tras, flags=re.DOTALL))
    juegos = RAIZ / "frontend/src/player/minigames/families"
    for f, minimo in (("logica/logica.css", 30), ("motionChallenge/RuntimeScreen.tsx", 25), ("placeMosaic/RuntimeScreen.tsx", 20)):
        assert (juegos / f).read_text(encoding="utf-8").count("var(--a-") >= minimo, f
    hoja = (RAIZ / "frontend/src/player/components/minijuegos-hoja.css").read_text(encoding="utf-8")
    assert "color: var(--s-acento-texto, #0b2440) !important;" in hoja
