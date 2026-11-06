# -*- coding: utf-8 -*-
"""Los paquetes de Vite con huella (`index-j6z62B1u.js`) salen inmutables (6/11).

La regla de caché de Cloudflare respetaba el Cache-Control del origen y, sin él, se saltaba la caché (BYPASS): cada
móvil bajaba los paquetes de la app de la Pi. Con la huella en el nombre nunca cambian, así que van inmutables.
"""
import os
import tempfile

os.environ.setdefault("ADMIN_PASS", "pytest_admin_password")
os.environ.setdefault("SAGA_DATA_DIR", tempfile.mkdtemp(prefix="saga-test-paquetes-"))

import main  # noqa: E402
from fastapi import FastAPI  # noqa: E402
from fastapi.testclient import TestClient  # noqa: E402


def test_el_patron_solo_casa_paquetes_con_huella():
    assert main._PAQUETE_CON_HUELLA.search("index-j6z62B1u.js")
    assert main._PAQUETE_CON_HUELLA.search("logica-AbC_d-12.css")
    assert not main._PAQUETE_CON_HUELLA.search("index.js")
    assert not main._PAQUETE_CON_HUELLA.search("avatares/chico.glb")
    assert not main._PAQUETE_CON_HUELLA.search("index-j6z62B1u.js.map")


def test_un_paquete_con_huella_sale_inmutable(tmp_path):
    (tmp_path / "index-j6z62B1u.js").write_text("console.log(1)", encoding="utf-8")
    (tmp_path / "suelto.js").write_text("console.log(2)", encoding="utf-8")
    app = FastAPI()
    app.mount("/assets", main._ActivosDeLaApp(directory=str(tmp_path)), name="a")
    cliente = TestClient(app)
    r = cliente.get("/assets/index-j6z62B1u.js")
    assert r.status_code == 200
    assert r.headers["cache-control"] == "public, max-age=31536000, immutable"
    assert "cache-control" not in cliente.get("/assets/suelto.js").headers
