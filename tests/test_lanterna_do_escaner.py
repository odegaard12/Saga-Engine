# -*- coding: utf-8 -*-
"""El botón de la linterna no puede fallar en silencio.

El escáner de QR enseña un botón de linterna cuando el navegador dice que la
cámara tiene una. Al pulsarlo se pedía `applyConstraints({torch})` dentro de un
`try` con un `catch {}` **vacío**: si el móvil decía que sí y luego no podía,
no pasaba absolutamente nada. Ni luz, ni mensaje, ni el botón cambiando de
estado —`setTorchOn` sólo corre si la llamada sale bien—.

O sea: de noche, delante de una pegatina, dándole a un botón que dice
"🔦 OFF" y no hace nada, sin ninguna explicación. Es de los tres o cuatro
sitios donde un jugador se queda tirado.

Y no es un rincón raro: medido contra la misión real, **5 de los 10 nodos se
completan leyendo un QR**, y la ruta se camina hasta el atardecer.

Cuando falla se hacen dos cosas: se dice, y se retira el botón. Prometer una
linterna que no existe y dejarla ahí para que la sigan pulsando es peor que no
ofrecerla.

Los otros `catch {}` de este fichero y de `FieldCameraCapture` sí son
legítimos: preguntan `getCapabilities()`, que no todos los navegadores traen, y
no prometen nada al jugador. Esos se quedan.
"""
import re
from pathlib import Path

RAIZ = Path(__file__).resolve().parent.parent
ESCANER = RAIZ / "frontend" / "src" / "player" / "components" / "QuickProofPanel.tsx"


def sin_comentarios(fichero: Path) -> str:
    texto = fichero.read_text(encoding="utf-8")
    texto = re.sub(r"/\*.*?\*/", "", texto, flags=re.DOTALL)
    return re.sub(r"//[^\n]*", "", texto)


def cuerpo_de_toggle() -> str:
    codigo = sin_comentarios(ESCANER)
    inicio = codigo.index("async function toggleTorch")
    resto = codigo[inicio:]
    return resto[: resto.index("\n  }\n") + 4]


def test_o_fallo_da_lanterna_non_e_mudo():
    cuerpo = cuerpo_de_toggle()

    assert "catch {}" not in cuerpo, (
        "un catch vacío aquí deja al jugador pulsando un botón que no hace nada"
    )
    assert "setNotice(" in cuerpo, "hay que decirle al jugador que no se puede"


def test_cando_falla_retirase_o_boton():
    """El botón sólo aparece con `torchSupported`. Si falla, era mentira."""
    cuerpo = cuerpo_de_toggle()

    assert "setTorchSupported(false)" in cuerpo, (
        "si no se puede encender, no se sigue ofreciendo"
    )


def test_o_estado_da_lanterna_non_se_queda_a_medias():
    """`torchOn` en true con la luz apagada es mentir en la propia etiqueta."""
    cuerpo = cuerpo_de_toggle()

    encendido = cuerpo.index("setTorchOn")
    fallo = cuerpo.index("catch")
    assert encendido < fallo, "el estado se apunta sólo cuando la llamada sale bien"
    assert "setTorchOn(false)" in cuerpo, "al fallar, la etiqueta vuelve a apagado"


def test_o_boton_segue_dependendo_do_que_di_o_navegador():
    """Sin `torchSupported` no se enseña: no todos los móviles la tienen."""
    codigo = sin_comentarios(ESCANER)

    assert "torchSupported ? (" in codigo
