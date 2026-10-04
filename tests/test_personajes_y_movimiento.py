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


def test_la_lista_es_la_misma_en_servidor_y_movil(js):
    assert js["lista"] == list(pj.PERSONAJES)


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


# --- Unicidad del avatar --------------------------------------------------

def test_el_hash_del_avatar_es_canonico_y_acepta_partes_futuras():
    a = pj.hash_de_avatar({"character": "can"})
    assert a == pj.hash_de_avatar("can") == pj.hash_de_avatar({"character": "can", "parts": {}})
    p1 = pj.hash_de_avatar({"character": "can", "parts": {"pelo": "3", "piel": 2}})
    p2 = pj.hash_de_avatar({"character": "can", "parts": {"piel": 2, "pelo": "3"}})
    assert p1 == p2 and p1 != a
    for malo in ({"character": "dragon"}, {"character": "can", "parts": {"x": [1]}},
                 {"character": "can", "parts": {"x": True}}, {"character": "can", "parts": "no"}, 5, None):
        assert pj.normalizar_avatar(malo) is None


def test_formato_antiguo_y_nuevo_se_leen_igual(tmp_path):
    ruta = tmp_path / "p.json"
    ruta.write_text(json.dumps({"a": "raposo", "b": {"character": "can"}}), encoding="utf-8")
    assert pj.cargar_elegidos(str(ruta)) == {"a": "raposo", "b": "can"}
    assert pj.cargar_configs(str(ruta))["a"] == {"character": "raposo"}


def test_dos_jugadores_no_pueden_tener_el_mismo_avatar(monkeypatch, tmp_path):
    c = _cliente(monkeypatch, tmp_path)
    assert c.post("/api/personaje", json={"user": "Ana", "character": "can"}).status_code == 200
    r = c.post("/api/personaje", json={"user": "Bea", "character": "can"})
    assert r.status_code == 409 and "otro jugador" in r.json()["message"]
    assert main.load_personajes() == {"Ana": "can"}
    # Ana puede volver a elegir el suyo (no choca consigo misma) y Bea elige otro.
    assert c.post("/api/personaje", json={"user": "Ana", "character": "can"}).status_code == 200
    assert c.post("/api/personaje", json={"user": "Bea", "character": "raposo"}).status_code == 200
    # Si Ana cambia, el que dejó queda libre.
    assert c.post("/api/personaje", json={"user": "Ana", "character": "vikingo"}).status_code == 200
    assert c.post("/api/personaje", json={"user": "Bea", "character": "can"}).status_code == 200


def test_el_selector_sabe_lo_que_esta_ocupado_sin_nombres(monkeypatch, tmp_path):
    c = _cliente(monkeypatch, tmp_path)
    c.post("/api/personaje", json={"user": "Ana", "character": "can"})
    r = c.get("/api/personaje/Bea").json()
    assert r["character_chosen"] is False and r["avatar"] is None
    assert [t["avatar"]["character"] for t in r["taken"]] == ["can"]
    assert "Ana" not in json.dumps(r)
    mio = c.get("/api/personaje/Ana").json()
    assert mio["character_chosen"] is True and mio["taken"] == []


def test_carrera_dos_a_la_vez_gana_solo_uno(tmp_path):
    import threading

    ruta = str(tmp_path / "p.json")
    resultados = []

    def elegir(jugador):
        try:
            pj.guardar_elegido(ruta, jugador, {"character": "gaiteiro"})
            resultados.append("ok")
        except pj.AvatarOcupado:
            resultados.append("ocupado")

    hilos = [threading.Thread(target=elegir, args=(f"j{i}",)) for i in range(12)]
    for h in hilos:
        h.start()
    for h in hilos:
        h.join()
    assert sorted(resultados) == ["ocupado"] * 11 + ["ok"]
    assert list(pj.cargar_elegidos(ruta).values()) == ["gaiteiro"]


def test_los_duplicados_antiguos_siguen_funcionando(tmp_path):
    ruta = tmp_path / "p.json"
    ruta.write_text(json.dumps({"a": "can", "b": "can"}), encoding="utf-8")
    assert pj.cargar_elegidos(str(ruta)) == {"a": "can", "b": "can"}
    # Quien ya tenía el repetido puede re-confirmarlo; uno nuevo no puede cogerlo.
    pj.guardar_elegido(str(ruta), "a", "can")
    with pytest.raises(pj.AvatarOcupado):
        pj.guardar_elegido(str(ruta), "c", "can")
    pj.guardar_elegido(str(ruta), "c", "raposo")


def test_el_defecto_evita_lo_cogido_y_a_los_otros_defectos():
    ids = [f"j{i}" for i in range(10)]
    configs = {"j0": {"character": pj.personaje_por_defecto("j1")}}
    defectos = pj.calcular_defectos(ids, configs)
    assert "j0" not in defectos
    usados = list(defectos.values()) + [configs["j0"]["character"]]
    assert len(set(usados)) == len(usados) == 10, "con 10 jugadores y 10 personajes, ninguno repite"
    assert defectos == pj.calcular_defectos(reversed(ids), configs), "estable"
    # Con más jugadores que personajes se repite, pero siempre es válido.
    muchos = pj.calcular_defectos([f"k{i}" for i in range(25)], {})
    assert len(muchos) == 25 and all(pj.es_personaje(v) for v in muchos.values())


# --- Flujo del selector y avatar en el móvil (TS en Node) ---------------------

def test_el_selector_sale_antes_de_la_carga_solo_si_no_has_elegido(js):
    d = js["avatar"]["debeMostrar"]
    assert d == {"yaLocal": False, "yaServidor": False, "sinElegir": True, "sinRed": True}


def test_el_movil_compara_avatares_por_su_forma_canonica(js):
    a = js["avatar"]
    assert a["claveSimple"] == "can" and a["claveIgualFormatoViejo"] is True
    assert a["clavePartesOrden"] is True and a["partesCambianLaClave"] is True
    assert a["invalido"] == ""
    assert a["ocupadas"] == ["can", "raposo"], "lo inválido no cuenta"
    assert [t["avatar"]["character"] for t in a["estado"]["taken"]] == ["vikinga"]
    assert a["estado"]["character_chosen"] is True and a["estadoRaro"] is None


def test_el_selector_vive_en_playerapp_y_no_en_el_mapa():
    pa = (RAIZ / "frontend" / "src" / "player" / "PlayerApp.tsx").read_text(encoding="utf-8")
    mapa = (RAIZ / "frontend" / "src" / "player" / "components" / "MapSurfaceGL.tsx").read_text(encoding="utf-8")
    hud = (RAIZ / "frontend" / "src" / "player" / "components" / "PlayerHud.tsx").read_text(encoding="utf-8")
    # Antes de la pantalla de carga: el gate va por delante del retorno de idle/loading.
    assert pa.index("modo=\"primera\"") < pa.index("if (state.status === 'idle' || state.status === 'loading')")
    assert "SelectorDePersonaje" not in mapa and "setSelectorAbierto" not in mapa
    assert "EVENTO_ELEGIR_PERSONAJE" in mapa and "EVENTO_ELEGIR_PERSONAJE" in hud
    assert "'circle-radius': ['interpolate', ['exponential', 1.55], ['zoom'], 12, 13, 20, 26]" in mapa
