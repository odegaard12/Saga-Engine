# -*- coding: utf-8 -*-
"""25/10 (ahorro de datos): en la partida sin paquete, la foto del mosaico del nodo en curso va UNA vez.

Iba en `current_stage` y otra vez en su sitio de `stages` (~80 KB cada una, sin gzip que valga). El móvil juega
con `current_stage`; en la lista basta la URL. El paquete offline la sigue llevando dentro en todos los nodos.
"""
import base64
import os
import tempfile

os.environ.setdefault("ADMIN_PASS", "pytest_admin_password")
os.environ.setdefault("SAGA_DATA_DIR", tempfile.mkdtemp(prefix="saga-test-mosaico-una-"))

from fastapi.testclient import TestClient  # noqa: E402

import main  # noqa: E402
from ruta_de_proba import preparar_mision, ruta_de_seis_nodos  # noqa: E402

FOTO = "data:image/webp;base64," + base64.b64encode(b"x" * 3000).decode()


def _con_mosaico_en(nivel):
    nodos = ruta_de_seis_nodos()
    cfg = {"game_id": "place_mosaic", "image_data_url": FOTO}
    nodos[nivel].update({"type": "minigame", "config": dict(cfg), "minigame": {"type": "place_mosaic", "config": dict(cfg)}})
    main.save_stages(main.STAGES_DB, nodos)


def test_la_foto_va_una_vez_y_el_paquete_sigue_llevandola(monkeypatch, tmp_path):
    preparar_mision(monkeypatch, tmp_path)
    _con_mosaico_en(2)
    main.set_player_progress_level("PLAYER 1", 2)
    cliente = TestClient(main.app)

    texto = cliente.get("/api/game/PLAYER%201").text
    assert texto.count(FOTO) == 1, "la foto del mosaico viaja dos veces en la partida ligera"
    datos = cliente.get("/api/game/PLAYER%201").json()
    assert datos["current_stage"]["minigame"]["config"]["image_data_url"] == FOTO, "el nodo que se juega se queda sin foto"

    paquete = cliente.get("/api/game/PLAYER%201?offline_pack=true").json()
    assert paquete["stages"][2]["minigame"]["config"]["image_data_url"] == FOTO, "el paquete offline perdió la foto"
