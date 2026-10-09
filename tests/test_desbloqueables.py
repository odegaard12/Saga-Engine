# -*- coding: utf-8 -*-
"""Vestuario desbloqueable: backend y panel (fases 1, 2 y 4 del informe del 04/10/2026).

Decisiones del usuario que se comprueban aquí:
  1. los 10 personajes son libres siempre;
  2. lo ganado es para siempre, por jugador (PK jugador+clave: nunca duplica);
  3. SIN legado: al activar, cada pieza bloqueada que lleve alguien se cambia sola
     por una libre equivalente, sin repetir la combinación de nadie, con aviso;
  4. probar sí, guardar no (409 «bloqueado»);
  5. sin premios automáticos de equipo (sólo regalos del admin);
  7. una regla nueva se aplica a lo ya jugado, enseñando antes a quién;
  8. con sospecha se concede igual (⚠), salvo en modo prueba (no da nada).
Y el interruptor global, APAGADO por defecto: con él apagado nada cambia.

Misión sintética de tests/ruta_de_proba.py; nada de datos reales.
"""
import json
import os
import shutil
import subprocess
import tempfile
import time
from datetime import datetime, timezone
from pathlib import Path

os.environ.setdefault("ADMIN_PASS", "pytest_admin_password")
os.environ.setdefault("SAGA_DATA_DIR", tempfile.mkdtemp(prefix="saga-test-desbloqueables-"))

import pytest  # noqa: E402
from fastapi.testclient import TestClient  # noqa: E402

import main  # noqa: E402
from backend.app.runtime import desbloqueables_catalogo as cat  # noqa: E402
from backend.app.runtime import desbloqueos as reglas_mod  # noqa: E402
from backend.app.runtime import personajes as pj  # noqa: E402
from backend.app.storage import desbloqueos_store as store  # noqa: E402
from ruta_de_proba import preparar_mision  # noqa: E402

RAIZ = Path(__file__).resolve().parent.parent
UNO = "PLAYER 1"
DOS = "PLAYER 2"
MIN = 60_000


def _iso(ms):
    return datetime.fromtimestamp(ms / 1000.0, tz=timezone.utc).isoformat().replace("+00:00", "Z")


def _ahora():
    return int(time.time() * 1000)


@pytest.fixture
def sitio(monkeypatch, tmp_path):
    preparar_mision(monkeypatch, tmp_path)
    monkeypatch.setattr(main, "PERSONAJES_DB", str(tmp_path / "personajes.json"))
    monkeypatch.setattr(main, "admin_request_authorized", lambda request, data: True)
    monkeypatch.setattr(main, "MANUAL_POSITION_NOTICE_DB", str(tmp_path / "aviso_manual.json"))
    # La configuración de la misión en memoria: guardar no toca el config.json
    # compartido por las demás pruebas del proceso.
    estado = {"cfg": dict(main.load_config())}
    estado["cfg"].pop("desbloqueables", None)
    monkeypatch.setattr(main, "load_config", lambda: dict(estado["cfg"]))
    monkeypatch.setattr(main, "save_config", lambda cfg: estado.update(cfg=dict(cfg)))
    main._desbloqueos_glue.olvidar_pendientes()
    main.set_player_progress_level(DOS, 0)
    cliente = TestClient(main.app)
    assert cliente.get("/api/game/PLAYER%201").status_code == 200
    return cliente


def _cliente_de(usuario):
    cliente = TestClient(main.app)
    assert cliente.get(f"/api/game/{usuario.replace(' ', '%20')}").status_code == 200
    return cliente


def _guardar(cliente, **cambios):
    revision = cliente.post("/api/admin/desbloqueables", json={}).json()["config"]["revision"]
    r = cliente.post("/api/admin/desbloqueables/guardar", json={"revision": revision, **cambios})
    assert r.status_code == 200, r.text
    return r.json()


def _activar(cliente, reglas, **extra):
    return _guardar(cliente, activos=True, reglas=reglas, **extra)


def _advance(cliente, nivel, usuario=UNO, **extra):
    r = cliente.post("/api/advance", json={"user": usuario, "code": "OK", "level_before": nivel, **extra})
    assert r.status_code == 200 and r.json()["status"] == "ok", r.text
    return r.json()


def _completar(cid, nivel, en_ms=None, **payload):
    return {"client_event_id": cid, "type": "node_completed", "source": "offline_queue",
            "payload": {"code": "OK", "level_before": nivel, "time_spent_ms": 5_000,
                        "local_created_at": _iso(en_ms or _ahora() - MIN), **payload}}


def _sync(cliente, eventos, usuario=UNO):
    r = cliente.post("/api/events/sync", json={"user": usuario, "events": eventos})
    assert r.status_code == 200, r.text
    return r.json()["events"]


def _mios(cliente, usuario=UNO):
    r = cliente.get(f"/api/desbloqueos/{usuario.replace(' ', '%20')}")
    assert r.status_code == 200, r.text
    return r.json()


def _filas(usuario=UNO):
    return store.listar(main._desbloqueos_glue.db_path(), usuario, incluir_retirados=True)


def _poner_avatar(usuario, partes):
    return pj.guardar_elegido(main.PERSONAJES_DB, usuario, {"character": "peregrino", "parts": partes})


# ---------------------------------------------------------------- catálogo y kit

@pytest.fixture(scope="module")
def js():
    node = shutil.which("node")
    if not node or not (RAIZ / "frontend" / "node_modules" / "typescript").exists():
        pytest.skip("sin node o sin frontend/node_modules")
    r = subprocess.run([node, str(RAIZ / "tests" / "js" / "avatares_mixamo.cjs")],
                       capture_output=True, text=True, timeout=120, encoding="utf-8")
    assert r.returncode == 0, r.stderr[-3000:]
    return json.loads(r.stdout)


def test_el_catalogo_de_claves_es_el_mismo_que_el_del_movil(js):
    assert list(cat.GESTOS) == js["gestos"]
    assert sorted(cat.HUECO_DE_ITEM) == sorted(js["complementos"])
    assert len(cat.NOMBRES_ROPA) == js["coloresRopa"] and len(cat.NOMBRES_PELO) == js["coloresPelo"]
    claves = cat.todas_las_claves()
    assert len(claves) == len(set(claves)) == 10 + js["coloresRopa"] + js["coloresPelo"] + len(js["complementos"]) + len(js["gestos"])
    assert all(c.split(":")[0] in {"mx", "ropa", "hair", "item", "gesto"} for c in claves)


def test_el_kit_libre_respeta_las_decisiones():
    assert {f"mx:{m}" for m in pj.MIXAMO_IDS} <= cat.KIT_LIBRE, "los 10 personajes, libres siempre"
    assert not (cat.NUNCA_BLOQUEADAS & cat.bloqueadas_efectivas(["mx:Ch26", "item:casco"]))
    # El aspecto de serie (y el de quien no eligió) es todo libre.
    assert cat.claves_de_avatar({"character": "can"}) <= cat.KIT_LIBRE
    assert {"item:casco", "item:gaita", "ropa:15", "hair:7", "gesto:ge__clapping"} <= set(cat.BLOQUEADAS_POR_DEFECTO)
    # La unicidad por hash no se resiente: sobran combinaciones libres para 15-40 jugadores.
    assert cat.combinaciones_libres(cat.BLOQUEADAS_POR_DEFECTO) > 10_000
    # Toda la propuesta inicial es válida y sólo da piezas bloqueadas.
    reglas, errores = reglas_mod.normalizar_reglas(reglas_mod.propuesta_de_reglas())
    assert not errores and all(set(r["da"]) <= set(cat.BLOQUEADAS_POR_DEFECTO) for r in reglas)


def test_las_reglas_son_de_tipos_cerrados():
    _, errores = reglas_mod.normalizar_reglas([
        {"id": "a", "cuando": {"tipo": "eval('x')"}, "da": ["item:casco"]},
        {"id": "b", "cuando": {"tipo": "nodo"}, "da": ["item:casco"]},
        {"id": "c", "cuando": {"tipo": "nodos", "n": 2}, "da": ["item:inventado"]},
        {"id": "d", "cuando": {"tipo": "km", "km": -1}, "da": ["item:casco"]},
    ])
    assert len(errores) == 4


def test_la_evaluacion_pura_por_id_rachas_mitad_y_final():
    nodo = lambda i, **kw: {"level": i, "node_id": f"n{i}", "es_minijuego": True, "perfecto": True, **kw}  # noqa: E731
    registros = [nodo(0), nodo(1), nodo(2, perfecto=False), nodo(3), nodo(4), nodo(5, manual=True, perfecto=False)]
    h = reglas_mod.hechos(registros, nivel=6, total_nodos=6)
    reglas = [
        {"id": "x", "cuando": {"tipo": "nodo", "nodo": "n4"}, "da": ["item:casco"]},
        {"id": "r2", "cuando": {"tipo": "racha_perfecta", "n": 2}, "da": ["ropa:15"]},
        {"id": "r3", "cuando": {"tipo": "racha_perfecta", "n": 3}, "da": ["ropa:14"]},
        {"id": "p4", "cuando": {"tipo": "minijuego_perfecto", "n": 4}, "da": ["gesto:ge__happy_hand_gesture"]},
        {"id": "m", "cuando": {"tipo": "mitad_mision"}, "da": ["item:sombrero"]},
        {"id": "f", "cuando": {"tipo": "final_mision"}, "da": ["item:bordon"]},
        {"id": "fl", "cuando": {"tipo": "final_sin_emergencia"}, "da": ["item:gaita"]},
        {"id": "g", "cuando": {"tipo": "regalo_admin"}, "da": ["ropa:16"]},
    ]
    assert {c["regla"] for c in reglas_mod.evaluar(h, reglas)} == {"x", "r2", "p4", "m", "f"}
    assert reglas_mod.progreso(h, reglas)["r3"] == {"actual": 2, "meta": 3}
    # Lo jugado en modo prueba no cuenta, y entonces tampoco hay «final».
    h_prueba = reglas_mod.hechos([nodo(0, prueba=True)], nivel=1, total_nodos=1)
    assert h_prueba["nodos"] == [] and h_prueba["terminada"] is False


# ---------------------------------------------------------------- interruptor apagado

def test_apagado_por_defecto_no_cambia_nada(sitio):
    estado = _mios(sitio)
    assert estado["activos"] is False and estado["bloqueados"] == [] and len(estado["libres"]) == len(cat.CLAVES)
    assert "desbloqueos" not in _advance(sitio, 0, time_spent_ms=1_000)
    r = sitio.post("/api/personaje", json={"user": UNO, "avatar": {"character": "vikingo", "parts": {"mx": "Ch31", "cabeza": "casco"}}})
    assert r.status_code == 200, "con el interruptor apagado se guarda cualquier pieza"
    assert _filas() == []
    # Y el paquete de la misión lleva el estado (para la tienda sin cobertura).
    assert sitio.get("/api/game/PLAYER%201").json()["desbloqueos"]["activos"] is False


# ---------------------------------------------------------------- conceder

def test_un_avance_con_red_concede_y_no_duplica(sitio):
    _activar(sitio, [{"id": "primero", "cuando": {"tipo": "primer_nodo"}, "da": ["gesto:ge__clapping"]}])

    respuesta = _advance(sitio, 0, time_spent_ms=1_000)
    assert respuesta["desbloqueos"] == ["gesto:ge__clapping"]
    assert "desbloqueos" not in _advance(sitio, 1, time_spent_ms=1_000), "ya lo tenía"

    estado = _mios(sitio)
    assert estado["mios"] == ["gesto:ge__clapping"] and estado["nuevos"] == ["gesto:ge__clapping"]
    assert "gesto:ge__clapping" in estado["bloqueados"]
    assert sitio.post("/api/desbloqueos/visto", json={"user": UNO, "claves": ["gesto:ge__clapping"]}).status_code == 200
    assert _mios(sitio)["nuevos"] == []


def test_la_cola_offline_concede_una_sola_vez_aunque_se_reenvie(sitio):
    _activar(sitio, [{"id": "tres", "cuando": {"tipo": "nodos", "n": 3}, "da": ["item:zocas"]}])
    eventos = [_completar(f"c-{i}", i) for i in range(3)]

    primera = _sync(sitio, eventos)
    assert primera[2]["desbloqueos"] == ["item:zocas"] and primera[0]["desbloqueos"] == []
    segunda = _sync(sitio, eventos)  # el móvil no recibió la respuesta y reintenta
    assert all(e["duplicate"] for e in segunda)
    assert [f["clave"] for f in _filas()] == ["item:zocas"]
    assert _mios(sitio)["progreso"]["tres"] == {"actual": 3, "meta": 3}


def test_la_regla_de_nodo_va_por_id_no_por_indice(sitio):
    _activar(sitio, [{"id": "cuenta", "cuando": {"tipo": "nodo", "nodo": "103"}, "da": ["item:casco"]}])
    _sync(sitio, [_completar("c-0", 0), _completar("c-1", 1)])
    assert _filas() == []
    # Se reordena la ruta: el 103 pasa a ser el tercero... sigue siendo el 103.
    _sync(sitio, [_completar("c-2", 2)])
    assert [f["clave"] for f in _filas()] == ["item:casco"]
    assert "Cuenta" in _mios(sitio)["pistas"]["item:casco"]


def test_guardar_una_pieza_no_ganada_da_409_bloqueado(sitio):
    _activar(sitio, [])
    casco = {"character": "vikingo", "parts": {"mx": "Ch31", "cabeza": "casco"}}
    r = sitio.post("/api/personaje", json={"user": UNO, "avatar": casco})
    assert r.status_code == 409 and r.json()["detail"] == "bloqueado" and r.json()["claves"] == ["item:casco"]
    # Lo libre se guarda sin problema (todos los personajes lo son).
    assert sitio.post("/api/personaje", json={"user": UNO, "avatar": {"character": "vikinga", "parts": {"mx": "Ch26"}}}).status_code == 200

    r = sitio.post("/api/admin/desbloqueos/conceder", json={"jugadores": [UNO], "claves": ["item:casco"], "motivo": "fiesta"})
    assert r.json()["concedidos"] == {UNO: ["item:casco"]}
    assert sitio.post("/api/personaje", json={"user": UNO, "avatar": casco}).status_code == 200


def test_con_sospecha_se_concede_igual_y_queda_marcado(sitio):
    _activar(sitio, [{"id": "dos", "cuando": {"tipo": "nodos", "n": 2}, "da": ["item:cesta"]}])
    _advance(sitio, 0, time_spent_ms=1_000)
    _advance(sitio, 1, time_spent_ms=40 * MIN)  # no cabe entre los dos avances: sospecha

    (fila,) = _filas()
    assert fila["clave"] == "item:cesta" and fila["sospecha"] == 1
    matriz = sitio.post("/api/admin/desbloqueables", json={}).json()["jugadores"]
    assert next(j for j in matriz if j["user"] == UNO)["piezas"]["item:cesta"]["sospecha"] is True


def test_en_modo_prueba_no_se_gana_nada(sitio):
    _activar(sitio, [{"id": "primero", "cuando": {"tipo": "primer_nodo"}, "da": ["gesto:ge__clapping"]}])
    # El latido con GPS manual (modo prueba) deja la marca de sesión manual.
    main.anti_cheat_note_manual_position(UNO, "manual")

    assert "desbloqueos" not in _advance(sitio, 0, time_spent_ms=1_000)
    assert _filas() == []
    assert main.load_player_timers()[UNO]["nodos"]["0"]["prueba"] is True
    # Y aunque luego vuelva al GPS real, lo hecho en prueba no cuenta.
    main.anti_cheat_note_manual_position(UNO, "player")
    assert main._desbloqueos_glue.desbloqueos_tras_evento(UNO, "x") == []


def test_la_primera_foto(sitio):
    _activar(sitio, [{"id": "foto", "cuando": {"tipo": "primera_foto"}, "da": ["gesto:ge__look_away_gesture"]}])
    main.append_event(main.EVENT_LOG_DB, {"type": "team_proof_created", "status": "synced", "source": "player",
                                          "user": UNO, "team_id": UNO, "payload": {"proof_id": "p1"}})
    # r16: «Mirar» se quitó; la regla guardada con él da su sustituto, «Por ahí».
    assert main.desbloqueos_tras_evento(UNO, "foto:p1") == ["gesto:ge__dismissing_gesture"]


def test_los_km_solo_cuentan_con_gps_real_y_a_paso_de_persona(sitio):
    _activar(sitio, [{"id": "km", "cuando": {"tipo": "km", "km": 0.2}, "da": ["ropa:9"]}])
    glue = main._desbloqueos_glue
    t = time.time()
    punto = lambda lat, **kw: {"lat": lat, "lon": -3.5, "accuracy": 8, "source": "player", **kw}  # noqa: E731
    # 0,0009° ≈ 100 m en 60 s: andando.
    glue.sumar_latido(UNO, punto(40.5), t - 300)
    assert glue.sumar_latido(UNO, punto(40.5009), t - 240) == []
    # Con GPS manual, con mala precisión o a 120 km/h, nada.
    glue.sumar_latido(UNO, punto(40.5018, source="manual"), t - 180)
    glue.sumar_latido(UNO, punto(40.5027, accuracy=80), t - 120)
    glue.sumar_latido(UNO, punto(40.5036), t - 117)
    assert store.metros(glue.db_path(), UNO) == 100
    # Sin cobertura: las muestras del rastro, con las mismas reglas.
    base = int(t * 1000)
    muestras = [{"t": base + i * 60_000, "lat": 40.5018 + i * 0.0009, "lon": -3.5, "acc": 6} for i in range(3)]
    _sync(sitio, [{"client_event_id": "trk-1", "type": "position_track", "payload": {"samples": muestras}}])
    assert store.metros(glue.db_path(), UNO) == 300
    assert "ropa:9" in _mios(sitio)["mios"]
    # La purga de datos personales se lleva los metros (rastro de movimiento), no lo ganado.
    from backend.app.runtime import purga_datos
    assert purga_datos.ejecutar(borrar_fotos=False, borrar_posiciones=True)["metros_andados"] == 1
    assert store.metros(glue.db_path(), UNO) == 0 and "ropa:9" in _mios(sitio)["mios"]


# ---------------------------------------------------------------- reglas nuevas y lo ya jugado

def test_una_regla_nueva_se_ensaya_y_se_aplica_a_lo_ya_jugado(sitio):
    _sync(sitio, [_completar(f"c-{i}", i) for i in range(3)])  # jugado con el sistema apagado
    regla = [{"id": "tres", "cuando": {"tipo": "nodos", "n": 3}, "da": ["item:zocas"]}]

    ensayo = sitio.post("/api/admin/desbloqueables/ensayar", json={"reglas": regla, "activar": True}).json()
    assert ensayo["concederia"][UNO]["claves"] == ["item:zocas"] and DOS not in ensayo["concederia"]
    assert _filas() == [], "ensayar no escribe nada"

    resultado = _activar(sitio, regla)
    assert resultado["concedidos"] == {UNO: ["item:zocas"]}

    # Otra regla más tarde, con «aplicar también a lo ya jugado».
    otra = regla + [{"id": "primero", "cuando": {"tipo": "primer_nodo"}, "da": ["gesto:ge__clapping"]}]
    assert _guardar(sitio, reglas=otra, aplicar_a_lo_jugado=True)["concedidos"] == {UNO: ["gesto:ge__clapping"]}


def test_la_revision_evita_pisar_otro_guardado_y_las_reglas_malas_dan_400(sitio):
    r = sitio.post("/api/admin/desbloqueables/guardar", json={"revision": 99, "activos": True})
    assert r.status_code == 409
    revision = sitio.post("/api/admin/desbloqueables", json={}).json()["config"]["revision"]
    r = sitio.post("/api/admin/desbloqueables/guardar",
                   json={"revision": revision, "reglas": [{"cuando": {"tipo": "magia"}, "da": ["item:casco"]}]})
    assert r.status_code == 400 and r.json()["errores"]


def test_activar_sustituye_lo_bloqueado_sin_legado_y_sin_repetir_combinacion(sitio):
    # Antes de activar: UNO lleva casco y tartán rojo. DOS lleva justo el
    # «equivalente» libre (boina y rojo teja): el cambio de UNO no puede caer ahí.
    _poner_avatar(UNO, {"mx": "Ch01", "top": 15, "cabeza": "casco"})
    _poner_avatar(DOS, {"mx": "Ch01", "top": 3, "cabeza": "boina"})

    ensayo = sitio.post("/api/admin/desbloqueables/ensayar", json={"activar": True}).json()
    (cambio,) = ensayo["sustituciones"]
    assert cambio["jugador"] == UNO and cambio["quita"] == ["item:casco", "ropa:15"]

    resultado = _activar(sitio, reglas_mod.propuesta_de_reglas())
    (hecho,) = resultado["sustituciones"]
    configs = pj.cargar_configs(main.PERSONAJES_DB)
    nuevo = configs[UNO]
    assert hecho["despues"] == nuevo
    assert not (cat.claves_de_avatar(nuevo) & set(cat.BLOQUEADAS_POR_DEFECTO)), "sin legado"
    assert nuevo["parts"]["cabeza"] == "boina" and nuevo["parts"]["mx"] == "Ch01"
    assert pj.hash_de_avatar(nuevo) != pj.hash_de_avatar(configs[DOS]), "unicidad respetada"
    (aviso,) = _mios(sitio)["avisos"]
    assert aviso["tipo"] == "sustituido" and "Casco vikingo" in aviso["texto"]
    assert sitio.post("/api/desbloqueos/visto", json={"user": UNO, "avisos": [aviso["id"]]}).json()["avisos"] == 1
    assert _mios(sitio)["avisos"] == []


def test_retirar_quita_la_pieza_puesta_y_el_sistema_no_la_devuelve(sitio):
    _activar(sitio, [{"id": "primero", "cuando": {"tipo": "primer_nodo"}, "da": ["item:casco"]}])
    _advance(sitio, 0, time_spent_ms=1_000)
    assert sitio.post("/api/personaje", json={"user": UNO, "avatar": {"character": "vikingo", "parts": {"mx": "Ch31", "cabeza": "casco"}}}).status_code == 200

    r = sitio.post("/api/admin/desbloqueos/retirar", json={"jugador": UNO, "clave": "item:casco", "motivo": "prueba"})
    assert r.json()["retirado"] is True and r.json()["avatar"]["parts"].get("cabeza") != "casco"
    assert "item:casco" not in _mios(sitio)["mios"]
    _advance(sitio, 1, time_spent_ms=1_000)  # la regla se sigue cumpliendo...
    assert "item:casco" not in _mios(sitio)["mios"], "...pero lo retirado sólo lo devuelve el organizador"
    sitio.post("/api/admin/desbloqueos/conceder", json={"jugadores": [UNO], "claves": ["item:casco"]})
    assert "item:casco" in _mios(sitio)["mios"]
    acciones = [e["accion"] for e in sitio.post("/api/admin/desbloqueables", json={}).json()["eventos"]]
    assert acciones[:3] == ["concedido", "retirado", "concedido"]


def test_cambiar_el_catalogo_desde_el_panel(sitio):
    _activar(sitio, [])
    bloqueados = [c for c in cat.BLOQUEADAS_POR_DEFECTO if c != "item:casco"] + ["mx:Ch01"]
    _guardar(sitio, bloqueados=bloqueados)
    estado = _mios(sitio)
    assert "item:casco" in estado["libres"] and "mx:Ch01" in estado["libres"], "un personaje no se bloquea nunca"
    panel = sitio.post("/api/admin/desbloqueables", json={}).json()
    gaita = next(p for p in panel["catalogo"] if p["clave"] == "item:gaita")
    assert gaita["libre"] is False and gaita["sin_regla"] is True
    assert panel["combinaciones_libres"] > 0 and panel["tipos"] and panel["propuesta"]


def test_el_estado_va_en_el_paquete_de_la_mision_y_pide_sesion(sitio):
    _activar(sitio, [{"id": "primero", "cuando": {"tipo": "primer_nodo"}, "da": ["gesto:ge__clapping"]}])
    _advance(sitio, 0, time_spent_ms=1_000)
    paquete = sitio.get("/api/game/PLAYER%201?offline_pack=true").json()["desbloqueos"]
    assert paquete["activos"] is True and paquete["mios"] == ["gesto:ge__clapping"]
    assert paquete["reglas"][0]["texto"] == "Completa tu primer nodo"
    extrano = TestClient(main.app)
    assert extrano.get("/api/desbloqueos/PLAYER%201").status_code == 403
    assert _cliente_de(DOS).get("/api/desbloqueos/PLAYER%201").status_code == 403, "cada uno sólo ve lo suyo"
