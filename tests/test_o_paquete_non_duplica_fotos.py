# -*- coding: utf-8 -*-
"""El paquete del jugador no puede llevar la misma foto dos veces.

Medido contra producción el 2026-08-20: el paquete son 203 KB, y **160 de esos
KB son UNA foto repetida**:

    stages[9].minigame.config.image_data_url   79,8 KB
    stages[9].config.image_data_url            79,8 KB  (byte a byte la misma)

Los diez nodos tienen `config` y `minigame.config` idénticos, pero la foto del
mosaico es lo único lo bastante gordo para que se note. Por eso el paquete
comprime tan mal (200 KB → 136 KB, un 32 %): dentro va base64 de un WebP, que
ya está comprimido y no se deja.

Quién lee qué: `configDelNodo.ts` mezcla las dos y **la del minijuego pisa a la
del editor**, así que quitar el duplicado del `config` de arriba no cambia nada
para el jugador. Su propio comentario dice que quitar uno de los dos «es trabajo
del servidor»; esto es esa parte, hecha en pequeño.

Se quita sólo lo GORDO y sólo cuando es idéntico. No se toca `game_id` ni nada
que decida la identidad del nodo, que se lee de `config` en varios sitios.
"""
import os
import tempfile

os.environ.setdefault("ADMIN_PASS", "pytest_admin_password")
os.environ.setdefault("SAGA_DATA_DIR", tempfile.mkdtemp(prefix="saga-test-foto-"))

from backend.app.runtime.mision import project_stage_for_player  # noqa: E402

FOTO = "data:image/webp;base64," + ("A" * 5000)


def nodo():
    cfg = {"game_id": "place_mosaic", "image_data_url": FOTO}
    return {
        "id": 9, "title": "Final", "lat": 42.36, "lon": -8.67, "radius": 50,
        "type": "minigame", "config": dict(cfg),
        "minigame": {"type": "place_mosaic", "config": dict(cfg)},
        "success": {"code": "OK"},
    }


def test_a_foto_non_viaxa_dúas_veces():
    salida = project_stage_for_player(nodo(), include_runtime=True)
    arriba = salida.get("config") or {}
    assert "image_data_url" not in arriba, (
        "la foto sigue duplicada en el config de arriba: son 80 KB de más por "
        "jugador y por descarga"
    )


def test_a_foto_segue_chegando_polo_minixogo():
    """Quitar el duplicado no puede dejar al jugador sin la foto."""
    salida = project_stage_for_player(nodo(), include_runtime=True)
    delJuego = ((salida.get("minigame") or {}).get("config")) or {}
    assert delJuego.get("image_data_url") == FOTO, "el mosaico se queda sin foto"


def test_a_identidade_do_nodo_non_se_toca():
    """`game_id` se lee de `config` en varios sitios: no puede desaparecer."""
    salida = project_stage_for_player(nodo(), include_runtime=True)
    arriba = salida.get("config") or {}
    assert arriba.get("game_id") == "place_mosaic"
    assert arriba.get("objective") == "image_mosaic"


def test_o_resto_da_config_segue_igual_nos_dous_sitios():
    """Sólo se va lo gordo y duplicado. Lo demás no se toca."""
    salida = project_stage_for_player(nodo(), include_runtime=True)
    arriba = dict(salida.get("config") or {})
    delJuego = dict(((salida.get("minigame") or {}).get("config")) or {})
    # La foto y su URL sólo viven en la del minijuego: una porque es la que
    # manda, la otra porque se anuncia ahí para el cliente que sepa usarla.
    delJuego.pop("image_data_url", None)
    delJuego.pop("image_url", None)
    assert arriba == delJuego, "se ha quitado algo más que la foto duplicada"
