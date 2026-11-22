# -*- coding: utf-8 -*-
"""Los avisos del avance de nodo (`player/avance/`) salían sólo en castellano
aunque el jugador tuviera el gallego. Desde el 22/11 (sin puente de idioma) cada
frase vive en el catálogo `textosDePantallas.ts` (`avance`), en es y en gl, y el
avance la pide al catálogo en vez de escribirla a pelo."""
from pathlib import Path

RAIZ = Path(__file__).resolve().parents[1]
AVANCE = RAIZ / "frontend" / "src" / "player" / "avance"
CATALOGO = (RAIZ / "frontend" / "src" / "player" / "components" / "textosDePantallas.ts").read_text(encoding="utf-8")
ES, GL = CATALOGO.split("\nconst gl: TextosDePantallas = {", 1)

AVISOS = {
    "Código no aceptado. Inténtalo de nuevo.": "Código non aceptado. Téntao de novo.",
    "Todavía no es la hora de la misión.": "Aínda non é a hora da misión.",
    "¡Necesitas un objeto! Revisa tu mochila.": "Precisas un obxecto! Revisa a túa mochila.",
    "¡Nodo superado! ⚡": "Nodo superado! ⚡",
    "¡Misión completada! 🏆": "Misión completada! 🏆",
    "Error al enviar. Comprueba la cobertura.": "Erro ao enviar. Comproba a cobertura.",
    "¡Nodo superado sin cobertura! ⚡ Se enviará solo cuando haya cobertura.":
        "Nodo superado sen cobertura! ⚡ Enviarase só cando haxa cobertura.",
}


def test_os_avisos_do_avance_estan_no_catalogo_e_non_no_codigo():
    fonte = "".join(p.read_text(encoding="utf-8") for p in AVANCE.glob("*.ts"))
    for aviso in AVISOS:
        assert f"'{aviso}'" in ES, aviso
        assert aviso not in fonte, aviso
    assert "textosDePantallasDe(" in fonte


def test_cada_aviso_ten_traducion_galega():
    for galego in AVISOS.values():
        assert f"'{galego}'" in GL, galego


def test_o_obxecto_recollido_traducese_co_seu_nome():
    assert "recogido: (objeto: string) => `⭐ ¡Recogido: ${objeto}!`" in ES
    assert "recogido: (objeto: string) => `⭐ Recollido: ${objeto}!`" in GL
