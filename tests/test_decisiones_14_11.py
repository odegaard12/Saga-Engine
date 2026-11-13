# -*- coding: utf-8 -*-
"""14/11: las cuatro decisiones de juego de Óscar.

1. Salir de la app (llamada, aviso): el umbral pasa de 1,5 a 6 s y la primera salida de un nodo no se manda como
   sospecha (sigue costando +30 s y rehaciendo el reto); la segunda sí.
2. Punto de control con el GPS denegado o roto: «He llegado» sigue sirviendo pero cobra lo mismo que el código de respaldo
   del nodo, queda como modo alternativo y el servidor impone el mismo precio.
3. Mosaico: «Mezclar» (y reintentar tras quedarse sin movimientos) suma la penalización por fallo del juego.
4. Abrir la PWA instalada entra directo en el jugador recordado si el servidor dice que hay sesión válida.
"""
import json
import os
import re
import shutil
import subprocess
import tempfile
from pathlib import Path

os.environ.setdefault("ADMIN_PASS", "pytest_admin_password")
os.environ.setdefault("SAGA_DATA_DIR", tempfile.mkdtemp(prefix="saga-test-decisiones-"))

import pytest  # noqa: E402
from fastapi import FastAPI  # noqa: E402
from fastapi.testclient import TestClient  # noqa: E402

import main  # noqa: E402
from backend.app.routers import game as game_router  # noqa: E402
from backend.app.routers import public as public_router  # noqa: E402
from backend.app.runtime import proximidad  # noqa: E402
from backend.app.storage.json_store import save_json  # noqa: E402
from backend.app.storage.runtime_store import save_stages  # noqa: E402

RAIZ = Path(__file__).resolve().parent.parent
FRONT = RAIZ / "frontend" / "src"


def _sin_comentarios(ruta: Path) -> str:
    t = ruta.read_text(encoding="utf-8")
    t = re.sub(r"/\*.*?\*/", "", t, flags=re.DOTALL)
    return re.sub(r"(?m)//.*$", "", t)


@pytest.fixture(scope="module")
def js():
    node = shutil.which("node")
    if not node or not (RAIZ / "frontend" / "node_modules" / "typescript").exists():
        pytest.skip("sin Node o sin dependencias del frontend")
    r = subprocess.run([node, str(RAIZ / "tests" / "js" / "decisiones_14_11.cjs")], capture_output=True, text=True,
                       timeout=120, cwd=RAIZ, encoding="utf-8")
    assert r.returncode == 0, r.stderr[-2000:]
    return json.loads(r.stdout)


# ------------------------------------------------------------------ 1. salidas de la app

def test_salida_de_5_segundos_no_cuenta_y_de_7_si(js):
    s = js["salidas"]
    assert s["minimaMs"] == 6000
    assert s["de5s"] is False and s["de5999"] is False
    assert s["de6000"] is True and s["de7s"] is True
    # La salida larga sigue costando lo de siempre.
    assert s["penalizacionMs"] == 30_000


def test_la_sospecha_solo_se_manda_desde_la_segunda_salida(js):
    assert js["salidas"]["sospecha"] == [False, True, True, True]
    # 7 s (cuenta), 4 s (no cuenta), 8 s (cuenta): dos salidas, la primera sin sospecha y la segunda con ella.
    assert js["dosSalidas"] == {"cuentan": 2, "reportadas": [False, True]}


def test_el_cableado_de_las_salidas():
    hoja = _sin_comentarios(FRONT / "player" / "components" / "InteractionSheet.tsx")
    assert "debeReportarSospecha(yaReportados + i)" in hoja
    # Lo que cuesta (+30 s y reto nuevo) no cambia: la penalización sigue saliendo de `antiTrampas.penalizacionMs`.
    assert "antiTrampas.penalizacionMs" in hoja
    # El patrón se rehace con la misma regla de 6 s (antes se rehacía al ocultarse, sin mirar cuánto).
    regenerar = _sin_comentarios(FRONT / "player" / "minigames" / "core" / "useRegenerarAoOcultar.ts")
    assert "SALIDA_MINIMA_MS" in regenerar and "fuera >= SALIDA_MINIMA_MS" in regenerar


def test_el_radar_devuelve_el_tiempo_de_una_salida_corta(js):
    r = js["radar"]
    assert r["corta3s"] == 103_000 and r["justoMenos"] == 105_999
    # Desde 6 s ya cuenta como salida (+30 s y reto nuevo): no se compensa. Nada de tiempos negativos.
    assert r["larga6s"] == r["larga20s"] == r["sinTiempo"] == r["relojAtras"] == 100_000


# ------------------------------------------------------------------ 2. punto de control sin GPS

LAT, LON = 40.400, -3.700


@pytest.fixture(autouse=True)
def _cobrar_sin_gps(monkeypatch):
    # tests/conftest.py lo apaga para el resto de la suite; aquí es justo lo que se prueba.
    monkeypatch.setattr(main, "COBRAR_CHECKPOINT_SIN_GPS", True)


@pytest.fixture
def cliente(monkeypatch):
    monkeypatch.setattr(main, "EXIGIR_ENTRADA_PARA_OK", False)
    monkeypatch.setattr(main, "require_player_session", lambda *a, **k: None)
    monkeypatch.setattr(main, "enforce_player_rate_limit", lambda *a, **k: None)
    monkeypatch.setattr(main, "resolve_known_player_profile", lambda u, cfg=None: {"id": u, "display_name": u})
    save_stages(
        main.STAGES_DB,
        [
            {"id": "p0", "title": "Punto 0", "type": "checkpoint", "lat": LAT, "lon": LON, "radius": 40, "entry_mode": "gps"},
            {"id": "p1", "title": "Punto 1", "type": "checkpoint", "lat": LAT, "lon": LON + 0.01, "radius": 40, "entry_mode": "gps"},
        ],
    )
    app = FastAPI()
    app.include_router(game_router.router)
    return TestClient(app)


def _nuevo(usuario):
    save_json(main.ANTI_CHEAT_DB, {})
    save_json(main.MANUAL_POSITION_NOTICE_DB, {})
    main.clear_all_player_timers(usuario)
    main.set_player_progress_level(usuario, 0)
    main.clear_live_position(usuario)
    return usuario


def _penalizado(usuario):
    return int(main.load_player_timers().get(usuario, {}).get("penalties_ms") or 0)


def _avanzar(cliente, usuario, penalty_ms=0, evidencia=None):
    cuerpo = {"user": usuario, "code": "OK", "level_before": 0, "time_spent_ms": 20_000, "penalty_ms": penalty_ms,
              "evidence": evidencia if evidencia is not None else {"v": 1, "abierto_ms": 1}}
    return cliente.post("/api/advance", json=cuerpo).json()


def test_unidad_el_servidor_cobra_el_precio_de_respaldo_si_no_hay_gps():
    nodo = {"id": "p0", "type": "checkpoint"}
    sin_gps = {"veredicto": proximidad.SIN_GPS}
    respaldo = main.penalizacion_de_respaldo_ms("p0")
    assert respaldo >= 60_000
    assert main.penalizacion_checkpoint_sin_gps(0, nodo, sin_gps) == respaldo
    # El móvil ya mandó más: se respeta (`max`, no suma: nunca se cobra dos veces).
    assert main.penalizacion_checkpoint_sin_gps(respaldo + 5_000, nodo, sin_gps) == respaldo + 5_000
    assert main.penalizacion_checkpoint_sin_gps(None, nodo, sin_gps) == respaldo


def test_el_interruptor_lo_apaga_solo_para_las_pruebas(monkeypatch):
    monkeypatch.setattr(main, "COBRAR_CHECKPOINT_SIN_GPS", False)
    nodo = {"id": "p0", "type": "checkpoint"}
    assert main.penalizacion_checkpoint_sin_gps(0, nodo, {"veredicto": proximidad.SIN_GPS}) == 0
    assert main.COBRAR_CHECKPOINT_SIN_GPS is False  # el valor de producción es True (ver main.py)
    src = (RAIZ / "main.py").read_text(encoding="utf-8")
    assert re.search(r"(?m)^COBRAR_CHECKPOINT_SIN_GPS = True$", src)


def test_unidad_solo_paga_un_punto_de_control_sin_gps():
    nodo = {"id": "p0", "type": "checkpoint"}
    # Con GPS (cerca o lejos), en modo prueba o sin proximidad que comprobar: nada que cobrar.
    for veredicto in (proximidad.CERCA, proximidad.LEJOS, proximidad.MODO_PRUEBA, proximidad.NO_APLICA):
        assert main.penalizacion_checkpoint_sin_gps(0, nodo, {"veredicto": veredicto}) == 0
    # Un minijuego sin GPS no es un punto de control: sigue como antes.
    minijuego = {"id": "m0", "type": "signal_hunt", "config": {"game_id": "spark_radar"}}
    assert main.penalizacion_checkpoint_sin_gps(0, minijuego, {"veredicto": proximidad.SIN_GPS}) == 0
    assert main.penalizacion_checkpoint_sin_gps(7, None, {"veredicto": proximidad.SIN_GPS}) == 7
    assert main.penalizacion_checkpoint_sin_gps(7, nodo, None) == 7


def test_en_linea_llegar_sin_gps_a_un_punto_de_control_no_sale_gratis(cliente):
    """Mandar `penalty_ms: 0` y sin muestras de GPS no esquiva el precio del nodo."""
    u = _nuevo("PuntoSinGps")
    r = _avanzar(cliente, u, penalty_ms=0)
    assert r["status"] == "ok" and r["level"] == 1, r
    assert _penalizado(u) >= main.penalizacion_de_respaldo_ms("p0")


def test_en_linea_con_gps_cerca_no_se_cobra_nada(cliente):
    import time

    u = _nuevo("PuntoConGps")
    muestra = {"t": int(time.time() * 1000), "lat": LAT + 0.0002, "lon": LON, "acc": 10, "src": "real"}
    r = _avanzar(cliente, u, penalty_ms=0, evidencia={"v": 1, "abierto_ms": 1, "gps": [muestra]})
    assert r["status"] == "ok"
    assert _penalizado(u) == 0


def test_por_la_cola_tambien_se_cobra(cliente):
    import time

    u = _nuevo("PuntoCola")
    evento = {
        "type": "node_completed", "client_event_id": "cp-sin-gps-1",
        "payload": {"local_created_at": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()), "code": "OK",
                    "level_before": 0, "time_spent_ms": 20_000, "evidence": {"v": 1, "abierto_ms": 1}},
    }
    r = cliente.post("/api/events/sync", json={"user": u, "events": [evento]}).json()["events"]
    assert r[0]["status"] == "synced", r
    assert _penalizado(u) >= main.penalizacion_de_respaldo_ms("p0")


def test_el_cliente_ensena_el_coste_y_marca_el_modo_alternativo():
    c = _sin_comentarios(FRONT / "player" / "minigames" / "families" / "signalHunt" / "CheckpointRuntimeScreen.tsx")
    assert "const sinGps = requireProximity && hasSource && gpsBroken && !inRange" in c
    assert "penalizacionDeRespaldo(stage)" in c
    assert "marcarModoAlternativo(stage?.id" in c
    assert "onWin(sinGps ? costeSinGps : undefined)" in c
    # Antes de pulsar: el texto con el coste y el botón con «+1m».
    assert "t.sinGpsCuesta(duracionLegible(costeSinGps))" in c
    assert "t.heLlegadoSinGps(textoDePenalizacion(costeSinGps))" in c
    textos = (FRONT / "player" / "minigames" / "core" / "textos.ts").read_text(encoding="utf-8")
    assert textos.count("sinGpsCuesta:") == 2 and textos.count("heLlegadoSinGps:") == 2  # es y gl


# ------------------------------------------------------------------ 3. mosaico

def test_mezclar_suma_la_penalizacion_por_fallo():
    c = _sin_comentarios(FRONT / "player" / "minigames" / "families" / "placeMosaic" / "RuntimeScreen.tsx")
    # Un único acumulador: el mismo que ya cobraba la pregunta final, y el que viaja con la victoria.
    assert "function mezclarConCoste(conVistaPrevia: boolean)" in c
    assert "sumarPenalizacion()" in c
    assert c.count("onClick={() => mezclarConCoste(") == 2  # «Mezclar» y «Intentarlo de nuevo»
    assert "onClick={() => reset(false)}" not in c
    assert "onWin(penaltyPreguntaRef.current || undefined)" in c
    # Visible: el botón dice cuánto suma y la prueba enseña el total.
    assert "{costeEnSegundos}" in c and "t.penalizacionTotal(" in c
    # Salir de la app NO pasa por aquí (lo cobra el antitrampas): el regenerado sigue siendo `reset(true)`.
    assert "useRegenerarAoOcultar(phase === 'preview' || phase === 'playing', () => reset(true))" in c


def test_el_fallo_de_la_pregunta_y_mezclar_usan_el_mismo_precio():
    c = _sin_comentarios(FRONT / "player" / "minigames" / "families" / "placeMosaic" / "RuntimeScreen.tsx")
    # 30 s por defecto o el `penalty_ms` del nodo (con 0, el organizador lo quiso gratis y no se cobra).
    assert "Number.isFinite(rawPenaltyMs) && rawPenaltyMs >= 0 ? rawPenaltyMs : 30_000" in c
    assert "if (penaltyPorFalloMs <= 0) return" in c
    assert "penaltyPreguntaRef.current += penaltyPorFalloMs" in c


# ------------------------------------------------------------------ 4. PWA que abre en tu perfil

def test_la_portada_solo_intenta_entrar_directo_cuando_toca(js):
    p = js["recordado"]["posible"]
    assert p["portada"] is True and p["portadaPlayer"] is True
    # Sin recordado, con PIN en la dirección, con «cambiar» o en otra ruta: la portada de siempre.
    assert not any(p[k] for k in ("sinRecordado", "conPin", "conCambiar", "enOtraRuta", "enAdmin"))
    assert js["recordado"]["leido"] == "Ana" and js["recordado"]["trasOlvidar"] is None


def test_se_comprueba_con_el_servidor_y_no_solo_con_el_almacenamiento(js):
    s = js["recordado"]["sesion"]
    assert s["valida"] == "valida"
    assert s["sin401"] == s["sin403"] == s["sin404"] == "invalida"
    assert s["servidorCaido"] == s["redCaida"] == s["tiempoAgotado"] == "sin-red"
    assert js["recordado"]["pedida"] == {"url": "/api/jugador/sesion?user=Ana%20L%C3%B3pez", "cache": "no-store"}


def test_sin_red_solo_entra_si_el_movil_trae_su_partida(js):
    r = js["recordado"]
    assert r["datosSinRed"] == {"ana": True, "luis": False, "otro": False}
    assert r["decision"] == {"valida": "entrar", "invalidaConDatos": "lista", "sinRedConDatos": "entrar", "sinRedSinDatos": "lista"}


def test_el_cableado_de_la_portada_y_de_cambiar_de_jugador():
    login = _sin_comentarios(FRONT / "login" / "LoginApp.tsx")
    assert "comprobarSesionDelJugador(recordado)" in login
    assert "const datos = estado === 'sin-red' ? await tieneDatosSinRed(recordado) : false" in login
    assert "decidirEntrada(estado, datos) === 'entrar'" in login
    # Mientras se comprueba no se pinta la lista (ningún nombre ajeno) y hay un «No soy yo» visible.
    assert "if (entrandoDirecto || state.status === 'idle' || state.status === 'loading')" in login
    assert "loginText(getLoginLocale()).noSoyYo" in login and "olvidarJugadorRecordado()" in login
    hud = _sin_comentarios(FRONT / "player" / "components" / "PlayerHud.tsx")
    # Se navega con assign (no con href tras cerrar la hoja: su history.go(-1) cancelaba la navegación; ver
    # tests/test_cambiar_jugador_14_11.py).
    assert "olvidarJugadorRecordado()" in hud and "window.location.assign('/player/?cambiar=1')" in hud


class _Perfiles:
    pass


@pytest.fixture
def cliente_sesion(monkeypatch):
    monkeypatch.setattr(main, "resolve_known_player_profile", lambda u, cfg=None: {"id": u, "display_name": u} if u in ("Ana", "Luis") else None)
    app = FastAPI()
    app.include_router(public_router.router)
    return TestClient(app)


def test_servidor_sin_sesion_o_con_otro_jugador_da_403(cliente_sesion):
    assert cliente_sesion.get("/api/jugador/sesion", params={"user": "Ana"}).status_code == 403
    r = cliente_sesion.get("/api/jugador/sesion", params={"user": "Nadie"})
    assert r.status_code == 403 and r.json()["detail"] == "unknown player"
    assert cliente_sesion.get("/api/jugador/sesion").status_code == 403


def test_servidor_con_la_cookie_del_jugador_da_200_y_solo_para_el_suyo(cliente_sesion):
    entrar = cliente_sesion.post("/api/jugador/entrar", json={"user": "Ana"})
    assert entrar.status_code == 200, entrar.text
    r = cliente_sesion.get("/api/jugador/sesion", params={"user": "Ana"})
    assert r.status_code == 200 and r.json() == {"status": "ok", "user": "Ana"}
    assert r.headers.get("cache-control") == "no-store"
    # La sesión es de Ana: con ella no se «entra» como Luis.
    assert cliente_sesion.get("/api/jugador/sesion", params={"user": "Luis"}).status_code == 403
