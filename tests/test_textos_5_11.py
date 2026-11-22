# -*- coding: utf-8 -*-
"""5/11/2026: repaso de textos (es/gl), recorriendo la app en cada idioma a 360, y la sombra de los nodos.

Un test por arreglo.
"""
from pathlib import Path

RAIZ = Path(__file__).resolve().parent.parent
SRC = RAIZ / "frontend" / "src"


def leer(relativo: str) -> str:
    return (SRC / relativo).read_text(encoding="utf-8-sig")


def test_gallego_achegate_y_no_acercate():
    # 22/11: sin puente de idioma; el gallego del HUD está en el catálogo.
    gl = leer("player/components/textosDePantallas.ts").split("\nconst gl: TextosDePantallas = {", 1)[1]
    for frase in ("acercateMas: 'Achégate máis'", "Achégate: tes que estar a menos de ${radio} m."):
        assert frase in gl, frase
    assert "Acércate" not in gl


def test_avanzado_guardar_y_sincronizar_en_gallego():
    gl = leer("player/components/textosDePantallas.ts").split("\nconst gl: TextosDePantallas = {", 1)[1]
    assert "avanzado: 'Avanzado: gardar e enviar'" in gl
    assert "pendientes: (n: number) => ` · ${n === 1 ? '1 avance sen enviar' : `${n} avances sen enviar`}`" in gl
    assert "{tx.avanzado}{pending > 0 ? tx.pendientes(pending) : ''}" in leer("player/components/MissionPackPanel.tsx")


def test_mision_sin_conexion_en_gallego():
    f = leer("player/components/FieldPrepPanel.tsx")
    gl = f.split("  gl: {", 1)[1]
    assert "misionOffline: 'Misión sen conexión'" in gl


def test_palabras_gallegas():
    assert "sobre as caselas" in leer("shared/PuertaDeMision.tsx")
    assert "Non se le soa? Preme 📸" in leer("player/components/textosDePantallas.ts")


def test_glosario_ruta_no_travesia():
    for f in ("player/components/textosDePantallas.ts", "player/runtime.ts", "player/playerAppBase.ts"):
        assert "travesía'" not in leer(f) and "travesía.`" not in leer(f) and "travesía.'" not in leer(f), f
    assert "comenzarTravesia: 'Empezar la ruta'" in leer("player/playerAppBase.ts")


def test_la_guia_usa_el_nombre_del_juego_en_ingles():
    # 7/11: la Guía lee el nombre y la regla de textos.ts (un solo sitio).
    assert "'Pulso de hierro'" in leer("player/minigames/core/textos.ts")
    assert "JUEGOS_EN_UNA_LINEA" in leer("player/guia/guia.ts")


def test_la_sombra_de_contacto_llega_al_borde_de_la_peana():
    b = leer("player/components/bolaRenderizada.ts")
    suelo = b.split("export function dibujarSuelo", 1)[1][:1500]
    # 6/11: más pequeña y suave (se sumaba en una mancha negra con varios nodos juntos).
    assert "createRadialGradient(c, c, 0, c, c, r * 0.48)" in suelo
    assert "addColorStop(0, 'rgba(0,0,0,0.42)')" in suelo
