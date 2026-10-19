"""Caja negra del móvil: todo lo que hace el jugador, apuntado aunque no haya red y subido en lotes al volver.

El móvil guarda cada paso (abrir un nodo, «Comenzar», cada fallo del reto, salir de la app, perder la red o el GPS,
un cierre inesperado, un avance que el servidor no acepta…) con su hora y lo sube comprimido cuando hay cobertura
(ver frontend/src/player/registro/bitacora.ts). Aquí se limpia, se corrige la hora del móvil y se guarda en el
Registro de partida como filas `app_<tipo>`, con id fijo para que un lote reenviado no se duplique.

Con eso `analizar` saca, por jugador:
- **Tiempo a devolver**: lo que el reloj del nodo siguió corriendo por culpa de la app o del servidor (la app se
  cerró sola con un nodo abierto; el servidor falló al avanzar). Es una SUGERENCIA: la aplica el organizador.
- **Sospechas**: la hora del móvil cambiada a mano en plena partida.
"""
from __future__ import annotations

import hashlib
from datetime import datetime, timezone
from typing import Any

from backend.app.runtime import reloj_del_movil as _reloj

#: tipo -> (texto para el panel, gravedad de la fila)
TIPOS: dict[str, tuple[str, str | None]] = {
    "inicio": ("Abre la app", None),
    "oculta": ("Sale de la app", None),
    "visible": ("Vuelve a la app", None),
    "sin_red": ("Se queda sin red", None),
    "con_red": ("Vuelve la red", None),
    "gps_error": ("Falla el GPS", "warning"),
    "gps_vuelve": ("Vuelve el GPS", None),
    "hoja": ("Abre el nodo", None),
    "comenzar": ("Pulsa «Comenzar»", None),
    "reto_fallo": ("Fallo en el reto", None),
    "reto_superado": ("Reto superado", None),
    "reto_reinicio": ("El reto se reinicia", None),
    "avance_ok": ("Avance aceptado", None),
    "avance_sin_red": ("Avance guardado sin red", None),
    "avance_rechazado": ("Avance rechazado", "warning"),
    "avance_error": ("Error al avanzar", "warning"),
    "codigo_mal": ("Código incorrecto", None),
    "qr_fallo": ("El QR no se lee", "warning"),
    "camara_denegada": ("Sin permiso de cámara", "warning"),
    "error": ("Error de la app", "warning"),
    "reloj": ("Cambia la hora del móvil", "suspicion"),
    "otro": ("Otro", None),
}

MAX_ENTRADAS_POR_LOTE = 400
MAX_CLAVES = 12
MAX_TEXTO = 160

#: Topes de lo que se sugiere devolver: un cierre o un fallo del servidor no puede «regalar» media hora.
TOPE_POR_CIERRE_MS = 10 * 60_000
TOPE_POR_ERROR_DE_SERVIDOR_MS = 5 * 60_000
TOPE_TOTAL_MS = 30 * 60_000


def _texto(valor: Any, largo: int = MAX_TEXTO) -> str:
    return "".join(c for c in str(valor if valor is not None else "") if c.isprintable())[:largo]


def _datos(crudo: Any) -> dict[str, Any]:
    if not isinstance(crudo, dict):
        return {}
    limpio: dict[str, Any] = {}
    for clave, valor in list(crudo.items())[:MAX_CLAVES]:
        clave = _texto(clave, 40)
        if not clave:
            continue
        if isinstance(valor, bool) or valor is None:
            limpio[clave] = bool(valor)
        elif isinstance(valor, (int, float)):
            limpio[clave] = valor if abs(valor) < 1e13 else 0
        else:
            limpio[clave] = _texto(valor)
    return limpio


def _iso(ms: int) -> str:
    return datetime.fromtimestamp(ms / 1000.0, tz=timezone.utc).isoformat(timespec="milliseconds").replace("+00:00", "Z")


def filas_del_lote(entradas: Any, *, usuario: str, nombre: str, sesion: Any, client_sent_at_ms: Any, ahora_ms: int):
    """Las filas del Registro de partida para un lote del móvil (ya saneadas y con la hora corregida)."""
    if not isinstance(entradas, list):
        return []
    desfase = _reloj.calcular_desfase_ms(client_sent_at_ms, ahora_ms)
    sesion = _texto(sesion, 40)
    filas = []
    for cruda in entradas[:MAX_ENTRADAS_POR_LOTE]:
        if not isinstance(cruda, dict):
            continue
        tipo = _texto(cruda.get("k"), 30)
        if tipo not in TIPOS:
            tipo = "otro"
        try:
            t = int(cruda.get("t"))
        except (TypeError, ValueError, OverflowError):
            continue
        if t <= 0:
            continue
        t = _reloj.corregir_hora(t, desfase, ahora_ms)
        ident = _texto(cruda.get("i"), 40)
        payload = {**_datos(cruda.get("d")), "sesion": sesion}
        nodo = _texto(cruda.get("n"), 120)
        if nodo:
            payload["node_id"] = nodo
        fila = {
            "event_type": "app_" + tipo,
            "user": usuario,
            "display_name": nombre,
            "payload": payload,
            "severity": TIPOS[tipo][1],
            "client_created_at": _iso(t),
        }
        if ident:
            fila["row_id"] = "app-" + hashlib.sha256(f"{usuario}|{sesion}|{ident}".encode()).hexdigest()[:24]
        filas.append(fila)
    return filas


def _ms(entrada: dict[str, Any]) -> int:
    texto = str(entrada.get("occurred_at") or entrada.get("client_created_at") or entrada.get("created_at") or "")
    try:
        fecha = datetime.fromisoformat(texto.replace("Z", "+00:00"))
    except ValueError:
        return 0
    if fecha.tzinfo is None:
        fecha = fecha.replace(tzinfo=timezone.utc)
    return int(fecha.timestamp() * 1000)


def analizar(entradas: list[dict[str, Any]]) -> dict[str, Any]:
    """Incidencias de un jugador a partir de su línea de tiempo (cualquier orden; sólo mira las `app_*`)."""
    filas = sorted((e for e in entradas if str(e.get("type") or "").startswith("app_")), key=_ms)
    incidencias: list[dict[str, Any]] = []
    sospechas: list[dict[str, Any]] = []
    cuentas: dict[str, int] = {}
    nodo_abierto: str | None = None
    anterior_ms = 0
    anterior_tipo = ""
    error_servidor: tuple[int, str] | None = None

    for fila in filas:
        tipo = str(fila["type"])[4:]
        cuentas[tipo] = cuentas.get(tipo, 0) + 1
        datos = fila.get("payload") if isinstance(fila.get("payload"), dict) else {}
        ms = _ms(fila)
        nodo = str(datos.get("node_id") or "") or nodo_abierto
        cuando = fila.get("occurred_at") or fila.get("client_created_at")

        # Si lo último fue salir de la app, el móvil la cerró en segundo plano mientras el jugador estaba fuera: eso no
        # es un fallo de la app, y devolver ese rato sería premiar salir a mirar.
        if (tipo == "inicio" and datos.get("previo") == "cerrada_mal" and nodo_abierto and anterior_ms
                and anterior_tipo != "oculta"):
            perdido = max(0, min(ms - anterior_ms, TOPE_POR_CIERRE_MS))
            if perdido:
                incidencias.append({"tipo": "cierre", "nodo": nodo_abierto, "ms": perdido, "at": cuando,
                                    "texto": "La app se cerró sola con el nodo abierto"})
        elif tipo in ("hoja", "comenzar"):
            nodo_abierto = nodo or nodo_abierto
        elif tipo == "avance_error" and int(datos.get("estado") or 0) >= 500:
            error_servidor = error_servidor or (ms, nodo or "")
        elif tipo in ("avance_ok", "avance_sin_red"):
            if error_servidor:
                perdido = max(0, min(ms - error_servidor[0], TOPE_POR_ERROR_DE_SERVIDOR_MS))
                if perdido:
                    incidencias.append({"tipo": "servidor", "nodo": error_servidor[1], "ms": perdido, "at": cuando,
                                        "texto": "El servidor falló al avanzar y hubo que reintentar"})
                error_servidor = None
            nodo_abierto = None
        elif tipo == "reloj":
            sospechas.append({"tipo": "reloj", "at": cuando, "salto_ms": datos.get("salto_ms"),
                              "texto": "Cambió la hora del móvil durante la partida"})
        anterior_ms = ms
        anterior_tipo = tipo

    sugerido = min(sum(i["ms"] for i in incidencias), TOPE_TOTAL_MS)
    return {"incidencias": incidencias, "sospechas": sospechas, "cuentas": cuentas, "devolver_ms": sugerido}
