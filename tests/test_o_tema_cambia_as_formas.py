# -*- coding: utf-8 -*-
"""Un tema cambia las FORMAS, no sólo los colores.

Hasta ahora el tema pintaba: fondo, acentos, tintes. Pero la cara del juego
—esquinas muy redondeadas y desenfoque fuerte— era la misma en los dos, así que
elegir "fuego" se veía como un parche de color sobre el mismo diseño.

Medido en el banco, ordenando por área visible:

    saga-glass-panel   radio 24px   blur(22px)   66 597 px²
    tarjetas de permisos  16px      blur(8px)    33 104 px²
    barra del HUD         28px      blur(24px)   13 282 px²

Todas con el estilo EN LÍNEA, que es por lo que una regla de CSS no las tocaba.

Ahora la forma también sale del tema:

- `glass` se queda como estaba: redondeado y con desenfoque. Es el tema de
  siempre y no se toca.
- `flame-red` es otro diseño: esquinas duras, sin desenfoque y borde marcado.
  Se nota de un vistazo, que es de lo que se trata.
"""
import re
from pathlib import Path

RAIZ = Path(__file__).resolve().parent.parent
FRONT = RAIZ / "frontend" / "src"
TEMAS = FRONT / "mobile-themes.css"

FORMAS = ("--theme-radius-panel", "--theme-radius-card", "--theme-radius-pill", "--theme-blur")


def css() -> str:
    return re.sub(r"/\*.*?\*/", "", TEMAS.read_text(encoding="utf-8"), flags=re.DOTALL)


def bloque(tema: str) -> str:
    c = css()
    inicio = c.index(tema)
    return c[inicio : c.index("}", inicio)]


def test_cada_tema_define_as_suas_formas():
    for tema in ("body.theme-glass", "body.theme-flame-red"):
        b = bloque(tema)
        for variable in FORMAS:
            assert f"{variable}:" in b, f"{tema} no define {variable}"


def test_o_tema_de_cristal_segue_redondeado_e_con_desenfoque():
    """Es el tema de siempre: cambiarlo seria romper lo que ya funcionaba."""
    b = bloque("body.theme-glass")

    radio = re.search(r"--theme-radius-panel:\s*(\d+)px", b)
    assert radio and int(radio.group(1)) >= 18, "el cristal tiene que seguir redondeado"
    assert "blur(" in b, "el cristal lleva desenfoque"


def test_o_tema_de_fogo_e_mais_pechado_e_opaco():
    """Menos redondo que cristal, y sin desenfoque: es opaco a propósito.

    Esta prueba exigía antes esquinas DURAS -radio de 6px o menos-. Se escribió
    cuando el tema de fuego eran placas industriales, y ese diseño se descartó
    al verlo en pantalla: quedaba bruto y peleaba con los emoticonos. Ahora las
    formas vuelven a ser redondeadas y lo que da carácter es el adorno.

    Lo que se sigue exigiendo: que sea más cerrado que cristal, y que no lleve
    desenfoque, porque las barras tienen que tapar el mapa.
    """
    f = bloque("body.theme-flame-red")
    g = bloque("body.theme-glass")

    rf = int(re.search(r"--theme-radius-panel:\s*(\d+)px", f).group(1))
    rg = int(re.search(r"--theme-radius-panel:\s*(\d+)px", g).group(1))

    assert rf < rg, "fuego tiene que ser menos redondo que cristal (%d vs %d)" % (rf, rg)
    assert re.search(r"--theme-blur:\s*none", f), "el tema de fuego no lleva desenfoque"


def test_os_dous_temas_non_teñen_a_mesma_cara():
    """La prueba que impide que esto vuelva a ser un cambio de color.

    Antes pedía que TODAS las variables de forma fuesen distintas. Con el
    diseño nuevo varias coinciden a propósito -el radio de pastilla, el grosor
    del borde-, porque la diferencia ya no está en la geometría sino en el
    adorno: las llamas del filo y las brasas de las esquinas.

    Así que se piden las dos cosas: alguna forma distinta, y adorno propio.
    """
    g = bloque("body.theme-glass")
    f = bloque("body.theme-flame-red")

    distintas = []
    for variable in FORMAS:
        vg = re.search(rf"{re.escape(variable)}:\s*([^;]+);", g)
        vf = re.search(rf"{re.escape(variable)}:\s*([^;]+);", f)
        assert vg and vf, f"falta {variable} en algún tema"
        if vg.group(1).strip() != vf.group(1).strip():
            distintas.append(variable)

    assert distintas, "ninguna forma cambia: eso es el mismo diseño con otro color"

    css = TEMAS.read_text(encoding="utf-8")

    # El adorno ha ido cambiando -placas, luego llamas, las dos descartadas al
    # verlas-. Lo único que se exige es que fuego tenga ALGO propio que cristal
    # no tenga, no una decoración concreta.
    assert "--theme-brasa" in css, "fuego se quedó sin nada propio que lo distinga"

    propio = css.split("--theme-brasa")[1][:600]
    assert "theme-glass" not in propio, "lo propio del fuego no puede alcanzar a cristal"


def test_o_panel_de_cristal_le_a_forma_do_tema():
    carcasa = (FRONT / "styles" / "mobile-shell.css").read_text(encoding="utf-8")
    inicio = carcasa.index(".saga-glass-panel {")
    b = carcasa[inicio : carcasa.index("}", inicio)]

    assert "var(--theme-radius-panel)" in b
    assert "var(--theme-blur)" in b
