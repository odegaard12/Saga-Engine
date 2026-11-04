# -*- coding: utf-8 -*-
"""4/11/2026: revisión de transiciones y animaciones del jugador (medidas con transitionend/animationend reales).

- La tienda desaparecía en seco al cerrarla: ahora se funde y se desmonta al acabar la animación (no con un
  temporizador igual a ella, que la cortaba).
- La ficha de un compañero, cerrada con Atrás, se desmontaba en seco: el Atrás lo lleva la ficha, con su salida.
- El panel de la tienda medía de 218 a 265 px según la pestaña y el muñeco crecía y encogía al cambiar.
- El pulso dorado empezaba debajo de la hoja del nodo que aún se estaba yendo.
- Herramientas tenía dos «Avanzado» iguales.
"""
from pathlib import Path

SRC = Path(__file__).resolve().parent.parent / "frontend" / "src" / "player"


def leer(relativo: str) -> str:
    return (SRC / relativo).read_text(encoding="utf-8")


def test_la_tienda_se_va_fundida_y_se_desmonta_al_acabar():
    t = leer("avatares3d/mixamo/TiendaDeRopa.tsx")
    assert "saliendoTienda ? ' saga-tienda-sale' : ''" in t
    assert "e.animationName === 'saga-tienda-sale'" in t and "acabarSalida()" in t
    # Red de seguridad más larga que la animación (240 ms), y sin animación con reducir movimiento.
    assert "window.setTimeout(acabarSalida, 700)" in t
    assert "(prefers-reduced-motion: reduce)').matches) return despues()" in t
    assert "onClick={() => salir(alCancelar)}" in t
    css = leer("avatares3d/mixamo/tienda.css")
    assert "@keyframes saga-tienda-sale" in css


def test_la_ficha_cierra_con_su_salida_tambien_con_atras():
    f = leer("avatares3d/mixamo/FichaDeJugador.tsx")
    i = f.index("const cerrar = () => cerrarCon(alCerrar)")
    assert "useAtrasCierra(true, cerrar)" in f[i : i + 300]


def test_el_panel_de_la_tienda_mide_lo_mismo_en_todas_las_pestanas():
    css = leer("avatares3d/mixamo/tienda.css")
    bloque = css.split("4/11: el panel medía distinto en cada pestaña", 1)[1]
    assert "min-height: calc(266px + var(--tienda-abajo, 0px));" in bloque
    assert ".saga-tienda-vitrina .saga-tienda-listo {\n  margin-top: auto;" in bloque.replace("\r\n", "\n")


def test_el_pulso_espera_a_que_se_vaya_la_hoja():
    assert "useCubreElMapa(open || festejo !== null || presencia.montada)" in leer("components/InteractionSheet.tsx")


def test_herramientas_sin_dos_avanzado_iguales():
    assert "Avanzado: guardar y sincronizar" in leer("components/MissionPackPanel.tsx")
    assert "'Avanzado: modo prueba'" in leer("components/PlayerHud.tsx")
