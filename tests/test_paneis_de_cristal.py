# -*- coding: utf-8 -*-
"""Los paneles de cristal siguen al tema, y cada regla se declara una vez.

`.saga-glass-panel` es la cara del juego: 8 componentes, minijuegos incluidos.
Estaba declarada **dos veces** en `mobile-shell.css`. La primera leía las
variables del tema; la segunda las pisaba con un degradado gris a pelo y seis
`!important`. Gana la ultima, asi que el tema NO llegaba a los paneles: solo al
fondo de la pagina. Con el tema de fuego puesto, eso era rojo detras y paneles
grises delante.

Dos reglas con el mismo selector no dan ningun error: gana la ultima. Por eso
pasan desapercibidas y por eso son caras — se edita la primera, no cambia nada,
y no hay aviso ninguno. En este mismo fichero habia ademas cinco reglas del
selector de idioma duplicadas identicas.

Aqui se fija que el gancho del tema funciona de verdad y que no vuelve a haber
dos verdades sobre el mismo selector.
"""
import re
from pathlib import Path

RAIZ = Path(__file__).resolve().parent.parent
CARCASA = RAIZ / "frontend" / "src" / "styles" / "mobile-shell.css"
TEMAS = RAIZ / "frontend" / "src" / "mobile-themes.css"


def sin_comentarios(fichero: Path) -> str:
    return re.sub(r"/\*.*?\*/", "", fichero.read_text(encoding="utf-8"), flags=re.DOTALL)


def selectores(fichero: Path) -> dict[str, list[str]]:
    reglas: dict[str, list[str]] = {}
    for m in re.finditer(r"([^{}@]+)\{([^{}]*)\}", sin_comentarios(fichero)):
        sel = " ".join(m.group(1).split())
        if not sel or sel.startswith("@"):
            continue
        reglas.setdefault(sel, []).append(" ".join(m.group(2).split()))
    return reglas


def test_o_panel_de_cristal_declarase_unha_vez():
    veces = len(selectores(CARCASA).get(".saga-glass-panel", []))
    assert veces == 1, f".saga-glass-panel declarada {veces} veces: gana la ultima y confunde"


def test_o_panel_de_cristal_le_o_tema():
    cuerpo = selectores(CARCASA)[".saga-glass-panel"][0]

    assert "var(--saga-glass-bg)" in cuerpo, "el fondo tiene que venir del tema"
    assert "var(--saga-glass-border)" in cuerpo
    assert "!important" not in cuerpo, (
        "los !important estaban para ganarle a la copia de si misma, que ya no existe"
    )


def test_o_tema_da_fondo_aos_paneis():
    codigo = sin_comentarios(TEMAS)

    assert "--saga-glass-bg:" in codigo
    # Degradado, no color plano: los paneles pierden el relieve si no.
    assert "linear-gradient" in codigo


def test_o_selector_de_idioma_segue_o_tema():
    """Verde fijo sobre un tema rojo es lo que se ve mal de lejos."""
    cuerpo = " ".join(selectores(CARCASA).get(".saga-tools-language-row button.active", []))

    assert cuerpo, "falta la regla del idioma seleccionado"
    assert "--theme-primary" in cuerpo or "--saga-accent" in cuerpo, (
        "el idioma marcado tiene que ir del color del tema, no de un verde fijo"
    )


def test_non_hai_selectores_declarados_dúas_veces():
    culpables = []

    for fichero in (CARCASA, TEMAS):
        for sel, cuerpos in selectores(fichero).items():
            # `:root` y `html, body, #root` se reparten a proposito entre
            # bloques con @supports y consultas de medios alrededor.
            if sel in (":root", "html, body, #root", "body"):
                continue
            if len(cuerpos) > 1:
                culpables.append(f"{fichero.name}: {sel} x{len(cuerpos)}")

    assert not culpables, "selectores declarados mas de una vez:\n" + "\n".join(culpables)
