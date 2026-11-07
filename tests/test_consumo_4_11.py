# -*- coding: utf-8 -*-
"""4/11: revisión de batería y consumo (banco con la GPU real, ver el informe de la revisión)."""
import re
from pathlib import Path

RAIZ = Path(__file__).resolve().parents[1]
GPS = RAIZ / "frontend" / "src" / "player" / "hooks" / "useGpsDelJugador.ts"


def test_el_encuadre_forzado_del_gps_vale_solo_para_la_primera_posicion():
    """El GPS arranca con `forceFocus` y `onSuccess` lo leía del cierre en CADA posición: en modo seguir, cada punto
    (1 por segundo andando) pedía un vuelo en arco a zoom 17. Medido: el mapa repintando sin parar y ~34 % de CPU del
    hilo principal andando, y el zoom devuelto a 17 aunque te hubieras alejado. Seguir ya desliza el mapa (caja
    central, ver MapSurfaceGL)."""
    fuente = GPS.read_text(encoding="utf-8")
    cuerpo = fuente[fuente.index("let encuadrePendiente = Boolean(options?.forceFocus)") :]
    cuerpo = cuerpo[: cuerpo.index("setFocusRequest(") + 200]
    assert "if (encuadrePendiente && followPlayerRef.current) {\n        encuadrePendiente = false" in cuerpo
    assert not re.search(r"if \(options\?\.forceFocus && followPlayerRef\.current\)", fuente), "otra vez leído del cierre"


def test_las_capas_de_nodos_solo_se_tocan_si_cambian():
    """`volcarPendientes` va colgado de `styledata` y `setLayoutProperty` repinta aunque el valor sea el mismo (y
    vuelve a disparar `styledata`): medido andando, ~13 llamadas/s y el mapa repintando por ellas sin cambiar nada."""
    mapa = (RAIZ / "frontend" / "src" / "player" / "components" / "MapSurfaceGL.tsx").read_text(encoding="utf-8")
    bloque = mapa[mapa.index("const volcarPendientes = () => {") : mapa.index("aplicarModoRef.current = volcarPendientes")]
    assert "vivo.setLayoutProperty(" not in bloque and bloque.count("ponerDiseno(vivo, ") == 10  # 7/11: + icon-anchor (moneda centrada / poste)
    ayuda = mapa[mapa.index("const ponerDiseno = (") : mapa.index("const volcarPendientes = () => {")]
    assert "JSON.stringify(vivo.getLayoutProperty(capa, propiedad)) === JSON.stringify(valor)) return" in ayuda


def test_el_modo_ahorro_ahorra_tambien_andando():
    """5/11: con el ahorro de batería puesto, andando gastaba lo mismo que sin él (34 % de CPU): sólo tocaba la nitidez
    del mapa, las casas y el sombreado. Ahora, SÓLO en ahorro: nodos 3D a 10 por segundo, avatares en calidad baja (sin
    que el medidor la suba) y latido cada 60 s (lo mismo que con poca cobertura; el servidor da «en vivo» hasta 180 s)."""
    jug = RAIZ / "frontend" / "src" / "player"
    nodos = (jug / "components" / "nodosTresD.ts").read_text(encoding="utf-8")
    assert "export const MS_ENTRE_FOTOGRAMAS_AHORRO = 100" in nodos
    assert "const enAhorro = typeof window !== 'undefined' && ahorroActivo(window.localStorage)" in nodos
    assert "const msEntreFotogramas = enAhorro ? MS_ENTRE_FOTOGRAMAS_AHORRO : 33" in nodos and "}, msEntreFotogramas)" in nodos
    avatares = (jug / "avatares3d" / "mixamo" / "capaAvatares.ts").read_text(encoding="utf-8")
    assert "(enAhorro ? 'baja' : calidadInicial(entornoDelMovil()))" in avatares and "if (nueva && !enAhorro) calidad = nueva" in avatares
    latido = (jug / "hooks" / "useLatidoYCola.ts").read_text(encoding="utf-8")
    assert "conexionAhorradora() || ahorroActivo(window.localStorage) ? 60000 : 30000" in latido
