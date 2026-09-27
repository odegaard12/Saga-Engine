"""
PlayerApp.tsx tenía avisos (showNotice/confirm) escritos a pelo: unos en
castellano, otros en inglés ("Centered on node.", "Player follow
enabled."), y un par -por error- ya en gallego dentro de un showNotice que
se supone en castellano ("Sen cobertura: a foto..."). En una misión en
gallego, todo eso se veía igual, en el idioma equivocado, porque el puente
de idioma sólo traduce texto ya renderizado y estas cadenas llevan datos
dentro (metros, contadores).

Este test comprueba que showNotice ya no recibe literales sueltos: todo
pasa por el diccionario NOTICES (es/gl) elegido según `locale`. También
comprueba que las dos frases del mapa que salían fijas en gallego
("Saíches do camiño") ahora tienen versión en castellano y su traducción
al gallego está en el puente de idioma.
"""
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
PLAYER_APP = ROOT / "frontend" / "src" / "player" / "PlayerApp.tsx"
MAP_SURFACE = ROOT / "frontend" / "src" / "player" / "components" / "MapSurface.tsx"
BRIDGE = ROOT / "frontend" / "src" / "i18n" / "legacySpanishBridge.ts"


def test_show_notice_no_lleva_literales_sueltos() -> None:
    fonte = PLAYER_APP.read_text(encoding="utf-8")
    # Ningún showNotice debe empezar con una cadena literal: todo debe venir
    # de N.<algo> (el diccionario NOTICES elegido por locale).
    literales = re.findall(r"showNotice\(\s*['\"`]", fonte)
    assert literales == [], f"showNotice con literal suelto: {literales}"


def test_notices_tiene_es_y_gl_para_los_avisos_clave() -> None:
    fonte = PLAYER_APP.read_text(encoding="utf-8")
    assert "const NOTICES = {" in fonte
    assert "const N = locale === 'gl' ? NOTICES.gl : NOTICES.es" in fonte
    for clave in ("gpsImpreciso", "sinCoberturaBorradoFoto", "nodoActivoInexistente", "misionDescargada"):
        # La clave tiene que existir tanto en es: {...} como en gl: {...}
        assert fonte.count(f"{clave}:") >= 2, clave


def test_avisos_ingleses_ya_no_estan_sueltos_en_ingles() -> None:
    fonte = PLAYER_APP.read_text(encoding="utf-8")
    for suelto in (
        "'No active node is available right now.'",
        "'Centered on node.'",
        "'Player follow enabled.'",
        "'Free map enabled.'",
        "'Complete the previous stage before interacting here.'",
    ):
        assert suelto not in fonte, suelto


def test_aviso_de_fuera_de_camino_esta_en_castellano_en_la_fuente() -> None:
    fonte = MAP_SURFACE.read_text(encoding="utf-8")
    # Antes decía "Saíches do camiño" / "Volve á liña verde" tal cual, en
    # gallego, sin importar el idioma de la misión.
    assert "Saíches do camiño" not in fonte
    assert "Volve á liña verde" not in fonte
    assert "Te has salido del camino" in fonte
    assert "Vuelve a la línea verde" in fonte


def test_el_puente_traduce_el_aviso_de_fuera_de_camino_al_galego() -> None:
    fonte = BRIDGE.read_text(encoding="utf-8")
    assert "'Te has salido del camino': 'Saíches do camiño'," in fonte
    assert "'Vuelve a la línea verde': 'Volve á liña verde'," in fonte
