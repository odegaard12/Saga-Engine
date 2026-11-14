"""15/11: el servidor guarda las fotos SIN EXIF/GPS aunque el cliente no sea la app, conservando la orientación."""
from io import BytesIO

from PIL import Image

from backend.app.routers import field_proofs


def _jpeg_con_gps_falso(orientacion=1):
    img = Image.new("RGB", (40, 20), (200, 30, 30))
    img.paste((30, 30, 200), (0, 0, 10, 20))  # franja azul a la izquierda
    exif = Image.Exif()
    exif[0x0112] = orientacion
    gps = exif.get_ifd(0x8825)
    gps[1], gps[2], gps[3], gps[4] = "N", (0.0, 0.0, 0.0), "E", (0.0, 0.0, 0.0)  # 0°N 0°E inventado
    exif[0x010E] = "comentario de prueba"
    buf = BytesIO()
    img.save(buf, "JPEG", exif=exif)
    return buf.getvalue()


def test_la_entrada_de_prueba_si_lleva_gps():
    assert 0x8825 in Image.open(BytesIO(_jpeg_con_gps_falso())).getexif()


def test_guardar_quita_el_exif_y_el_gps(tmp_path):
    destino = tmp_path / "f.jpg"
    field_proofs._guardar_foto_y_miniatura(destino, _jpeg_con_gps_falso(), tmp_path / "t" / "f.jpg")
    guardada = Image.open(destino)
    assert len(guardada.getexif()) == 0 and not guardada.getexif().get_ifd(0x8825)
    assert b"Exif" not in destino.read_bytes()[:64]


def test_la_orientacion_se_aplica_antes_de_quitarla(tmp_path):
    destino = tmp_path / "f.jpg"
    field_proofs._guardar_foto_y_miniatura(destino, _jpeg_con_gps_falso(orientacion=6), tmp_path / "t" / "f.jpg")
    assert Image.open(destino).size == (20, 40)  # 40x20 girada 90°: sale vertical y sin etiqueta


def test_png_y_webp_tambien(tmp_path):
    for fmt, mt in (("PNG", "image/png"), ("WEBP", "image/webp")):
        buf = BytesIO()
        Image.new("RGB", (6, 6)).save(buf, fmt)
        salida = field_proofs.quitar_metadatos(buf.getvalue(), mt)
        assert Image.open(BytesIO(salida)).format == fmt
