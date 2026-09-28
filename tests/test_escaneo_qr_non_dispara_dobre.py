# -*- coding: utf-8 -*-
"""Una pegatina no puede registrarse dos veces por una sola lectura.

El escáner de campo (QuickProofPanel.tsx) tiene DOS caminos que pueden acabar
en `saveQrItem` con el mismo código: el bucle continuo que analiza fotogramas
solo (`requestAnimationFrame`) y el botón "📸 Hacer foto y validar"
(`captureAndAnalyse`). Cada uno se guardaba a sí mismo de repetirse -`ocupado`
en el bucle, `analysing` en el botón-, pero ninguno sabía del otro.

Pulsar la foto justo en el instante en que el bucle acababa de leer la misma
pegatina disparaba `saveQrItem` dos veces: dos objetos guardados en la
mochila, y -peor- dos llamadas a `onQrValidated`, que es lo que avanza el
nodo y suma el tiempo de la prueba. No hace falta mala suerte para que pase:
es justo lo que ocurre cuando el jugador, inseguro de si el bucle ya ha
leído, le da también al botón.

Este test no ejecuta React -el repo no trae un runner de JS-, así que
comprueba lo mismo que test_lanterna_do_escaner.py: que el candado existe en
el código fuente y que está en el sitio que evita la repetición.
"""
import re
from pathlib import Path

RAIZ = Path(__file__).resolve().parent.parent
ESCANER = RAIZ / "frontend" / "src" / "player" / "components" / "QuickProofPanel.tsx"


def sin_comentarios(fichero: Path) -> str:
    texto = fichero.read_text(encoding="utf-8")
    texto = re.sub(r"/\*.*?\*/", "", texto, flags=re.DOTALL)
    return re.sub(r"//[^\n]*", "", texto)


def cuerpo_de(nome_funcion: str) -> str:
    codigo = sin_comentarios(ESCANER)
    inicio = codigo.index(f"async function {nome_funcion}")
    resto = codigo[inicio:]
    # Corta en la primera línea que cierra la función al nivel de indentación
    # de una función de componente (dos espacios): sirve para las funciones
    # de este fichero, todas definidas igual.
    fin = re.search(r"\n  \}\n", resto)
    assert fin, f"no se encontró el cierre de {nome_funcion}"
    return resto[: fin.end()]


def test_saveQrItem_ten_candado_de_entrada():
    """La primera línea útil de saveQrItem tiene que poder rechazar una
    segunda lectura concurrente antes de tocar nada."""
    cuerpo = cuerpo_de("saveQrItem")

    assert "processingRef.current" in cuerpo, (
        "sin un candado compartido, el bucle continuo y el botón de foto "
        "pueden los dos acabar guardando el mismo escaneo"
    )

    entrada = cuerpo.index("const parsed = parseQrItem")
    candado = cuerpo.index("processingRef.current")
    assert candado < entrada, (
        "el candado tiene que comprobarse ANTES de procesar la lectura, "
        "si no la segunda llamada ya hizo todo el trabajo para cuando se mira"
    )


def test_o_candado_non_deixa_o_escaner_bloqueado_para_sempre():
    """Un QR ilegible o un fallo de guardado no puede dejar el candado
    echado: el jugador tiene que poder intentarlo otra vez."""
    cuerpo = cuerpo_de("saveQrItem")

    apariciones = cuerpo.count("processingRef.current = false")
    assert apariciones >= 2, (
        "hacen falta al menos dos reaperturas: cuando el QR no se reconoce "
        "y cuando falla el guardado, si no cualquiera de los dos deja el "
        "escáner sin poder volver a validar nada"
    )


def test_arrincar_a_camara_reabre_o_candado():
    """Una sesión de cámara nueva no puede heredar el candado de la anterior."""
    cuerpo = cuerpo_de("startQrScan")

    assert "processingRef.current = false" in cuerpo, (
        "sin reabrir el candado al empezar a escanear, una pegatina válida "
        "leída en la sesión anterior bloquearía todas las siguientes"
    )
