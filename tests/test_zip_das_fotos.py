# -*- coding: utf-8 -*-
"""El ZIP de fotos no puede decir "completada" si le faltan fotos.

Al descargar las fotos de campo se arma un ZIP. Cada foto se baja dentro de un
`try` con un `console.warn` en el `catch`, y se continuaba igual. Si fallaban
ocho de diez, el ZIP se generaba con dos y el jugador leía **"Descarga de ZIP
completada"**.

Eso es de lo peor que puede hacer este programa: dar por buena una copia
incompleta de las pruebas de alguien. El jugador borra el móvil confiando en
que las tiene.

Y hay una segunda parte, medida sobre el build real: `jszip` sale como un trozo
aparte —`jszip.min-*.js`, 96 KB, 28 KB comprimido— porque se pide con
`await import('jszip')`. El precache offline sólo guarda los scripts que ya
están en la página (`pwaShell.ts` los busca con
`querySelectorAll('script[src]')`), así que ese trozo NO está en el móvil. Sin
cobertura, la descarga falla en la primera línea.

Eso está bien así —cargarlo siempre son 28 KB comprimidos de mas para todos, y
esto se hace en casa con wifi, no en el monte— pero hay que DECIRLO. "Error al
crear ZIP" no le dice a nadie que lo que hace falta es conexión.
"""
import re
from pathlib import Path

RAIZ = Path(__file__).resolve().parent.parent
JUGADOR = RAIZ / "frontend" / "src" / "player" / "PlayerApp.tsx"
SHELL = RAIZ / "frontend" / "src" / "player" / "offline" / "pwaShell.ts"


def cuerpo_da_descarga() -> str:
    codigo = JUGADOR.read_text(encoding="utf-8")
    inicio = codigo.index("async function handleDownloadFieldProofs")
    resto = codigo[inicio:]
    return resto[: resto.index("\n  }\n") + 4]


def test_contanse_as_fotos_que_fallan():
    cuerpo = cuerpo_da_descarga()

    assert "fallidas" in cuerpo, "hay que contar las fotos que no se pudieron bajar"


def test_non_se_di_completada_se_faltan_fotos():
    cuerpo = cuerpo_da_descarga()

    # El aviso de exito tiene que estar dentro de una condición, no suelto.
    exito = cuerpo.index("Descarga de ZIP completada")
    trozo = cuerpo[max(0, exito - 400) : exito]
    assert "fallidas === 0" in trozo or "!fallidas" in trozo, (
        "el aviso de completada tiene que depender de que no falte ninguna"
    )


def test_sen_cobertura_dise_que_fai_falta_conexion():
    cuerpo = cuerpo_da_descarga()

    assert "conexión" in cuerpo or "conexion" in cuerpo, (
        "sin red el trozo de jszip no esta en el movil: hay que decirlo"
    )


def test_o_precache_segue_collendo_so_o_que_esta_na_paxina():
    """Si esto cambiara, la nota de arriba dejaria de ser cierta."""
    codigo = SHELL.read_text(encoding="utf-8")

    assert "querySelectorAll<HTMLScriptElement>('script[src]')" in codigo
