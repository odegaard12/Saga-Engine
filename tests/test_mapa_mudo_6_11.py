# -*- coding: utf-8 -*-
"""6/11/2026: la mancha negra y la pista «CALIENTE» de Mapa mudo («queda fea y no la entiendo», Óscar).

- La mancha eran las sombras de suelo de VARIOS nodos en el mismo punto, sumadas: el filtro que deja uno solo sólo
  miraba a los que estaban bajo el nodo en juego, y el de Mapa mudo tiene su punto en el centro del círculo difuso.
  Ahora de cada grupo a menos de 3 m se pinta uno; y la sombra es más pequeña y suave.
- La pista: tres tramos (frío/templado/caliente) con el actual encendido y una frase, fuera de caja, y sólo mientras
  se busca. El cálculo (mapaMudo.ts) no se toca.
"""
from pathlib import Path

SRC = Path(__file__).resolve().parent.parent / "frontend" / "src" / "player"


def leer(relativo: str) -> str:
    return (SRC / relativo).read_text(encoding="utf-8-sig")


def test_de_cada_grupo_de_nodos_juntos_se_pinta_uno():
    m = leer("components/MapSurfaceGL.tsx")
    assert "indice === currentLevel ? 1e6 : indice > currentLevel ? 1e3 - indice : indice" in m
    trozo = m.split("const debajoDelActual = ", 1)[1][:500]
    assert "nodos.some((otro, j) =>" in trozo and "esMudo(otro)" in trozo and "< 3" in trozo
    assert ".filter((_, indice) => !debajoDelActual(nodos[indice], indice))" in m


def test_la_pista_va_en_tres_tramos_y_fuera_de_la_caja():
    p = leer("components/PistaDeCalor.tsx")
    assert "const ORDEN: BandaDeCalor[] = ['frio', 'templado', 'caliente']" in p
    assert "caliente: 'busca por aquí'" in p and "templado: 'Morno'" in p
    hud = leer("components/PlayerHud.tsx")
    assert "{mostrarCalor ? <PistaDeCalor banda={hotCold as BandaDeCalor} locale={locale} /> : null}" in hud
    # La caja de la pista sólo existe si hay pista de verdad (texto o foto): nunca vacía con una pastilla dentro.
    assert "{esMapaMudo && !finished && (pistaTexto || pistaFoto) ? (" in hud
    assert "hotColdEtiqueta" not in hud


def test_la_pista_de_calor_sale_solo_mientras_se_busca():
    hud = leer("components/PlayerHud.tsx")
    bloque = hud.split("const mostrarCalor =", 1)[1][:300]
    assert "!inRange" in bloque and "primaryReason !== 'within_radius'" in bloque
    # El cálculo sigue siendo el de mapaMudo.ts (o el del servidor), sin tocar.
    assert "const hotCold = calorMapaMudo || (typeof configMapaMudo.hot_cold === 'string'" in hud


def test_gallego_de_la_pista():
    i18n = (SRC.parent / "i18n" / "index.ts").read_text(encoding="utf-8")
    assert "hotColdLabel: 'Que preto estou?'" in i18n and "¿Canto de cerca estou?" not in i18n
