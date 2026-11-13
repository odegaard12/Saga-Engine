# -*- coding: utf-8 -*-
"""14/11: los modelos .glb se sirven comprimidos con gzip, comprimidos UNA vez por modelo (copia en memoria).

Medido en los 21 modelos reales: 12,7 MB -> 8,4 MB (-33 %), 0,68 s de CPU en total y una sola vez. El middleware global no
los toca (gastaría CPU de la Pi en cada petición); aquí se comprime al primer pedido y las demás peticiones sirven la copia.
"""
import gzip
import os
import tempfile

os.environ.setdefault("ADMIN_PASS", "pytest_admin_password")
os.environ.setdefault("SAGA_DATA_DIR", tempfile.mkdtemp(prefix="saga-test-glbgz-"))

from fastapi import FastAPI  # noqa: E402
from fastapi.testclient import TestClient  # noqa: E402

from backend.app.routers import assets as assets_router  # noqa: E402

COMPRIMIBLE = b"glTF" + (b"vertices-normales-uvs-" * 6000)  # ~130 KB que gzip encoge mucho
INCOMPRIMIBLE = os.urandom(50_000)


def _cliente(monkeypatch, carpeta):
    monkeypatch.setenv("SAGA_AVATAR_DIR", str(carpeta))
    monkeypatch.setattr(assets_router, "_GLB_COMPRIMIDOS", {})
    app = FastAPI()
    app.include_router(assets_router.router)
    return TestClient(app)


def test_un_modelo_se_sirve_comprimido_y_es_el_mismo_al_descomprimir(monkeypatch, tmp_path):
    (tmp_path / "Ch01.0123abcd.glb").write_bytes(COMPRIMIBLE)
    c = _cliente(monkeypatch, tmp_path)
    r = c.get("/assets/avatares/Ch01.0123abcd.glb", headers={"Accept-Encoding": "gzip"})
    assert r.status_code == 200
    assert r.headers["content-encoding"] == "gzip" and r.headers["vary"] == "Accept-Encoding"
    assert r.headers["content-type"] == "model/gltf-binary" and "immutable" in r.headers["cache-control"]
    assert r.content == COMPRIMIBLE, "el cliente lo descomprime y sale idéntico"
    assert int(r.headers["content-length"]) < len(COMPRIMIBLE) * 0.5, "lo que viaja es la copia comprimida"


def test_se_comprime_una_sola_vez_y_el_etag_da_304(monkeypatch, tmp_path):
    (tmp_path / "Ch01.0123abcd.glb").write_bytes(COMPRIMIBLE)
    c = _cliente(monkeypatch, tmp_path)
    llamadas = []
    original = assets_router._comprimir
    monkeypatch.setattr(assets_router, "_comprimir", lambda f: (llamadas.append(f), original(f))[1])
    cab = {"Accept-Encoding": "gzip"}
    r1 = c.get("/assets/avatares/Ch01.0123abcd.glb", headers=cab)
    r2 = c.get("/assets/avatares/Ch01.0123abcd.glb", headers=cab)
    r3 = c.head("/assets/avatares/Ch01.0123abcd.glb", headers=cab)
    assert len(llamadas) == 1, "las peticiones siguientes no gastan CPU"
    assert r2.content == r1.content == COMPRIMIBLE and r3.status_code == 200
    etag = r1.headers["etag"]
    assert etag and r2.headers["etag"] == etag
    r304 = c.get("/assets/avatares/Ch01.0123abcd.glb", headers={**cab, "If-None-Match": etag})
    assert r304.status_code == 304 and len(llamadas) == 1


def test_sin_gzip_con_rango_o_si_no_compensa_se_sirve_el_original(monkeypatch, tmp_path):
    (tmp_path / "Ch01.0123abcd.glb").write_bytes(COMPRIMIBLE)
    (tmp_path / "Ch02.0123abcd.glb").write_bytes(INCOMPRIMIBLE)
    (tmp_path / "cara-Ch01.0123abcd.webp").write_bytes(b"RIFF" + COMPRIMIBLE)
    c = _cliente(monkeypatch, tmp_path)
    # Sin Accept-Encoding: gzip, o con q=0 -> original
    for valor in ("identity", "gzip;q=0", ""):
        r = c.get("/assets/avatares/Ch01.0123abcd.glb", headers={"Accept-Encoding": valor})
        assert r.status_code == 200 and "content-encoding" not in r.headers and r.content == COMPRIMIBLE, valor
    # Con rango (reanudar) -> original, sin romper el rango
    r = c.get("/assets/avatares/Ch01.0123abcd.glb", headers={"Accept-Encoding": "gzip", "Range": "bytes=0-9"})
    assert "content-encoding" not in r.headers and r.content == COMPRIMIBLE[:10]
    # Si gzip no ahorra un 5 %, se sirve tal cual (y no se vuelve a intentar)
    r = c.get("/assets/avatares/Ch02.0123abcd.glb", headers={"Accept-Encoding": "gzip"})
    assert "content-encoding" not in r.headers and r.content == INCOMPRIMIBLE
    # Los retratos webp no se tocan (ya vienen comprimidos)
    r = c.get("/assets/avatares/cara-Ch01.0123abcd.webp", headers={"Accept-Encoding": "gzip"})
    assert "content-encoding" not in r.headers


def test_si_el_modelo_cambia_se_sirve_el_nuevo(monkeypatch, tmp_path):
    f = tmp_path / "Ch01.0123abcd.glb"
    f.write_bytes(COMPRIMIBLE)
    c = _cliente(monkeypatch, tmp_path)
    cab = {"Accept-Encoding": "gzip"}
    assert c.get("/assets/avatares/Ch01.0123abcd.glb", headers=cab).content == COMPRIMIBLE
    nuevo = b"glTF" + (b"otra-cosa-" * 9000)
    f.write_bytes(nuevo)
    os.utime(f, ns=(1_000_000_000, 2_000_000_000))
    assert c.get("/assets/avatares/Ch01.0123abcd.glb", headers=cab).content == nuevo


def test_el_cuerpo_comprimido_es_gzip_valido_y_el_acepta_gzip_lee_q(monkeypatch, tmp_path):
    (tmp_path / "Ch01.0123abcd.glb").write_bytes(COMPRIMIBLE)
    c = _cliente(monkeypatch, tmp_path)
    cuerpo, _ = __import__("asyncio").run(assets_router._glb_comprimido(tmp_path / "Ch01.0123abcd.glb", "Ch01.0123abcd.glb"))
    assert gzip.decompress(cuerpo) == COMPRIMIBLE
    for valor, esperado in (("gzip, deflate", True), ("br, gzip;q=0.5", True), ("gzip;q=0", False), ("*;q=0", False), ("identity", False), ("", False), ("deflate, *", True)):
        assert assets_router._acepta_gzip(valor) is esperado, valor
