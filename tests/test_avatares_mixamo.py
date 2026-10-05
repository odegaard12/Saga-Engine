# -*- coding: utf-8 -*-
"""Avatares 3D (personajes de Mixamo) en el mapa y la tienda de ropa.

Qué se comprueba y cómo:

* El servidor y el móvil comparten catálogo (ids, colores, complementos): la lógica pura
  del móvil se ejecuta en Node (tests/js/avatares_mixamo.cjs) y se compara con
  backend/app/runtime/personajes.py.
* El servidor no se fía del móvil: `parts` mal formadas se rechazan; la unicidad es por
  el hash de la configuración ENTERA (dos jugadores pueden llevar el mismo personaje si
  cambia un color o un complemento; la misma config exacta da 409).
* El presupuesto por calidad (cuántos avatares 3D, cuántos con objetos de mano), la
  velocidad por ventana y el medidor de fotogramas.
* Los modelos están donde dicen las rutas, con la huella que dice su nombre, y viajan en
  `player-precache.json` (se bajan en la pantalla de carga, parte «App»): nada se pide de
  fondo mientras se juega.
* El cableado (lo que sólo existe dentro de React/MapLibre/three.js) se comprueba por el código,
  como el resto de pruebas del repo; el comportamiento en un navegador se ve en las capturas de
  la fase 2 (scratchpad/vista/fase2_*).
"""
import hashlib
import json
import os
import re
import shutil
import subprocess
import tempfile
from pathlib import Path

os.environ.setdefault("ADMIN_PASS", "pytest_admin_password")
os.environ.setdefault("SAGA_DATA_DIR", tempfile.mkdtemp(prefix="saga-test-mixamo-"))

import pytest  # noqa: E402
from fastapi import FastAPI  # noqa: E402
from fastapi.testclient import TestClient  # noqa: E402

import main  # noqa: E402
from backend.app.routers import game as game_router  # noqa: E402
from backend.app.runtime import personajes as pj  # noqa: E402

RAIZ = Path(__file__).resolve().parent.parent
FRONT = RAIZ / "frontend"
SRC = FRONT / "src" / "player"
MIXAMO = SRC / "avatares3d" / "mixamo"
MODELOS = RAIZ / "assets_privados" / "avatares"
MANIFIESTO = MIXAMO / "manifiesto.json"


def leer(ruta: Path) -> str:
    return ruta.read_text(encoding="utf-8")


@pytest.fixture(scope="module")
def js():
    node = shutil.which("node")
    if not node or not (FRONT / "node_modules" / "typescript").exists():
        pytest.skip("sin node o sin frontend/node_modules")
    r = subprocess.run([node, str(RAIZ / "tests" / "js" / "avatares_mixamo.cjs")],
                       capture_output=True, text=True, timeout=120, encoding="utf-8")
    assert r.returncode == 0, r.stderr[-3000:]
    return json.loads(r.stdout)


# ---------------------------------------------------------------- catálogo: móvil == servidor

def test_el_catalogo_mixamo_es_el_mismo_en_servidor_y_movil(js):
    assert js["ids"] == list(pj.MIXAMO_IDS)
    assert js["coloresRopa"] == pj.MIXAMO_COLORES_ROPA
    assert js["coloresPelo"] == pj.MIXAMO_COLORES_PELO
    assert {k: tuple(v) for k, v in js["huecos"].items()} == pj.MIXAMO_COMPLEMENTOS
    # Lo que un complemento ocupa (manos) y a qué hueco pertenece.
    for nombre, dato in js["complementos"].items():
        assert nombre in pj.MIXAMO_COMPLEMENTOS[dato["hueco"]]


def test_cada_personaje_3d_tiene_un_character_valido_y_los_jugadores_2d_pasan_a_un_3d(js):
    assert set(js["legacy"]) == set(pj.MIXAMO_IDS)
    assert js["legacyValidos"] and all(pj.es_personaje(p) for p in js["legacy"].values())
    # La lista de personajes NO se ha tocado.
    assert len(pj.PERSONAJES) == 10 and pj.PERSONAJES[-1] == "raposo"
    # Quien eligió uno de los diez en la versión 2D: mismo pase en el móvil y en el servidor, sin repetir ninguno.
    assert js["deLegacy"] == pj.MIXAMO_DE_PERSONAJE and js["deLegacyInyectivo"] is True
    assert set(pj.MIXAMO_DE_PERSONAJE) == set(pj.PERSONAJES) and set(pj.MIXAMO_DE_PERSONAJE.values()) == set(pj.MIXAMO_IDS)


def test_textos_en_gallego_y_en_espanol(js):
    t = js["textos"]
    assert t["tienda"][0] == t["tienda"][1] and t["pestanas"][0] == t["pestanas"][1] and t["gestos"][0] == t["gestos"][1]
    assert t["vacios"] == 0 and js["nombresEsGl"] is True
    assert t["idiomas"] == ["es", "gl", "es", "es"], "el inglés cae en español"


def test_los_gestos_son_clips_ge_sin_sentarse_saltar_ni_bailar(js):
    assert js["gestos"] and all(g.startswith("ge__") for g in js["gestos"])
    assert not [g for g in js["gestos"] + js["festejo"] if re.search(r"sit|jump|danc", g)]
    assert set(js["festejo"]) <= set(js["gestos"])


# ---------------------------------------------------------------- aspecto <-> parts (móvil)

def test_aspecto_y_parts_van_y_vuelven(js):
    assert js["parts"] == {"mx": "Ch22", "top": 3, "pants": 10, "hair": 4, "cabeza": "boina", "manoD": "bordon"}
    assert js["roundTrip"] == {"mx": "Ch22", "top": 3, "pants": 10, "hair": 4, "items": {"cabeza": "boina", "manoD": "bordon"}}
    assert js["config"]["character"] == "exploradora"
    # Lo que el móvil considera un avatar válido lo acepta el servidor tal cual (misma forma canónica).
    assert pj.normalizar_avatar(js["config"]) == js["configNormaliza"]


def test_la_unicidad_mira_la_configuracion_entera(js):
    assert js["claveDistintaPorColor"] is True, "otro color de camiseta = otro avatar"
    assert js["claveIgual"] is True, "el orden de las claves no importa"


def test_el_movil_rechaza_lo_que_el_servidor_rechaza(js):
    assert all(js["rechazos"].values()), [k for k, v in js["rechazos"].items() if not v]
    assert js["valido"] and js["deSerie"] == {"mx": "Ch01", "top": 0, "pants": 10, "hair": 4, "items": {}}


def test_nunca_quedan_dos_objetos_en_la_misma_mano(js):
    assert js["manos"] == {"gaita": ["L", "R"], "bordon": ["R"], "dos": ["L", "R"], "gorro": []}
    b = js["bloqueos"]
    assert b["gaitaConBordon"] == ["R"] and b["gaitaConCesta"] == ["L"] and b["bordonConGaita"] == ["R"]
    assert b["cestaConBordon"] is None and b["cambiarBordonPorParaguas"] is None and b["boina"] is None
    c = js["conComplemento"]
    # 5.48: elegir un objeto para una mano ocupada SUSTITUYE al anterior (antes se bloqueaba la tarjeta).
    assert c["gaitaSustituyeBordon"] == {"dos": "gaita"}
    assert c["gaitaSustituyeBordonYCesta"] == {"dos": "gaita", "cabeza": "boina"}
    assert c["bordonSustituyeGaita"] == {"manoD": "bordon"} and c["cestaSustituyeGaita"] == {"manoI": "cesta"}
    assert c["paraguasSustituyeBordon"] == {"manoD": "paraguas"} and c["quitar"] == {"cabeza": "boina"}
    assert c["cestaConBordonCaben"] == {"manoD": "bordon", "manoI": "cesta"}
    assert c["queQuita"] == ["bordon", "cesta"]
    # Al azar: con cualquier orden de elecciones nunca hay dos objetos en la misma mano.
    assert c["azarSinChoques"] is True
    # Lo guardado por versiones viejas con el choque se sanea al leerlo (no se pierde el aspecto entero).
    assert c["saneado"] == {"mx": "Ch01", "top": 0, "pants": 10, "hair": 4, "items": {"manoD": "bordon"}}


def test_cada_complemento_lleva_id_y_categoria_estables(js):
    fichas = js["fichas"]
    assert set(fichas) == {c for items in pj.MIXAMO_COMPLEMENTOS.values() for c in items}
    for nombre, f in fichas.items():
        assert f["id"] == nombre, "el id es la clave estable (la que se guarda en parts)"
        assert f["categoria"] in {"tocado", "espalda", "cintura", "mano", "calzado"}
        assert f["tema"] in {"galego", "ruta", "viquingo"}
    assert {k for k, f in fichas.items() if f["categoria"] == "mano"} == {"bordon", "paraguas", "cesta", "gaita"}
    # Los nuevos de la 5.48 (no van en la mano: no necesitan clip de agarre).
    for nuevo in ("monteira", "pano", "sueste", "gorra", "coroza", "faixa", "cabaza"):
        assert fichas[nuevo]["categoria"] != "mano"


def test_los_conjuntos_son_validos_y_no_cambian_de_personaje(js):
    assert js["conjuntos"] == 15 and js["conjuntosValidos"] and js["conjuntoNoCambiaElPersonaje"]


def test_el_aspecto_por_defecto_es_estable_valido_y_repartido(js):
    assert js["defectoEstable"] and js["defectosValidos"]
    assert js["defectoReparte"] >= 8, "con 300 jugadores salen casi los diez personajes"
    assert js["defectos"][1] == ["prueba1", {"mx": "Ch23", "top": 1, "pants": 10, "hair": 3, "items": {}}]
    a = js["aspectoDe"]
    assert a["conAvatar"] == "Ch22" and a["sinElegir"] and a["partsMalos"]
    assert a["deLaVersion2D"] == {"mx": "Ch31", "top": 0, "pants": 10, "hair": 4, "items": {}}
    assert a["deLaVersion2DPlano"] == "Ch21"


# ---------------------------------------------------------------- servidor: validar y no repetir

def _parts(**kw):
    base = {"mx": "Ch01", "top": 0, "pants": 10, "hair": 4}
    base.update(kw)
    return {"character": "peregrino", "parts": base}


def test_el_servidor_acepta_un_avatar_3d_bien_formado():
    canon = pj.normalizar_avatar(_parts(cabeza="boina", manoD="bordon", espalda="mochilaP"))
    assert canon["character"] == "peregrino"
    assert list(canon["parts"]) == sorted(canon["parts"]), "forma canónica: claves ordenadas"
    assert pj.normalizar_avatar(_parts()) is not None
    assert pj.normalizar_avatar({"character": "can"}) == {"character": "can"}, "el formato antiguo sigue valiendo"


@pytest.mark.parametrize("malo", [
    {"mx": "Ch99"},
    {"mx": "ch01"},
    {"mx": "Ch01", "top": 17},
    {"mx": "Ch01", "pants": -1},
    {"mx": "Ch01", "hair": 8},
    {"mx": "Ch01", "top": "0"},
    {"mx": "Ch01", "top": True},
    {"mx": "Ch01", "top": 1.5},
    {"mx": "Ch01", "cabeza": "corona"},
    {"mx": "Ch01", "cabeza": "bordon"},
    {"mx": "Ch01", "manoD": "pandeireta"},
    {"mx": "Ch01", "dos": "gaita", "manoD": "bordon"},
    {"mx": "Ch01", "dos": "gaita", "manoI": "cesta"},
    {"mx": "Ch01", "inventado": 1},
], ids=lambda m: json.dumps(m, sort_keys=True))
def test_el_servidor_rechaza_partes_inventadas(malo):
    assert pj.normalizar_avatar({"character": "peregrino", "parts": malo}) is None
    with pytest.raises(ValueError):
        pj.hash_de_avatar({"character": "peregrino", "parts": malo})


def test_otras_partes_sin_mx_siguen_admitidas():
    """`parts` es extensible: lo de Mixamo sólo se valida cuando hay `mx`."""
    assert pj.normalizar_avatar({"character": "can", "parts": {"skin": "3"}}) == {"character": "can", "parts": {"skin": "3"}}


def test_el_hash_distingue_colores_y_complementos_pero_no_el_orden():
    h = pj.hash_de_avatar
    assert h(_parts()) == h({"character": "peregrino", "parts": dict(reversed(list(_parts()["parts"].items())))})
    assert h(_parts()) != h(_parts(top=1))
    assert h(_parts()) != h(_parts(cabeza="boina"))
    assert h(_parts(mx="Ch02")) != h(_parts())


def test_dos_jugadores_no_pueden_llevar_la_misma_configuracion_entera(tmp_path):
    ruta = str(tmp_path / "p.json")
    pj.guardar_elegido(ruta, "Ana", _parts(cabeza="boina"))
    with pytest.raises(pj.AvatarOcupado):
        pj.guardar_elegido(ruta, "Bea", _parts(cabeza="boina"))
    # Mismo personaje, otro color: libre.
    assert pj.guardar_elegido(ruta, "Bea", _parts(cabeza="boina", top=5))["parts"]["top"] == 5
    # Cambiarse a sí misma a lo mismo que ya tiene no es choque.
    assert pj.guardar_elegido(ruta, "Ana", _parts(cabeza="boina"))
    cfgs = pj.cargar_configs(ruta)
    assert set(cfgs) == {"Ana", "Bea"} and cfgs["Ana"]["parts"]["cabeza"] == "boina"
    # Los demás ven la config entera de los otros (sin ids), que es lo que necesita la tienda para marcar lo ocupado.
    vistos = pj.ocupados_por_otros(cfgs, "Ana")
    assert [v["avatar"] for v in vistos] == [cfgs["Bea"]] and all("Bea" not in json.dumps(v) for v in vistos)


def _cliente(monkeypatch, tmp_path):
    monkeypatch.setattr(main, "require_player_session", lambda *a, **k: None)
    monkeypatch.setattr(main, "PERSONAJES_DB", str(tmp_path / "personajes.json"))
    monkeypatch.setattr(main, "resolve_known_player_profile",
                        lambda u: {"id": str(u)} if u in ("Ana", "Bea", "Cris") else None)
    app = FastAPI()
    app.include_router(game_router.router)
    return TestClient(app)


def test_la_api_guarda_y_devuelve_el_avatar_3d_y_da_409_si_ya_lo_lleva_otro(monkeypatch, tmp_path):
    c = _cliente(monkeypatch, tmp_path)
    cfg = _parts(cabeza="boina", manoD="bordon")
    r = c.post("/api/personaje", json={"user": "Ana", "character": cfg["character"], "avatar": cfg})
    assert r.status_code == 200 and r.json()["avatar"]["parts"]["manoD"] == "bordon"
    # Bea quiere EXACTAMENTE lo mismo: 409 con mensaje, y no se le guarda nada.
    r = c.post("/api/personaje", json={"user": "Bea", "character": cfg["character"], "avatar": cfg})
    assert r.status_code == 409 and r.json()["detail"] == "avatar taken"
    assert c.get("/api/personaje/Bea").json()["character_chosen"] is False
    # Cambia un color y entra.
    otro = _parts(cabeza="boina", manoD="bordon", top=6)
    r = c.post("/api/personaje", json={"user": "Bea", "character": otro["character"], "avatar": otro})
    assert r.status_code == 200
    estado = c.get("/api/personaje/Bea").json()
    assert estado["character_chosen"] is True and estado["avatar"]["parts"]["top"] == 6
    assert [t["avatar"]["parts"]["top"] for t in estado["taken"]] == [0], "Bea ve la config entera de Ana, sin su id"


def test_la_api_rechaza_un_avatar_3d_inventado(monkeypatch, tmp_path):
    c = _cliente(monkeypatch, tmp_path)
    for malo in ({"mx": "Ch99"}, {"mx": "Ch01", "top": 99}, {"mx": "Ch01", "cabeza": "corona"}):
        r = c.post("/api/personaje", json={"user": "Ana", "character": "peregrino", "avatar": {"character": "peregrino", "parts": malo}})
        assert r.status_code == 400, malo
    assert c.get("/api/personaje/Ana").json()["character_chosen"] is False


def test_la_ficha_de_equipo_lleva_el_avatar_3d_de_cada_uno(monkeypatch, tmp_path):
    cfg = _parts(espalda="mochila")
    ficha = pj.con_personaje({"id": "Ana"}, {"Ana": cfg})
    assert ficha["character_chosen"] is True and ficha["avatar"]["parts"]["espalda"] == "mochila"
    sin = pj.con_personaje({"id": "Cris"}, {})
    assert sin["character_chosen"] is False and "parts" not in sin["avatar"]


# ---------------------------------------------------------------- presupuesto, 2D/3D y calidad (móvil)

def test_cada_calidad_tiene_su_tope_y_tu_avatar_va_primero(js):
    assert js["tope"] == {"baja": 3, "media": 6, "alta": 10}
    for calidad in ("baja", "media", "alta"):
        sel = js["lod"][calidad]
        assert sel["tresD"][0] == "yo", "tú vas el primero y no te quitan la plaza"
        assert len(sel["tresD"]) <= js["tope"][calidad]
        assert "sinModelo" not in sel["tresD"], "sin su modelo en el móvil se queda en el retrato y no ocupa plaza"
    # Después, los más cercanos al centro de la pantalla.
    assert js["lod"]["media"]["tresD"] == ["yo", "cerca", "medio", "otro1", "otro2", "otro3"]
    assert js["lod"]["yoSinModelo"]["tresD"] == ["a"], "si tu modelo falta, la plaza se queda libre"
    assert js["lod"]["vacio"]["tresD"] == [] and js["lodMuchos"] == 10, "con 40 jugadores, nunca más del tope"


def test_la_calidad_de_partida_sale_del_movil(js):
    q = js["calidadInicial"]
    assert q == {"movilViejo": "baja", "nucleosJustos": "baja", "medio": "media", "potente": "alta", "sinDatos": "media"}


def test_lejos_o_plano_manda_el_retrato_redondo(js):
    f = js["forma"]
    assert f == {"lejos": False, "justo": True, "cenital": False, "cerca": True}


def test_la_velocidad_sale_del_desplazamiento_neto_no_del_ruido_del_gps(js):
    v = js["velocidad"]
    assert v["parado"] == 0 and v["ruidoGps"] == 0 and v["unaMuestra"] == 0
    assert v["andando"] == 1.4 and v["corriendo"] == 3.4 and v["topeAbsurdo"] <= 7
    assert v["sinParpadeo"] is True, "con el deslizamiento a ritmo constante no se anda-para-anda"
    assert js["muestrasAcotadas"] < 100, "la ventana no crece sin límite"


def test_el_medidor_baja_la_calidad_si_no_llega_y_nunca_la_sube(js):
    g = js["gobernador"]
    assert g["sano"] == [] and g["reposo"] == [] and g["mapaEnMarcha"] == [] and g["pausa"] == [],         "a ritmo, en reposo (espera larga pedida), con el mapa en marcha y en pausa no se baja"
    assert g["lento"] == ["media", "baja"] and g["sigueBaja"] is True


def test_el_tamano_en_pantalla_es_casi_constante(js):
    h = js["alturaVirtual"]
    assert 35 < h["z17"] < 42 and 11 < h["z19"] < 14 and h["z25"] == 1.75, "nunca por debajo de su tamaño real"
    assert h["z13"] > h["z17"] > h["z19"], "en metros baja al acercarse; en pantalla crece despacio"


# ---------------------------------------------------------------- los modelos y la pantalla de carga

def _manifiesto():
    return json.loads(leer(MANIFIESTO))


def _nombres():
    m = _manifiesto()
    return [m["anims"], *m["personajes"].values(), *m["agarres"].values(), *m["caras"].values()]


def test_el_manifiesto_nombra_todo_lo_que_la_app_necesita():
    m = _manifiesto()
    ids = list(pj.MIXAMO_IDS)
    assert re.fullmatch(r"anims\.[0-9a-f]{8}\.glb", m["anims"])
    assert sorted(m["personajes"]) == sorted(ids) and sorted(m["agarres"]) == sorted(ids) and sorted(m["caras"]) == sorted(ids)
    for ch, n in m["personajes"].items():
        assert re.fullmatch(ch + r"\.[0-9a-f]{8}\.glb", n), n
    for ch, n in m["agarres"].items():
        assert re.fullmatch("hold-" + ch + r"\.[0-9a-f]{8}\.glb", n), n
    for ch, n in m["caras"].items():
        assert re.fullmatch("cara-" + ch + r"\.[0-9a-f]{8}\.webp", n), n


def test_los_activos_de_mixamo_no_estan_en_git():
    """Su licencia no permite redistribuirlos: ni los GLB/FBX, ni la carpeta de trabajo, ni el rastro de otras fuentes."""
    gi = leer(RAIZ / ".gitignore")
    assert re.search(r"^assets_privados/$", gi, re.M)
    git = shutil.which("git")
    if git and (RAIZ / ".git").exists():
        r = subprocess.run([git, "ls-files"], cwd=RAIZ, capture_output=True, text=True, encoding="utf-8")
        if r.returncode == 0:
            binarios = [f for f in r.stdout.splitlines() if re.search(r"\.(glb|gltf|fbx|bvh)$", f, re.I)]
            assert not binarios, binarios
    assert not (FRONT / "public" / "assets" / "avatares").exists(), "los activos no viven en public/ (se copiarían al build y a git)"
    harness = RAIZ / "sim" / "playwright-bench" / "harness"
    assert sorted(p.name for p in harness.iterdir() if p.is_dir()) == ["mixamo4", "transiciones"], "bancos viejos fuera"
    for f in (harness / "mixamo4").rglob("*"):
        if f.is_file() and f.suffix in (".js", ".mjs", ".py", ".html", ".md"):
            assert not re.search(r"rokoko|mocap.?online|MCO_Demo|unitypackage", leer(f), re.I), f


def test_si_estan_los_activos_cada_huella_cuadra_con_el_nombre():
    if not MODELOS.is_dir() or not all((MODELOS / n).is_file() for n in _nombres()):
        pytest.skip("sin assets_privados/avatares (no están en git)")
    for n in _nombres():
        f = MODELOS / n
        assert hashlib.sha1(f.read_bytes()).hexdigest()[:8] == n.split(".")[1], "la huella del nombre no es la del contenido: %s" % n
        cabecera = f.read_bytes()[:16]
        assert cabecera[:4] == b"glTF" if n.endswith(".glb") else (cabecera[:4] == b"RIFF" and b"WEBP" in cabecera)
    assert {f.name for f in MODELOS.iterdir()} == set(_nombres()), "sobra o falta algo respecto al manifiesto"


def test_el_peso_de_la_descarga_es_el_esperado_para_un_movil():
    """~12 MB una sola vez (después, de la caché). Si se dispara, algo no está optimizado."""
    if not MODELOS.is_dir() or not all((MODELOS / n).is_file() for n in _nombres()):
        pytest.skip("sin assets_privados/avatares (no están en git)")
    total = sum((MODELOS / n).stat().st_size for n in _nombres())
    assert 9_000_000 < total < 15_000_000, total
    assert max((MODELOS / n).stat().st_size for n in _nombres() if n.endswith(".glb")) < 2_000_000
    assert all((MODELOS / n).stat().st_size < 12_000 for n in _nombres() if n.endswith(".webp"))


def test_los_modelos_viajan_en_la_lista_de_la_pantalla_de_carga():
    vite = leer(FRONT / "vite.config.ts")
    assert "manifiesto.json" in vite and "/assets/avatares/" in vite
    assert "public', 'assets', 'avatares'" not in vite
    pwa = leer(SRC / "offline" / "pwaShell.ts")
    assert "RUTA_DE_AVATARES = '/assets/avatares/'" in pwa
    assert "avatares ${totalAvatares - avataresFaltan} de ${totalAvatares}" in pwa, "la parte «App» cuenta los avatares aparte"
    # Con cobertura justa un modelo de 1,8 MB no cabe en los 20 s de los demás.
    assert "esDeAvatar(ruta) ? 90000 : 20000" in pwa
    # Son opcionales: un 404 no bloquea la carga ni se reintenta.
    assert "ausentes.add(ruta)" in pwa and "faltan: obligatorios" in pwa
    # La lista que lee el móvil sólo admite /assets/: los avatares cuelgan de ahí.
    assert "f.startsWith('/assets/')" in pwa


def test_si_hay_build_los_nombres_estan_en_player_precache():
    dist = FRONT / "dist" / "player-precache.json"
    if not dist.exists():
        pytest.skip("sin build")
    lista = set(json.loads(dist.read_text(encoding="utf-8"))["files"])
    esperados = {"/assets/avatares/" + n for n in _nombres()}
    assert esperados <= lista, sorted(esperados - lista)


def test_los_modelos_solo_salen_de_la_cache_del_movil_durante_la_partida():
    carga = leer(MIXAMO / "cargador.ts")
    # Antes de pedir nada se mira la caché; sin ella, error y el mapa se queda en 2D.
    assert re.search(r"if \(!op\.permitirRed && !\(await hayEnElMovil\(url\)\)\) \{(\s*//[^\n]*|\s*fallos\.set[^\n]*)*\s*throw", carga)
    assert "caches.match(url, { ignoreSearch: true })" in carga
    capa = leer(MIXAMO / "capaAvatares.ts")
    assert "permitirRed" not in capa, "el mapa nunca pide red: la tienda sí, a propósito y con barra de progreso"
    assert "cargarPersonaje(mx)" in capa
    tienda = leer(MIXAMO / "TiendaDeRopa.tsx")
    assert "permitirRed: true" in tienda
    # three.js abría las texturas WebP con un fetch a blob:, que la política de seguridad no permite.
    assert "saga_texturas_sin_fetch" in carga and "new TextureLoader(" in carga
    seguridad = leer(RAIZ / "backend" / "app" / "runtime" / "seguridad_jugador_glue.py")
    assert "connect-src 'self' https: ws: wss:;" in seguridad, "no se afloja la política: blob: no se añade a connect-src"


# ---------------------------------------------------------------- cableado (por el código)

def test_los_avatares_comparten_la_escena_y_el_renderizador_de_los_nodos():
    capa = leer(SRC / "components" / "nodosTresD.ts")
    assert "anadirComplemento" in capa and "escena.add(complemento.grupo)" in capa
    assert "dibujarNodos(si)" in capa and "nodosEnCapa" in capa
    # Las dos pasadas siguen siendo las de siempre; tu avatar va en la segunda (encima de todo).
    assert "camara.layers.set(1)" in capa and "renderer.clearDepth()" in capa
    # Sin nada que pintar no se hace el fotograma, y el ritmo de los nodos (33 ms) no cambia.
    assert "if (dibujar) try {" in capa and "}, 33)" in capa and "}, 50)" not in capa
    av = leer(MIXAMO / "capaAvatares.ts")
    assert "fijarCapa(av.root, 1)" in av and "e.jugador.esYo" in av
    assert "makeScale(m * k * crece, -m * k * crece, m * k * crece)" in av, "el mismo espejo en y que los nodos (Mercator crece al sur)"
    assert "queryTerrainElevation" in av and "av.setSpeed(v, velocidadDePaso(v, k))" in av
    assert "norelief" not in av and "ikCada" not in av, "ya no hay cinemática inversa: los agarres vienen horneados"


def test_el_mapa_lleva_los_avatares_y_deja_el_retrato_de_reserva():
    mapa = leer(SRC / "components" / "MapSurfaceGL.tsx")
    assert "capaNodos.dibujarNodos(false)" in mapa, "los nodos siguen siendo los símbolos horneados"
    assert "import('../avatares3d/mixamo/capaAvatares')" in mapa, "carga diferida: quien no lo usa no lo paga"
    assert "vivo.addLayer(capa.capa, CAPA_CELEB_ONDA)" in mapa
    assert "aplicarCapaAvataresRef.current?.()" in mapa, "tras rehacer el estilo la capa vuelve"
    # 5.49: en 3D el retrato sigue en el mapa pero apagado por el estado `tresD` de su punto (sigue tocable), que
    # cambia en el mismo fotograma que el cuerpo: nada de rehacer los datos (llegaban tarde: el halo sin jugador).
    assert "const valor = enTresD.has(clave)" in mapa and "mapa.setFeatureState({ source: fuente, id: clave }, { tresD: valor })" in mapa
    assert "['boolean', ['feature-state', 'tresD'], false]" in mapa
    # Los grupos (zoom lejano) y los desconectados NUNCA van en 3D: ahí manda el retrato redondo.
    assert "aspecto: grupo || el.presencia === 'offline' ? null : aspectoDe(j)" in mapa
    # Tocarte: menú de gestos si te ves en 3D, tienda si no. Y la celebración también la hace tu avatar.
    assert "EVENTO_MENU_DE_GESTOS : EVENTO_ELEGIR_PERSONAJE" in mapa
    assert "avataresRef.current?.festejar(CLAVE_YO)" in mapa
    assert "avataresRef.current?.gesto(CLAVE_YO, clip)" in mapa


def test_la_tienda_se_abre_desde_un_boton_redondo_de_la_barra():
    app = leer(SRC / "PlayerApp.tsx")
    assert 'data-saga-boton="tienda-de-ropa"' in app and "<IconoCamiseta />" in app
    # En la misma fila de botones redondos que el trofeo, con el mismo estilo.
    fila = app[app.index('className="saga-hud-quick"'):app.index("saga-map-quick-controls-row-v1")]
    assert fila.index("<IconoTrofeo />") < fila.index("<IconoCamiseta />") and "mapRouteToggleInlineButton" in fila
    assert "EVENTO_ELEGIR_PERSONAJE" in app
    # Sin avatar elegido, la tienda sale ANTES de la pantalla de carga (a pantalla completa).
    assert "if (eleccion === 'primera')" in app and 'modo="primera"' in app


def test_la_tienda_guarda_la_configuracion_entera_y_trata_el_409():
    g = leer(SRC / "avatares" / "GestorDePersonaje.tsx")
    assert "configDeAspecto(aspecto)" in g and "guardarPersonaje(usuario, config)" in g
    assert "resultado === 'ocupado'" in g and "t.ocupadoTrasGuardar" in g and "await refrescar()" in g
    assert "EVENTO_PERSONAJE_ELEGIDO, { detail: config }" in g
    t = leer(MIXAMO / "TiendaDeRopa.tsx")
    assert "ocupadas.has(claveDeAvatar(configDeAspecto(aspecto)))" in t, "avisa antes de guardar si ya lo lleva otro"
    assert "disabled={guardando || tomado || sinGanar.length > 0}" in t
    api = leer(FRONT / "src" / "shared" / "api.ts")
    assert "{ user, character: config.character, avatar: config }" in api
    local = leer(SRC / "avatares" / "elegirPersonaje.ts")
    assert "escribirLocal(usuario, anterior)" in local, "un 409 deshace lo local"


def test_el_motor_se_regenera_del_banco_y_no_se_edita_a_mano():
    generado = MIXAMO / "motor"
    assert sorted(f.name for f in generado.iterdir()) == ["acc.ts", "avatar.ts", "clips.ts", "fusion.ts", "look.ts", "motor.ts", "stage.ts"]
    for f in generado.iterdir():
        t = leer(f)
        assert t.startswith("/* eslint-disable */") and "GENERADO por frontend/scripts/portar-motor-mixamo.mjs" in t, f.name
        assert "harness/mixamo4/" in t
    motor = leer(generado / "motor.ts")
    assert "export class Motor" in motor and "export function leerAgarre" in motor and "hold_${n}_${state}" in motor
    assert "class Avatar extends Motor" in leer(generado / "avatar.ts")
    # Se terminó la cinemática inversa en el móvil y las tablas de ajuste calculadas.
    assert not (MIXAMO / "ajustes.ts").exists() and not (MIXAMO / "accesorios.ts").exists() and not (MIXAMO / "motor.ts").exists()
    script = leer(FRONT / "scripts" / "portar-motor-mixamo.mjs")
    assert "'harness', 'mixamo4'" in script


def test_el_retrato_redondo_sustituye_a_los_munecos_dibujados():
    assert not (SRC / "avatares" / "dibujarPersonaje.ts").exists()
    assert not (SRC / "avatares3d" / "catalogo.ts").exists(), "el prototipo procedural se fue"
    retrato = leer(SRC / "avatares" / "retratoDeMapa.ts")
    assert "export function dibujarRetratoDeMapa" in retrato and "export function leerIdDeRetrato" in retrato
    mapa = leer(SRC / "components" / "MapSurfaceGL.tsx")
    assert "leerIdDeRetrato(evento.id)" in mapa and "dibujarPersonaje" not in mapa and "pj-${" not in mapa
    assert "mapa.updateImage(evento.id, nueva)" in mapa, "al llegar la cara se repinta el retrato"


# ---------------------------------------------------------------- el servidor sirve los activos de SAGA_AVATAR_DIR

def _cliente_activos(monkeypatch, carpeta):
    from backend.app.routers import assets as assets_router

    monkeypatch.setenv("SAGA_AVATAR_DIR", str(carpeta))
    app = FastAPI()
    app.include_router(assets_router.router)
    return TestClient(app)


def test_el_servidor_sirve_los_activos_desde_saga_avatar_dir_y_da_404_si_faltan(monkeypatch, tmp_path):
    (tmp_path / "Ch01.0123abcd.glb").write_bytes(b"glTF....")
    (tmp_path / "cara-Ch01.0123abcd.webp").write_bytes(b"RIFF....WEBP")
    (tmp_path / "secreto.txt").write_text("no")
    c = _cliente_activos(monkeypatch, tmp_path)
    r = c.get("/assets/avatares/Ch01.0123abcd.glb")
    assert r.status_code == 200 and r.headers["content-type"] == "model/gltf-binary" and r.content == b"glTF...."
    assert "immutable" in r.headers["cache-control"], "el nombre lleva la huella: se guarda para siempre"
    assert c.get("/assets/avatares/cara-Ch01.0123abcd.webp").headers["content-type"] == "image/webp"
    assert c.head("/assets/avatares/Ch01.0123abcd.glb").status_code == 200
    # Lo que no está: 404 (la app sigue con el retrato). Lo que no es un activo: tampoco.
    assert c.get("/assets/avatares/Ch02.0123abcd.glb").status_code == 404
    assert c.get("/assets/avatares/secreto.txt").status_code == 404
    for malo in ("..%2Fsecreto.txt", "%2e%2e%2fCh01.0123abcd.glb", "a%5Cb.glb", ".oculto.glb"):
        assert c.get("/assets/avatares/" + malo).status_code == 404, malo


def test_sin_la_carpeta_de_activos_el_servidor_responde_404_sin_romperse(monkeypatch, tmp_path):
    c = _cliente_activos(monkeypatch, tmp_path / "no-existe")
    assert c.get("/assets/avatares/anims.00000000.glb").status_code == 404


def test_la_carpeta_de_activos_la_manda_el_entorno_y_si_no_el_volumen_o_el_arbol_de_trabajo(monkeypatch, tmp_path):
    from backend.app.routers import assets as assets_router

    monkeypatch.delenv("SAGA_AVATAR_DIR", raising=False)
    assert assets_router.carpeta_de_avatares().name == "avatares"
    monkeypatch.setenv("SAGA_AVATAR_DIR", str(tmp_path))
    assert assets_router.carpeta_de_avatares() == tmp_path


def test_el_despliegue_de_los_activos_esta_documentado_y_sin_ips():
    ps = leer(RAIZ / "scripts" / "desplegar_avatares.ps1")
    assert "-v /home/odegaard12/saga_avatares:/app/avatares:ro" in ps
    assert "manifiesto.json" in ps and "scp" in ps and "chmod -R a+rX" in ps
    assert not re.search(r"\b\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}\b", ps), "las IPs de las Pis no van en el repo"
    # La imagen NO lleva los activos.
    assert "assets_privados" not in leer(RAIZ / "Dockerfile")


def test_los_jugadores_de_la_version_2d_compiten_con_el_mismo_aspecto_3d(tmp_path):
    ruta = str(tmp_path / "p.json")
    pj.guardar_elegido(ruta, "Vieja", {"character": "vikingo"})
    # Pelayo (Ch31) con los colores de serie es EL MISMO aspecto que el vikingo antiguo.
    with pytest.raises(pj.AvatarOcupado):
        pj.guardar_elegido(ruta, "Nuevo", {"character": "vikingo", "parts": {"mx": "Ch31", "top": 0, "pants": 10, "hair": 4}})
    assert pj.guardar_elegido(ruta, "Nuevo", {"character": "vikingo", "parts": {"mx": "Ch31", "top": 1, "pants": 10, "hair": 4}})
    vistos = pj.ocupados_por_otros(pj.cargar_configs(ruta), "Nuevo")
    assert vistos[0]["avatar"] == {"character": "vikingo", "parts": {"hair": 4, "mx": "Ch31", "pants": 10, "top": 0}}, "el móvil ve al antiguo como lo que es"
