# -*- coding: utf-8 -*-
"""Si el mapa offline se guarda a medias, hay que decirlo.

El precache de teselas se arma por capas y se corta en seco al llegar al tope:

    function addTile(...) { if (urls.size >= MAX_TILE_URLS) return ... }
    const orderedUrls = Array.from(urls.keys()).slice(0, MAX_TILE_URLS)

Y el detalle de los nodos —zoom 18, lo que se ve plantado en el nodo con el
mapa ampliado— se añade **el último**. O sea que cuando se llega al tope, lo
primero que se pierde es justo eso.

Medido en el banco de ensayo con la ruta real, y hay que decirlo entero porque
al principio me equivoqué: **hoy no pasa**. La caché tiene 1161 teselas de las
1500 del tope, y 152 son de zoom 18. El detalle de los nodos se guarda entero.

Pero va al 77 % del presupuesto y es el último de la cola. Una ruta con más
nodos, o más larga, llega al tope y pierde el detalle **en silencio**: el panel
de "antes de salir" seguiría diciendo que el mapa está listo, porque cuenta las
que pidió, y pidió menos de las que hacían falta.

Un jugador que confía en ese mensaje y sube al monte se encuentra el mapa en
blanco justo donde tiene que mirarlo. Que se corte puede ser razonable; que no
se sepa, no.
"""
import re
from pathlib import Path

RAIZ = Path(__file__).resolve().parent.parent
TESELAS = RAIZ / "frontend" / "src" / "player" / "offline" / "mapTileCache.ts"


def codigo() -> str:
    texto = TESELAS.read_text(encoding="utf-8")
    texto = re.sub(r"/\*.*?\*/", "", texto, flags=re.DOTALL)
    return re.sub(r"//[^\n]*", "", texto)


def test_o_resumo_di_se_se_corto():
    c = codigo()

    assert "recortado" in c, (
        "el resumen tiene que decir si el mapa se guardo a medias"
    )


def test_sabese_cantas_quedaron_fora():
    c = codigo()

    assert re.search(r"descartadas", c), (
        "hay que contar cuantas teselas se quedaron fuera del tope"
    )


def test_o_detalle_dos_nodos_ten_o_seu_propio_reconto():
    """Es la capa que importa: la que se mira estando en el nodo."""
    c = codigo()

    assert "detalle_de_nodos" in c, (
        "el resumen tiene que decir cuantas teselas de detalle entraron"
    )


def test_o_aviso_do_final_non_di_listo_se_falta_algo():
    """El aviso que cierra la preparación es el que promete.

    El otro `Mapa listo` del fichero es legítimo: es la salida temprana de
    "ya estaba todo guardado", donde no se ha recortado nada.
    """
    c = codigo()

    inicio = c.index("const summary: OfflineMapTileSummary")
    final = c[inicio:]

    assert "summary.recortado ?" in final, (
        "el aviso final no puede anunciar el mapa como completo sin mirar si se cortó"
    )
