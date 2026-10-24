"""Clave de la misión (cookie y bloqueo por intentos): el estado vive en `main`.

Sacado de `main.py` sin cambiar comportamiento. Todo lo que estas funciones usan
de `main` se pide como `main.NOMBRE` en el momento de la llamada (igual que hacen
los routers), de modo que lo que un test o el arranque cambie en `main` --rutas de
fichero, funciones sustituidas-- sigue mandando. `main` re-exporta estos nombres.
"""
from fastapi import Request, Response
from backend.app.security.peticiones import es_https as _es_https
import hashlib
import hmac
import re
import secrets
import time


def load_mission_auth():
    import main
    data = main.load_document(main.MISSION_AUTH_DB, "mission_auth", {})
    return data if isinstance(data, dict) else {}


def save_mission_auth(data):
    import main
    main.save_document(main.MISSION_AUTH_DB, "mission_auth", data if isinstance(data, dict) else {})


def mission_gate_enabled():
    import main
    auth = main.load_mission_auth()
    return bool(auth.get("password_hash") and auth.get("salt"))


def set_mission_password(password):
    """Cambia la clave de misión. Cadena vacía = quita la puerta."""
    import main
    value = str(password or "").strip()
    if not value:
        main.save_mission_auth({})
        return False
    hashed = main.admin_auth_security.hash_password(value)
    main.save_mission_auth(
        {
            "salt": hashed["salt"],
            "password_hash": hashed["password_hash"],
            "iterations": hashed["iterations"],
        }
    )
    return True


def ensure_mission_auth():
    """Semilla desde el entorno la primera vez; después manda el panel.

    Con `SAGA_CLAVE_TEMPORAL` (auditoría 15/10) manda el entorno en cada arranque: si la guardada no es esa, se
    cambia (y caen las sesiones viejas, que van atadas al hash).
    """
    import main
    temporal = getattr(main, "CLAVE_TEMPORAL", "")
    if temporal:
        if not (main.mission_gate_enabled() and main.check_mission_password(temporal)):
            main.set_mission_password(temporal)
            print("[INFO] Mission password set from SAGA_CLAVE_TEMPORAL.")
        return
    if main.MISSION_PASS and not main.mission_gate_enabled():
        main.set_mission_password(main.MISSION_PASS)
        print("[INFO] Mission password initialized from MISSION_PASS.")


def _mission_cookie_value():
    """Marcador firmado. No lleva la contraseña; y va atado al hash de la clave
    actual, así cambiarla en el panel invalida las cookies antiguas."""
    import main
    auth = main.load_mission_auth()
    rotacion = str(auth.get("password_hash") or "sin-clave")
    return hmac.new(
        main.get_session_signing_secret().encode("utf-8"),
        ("mission-ok:" + rotacion).encode("utf-8"),
        hashlib.sha256,
    ).hexdigest()


def mission_unlocked(request: Request) -> bool:
    import main
    if not main.mission_gate_enabled():
        return True
    raw = str(request.cookies.get(main.MISSION_COOKIE) or "")
    # En bytes: con un `str` fuera del ASCII `compare_digest` lanza TypeError.
    return bool(raw) and hmac.compare_digest(
        raw.encode("utf-8", "replace"), main._mission_cookie_value().encode("utf-8")
    )


def require_mission_unlocked(request: Request):
    import main
    if not main.mission_unlocked(request):
        raise main.HTTPException(status_code=403, detail="mission locked")


def check_mission_password(password) -> bool:
    import main
    auth = main.load_mission_auth()
    salt = auth.get("salt")
    expected = auth.get("password_hash")
    if not salt or not expected:
        return True  # puerta desactivada
    # Sin espacios de los lados: `set_mission_password` guarda la clave ya recortada
    # y un móvil que añade un espacio al autocompletar no debe dejar a nadie fuera.
    candidate = str(password or "").strip()
    if not candidate:
        return False
    dk = hashlib.pbkdf2_hmac(
        "sha256",
        candidate.encode("utf-8"),
        str(salt).encode("utf-8"),
        int(auth.get("iterations") or 200000),
    ).hex()
    return hmac.compare_digest(dk, str(expected))


def set_mission_cookie(response: Response, request: Request, valor=None):
    """`valor`: la cookie ya calculada (el middleware la saca en un hilo, sin
    volver a leer la clave desde el bucle de eventos)."""
    import main
    response.set_cookie(
        main.MISSION_COOKIE,
        valor or main._mission_cookie_value(),
        max_age=main.MISSION_COOKIE_TTL_SECONDS,
        httponly=True,
        samesite="lax",
        secure=_es_https(request),
        path="/",
    )


def clear_mission_cookie(response: Response, request: Request):
    import main
    response.delete_cookie(
        main.MISSION_COOKIE,
        path="/",
        secure=_es_https(request),
        httponly=True,
        samesite="lax",
    )


def mission_unlock_lock_remaining_seconds(ip, now=None):
    import main
    return main.admin_auth_security.get_admin_lock_remaining_seconds(
        main.MISSION_UNLOCK_ATTEMPTS,
        ip,
        window_seconds=main.MISSION_UNLOCK_WINDOW_SECONDS,
        now=now,
    )


def register_mission_unlock_failure(ip, now=None):
    import main
    return main.admin_auth_security.register_admin_login_failure(
        main.MISSION_UNLOCK_ATTEMPTS,
        ip,
        max_attempts=main.MISSION_UNLOCK_MAX_ATTEMPTS,
        window_seconds=main.MISSION_UNLOCK_WINDOW_SECONDS,
        lock_seconds=main.MISSION_UNLOCK_LOCK_SECONDS,
        now=now,
    )


def clear_mission_unlock_state(ip):
    import main
    return main.admin_auth_security.clear_admin_login_state(main.MISSION_UNLOCK_ATTEMPTS, ip)


# ---------------------------------------------------------------------------
# Intentos por dispositivo y techo por IP (revisión 22/10)
# ---------------------------------------------------------------------------

#: Lo que puede ser una marca nuestra (`secrets.token_urlsafe(18)` da 24); lo demás se trata como «sin marca».
_MARCA_VALIDA = re.compile(r"^[A-Za-z0-9_-]{16,64}$")


def marca_de_dispositivo(request: Request) -> tuple[str, bool]:
    """La marca aleatoria de este dispositivo, y si es nueva (no la traía o no era válida)."""
    import main
    actual = str(request.cookies.get(main.MISSION_DEVICE_COOKIE) or "")
    if _MARCA_VALIDA.match(actual):
        return actual, False
    return secrets.token_urlsafe(18), True


def poner_marca_de_dispositivo(response: Response, request: Request, marca: str):
    import main
    response.set_cookie(
        main.MISSION_DEVICE_COOKIE,
        marca,
        max_age=main.MISSION_DEVICE_COOKIE_TTL_SECONDS,
        httponly=True,
        samesite="lax",
        secure=_es_https(request),
        path="/",
    )


def clave_de_intentos_del_dispositivo(ip, marca) -> str:
    # Con la IP delante: un dispositivo sin marca cuenta por IP + marca nueva, y la clave nunca choca con la de
    # la IP (`ip:` delante, ver `_clave_de_ip`).
    return "%s|%s" % (ip, marca)


def _clave_de_ip(ip) -> str:
    return "ip:%s" % ip


def mission_unlock_ip_remaining_seconds(ip, now=None):
    """Segundos hasta que esta IP pueda volver a probar; 0 si está por debajo del techo.

    Ventana deslizante sin escalado: con 60 fallos en 10 min se espera a que caduque el más viejo de ellos.
    """
    import main
    now = now or time.time()
    estado = main.admin_auth_security.get_admin_login_state(
        main.MISSION_UNLOCK_ATTEMPTS,
        _clave_de_ip(ip),
        window_seconds=main.MISSION_UNLOCK_WINDOW_SECONDS,
        now=now,
    )
    intentos = estado["attempts"]
    techo = main.MISSION_UNLOCK_IP_MAX_ATTEMPTS
    if techo <= 0 or len(intentos) < techo:
        return 0
    return max(1, int(intentos[-techo] + main.MISSION_UNLOCK_WINDOW_SECONDS - now) + 1)


def register_mission_unlock_ip_failure(ip, now=None):
    import main
    now = now or time.time()
    estado = main.admin_auth_security.get_admin_login_state(
        main.MISSION_UNLOCK_ATTEMPTS,
        _clave_de_ip(ip),
        window_seconds=main.MISSION_UNLOCK_WINDOW_SECONDS,
        now=now,
    )
    estado["attempts"].append(now)
    return estado
