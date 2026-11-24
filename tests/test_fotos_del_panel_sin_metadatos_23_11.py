# -*- coding: utf-8 -*-
"""23/11 (auditoría de seguridad, B7): las fotos que sube el panel se guardan sin metadatos.

Las fotos de perfil (`avatar_url`) y las incrustadas en los nodos (mosaico, pistas) se validaban pero se guardaban con
sus bytes tal cual, y se sirven a todos los jugadores: el EXIF de una foto del móvil dice dónde se hizo. Ahora pasan
por el mismo `quitar_metadatos` de las fotos de prueba; la que no lleva metadatos se queda byte a byte.
"""
import base64
import io
import os
import tempfile
from pathlib import Path

os.environ.setdefault("ADMIN_PASS", "pytest_admin_password")
os.environ.setdefault("SAGA_DATA_DIR", tempfile.mkdtemp(prefix="saga-test-fotos-panel-"))

import pytest  # noqa: E402

Image = pytest.importorskip("PIL.Image")

from backend.app.routers import admin  # noqa: E402
from backend.app.security import imagenes  # noqa: E402

RAIZ = Path(__file__).resolve().parents[1]
GPS = 0x8825


def _data_url(datos, tipo="image/jpeg"):
    return "data:%s;base64,%s" % (tipo, base64.b64encode(datos).decode("ascii"))


def _bytes_de(data_url):
    return base64.b64decode(data_url.split(",", 1)[1])


def _jpeg(con_gps):
    imagen = Image.new("RGB", (48, 32), (200, 30, 30))
    salida = io.BytesIO()
    if con_gps:
        exif = Image.Exif()
        exif[0x010F] = "Camara de prueba"
        exif[GPS] = {1: "N", 2: (40.0, 25.0, 12.5), 3: "W", 4: (3.0, 41.0, 30.25)}
        imagen.save(salida, "JPEG", quality=80, exif=exif)
    else:
        imagen.save(salida, "JPEG", quality=80)
    return salida.getvalue()


def _png_con_texto():
    from PIL import PngImagePlugin

    info = PngImagePlugin.PngInfo()
    info.add_text("Location", "40.42,-3.69")
    salida = io.BytesIO()
    Image.new("RGBA", (16, 16), (0, 0, 0, 0)).save(salida, "PNG", pnginfo=info)
    return salida.getvalue()


def _gps_de(datos):
    with Image.open(io.BytesIO(datos)) as imagen:
        return dict(imagen.getexif().get_ifd(GPS))


def test_la_foto_de_prueba_lleva_gps_de_verdad():
    assert _gps_de(_jpeg(con_gps=True)), "si no, las pruebas de abajo no prueban nada"
    assert imagenes.lleva_metadatos(_jpeg(con_gps=True)) and not imagenes.lleva_metadatos(_jpeg(con_gps=False))
    assert imagenes.lleva_metadatos(_png_con_texto())


def test_el_gps_del_exif_no_sobrevive_en_una_foto_de_perfil():
    perfiles = admin._normalize_incoming_profiles(
        [{"id": "PLAYER 1", "avatar_url": _data_url(_jpeg(con_gps=True))}], {}, set(), {}
    )

    guardada = _bytes_de(perfiles[0]["avatar_url"])
    assert perfiles[0]["avatar_url"].startswith("data:image/jpeg;base64,")
    assert _gps_de(guardada) == {} and b"Exif" not in guardada and b"Camara de prueba" not in guardada
    assert not imagenes.lleva_metadatos(guardada)
    with Image.open(io.BytesIO(guardada)) as imagen:
        assert imagen.size == (48, 32), "la foto sigue siendo la foto"


def test_una_foto_sin_metadatos_se_guarda_byte_a_byte_y_limpiar_dos_veces_no_cambia_nada():
    limpia = _data_url(_jpeg(con_gps=False))
    assert admin.foto_sin_metadatos(limpia) == limpia, "la que comprime el panel no se recodifica (no engorda)"

    una_vez = admin.foto_sin_metadatos(_data_url(_jpeg(con_gps=True)))
    assert admin.foto_sin_metadatos(una_vez) == una_vez, "si cambiase en cada guardado, cambiaría la huella de la foto"


def test_las_fotos_de_los_nodos_tambien_y_lo_demas_no_se_toca():
    nodos = [
        {
            "id": "n1",
            "title": "data: no soy una foto",
            "interaction": {
                "config": {
                    "image_data_url": _data_url(_jpeg(con_gps=True)),
                    "questions": [{"question": "¿?", "hint_image_data_url": _data_url(_png_con_texto(), "image/png")}],
                    "grid_size": 3,
                }
            },
        }
    ]

    salida = admin.nodos_sin_metadatos(nodos)

    config = salida[0]["interaction"]["config"]
    assert _gps_de(_bytes_de(config["image_data_url"])) == {}
    pista = _bytes_de(config["questions"][0]["hint_image_data_url"])
    assert b"tEXt" not in pista and b"40.42" not in pista
    assert config["grid_size"] == 3 and salida[0]["title"] == "data: no soy una foto"


def test_lo_que_no_es_una_foto_o_no_se_puede_recodificar_no_cuela_metadatos():
    assert admin.foto_sin_metadatos("/api/admin/foto/PLAYER%201?v=abc") == "/api/admin/foto/PLAYER%201?v=abc"
    svg = "data:image/svg+xml;base64," + base64.b64encode(b"<svg/>").decode("ascii")
    assert admin.foto_sin_metadatos(svg) == svg, "ni se toca: los filtros de tipo de cada campo la descartan después"
    # Un JPEG con EXIF y el cuerpo roto: Pillow lo reconoce por la cabecera pero no lo puede recodificar.
    roto = _jpeg(con_gps=True)
    roto = roto[: roto.index(b"\xff\xda") + 12]
    assert admin.foto_sin_metadatos(_data_url(roto)) in ("", _data_url(roto))
    if admin.foto_sin_metadatos(_data_url(roto)):
        assert imagenes.decodificar_data_url_de_imagen(_data_url(roto)) is None, "sólo queda igual si ya no es una imagen"


def test_el_guardado_de_nodos_y_el_de_perfiles_pasan_por_la_limpieza():
    fuente = (RAIZ / "backend/app/routers/admin.py").read_text(encoding="utf-8")
    assert 'stages = await run_in_threadpool(nodos_sin_metadatos, data.get("stages"))' in fuente
    assert "avatar = _as_str(foto_sin_metadatos(avatar))" in fuente
    assert "from backend.app.routers.field_proofs import quitar_metadatos" in fuente
