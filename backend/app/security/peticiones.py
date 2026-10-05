"""Defensas comunes a todas las peticiones: HTTPS detrás del túnel, origen
(CSRF), tamaño del cuerpo y ritmo por IP.

Todo es configurable por entorno y con valores por defecto que no rompen el
uso normal (15 jugadores detrás de la misma IP de un túnel incluidos).
"""
from __future__ import annotations

import os
import threading
import time
from urllib.parse import urlsplit

from backend.app.security import client_ip as _client_ip

_METODOS_QUE_ESCRIBEN = {"POST", "PUT", "PATCH", "DELETE"}


# ---------------------------------------------------------------------------
# ¿Llegó por HTTPS?
# ---------------------------------------------------------------------------

def _env_activo(nombre: str) -> bool:
    return (os.getenv(nombre) or "").strip().lower() in {"1", "true", "yes", "si", "sí", "on"}


def es_https(request) -> bool:
    """¿La petición llegó al usuario por HTTPS?

    Detrás de Cloudflare el túnel entrega HTTP plano al contenedor: con mirar
    sólo `request.url.scheme` las cookies salían sin `Secure` y nunca se mandaba
    HSTS. Ahora cuenta también `X-Forwarded-Proto: https` cuando viene de un
    proxy de confianza (`TRUST_PROXY_HEADERS=1` + `TRUSTED_PROXY_IPS/CIDRS`), y
    `SAGA_FORCE_HTTPS=1` lo fuerza (producción siempre va por HTTPS).
    """
    if (getattr(request.url, "scheme", "") or "").lower() == "https":
        return True
    if _env_activo("SAGA_FORCE_HTTPS"):
        return True
    if not _client_ip.TRUST_PROXY_HEADERS:
        return False
    if not _client_ip.is_trusted_proxy_client(_client_ip.request_client_host(request)):
        return False
    proto = str(request.headers.get("x-forwarded-proto") or "").split(",")[0].strip().lower()
    return proto == "https"


# ---------------------------------------------------------------------------
# Origen (CSRF)
# ---------------------------------------------------------------------------

def _host_de(valor: str) -> str:
    try:
        partes = urlsplit(valor)
    except ValueError:
        return ""
    return (partes.netloc or "").strip().lower()


def _es_loopback(host: str) -> bool:
    nombre = host.rsplit(":", 1)[0] if host.count(":") == 1 else host
    nombre = nombre.strip("[]")
    return nombre in {"localhost", "127.0.0.1", "::1"} or nombre.endswith(".localhost")


def origenes_extra() -> set[str]:
    """Hosts permitidos además del propio (`SAGA_ALLOWED_ORIGINS` y CORS)."""
    salida = set()
    for nombre in ("SAGA_ALLOWED_ORIGINS", "SAGA_CORS_ALLOW_ORIGINS"):
        for item in _client_ip.split_env_csv(os.getenv(nombre) or ""):
            if item == "*":
                continue
            host = _host_de(item) if "://" in item else item.strip().lower()
            if host:
                salida.add(host)
    return salida


def origen_rechazado(request) -> str | None:
    """Motivo si una escritura llega desde otra web; None si se acepta.

    Las cookies son `SameSite=Lax`, que ya frena el POST entre sitios en los
    navegadores modernos, pero no entre subdominios del mismo sitio ni en
    navegadores viejos. Se comprueba `Origin` (o `Referer` si no hay) contra el
    `Host` de la petición: un navegador no deja a otra web falsificar ninguno de
    los dos. Sin ninguno de los dos (curl, pruebas, clientes viejos) se acepta:
    no hay navegador al que engañar. `SAGA_CSRF_CHECK=0` lo apaga.
    """
    if request.method.upper() not in _METODOS_QUE_ESCRIBEN:
        return None
    if (os.getenv("SAGA_CSRF_CHECK") or "1").strip() == "0":
        return None

    origen = str(request.headers.get("origin") or "").strip()
    if origen.lower() == "null":
        return "origin_null"
    if not origen:
        referer = str(request.headers.get("referer") or "").strip()
        if not referer:
            return None
        origen = referer

    host_origen = _host_de(origen)
    if not host_origen:
        return "origin_unreadable"

    propios = {str(request.headers.get("host") or "").strip().lower()}
    reenviado = str(request.headers.get("x-forwarded-host") or "").split(",")[0].strip().lower()
    if reenviado:
        propios.add(reenviado)
    propios.discard("")

    if host_origen in propios or host_origen in origenes_extra():
        return None
    # Desarrollo: Vite (5173) hace de proxy hacia el backend en otro puerto.
    if _es_loopback(host_origen) and any(_es_loopback(h) for h in propios):
        return None
    return "cross_origin"


# ---------------------------------------------------------------------------
# Tamaño del cuerpo
# ---------------------------------------------------------------------------

#: Lo que cabe en una escritura del jugador (una tanda de 200 eventos con su
#: evidencia y rastro de posiciones mide unos cientos de KB).
MAX_CUERPO_JUGADOR = int(os.getenv("SAGA_MAX_BODY_BYTES", str(2 * 1024 * 1024)) or 2 * 1024 * 1024)
#: El panel guarda nodos con fotos en base64 (mosaico, pistas).
MAX_CUERPO_PANEL = int(os.getenv("SAGA_MAX_ADMIN_BODY_BYTES", str(64 * 1024 * 1024)) or 64 * 1024 * 1024)
#: Rutas con su propio tope, comprobado dentro (fotos de campo).
_RUTAS_CON_TOPE_PROPIO = ("/api/field-proofs",)


def tope_de_cuerpo(path: str) -> int | None:
    if path.startswith(_RUTAS_CON_TOPE_PROPIO):
        return None
    if path.startswith("/api/admin"):
        return MAX_CUERPO_PANEL
    return MAX_CUERPO_JUGADOR


def cuerpo_demasiado_grande(request) -> bool:
    """Por `Content-Length` (sin leer nada). Un cuerpo sin longitud declarada
    lo corta `entradas.leer_cuerpo_acotado` al leerlo."""
    if request.method.upper() not in _METODOS_QUE_ESCRIBEN:
        return False
    tope = tope_de_cuerpo(request.url.path or "")
    if tope is None:
        return False
    declarado = request.headers.get("content-length")
    try:
        return declarado is not None and int(declarado) > tope
    except ValueError:
        return False


# ---------------------------------------------------------------------------
# Ritmo por IP (escrituras en /api/)
# ---------------------------------------------------------------------------

#: Escrituras por minuto y por IP. Generoso: detrás de un túnel sin
#: `TRUST_PROXY_HEADERS` todos los jugadores comparten IP (15 móviles ≈ 100/min
#: sin contar el latido, que tiene su propio límite y no cuenta aquí).
LIMITE_ESCRITURAS_POR_MINUTO = int(os.getenv("SAGA_WRITE_RATE_PER_MINUTE", "600") or "600")
_VENTANA_S = 60.0
_EXENTAS = ("/api/heartbeat",)
_ESCRITURAS: dict[str, list[float]] = {}
_CERROJO = threading.Lock()


def limpiar_ritmo() -> None:
    with _CERROJO:
        _ESCRITURAS.clear()


def ritmo_excedido(request, ip: str, ahora: float | None = None) -> int:
    """Segundos a esperar si esta IP se ha pasado; 0 si puede seguir."""
    if request.method.upper() not in _METODOS_QUE_ESCRIBEN:
        return 0
    path = request.url.path or ""
    if not path.startswith("/api/") or path.startswith(_EXENTAS):
        return 0
    if LIMITE_ESCRITURAS_POR_MINUTO <= 0:
        return 0
    ahora = time.time() if ahora is None else ahora
    clave = _client_ip.lockout_key(ip)
    with _CERROJO:
        marcas = [t for t in _ESCRITURAS.get(clave, []) if ahora - t < _VENTANA_S]
        if len(marcas) >= LIMITE_ESCRITURAS_POR_MINUTO:
            _ESCRITURAS[clave] = marcas
            return max(1, int(_VENTANA_S - (ahora - marcas[0])) + 1)
        marcas.append(ahora)
        _ESCRITURAS[clave] = marcas
        if len(_ESCRITURAS) > 5000:
            # Poda: IPs que ya no escriben.
            for vieja in [k for k, v in _ESCRITURAS.items() if not v or ahora - v[-1] >= _VENTANA_S]:
                _ESCRITURAS.pop(vieja, None)
    return 0
