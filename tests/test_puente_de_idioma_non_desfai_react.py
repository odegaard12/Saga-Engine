"""
El puente de idioma (legacySpanishBridge) traduce textos del DOM por detrás
de React. Dos fallos que tuvo, y que no pueden volver:

1. Guardaba el texto ORIGINAL de la primera vez y, cuando React cambiaba ese
   texto, lo devolvía al original: la pantalla se quedaba congelada con el
   primer valor (el banco decía «pidiendo…» con los datos ya cargados, y los
   botones que alternan etiqueta no cambiaban).
2. Reescribía el texto aunque fuera igual; eso disparaba su propio
   observador y recorría la página entera en cada fotograma, para siempre.
"""
from pathlib import Path

PUENTE = Path(__file__).resolve().parents[1] / "frontend" / "src" / "i18n" / "legacySpanishBridge.ts"


def test_o_puente_acepta_os_cambios_de_react_e_non_fai_bucle() -> None:
    fonte = PUENTE.read_text(encoding="utf-8")
    # Si el texto no es el que escribió el puente, lo ha cambiado React: nuevo original.
    assert "if (!registro || current !== registro.escrito)" in fonte
    assert "sources.get(text) || current" not in fonte, "volvió el original de la primera vez"
    # Sólo se escribe si cambia (texto y atributos).
    assert "if (nuevo !== current) text.nodeValue = nuevo" in fonte
    assert "if (translated && translated !== current) element.setAttribute(attr, translated)" in fonte
    assert "data-saga-i18n-${attr}" not in fonte
