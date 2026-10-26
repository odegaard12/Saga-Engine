# -*- coding: utf-8 -*-
"""26/10: la foto de campo en dos pasos.

Primero sube la LIGERA (binaria, sin base64) y con buena red la ORIGINAL de máxima calidad, que la sustituye en el
mismo sitio. La descarga y la vista dan siempre lo mejor que haya; los móviles viejos (JSON/base64) siguen igual.
"""
import io
import os
import tempfile

os.environ.setdefault("ADMIN_PASS", "pytest_admin_password")
os.environ.setdefault("SAGA_DATA_DIR", tempfile.mkdtemp(prefix="saga-test-dospasos-"))

import pytest  # noqa: E402
from fastapi.testclient import TestClient  # noqa: E402
from PIL import Image  # noqa: E402

import main  # noqa: E402
from backend.app.routers import field_proofs as fotos  # noqa: E402
from ruta_de_proba import preparar_mision  # noqa: E402

USUARIO = "PLAYER 1"
CABECERA = {"content-type": "image/jpeg"}


def _jpeg(ancho, alto, color=(200, 30, 30), calidad=80):
    salida = io.BytesIO()
    Image.new("RGB", (ancho, alto), color).save(salida, "JPEG", quality=calidad)
    return salida.getvalue()


@pytest.fixture
def cliente(monkeypatch, tmp_path):
    preparar_mision(monkeypatch, tmp_path)
    monkeypatch.setattr(main, "DATA_DIR", str(tmp_path))
    cliente = TestClient(main.app)
    assert cliente.get("/api/game/PLAYER%201").status_code == 200
    return cliente


def _ligera(cliente, datos=None, id_cliente="movil-1", **extra):
    params = {"user": USUARIO, "lat": 40.5, "lon": -3.5, "stage_id": "101", "client_proof_id": id_cliente,
              "calidad": "ligera", "note": "árbol"}
    params.update(extra)
    return cliente.post("/api/field-proofs", params=params, content=datos or _jpeg(320, 240), headers=CABECERA)


def _original(cliente, datos=None, id_cliente="movil-1", usuario=USUARIO):
    return cliente.post(
        "/api/field-proofs/original",
        params={"user": usuario, "client_proof_id": id_cliente},
        content=datos or _jpeg(1280, 960, calidad=95),
        headers=CABECERA,
    )


def test_la_ligera_binaria_se_guarda_marcada_sin_original(cliente, tmp_path):
    r = _ligera(cliente)
    assert r.status_code == 200, r.text
    foto = r.json()["proof"]
    assert foto["es_original"] is False
    assert foto["note"] == "árbol", "los datos viajan en la query, con acentos"
    assert "?v=" in foto["image_url"]
    assert len(list((tmp_path / "proofs" / "thumbs").glob("*.jpg"))) == 1


def test_un_reintento_de_la_ligera_no_duplica(cliente):
    a = _ligera(cliente).json()["proof"]
    b = _ligera(cliente)
    assert b.json()["duplicate"] is True and b.json()["proof"]["id"] == a["id"]
    assert len(fotos.list_field_proof_records()) == 1


def test_la_original_sustituye_a_la_ligera_y_la_url_cambia(cliente, tmp_path):
    ligera = _ligera(cliente, _jpeg(320, 240)).json()["proof"]
    original = _jpeg(1280, 960, calidad=95)

    r = _original(cliente, original)
    assert r.status_code == 200, r.text
    foto = r.json()["proof"]
    assert r.json()["already"] is False
    assert foto["id"] == ligera["id"] and foto["es_original"] is True
    assert foto["image_url"] != ligera["image_url"], "si no, el móvil sigue enseñando la ligera guardada"

    # Lo que se sirve y lo que va en el zip es la ORIGINAL, y en disco sigue habiendo UN solo fichero por foto.
    assert cliente.get(foto["image_url"]).content == original
    ficheros = [p for p in (tmp_path / "proofs").rglob("proof_*") if "thumbs" not in p.parts]
    assert len(ficheros) == 1
    zip_ = cliente.get("/api/field-proofs/download", params={"user": USUARIO})
    import zipfile

    with zipfile.ZipFile(io.BytesIO(zip_.content)) as z:
        fotos_del_zip = [z.read(n) for n in z.namelist() if n.startswith("photos/")]
    assert fotos_del_zip == [original], "la descarga entrega la original"


def test_la_original_es_idempotente(cliente):
    _ligera(cliente)
    original = _jpeg(1280, 960, calidad=95)
    primera = _original(cliente, original)
    otra = _original(cliente, _jpeg(1280, 960, (1, 2, 3)))
    assert otra.status_code == 200 and otra.json()["already"] is True
    assert cliente.get(primera.json()["proof"]["image_url"]).content == original, "la segunda no la machaca"


def test_una_original_que_no_es_la_misma_foto_se_rechaza(cliente):
    _ligera(cliente, _jpeg(320, 240))
    assert _original(cliente, _jpeg(200, 150)).status_code == 400, "más pequeña que la ligera"
    assert _original(cliente, _jpeg(900, 900)).status_code == 400, "otra forma"
    assert fotos.list_field_proof_records()[0]["es_original"] is False


def test_la_original_necesita_su_ligera_su_sesion_y_su_dueno(cliente):
    assert _original(cliente).status_code == 404, "sin ligera subida"
    _ligera(cliente)
    assert _original(cliente, id_cliente="otro-id").status_code == 404
    assert _original(cliente, usuario="OTRO NOMBRE").status_code in (401, 403)
    sin_sesion = TestClient(main.app).post(
        "/api/field-proofs/original",
        params={"user": USUARIO, "client_proof_id": "movil-1"},
        content=_jpeg(1280, 960),
        headers=CABECERA,
    )
    assert sin_sesion.status_code in (401, 403)


def test_el_cuerpo_binario_tiene_que_ser_una_imagen_de_verdad(cliente):
    falso = b"<svg xmlns='http://www.w3.org/2000/svg'><script>alert(1)</script></svg>"
    assert _ligera(cliente, falso).status_code == 400
    _ligera(cliente)
    assert _original(cliente, falso).status_code == 400
    enorme = b"\xff\xd8\xff" + b"x" * (fotos.FIELD_PROOF_MAX_IMAGE_BYTES + 10)
    assert _original(cliente, enorme).status_code == 413


def test_una_foto_borrada_no_resucita_con_la_original(cliente):
    foto = _ligera(cliente).json()["proof"]
    assert cliente.delete("/api/field-proofs/%s" % foto["id"], params={"user": USUARIO}).status_code == 200
    assert _original(cliente).status_code == 410


def test_el_movil_viejo_sigue_subiendo_json_y_cuenta_como_original(cliente):
    import base64

    datos = _jpeg(320, 240, (5, 90, 5))
    uri = "data:image/jpeg;base64," + base64.b64encode(datos).decode()
    r = cliente.post("/api/field-proofs", json={"user": USUARIO, "lat": 40.5, "lon": -3.5, "image_data_url": uri})
    assert r.status_code == 200 and r.json()["proof"]["es_original"] is True


def test_las_bases_viejas_ganan_la_columna_es_original(tmp_path, monkeypatch):
    import sqlite3

    ruta = tmp_path / "vieja.sqlite3"
    conn = sqlite3.connect(str(ruta))
    conn.execute(
        "CREATE TABLE field_proofs (id TEXT PRIMARY KEY, user TEXT NOT NULL, display_name TEXT NOT NULL DEFAULT '',"
        " stage_id TEXT NOT NULL DEFAULT '', stage_title TEXT NOT NULL DEFAULT '', lat REAL NOT NULL, lon REAL NOT NULL,"
        " note TEXT NOT NULL DEFAULT '', image_filename TEXT NOT NULL, media_type TEXT NOT NULL, created_at INTEGER NOT NULL,"
        " visibility TEXT NOT NULL DEFAULT 'team', status TEXT NOT NULL DEFAULT 'active')"
    )
    conn.execute(
        "INSERT INTO field_proofs (id, user, lat, lon, image_filename, media_type, created_at) VALUES ('p1','u',1,1,'a.jpg','image/jpeg',1)"
    )
    conn.commit()
    conn.close()
    monkeypatch.setattr(fotos, "resolve_runtime_sqlite_path", lambda: str(ruta))
    from backend.app.storage import schema_cache

    schema_cache.olvidar_todo() if hasattr(schema_cache, "olvidar_todo") else None
    fotos.init_field_proof_schema()
    conn = sqlite3.connect(str(ruta))
    assert conn.execute("SELECT es_original FROM field_proofs WHERE id='p1'").fetchone()[0] == 1, "las viejas ya son la mejor"
    conn.close()


# ---------------------------------------------------------------------------------------------- el cliente

def _front(*partes):
    from pathlib import Path

    return (Path(__file__).resolve().parent.parent / "frontend" / Path(*partes)).read_text(encoding="utf-8")


@pytest.fixture(scope="module")
def js():
    import json
    import shutil
    import subprocess
    from pathlib import Path

    raiz = Path(__file__).resolve().parent.parent
    node = shutil.which("node")
    if not node or not (raiz / "frontend" / "node_modules" / "typescript").exists():
        pytest.skip("sin Node o sin frontend/node_modules")
    res = subprocess.run(
        [node, str(raiz / "tests" / "js" / "foto_en_dos_pasos.cjs")],
        capture_output=True, text=True, encoding="utf-8", timeout=120, cwd=str(raiz),
    )
    assert res.returncode == 0, res.stderr[-3000:]
    return json.loads(res.stdout)


def test_el_tiempo_de_subida_es_proporcional_al_peso_con_minimo_y_maximo(js):
    # 10 KB -> el mínimo de siempre (45 s); 200 KB a 20 kbit/s -> 80 s; nunca más de 3 min.
    assert js["tiempos"] == [45_000, 80_000, 100_000, 180_000]


def test_los_reintentos_de_la_original_esperan_cada_vez_mas(js):
    assert js["esperas"] == [60_000, 120_000, 480_000, 1_800_000]


def test_el_data_url_pasa_a_binario_sin_fetch_y_lo_raro_se_descarta(js):
    assert js["blob"] == 3 and js["blobTipo"] == "image/jpeg"
    assert js["blobMalo"] == [None, None, None]


def test_la_subida_binaria_lleva_los_datos_en_la_query_y_necesita_id_de_cliente(js):
    assert js["sinId"] is None, "sin client_proof_id no hay idempotencia: va por el camino de siempre"
    b = js["binaria"]
    assert b["url"].startswith("/api/field-proofs?user=PLAYER+1&lat=40.5&lon=-3.5&note=%C3%A1rbol+y+roca")
    assert "client_proof_id=photo_1" in b["url"]
    assert b["ligera"] is False and "calidad=ligera" not in b["url"], "si no hay ligera que hacer, va la original tal cual"


def test_las_originales_sólo_suben_con_red_buena(js):
    assert js["red"] == {"sinApi": True, "cuatroG": True, "tresG": False, "dosG": False, "ahorro": False, "lenta": False}


def test_el_cableado_del_cliente():
    api = _front("src", "shared", "api.ts")
    assert "uploadFieldProofEnDosPasos(args)" in api and "binaria.blob" in api
    assert "body instanceof Blob" in api, "postJson manda el Blob tal cual, con su tipo"

    cola = _front("src", "player", "offline", "localFirst.ts")
    # La original se apunta ANTES de que la cola borre la foto (si no, un corte ahí la perdería).
    assert cola.index("guardarOriginalPendiente(photo.user, photo.id") < cola.index("const decision = decidirTrasSubida(estado")
    assert "subirOriginalesPendientes(user, fetchImpl)" in cola

    dos = _front("src", "player", "offline", "fotoEnDosPasos.ts")
    assert "redBuenaParaOriginales()" in dos and "contarPendientes(user)" in dos, "buena red y sin avances pendientes"
    assert "/api/field-proofs/original?user=" in dos and "saga:foto-subida" in dos

    sw = _front("public", "sw.js")
    i = sw.index("if (esFotoDeCampo(url.pathname))")
    assert "buscar: { ignoreMethod: true, ignoreVary: true }" in sw[i : i + 700], "la foto se busca CON su ?v="

    cache = _front("src", "player", "offline", "fieldProofCache.ts")
    assert "imagenVigente" in cache, "la copia de la versión ligera se quita cuando la lista trae la URL nueva"

    camara = _front("src", "player", "utils", "calidadDeFoto.ts")
    assert "LADO_FOTO_PX = 2048" in camara and "LADO_LIGERA_PX = 1280" in camara and "CALIDAD_LIGERA = 0.7" in camara
