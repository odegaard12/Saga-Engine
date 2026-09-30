# -*- coding: utf-8 -*-
"""Los avisos del avance de nodo (`player/avance/`) salían sólo en castellano
aunque el jugador tuviera el gallego: cada frase fija que se muestra tiene que
estar en la tabla GL del puente de idioma."""
import re
from pathlib import Path

RAIZ = Path(__file__).resolve().parents[1]
AVANCE = RAIZ / "frontend" / "src" / "player" / "avance"
PUENTE = (RAIZ / "frontend" / "src" / "i18n" / "legacySpanishBridge.ts").read_text(encoding="utf-8")
TABLA_GL = PUENTE.split("const GL: Record<string, string> = {", 1)[1].split("\n}\n", 1)[0]

AVISOS = [
    "Código no aceptado. Inténtalo de nuevo.",
    "Todavía no es la hora de la misión.",
    "¡Necesitas un objeto! Revisa tu mochila.",
    "¡Nodo superado! ⚡",
    "¡Misión completada! 🏆",
    "Error al enviar. Comprueba tu conexión.",
    "¡Nodo superado sin conexión! ⚡ El progreso se sincronizará pronto.",
]


def test_os_avisos_do_avance_seguen_no_codigo():
    fonte = "".join(p.read_text(encoding="utf-8") for p in AVANCE.glob("*.ts"))
    for aviso in AVISOS:
        assert aviso in fonte, aviso


def test_cada_aviso_ten_traducion_galega():
    for aviso in AVISOS:
        assert f"'{aviso}'" in TABLA_GL, aviso


def test_o_obxecto_recollido_traducese_co_seu_nome():
    assert re.search(r"Recogido: \(\.\+\)", PUENTE) and "Recollido: ${match[1]}!" in PUENTE
