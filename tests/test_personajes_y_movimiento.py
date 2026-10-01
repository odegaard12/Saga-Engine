# -*- coding: utf-8 -*-
"""Personajes del mapa, deslizamiento, celebración y ruta andada.

La lógica pura del móvil se ejecuta en Node (tests/js/personajes_y_movimiento.cjs);
el campo `character` del perfil, con TestClient. El defecto del personaje se calcula
en el servidor y en el móvil con la misma cuenta: los valores de aquí los fijan.
"""
import json
import os
import shutil
import subprocess
import tempfile
from pathlib import Path

os.environ.setdefault("ADMIN_PASS", "pytest_admin_password")
os.environ.setdefault("SAGA_DATA_DIR", tempfile.mkdtemp(prefix="saga-test-personajes-"))

import pytest  # noqa: E402
from fastapi import FastAPI  # noqa: E402
from fastapi.testclient import TestClient  # noqa: E402

import main  # noqa: E402
from backend.app.routers import game as game_router  # noqa: E402
from backend.app.runtime import personajes as pj  # noqa: E402

RAIZ = Path(__file__).resolve().parent.parent


@pytest.fixture(scope="module")
def js():
    node = shutil.which("node")
    if not node or not (RAIZ / "frontend" / "node_modules" / "typescript").exists():
        pytest.skip("sin node o sin frontend/node_modules")
    r = subprocess.run([node, str(RAIZ / "tests" / "js" / "personajes_y_movimiento.cjs")],
                       capture_output=True, text=True, timeout=60, encoding="utf-8")
    assert r.returncode == 0, r.stderr
    return json.loads(r.stdout)


def test_la_lista_y_el_defecto_son_los_mismos_en_servidor_y_movil(js):
    assert js["lista"] == list(pj.PERSONAJES)
    for jugador, esperado in js["defectos"]:
        assert pj.personaje_por_defecto(jugador) == esperado, jugador
    assert js["defectos"][1] == ["prueba1", "bruxa"]
    assert js["deDe"] == {"valido": "raposo", "invalido": "exploradora", "sin": "exploradora"}


def test_el_defecto_es_estable_y_siempre_valido():
    for i in range(200):
        p = pj.personaje_por_defecto(f"jugador-{i}")
        assert pj.es_personaje(p) and p == pj.personaje_por_defecto(f"jugador-{i}")


def test_un_fichero_manipulado_se_ignora(tmp_path):
    ruta = tmp_path / "p.json"
    ruta.write_text(json.dumps({"a": "raposo", "b": "<script>", "c": 7}), encoding="utf-8")
    assert pj.cargar_elegidos(str(ruta)) == {"a": "raposo"}
    with pytest.raises(ValueError):
        pj.guardar_elegido(str(ruta), "a", "dragon")


def test_con_personaje_marca_si_lo_eligio_el():
    ficha = {"id": "Ana"}
    sin = pj.con_personaje(ficha, {})
    assert sin["character"] == pj.personaje_por_defecto("Ana") and sin["character_chosen"] is False
    con = pj.con_personaje(ficha, {"Ana": "can"})
    assert con["character"] == "can" and con["character_chosen"] is True
    assert "character" not in ficha, "no muta la ficha original"


def _cliente(monkeypatch, tmp_path):
    monkeypatch.setattr(main, "require_player_session", lambda *a, **k: None)
    monkeypatch.setattr(main, "PERSONAJES_DB", str(tmp_path / "personajes.json"))
    monkeypatch.setattr(main, "resolve_known_player_profile",
                        lambda u: {"id": str(u)} if u in ("Ana", "Bea") else None)
    app = FastAPI()
    app.include_router(game_router.router)
    return TestClient(app)


def test_elegir_personaje_valida_y_persiste(monkeypatch, tmp_path):
    c = _cliente(monkeypatch, tmp_path)
    ok = c.post("/api/personaje", json={"user": "Ana", "character": "vikinga"})
    assert ok.status_code == 200 and ok.json()["character"] == "vikinga"
    assert main.load_personajes() == {"Ana": "vikinga"}
    assert c.post("/api/personaje", json={"user": "Ana", "character": "dragon"}).status_code == 400
    assert c.post("/api/personaje", json={"user": "Ana", "character": "../x"}).status_code == 400
    assert c.post("/api/personaje", json={"user": "Nadie", "character": "can"}).status_code == 404
    assert c.post("/api/personaje", json={"character": "can"}).status_code == 400
    assert main.load_personajes() == {"Ana": "vikinga"}, "lo rechazado no se guarda"


def test_sin_sesion_firmada_no_se_cambia_el_personaje_de_otro(monkeypatch, tmp_path):
    from fastapi import HTTPException

    c = _cliente(monkeypatch, tmp_path)

    def denegar(*a, **k):
        raise HTTPException(status_code=401, detail="no session")

    monkeypatch.setattr(main, "require_player_session", denegar)
    r = c.post("/api/personaje", json={"user": "Bea", "character": "can"})
    assert r.status_code == 401 and main.load_personajes() == {}


def test_deslizador_suaviza_entre_fixes_y_no_desliza_los_saltos(js):
    d = js["desliz"]
    assert d["mitadEntre"] and d["finExacto"] and d["moviendoAl"] and not d["quietoDespues"]
    assert d["saltoSinDeslizar"] is True
    assert 80 < d["rumbo"] < 100, "hacia el este"
    assert d["ruidoSinRumbo"] is None, "el ruido de GPS no gira la flecha"


def test_la_celebracion_dura_menos_de_2_5_s_y_respeta_las_reglas(js):
    c = js["celeb"]
    assert c["totalMs"] <= c["maxMs"] <= 2500
    assert c["normal"] == {"nodoHecho": 2, "reducido": False, "conVuelo": True}
    for caso in ("primeraLectura", "salto", "mapaNoListo"):
        assert c[caso] is None, caso
    assert c["ultimo"]["conVuelo"] is False, "el último nodo festeja pero no hay a dónde volar"
    # Mapa mudo: nunca se vuela a un destino secreto.
    assert c["mapaMudo"]["conVuelo"] is False and c["mudoFases"] == ["festejo", "inactiva"]
    # Reducir movimiento: destello quieto, sin vuelo.
    assert c["reducido"] == {"nodoHecho": 2, "reducido": True, "conVuelo": False}
    assert c["reducidaMq"] == [True, False, False]
    assert c["fases"] == ["festejo", "festejo", "vuelo", "vuelo", "vuelo", "inactiva", "inactiva"]
    assert c["cancela"] == [True, "inactiva", False], "tocar el mapa la corta"


def test_la_ruta_andada_se_corta_en_dos_tramos_que_se_tocan(js):
    r = js["ruta"]
    assert r["puntos"] == [3, 3] and r["unidos"] is True
    assert r["cero"] == 0 and r["todo"] == 0
