# -*- coding: utf-8 -*-
"""Revisión del motor del 05/10/2026: lo que se arregló en el servidor y en el build.

- F6: el zip de fotos se escribe en un fichero temporal (no en memoria) y se borra
  después de enviarlo.
- F7: borrar una foto borra también dónde se hizo y su nota.
- T3: `clear_live_position` borra la fila de ese jugador, sin reescribir la tabla.
- M5: el proxy de teselas reutiliza un cliente HTTP y la red de caminos se manda
  desde el disco.
- Mosaico: la respuesta de la pregunta final viaja con hash, nunca en claro.
- `validate_minigame_config` ya no es un cascarón vacío.
- El radio de un nodo GPS tiene tope en el servidor.
- El registro deja ajustar el reto de sonido desde el panel.
- El build: `player-precache.json` no apunta a ficheros que no existen, y el
  service worker no guarda el zip de fotos.
"""
import base64
import hashlib
import io
import json
import os
import re
import tempfile
from pathlib import Path

os.environ.setdefault("ADMIN_PASS", "pytest_admin_password")
os.environ.setdefault("SAGA_DATA_DIR", tempfile.mkdtemp(prefix="saga-test-revision-motor-"))

import pytest  # noqa: E402
from fastapi.testclient import TestClient  # noqa: E402
from PIL import Image  # noqa: E402

import main  # noqa: E402
from backend.app.routers import field_proofs as fotos  # noqa: E402
from backend.app.routers import public  # noqa: E402
from backend.app.runtime import core_engine, live_positions, minigames, teselas  # noqa: E402
from backend.app.runtime.mision import project_stage_for_player  # noqa: E402
from ruta_de_proba import preparar_mision  # noqa: E402

RAIZ = Path(__file__).resolve().parent.parent
FRONT = RAIZ / "frontend"
USUARIO = "PLAYER 1"


def _jpeg():
    salida = io.BytesIO()
    Image.new("RGB", (32, 32), (10, 120, 200)).save(salida, "JPEG")
    return "data:image/jpeg;base64," + base64.b64encode(salida.getvalue()).decode("ascii")


@pytest.fixture
def cliente(monkeypatch, tmp_path):
    preparar_mision(monkeypatch, tmp_path)
    monkeypatch.setattr(main, "DATA_DIR", str(tmp_path))
    c = TestClient(main.app)
    assert c.get("/api/game/PLAYER%201").status_code == 200
    return c


def _subir(cliente, **extra):
    cuerpo = {"user": USUARIO, "lat": 40.51, "lon": -3.52, "stage_id": "101",
              "note": "junto al hórreo", "image_data_url": _jpeg()}
    cuerpo.update(extra)
    r = cliente.post("/api/field-proofs", json=cuerpo)
    assert r.status_code == 200, r.text
    return r.json()["proof"]


# ------------------------------------------------------------------ F7

def test_borrar_una_foto_borra_donde_se_hizo_y_su_nota(cliente):
    foto = _subir(cliente)
    assert cliente.delete("/api/field-proofs/%s" % foto["id"], params={"user": USUARIO}).status_code == 200

    conn = fotos.connect_runtime_sqlite()
    try:
        fila = conn.execute("SELECT status, lat, lon, note FROM field_proofs WHERE id = ?", (foto["id"],)).fetchone()
    finally:
        conn.close()
    assert fila["status"] == "deleted"
    assert (fila["lat"], fila["lon"], fila["note"]) == (0, 0, "")


def test_la_misma_foto_borrada_no_resucita_al_reintentar(cliente):
    foto = _subir(cliente, client_id="cola-1")
    cliente.delete("/api/field-proofs/%s" % foto["id"], params={"user": USUARIO})
    otra = _subir(cliente, client_id="cola-1")
    assert otra["id"] == foto["id"]
    assert fotos.count_active_proofs(foto["user"]) == 0


def test_el_borrado_no_es_async_con_e_s_bloqueante():
    codigo = (RAIZ / "backend" / "app" / "routers" / "field_proofs.py").read_text(encoding="utf-8")
    assert "async def delete_field_proof" not in codigo
    assert "def delete_field_proof" in codigo


# ------------------------------------------------------------------ F6

def test_el_zip_se_hace_en_disco_y_se_borra_al_enviarlo(cliente, monkeypatch):
    _subir(cliente)
    creados = []
    original = fotos.tempfile.NamedTemporaryFile

    def espia(*args, **kwargs):
        f = original(*args, **kwargs)
        creados.append(f.name)
        return f

    monkeypatch.setattr(fotos.tempfile, "NamedTemporaryFile", espia)
    r = cliente.get("/api/field-proofs/download")
    assert r.status_code == 200
    assert r.headers["content-type"] == "application/zip"
    assert "attachment" in r.headers.get("content-disposition", "")
    import zipfile

    with zipfile.ZipFile(io.BytesIO(r.content)) as z:
        nombres = z.namelist()
    assert "manifest.json" in nombres and any(n.startswith("photos/") for n in nombres)
    assert creados and not any(os.path.exists(n) for n in creados), "el temporal se queda en disco"
    codigo = (RAIZ / "backend" / "app" / "routers" / "field_proofs.py").read_text(encoding="utf-8")
    assert "io.BytesIO()" not in codigo.split("def download_field_proofs", 1)[1].split("\n@router", 1)[0]


def test_sin_fotos_el_zip_da_404_y_no_deja_temporal(cliente, monkeypatch):
    creados = []
    original = fotos.tempfile.NamedTemporaryFile

    def espia(*args, **kwargs):
        f = original(*args, **kwargs)
        creados.append(f.name)
        return f

    monkeypatch.setattr(fotos.tempfile, "NamedTemporaryFile", espia)
    assert cliente.get("/api/field-proofs/download").status_code == 404
    assert not any(os.path.exists(n) for n in creados)


# ------------------------------------------------------------------ T3

def test_clear_live_position_borra_solo_esa_fila(monkeypatch):
    llamadas = []
    monkeypatch.setattr(live_positions, "remove_live_position", lambda db, user: llamadas.append((db, user)))
    monkeypatch.setattr(
        live_positions, "save_live_positions",
        lambda *a, **k: pytest.fail("no se reescribe la tabla entera"),
    )
    live_positions.clear_live_position("posiciones.json", "  PLAYER 1 ")
    assert llamadas == [("posiciones.json", "PLAYER 1")]
    live_positions.clear_live_position("posiciones.json", "  ")
    assert len(llamadas) == 1


# ------------------------------------------------------------------ M5

class _Respuesta:
    status_code = 200
    headers = {"Content-Type": "image/jpeg"}
    content = b"tesela"


class _ClienteContado:
    creados = 0

    def __init__(self, *a, **k):
        _ClienteContado.creados += 1
        self.is_closed = False

    async def get(self, *a, **k):
        return _Respuesta()


def test_el_proxy_reutiliza_un_cliente_para_todas_las_teselas(monkeypatch, tmp_path):
    caja = (40.4, 40.6, -3.6, -3.4)
    monkeypatch.setattr(main, "DATA_DIR", str(tmp_path))
    monkeypatch.setattr(main, "_HTTPX_AVAILABLE", True)
    monkeypatch.setattr(main._httpx, "AsyncClient", _ClienteContado)
    monkeypatch.setattr(teselas, "caja_de_la_mision", lambda: caja)
    monkeypatch.setattr(public, "_cliente_teselas", {"bucle": None, "cliente": None})
    _ClienteContado.creados = 0
    x, y = teselas.tesela_de(40.5, -3.5, 16)
    with TestClient(main.app) as c:
        for dx in range(3):
            assert c.get(f"/map-tiles/16/{x + dx}/{y}.png").status_code == 200
    assert _ClienteContado.creados == 1


def test_la_red_de_caminos_sale_del_disco_sin_leerla_entera():
    codigo = (RAIZ / "backend" / "app" / "routers" / "public.py").read_text(encoding="utf-8")
    cuerpo = codigo.split("async def road_graph_publico", 1)[1]
    assert "fichero.read_bytes()" not in cuerpo
    assert "FileResponse(" in cuerpo
    assert "_teselas.leer_de_cache(" not in codigo.replace("run_in_threadpool(_teselas.leer_de_cache", "")


# ------------------------------------------------------------------ Mosaico

def _mosaico(indice=2):
    cfg = {
        "game_id": "place_mosaic", "image_data_url": _jpeg(), "require_final_question": True,
        "final_question": "¿Qué había?", "final_choices": ["a", "b", "c"], "final_correct_index": indice,
    }
    return {
        "id": 9, "title": "Final", "lat": 40.5, "lon": -3.5, "radius": 40, "type": "minigame",
        "config": dict(cfg), "minigame": {"type": "place_mosaic", "config": dict(cfg)}, "success": {"code": "OK"},
    }


def test_el_mosaico_no_manda_la_respuesta_en_claro():
    salida = project_stage_for_player(_mosaico(2), include_runtime=True)
    for cfg in (salida["config"], salida["minigame"]["config"]):
        assert "final_correct_index" not in cfg
        sal = cfg["final_answer_salt"]
        assert cfg["final_answer_hash"] == hashlib.sha256(f"{sal}:2".encode()).hexdigest()
        assert cfg["final_answer_hash"] != hashlib.sha256(f"{sal}:0".encode()).hexdigest()


def test_validate_minigame_config_detecta_un_mosaico_sin_solucion():
    malo = _mosaico(5)["minigame"]["config"]
    errores = minigames.validate_minigame_config("place_mosaic", malo)
    assert any(campo == "config.final_correct_index" for campo, _ in errores)
    assert minigames.validate_minigame_config("place_mosaic", _mosaico(1)["minigame"]["config"]) == []
    pocas = {**malo, "final_choices": ["solo una"], "final_correct_index": 0}
    assert any(c == "config.final_choices" for c, _ in minigames.validate_minigame_config("place_mosaic", pocas))
    sin_pregunta = {**malo, "require_final_question": False}
    assert minigames.validate_minigame_config("place_mosaic", sin_pregunta) == []


# ------------------------------------------------------------------ Radio

def test_el_radio_de_un_nodo_gps_tiene_tope():
    base = {"id": 1, "title": "N", "lat": 40.5, "lon": -3.5, "type": "checkpoint", "success": {"code": "OK"}}
    assert not [e for e in core_engine.validate_stage({**base, "radius": 40}) if e.get("field") == "radius"]
    errores = core_engine.validate_stage({**base, "radius": 50_000})
    assert any(e.get("field") == "radius" for e in errores), errores
    admin = (FRONT / "src" / "admin" / "components" / "AdminGameEditor.tsx").read_text(encoding="utf-8")
    assert "RADIO_MAXIMO_M = %d" % core_engine.RADIO_MAXIMO_M in admin


# ------------------------------------------------------------------ Registro

def test_el_reto_de_sonido_se_puede_ajustar_en_el_panel():
    registro = json.loads((RAIZ / "shared" / "game_registry.json").read_text(encoding="utf-8"))
    juegos = registro["games"] if "games" in registro else [
        j for fam in registro.get("families", []) for j in fam.get("games", [])
    ]
    audio = [j for j in juegos if j.get("id") == "audio_challenge"]
    assert audio and set(audio[0].get("extra_guided_keys", [])) == {"volume_threshold", "sustain_ms"}


# ------------------------------------------------------------------ Build y service worker

def test_la_lista_de_paquetes_se_escribe_despues_de_limpiar_los_trozos_de_css():
    vite = (FRONT / "vite.config.ts").read_text(encoding="utf-8")
    assert "generateBundle: { order: 'post'" in vite


@pytest.mark.skipif(not (FRONT / "dist" / "player-precache.json").exists(), reason="sin build")
def test_cada_fichero_de_la_lista_existe_en_el_build():
    dist = FRONT / "dist"
    lista = json.loads((dist / "player-precache.json").read_text(encoding="utf-8"))["files"]
    faltan = [f for f in lista if not f.startswith("/assets/avatares/") and not (dist / f.lstrip("/")).exists()]
    assert not faltan, "la pantalla de carga diría «Faltan %d archivos» para siempre: %s" % (len(faltan), faltan)


def test_el_service_worker_no_guarda_el_zip_de_fotos():
    sw = (FRONT / "public" / "sw.js").read_text(encoding="utf-8")
    patron = re.search(r"function esFotoDeCampo\(ruta\) \{\s*return (/.+/)\.test\(ruta\)", sw)
    assert patron, "falta el filtro de fotos de campo"
    regex = re.compile(patron.group(1)[1:-1].replace("\\/", "/"))
    assert regex.match("/api/field-proofs/abc/thumb")
    assert regex.match("/api/field-proofs/abc/image")
    assert not regex.match("/api/field-proofs/download")
    assert "url.pathname.startsWith('/api/field-proofs/')" not in sw
