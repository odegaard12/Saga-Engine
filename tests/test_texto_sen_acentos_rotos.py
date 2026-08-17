# -*- coding: utf-8 -*-
"""Nadie vuelve a dejar un acento convertido en `?` dentro del código.

Alguna herramienta editó `PlayerHud.tsx` convirtiendo todo lo que no era ASCII
en `?`. Quedó así:

    if (text === '?' || text === '?' || text === '?' || text === '?') return true
    if (combined.includes('ubicaci?n')) return true
    if (combined.includes('mi posici?n')) return true

Cuatro comparaciones idénticas donde antes había cuatro símbolos distintos, y
dos textos que **no pueden casar con nada**. Eso vive dentro de la función que
esconde los controles del mapa cuando se abre un panel: los botones con tilde
en la etiqueta no se escondían y se quedaban encima del panel.

El daño es del commit raíz, así que los símbolos originales no están en ninguna
parte de la historia y no se pueden recuperar. Se arregla sin adivinar: se
quitan los acentos de lo que se compara, y los símbolos se reconocen por su
forma —una etiqueta de un solo carácter que no es letra ni número— en vez de
por una lista de cuatro que ya no existe.

La misión está escrita en gallego y sus textos van en el código, así que esta
guarda vale para todo el repositorio: un `?` en medio de una palabra es texto
roto en pantalla.
"""
import re
from pathlib import Path

RAIZ = Path(__file__).resolve().parent.parent
HUD = RAIZ / "frontend" / "src" / "player" / "components" / "PlayerHud.tsx"

EXTENSIONES = (".ts", ".tsx", ".py", ".css", ".md")
SALTAR = ("node_modules", ".git", "dist", "__pycache__", ".pytest_cache")

# Letra, `?`, letra. Una `?` de verdad va al final o suelta, nunca en medio de
# una palabra.
ROTO = re.compile(r"[A-Za-zÀ-ÿ]\?([A-Za-z_À-ÿ]+)")


def acentos_rotos(texto: str) -> list[tuple[int, str]]:
    """Los `?` en medio de palabra, sin contar los de las URLs.

    En una URL, `imagen.png?v=1` también es letra-?-letra. Se distinguen porque
    lo que sigue a la `?` es un parámetro y acaba en `=`.
    """
    salida = []
    for n, linea in enumerate(texto.split("\n"), 1):
        for m in ROTO.finditer(linea):
            resto = linea[m.end() : m.end() + 1]
            if resto == "=":
                continue  # parámetro de una URL
            salida.append((n, linea.strip()[:90]))
    return salida


def test_non_hai_acentos_rotos_en_todo_o_repositorio():
    culpables = []

    for p in RAIZ.rglob("*"):
        if not p.is_file() or p.suffix not in EXTENSIONES:
            continue
        if any(s in p.parts for s in SALTAR):
            continue
        # Este fichero enseña el texto roto a propósito: es de lo que habla.
        # Es la única exención, y va aquí escrita en vez de en una lista suelta.
        if p.resolve() == Path(__file__).resolve():
            continue
        try:
            texto = p.read_text(encoding="utf-8")
        except (UnicodeDecodeError, OSError):
            continue

        for n, linea in acentos_rotos(texto):
            culpables.append(f"{p.relative_to(RAIZ).as_posix()}:{n}  {linea}")

    assert not culpables, "texto con el acento perdido:\n" + "\n".join(culpables)


def test_non_se_compara_contra_un_interrogante():
    """Cuatro `text === '?'` iguales son cuatro símbolos que ya no existen."""
    codigo = HUD.read_text(encoding="utf-8")

    assert "text === '?'" not in codigo, (
        "comparar contra '?' es comparar contra un simbolo que se perdio"
    )


def test_os_simbolos_reconocense_pola_forma():
    """Sin la lista original, la única regla honesta es la forma."""
    codigo = HUD.read_text(encoding="utf-8")

    assert "esSimbolo" in codigo, "hace falta reconocer una etiqueta de un solo simbolo"


def test_a_comparacion_non_depende_dos_acentos():
    """`Ubicación`, `ubicacion` y `UBICACIÓN` son la misma etiqueta."""
    codigo = HUD.read_text(encoding="utf-8")

    assert "normalize('NFD')" in codigo, "hay que quitar los acentos antes de comparar"
    assert "ubicaci?n" not in codigo
    assert "posici?n" not in codigo
