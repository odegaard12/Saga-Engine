"""Avisos al organizador por ntfy: quién acaba, quién llega primero, sospechas,
jugadores sin señal y errores del servidor.

Dos llaves, y hacen falta las dos:

1. El servidor ntfy, por entorno: `SAGA_NTFY_URL` (p. ej. https://ntfy.example.org),
   `SAGA_NTFY_TOPIC` y, si el tema está protegido, `SAGA_NTFY_TOKEN`. Nunca en el
   repo ni en el panel: el panel sólo dice si están puestas.
2. El interruptor del panel (Ajustes → Avisos), APAGADO por defecto, con un
   interruptor por tipo. Se guarda en `data/avisos_ntfy.json`.

Para no inundar el móvil del organizador:
- se agrupan: el primer aviso arma un temporizador de `AGRUPAR_S` y lo que
  llegue mientras tanto sale en la MISMA notificación;
- cada cosa avisa una vez (`clave`): el mismo jugador sin señal no repite hasta
  que vuelva y se vaya otra vez; la misma sospecha, como mucho cada 30 min;
- como mucho `MAX_POR_HORA` notificaciones por hora; lo que sobra espera y sale
  junto en la siguiente.

Un aviso que no se puede mandar no tumba nada: se pierde y queda en el log.
"""
from __future__ import annotations

import json
import os
import threading
import time
from collections import deque
from pathlib import Path
from typing import Any, Callable

import httpx

FICHERO = "avisos_ntfy.json"
TIPOS = ("fin", "primero", "sospecha", "sin_senal", "errores")
AGRUPAR_S = 60.0
MAX_POR_HORA = 10
MAX_LINEAS = 15
TIMEOUT_S = 5.0

SIN_SENAL_S = 30 * 60
SOSPECHAS_FUERTES = 3
SOSPECHAS_VENTANA_S = 15 * 60
ERRORES_REPETIDOS = 3
ERRORES_VENTANA_S = 10 * 60
REPETIR_S = 30 * 60
VIGILANTE_S = 60.0

_PRIORIDAD = {"sin_senal": 4, "sospecha": 4, "errores": 4, "fin": 3, "primero": 3}

_CERROJO = threading.RLock()
_LINEAS: list[tuple[str, str]] = []
_SOBRAN = [0]
_ENVIOS: deque = deque()
_CLAVES: dict[str, float] = {}
_SOSPECHAS: dict[str, list[float]] = {}
_ERRORES: list[float] = []
_SIN_SENAL: set[str] = set()
_TEMPORIZADOR: list[threading.Timer | None] = [None]


def destino() -> tuple[str, str, str]:
    return (
        (os.getenv("SAGA_NTFY_URL") or "").strip().rstrip("/"),
        (os.getenv("SAGA_NTFY_TOPIC") or "").strip(),
        (os.getenv("SAGA_NTFY_TOKEN") or "").strip(),
    )


def configurado() -> bool:
    url, tema, _ = destino()
    return bool(url and tema)


def leer_config(data_dir: str | Path) -> dict:
    try:
        crudo = json.loads((Path(data_dir) / FICHERO).read_text(encoding="utf-8"))
    except (OSError, ValueError):
        crudo = {}
    crudo = crudo if isinstance(crudo, dict) else {}
    tipos = crudo.get("tipos") if isinstance(crudo.get("tipos"), dict) else {}
    primeros = crudo.get("primeros") if isinstance(crudo.get("primeros"), dict) else {}
    return {
        "activo": crudo.get("activo") is True,
        "tipos": {tipo: tipos.get(tipo, True) is not False for tipo in TIPOS},
        "primeros": {
            "mision": str(primeros.get("mision") or ""),
            "nodos": [str(n) for n in primeros.get("nodos") or [] if n is not None][:500],
        },
    }


def guardar_config(data_dir: str | Path, cambios: dict) -> dict:
    actual = leer_config(data_dir)
    if "activo" in cambios:
        actual["activo"] = cambios.get("activo") is True
    tipos = cambios.get("tipos") if isinstance(cambios.get("tipos"), dict) else {}
    for tipo in TIPOS:
        if tipo in tipos:
            actual["tipos"][tipo] = tipos[tipo] is True
    if isinstance(cambios.get("primeros"), dict):
        actual["primeros"] = cambios["primeros"]
    ruta = Path(data_dir) / FICHERO
    ruta.parent.mkdir(parents=True, exist_ok=True)
    temporal = ruta.with_name(ruta.name + ".tmp")
    temporal.write_text(json.dumps(actual, ensure_ascii=False), encoding="utf-8")
    os.replace(temporal, ruta)
    return actual


def encendido(data_dir: str | Path, tipo: str) -> bool:
    if not configurado():
        return False
    config = leer_config(data_dir)
    return config["activo"] and config["tipos"].get(tipo, False)


def enviar_ntfy(titulo: str, cuerpo: str, prioridad: int = 3, etiquetas: list[str] | None = None) -> None:
    """Una notificación. Lanza si ntfy no la acepta."""
    url, tema, token = destino()
    if not (url and tema):
        raise RuntimeError("ntfy sin configurar")
    cabeceras = {"Authorization": "Bearer " + token} if token else {}
    respuesta = httpx.post(
        url,
        json={"topic": tema, "title": titulo, "message": cuerpo, "priority": prioridad, "tags": etiquetas or []},
        headers=cabeceras,
        timeout=TIMEOUT_S,
    )
    respuesta.raise_for_status()


#: Se sustituye en las pruebas.
ENVIAR: Callable[..., None] = enviar_ntfy


def encolar(tipo: str, texto: str, clave: str | None = None, ventana: float = REPETIR_S, reloj=time.time) -> bool:
    """Deja un aviso para la próxima notificación. False si ya se avisó de esto."""
    with _CERROJO:
        ahora = reloj()
        if clave:
            if ahora - _CLAVES.get(clave, -1e18) < ventana:
                return False
            _CLAVES[clave] = ahora
        if len(_LINEAS) >= MAX_LINEAS * 4:
            _SOBRAN[0] += 1
        else:
            _LINEAS.append((tipo, texto))
        _armar(AGRUPAR_S)
    return True


def _armar(segundos: float) -> None:
    if _TEMPORIZADOR[0] is not None:
        return
    temporizador = threading.Timer(segundos, _vaciar_en_hilo)
    temporizador.daemon = True
    _TEMPORIZADOR[0] = temporizador
    temporizador.start()


def _vaciar_en_hilo() -> None:
    with _CERROJO:
        _TEMPORIZADOR[0] = None
    vaciar()


def vaciar(reloj=time.time) -> bool:
    """Manda lo pendiente en UNA notificación, si el límite por hora lo deja."""
    with _CERROJO:
        if not _LINEAS:
            return False
        ahora = reloj()
        while _ENVIOS and ahora - _ENVIOS[0] >= 3600:
            _ENVIOS.popleft()
        if len(_ENVIOS) >= MAX_POR_HORA:
            # Espera a que caduque el envío más viejo; lo nuevo se sigue juntando.
            _armar(max(1.0, _ENVIOS[0] + 3600 - ahora))
            return False
        lineas, sobran = list(_LINEAS), _SOBRAN[0]
        _LINEAS.clear()
        _SOBRAN[0] = 0
        _ENVIOS.append(ahora)

    visibles = [texto for _, texto in lineas[:MAX_LINEAS]]
    resto = len(lineas) - len(visibles) + sobran
    if resto > 0:
        visibles.append("… y %d más" % resto)
    titulo = "SAGA" if len(lineas) == 1 else "SAGA: %d avisos" % (len(lineas) + sobran)
    prioridad = max(_PRIORIDAD.get(tipo, 3) for tipo, _ in lineas)
    try:
        ENVIAR(titulo, "\n".join(visibles), prioridad, ["saga"])
    except Exception as exc:  # noqa: BLE001 - un aviso perdido no puede tumbar nada
        print("[avisos] ntfy no aceptó el aviso: %s" % str(exc)[:200])
        return False
    return True


def prueba() -> tuple[bool, str]:
    """El botón «Enviar aviso de prueba»: directo, sin esperar a agrupar."""
    if not configurado():
        return False, "sin_configurar"
    with _CERROJO:
        ahora = time.time()
        while _ENVIOS and ahora - _ENVIOS[0] >= 3600:
            _ENVIOS.popleft()
        if len(_ENVIOS) >= MAX_POR_HORA:
            return False, "limite"
        _ENVIOS.append(ahora)
    try:
        ENVIAR("SAGA: aviso de prueba", "Si lees esto, los avisos de SAGA llegan a este móvil.", 3, ["saga"])
    except Exception as exc:  # noqa: BLE001
        return False, type(exc).__name__
    return True, "ok"


# ---------------------------------------------------------------------------
# Lo que dispara avisos. Todo sale en silencio y sin tocar `main` si ntfy no
# está configurado: es lo que pasa en las pruebas y en un servidor normal.
# ---------------------------------------------------------------------------

def al_registrar(event_type: str, user: str, nombre: str, payload: Any, severity: str | None = None, reloj=time.time) -> None:
    """Enganche del Registro de partida (`match_log_record`)."""
    if not configurado() or event_type not in ("advance", "suspicion"):
        return
    import main

    payload = payload if isinstance(payload, dict) else {}
    nombre = nombre or user
    if event_type == "suspicion":
        if severity == "info":
            return
        _sospecha(main.DATA_DIR, user, nombre, str(payload.get("reason") or ""), reloj)
        return

    stages = main.load_stages(main.STAGES_DB)
    stages = stages if isinstance(stages, list) else []
    try:
        despues = int(payload.get("level_after"))
    except (TypeError, ValueError):
        return
    nodo = stages[despues - 1] if 0 < despues <= len(stages) and isinstance(stages[despues - 1], dict) else {}
    nodo_id = str(payload.get("node_id") or nodo.get("id") or despues)
    titulo = str(nodo.get("title") or "").strip() or "nodo %d" % despues

    if encendido(main.DATA_DIR, "primero"):
        mision = str(main.load_config().get("mission_launch_at") or "")
        config = leer_config(main.DATA_DIR)
        primeros = config["primeros"] if config["primeros"]["mision"] == mision else {"mision": mision, "nodos": []}
        if nodo_id not in primeros["nodos"]:
            primeros["nodos"].append(nodo_id)
            guardar_config(main.DATA_DIR, {"primeros": primeros})
            encolar("primero", "%s llega el primero a «%s»" % (nombre, titulo), clave="primero:" + nodo_id, reloj=reloj)
    if stages and despues >= len(stages) and encendido(main.DATA_DIR, "fin"):
        encolar("fin", "%s ha terminado la misión" % nombre, clave="fin:" + str(user), ventana=6 * 3600, reloj=reloj)


def _sospecha(data_dir, user: str, nombre: str, motivo: str, reloj) -> None:
    if not encendido(data_dir, "sospecha"):
        return
    with _CERROJO:
        ahora = reloj()
        lista = [t for t in _SOSPECHAS.get(user, []) if ahora - t < SOSPECHAS_VENTANA_S] + [ahora]
        _SOSPECHAS[user] = lista
        if len(lista) < SOSPECHAS_FUERTES:
            return
    encolar(
        "sospecha",
        "Sospecha fuerte: %s (%d en %d min; la última, %s)" % (nombre, len(lista), SOSPECHAS_VENTANA_S // 60, motivo or "sin motivo"),
        clave="sospecha:" + user,
        reloj=reloj,
    )


def error_del_servidor(ruta: str, reloj=time.time) -> None:
    """Enganche del manejador de errores sin capturar (500)."""
    if not configurado():
        return
    import main

    if not encendido(main.DATA_DIR, "errores"):
        return
    with _CERROJO:
        ahora = reloj()
        _ERRORES[:] = [t for t in _ERRORES if ahora - t < ERRORES_VENTANA_S] + [ahora]
        n = len(_ERRORES)
    if n >= ERRORES_REPETIDOS:
        encolar(
            "errores",
            "El servidor ha fallado %d veces en %d min (la última en %s)" % (n, ERRORES_VENTANA_S // 60, ruta[:80]),
            clave="errores",
            reloj=reloj,
        )


def revisar_sin_senal(main, ahora: float | None = None) -> list[str]:
    """Jugadores con la partida empezada, sin acabar y sin latido hace 30 min."""
    if not encendido(main.DATA_DIR, "sin_senal"):
        return []
    cfg = main.load_config()
    if not main.match_log_is_active(cfg):
        return []
    ahora = time.time() if ahora is None else ahora
    posiciones = main.load_live_positions() or {}
    timers = main.load_player_timers() or {}
    nuevos = []
    for user, posicion in posiciones.items():
        reloj = timers.get(user) if isinstance(timers.get(user), dict) else {}
        visto = posicion.get("last_seen") if isinstance(posicion, dict) else None
        if not reloj.get("started_at") or reloj.get("finished_at") or not isinstance(visto, (int, float)):
            continue
        callado = ahora - visto
        with _CERROJO:
            if callado < SIN_SENAL_S:
                _SIN_SENAL.discard(user)
                continue
            if user in _SIN_SENAL:
                continue
            _SIN_SENAL.add(user)
        nombre = main.match_log_display_name(user)
        encolar("sin_senal", "%s lleva %d min sin dar señal en plena partida" % (nombre, callado // 60))
        nuevos.append(user)
    return nuevos


def arrancar_vigilante() -> None:
    """Hilo que mira cada minuto si alguien se ha quedado sin señal. Sólo con ntfy configurado."""
    if not configurado():
        return

    def bucle():
        import main

        while True:
            time.sleep(VIGILANTE_S)
            try:
                revisar_sin_senal(main)
            except Exception as exc:  # noqa: BLE001 - el vigilante no se puede morir
                print("[avisos] vigilante: %s" % str(exc)[:200])

    threading.Thread(target=bucle, name="saga-avisos-sin-senal", daemon=True).start()


def reiniciar_estado() -> None:
    """Para las pruebas."""
    with _CERROJO:
        _LINEAS.clear()
        _SOBRAN[0] = 0
        _ENVIOS.clear()
        _CLAVES.clear()
        _SOSPECHAS.clear()
        _ERRORES.clear()
        _SIN_SENAL.clear()
        if _TEMPORIZADOR[0] is not None:
            _TEMPORIZADOR[0].cancel()
            _TEMPORIZADOR[0] = None
