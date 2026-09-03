"""Banco de pruebas, enganchado al panel de administración.

Simula N jugadores recorriendo la misión REAL -no una de mentira-, cada uno
con su perfil de dispositivo (User-Agent) y su perfil de red (buena, mala,
inestable, un corte de cobertura a mitad de ruta, o sin cobertura del
todo), pasando por los MISMOS caminos que un móvil de verdad: sesión de
jugador, `/api/heartbeat`, `/api/advance` con cobertura, y `node_completed`
en `/api/events/sync` sin ella.

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

# Cada perfil de red decide TRES cosas: cuánto tarda cada petición -para
# medir cómo se comporta la interfaz con respuestas lentas de verdad, no de
# mentira-, si a veces reenvía la misma petición -el eco-, y si hay algún
# tramo de la ruta SIN cobertura (`zona_muerta`).
#
# `zona_muerta` es (inicio, fin) como fracción de la ruta -0.0 a 1.0-, o
# `None` si nunca se pierde la señal. Dentro de esa franja los nodos se
# completan en LOCAL -como jugaría alguien de verdad, sin enterarse de que
# no hay cobertura- y se mandan de golpe al primer nodo que ya esté fuera de
# la franja: el móvil que recupera la señal a la vuelta de una vaguada.
PERFILES_RED = {
    "buena": {"retraso_ms": (0, 80), "duplicado_prob": 0.0, "zona_muerta": None},
    "mala": {"retraso_ms": (400, 1800), "duplicado_prob": 0.12, "zona_muerta": None},
    "inestable": {"retraso_ms": (150, 2600), "duplicado_prob": 0.25, "zona_muerta": None},
    # Sin cobertura del todo: la ruta entera se completa en local y se manda
    # de una vez al final, como un móvil que sale del monte y recupera la
    # red -el caso que de verdad importa probar-.
    "sin_cobertura": {"retraso_ms": (0, 0), "duplicado_prob": 0.0, "zona_muerta": (0.0, 1.0)},
    # Corte de cobertura A MITAD de ruta -no todo o nada-: el tramo central
    # (del 35 % al 65 % de los nodos) se completa en local; antes y después
    # va con la misma cobertura mala de siempre. Es el caso real de una
    # vaguada, un bosque cerrado o una zona de sombra de la antena, y es
    # justo el que "todo o nada" no prueba: ¿el móvil recupera BIEN al
    # volver la señal, sin perder nodos y sin duplicar los ya hechos?
    "corte": {"retraso_ms": (400, 1800), "duplicado_prob": 0.12, "zona_muerta": (0.35, 0.65)},
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
    nodos_en_corte: list[int] = []
    inicio = time.perf_counter()

    zona_muerta = perfil_red.get("zona_muerta")
    total = len(stages)

    def sin_cobertura_en(indice: int) -> bool:
        if not zona_muerta:
            return False
        ini, fin = zona_muerta
        fraccion = indice / total if total else 0.0
        return ini <= fraccion < fin

    async def vaciar_cola(client: httpx.AsyncClient, cola: list[dict]) -> None:
        """El móvil que recupera la señal: manda de golpe, en orden, todo lo
        que se completó mientras no había cobertura."""
        if not cola:
            return
        try:
            respuesta = await _peticion(
                client,
                "POST",
                "/api/events/sync",
                json_body={"user": nombre, "events": cola},
                retraso_rango=(0, 0),
                resultados=resultados,
                etiqueta="events_sync_lote",
            )
            cuerpo = respuesta.json()
            for evento in cuerpo.get("events", []):
                if evento.get("status") not in ("synced", "ignored"):
                    errores.append(f"{evento.get('type')}: {evento.get('error') or evento.get('status')}")
        except httpx.HTTPError as exc:
            errores.append(f"events_sync (corte de cobertura): {exc}")

    transport = httpx.ASGITransport(app=app)
    async with httpx.AsyncClient(
        transport=transport, base_url="http://sim.local", headers={"User-Agent": dispositivo_ua}
    ) as client:
        # Un cliente por jugador, con su propia cookie: nada de compartir
        # tarro de galletas entre SIM_01 y SIM_02 corriendo a la vez.
        client.cookies.set(cookie_name, token)

        cola_offline: list[dict] = []

        for indice, stage in enumerate(stages):
            if sin_cobertura_en(indice):
                # Se juega el nodo -el minijuego no sabe ni le importa si hay
                # cobertura-, pero no se manda nada todavía: se completa en
                # local, como una cola real de IndexedDB.
                nodos_en_corte.append(indice)
                cola_offline.append(
                    {
                        "client_event_id": f"{nombre}-{indice}-{uuid.uuid4().hex[:8]}",
                        "type": "node_completed",
                        "node_id": str(stage.get("id")),
                        "payload": {"code": "OK", "level_before": indice},
                    }
                )
                continue

            # Se acaba de recuperar la señal: lo primero, vaciar lo que
            # quedó pendiente del corte, ANTES de seguir avanzando en vivo.
            if cola_offline:
                await vaciar_cola(client, cola_offline)
                cola_offline = []

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

        # Si la ruta se acaba DENTRO del corte -zona_muerta llega hasta el
        # final, como en "sin_cobertura"-, queda por vaciar la cola.
        if cola_offline:
            await vaciar_cola(client, cola_offline)

    duracion_ms = round((time.perf_counter() - inicio) * 1000, 1)

    return {
        "nombre": nombre,
        "dispositivo": dispositivo_ua,
        "duracion_ms": duracion_ms,
        "peticiones": resultados,
        "errores": errores,
        "nodos_en_corte": nodos_en_corte,
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
