"""Errores (servidor y móvil) y auditoría del panel, para analizar una partida.

Lo que guarda y lo que NO:

- De un error del móvil: el tipo, el mensaje (recortado), dónde (ruta SIN
  parámetros), la versión de la app y un resumen del dispositivo («iOS 17 ·
  Safari»), nunca el agente de usuario entero ni la IP. Con límite de ritmo
  (por jugador o por huella de IP) y de tamaño: un móvil que repite el mismo
  error en bucle no llena la tarjeta.
- De un error del servidor: el tipo de excepción, el mensaje recortado, el
  método y la ruta, y el final de la traza (sólo ficheros del propio motor).
- Del panel: qué acción, sobre qué (jugador, nodo…), cuándo, con qué resultado y
  qué sesión (huella corta de la cookie, que no permite reconstruirla). Así se
  distingue «lo cambió el portátil» de «lo cambió el móvil del organizador».

Ver storage/registro_analisis_store.py para la retención.
"""
from __future__ import annotations

import hashlib
import re
import threading
import time
import traceback
from typing import Any
from urllib.parse import urlsplit

from backend.app.storage import registro_analisis_store as _store

#: Por remitente (jugador o huella de IP): como mucho tantos errores…
LIMITE_POR_MINUTO = 20
LIMITE_POR_HORA = 120
#: …y tantos por envío.
MAX_POR_ENVIO = 20
MAX_MENSAJE = 300
MAX_PILA = 1_200
MAX_CUERPO_BYTES = 32 * 1024

_TIPOS_CLIENTE = {"js", "promesa", "red", "recurso", "sincronizacion", "otro"}

_ritmo: dict[str, list[float]] = {}
_cerrojo_ritmo = threading.Lock()

def ruta_db() -> str:
    """El fichero, leído de `main.REGISTRO_ANALISIS_DB` en cada llamada (los tests lo cambian)."""
    import main

    return getattr(main, "REGISTRO_ANALISIS_DB", None) or _store.ruta(main.DATA_DIR)

def reiniciar_ritmo() -> None:
    """Sólo para tests."""
    with _cerrojo_ritmo:
        _ritmo.clear()


def huella(texto: str, largo: int = 8) -> str:
    texto = str(texto or "")
    if not texto:
        return ""
    return hashlib.sha256(texto.encode("utf-8", "ignore")).hexdigest()[:largo]


def resumir_agente(agente: str | None) -> str:
    """«iOS 17 · Safari», «Android 14 · Chrome», «Windows · Firefox»… nunca el UA entero."""
    ua = str(agente or "")
    if not ua:
        return ""
    sistema = "otro"
    m = re.search(r"(?:iPhone|iPad|iPod).*? OS (\d+)", ua)
    if m:
        sistema = f"iOS {m.group(1)}"
    elif (m := re.search(r"Android (\d+)", ua)):
        sistema = f"Android {m.group(1)}"
    elif "Windows" in ua:
        sistema = "Windows"
    elif "Mac OS X" in ua or "Macintosh" in ua:
        sistema = "macOS"
    elif "Linux" in ua:
        sistema = "Linux"
    if "Edg/" in ua:
        navegador = "Edge"
    elif "SamsungBrowser" in ua:
        navegador = "Samsung"
    elif "Firefox/" in ua or "FxiOS" in ua:
        navegador = "Firefox"
    elif "CriOS" in ua or "Chrome/" in ua:
        navegador = "Chrome"
    elif "Safari/" in ua:
        navegador = "Safari"
    elif "python" in ua.lower() or "curl" in ua.lower() or "httpx" in ua.lower():
        navegador = "script"
    else:
        navegador = "otro"
    movil = " · móvil" if ("Mobile" in ua and "iPad" not in ua) else ""
    return f"{sistema} · {navegador}{movil}"


def _ruta_limpia(valor: Any) -> str:
    """Sólo la ruta: sin dominio, sin `?consulta` ni `#ancla` (pueden llevar datos)."""
    texto = str(valor or "").strip()[:400]
    if not texto:
        return ""
    try:
        partes = urlsplit(texto)
    except ValueError:
        return ""
    return (partes.path or "")[:200]


_URL = re.compile(r"https?://[^\s'\"<>]+")


def _texto_limpio(valor: Any, largo: int) -> str:
    texto = str(valor or "")
    # Las URL de un mensaje de error, sin consulta (tokens, nombres…).
    texto = _URL.sub(lambda m: _ruta_limpia(m.group(0)) or "[url]", texto)
    texto = re.sub(r"[\x00-\x08\x0b-\x1f\x7f]", " ", texto)
    return texto[:largo]


def _permitir(clave: str, cuantos: int, ahora: float | None = None) -> int:
    """Cuántos de `cuantos` caben todavía en el ritmo de `clave`."""
    momento = ahora if ahora is not None else time.time()
    with _cerrojo_ritmo:
        marcas = [t for t in _ritmo.get(clave, []) if momento - t < 3600]
        ultimo_minuto = sum(1 for t in marcas if momento - t < 60)
        caben = max(0, min(cuantos, LIMITE_POR_MINUTO - ultimo_minuto, LIMITE_POR_HORA - len(marcas)))
        marcas.extend([momento] * caben)
        _ritmo[clave] = marcas
        if len(_ritmo) > 2_000:
            for vieja in [k for k, v in _ritmo.items() if not v or momento - v[-1] > 3600]:
                _ritmo.pop(vieja, None)
        return caben


def registrar_errores_cliente(
    errores: Any,
    *,
    usuario: str = "",
    remitente: str = "",
    app_version: str = "",
    agente: str = "",
    ahora: float | None = None,
) -> dict[str, int]:
    """Guarda lo que manda el móvil. Devuelve `{aceptados, descartados}`."""
    lista = errores if isinstance(errores, list) else []
    lista = [e for e in lista[:MAX_POR_ENVIO] if isinstance(e, dict)]
    clave = f"u:{usuario}" if usuario else f"r:{remitente or 'anonimo'}"
    caben = _permitir(clave, len(lista), ahora)
    dispositivo = resumir_agente(agente)
    filas = []
    for error in lista[:caben]:
        tipo = str(error.get("tipo") or "otro").strip().lower()[:20]
        if tipo not in _TIPOS_CLIENTE:
            tipo = "otro"
        detalle: dict[str, Any] = {}
        pila = _texto_limpio(error.get("pila"), MAX_PILA)
        if pila:
            detalle["pila"] = pila
        for campo in ("estado_http", "metodo", "en_linea", "repeticiones", "pantalla"):
            valor = error.get(campo)
            if isinstance(valor, (int, float, bool)) or (isinstance(valor, str) and len(valor) <= 40):
                detalle[campo] = valor
        recurso = _ruta_limpia(error.get("recurso"))
        if recurso:
            detalle["recurso"] = recurso
        filas.append(
            {
                "origen": "cliente",
                "tipo": tipo,
                "mensaje": _texto_limpio(error.get("mensaje"), MAX_MENSAJE),
                "usuario": usuario,
                "ruta": _ruta_limpia(error.get("ruta")),
                "app_version": _texto_limpio(error.get("app_version") or app_version, 40),
                "dispositivo": dispositivo,
                "ocurrido_at": _texto_limpio(error.get("cuando"), 40) or None,
                "detalle": detalle,
            }
        )
    aceptados = _store.anadir_errores(ruta_db(), filas)
    return {"aceptados": aceptados, "descartados": len(lista) - aceptados}


def registrar_error_servidor(metodo: str, ruta: str, exc: BaseException) -> None:
    """Una excepción sin capturar. Nunca lanza: registrar no puede tirar nada más."""
    try:
        pila = traceback.extract_tb(exc.__traceback__) if exc.__traceback__ else []
        propias = [
            f"{marco.filename.replace(chr(92), '/').split('/saga-engine')[-1].split('/app/')[-1]}:{marco.lineno} {marco.name}"
            for marco in pila
            if "site-packages" not in marco.filename and "lib/python" not in marco.filename.replace("\\", "/").lower()
        ][-6:]
        _store.anadir_errores(
            ruta_db(),
            [
                {
                    "origen": "servidor",
                    "tipo": type(exc).__name__,
                    "mensaje": _texto_limpio(str(exc), MAX_MENSAJE),
                    "ruta": _ruta_limpia(ruta),
                    "detalle": {"metodo": str(metodo or "")[:10], "pila": propias},
                }
            ],
        )
    except Exception:
        pass


def sesion_de(request) -> str:
    """Huella corta de la sesión de admin de la petición ('' si no hay)."""
    try:
        import main

        return huella(request.cookies.get(main.ADMIN_SESSION_COOKIE) or "")
    except Exception:
        return ""


def auditar(request, accion: str, objetivo: str = "", detalle: dict | None = None, resultado: str = "ok") -> None:
    """Anota un cambio del panel. Nunca lanza."""
    try:
        _store.anadir_auditoria(
            ruta_db(),
            {
                "sesion": sesion_de(request) if request is not None else "",
                "accion": accion,
                "objetivo": objetivo,
                "resultado": resultado,
                "dispositivo": resumir_agente(request.headers.get("user-agent")) if request is not None else "",
                "detalle": detalle or {},
            },
        )
    except Exception:
        pass


def contar() -> dict[str, int]:
    return {
        "errores": _store.contar(ruta_db(), "errores"),
        "auditoria": _store.contar(ruta_db(), "auditoria"),
    }


def purgar() -> dict[str, int]:
    return _store.borrar_todo(ruta_db())
