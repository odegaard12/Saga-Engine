"""Sesión de jugador, cabeceras de seguridad y límites de ritmo: el estado vive en `main`.

Sacado de `main.py` sin cambiar comportamiento. Todo lo que estas funciones usan
de `main` se pide como `main.NOMBRE` en el momento de la llamada (igual que hacen
los routers), de modo que lo que un test o el arranque cambie en `main` --rutas de
fichero, funciones sustituidas-- sigue mandando. `main` re-exporta estos nombres.
"""
from fastapi import Request, Response
from backend.app.security.peticiones import es_https as _es_https
import time


def datos_de_la_sesion(request: Request):
    """La cookie de jugador firmada y en vigor, o None. Con PINs puestos, sólo si se ganó con el PIN (fase 2)."""
    import main
    from backend.app.runtime import pines_jugador
    datos = main.player_session_security.read_player_session_token(
        request.cookies.get(main.PLAYER_SESSION_COOKIE),
        secret=main.get_session_signing_secret(),
    )
    return datos if pines_jugador.sesion_vale(datos) else None


def hay_sesion_de_algun_jugador(request: Request):
    """¿Quien pregunta es un jugador de esta misión, sea cual sea?

    Distinto de `require_player_session`, que ata la petición a UN jugador
    concreto. Hay cosas que un jugador ve de todo el grupo —las fotos de campo
    salen en el mapa de todos— y ahí lo que hay que comprobar es que sea alguien
    de dentro, no quién.
    """
    import main
    datos = datos_de_la_sesion(request)

    if not datos:
        return False

    return bool(main.resolve_known_player_profile(datos.get("user")))


def jugador_de_la_sesion(request: Request):
    """El id del jugador de la cookie firmada, o None si no hay sesión válida."""
    import main
    datos = datos_de_la_sesion(request)
    if not datos:
        return None
    perfil = main.resolve_known_player_profile(datos.get("user"))
    if not perfil:
        return None
    return main._as_str(perfil.get("id") or datos.get("user")).strip() or None


def exigir_ser_del_grupo(request: Request):
    """Cierra la puerta a quien no esté jugando.

    Estos datos estaban abiertos a internet. Sin sesión, sin contraseña y sin
    saber nada, `GET /api/field-proofs` devolvía las 17 fotos de la ruta con el
    NOMBRE de quien la hizo, las COORDENADAS exactas y el nodo, y la imagen se
    descargaba entera desde su URL. Comprobado contra sagagia.es el 2026-08-09.

    Para una ruta entre amigos ya era feo. Para vender esto a un colegio es
    inaceptable, por muchos permisos firmados que haya: el consentimiento cubre
    hacer la foto, no publicarla.

    El pase de jugador no es una identificación fuerte —se consigue entrando en
    la misión—, pero corta a los buscadores, a los rastreadores y a cualquiera
    que no sepa un nombre de jugador. Contra eso, lo que protege de verdad es no
    guardar lo que no hace falta y borrarlo al acabar la ruta.
    """
    import main
    if main.hay_sesion_de_algun_jugador(request):
        return

    # El panel también entra: desde ahí se revisan y se descargan las fotos.
    if main.verify_admin_session_token(request.cookies.get(main.ADMIN_SESSION_COOKIE)):
        return

    raise main.HTTPException(status_code=403, detail="player session required")


# Lo que el navegador pide fuera de sagagia.es (el resto -PNOA, IGN, Catastro, relieve- lo sirve la Pi).
TESELAS_EXTERNAS = (
    "https://server.arcgisonline.com",
    "https://tile.openstreetmap.org",
    "https://*.tile.openstreetmap.org",
    "https://tile.waymarkedtrails.org",
    "https://*.basemaps.cartocdn.com",
    "https://api.mapbox.com",
    "https://*.tiles.mapbox.com",
)
SERVICIOS_EXTERNOS = (
    "https://routing.openstreetmap.de",
    "https://overpass-api.de",
    "https://overpass.kumi.systems",
    "https://api.open-meteo.com",
    "https://events.mapbox.com",
)


def apply_security_headers(response: Response, request: Request):
    import main
    response.headers["X-Content-Type-Options"] = "nosniff"
    response.headers["X-Robots-Tag"] = "noindex, nofollow"
    response.headers["X-Frame-Options"] = "DENY"
    response.headers["Referrer-Policy"] = "strict-origin-when-cross-origin"
    response.headers["Permissions-Policy"] = "camera=(self), geolocation=(self), microphone=(self), interest-cohort=()"
    response.headers["Cross-Origin-Opener-Policy"] = "same-origin"
    response.headers["Content-Security-Policy"] = (
        "default-src 'self' data: blob:; "
        # Sin 'unsafe-eval' (auditoría 15/10, fase 4: el build no usa eval; jszip lo tiene de plan B y no lo
        # pisa en navegadores actuales). 'wasm-unsafe-eval' SÓLO deja compilar WebAssembly (el decodificador de
        # los personajes 3D; sin él no salen, probado en Chromium y WebKit). Sin 'unsafe-inline' desde la revisión
        # 22/10: sólo lo pedía la hoja de impresión de QR (about:blank hereda esta CSP), que ahora se monta desde el
        # panel sin scripts en línea; el build de Vite no lleva ninguno. style-src sí lo sigue necesitando (los
        # `style=` de React y la hoja de impresión).
        "script-src 'self' 'wasm-unsafe-eval' blob:; "
        "style-src 'self' 'unsafe-inline'; "
        # Sólo los servicios que de verdad usa el mapa (antes, cualquier https:).
        f"img-src 'self' data: blob: {' '.join(TESELAS_EXTERNAS)}; "
        f"connect-src 'self' {' '.join(TESELAS_EXTERNAS + SERVICIOS_EXTERNOS)}; "
        "worker-src 'self' blob:; "
        "font-src 'self' data:; "
        "object-src 'none'; "
        "base-uri 'self'; "
        "form-action 'self'; "
        "frame-ancestors 'none'"
    )
    if _es_https(request):
        response.headers["Strict-Transport-Security"] = "max-age=31536000; includeSubDomains"
    return response


def prune_player_rate_limit_bucket(bucket_name: str, now=None):
    import main
    now = float(now or time.time())
    bucket = main.PLAYER_RATE_LIMITS.setdefault(bucket_name, {})
    stale = []
    for key, timestamps in bucket.items():
        fresh = [ts for ts in timestamps if now - ts <= main.PLAYER_RATE_LIMIT_WINDOW_SECONDS]
        if fresh:
            bucket[key] = fresh
        else:
            stale.append(key)
    for key in stale:
        bucket.pop(key, None)


def enforce_player_rate_limit(bucket_name: str, request: Request, user: str, limit: int):
    import main
    now = time.time()
    main.prune_player_rate_limit_bucket(bucket_name, now=now)
    bucket = main.PLAYER_RATE_LIMITS.setdefault(bucket_name, {})
    key = f"{main.get_client_ip(request)}:{main._as_str(user).strip()}"
    hits = bucket.get(key, [])
    if len(hits) >= int(limit):
        raise main.HTTPException(status_code=429, detail="rate limit exceeded")
    hits.append(now)
    bucket[key] = hits


def clear_player_rate_limits():
    import main
    for bucket in main.PLAYER_RATE_LIMITS.values():
        bucket.clear()
