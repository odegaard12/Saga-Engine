# -*- coding: utf-8 -*-
"""La guarda de privacidad del repositorio tiene que pasar, no sólo existir.

El repositorio es público. La guarda lo dice en su propia cabecera: *el motor es
público; la ruta, los nombres de quien juega y los códigos de los nodos, no*.

Llevaba días saltando con 41 avisos en 15 ficheros: nombres reales de jugadores
en cuatro ficheros de prueba y en un script, y el topónimo del monte en
comentarios, en el CHANGELOG y —lo peor— en el texto de portada que ve
cualquiera que abra la aplicación.

Nadie se enteraba porque la lista de palabras vive en
`.saga-privacidad-local.txt`, que está fuera de git: en CI la comprobación se
salta entera y siempre pasa. O sea que la guarda sólo dice algo si alguien la
ejecuta a mano en una máquina que tenga la lista.

Esta prueba la ejecuta siempre. Donde no haya lista local no puede comprobar
las palabras —y lo dice— pero el resto del guardián (ficheros de estado,
claves, coordenadas capturadas) sí corre en todas partes.
"""
import subprocess
import sys
from pathlib import Path

RAIZ = Path(__file__).resolve().parent.parent
GUARDA = RAIZ / "scripts" / "check_repo_privacy.py"
LISTA = RAIZ / ".saga-privacidad-local.txt"


def test_a_guarda_pasa():
    salida = subprocess.run(
        [sys.executable, str(GUARDA)],
        cwd=RAIZ,
        capture_output=True,
        text=True,
    )

    assert salida.returncode == 0, (
        "la guarda de privacidad encuentra cosas que no deberían estar en un "
        f"repositorio publico:\n{salida.stdout}\n{salida.stderr}"
    )


def test_a_lista_de_palabras_non_entra_no_repositorio():
    """Meterla aquí sería filtrarlas igual, sólo que en un fichero con nombre."""
    seguimiento = subprocess.run(
        ["git", "ls-files", "--error-unmatch", LISTA.name],
        cwd=RAIZ,
        capture_output=True,
        text=True,
    )

    assert seguimiento.returncode != 0, (
        f"{LISTA.name} está bajo control de versiones: eso filtra la lista entera"
    )


def test_o_texto_do_motor_non_describe_unha_mision_concreta():
    """La portada decía cuántos nodos hay y cómo se llama el monte.

    Eso es de la misión —viene de `config.story_text`—, no del motor. Un motor
    que se descarga de un repositorio público no puede llevar dentro la ruta de
    nadie.
    """
    entrada = (RAIZ / "frontend" / "src" / "login" / "LoginApp.tsx").read_text(
        encoding="utf-8"
    )

    inicio = entrada.index("function loginText")
    bloque = entrada[inicio : entrada.index("\n}", inicio)]

    for pista in ("Dez puntos", "Diez puntos", "Ten points"):
        assert pista not in bloque, (
            f"la portada del motor sigue contando una misión concreta: {pista!r}"
        )
