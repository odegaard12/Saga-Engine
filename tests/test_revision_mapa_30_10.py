# -*- coding: utf-8 -*-
"""Revisión del 30/10/2026 como jugador (mapa, hojas y gestos).

- Atrás de Android con la tienda, el menú de gestos o la ficha de un compañero abiertos sacaba al jugador de la
  partida (la página se iba): esas tres capas no metían su entrada en el historial como las hojas.
- Con el rescate del GPS («gps_rendido») el botón decía «Abrir nodo» y la línea de debajo «Acércate para abrir este
  nodo»: se contradecían. Ahora la línea es la del motivo real, como con «missing_item».
"""
from pathlib import Path

SRC = Path(__file__).resolve().parent.parent / "frontend" / "src" / "player"


def leer(relativo: str) -> str:
    return (SRC / relativo).read_text(encoding="utf-8")


def test_atras_cierra_la_tienda():
    g = leer("avatares/GestorDePersonaje.tsx")
    assert "import { useAtrasCierra } from '../hooks/useAtrasCierra'" in g
    assert "useAtrasCierra(modo === 'cambiar', () => {" in g
    # Atrás hace lo mismo que su ×: marcar lo nuevo como visto y cerrar sin elegir.
    bloque = g.split("useAtrasCierra(modo === 'cambiar', () => {", 1)[1].split("})", 1)[0]
    assert "verNuevos()" in bloque and "alTerminar(null)" in bloque


def test_atras_cierra_el_menu_de_gestos():
    assert "useAtrasCierra(menuDeGestos, () => setMenuDeGestos(false))" in leer("PlayerApp.tsx")


def test_atras_cierra_la_ficha_del_companero():
    mapa = leer("components/MapSurfaceGL.tsx")
    assert "import { useAtrasCierra } from '../hooks/useAtrasCierra'" in mapa
    assert "useAtrasCierra(fichaDe !== null, () => setFichaDe(null))" in mapa
    # Después de declarar el estado (si no, no compila) y fuera de cualquier condición.
    assert mapa.index("const [fichaDe, setFichaDe]") < mapa.index("useAtrasCierra(fichaDe !== null")


def test_rescate_del_gps_no_dice_acercate_bajo_abrir_nodo():
    hud = leer("components/PlayerHud.tsx")
    ayuda = hud.split("const helperCopy = finished", 1)[1].split("\n\n", 1)[0]
    assert "primaryReason === 'missing_item' || primaryReason === 'gps_rendido'" in ayuda
    assert ayuda.index("gps_rendido") < ayuda.index("Acércate para abrir este nodo.")
    # El motivo del rescate existe y abre el nodo: su texto es el que debe verse.
    rt = leer("runtime.ts")
    assert "reason: 'gps_rendido'" in rt and "Podes abrir o nodo igual" in rt


def test_los_nodos_que_cambian_de_estado_no_desaparecen():
    """Al completar un nodo, el hecho y el nuevo en juego piden imágenes nuevas. MapLibre 6 responde a la maquetación
    con las que hay y avisa de las que faltan DESPUÉS (`styleimagemissing`): lo añadido en el aviso no entraba y los dos
    nodos se quedaban sin chincheta hasta recargar (visto en 390x844 y 360x740). El resolvedor se espera antes."""
    mapa = leer("components/MapSurfaceGL.tsx")
    assert "mapa.setMissingStyleImageResolver((id) => alFaltarImagen({ id }))" in mapa
    assert mapa.index("const alFaltarImagen = ") < mapa.index("mapa.setMissingStyleImageResolver(")
    dist = SRC.parent.parent / "node_modules" / "maplibre-gl" / "dist" / "maplibre-gl-dev.mjs"
    if dist.exists():
        js = dist.read_text(encoding="utf-8")
        cuerpo = js.split("async _getImagesForIds(ids) {", 1)[1].split("\n\t}", 1)[0]
        # El resolvedor va antes de armar la respuesta; el aviso, después (por eso el aviso solo no basta).
        assert cuerpo.index("resolver(id)") < cuerpo.index("const response = {}") < cuerpo.index("MapStyleImageMissingEvent")
