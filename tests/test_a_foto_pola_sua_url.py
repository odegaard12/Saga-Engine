# -*- coding: utf-8 -*-
"""La foto de un nodo, por su propia URL y cacheable.

Metida como base64 dentro del JSON de la partida no la puede cachear nadie: ni
el navegador ni Cloudflare, porque va en una respuesta distinta para cada
jugador. Quince móviles abriendo a la vez en el aparcadoiro tiraban quince veces
de la subida de la Raspberry, que es el cuello (la Pi está al 0,18 % de CPU).

La huella va EN LA URL a propósito, para poder declarar la respuesta inmutable y
cachearla un año. Si la foto cambia, cambia la URL. Y con la huella vieja se
contesta 404 en vez de servir la nueva: quien la tuviera cacheada se quedaría
con ella para siempre.
"""
import base64
import os
import tempfile

os.environ.setdefault("ADMIN_PASS", "pytest_admin_password")
os.environ.setdefault("SAGA_DATA_DIR", tempfile.mkdtemp(prefix="saga-test-foto-url-"))

import main  # noqa: E402
from fastapi.testclient import TestClient  # noqa: E402
from backend.app.storage.runtime_store import save_stages  # noqa: E402

CRUDO = b"no-es-un-webp-de-verdad-pero-sirve"
FOTO = "data:image/webp;base64," + base64.b64encode(CRUDO).decode()


def _preparar():
    save_stages(main.STAGES_DB, [{
        "id": 0, "title": "Final", "lat": 42.36, "lon": -8.67, "radius": 50,
        "type": "minigame",
        "config": {"game_id": "place_mosaic", "image_data_url": FOTO},
        "minigame": {"type": "place_mosaic", "config": {"game_id": "place_mosaic", "image_data_url": FOTO}},
        "success": {"code": "OK"},
    }])
    return TestClient(main.app)


def test_a_foto_serve_e_e_a_mesma():
    cliente = _preparar()
    r = cliente.get(f"/media/nodo/0/{main.huella_de_imagen(FOTO)}.webp")
    assert r.status_code == 200
    assert r.content == CRUDO, "lo servido no es la foto del nodo"
    assert r.headers["content-type"].startswith("image/webp")


def test_declarase_inmutable():
    cliente = _preparar()
    r = cliente.get(f"/media/nodo/0/{main.huella_de_imagen(FOTO)}.webp")
    cache = r.headers.get("cache-control", "")
    assert "immutable" in cache and "max-age=31536000" in cache, (
        "sin caché larga, Cloudflare no la reparte y volvemos a tirar quince "
        "veces de la subida de la Pi"
    )


def test_a_huella_vella_non_serve_a_foto_nova():
    cliente = _preparar()
    r = cliente.get("/media/nodo/0/huelladelaanterior.webp")
    assert r.status_code == 404, (
        "se está sirviendo la foto nueva con la dirección vieja: quien la tenga "
        "cacheada se queda con ella para siempre"
    )


def test_un_nodo_que_non_existe_da_404():
    cliente = _preparar()
    assert cliente.get("/media/nodo/99/loquesea.webp").status_code == 404


def test_a_ruta_non_vai_baixo_api():
    """Medido: bajo /api/ Cloudflare contesta DYNAMIC y no la cachea.

    La cabecera de caché sola no le hace cambiar de idea: trata /api/ como
    dinámico por defecto. Con una ruta que parece un fichero de imagen sí entra
    en su caché, que era todo el objetivo de sacarla del JSON.

    Y de paso, el service worker se salta /api/ (`shouldBypass`), así que desde
    /media/ sí puede precacharla para jugar sin cobertura.
    """
    import io as _io
    from pathlib import Path

    juego = Path(__file__).resolve().parent.parent / "backend" / "app" / "routers" / "game.py"
    codigo = _io.open(juego, encoding="utf-8").read()
    assert '"/api/stage-image' not in codigo, "la foto vuelve a estar bajo /api/: Cloudflare no la cacheará"
    assert '"/media/nodo/' in codigo
