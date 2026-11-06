# -*- coding: utf-8 -*-
"""5/11/2026: la Guía que sabe en qué estás (versión C, elegida por Óscar).

- La pestaña Guía de la mochila pone «Ahora» arriba, «Después» debajo y marca los pasos del nodo.
- La línea bajo el botón grande del mapa dice el «Ahora» del estado, con un «?» al lado que abre la Guía.
- Dentro de un juego, el «?» de su barra abre la ficha de la Guía de ese juego (la historia sigue dentro).
- Sin chip nuevo sobre el mapa.

Un test por estado del inventario: tests/js/guia_5_11.cjs ejecuta src/player/guia/guia.ts tal cual.
"""
import json
import shutil
import subprocess
from functools import lru_cache
from pathlib import Path

import pytest

RAIZ = Path(__file__).resolve().parent.parent
SRC = RAIZ / "frontend" / "src" / "player"


def leer(relativo: str) -> str:
    return (SRC / relativo).read_text(encoding="utf-8-sig")


@lru_cache(maxsize=1)
def guia() -> dict:
    node = shutil.which("node")
    if not node:
        pytest.skip("sin node")
    p = subprocess.run([node, str(RAIZ / "tests" / "js" / "guia_5_11.cjs")], capture_output=True, text=True,
                       encoding="utf-8", timeout=120, cwd=str(RAIZ))
    assert p.returncode == 0, p.stderr[-2000:]
    return json.loads(p.stdout)


def estado(nombre: str) -> dict:
    d = guia()["estados"][nombre]
    assert d["estado"] == nombre
    for idioma in ("es", "gl", "en"):
        assert d[idioma]["ahora"], (nombre, idioma)
    # Gallego de verdad, no el castellano copiado.
    assert d["gl"]["ahora"] != d["es"]["ahora"], nombre
    return d


def test_antes_de_empezar():
    d = estado("antes_de_empezar")
    assert d["es"]["ahora"] == "La misión empieza a las 18:30. Ve al punto de salida."
    assert d["gl"]["ahora"] == "A misión comeza ás 18:30. Vai ao punto de saída."


def test_camino_lejos_dice_nodo_distancia_y_lo_que_hay_alli():
    d = estado("camino_lejos")
    assert d["es"]["ahora"] == "Camina hacia el nodo 4 siguiendo la línea del mapa."
    assert d["es"]["despues"] == "Pulso de hierro."
    assert d["gl"]["despues"] == "Pulso de ferro."


def test_camino_cerca():
    d = estado("camino_cerca")
    assert d["es"]["ahora"] == "Ya casi: entra en el círculo y el nodo se abre."
    assert d["gl"]["ahora"] == "Xa case: entra no círculo e o nodo ábrese."


def test_mapa_mudo_no_da_distancia():
    d = estado("mapa_mudo")
    assert d["es"]["ahora"] == "Sigue la pista y busca dentro de la zona."


def test_dentro_del_radio():
    d = estado("dentro_del_radio")
    assert d["es"]["ahora"] == "Ya estás dentro: pulsa «Abrir nodo»."
    assert d["gl"]["ahora"] == "Xa estás dentro: preme «Abrir nodo»."


def test_reglas_del_juego():
    d = estado("reglas")
    assert "el reloj no corre hasta «Empezar»" in d["es"]["ahora"]
    assert "o reloxo non corre ata «Comezar»" in d["gl"]["ahora"]


def test_jugando_dice_la_regla_del_juego_y_el_respaldo():
    d = guia()["estados"]["jugando"]
    assert d["estado"] == "jugando"
    assert d["es"]["ahora"] == "Sujeta el móvil quieto con una mano y repite con la otra la secuencia de colores."
    # 7/11: «¿Atascado?» ya va al pie de cada juego; la Guía no lo repite.
    assert d["es"]["despues"] == "Al superarlo, al siguiente nodo."
    assert d["gl"]["ahora"].startswith("Suxeita o móbil")


def test_qr():
    d = estado("qr")
    assert d["es"]["ahora"] == "Busca la pegatina QR y pulsa «Abrir QR»."
    assert "1 min" in d["es"]["despues"]


def test_coleccionable():
    d = estado("coleccionable")
    assert d["es"]["ahora"] == "Pulsa «Recoger»: va a tu mochila y no suma tiempo."


def test_falta_un_objeto():
    d = estado("falta_objeto")
    assert d["es"]["ahora"] == "Este nodo pide la llave de hierro. Fabrícalo en Mochila › Mesa."
    assert d["gl"]["ahora"] == "Este nodo pide la llave de hierro. Fabrícao en Mochila › Mesa."


def test_sin_gps_y_gps_rendido():
    d = estado("sin_gps")
    assert d["es"]["ahora"] == "Buscando señal: sal a cielo abierto un momento."
    r = estado("gps_rendido")
    assert r["es"]["ahora"] == "Sin posición fiable: puedes abrir el nodo igual."


def test_sin_red_con_pendientes():
    d = estado("sin_red")
    assert d["es"]["ahora"] == "Sin cobertura: sigue jugando. 2 avances esperan y suben solos."
    assert d["gl"]["ahora"] == "Sen cobertura: segue xogando. 2 avances agardan e soben sós."
    x = guia()["extra"]
    assert x["unPendiente"] == "Sin cobertura: sigue jugando. 1 avance espera y sube solo."
    assert x["sinRedSinPendientes"] == "camino_lejos", "sin red y sin nada pendiente no hay nada que contar"
    assert x["jugandoSinRed"] == "jugando", "dentro de un juego manda el juego"


def test_mision_terminada_esperando_a_los_demas():
    d = estado("terminada")
    assert d["es"]["ahora"] == "¡Ruta completa! Tu tiempo ya está guardado."
    assert d["es"]["despues"] == "Esperando a que terminen los demás (3 de 5)."
    assert guia()["extra"]["todosTerminados"] == "Xa rematastes todos."


def test_esperando_nodo():
    estado("esperando_nodo")


def test_notas_de_ahorro_y_estrellas_solo_cuando_toca():
    x = guia()["extra"]
    # 7/11: las estrellas sólo en la tienda.
    assert x["notas"] == [
        "Modo aforro: o mapa vai máis sinxelo para que dure a batería. O xogo, igual.",
    ]
    assert x["sinNotas"] == []


def test_cada_nodo_sabe_su_juego():
    c = guia()["claves"]
    assert c == {
        "pulso": "pulso", "dinamo": "dinamo", "matriz": "matriz", "balanza": "balanza", "relevo": "relevo",
        "control": "control", "mapa_mudo": "mapa_mudo", "trampa": "trampa", "qr": "qr",
        "coleccionable": "coleccionable", "ninguno": None,
    }


def test_reglas_comprobadas_de_matriz_balanza_y_relevo():
    r = guia()["reglas"]
    # Matriz: se memoriza el trazado y se marca (a veces al revés); cada fallo +5 s (core/textos.ts circuit).
    assert "márcalo después; a veces, al revés. Cada fallo suma 5 s" in r["matriz"]["es"]["regla"]
    # Balanza: una bola pesa más y hay pesadas contadas (logica/textos.ts balanza.intro).
    assert "Una bola pesa más" in r["balanza"]["es"]["regla"] and "pesadas" in r["balanza"]["es"]["regla"]
    # Relevo: dos o más juntos en el mismo punto, validar, y necesita cobertura (teamRelay).
    assert "dos o más del equipo en el mismo punto" in r["relevo"]["es"]["regla"]
    assert "Necesita cobertura" in r["relevo"]["es"]["regla"]
    assert r["pulso"]["es"]["regla"] == "Sujeta el móvil quieto con una mano y repite con la otra la secuencia de colores."
    for clave in r:
        assert r[clave]["gl"]["regla"] != r[clave]["es"]["regla"] and r[clave]["en"]["regla"]


def test_la_linea_bajo_el_boton_dice_el_ahora_con_un_interrogante_que_abre_la_guia():
    hud = leer("components/PlayerHud.tsx")
    assert "const helperCopy = avisoGps || !guia ? helperText : guia.ahora" in hud
    assert "data-saga-abrir-guia" in hud and "onClick={abrirGuia}" in hud
    abrir = hud.split("function abrirGuia()", 1)[1][:160]
    assert "setBackpackTab('requirements')" in abrir and "if (!detailsOpen) onToggleDetails()" in abrir
    assert "<RequirementPreviewPanel user={user} stage={currentStage} entrada={entradaGuia} />" in hud
    app = leer("PlayerApp.tsx")
    assert "entradaGuia={entradaGuia}" in app and "avisoGps={gpsQualityWarning}" in app
    # El hook va antes de las salidas tempranas de PlayerApp (reglas de los hooks).
    assert app.index("const red = useSinRed(user)") < app.index("if (eleccion === 'comprobando')")


def test_la_pestana_guia_pone_ahora_arriba_y_marca_los_pasos():
    p = leer("components/RequirementPreviewPanel.tsx")
    assert p.index("{ahora}") < p.index("<div style={header}>")
    assert "<Numero n={1} marca={marcaCamino} />" in p and "marca={marcaObjeto}" in p and "marca={marcaAccion}" in p


def test_el_interrogante_del_juego_abre_su_ficha_y_la_historia_sigue_dentro():
    h = leer("components/InteractionSheet.tsx")
    barra = h.split('className="mg-btn mg-btn-ayuda"', 1)[1][:400]
    assert "setFichaGuia(true)" in barra and "onShowHistory()" not in barra
    assert "<FichaDelJuego" in h and "alVerHistoria={" in h
    f = leer("guia/FichaDelJuego.tsx")
    assert "alVerHistoria ? (" in f


def test_sin_chip_nuevo_sobre_el_mapa():
    for fichero in ("guia/guia.ts", "guia/AhoraDeLaGuia.tsx", "guia/FichaDelJuego.tsx"):
        assert "chip" not in leer(fichero).lower(), fichero
    assert "from '../guia/" not in leer("components/MapSurfaceGL.tsx")
