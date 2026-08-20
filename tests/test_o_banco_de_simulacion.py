# -*- coding: utf-8 -*-
"""El banco de simulación no puede ensuciar el mapa de gente real.

Existe porque todo esto se venía escribiendo a mano en cada sesión de pruebas, y
cada vez salía un poco distinto. Cuando la herramienta cambia entre medición y
medición, los números dejan de poder compararse.

Lo que se protege aquí es lo único que puede hacer daño: `/api/heartbeat` lleva
lat/lon, así que un banco de escritura **planta posiciones falsas en el mapa de
jugadores reales**. Ha pasado dos veces. Por eso los modos de escritura se
niegan a correr contra un servidor que no sea local.
"""
import subprocess
import sys
from pathlib import Path

RAIZ = Path(__file__).resolve().parent.parent
CARGA = RAIZ / "scripts" / "simular-carga.py"
BANCO = RAIZ / "scripts" / "banco-de-simulacion.js"


def _correr(*args):
    return subprocess.run(
        [sys.executable, str(CARGA), *args],
        cwd=RAIZ, capture_output=True, text=True, timeout=60,
    )


def test_a_escritura_contra_producion_para_sola():
    salida = _correr("escritura", "--base", "https://sagagia.es", "--segundos", "1")
    assert salida.returncode != 0, (
        "el banco ha dejado escribir contra producción: eso planta posiciones "
        "falsas en el mapa de jugadores reales"
    )
    assert "PARADO" in salida.stderr


def test_a_rafaga_contra_producion_para_sola():
    salida = _correr("rafaga", "--base", "https://sagagia.es", "--avances", "1")
    assert salida.returncode != 0
    assert "PARADO" in salida.stderr


def test_a_escritura_en_local_si_arranca():
    """La salvaguarda no puede pasarse de lista: en local tiene que dejar."""
    salida = _correr("escritura", "--base", "http://127.0.0.1:1", "--segundos", "1", "--jugadores", "1")
    # Falla al conectar, claro; lo que importa es que NO lo pare la salvaguarda.
    assert "PARADO" not in salida.stderr, "la salvaguarda bloquea también en local"


def test_o_banco_do_navegador_avisa_dos_nodos_perigosos():
    """Simular la llegada a un nodo de proximidad hace avanzar de verdad."""
    texto = BANCO.read_text(encoding="utf-8")
    assert "avanzaSolo" in texto, (
        "el banco no distingue los nodos que avanzan por proximidad, así que una "
        "simulación puede hacer avanzar a alguien sin querer"
    )
    assert "simple_checkpoint" in texto


def test_o_banco_non_degrada_a_chamada_do_gps():
    """Si se le corta la red al GPS, no hay forma de mover al jugador."""
    texto = BANCO.read_text(encoding="utf-8")
    assert "esGps" in texto and "fresh=" in texto, (
        "el banco no separa la llamada del shim de GPS del resto del tráfico"
    )


def test_o_banco_mide_con_observador_e_non_con_temporizadores():
    """Con la pestaña oculta el navegador estrangula setTimeout."""
    texto = BANCO.read_text(encoding="utf-8")
    assert "MutationObserver" in texto
