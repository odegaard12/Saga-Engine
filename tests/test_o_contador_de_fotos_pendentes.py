# -*- coding: utf-8 -*-
"""El jugador tiene que ver cuántas fotos le quedan sin subir.

`useFotosDeCampo` ya distinguía las fotos del servidor de las pendientes
(`fotos.pendientes`), y `PlayerApp.tsx` incluso las nombraba
(`fotosPendentes`), pero ese número no llegaba a ningún sitio de la pantalla:
se calculaba y se tiraba, igual que le pasó al aviso de «sin cobertura»
(ver `test_o_aviso_sen_cobertura_chega.py`). El jugador hacía una foto en el
monte y no tenía forma de saber que seguía en el móvil.

Estado a 27 de agosto de 2026: sale un aviso junto al botón de descargar
fotos, sólo cuando hay al menos una pendiente.
"""
from pathlib import Path

RAIZ = Path(__file__).resolve().parent.parent
JUGADOR = RAIZ / "frontend" / "src" / "player"
APP = JUGADOR / "PlayerApp.tsx"
HUD = JUGADOR / "components" / "PlayerHud.tsx"


def app() -> str:
    return APP.read_text(encoding="utf-8")


def hud() -> str:
    return HUD.read_text(encoding="utf-8")


def test_playerapp_manda_o_conto_de_pendentes_ao_hud():
    texto = app()
    assert "pendingFieldPhotoCount={fotosPendentes.length}" in texto, (
        "PlayerApp calcula fotosPendentes pero no se lo pasa al HUD: "
        "el dato existe y no se pinta, el mismo fallo de siempre"
    )


def test_o_hud_so_pinta_o_aviso_con_algo_pendente():
    texto = hud()
    assert "pendingFieldPhotoCount" in texto, "falta el prop en PlayerHud"

    inicio = texto.index("pendingFieldPhotoCount > 0")
    trozo = texto[inicio : inicio + 200]
    assert "photosPending" in trozo, (
        "el aviso de pendientes no está condicionado a que haya alguna; "
        "tiene que desaparecer con la cola vacía"
    )


def test_o_aviso_non_leva_forma_escrita_en_liña():
    """El fallo de las cuatro veces: una forma en línea gana siempre al tema."""
    texto = hud()
    inicio = texto.index("const pendingPhotosBadge")
    fin = texto.index("\n}", inicio)
    cuerpo = texto[inicio:fin]

    assert "borderRadius: 'var(--theme-" in cuerpo, (
        "pendingPhotosBadge no usa una variable del tema para su borderRadius"
    )
