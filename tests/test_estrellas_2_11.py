# -*- coding: utf-8 -*-
"""2/11/2026: las siete cosas liosas del recorrido de jugador nuevo y «estrellas claras» (a petición de Óscar).

Todo es de interfaz: no cambia lógica, relojes ni lo que se guarda.
"""
from pathlib import Path

SRC = Path(__file__).resolve().parent.parent / "frontend" / "src" / "player"


def leer(relativo: str) -> str:
    return (SRC / relativo).read_text(encoding="utf-8")


# --- Las siete -------------------------------------------------------------------------------------------------


def test_un_solo_permitir_para_la_camara():
    f = leer("components/FieldPrepPanel.tsx")
    assert ") : pendientes.length === 1 ? null : (" in f, "con un solo permiso, sólo el botón grande de abajo"


def test_el_respaldo_cerrado_es_discreto_y_los_relojes_no_se_tocan():
    css = leer("components/minijuegos-hoja.css")
    assert "color: rgba(252, 211, 77, 0.72) !important;" in css and ":has(.mg-respaldo-form)" in css
    hoja = leer("components/InteractionSheet.tsx")
    # El reloj ya esperaba a «Empezar» (6.0.0): la lista de juegos que avisan sigue igual.
    assert "'place_mosaic'," in hoja and "xogoAvisaElMesmo" in hoja


def test_avanzado_plegado_en_herramientas():
    hud = leer("components/PlayerHud.tsx")
    assert "<details style={{ marginTop: 8 }} open={debugEnabled || undefined}>" in hud, "abierto si el modo prueba está activo"
    pack = leer("components/MissionPackPanel.tsx")
    assert "<details style={avanzado}>" in pack and "por sincronizar" in pack
    # «Guardar progreso» y «Sincronizar» están dentro del plegable.
    assert pack.index("<details style={avanzado}>") < pack.index("'Guardando…' : 'Guardar progreso'") < pack.index("</details>")


def test_la_eleccion_dice_tienda_de_ropa_y_el_contador_es_un_contador():
    t = leer("avatares3d/mixamo/textosTienda.ts")
    assert "Cámbialo cuando quieras en «Tienda de ropa»." in t and "Cámbiao cando queiras en «Tenda de roupa»." in t
    assert "botón de la camiseta" not in t and "botón da camiseta" not in t
    assert "👥 y un número" in t and "👥 e un número" in t
    tienda = leer("avatares3d/mixamo/TiendaDeRopa.tsx")
    assert "👥{enUso > 9 ? '9+' : enUso}" in tienda


def test_colores_agrupados_en_pantalla_sin_cambiar_lo_guardado():
    c = leer("avatares3d/mixamo/catalogo.ts")
    import re

    cuerpo = c.split("export const ORDEN_DE_COLORES_DE_ROPA: readonly number[] = [", 1)[1].split("]" + chr(10), 1)[0]
    sin_comentarios = chr(10).join(linea.split("//")[0] for linea in cuerpo.split(chr(10)))
    nums = [int(x) for x in re.findall(r"[0-9]+", sin_comentarios)]
    assert sorted(nums) == list(range(17)), "los 17 colores, una vez cada uno"
    tienda = leer("avatares3d/mixamo/TiendaDeRopa.tsx")
    assert tienda.count("ORDEN_DE_COLORES_DE_ROPA.map((i) => [COLORES_DE_ROPA[i], i] as const)") == 2
    # El aspecto sigue guardando el índice de siempre.
    assert "onClick={() => cambiar({ top: i })}" in tienda and "onClick={() => cambiar({ pants: i })}" in tienda


def test_conjuntos_casi_iguales_juntados_sin_romper_aspectos():
    c = leer("avatares3d/mixamo/catalogo.ts")
    for nombre in ("Chubasquero y paraguas", "Peregrina bajo la lluvia", "Peregrino con cabaza"):
        assert f"es: '{nombre}'" not in c
    for nombre in ("Día de lluvia", "Peregrino", "Naranja y negro"):
        assert f"es: '{nombre}'" in c
    # El aspecto guarda colores y complementos, nunca el nombre del conjunto: no hay nada que mantener como alias.
    ficha = c.split("export type Aspecto = {", 1)[1].split("}", 1)[0]
    assert "conjunto" not in ficha.lower()


# --- Estrellas claras ----------------------------------------------------------------------------------------------


def test_el_saldo_de_estrellas_esta_en_el_mapa():
    app = leer("PlayerApp.tsx")
    assert "<SaldoDeEstrellas usuario={payload.user} />" in app
    s = leer("avatares3d/mixamo/SaldoDeEstrellas.tsx")
    assert "if (!d?.activos || Object.keys(d.estrellas?.precios ?? {}).length === 0) return null" in s
    assert "★ {saldo}" in s and "EVENTO_DESBLOQUEOS" in s


def test_la_tienda_explica_las_estrellas_a_la_vista():
    t = leer("avatares3d/mixamo/textosTienda.ts")
    assert "estrellasFija: 'Ganas ★ al superar cada nodo. Gástalas en lo bloqueado 🔒'," in t
    assert "estrellasFija: 'Gañas ★ ao superar cada nodo. Gástaas no bloqueado 🔒'," in t
    assert "sinEstrellas: 'Aún no tienes estrellas: supera nodos'," in t and "sinEstrellas: 'Aínda non tes estrelas: supera nodos'," in t
    tienda = leer("avatares3d/mixamo/TiendaDeRopa.tsx")
    assert "{saldo === 0 ? t.sinEstrellas : t.estrellasFija}" in tienda


def test_precio_en_las_muestras_bloqueadas_y_saldo_tras_comprar():
    tienda = leer("avatares3d/mixamo/TiendaDeRopa.tsx")
    assert tienda.count("conPrecio />") == 3, "pelo y las dos paletas de ropa"
    assert "t.comprada(nombreDeClave(clave, idioma), r.estado?.estrellas?.saldo)" in tienda
    t = leer("avatares3d/mixamo/textosTienda.ts")
    assert "te quedan ${quedan} ★" in t and "quédanche ${quedan} ★" in t


def test_mas_n_estrellas_al_superar_un_nodo_una_sola_vez():
    hoja = leer("components/InteractionSheet.tsx")
    assert "est: saldoVisible(copia) === null ? 0 : copia?.estrellas?.por_nodo ?? 0" in hoja
    assert "estrellas={festejo.est}" in hoja
    s = leer("components/SuperadoEnHoja.tsx")
    assert "estrellas > 0 ? <span className=\"saga-superado-estrella\">+{estrellas} ★</span>" in s
    assert ".saga-superado-pena, .saga-superado-estrella { animation: none; }" in s
    # Un solo sitio: el aviso del mapa de «¡Desbloqueado!» no lleva el +N ★ (no se repite).
    assert "+{" not in leer("avatares3d/mixamo/AvisoDeDesbloqueo.tsx")
