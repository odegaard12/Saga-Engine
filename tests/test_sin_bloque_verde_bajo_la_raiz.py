# -*- coding: utf-8 -*-
"""Regresión de 5.49.0: un bloque verde sólido en la parte inferior del iPhone.

La causa probable (no se pudo reproducir sin Safari real): la raíz de la app dependía de variables que cambiaba
JavaScript (`--saga-vista-*`) y de `100lvh`, y pintaba `--theme-bg` (verde) debajo del contenido. Cualquier desfase
entre la raíz y la ventana dejaba esa banda a la vista. Aquí se fija que:
  - ni html/body/#root ni el marco (ScreenFrame) pintan `--theme-bg`, sino el casi-negro de la barra de abajo;
  - la raíz no tiene `top`/`bottom`/`height` salidos de variables, ni `lvh`, ni valores negativos que la alarguen;
  - ninguna variable `--saga-vista-*`/`--saga-raiz-*` queda en el código del jugador.
"""
import re
from pathlib import Path

FRONT = Path(__file__).resolve().parent.parent / "frontend" / "src"


def leer(ruta: str) -> str:
    return (FRONT / ruta).read_text(encoding="utf-8")


def _marco() -> str:
    return leer("player/components/PlayerLayout.tsx").split("export function ScreenFrame(")[1].split("{children}")[0]


def test_el_fondo_bajo_la_raiz_no_es_el_del_tema():
    layout = leer("player/components/PlayerLayout.tsx")
    bloque = layout.split("export const globalPlayerEdgeFix = `")[1].split("`")[0]
    regla = bloque.split("html,\nbody,\n#root {")[1].split("}")[0]
    assert "var(--theme-bg)" not in re.sub(r"/\*.*?\*/", "", regla, flags=re.S)
    assert "rgb(var(--theme-ink-deep" in regla
    marco = _marco()
    assert "background: 'var(--theme-bg)'" not in marco
    assert "background: 'rgb(var(--theme-ink-deep" in marco


def test_la_raiz_no_se_mide_con_variables_ni_lvh():
    marco = _marco()
    assert "var(--saga" not in marco and "lvh" not in marco
    assert "position: mobile ? 'fixed' : 'relative'," in marco and "inset: mobile ? 0 : undefined," in marco


def test_ninguna_variable_de_vista_puede_alargar_la_raiz():
    for ruta in FRONT.rglob("*"):
        if ruta.suffix not in {".ts", ".tsx", ".css"} or "admin" in ruta.parts:
            continue
        t = ruta.read_text(encoding="utf-8", errors="ignore")
        # Sólo se admite en comentarios que expliquen la historia: nunca como propiedad CSS ni setProperty.
        assert not re.search(r"(var\(|setProperty\(\s*['\"]|^\s*)--saga-(vista|raiz)", t, flags=re.M), ruta.name
    css = leer("styles/mobile-shell.css")
    assert "100lvh" not in css and ".saga-raiz-movil" not in css
    vista = leer("player/utils/vistaTrasTeclado.ts")
    assert "setProperty" not in vista and "style.display" not in vista, "vistaTrasTeclado no toca el diseño"
    assert "compensacionDeVista" not in vista
