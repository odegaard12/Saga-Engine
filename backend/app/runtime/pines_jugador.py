"""PIN por jugador (auditoría externa del 15/10/2026, fase 2).

Hasta ahora, elegir un nombre en la portada ERA ser ese jugador: `/player/{nombre}` y `/api/game/{nombre}` daban
la sesión a quien la pidiera. Con PINs activos, la sesión sólo se da en `POST /api/jugador/entrar` con el PIN
correcto (comparación en tiempo constante, 5 intentos cada 10 min por IP y jugador). Se entra una vez con cobertura;
después el móvil juega sin red como siempre, con su sesión y su paquete guardados.

Los PIN se guardan como hash PBKDF2 (como la clave de misión) en `player_pins.json`, nunca en claro: el panel los
enseña UNA vez, al generarlos, para repartirlos. Sin PINs guardados todo sigue como antes.
"""
from __future__ import annotations

import hmac
import secrets
import time
from typing import Any

DOCUMENTO = "player_pins"
CIFRAS = 6
MAX_INTENTOS = 5
VENTANA_S = 600
BLOQUEO_S = 600
#: {"ip|jugador" -> estado de intentos}, en memoria como los del admin.
INTENTOS: dict[str, dict[str, Any]] = {}


def _pines() -> dict[str, Any]:
    import main

    datos = main.load_document(main.PLAYER_PINS_DB, DOCUMENTO, {})
    pines = datos.get("pins") if isinstance(datos, dict) else None
    return pines if isinstance(pines, dict) else {}


def activos() -> bool:
    """¿Hay PINs puestos? Entonces nadie entra sin el suyo."""
    return bool(_pines())


def con_pin() -> list[str]:
    return sorted(_pines())


def generar(ids: list[str]) -> dict[str, str]:
    """PIN nuevo de 6 cifras para cada id. Devuelve los PIN en claro UNA vez (para el panel); se guarda el hash."""
    import main

    pines = _pines()
    nuevos: dict[str, str] = {}
    for jugador in ids:
        clave = main.normalize_player_session_user(jugador)
        if not clave:
            continue
        pin = "".join(secrets.choice("0123456789") for _ in range(CIFRAS))
        h = main.admin_auth_security.hash_password(pin)
        # `desde`: las sesiones de este jugador emitidas ANTES no valen (las dio la portada sin PIN).
        pines[clave] = {"salt": h["salt"], "hash": h["password_hash"], "iterations": h["iterations"],
                        "desde": int(time.time())}
        nuevos[clave] = pin
    main.save_document(main.PLAYER_PINS_DB, DOCUMENTO, {"pins": pines})
    return nuevos


def quitar() -> None:
    import main

    main.save_document(main.PLAYER_PINS_DB, DOCUMENTO, {"pins": {}})


def comprobar(jugador: str, pin: Any) -> bool:
    import main

    entrada = _pines().get(main.normalize_player_session_user(jugador))
    candidato = "".join(ch for ch in str(pin or "") if ch.isdigit())
    if not isinstance(entrada, dict) or not candidato:
        return False
    calculado = main.admin_auth_security.hash_password(
        candidato, str(entrada.get("salt") or ""), int(entrada.get("iterations") or 200000)
    )["password_hash"]
    return hmac.compare_digest(calculado, str(entrada.get("hash") or ""))


def sesion_vale(datos: dict[str, Any] | None) -> bool:
    """Con PINs activos, una sesión sólo vale si su jugador tiene PIN y se emitió después de ponérselo."""
    if not datos:
        return False
    pines = _pines()
    if not pines:
        return True
    entrada = pines.get(str(datos.get("user") or "").strip())
    return isinstance(entrada, dict) and int(datos.get("iat") or 0) >= int(entrada.get("desde") or 0)


def espera_restante(clave: str) -> int:
    import main

    return main.admin_auth_security.get_admin_lock_remaining_seconds(INTENTOS, clave, window_seconds=VENTANA_S)


def anotar_fallo(clave: str) -> None:
    import main

    main.admin_auth_security.register_admin_login_failure(
        INTENTOS, clave, max_attempts=MAX_INTENTOS, window_seconds=VENTANA_S, lock_seconds=BLOQUEO_S
    )


def limpiar(clave: str) -> None:
    import main

    main.admin_auth_security.clear_admin_login_state(INTENTOS, clave)
