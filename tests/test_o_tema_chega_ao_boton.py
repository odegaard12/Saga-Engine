# -*- coding: utf-8 -*-
"""El botón principal y los tintes del HUD siguen al tema. El verde de señal, no.

Con el tema de fuego puesto en producción, el botón más grande de la pantalla
—el que abre el nodo, recoge el objeto o activa el GPS— seguía saliendo con un
degradado verde fijo: `linear-gradient(180deg, #22c55e, #16a34a)`. Fondo rojo,
botón verde. Es lo que peor se ve, porque es donde mira el jugador.

Lo mismo con los tintes verdes de las secciones del panel.

Pero NO todo verde es de marca, y confundirlo empeora el juego:

- `getGpsAccuracyColor` va verde → amarillo → naranja → rojo según la precisión.
  Es una escala semántica: verde quiere decir "buena señal". Pintarla del color
  del tema la deja sin significado, y en el monte la precisión es el dato que
  más se mira.
- El visor del escáner de QR va en verde porque contrasta contra casi cualquier
  superficie a cualquier hora, y porque no se confunde con un aviso de error.
  Eso es una decisión funcional, no decorativa.

Los tintes van por variables con valores explícitos por tema, no por
`color-mix`: un móvil que no lo entienda se quedaría sin fondo, y estas cosas se
juegan con lo que la gente lleve en el bolsillo.
"""
import re
from pathlib import Path

RAIZ = Path(__file__).resolve().parent.parent
FRONT = RAIZ / "frontend" / "src"

HUD = FRONT / "player" / "components" / "PlayerHud.tsx"
TEMAS = FRONT / "mobile-themes.css"
ESCANER = FRONT / "player" / "components" / "QuickProofPanel.tsx"

VERDE = re.compile(r"#22c55e|#16a34a|rgba\(34, ?197, ?94")


def test_o_tema_define_os_tintes():
    codigo = TEMAS.read_text(encoding="utf-8")

    for variable in ("--theme-tint", "--theme-tint-strong", "--theme-primary-border"):
        assert variable in codigo, f"falta {variable}"

    # Cada tema tiene que darles valor, no solo la paleta por defecto.
    for tema in ("body.theme-glass", "body.theme-flame-red"):
        inicio = codigo.index(tema)
        bloque = codigo[inicio : codigo.index("}", inicio)]
        assert "--theme-tint:" in bloque, f"{tema} no define su tinte"


def test_os_tintes_non_dependen_de_color_mix():
    """Un móvil que no entienda `color-mix` se quedaría sin fondo."""
    codigo = TEMAS.read_text(encoding="utf-8")

    bloques = re.findall(r"--theme-tint[a-z-]*:\s*([^;]+);", codigo)
    assert bloques, "no se encontraron los tintes"
    for valor in bloques:
        assert "color-mix" not in valor, f"tinte con color-mix: {valor}"


def test_o_boton_principal_segue_o_tema():
    codigo = HUD.read_text(encoding="utf-8")

    assert not VERDE.search(codigo.split("function getGpsAccuracyColor")[0]), (
        "queda verde de marca antes de la escala de precisión"
    )
    assert "var(--theme-primary)" in codigo, "el botón principal tiene que ir del tema"


def test_a_escala_de_precision_segue_sendo_semantica():
    """Verde = buena señal. Pintarla del tema la deja sin significado."""
    codigo = HUD.read_text(encoding="utf-8")

    inicio = codigo.index("function getGpsAccuracyColor")
    cuerpo = codigo[inicio : inicio + 400]

    assert "#4ade80" in cuerpo, "el verde de 'precisión excelente' se queda"
    assert "#f87171" in cuerpo, "y el rojo de 'precisión mala' también"
    assert "var(--theme" not in cuerpo, "esta escala no puede seguir al tema"


def test_o_visor_do_escaner_segue_en_verde():
    """Contrasta a cualquier hora y no se confunde con un error."""
    codigo = ESCANER.read_text(encoding="utf-8")

    assert "#4ade80" in codigo, "el visor del escáner se queda verde a propósito"
