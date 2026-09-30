# -*- coding: utf-8 -*-
"""Caza de fallos del 30/09/2026, S10: la subida de fotos.

- Sin `Image.MAX_IMAGE_PIXELS` propio: un PNG de 3 MB puede declarar 170 Mpx y
  pedir 0,5-1 GB al decodificarlo, en el proceso que atiende a todos.
- La miniatura se hacía al pedirla, síncrona, en el bucle.
- El cuerpo entero se leía antes de mirar el tope de 3 MB.
- Sin cuota ni idempotencia: un reintento duplicaba la foto.
"""
import base64
import io
import os
import tempfile

os.environ.setdefault("ADMIN_PASS", "pytest_admin_password")
os.environ.setdefault("SAGA_DATA_DIR", tempfile.mkdtemp(prefix="saga-test-fotos-"))

import pytest  # noqa: E402
from fastapi.testclient import TestClient  # noqa: E402
from PIL import Image  # noqa: E402

import main  # noqa: E402
from backend.app.routers import field_proofs as fotos  # noqa: E402
from ruta_de_proba import preparar_mision  # noqa: E402

USUARIO = "PLAYER 1"


def _jpeg(color=(200, 30, 30), lado=64):
    salida = io.BytesIO()
    Image.new("RGB", (lado, lado), color).save(salida, "JPEG")
    return salida.getvalue()


def _uri(datos, tipo="image/jpeg"):
    return "data:%s;base64,%s" % (tipo, base64.b64encode(datos).decode("ascii"))


@pytest.fixture
def cliente(monkeypatch, tmp_path):
    preparar_mision(monkeypatch, tmp_path)
    monkeypatch.setattr(main, "DATA_DIR", str(tmp_path))
    cliente = TestClient(main.app)
    assert cliente.get("/api/game/PLAYER%201").status_code == 200
    return cliente


def _subir(cliente, datos=None, **extra):
    cuerpo = {"user": USUARIO, "lat": 40.5, "lon": -3.5, "stage_id": "101", "image_data_url": _uri(datos or _jpeg())}
    cuerpo.update(extra)
    return cliente.post("/api/field-proofs", json=cuerpo)


def test_el_tope_de_pixeles_de_pillow_esta_fijado():
    assert Image.MAX_IMAGE_PIXELS == fotos.MAX_PIXELES_DE_FOTO == 40_000_000


def test_una_foto_que_declara_demasiados_pixeles_se_rechaza_sin_decodificarla(cliente):
    # Un PNG de 1 bit de 7 000 x 7 000 (49 Mpx) pesa muy poco y declara mucho.
    salida = io.BytesIO()
    Image.new("1", (7000, 7000)).save(salida, "PNG")
    assert len(salida.getvalue()) < fotos.FIELD_PROOF_MAX_IMAGE_BYTES

    resposta = _subir(cliente, salida.getvalue(), image_data_url=_uri(salida.getvalue(), "image/png"))

    assert resposta.status_code == 400
    assert "pixels" in resposta.json()["detail"]


def test_la_miniatura_ya_esta_hecha_al_subir(cliente, tmp_path):
    resposta = _subir(cliente)

    assert resposta.status_code == 200, resposta.text
    proof = resposta.json()["proof"]
    fila = fotos.get_field_proof_record(proof["id"])
    assert fila["id"] == proof["id"]
    miniaturas = list((tmp_path / "proofs" / "thumbs").glob("*.jpg"))
    assert len(miniaturas) == 1, "la miniatura se genera en la subida, no al pedirla"
    with Image.open(miniaturas[0]) as imagen:
        assert max(imagen.size) <= fotos.LADO_MINIATURA_PX


def test_el_tope_de_bytes_se_aplica_antes_de_leer_el_cuerpo_entero(cliente):
    enorme = b"x" * (fotos.FIELD_PROOF_MAX_BODY_BYTES + 1000)

    resposta = cliente.post(
        "/api/field-proofs", content=enorme, headers={"content-type": "application/json"}
    )

    assert resposta.status_code == 413


def test_un_reintento_con_el_mismo_client_id_no_duplica_la_foto(cliente):
    primera = _subir(cliente, client_id="movil-abc-1")
    segunda = _subir(cliente, client_id="movil-abc-1")

    assert primera.status_code == 200 and segunda.status_code == 200
    assert segunda.json()["duplicate"] is True
    assert segunda.json()["proof"]["id"] == primera.json()["proof"]["id"]
    assert len(fotos.list_field_proof_records()) == 1


def test_un_reintento_sin_client_id_se_reconoce_por_el_contenido(cliente, tmp_path):
    datos = _jpeg((10, 200, 10))
    primera = _subir(cliente, datos)
    segunda = _subir(cliente, datos)

    assert segunda.json()["proof"]["id"] == primera.json()["proof"]["id"]
    originales = [p for p in (tmp_path / "proofs").rglob("proof_*.jpg") if "thumbs" not in p.parts]
    assert len(originales) == 1, "ni un segundo fichero"

    otra = _subir(cliente, _jpeg((10, 10, 200)))  # otra foto distinta sí cuenta
    assert otra.json()["proof"]["id"] != primera.json()["proof"]["id"]
    assert len(fotos.list_field_proof_records()) == 2


def test_una_foto_borrada_se_puede_volver_a_subir(cliente):
    datos = _jpeg((90, 90, 10))
    primera = _subir(cliente, datos).json()["proof"]
    assert cliente.delete("/api/field-proofs/%s" % primera["id"], params={"user": USUARIO}).status_code == 200

    otra = _subir(cliente, datos)

    assert otra.status_code == 200 and "duplicate" not in otra.json()
    assert otra.json()["proof"]["id"] != primera["id"]


def test_hay_una_cuota_de_fotos_por_jugador(cliente, monkeypatch):
    monkeypatch.setattr(fotos, "FIELD_PROOF_MAX_PER_PLAYER", 2)

    codigos = [_subir(cliente, _jpeg((i * 40, 5, 5))).status_code for i in range(4)]

    assert codigos == [200, 200, 429, 429]


def test_las_bases_antiguas_ganan_las_columnas_nuevas(tmp_path, monkeypatch):
    import sqlite3

    ruta = tmp_path / "vieja.sqlite3"
    conn = sqlite3.connect(str(ruta))
    conn.execute(
        """
        CREATE TABLE field_proofs (
            id TEXT PRIMARY KEY, user TEXT NOT NULL, display_name TEXT NOT NULL DEFAULT '',
            stage_id TEXT NOT NULL DEFAULT '', stage_title TEXT NOT NULL DEFAULT '',
            lat REAL NOT NULL, lon REAL NOT NULL, note TEXT NOT NULL DEFAULT '',
            image_filename TEXT NOT NULL, media_type TEXT NOT NULL, created_at INTEGER NOT NULL,
            visibility TEXT NOT NULL DEFAULT 'team', status TEXT NOT NULL DEFAULT 'active'
        )
        """
    )
    conn.commit()
    conn.close()
    monkeypatch.setenv("SAGA_SQLITE_DB", str(ruta))

    fotos.init_field_proof_schema()

    conn = fotos.connect_runtime_sqlite()
    try:
        columnas = {fila[1] for fila in conn.execute("PRAGMA table_info(field_proofs)").fetchall()}
    finally:
        conn.close()
    assert {"content_sha256", "client_id"} <= columnas
