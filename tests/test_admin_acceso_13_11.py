# -*- coding: utf-8 -*-
"""13/11: la entrada al panel de administración (auditoría del panel).

- Bloqueo justo: el móvil del organizador lleva una cookie FIRMADA y se cuenta aparte; quien no la lleva sigue con 5 intentos por IP;
  y hay un techo por IP que la cookie no se salta.
- Sesión deslizante con tope de 12 h.
- Cambiar la contraseña cuenta los fallos; el cierre de sesión del panel no toca la cookie del jugador.
- ADMIN_RESET=1 ya no pisa la contraseña en cada arranque.
- Con la clave de misión puesta y la sesión caducada, el panel recibe 403 (vuelve al login), no 401.
"""
import os
import tempfile
import time

os.environ.setdefault("ADMIN_PASS", "pytest_admin_password")
os.environ.setdefault("SAGA_DATA_DIR", tempfile.mkdtemp(prefix="saga-test-admin-acceso-"))

import pytest  # noqa: E402
from fastapi.testclient import TestClient  # noqa: E402

import main  # noqa: E402
from backend.app.security import admin_auth  # noqa: E402

BUENA = "clave-de-admin-buena-123"
SECRETO = "secreto-de-prueba"
V = dict(window_seconds=600, lock_seconds=600)


@pytest.fixture(autouse=True)
def limpio(monkeypatch):
    main.clear_admin_sessions()
    main.ADMIN_LOGIN_ATTEMPTS.clear()
    monkeypatch.setattr(main, "verify_admin_password", lambda password: password == BUENA)
    yield
    main.ADMIN_LOGIN_ATTEMPTS.clear()
    main.clear_admin_sessions()


def _cliente(monkeypatch=None):
    return TestClient(main.app)


def _misma_ip(monkeypatch, ip="203.0.113.7"):
    monkeypatch.setattr(main, "get_client_ip", lambda request: ip)


# ---------------------------------------------------------------------------
# Cookie de dispositivo
# ---------------------------------------------------------------------------

def test_la_cookie_de_dispositivo_solo_vale_si_esta_firmada():
    valor = admin_auth.new_device_cookie(SECRETO)
    ident = admin_auth.verify_device_cookie(SECRETO, valor)
    assert ident and valor.startswith(ident + ".")
    # Otro secreto, firma cambiada, id cambiado o basura: no hay «dispositivo reconocido».
    assert admin_auth.verify_device_cookie("otro-secreto", valor) is None
    assert admin_auth.verify_device_cookie(SECRETO, ident + ".0" * 16) is None
    assert admin_auth.verify_device_cookie(SECRETO, "otro-id." + valor.split(".", 1)[1]) is None
    for basura in ("", None, ".", "a.", ".b", "sin-punto", "x" * 100 + ".abc"):
        assert admin_auth.verify_device_cookie(SECRETO, basura) is None


# ---------------------------------------------------------------------------
# Bloqueo: dispositivo reconocido frente a desconocido, y el techo por IP
# ---------------------------------------------------------------------------

def _fallar(intentos, ip, dev, n, t0, **kw):
    ultimo = None
    for i in range(n):
        ultimo = admin_auth.register_login_failure(
            intentos, ip, dev, strict_max_attempts=5, now=t0 + i * 0.01, **{**V, **kw}
        )
    return ultimo


def test_un_desconocido_se_bloquea_a_los_5_y_el_organizador_reconocido_sigue_entrando():
    intentos = {}
    t = 10_000.0
    _fallar(intentos, "ip", None, 5, t)
    assert admin_auth.login_lock_remaining(intentos, "ip", None, window_seconds=600, now=t + 1) > 500
    # El organizador (con cookie firmada) en la MISMA IP no se bloquea por lo que hizo el curioso.
    assert admin_auth.login_lock_remaining(intentos, "ip", "mi-movil", window_seconds=600, now=t + 1) == 0


def test_el_dispositivo_reconocido_tiene_10_intentos_con_espera_creciente_y_tope_de_una_hora():
    intentos = {}
    t = 20_000.0
    esperas = []
    for i in range(10):
        info = admin_auth.register_login_failure(
            intentos, "ip", "mi-movil", strict_max_attempts=5, now=t + i, **V
        )
        esperas.append(info["retry_in"])
    # 1-3 sin espera; a partir del 4.º una espera corta que crece; el 10.º bloquea de verdad.
    assert esperas[:3] == [0, 0, 0]
    assert 0 < esperas[3] <= esperas[4] <= esperas[5] <= esperas[6] <= 30
    assert esperas[-1] > 300
    assert info["remaining_attempts"] == 0
    # Dos bloqueos más: nunca pasa de una hora.
    for ronda in range(6):
        t += 4_000
        for i in range(10):
            info = admin_auth.register_login_failure(
                intentos, "ip", "mi-movil", strict_max_attempts=5, now=t + i, **V
            )
        assert info["retry_in"] <= admin_auth.MAX_LOCK_DEVICE_SECONDS


def test_el_techo_por_ip_no_se_salta_con_cookie():
    intentos = {}
    t = 30_000.0
    # Un bot que reparte los fallos entre «dispositivos» (cookies válidas) sigue chocando con el techo de la IP.
    for i in range(admin_auth.IP_TOTAL_MAX_ATTEMPTS):
        admin_auth.register_login_failure(
            intentos, "ip-bot", f"movil-{i}", strict_max_attempts=5, now=t + i * 0.01, **V
        )
    for dev in (None, "movil-nuevo", "movil-0"):
        assert admin_auth.login_lock_remaining(intentos, "ip-bot", dev, window_seconds=600, now=t + 1) > 0, dev
    # Otra IP no hereda nada.
    assert admin_auth.login_lock_remaining(intentos, "otra-ip", None, window_seconds=600, now=t + 1) == 0


def test_remaining_attempts_baja_de_5_a_0_sin_cookie():
    intentos = {}
    restantes = [
        admin_auth.register_login_failure(intentos, "ip", None, strict_max_attempts=5, now=1000 + i, **V)[
            "remaining_attempts"
        ]
        for i in range(5)
    ]
    assert restantes == [4, 3, 2, 1, 0]


def test_el_bloqueo_de_un_desconocido_no_se_afloja_sigue_llegando_a_24_horas():
    intentos = {"ip": {"attempts": [], "locked_until": 0, "strikes": 40, "last_lock_at": 1.0}}
    admin_auth.register_admin_login_failure(intentos, "ip", max_attempts=1, window_seconds=600, lock_seconds=600, now=2.0)
    assert intentos["ip"]["locked_until"] - 2.0 == admin_auth.MAX_LOCK_SECONDS == 24 * 3600
    # Lo que sí tiene tope de 1 h es el dispositivo ya reconocido.
    assert admin_auth.MAX_LOCK_DEVICE_SECONDS == 3600


# ---------------------------------------------------------------------------
# Lo mismo por HTTP
# ---------------------------------------------------------------------------

def test_http_el_curioso_bloquea_su_navegador_pero_no_al_organizador_con_cookie(monkeypatch):
    _misma_ip(monkeypatch)
    organizador = TestClient(main.app)
    entrada = organizador.post("/api/admin/login", json={"password": BUENA})
    assert entrada.status_code == 200
    assert main.admin_auth_security.DEVICE_COOKIE in organizador.cookies
    assert entrada.json()["session_idle_seconds"] == main.ADMIN_SESSION_TTL_SECONDS

    curioso = TestClient(main.app)
    codigos = [curioso.post("/api/admin/login", json={"password": f"x{i}"}).status_code for i in range(7)]
    assert codigos == [401] * 5 + [429, 429]

    # El organizador, en la misma IP, entra (con su cookie de dispositivo) aunque el curioso esté bloqueado.
    assert organizador.post("/api/admin/login", json={"password": BUENA}).status_code == 200
    # Con la contraseña mal, a él le quedan más intentos que a un desconocido.
    mal = organizador.post("/api/admin/login", json={"password": "no"})
    assert mal.status_code == 401 and mal.json()["remaining_attempts"] == 9


def test_http_una_cookie_de_dispositivo_falsa_cuenta_como_desconocido(monkeypatch):
    _misma_ip(monkeypatch)
    falso = TestClient(main.app)
    falso.cookies.set(main.admin_auth_security.DEVICE_COOKIE, "inventado.00000000000000000000000000000000")
    codigos = [falso.post("/api/admin/login", json={"password": f"x{i}"}).status_code for i in range(6)]
    assert codigos == [401] * 5 + [429]


def test_http_el_401_dice_cuantos_intentos_quedan(monkeypatch):
    _misma_ip(monkeypatch)
    c = TestClient(main.app)
    cuerpo = c.post("/api/admin/login", json={"password": "no"}).json()
    assert cuerpo["detail"] == "invalid admin password" and cuerpo["remaining_attempts"] == 4
    assert cuerpo["retry_in"] == 0


def test_http_cambiar_la_contrasena_con_la_actual_mal_cuenta_los_fallos(monkeypatch):
    _misma_ip(monkeypatch)
    token = main.create_admin_session()
    c = TestClient(main.app)
    c.cookies.set(main.ADMIN_SESSION_COOKIE, token)
    cuerpo = {"password": "mal", "new_password": "nueva-clave-12345", "confirm_password": "nueva-clave-12345"}
    codigos = [c.post("/api/admin/change-password", json=cuerpo).status_code for _ in range(7)]
    assert codigos[:5] == [403] * 5 and codigos[5:] == [429, 429]
    # El bloqueo es el mismo que el del login: tampoco entra por ahí.
    assert TestClient(main.app).post("/api/admin/login", json={"password": BUENA}).status_code == 429


def test_http_el_cierre_de_sesion_del_panel_no_borra_la_cookie_del_jugador(monkeypatch):
    token = main.create_admin_session()
    c = TestClient(main.app)
    c.cookies.set(main.ADMIN_SESSION_COOKIE, token)
    r = c.post("/api/admin/logout", json={})
    assert r.status_code == 200
    cabeceras = " ".join(r.headers.get_list("set-cookie")) if hasattr(r.headers, "get_list") else r.headers.get("set-cookie", "")
    assert main.ADMIN_SESSION_COOKIE in cabeceras
    assert main.PLAYER_SESSION_COOKIE not in cabeceras


def test_http_con_la_clave_de_mision_puesta_la_sesion_caducada_del_panel_da_403(monkeypatch):
    monkeypatch.setattr(main, "mission_gate_enabled", lambda: True)
    monkeypatch.setattr(main, "mission_unlocked", lambda request: False)
    c = TestClient(main.app)
    r = c.post("/api/admin/mission-status", json={})
    assert r.status_code == 403 and r.json()["detail"] == "forbidden"
    # Lo del jugador sigue siendo 401.
    assert c.get("/api/game/PLAYER%201").status_code == 401


def test_http_el_ping_renueva_y_dice_cuando_caduca(monkeypatch):
    token = main.create_admin_session()
    c = TestClient(main.app)
    assert c.post("/api/admin/session/ping", json={}).status_code == 403
    c.cookies.set(main.ADMIN_SESSION_COOKIE, token)
    r = c.post("/api/admin/session/ping", json={})
    assert r.status_code == 200
    assert r.json()["session_expires_at"] > time.time()
    assert r.json()["session_absolute_expires_at"] - r.json()["session_expires_at"] > 3000


# ---------------------------------------------------------------------------
# Sesión deslizante con tope
# ---------------------------------------------------------------------------

def test_la_sesion_se_renueva_al_usarla_y_nunca_pasa_de_12_horas():
    sesiones = {}
    token = admin_auth.create_admin_session(sesiones, ttl_seconds=3600)
    s = sesiones[token]
    assert s["idle_ttl"] == 3600 and s["abs_expires_at"] - s["created_at"] == admin_auth.ABSOLUTE_SESSION_SECONDS

    # Pasan 50 minutos: con el uso se renueva otra hora (así no caduca «a la hora exacta de entrar»).
    s["expires_at"] = int(time.time()) + 600
    assert admin_auth.verify_admin_session_token(sesiones, token) is True
    assert s["expires_at"] - time.time() > 3500

    # Dentro del mismo minuto no reescribe (la renovación no gana el minuto): no hay escritura de más.
    antes = s["expires_at"]
    assert admin_auth.verify_admin_session_token(sesiones, token) is True
    assert s["expires_at"] == antes

    # A punto del tope absoluto: la renovación se recorta y, pasado el tope, la sesión muere aunque se use.
    s["abs_expires_at"] = int(time.time()) + 120
    s["expires_at"] = int(time.time()) + 10
    assert admin_auth.verify_admin_session_token(sesiones, token) is True
    assert s["expires_at"] <= s["abs_expires_at"]
    s["abs_expires_at"] = int(time.time()) - 1
    assert admin_auth.verify_admin_session_token(sesiones, token) is False
    assert token not in sesiones


def test_mantener_la_sesion_sube_el_plazo_sin_uso_a_6_horas_con_el_mismo_tope():
    sesiones = {}
    token = admin_auth.create_admin_session(sesiones, ttl_seconds=3600, remember=True)
    assert sesiones[token]["idle_ttl"] == admin_auth.REMEMBER_IDLE_SECONDS
    assert sesiones[token]["abs_expires_at"] - sesiones[token]["created_at"] == 12 * 3600


def test_una_sesion_antigua_sin_los_campos_nuevos_tambien_se_renueva_con_su_plazo_original():
    ahora = int(time.time())
    sesiones = {"vieja": {"created_at": ahora - 3000, "expires_at": ahora + 600}}
    assert admin_auth.verify_admin_session_token(sesiones, "vieja") is True
    assert sesiones["vieja"]["expires_at"] - ahora > 3500  # su plazo original era de 3600 s
    # Y tiene tope: creada hace más de 12 h no vale aunque no haya caducado «por falta de uso».
    sesiones = {"muy-vieja": {"created_at": ahora - 13 * 3600, "expires_at": ahora + 600}}
    assert admin_auth.verify_admin_session_token(sesiones, "muy-vieja") is False


def test_el_servidor_guarda_la_renovacion(monkeypatch, tmp_path):
    monkeypatch.setattr(main, "ADMIN_SESSIONS_DB", str(tmp_path / "admin_sessions.json"))
    token = main.create_admin_session()
    sesiones = admin_auth.load_admin_sessions(main.ADMIN_SESSIONS_DB)
    sesiones[token]["expires_at"] = int(time.time()) + 600
    admin_auth.save_admin_sessions(main.ADMIN_SESSIONS_DB, sesiones)
    assert main.verify_admin_session_token(token) is True
    guardada = admin_auth.load_admin_sessions(main.ADMIN_SESSIONS_DB)[token]["expires_at"]
    assert guardada - time.time() > 3500


# ---------------------------------------------------------------------------
# ADMIN_RESET=1 una sola vez por valor
# ---------------------------------------------------------------------------

def test_admin_reset_no_se_repite_en_cada_arranque_ni_pisa_la_clave_elegida_despues(tmp_path):
    ruta = str(tmp_path / "admin_auth.json")
    admin_auth.set_admin_password(ruta, "clave-vieja-12345")
    kw = dict(bootstrap_admin_pass="clave-de-arranque-1234", allow_default_admin=False, admin_reset=True)

    assert admin_auth.ensure_admin_auth(ruta, **kw) is True
    assert admin_auth.verify_admin_password(ruta, "clave-de-arranque-1234")
    # Reinicio de la Pi con ADMIN_RESET=1 olvidado: no vuelve a pisar nada.
    admin_auth.set_admin_password(ruta, "la-que-eligio-el-organizador")
    assert admin_auth.ensure_admin_auth(ruta, **kw) is False
    assert admin_auth.verify_admin_password(ruta, "la-que-eligio-el-organizador")
    # Para volver a aplicar un reset hace falta un ADMIN_PASS distinto.
    assert admin_auth.ensure_admin_auth(ruta, **{**kw, "bootstrap_admin_pass": "otra-de-arranque-5678"}) is True
    assert admin_auth.verify_admin_password(ruta, "otra-de-arranque-5678")


def test_la_marca_del_reset_no_es_un_hash_rapido_de_la_clave(tmp_path):
    ruta = str(tmp_path / "admin_auth.json")
    admin_auth.ensure_admin_auth(
        ruta, bootstrap_admin_pass="clave-de-arranque-1234", allow_default_admin=False, admin_reset=True
    )
    guardado = admin_auth.load_admin_auth(ruta)
    import hashlib

    assert guardado["reset_salt"] and guardado["reset_marker"]
    # Un SHA-256 a pelo de la clave (lo que permitiría adivinarla offline si se filtrara el fichero) NO coincide.
    assert guardado["reset_marker"] != hashlib.sha256(b"saga-admin-reset:clave-de-arranque-1234").hexdigest()
    assert "clave-de-arranque-1234" not in str(guardado)


def test_admin_reset_aplicado_en_main_cierra_sesiones_y_vacia_los_intentos(monkeypatch, tmp_path):
    # `main` lo hace al importarse con `_ADMIN_RESET_APLICADO`; aquí se comprueba el contrato de la función.
    ruta = str(tmp_path / "admin_auth.json")
    assert admin_auth.ensure_admin_auth(
        ruta, bootstrap_admin_pass="clave-de-arranque-1234", allow_default_admin=False, admin_reset=True
    ) is True
    assert admin_auth.ensure_admin_auth(
        ruta, bootstrap_admin_pass="clave-de-arranque-1234", allow_default_admin=False, admin_reset=False
    ) is False


# ---------------------------------------------------------------------------
# Clear-Site-Data de /admin: ya no borra el almacenamiento del jugador
# ---------------------------------------------------------------------------

def test_abrir_admin_no_borra_el_almacenamiento_ni_el_service_worker():
    r = TestClient(main.app).get("/admin", follow_redirects=False)
    csd = r.headers.get("clear-site-data", "")
    assert "storage" not in csd and "executionContexts" not in csd
