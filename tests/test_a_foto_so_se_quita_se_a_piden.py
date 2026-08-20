# -*- coding: utf-8 -*-
"""La foto sólo se saca del JSON si el cliente dice que sabe pedirla por URL.

Sacarla del paquete es el recorte grande —deja los 120 KB en unos 40—, pero es
también el cambio más peligroso de todos: un móvil con la aplicación vieja
cacheada sigue esperando la foto ahí dentro. Quitársela de golpe le dejaría el
mosaico en blanco sin cobertura, que es el fallo más caro que ha tenido esto.

Por eso **lo pide el cliente y no lo decide el servidor**. Mientras no lo pida,
todo sigue exactamente igual que antes. Eso es lo que hace este cambio seguro de
desplegar sin esperar a que nadie actualice nada.
"""
import base64
import os
import tempfile

os.environ.setdefault("ADMIN_PASS", "pytest_admin_password")
os.environ.setdefault("SAGA_DATA_DIR", tempfile.mkdtemp(prefix="saga-test-optin-"))

import main  # noqa: E402

FOTO = "data:image/webp;base64," + base64.b64encode(b"x" * 3000).decode()


def nodo():
    cfg = {"game_id": "place_mosaic", "image_data_url": FOTO}
    return {
        "id": 7, "title": "Final", "lat": 42.36, "lon": -8.67, "radius": 50,
        "type": "minigame", "config": dict(cfg),
        "minigame": {"type": "place_mosaic", "config": dict(cfg)},
        "success": {"code": "OK"},
    }


def _config(fotos_por_url):
    salida = main.project_stage_for_player(nodo(), include_runtime=True, fotos_por_url=fotos_por_url)
    return ((salida.get("minigame") or {}).get("config")) or {}


def test_por_omision_a_foto_segue_dentro():
    """Un móvil viejo tiene que seguir recibiéndola."""
    c = _config(False)
    assert c.get("image_data_url") == FOTO, (
        "se ha quitado la foto sin que nadie la pidiera por URL: un móvil con la "
        "aplicación vieja se queda con el mosaico en blanco sin cobertura"
    )


def test_se_a_piden_por_url_a_foto_xa_non_vai_dentro():
    c = _config(True)
    assert "image_data_url" not in c, "sigue viajando dentro; no se ahorra nada"


def test_a_url_vai_sempre_nos_dous_casos():
    """Se anuncia siempre: es lo que permite migrar sin prisa."""
    assert _config(False).get("image_url")
    assert _config(True).get("image_url")
