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


def test_o_tema_de_fogo_ten_esquinas_duras_e_sen_desenfoque():
    """Si no cambia la forma, no es otro tema: es el mismo con otro color."""
    b = bloque("body.theme-flame-red")

    radio = re.search(r"--theme-radius-panel:\s*(\d+)px", b)
    assert radio and int(radio.group(1)) <= 6, (
        "el tema de fuego tiene que tener esquinas duras"
    )
    assert re.search(r"--theme-blur:\s*none", b), "el tema de fuego no lleva desenfoque"


def test_os_dous_temas_non_teñen_a_mesma_forma():
    """La prueba que impide que esto vuelva a ser un cambio de color."""
    g = bloque("body.theme-glass")
    f = bloque("body.theme-flame-red")

    for variable in FORMAS:
        vg = re.search(rf"{re.escape(variable)}:\s*([^;]+);", g)
        vf = re.search(rf"{re.escape(variable)}:\s*([^;]+);", f)
        assert vg and vf, f"falta {variable} en algún tema"
        assert vg.group(1).strip() != vf.group(1).strip(), (
            f"{variable} vale lo mismo en los dos: eso no es otro diseño"
        )


def test_o_panel_de_cristal_le_a_forma_do_tema():
    carcasa = (FRONT / "styles" / "mobile-shell.css").read_text(encoding="utf-8")
    inicio = carcasa.index(".saga-glass-panel {")
    b = carcasa[inicio : carcasa.index("}", inicio)]

    assert "var(--theme-radius-panel)" in b
    assert "var(--theme-blur)" in b
