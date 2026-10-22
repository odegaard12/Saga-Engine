# -*- coding: utf-8 -*-
"""Revisión de seguridad del 22/10/2026.

1. Las puertas sin sesión (login del panel, clave de misión, PIN) leen 4 KB como mucho, y una escritura a
   /api/admin sin sesión es un 403 ANTES de leer el cuerpo (antes: hasta 64 MB leídos y parseados).
2. Un cuerpo `chunked` (sin `Content-Length`) se corta al pasar el tope, no se lee entero.
3. /player/{nombre} sin la clave de misión no reparte pase ni dice qué nombres existen.
4. La clave de misión se bloquea por dispositivo; por IP sólo hay un techo alto.
"""
import asyncio
import os
import tempfile

os.environ.setdefault("ADMIN_PASS", "pytest_admin_password")
os.environ.setdefault("SAGA_DATA_DIR", tempfile.mkdtemp(prefix="saga-test-revision-22-10-"))

import pytest  # noqa: E402
from fastapi import HTTPException  # noqa: E402
from fastapi.testclient import TestClient  # noqa: E402
from starlette.requests import Request  # noqa: E402

import main  # noqa: E402
from backend.app.runtime import entradas  # noqa: E402
from backend.app.runtime import pines_jugador  # noqa: E402

USUARIO = "PLAYER 1"
CLAVE = "clave-de-prueba-22"


@pytest.fixture
def preparar(monkeypatch, tmp_path):
    # PBKDF2 corto: la clave de misión se guarda con estas vueltas y se comprueba con las guardadas.
    real_hash = main.admin_auth_security.hash_password
    monkeypatch.setattr(
        main.admin_auth_security,
        "hash_password",
        lambda password, salt=None, iterations=1000: real_hash(password, salt=salt, iterations=iterations),
    )
    monkeypatch.setattr(main, "MISSION_AUTH_DB", str(tmp_path / "mission_auth.json"))
    # La clave de misión se guarda en SQLite: una base propia, para que otra prueba en paralelo que la quite o la
    # cambie (comparten SAGA_SQLITE_DB si alguna lo fija) no abra la puerta a mitad de esta.
    monkeypatch.setenv("SAGA_SQLITE_DB", str(tmp_path / "saga.sqlite3"))
    monkeypatch.setenv("SECRET_KEY", "test-secret-key")
    monkeypatch.setattr(main, "PLAYER_PINS_DB", str(tmp_path / "player_pins.json"))
    monkeypatch.setattr(main, "CLAVE_TEMPORAL", "")
    monkeypatch.setattr(main, "MISSION_UNLOCK_ATTEMPTS", {})
    monkeypatch.setattr(pines_jugador, "INTENTOS", {})
    monkeypatch.delenv("SAGA_ALLOW_LEGACY_ADMIN_PASSWORD_PAYLOAD", raising=False)
    return monkeypatch


def _troceado(total, trozo=1024):
    """Un cuerpo sin `Content-Length`: httpx lo manda `Transfer-Encoding: chunked`."""
    def generar():
        enviado = 0
        while enviado < total:
            yield b"x" * trozo
            enviado += trozo
    return generar()


# ---------------------------------------------------------------------------
# 1. Puertas sin sesión y escrituras del panel
# ---------------------------------------------------------------------------

def _espiar_parseo(monkeypatch):
    parseados = []
    real = entradas.cargar_json
    monkeypatch.setattr(entradas, "cargar_json", lambda crudo: parseados.append(len(crudo)) or real(crudo))
    comprobadas = []
    monkeypatch.setattr(main, "verify_admin_password", lambda password: comprobadas.append(1) or False)
    return parseados, comprobadas


def test_login_de_admin_con_mas_de_4_kb_da_413_sin_parsear(preparar):
    parseados, comprobadas = _espiar_parseo(preparar)
    cliente = TestClient(main.app)
    grande = '{"password": "%s"}' % ("a" * 5000)

    declarado = cliente.post("/api/admin/login", content=grande, headers={"Content-Type": "application/json"})
    troceado = cliente.post("/api/admin/login", content=_troceado(8 * 1024), headers={"Content-Type": "application/json"})

    assert declarado.status_code == 413
    assert troceado.status_code == 413
    assert parseados == [] and comprobadas == []


def test_escritura_al_panel_sin_sesion_da_403_sin_leer_el_cuerpo(preparar):
    leidos = []
    real = entradas.leer_cuerpo_json

    async def espia(request, **kw):
        leidos.append(request.url.path)
        return await real(request, **kw)

    preparar.setattr(entradas, "leer_cuerpo_json", espia)
    cliente = TestClient(main.app)

    for ruta in ("/api/admin/save", "/api/admin/stages", "/api/admin/change-password"):
        r = cliente.post(ruta, json={"stages": []})
        assert r.status_code == 403, ruta
    assert leidos == []

    # Con sesión de panel la ruta sí lo lee (y decide ella).
    preparar.setattr(main, "verify_admin_session_token", lambda token: token == "sesion-buena")
    cliente.cookies.set(main.ADMIN_SESSION_COOKIE, "sesion-buena")
    preparar.setattr(main, "admin_password_change_required", lambda: True)
    cliente.post("/api/admin/stages", json={})
    assert leidos == ["/api/admin/stages"]


def test_modo_antiguo_de_contrasena_en_el_cuerpo_sigue_decidiendo_la_ruta(preparar):
    preparar.setenv("SAGA_ALLOW_LEGACY_ADMIN_PASSWORD_PAYLOAD", "1")
    leidos = []
    real = entradas.leer_cuerpo_json

    async def espia(request, **kw):
        leidos.append(request.url.path)
        return await real(request, **kw)

    preparar.setattr(entradas, "leer_cuerpo_json", espia)
    preparar.setattr(main, "verify_admin_password", lambda password: False)
    r = TestClient(main.app).post("/api/admin/stages", json={"password": "no"})
    assert r.status_code == 403 and leidos == ["/api/admin/stages"]


def test_login_y_logout_no_piden_sesion(preparar):
    preparar.setattr(main, "verify_admin_password", lambda password: False)
    cliente = TestClient(main.app)
    assert cliente.post("/api/admin/login", json={"password": "no"}).status_code == 401
    assert cliente.post("/api/admin/logout").status_code == 200
    main.ADMIN_LOGIN_ATTEMPTS.clear()


# ---------------------------------------------------------------------------
# 2. Cuerpos sin longitud declarada
# ---------------------------------------------------------------------------

def _peticion_troceada(path, trozos, leidos):
    pendientes = list(trozos)

    async def receive():
        if pendientes:
            leidos.append(1)
            trozo = pendientes.pop(0)
            return {"type": "http.request", "body": trozo, "more_body": bool(pendientes)}
        return {"type": "http.request", "body": b"", "more_body": False}

    scope = {
        "type": "http",
        "method": "POST",
        "scheme": "http",
        "server": ("testserver", 80),
        "path": path,
        "root_path": "",
        "query_string": b"",
        "headers": [(b"transfer-encoding", b"chunked"), (b"content-type", b"application/json")],
    }
    return Request(scope, receive)


def test_leer_cuerpo_json_corta_un_chunked_grande_sin_leerlo_entero():
    leidos = []
    trozos = [b"x" * (64 * 1024)] * 100  # 6,4 MB contra el tope del jugador (2 MB)
    peticion = _peticion_troceada("/api/advance", trozos, leidos)

    with pytest.raises(HTTPException) as error:
        asyncio.run(entradas.leer_cuerpo_json(peticion))

    assert error.value.status_code == 413
    assert len(leidos) < len(trozos) // 2


def test_las_puertas_y_los_registros_cortan_el_chunked(preparar):
    cliente = TestClient(main.app)
    cabeceras = {"Content-Type": "application/json"}
    assert cliente.post("/api/jugador/entrar", content=_troceado(16 * 1024), headers=cabeceras).status_code == 413
    main.clear_player_rate_limits()
    assert cliente.post("/api/client-errors", content=_troceado(64 * 1024), headers=cabeceras).status_code == 413


# ---------------------------------------------------------------------------
# 3. /player/{nombre} sin la clave
# ---------------------------------------------------------------------------

def test_la_portada_del_jugador_sin_clave_no_da_pase_ni_distingue_nombres(preparar):
    main.set_mission_password(CLAVE)
    assert main.resolve_known_player_profile(USUARIO)
    cliente = TestClient(main.app)

    existe = cliente.get(f"/player/{USUARIO}")
    no_existe = cliente.get("/player/NADIE-ASI-123")
    assert existe.headers.get("set-cookie") is None
    assert no_existe.headers.get("set-cookie") is None
    assert existe.status_code == no_existe.status_code
    assert main.PLAYER_SESSION_COOKIE not in cliente.cookies

    # Con la misión abierta, la misma dirección (la puerta recarga) deja el pase.
    assert cliente.post("/api/mission/unlock", json={"password": CLAVE}).status_code == 200
    cliente.get(f"/player/{USUARIO}")
    assert main.PLAYER_SESSION_COOKIE in cliente.cookies


# ---------------------------------------------------------------------------
# 4. Bloqueo de la clave por dispositivo, techo por IP
# ---------------------------------------------------------------------------

def test_los_fallos_de_un_dispositivo_no_bloquean_a_otro_con_la_misma_ip(preparar):
    main.set_mission_password(CLAVE)
    despistado = TestClient(main.app)
    codigos = [
        despistado.post("/api/mission/unlock", json={"password": "mal"}).status_code
        for _ in range(main.MISSION_UNLOCK_MAX_ATTEMPTS + 1)
    ]
    assert codigos[:-1] == [403] * main.MISSION_UNLOCK_MAX_ATTEMPTS and codigos[-1] == 429
    assert main.MISSION_DEVICE_COOKIE in despistado.cookies

    # Otro móvil detrás de la misma IP entra con la clave buena.
    otro = TestClient(main.app)
    assert otro.post("/api/mission/unlock", json={"password": CLAVE}).status_code == 200
    # Y el despistado sigue bloqueado aunque ahora la acierte.
    assert despistado.post("/api/mission/unlock", json={"password": CLAVE}).status_code == 429


def test_el_techo_por_ip_frena_al_que_cambia_de_marca(preparar):
    main.set_mission_password(CLAVE)
    preparar.setattr(main, "MISSION_UNLOCK_IP_MAX_ATTEMPTS", 8)

    # Un bot que tira la cookie en cada intento: cada vez es un «dispositivo nuevo».
    for _ in range(8):
        assert TestClient(main.app).post("/api/mission/unlock", json={"password": "mal"}).status_code == 403
    bloqueado = TestClient(main.app).post("/api/mission/unlock", json={"password": CLAVE})
    assert bloqueado.status_code == 429
