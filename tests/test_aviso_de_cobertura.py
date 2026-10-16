# -*- coding: utf-8 -*-
"""El aviso «Sin cobertura» es discreto (Óscar, 16/10/2026: «deben ocultarse, no salir seguido»).

Sale una vez al quedarse sin red, se va solo en unos segundos, no se repite antes de 10 minutos y al volver la
red no se avisa de nada. Va en su propia fila: en la del chip del tiempo se pisaban.
"""
import re
from pathlib import Path

FUENTE = (Path(__file__).resolve().parent.parent / "frontend" / "src" / "player" / "components" / "AvisoDeCobertura.tsx").read_text(encoding="utf-8")


def _ms(nombre):
    m = re.search(rf"const {nombre} = ([0-9_ *]+)", FUENTE)
    return eval(m.group(1).replace("_", ""))  # noqa: S307 - literal numérico del propio fichero


def test_breve_y_sin_repetirse():
    assert _ms("VISIBLE_MS") <= 6000
    assert _ms("PAUSA_MS") >= 10 * 60_000


def test_sin_aviso_al_volver_la_red_y_en_su_fila():
    assert "Conectado de nuevo" not in FUENTE and "Conectado de novo" not in FUENTE
    assert "+ 116px" in FUENTE  # una fila por debajo del chip del tiempo (+78px)
