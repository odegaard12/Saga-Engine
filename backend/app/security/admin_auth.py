"""Admin authentication helpers.

This module keeps password hashing, admin sessions, legacy payload compatibility
and login lockout logic outside main.py.
"""

from __future__ import annotations

import hashlib
import hmac
import os
import secrets
import time
from typing import Any

from backend.app.storage.runtime_store import load_document, save_document
from backend.app.security.peticiones import es_https as _es_https


#: Tope del bloqueo progresivo de quien NO lleva la cookie de dispositivo (un desconocido): sigue en 24 h.
MAX_LOCK_SECONDS = 24 * 3600
#: Tope del bloqueo de un DISPOSITIVO ya reconocido (el del organizador): nunca más de una hora.
MAX_LOCK_DEVICE_SECONDS = 3600
#: Fallos por dispositivo reconocido en la ventana antes del bloqueo (los desconocidos siguen con 5, `main`).
DEVICE_MAX_ATTEMPTS = 10
#: Fallos por IP, con o sin cookie de dispositivo: el techo que la cookie NO se salta (frena a un bot que reparte
#: intentos; alto para que una wifi compartida entre 14 móviles no se bloquee sola).
IP_TOTAL_MAX_ATTEMPTS = 60
#: Cookie firmada que se pone al entrar bien: el servidor reconoce el móvil del organizador y le cuenta aparte.
DEVICE_COOKIE = "saga_admin_dev"
DEVICE_COOKIE_TTL_SECONDS = 90 * 24 * 3600
#: Sesión del panel: se renueva al usarla, pero nunca pasa de 12 h desde que se abrió.
ABSOLUTE_SESSION_SECONDS = 12 * 3600
#: Con «Mantener la sesión»: hasta 6 h sin usarla (sin la casilla, `ADMIN_SESSION_TTL_SECONDS`, 1 h).
REMEMBER_IDLE_SECONDS = 6 * 3600
#: La renovación se escribe en SQLite como mucho una vez por minuto.
RENEW_WRITE_EVERY_SECONDS = 60
#: Cuánto se recuerdan los bloqueos de una IP para el bloqueo progresivo.
STRIKE_MEMORY_SECONDS = 24 * 3600


def now_ts() -> int:
    return int(time.time())


def hash_password(password: str, salt: str | None = None, iterations: int = 200000) -> dict[str, Any]:
    salt = salt or secrets.token_hex(16)
    dk = hashlib.pbkdf2_hmac(
        "sha256",
        str(password or "").encode("utf-8"),
        salt.encode("utf-8"),
        iterations,
    )
    return {
        "salt": salt,
        "password_hash": dk.hex(),
        "iterations": iterations,
    }


def load_admin_auth(path: str) -> dict[str, Any]:
    data = load_document(path, 'admin_auth', {})
    return data if isinstance(data, dict) else {}


def save_admin_auth(path: str, data: dict[str, Any]) -> None:
    save_document(path, 'admin_auth', data)


def load_admin_sessions(path: str) -> dict[str, dict[str, Any]]:
    data = load_document(path, "admin_sessions", {})
    return data if isinstance(data, dict) else {}


def save_admin_sessions(path: str, sessions: dict[str, dict[str, Any]]) -> None:
    safe_sessions = sessions if isinstance(sessions, dict) else {}
    save_document(path, "admin_sessions", safe_sessions)


def verify_admin_password(path: str, password: str | None) -> bool:
    auth = load_admin_auth(path)
    salt = auth.get("salt")
    expected = auth.get("password_hash")
    iterations = int(auth.get("iterations") or 200000)

    if not salt or not expected:
        return False

    dk = hashlib.pbkdf2_hmac(
        "sha256",
        str(password or "").encode("utf-8"),
        str(salt).encode("utf-8"),
        iterations,
    ).hex()

    return hmac.compare_digest(dk, str(expected))


def is_weak_admin_password(password: str | None) -> bool:
    p = str(password or "").strip()
    weak = {
        "",
        "CHANGE_ME",
        "admin",
        "password",
        "12345678",
    }
    return len(p) < 10 or p in weak


def reset_marker(password: str, salt: str | None = None) -> dict[str, str]:
    """Marca (con sal y PBKDF2, como la contraseña) de la clave de arranque con la que ya se aplicó `ADMIN_RESET=1`."""
    salt = salt or secrets.token_hex(16)
    marca = hashlib.pbkdf2_hmac(
        "sha256", ("saga-admin-reset:" + str(password or "")).encode("utf-8"), salt.encode("utf-8"), 100_000
    ).hex()
    return {"reset_salt": salt, "reset_marker": marca}


def set_admin_password(
    path: str,
    password: str,
    *,
    must_change: bool = False,
    source: str = "manual",
    marker: dict[str, str] | None = None,
) -> dict[str, Any]:
    data = hash_password(password)
    anterior = load_admin_auth(path)
    auth = {
        "salt": data["salt"],
        "password_hash": data["password_hash"],
        "iterations": data["iterations"],
        "must_change": bool(must_change),
        "source": source,
    }
    # La marca del último reset sobrevive al cambio de contraseña: con ADMIN_RESET=1 olvidado en el entorno, un
    # reinicio de la Pi (apagón) ya no pisa la contraseña que el organizador eligió después.
    marca = marker or (
        {"reset_salt": anterior["reset_salt"], "reset_marker": anterior["reset_marker"]}
        if anterior.get("reset_marker") and anterior.get("reset_salt")
        else None
    )
    if marca:
        auth.update(marca)
    save_admin_auth(path, auth)
    return auth


def admin_password_change_required(path: str) -> bool:
    auth = load_admin_auth(path)
    return bool(auth.get("must_change"))


def ensure_admin_auth(
    path: str,
    *,
    bootstrap_admin_pass: str,
    allow_default_admin: bool = False,
    admin_reset: bool = False,
) -> bool:
    """Deja lista la contraseña del panel. Devuelve True si acaba de APLICAR un reset (`ADMIN_RESET=1`):
    quien llama cierra entonces las sesiones abiertas y vacía los intentos de login."""
    auth = load_admin_auth(path)
    bootstrap_admin_pass = str(bootstrap_admin_pass or "").strip()

    if admin_reset:
        if not bootstrap_admin_pass:
            raise RuntimeError("ADMIN_RESET=1 requires ADMIN_PASS.")
        ya = auth.get("reset_marker") and auth.get("reset_salt")
        if (
            auth.get("password_hash")
            and ya
            and hmac.compare_digest(
                reset_marker(bootstrap_admin_pass, str(auth["reset_salt"]))["reset_marker"], str(auth["reset_marker"])
            )
        ):
            # Ya aplicado con este mismo valor: no se repite en cada arranque (docs/security/admin-auth.md).
            print("[INFO] ADMIN_RESET=1 ya se aplicó con este ADMIN_PASS: quita ADMIN_RESET del entorno.")
            return False
        set_admin_password(
            path,
            bootstrap_admin_pass,
            must_change=is_weak_admin_password(bootstrap_admin_pass),
            source="reset",
            marker=reset_marker(bootstrap_admin_pass),
        )
        print("[WARN] Admin password reset from environment. Quita ADMIN_RESET=1 del entorno.")
        return True

    if auth.get("password_hash") and auth.get("salt"):
        return False

    if bootstrap_admin_pass:
        set_admin_password(
            path,
            bootstrap_admin_pass,
            must_change=is_weak_admin_password(bootstrap_admin_pass),
            source="bootstrap",
        )
        print("[INFO] Admin password initialized from ADMIN_PASS.")
        return False

    if allow_default_admin:
        set_admin_password(path, "CHANGE_ME", must_change=True, source="fallback")
        print("[WARN] ADMIN_PASS not set. Using development fallback CHANGE_ME because ALLOW_DEFAULT_ADMIN=1")
        return False

    raise RuntimeError("ADMIN_PASS is required. Set ADMIN_PASS, or enable ALLOW_DEFAULT_ADMIN=1 only for local development.")


def prune_admin_sessions(sessions: dict[str, dict[str, Any]], now: int | None = None) -> None:
    now = int(now or now_ts())
    expired = [
        token
        for token, session in sessions.items()
        if int(session.get("expires_at") or 0) <= now
    ]
    for token in expired:
        sessions.pop(token, None)


def create_admin_session(sessions: dict[str, dict[str, Any]], ttl_seconds: int, *, remember: bool = False) -> str:
    """Sesión nueva. `ttl_seconds` es lo que aguanta SIN USARLA (se renueva con cada petición válida, ver
    `verify_admin_session_token`); con `remember` ese plazo sube a 6 h. Nunca pasa de 12 h desde que se abrió."""
    prune_admin_sessions(sessions)
    token = secrets.token_urlsafe(32)
    now = now_ts()
    idle = max(int(ttl_seconds), REMEMBER_IDLE_SECONDS) if remember else int(ttl_seconds)
    sessions[token] = {
        "created_at": now,
        "expires_at": now + min(idle, ABSOLUTE_SESSION_SECONDS),
        "idle_ttl": idle,
        "abs_expires_at": now + ABSOLUTE_SESSION_SECONDS,
    }
    return token


def create_persistent_admin_session(path: str, ttl_seconds: int) -> str:
    sessions = load_admin_sessions(path)
    token = create_admin_session(sessions, ttl_seconds)
    save_admin_sessions(path, sessions)
    return token


def verify_admin_session_token(
    sessions: dict[str, dict[str, Any]],
    token: str | None,
) -> bool:
    token = str(token or "").strip()
    if not token:
        return False

    prune_admin_sessions(sessions)
    session = sessions.get(token)
    if not session:
        return False

    ahora = now_ts()
    if int(session.get("expires_at") or 0) <= ahora:
        sessions.pop(token, None)
        return False

    # Sesión deslizante con tope: cada uso la renueva (el llamador la guarda si cambió: `expires_at` sólo se mueve
    # cuando la renovación gana al menos un minuto, para no escribir SQLite en cada petición) y jamás pasa de 12 h.
    creada = int(session.get("created_at") or ahora)
    tope = int(session.get("abs_expires_at") or (creada + ABSOLUTE_SESSION_SECONDS))
    if tope <= ahora:
        sessions.pop(token, None)
        return False
    actual = int(session.get("expires_at") or 0)
    idle = int(session.get("idle_ttl") or max(0, actual - creada))
    nueva = min(ahora + idle, tope)
    if nueva - actual >= RENEW_WRITE_EVERY_SECONDS:
        session["expires_at"] = nueva

    return True


def verify_persistent_admin_session_token(path: str, token: str | None) -> bool:
    sessions = load_admin_sessions(path)
    valid = verify_admin_session_token(sessions, token)
    save_admin_sessions(path, sessions)
    return valid


def clear_persistent_admin_session(path: str, token: str | None) -> None:
    sessions = load_admin_sessions(path)
    raw = str(token or "").strip()
    if raw:
        sessions.pop(raw, None)
    save_admin_sessions(path, sessions)


def clear_all_admin_sessions(path: str) -> None:
    save_admin_sessions(path, {})


def invalidate_other_admin_sessions(path: str, keep_token: str | None) -> int:
    """Cierra todas las sesiones de administración menos la de `keep_token`.

    Al cambiar la contraseña, quien la cambia sigue dentro pero cualquier otra
    sesión abierta (un portátil olvidado, alguien que la conocía) deja de valer:
    antes seguían válidas hasta que caducaban (caza de fallos A15). Devuelve
    cuántas cerró.
    """
    sesiones = load_admin_sessions(path)
    conservar = str(keep_token or "").strip()
    quedan = {token: datos for token, datos in sesiones.items() if conservar and token == conservar}
    if len(quedan) != len(sesiones):
        save_admin_sessions(path, quedan)
    return len(sesiones) - len(quedan)


def _firma_de_dispositivo(secret: str, device_id: str) -> str:
    return hmac.new(
        str(secret).encode("utf-8"), ("saga-admin-dev:" + device_id).encode("utf-8"), hashlib.sha256
    ).hexdigest()[:32]


def new_device_cookie(secret: str) -> str:
    """Valor de `saga_admin_dev`: un id aleatorio con su firma. Sin la firma (el secreto es del servidor) un atacante
    no puede fabricarse un «dispositivo reconocido» para saltarse el límite de 5 intentos."""
    device_id = secrets.token_urlsafe(16)
    return f"{device_id}.{_firma_de_dispositivo(secret, device_id)}"


def verify_device_cookie(secret: str, value: str | None) -> str | None:
    """El id del dispositivo si la cookie es auténtica; None si falta o está manipulada."""
    texto = str(value or "").strip()
    device_id, _, firma = texto.partition(".")
    if not device_id or not firma or len(device_id) > 64:
        return None
    if not hmac.compare_digest(_firma_de_dispositivo(secret, device_id), firma):
        return None
    return device_id


def set_device_cookie(response, request, value: str) -> None:
    response.set_cookie(DEVICE_COOKIE, value, **admin_cookie_settings(request, DEVICE_COOKIE_TTL_SECONDS))


def admin_cookie_settings(request, ttl_seconds: int) -> dict[str, Any]:
    secure = _es_https(request)
    return {
        "httponly": True,
        "samesite": "lax",
        "secure": secure,
        "path": "/",
        "max_age": int(ttl_seconds),
    }


def set_admin_session_cookie(response, request, token: str, ttl_seconds: int) -> None:
    response.set_cookie(
        "saga_admin_session",
        token,
        **admin_cookie_settings(request, ttl_seconds),
    )


def clear_admin_session_cookie(response, request) -> None:
    response.delete_cookie(
        "saga_admin_session",
        path="/",
        secure=_es_https(request),
        httponly=True,
        samesite="lax",
    )


def get_admin_password_from_payload(data: Any) -> str:
    if not isinstance(data, dict):
        return ""

    for key in ("password", "admin_password", "admin_pass", "admin_key", "key"):
        value = data.get(key)
        if value:
            return str(value)

    return ""


def legacy_admin_password_payload_enabled() -> bool:
    return (os.getenv("SAGA_ALLOW_LEGACY_ADMIN_PASSWORD_PAYLOAD") or "0").strip() == "1"


def admin_request_authorized(
    request,
    data: Any = None,
    *,
    auth_path: str,
    sessions: dict[str, dict[str, Any]],
) -> bool:
    cookie_token = request.cookies.get("saga_admin_session")
    if verify_admin_session_token(sessions, cookie_token):
        return True

    if not legacy_admin_password_payload_enabled():
        return False

    return verify_admin_password(auth_path, get_admin_password_from_payload(data or {}))


def prune_admin_login_attempts(
    attempts_by_ip: dict[str, dict[str, Any]],
    *,
    window_seconds: int,
    now: float | None = None,
) -> None:
    now = now or time.time()
    stale_keys = []

    for ip, state in attempts_by_ip.items():
        locked_until = float(state.get("locked_until") or 0)
        attempts = [
            ts for ts in state.get("attempts", [])
            if now - ts <= window_seconds
        ]
        # El historial de bloqueos (bloqueo progresivo) se olvida a las 24 h.
        if now - float(state.get("last_lock_at") or 0) > STRIKE_MEMORY_SECONDS:
            state["strikes"] = 0

        if locked_until <= now and not attempts and not int(state.get("strikes") or 0):
            stale_keys.append(ip)
        else:
            state["attempts"] = attempts
            if locked_until <= now:
                state["locked_until"] = 0

    for ip in stale_keys:
        attempts_by_ip.pop(ip, None)


def get_admin_login_state(
    attempts_by_ip: dict[str, dict[str, Any]],
    ip: str,
    *,
    window_seconds: int,
    now: float | None = None,
) -> dict[str, Any]:
    now = now or time.time()
    prune_admin_login_attempts(attempts_by_ip, window_seconds=window_seconds, now=now)

    state = attempts_by_ip.setdefault(ip, {"attempts": [], "locked_until": 0})
    state["attempts"] = [
        ts for ts in state.get("attempts", [])
        if now - ts <= window_seconds
    ]

    if float(state.get("locked_until") or 0) <= now:
        state["locked_until"] = 0

    return state


def clear_admin_login_state(attempts_by_ip: dict[str, dict[str, Any]], ip: str) -> None:
    attempts_by_ip.pop(ip, None)


def register_admin_login_failure(
    attempts_by_ip: dict[str, dict[str, Any]],
    ip: str,
    *,
    max_attempts: int,
    window_seconds: int,
    lock_seconds: int,
    now: float | None = None,
    max_lock_seconds: int | None = None,
) -> dict[str, Any]:
    now = now or time.time()
    state = get_admin_login_state(
        attempts_by_ip,
        ip,
        window_seconds=window_seconds,
        now=now,
    )
    state["attempts"].append(now)

    if len(state["attempts"]) >= max_attempts:
        # Bloqueo PROGRESIVO: cada bloqueo de esta IP en las últimas 24 h dobla
        # el siguiente (10 min, 20, 40... hasta 24 h). Con un tope fijo, un
        # atacante paciente probaba 5 claves cada 10 min para siempre: 720 al
        # día contra una contraseña única por entorno.
        strikes = int(state.get("strikes") or 0)
        espera = min(int(max_lock_seconds or MAX_LOCK_SECONDS), int(lock_seconds) * (2 ** min(strikes, 16)))
        state["locked_until"] = now + espera
        state["strikes"] = strikes + 1
        state["last_lock_at"] = now
        # Cada bloqueo empieza una tanda nueva de intentos.
        state["attempts"] = []

    return state


def get_admin_lock_remaining_seconds(
    attempts_by_ip: dict[str, dict[str, Any]],
    ip: str,
    *,
    window_seconds: int,
    now: float | None = None,
) -> int:
    now = now or time.time()
    state = get_admin_login_state(
        attempts_by_ip,
        ip,
        window_seconds=window_seconds,
        now=now,
    )
    locked_until = float(state.get("locked_until") or 0)
    return max(0, int(locked_until - now))


# ---------------------------------------------------------------------------
# Login del panel: bloqueo por DISPOSITIVO reconocido + techo por IP (13/11)
#
# Antes todo se contaba por IP: en la wifi del grupo (14 jugadores, una sola IP) o con datos móviles (CGNAT),
# cualquiera que probara cinco claves en /admin dejaba fuera al organizador, y el bloqueo se doblaba hasta 24 h.
# Ahora el móvil que ya entró bien lleva una cookie firmada (`saga_admin_dev`): sus fallos se cuentan aparte
# (10, con una espera corta creciente antes del bloqueo y tope de 1 h). Quien NO la lleva sigue con 5 intentos por
# IP y bloqueo progresivo (tope 6 h). Y hay un techo por IP que la cookie no se salta: IP_TOTAL_MAX_ATTEMPTS.
# ---------------------------------------------------------------------------

def _clave_total(ip: str) -> str:
    return "tot:" + ip


def _clave_dispositivo(device_id: str) -> str:
    return "dev:" + device_id


def login_lock_remaining(
    attempts: dict[str, dict[str, Any]],
    ip: str,
    device_id: str | None,
    *,
    window_seconds: int,
    now: float | None = None,
) -> int:
    """Segundos de bloqueo que aplican a este intento: el mayor entre el techo de la IP y, según haya cookie de
    dispositivo reconocida o no, el del dispositivo o el de la IP a secas."""
    now = now or time.time()
    claves = [_clave_total(ip), _clave_dispositivo(device_id) if device_id else ip]
    return max(
        get_admin_lock_remaining_seconds(attempts, clave, window_seconds=window_seconds, now=now)
        for clave in claves
    )


def register_login_failure(
    attempts: dict[str, dict[str, Any]],
    ip: str,
    device_id: str | None,
    *,
    strict_max_attempts: int,
    window_seconds: int,
    lock_seconds: int,
    now: float | None = None,
) -> dict[str, Any]:
    """Apunta un fallo de login. Devuelve `remaining_attempts` (los que quedan antes del bloqueo) y
    `retry_in` (segundos de espera si este fallo ya deja bloqueado)."""
    now = now or time.time()
    register_admin_login_failure(
        attempts, _clave_total(ip),
        max_attempts=IP_TOTAL_MAX_ATTEMPTS, window_seconds=window_seconds, lock_seconds=lock_seconds, now=now,
    )
    if device_id:
        clave = _clave_dispositivo(device_id)
        maximo = DEVICE_MAX_ATTEMPTS
        estado = register_admin_login_failure(
            attempts, clave,
            max_attempts=maximo, window_seconds=window_seconds, lock_seconds=lock_seconds, now=now,
            max_lock_seconds=MAX_LOCK_DEVICE_SECONDS,
        )
        hechos = len(estado["attempts"])
        # Retardo creciente (1, 2, 4... hasta 30 s) a partir del 4.º fallo, antes del bloqueo de verdad.
        if hechos >= 4:
            estado["locked_until"] = max(float(estado.get("locked_until") or 0), now + min(30, 2 ** (hechos - 4)))
    else:
        clave = ip
        maximo = int(strict_max_attempts)
        estado = register_admin_login_failure(
            attempts, clave,
            max_attempts=maximo, window_seconds=window_seconds, lock_seconds=lock_seconds, now=now,
        )
        hechos = len(estado["attempts"])
    # Con 0 intentos apuntados el fallo acaba de BLOQUEAR (cada bloqueo empieza una tanda nueva): no queda ninguno.
    restantes = 0 if hechos == 0 else max(0, maximo - hechos)
    espera = login_lock_remaining(attempts, ip, device_id, window_seconds=window_seconds, now=now)
    return {"remaining_attempts": restantes, "retry_in": espera}


def clear_login_success(attempts: dict[str, dict[str, Any]], ip: str, device_id: str | None) -> None:
    """Entró bien: se olvidan los fallos de este dispositivo y los de la IP a secas (no el techo de la IP)."""
    attempts.pop(ip, None)
    if device_id:
        attempts.pop(_clave_dispositivo(device_id), None)
