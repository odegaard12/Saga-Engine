"""Banco de pruebas, enganchado al panel de administración.

Simula N jugadores recorriendo la misión REAL -no una de mentira-, cada uno
con su perfil de dispositivo (User-Agent) y su perfil de red (buena, mala,
inestable, o sin cobertura del todo), pasando por los MISMOS caminos que un
móvil de verdad: sesión de jugador, `/api/heartbeat`, `/api/advance` con
cobertura, y `node_completed` en `/api/events/sync` sin ella.

Usa `httpx.AsyncClient` con `ASGITransport`: peticiones de VERDAD contra la
aplicación entera -enrutado, límites de peticiones, sesión de jugador,
detector de duplicados- pero sin abrir ningún puerto ni salir de la
Raspberry. Es la misma idea que `scripts/simular-carga.py` desde fuera con
hilos y urllib; esto es la versión que vive dentro del proceso y que puede
disparar el panel de administración con un botón.

Los jugadores simulados llevan el prefijo `SIM_`. La sesión se firma
directamente con `player_session_security.create_player_session_token`, que
no exige que el nombre esté en la lista de jugadores configurados -esa
exigencia es de `/player/<nombre>`, la pantalla, no del token en sí-, así
que este módulo no necesita tocar la configuración para nada.

Pero `/api/events/sync` -el camino SIN cobertura- sí exige un perfil
CONOCIDO por otra guardia distinta (`resolve_known_player_profile`, contra
`player_profiles`). `/api/advance` no tiene esa guardia -cae a un perfil
sintético para cualquier nombre-, así que las dos rutas se comportaban
distinto con el mismo SIM_XX. Quien llama desde fuera (`main.run_simulation_bench`)
registra los SIM_XX como perfiles de verdad MIENTRAS dura la simulación, y
los quita al terminar -pase lo que pase-, para que las dos rutas se prueben
igual y nadie se quede viendo un jugador de mentira en el panel después.

`borrar_rastro_de_simulacion` limpia lo que dejan en game_state, cronómetros
y posición en vivo -eso sí es cosa de este módulo, no de la config-.
"""
from __future__ import annotations

import asyncio
import random
import time
import uuid

import httpx

from backend.app.security.player_session import create_player_session_token

PERFILES_DISPOSITIVO = {
    "iphone": (
        "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) "
        "AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1"
    ),
    "android": (
        "Mozilla/5.0 (Linux; Android 13) AppleWebKit/537.36 "
        "(KHTML, like Gecko) Chrome/120 Mobile Safari/537.36"
    ),
}

# Cada perfil de red decide DOS cosas: cuánto tarda cada petición -para medir
# cómo se comporta la interfaz con respuestas lentas de verdad, no de mentira-
# y si el nodo se completa por el camino directo o por la cola offline.
PERFILES_RED = {
    "buena": {"retraso_ms": (0, 80), "duplicado_prob": 0.0, "sin_cobertura": False},
    "mala": {"retraso_ms": (400, 1800), "duplicado_prob": 0.12, "sin_cobertura": False},
    "inestable": {"retraso_ms": (150, 2600), "duplicado_prob": 0.25, "sin_cobertura": False},
    # Sin cobertura del todo: la ruta entera se completa en local y se manda
    # de una vez al final, como un móvil que sale del monte y recupera la
    # red -el caso que de verdad importa probar-.
    "sin_cobertura": {"retraso_ms": (0, 0), "duplicado_prob": 0.0, "sin_cobertura": True},
}

MAX_JUGADORES = 8
MAX_NODOS = 15
DEFAULT_TIMEOUT_S = 20.0


def nombre_simulado(indice: int) -> str:
    return f"SIM_{indice + 1:02d}"


def _elegir_dispositivo(perfil: str, indice: int) -> str:
    if perfil == "mixed":
        perfil = "iphone" if indice % 2 == 0 else "android"
    return PERFILES_DISPOSITIVO.get(perfil, PERFILES_DISPOSITIVO["android"])


def hay_progreso_real_en_marcha(perfiles_reales: list[dict], niveles: dict) -> list[str]:
    """¿Algún jugador DE VERDAD (no SIM_) ya lleva camino andado?

    "No tocar la ruta con gente jugando" es la norma de fondo del proyecto
    (ver docs/plan-de-mejora.md §1.2): lanzar el banco a mitad de un evento
    real mete jugadores de mentira en medio de la partida de verdad. Devuelve
    los nombres para que el aviso sea concreto, no un "no" sin más.
    """
    en_marcha = []
    for perfil in perfiles_reales:
        pid = str(perfil.get("id") or perfil.get("display_name") or "").strip()
        if not pid or pid.startswith("SIM_"):
            continue
        nivel = niveles.get(pid)
        if isinstance(nivel, dict):
            nivel = nivel.get("level", 0)
        if isinstance(nivel, (int, float)) and nivel > 0:
            en_marcha.append(pid)
    return en_marcha


async def _peticion(
    client: httpx.AsyncClient,
    metodo: str,
    url: str,
    *,
    json_body: dict | None,
    retraso_rango: tuple[float, float],
    resultados: list[dict],
    etiqueta: str,
) -> httpx.Response:
    """La cookie de sesión va puesta en el CLIENTE, no aquí: pasarla en cada
    petición está desaprobado en httpx -el propio cliente avisa- porque no
    deja claro si debe persistir entre peticiones o no. Cada jugador
    simulado tiene su cliente propio, así que fijarla una vez al crearlo no
    tiene ninguna ambigüedad."""
    retraso_s = random.uniform(*retraso_rango) / 1000.0
    if retraso_s:
        await asyncio.sleep(retraso_s)

    t0 = time.perf_counter()
    try:
        respuesta = await client.request(metodo, url, json=json_body, timeout=DEFAULT_TIMEOUT_S)
        ms = (time.perf_counter() - t0) * 1000
        resultados.append({"tipo": etiqueta, "estado": respuesta.status_code, "ms": round(ms, 1)})
        return respuesta
    except httpx.HTTPError as exc:
        ms = (time.perf_counter() - t0) * 1000
        resultados.append({"tipo": etiqueta, "estado": type(exc).__name__, "ms": round(ms, 1)})
        raise


async def _jugador_simulado(
    *,
    app,
    nombre: str,
    dispositivo_ua: str,
    perfil_red: dict,
    stages: list[dict],
    cookie_name: str,
    session_ttl_s: int,
    session_secret: str,
) -> dict:
    token = create_player_session_token(nombre, ttl_seconds=session_ttl_s, secret=session_secret)

    resultados: list[dict] = []
    errores: list[str] = []
    inicio = time.perf_counter()

    transport = httpx.ASGITransport(app=app)
    async with httpx.AsyncClient(
        transport=transport, base_url="http://sim.local", headers={"User-Agent": dispositivo_ua}
    ) as client:
        # Un cliente por jugador, con su propia cookie: nada de compartir
        # tarro de galletas entre SIM_01 y SIM_02 corriendo a la vez.
        client.cookies.set(cookie_name, token)

        if perfil_red["sin_cobertura"]:
            # Toda la ruta se "completa" en local -sin mandar nada- y se
            # sincroniza de una vez al final, en orden: el móvil que sale del
            # monte con la cola llena.
            eventos = [
                {
                    "client_event_id": f"{nombre}-{indice}-{uuid.uuid4().hex[:8]}",
                    "type": "node_completed",
                    "node_id": str(stage.get("id")),
                    "payload": {"code": "OK", "level_before": indice},
                }
                for indice, stage in enumerate(stages)
            ]
            try:
                respuesta = await _peticion(
                    client,
                    "POST",
                    "/api/events/sync",
                    json_body={"user": nombre, "events": eventos},
                    retraso_rango=(0, 0),
                    resultados=resultados,
                    etiqueta="events_sync_lote",
                )
                cuerpo = respuesta.json()
                for evento in cuerpo.get("events", []):
                    if evento.get("status") not in ("synced", "ignored"):
                        errores.append(f"{evento.get('type')}: {evento.get('error') or evento.get('status')}")
            except httpx.HTTPError as exc:
                errores.append(f"events_sync: {exc}")
        else:
            for indice, stage in enumerate(stages):
                lat = stage.get("lat")
                lon = stage.get("lon")
                if lat is not None and lon is not None:
                    try:
                        await _peticion(
                            client,
                            "POST",
                            "/api/heartbeat",
                            json_body={"user": nombre, "lat": lat, "lon": lon, "accuracy": 12, "gps_status": "ok"},
                            retraso_rango=perfil_red["retraso_ms"],
                            resultados=resultados,
                            etiqueta="heartbeat",
                        )
                    except httpx.HTTPError:
                        pass  # el latido nunca bloquea el avance; es sólo el punto en el mapa

                try:
                    respuesta = await _peticion(
                        client,
                        "POST",
                        "/api/advance",
                        json_body={"user": nombre, "code": "OK", "time_spent_ms": 1500, "level_before": indice},
                        retraso_rango=perfil_red["retraso_ms"],
                        resultados=resultados,
                        etiqueta="advance",
                    )
                except httpx.HTTPError as exc:
                    errores.append(f"advance nodo {indice}: {exc}")
                    break

                cuerpo = respuesta.json()
                if cuerpo.get("status") != "ok":
                    errores.append(f"advance nodo {indice}: {cuerpo.get('status')} ({cuerpo.get('reason', '')})")
                    break

                # El eco: un móvil con mala cobertura reenvía la misma
                # petición porque cree que la primera se perdió. El servidor
                # tiene que reconocerla como duplicado, NO avanzar dos veces.
                if random.random() < perfil_red["duplicado_prob"]:
                    try:
                        eco = await _peticion(
                            client,
                            "POST",
                            "/api/advance",
                            json_body={"user": nombre, "code": "OK", "time_spent_ms": 1500, "level_before": indice},
                            retraso_rango=(50, 300),
                            resultados=resultados,
                            etiqueta="advance_eco",
                        )
                        cuerpo_eco = eco.json()
                        if not cuerpo_eco.get("duplicate"):
                            errores.append(
                                f"eco nodo {indice}: no se reconoció como duplicado (nivel {cuerpo_eco.get('level')})"
                            )
                    except httpx.HTTPError as exc:
                        errores.append(f"eco nodo {indice}: {exc}")

    duracion_ms = round((time.perf_counter() - inicio) * 1000, 1)

    return {
        "nombre": nombre,
        "dispositivo": dispositivo_ua,
        "duracion_ms": duracion_ms,
        "peticiones": resultados,
        "errores": errores,
    }


async def ejecutar_simulacion(
    *,
    app,
    stages: list[dict],
    jugadores: int,
    dispositivo: str,
    red: str,
    cookie_name: str,
    session_ttl_s: int,
    session_secret: str,
    obtener_nivel,
) -> dict:
    """Lanza `jugadores` simulados a la vez por la misión real.

    `obtener_nivel(nombre) -> int` se pasa desde fuera -no se importa
    `main`- para poder comprobar, al terminar, que el nivel guardado de cada
    uno cuadra con los nodos que de verdad completó.
    """
    jugadores = max(1, min(int(jugadores), MAX_JUGADORES))
    stages = stages[: max(1, min(len(stages), MAX_NODOS))]
    perfil_red = PERFILES_RED.get(red, PERFILES_RED["mala"])

    tareas = [
        _jugador_simulado(
            app=app,
            nombre=nombre_simulado(i),
            dispositivo_ua=_elegir_dispositivo(dispositivo, i),
            perfil_red=perfil_red,
            stages=stages,
            cookie_name=cookie_name,
            session_ttl_s=session_ttl_s,
            session_secret=session_secret,
        )
        for i in range(jugadores)
    ]

    inicio = time.perf_counter()
    resultados_jugadores = await asyncio.gather(*tareas)
    duracion_total_ms = round((time.perf_counter() - inicio) * 1000, 1)

    todas_las_peticiones = [p for j in resultados_jugadores for p in j["peticiones"]]
    tiempos = sorted(p["ms"] for p in todas_las_peticiones)

    def percentil(q: float) -> float:
        if not tiempos:
            return 0.0
        return tiempos[min(len(tiempos) - 1, int(len(tiempos) * q))]

    for jugador in resultados_jugadores:
        nivel_final = obtener_nivel(jugador["nombre"])
        jugador["nivel_final"] = nivel_final
        jugador["nodos_esperados"] = len(stages)
        if nivel_final != len(stages) and not jugador["errores"]:
            jugador["errores"].append(
                f"nivel guardado ({nivel_final}) no cuadra con los {len(stages)} nodos de la ruta"
            )

    return {
        "device": dispositivo,
        "network": red,
        "player_count": jugadores,
        "stage_count": len(stages),
        "duration_ms": duracion_total_ms,
        "total_requests": len(todas_las_peticiones),
        "latency_p50_ms": round(percentil(0.5), 1),
        "latency_p95_ms": round(percentil(0.95), 1),
        "players": resultados_jugadores,
        "players_with_errors": sum(1 for j in resultados_jugadores if j["errores"]),
    }


def borrar_rastro_de_simulacion(*, niveles: dict, timers: dict, posiciones: dict) -> list[str]:
    """Los tres diccionarios YA CARGADOS, sin sus claves `SIM_*`. Puro: quien
    llama decide cómo guardar cada uno de vuelta."""
    borrados = [clave for clave in niveles if str(clave).startswith("SIM_")]

    for clave in list(niveles.keys()):
        if str(clave).startswith("SIM_"):
            del niveles[clave]
    for clave in list(timers.keys()):
        if str(clave).startswith("SIM_"):
            del timers[clave]
    for clave in list(posiciones.keys()):
        if str(clave).startswith("SIM_"):
            del posiciones[clave]

    return sorted(set(borrados))
