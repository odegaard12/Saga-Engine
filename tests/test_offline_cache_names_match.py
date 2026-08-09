# -*- coding: utf-8 -*-
"""Los nombres de caché del cliente y del service worker tienen que coincidir.

El service worker borra al activarse cualquier caché con su mismo prefijo que no
sea la que él usa. Si la descarga offline (teselas del mapa, fotos de ruta) guarda
en un nombre distinto, todo lo descargado desaparece en el siguiente arranque y el
jugador se planta en el monte con el mapa vacío creyendo que lo tenía bajado.
"""
import re
from pathlib import Path

RAIZ = Path(__file__).resolve().parents[1]
SW = RAIZ / "frontend" / "public" / "sw.js"
TESELAS = RAIZ / "frontend" / "src" / "player" / "offline" / "mapTileCache.ts"
FOTOS = RAIZ / "frontend" / "src" / "player" / "offline" / "fieldProofCache.ts"


def _constante(fichero: Path, nombre: str) -> str:
    texto = fichero.read_text(encoding="utf-8")
    encontrado = re.search(rf"^const {nombre} = '([^']+)'", texto, re.MULTILINE)
    assert encontrado, f"no se encuentra {nombre} en {fichero.name}"
    return encontrado.group(1)


def test_cache_de_teselas_coincide_con_el_service_worker():
    assert _constante(TESELAS, "TILE_CACHE_NAME") == _constante(SW, "TILE_CACHE_NAME")


def test_cache_de_fotos_de_ruta_coincide_con_el_service_worker():
    assert _constante(FOTOS, "FIELD_PROOF_ASSET_CACHE") == _constante(
        SW, "FIELD_PROOF_ASSET_CACHE"
    )


def test_el_service_worker_borra_las_caches_viejas_con_esos_prefijos():
    # Si esta limpieza desapareciera, el test de arriba dejaría de importar:
    # se deja explícito para que quede claro por qué deben coincidir.
    texto = SW.read_text(encoding="utf-8")
    assert "key.startsWith('saga-route-tile-coverage-')" in texto
    assert "key.startsWith('saga-field-proof-assets-')" in texto
