# -*- coding: utf-8 -*-
"""Un código de respaldo rechazado no cierra la casilla ni borra lo escrito.

El código de respaldo es la salida de emergencia: alguien atascado en un
minijuego, de pie en el monte, escribe el código impreso y sigue. Cuesta dos
minutos de penalización, así que no se usa por gusto.

Comprobado jugando la ruta en el banco de ensayo, con un código equivocado:

- el nodo NO avanza — bien,
- sale el aviso "Código no aceptado. Inténtalo de nuevo." — bien,
- y la casilla **se cierra y se vacía** — mal.

`onSubmitCode` devuelve si el nodo llegó a superarse; el escáner de QR ya mira
ese valor para no cantar victoria en falso. La casilla de respaldo lo ignoraba y
cerraba pase lo que pase.

Lo más probable con un código escrito a mano es una errata. Cerrar la casilla
tira lo tecleado y obliga a reabrir y reescribirlo entero, con el móvil en una
mano y de noche. Si no se acepta, lo que hay que hacer es dejarlo ahí para
corregir una letra.
"""
import re
from pathlib import Path

RAIZ = Path(__file__).resolve().parent.parent
HOJA = RAIZ / "frontend" / "src" / "player" / "components" / "InteractionSheet.tsx"


def cuerpo() -> str:
    texto = HOJA.read_text(encoding="utf-8")
    texto = re.sub(r"/\*.*?\*/", "", texto, flags=re.DOTALL)
    texto = re.sub(r"//[^\n]*", "", texto)

    inicio = texto.index("async function handleSheetFallbackSubmit")
    resto = texto[inicio:]
    return resto[: resto.index("\n  }\n") + 4]


def test_mirase_se_o_codigo_foi_aceptado():
    c = cuerpo()

    assert re.search(r"(const|let)\s+\w+\s*=\s*await onSubmitCode", c), (
        "hay que quedarse con lo que devuelve onSubmitCode: dice si el nodo se superó"
    )


def test_se_non_se_acepta_non_se_pecha_a_casilla():
    c = cuerpo()

    cierre = c.index("setFallbackOpen(false)")
    antes = c[:cierre]

    assert "if (" in antes.split("await onSubmitCode")[-1], (
        "cerrar la casilla tiene que depender de que el código se aceptara"
    )


def test_se_non_se_acepta_non_se_borra_o_escrito():
    """Con una errata, borrar lo tecleado obliga a escribirlo todo otra vez."""
    c = cuerpo()

    borrado = c.index("setFallbackInputCode('')")
    cierre = c.index("setFallbackOpen(false)")
    condicion = c.index("if (", c.index("await onSubmitCode"))

    assert condicion < borrado and condicion < cierre, (
        "borrar y cerrar van dentro del caso en que se acepta"
    )
