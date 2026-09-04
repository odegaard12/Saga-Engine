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
import math
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


def zonas_muertas_aleatorias(
    n_cortes: int,
    duracion_min: float = 0.04,
    duracion_max: float = 0.12,
    semilla: int | None = None,
) -> list[tuple[float, float]]:
    """`n_cortes` tramos sin cobertura, repartidos SIN pisarse por toda la
    ruta -no un solo tramo fijo como "corte", ni un patrón regular como
    "a_saltos": vaguadas de verdad no vienen a intervalos iguales-.

    Cada tramo dura entre `duracion_min` y `duracion_max` de la ruta.
    `semilla` fija el resultado -para que una prueba "larga" se pueda
    repetir exactamente igual, cortes en los mismos sitios, si hace falta
    comparar dos pasadas-.
    """
    generador = random.Random(semilla)
    tramos: list[tuple[float, float]] = []
    intentos = 0

    while len(tramos) < n_cortes and intentos < n_cortes * 40:
        intentos += 1
        duracion = generador.uniform(duracion_min, duracion_max)
        ini = generador.uniform(0.0, max(0.0, 1.0 - duracion))
        fin = min(1.0, ini + duracion)

        if any(ini < existente_fin and fin > existente_ini for existente_ini, existente_fin in tramos):
            continue

        tramos.append((ini, fin))

    return sorted(tramos)

# Cada perfil de red decide TRES cosas: cuánto tarda cada petición -para
# medir cómo se comporta la interfaz con respuestas lentas de verdad, no de
# mentira-, si a veces reenvía la misma petición -el eco-, y si hay algún
# tramo de la ruta SIN cobertura (`zona_muerta`).
#
# "mala" e "inestable" no son números inventados: "mala" calca el "Slow 3G"
# de Chrome DevTools/Lighthouse (~150 ms de latencia base, ~2000 ms por
# petición bajo carga -es el preset estándar de la industria para "cobertura
# mala pero hay cobertura", no un número al azar). "inestable" va más allá
# de cualquier preset con nombre a propósito -el tramo con vaguada y roca por
# medio, donde ni Slow 3G llega-.
#
# `zona_muerta` es (inicio, fin) como fracción de la ruta -0.0 a 1.0-, o
# `None` si nunca se pierde la señal. Dentro de esa franja los nodos se
# completan en LOCAL -como jugaría alguien de verdad, sin enterarse de que
# no hay cobertura- y se mandan de golpe al primer nodo que ya esté fuera de
# la franja: el móvil que recupera la señal a la vuelta de una vaguada.
PERFILES_RED = {
    "buena": {"retraso_ms": (0, 80), "duplicado_prob": 0.0, "zona_muerta": None},
    "mala": {"retraso_ms": (400, 2000), "duplicado_prob": 0.12, "zona_muerta": None},
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
    # Cobertura a saltos: no un tramo muerto, sino repicar dentro y fuera de
    # cobertura TODA la ruta -el móvil que va por un camino con árboles a un
    # lado, sombra de antena, entra y sale-. patron_saltos=(3, 1): de cada 3
    # nodos, 1 sin cobertura. Cada cruce vacía su propia cola; si alguno se
    # pierde o se duplica, ahí se vería.
    "a_saltos": {
        "retraso_ms": (300, 1400),
        "duplicado_prob": 0.10,
        "zona_muerta": None,
        "patron_saltos": (3, 1),
    },
    # Móvil viejo: alguien que no ha vuelto a abrir la app desde hace meses,
    # con el service worker de una versión anterior. No manda 'level_before'
    # -el campo se añadió para el eco/adelanto, ver el comentario de
    # game.py::advance-. El propio código del servidor dice que un cliente
    # sin él "sigue funcionando igual que antes": este perfil comprueba esa
    # frase, no se la cree porque lo diga un comentario.
    "cliente_antiguo": {
        "retraso_ms": (200, 900),
        "duplicado_prob": 0.0,
        "zona_muerta": None,
        "omitir_level_before": True,
    },
    # Ruta larga y caótica: "todas las casuísticas a la vez", no una sola
    # variable movida. Empieza YA sin cobertura -llega al punto de salida
    # sin señal, como quien sale de casa sin datos y la coge en el monte-,
    # luego SEIS tramos sueltos más, repartidos sin patrón y de duración
    # distinta -no un intervalo regular como "a_saltos"-, y GPS degradado
    # todo el rato -a veces sin fix, a veces con 30-90 m de desviación
    # real, no el punto exacto del nodo-. Semilla fija: la misma prueba,
    # exactamente en los mismos sitios, para poder comparar dos pasadas.
    "ruta_larga_caotica": {
        "retraso_ms": (300, 1600),
        "duplicado_prob": 0.15,
        "zona_muerta": (0.0, 0.08),
        "zonas_muertas": zonas_muertas_aleatorias(
            6, duracion_min=0.05, duracion_max=0.14, semilla=20260903
        ),
        "gps_calidad": "degradado",
        # Este perfil es EL que se pidió "que lleve tiempo analizar" (ver
        # docs/plan-de-mejora.md): un paseo comprimido 6x, no 25x, para que la
        # prueba larga dure de verdad minutos, no segundos, y el ritmo entre
        # nodos se parezca al de un jugador andando, no al de una API en bucle.
        "factor_velocidad": 6.0,
    },
}

# 20, no 8: "con 15 jugadores ahoga el ancho de banda, no la Pi" es un
# hallazgo real de esta misión (ver memoria del proyecto), y el tope
# anterior ni dejaba LLEGAR a probar ese escenario -se quedaba corto por
# debajo del número que de verdad importa comprobar-.
MAX_JUGADORES = 20
# 40, no 15: "quiero rutas largas" -una misión real de este proyecto ronda
# la decena de nodos, pero una prueba que solo llegue hasta ahí no deja
# ver qué pasa con MÁS cortes repartidos en MÁS tramo. 40 es margen de
# sobra sin ser una ruta absurda.
MAX_NODOS = 40
DEFAULT_TIMEOUT_S = 20.0

# Ritmo de paseo humano: 1.3 m/s (~4.7 km/h) es el valor medio citado en
# literatura de movilidad peatonal para adultos en terreno llano -ni carrera
# ni paseo dominguero-. Sin esto, el banco mandaba heartbeat+advance de un
# nodo al siguiente en milisegundos, muy por debajo de
# HEARTBEAT_MIN_INTERVAL_SECONDS (2s): disparaba 429 que no significaban
# nada, un móvil de verdad jamás pega dos heartbeats así de pegados porque
# tarda MINUTOS en andar de un nodo al siguiente.
PASO_HUMANO_MPS = 1.3

# El paseo real se comprime para que una ruta de varios km no tarde minutos
# u horas en simularse. A 25x, un tramo de 100 m (unos 77 s andando) se
# queda en ~3 s de banco -por encima del suelo de 2 s del heartbeat en la
# inmensa mayoría de tramos reales, sin que la prueba se eternice-.
FACTOR_VELOCIDAD_DEFECTO = 25.0


def distancia_metros(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    """Haversine: distancia en línea recta entre dos puntos GPS, en metros.

    No es la distancia real andada -un camino serpentea, esto no-, pero es
    la misma aproximación que ya usa el resto del proyecto para "cuánto
    falta" y es más que suficiente para dosificar el ritmo del banco."""
    radio_tierra_m = 6_371_000.0
    fi1, fi2 = math.radians(lat1), math.radians(lat2)
    dfi = math.radians(lat2 - lat1)
    dlambda = math.radians(lon2 - lon1)
    a = math.sin(dfi / 2) ** 2 + math.cos(fi1) * math.cos(fi2) * math.sin(dlambda / 2) ** 2
    return radio_tierra_m * 2 * math.asin(min(1.0, math.sqrt(a)))


def _coords_stage(stage: dict) -> tuple[float, float] | None:
    location = stage.get("location") if isinstance(stage.get("location"), dict) else {}
    lat = location.get("lat", stage.get("lat"))
    lon = location.get("lon", stage.get("lon"))
    if lat is None or lon is None:
        return None
    return float(lat), float(lon)


def nombre_simulado(indice: int) -> str:
    return f"SIM_{indice + 1:02d}"


def perfiles_temporales_con_sim(perfiles_base: list[dict], nombres_sim: list[str]) -> list[dict]:
    """Los perfiles de siempre + uno solo/temporal por cada SIM_XX.

    Compartido por `main.run_simulation_bench` (los quita al momento, todo
    pasa dentro de una sola petición) y por una sesión de navegador de
    verdad -Playwright u otra herramienta externa- que puede durar minutos:
    ahí hace falta dejarlos registrados mientras dura, ver
    `main.registrar_jugadores_de_simulacion`.
    """
    return list(perfiles_base) + [
        {"id": nombre, "display_name": nombre, "mode": "solo"} for nombre in nombres_sim
    ]


def quitar_perfiles_sim(perfiles: list[dict]) -> list[dict]:
    """Los mismos perfiles, sin ningún SIM_*."""
    return [p for p in perfiles if not str(p.get("id", "")).startswith("SIM_")]


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
    offset: int = 0,
    factor_velocidad: float = FACTOR_VELOCIDAD_DEFECTO,
) -> dict:
    """`offset` es para retomar una partida ya empezada -una sesión nueva,
    token nuevo, pero el mismo jugador y el nivel que YA tenía guardado en
    el servidor-. `stages` es solo el tramo pendiente; `offset` es cuánto
    llevaba antes, para que `level_before` hable en los mismos números que
    ya conoce el servidor. Ver `simular_partida_larga_con_pausa`."""
    token = create_player_session_token(nombre, ttl_seconds=session_ttl_s, secret=session_secret)

    resultados: list[dict] = []
    errores: list[str] = []
    nodos_en_corte: list[int] = []
    inicio = time.perf_counter()

    zona_muerta = perfil_red.get("zona_muerta")
    patron_saltos = perfil_red.get("patron_saltos")
    zonas_muertas = perfil_red.get("zonas_muertas")
    gps_calidad = perfil_red.get("gps_calidad")
    omitir_level_before = bool(perfil_red.get("omitir_level_before"))
    total = len(stages)

    def cuerpo_advance(indice: int) -> dict:
        """El cuerpo de /api/advance. Un móvil viejo (perfil
        'cliente_antiguo') no manda 'level_before' -el campo no existía en
        su versión-: el propio código de game.py::advance dice que sin él
        "se procesa la petición" igual, así que esto es lo que comprueba esa
        promesa de verdad."""
        cuerpo = {"user": nombre, "code": "OK", "time_spent_ms": 1500}
        if not omitir_level_before:
            cuerpo["level_before"] = indice
        return cuerpo

    def sin_cobertura_en(indice: int) -> bool:
        if zona_muerta:
            ini, fin = zona_muerta
            fraccion = indice / total if total else 0.0
            if ini <= fraccion < fin:
                return True

        if patron_saltos:
            # (cada_cuantos, cuantos_seguidos): de cada grupo de
            # "cada_cuantos" nodos, los primeros "cuantos_seguidos" van sin
            # cobertura. A diferencia de zona_muerta -un solo tramo-, esto
            # cruza la franja muerta y vuelve a cobertura VARIAS veces en la
            # misma ruta: cada cruce tiene que vaciar su propia cola sin
            # perder ni duplicar nada, no solo el primero.
            cada, seguidos = patron_saltos
            if cada > 0 and (indice % cada) < seguidos:
                return True

        if zonas_muertas:
            # Varios tramos SUELTOS, de duración y sitio distintos -no un
            # patrón regular-. Es lo que genera zonas_muertas_aleatorias():
            # una ruta larga de verdad no pierde cobertura a intervalos
            # iguales, pierde donde hay una vaguada, y cada vaguada dura lo
            # suyo.
            fraccion = indice / total if total else 0.0
            for ini, fin in zonas_muertas:
                if ini <= fraccion < fin:
                    return True

        return False

    def cuerpo_heartbeat(lat, lon) -> dict | None:
        """Con gps_calidad='degradado': a veces GPS bueno, a veces sin fix
        -el móvil manda el latido igual, sin coordenadas, como hace uno de
        verdad cuando el GPS no engancha bajo árboles o entre edificios- y a
        veces con una desviación real de metros, no el punto exacto del
        nodo. Devuelve None cuando este latido en concreto no lleva
        coordenadas -pero SÍ se manda, es lo que probaría "sin GPS" de un
        corte total-.
        """
        if gps_calidad != "degradado":
            return {"user": nombre, "lat": lat, "lon": lon, "accuracy": 12, "gps_status": "ok"}

        tirada = random.random()
        if tirada < 0.15:
            return {"user": nombre, "gps_status": "unavailable"}
        if tirada < 0.35:
            # Deriva real: 30-90 m de error, como un GPS de móvil bajo mala
            # cobertura celeste, no el punto exacto.
            deriva_m = random.uniform(30, 90)
            deriva_grados = deriva_m / 111_000  # ~111 km por grado de latitud
            angulo = random.uniform(0, 2 * math.pi)
            return {
                "user": nombre,
                "lat": lat + deriva_grados * math.cos(angulo),
                "lon": lon + deriva_grados * math.sin(angulo),
                "accuracy": round(deriva_m),
                "gps_status": "ok",
            }
        return {"user": nombre, "lat": lat, "lon": lon, "accuracy": 12, "gps_status": "ok"}

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
        # Coordenada del último nodo EN VIVO -no de cada nodo, aunque haya
        # pasado por un corte de por medio-: durante un corte no se manda
        # nada al servidor, así que el heartbeat/advance de después del corte
        # no necesita esperar el paseo por el tramo sin cobertura, solo el
        # tramo desde el último punto que sí habló con el servidor.
        ultima_coord_viva: tuple[float, float] | None = None

        for indice_local, stage in enumerate(stages):
            # indice_local: posición dentro de ESTE tramo -es lo que mira
            # sin_cobertura_en, junto con `total` (también de este tramo)-.
            # indice: el nivel real, el que ya conoce el servidor. Iguales
            # salvo que offset > 0 -una sesión que retoma-.
            indice = indice_local + offset

            if sin_cobertura_en(indice_local):
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

            # get_runtime_stages() -lo que usa esta simulación siempre, ver
            # ejecutar_simulacion()- ya viene normalizado a "version 2":
            # las coordenadas viven en stage["location"]["lat"/"lon"], NO en
            # stage["lat"]/["lon"] a secas. Con el nombre plano, esto
            # devolvía None SIEMPRE -no solo en el tramo sin cobertura-, así
            # que /api/heartbeat nunca se llegó a mandar en ninguna prueba,
            # pese a que el docstring del módulo lo prometía. Encontrado
            # añadiendo la degradación de GPS: los heartbeats no aparecían
            # en el informe de ningún jugador, ni con cobertura buena.
            coords = _coords_stage(stage)

            # El paseo real: nada de disparar heartbeat+advance del nodo
            # siguiente en milisegundos. Si hay coordenadas de este nodo y
            # del último nodo en vivo, la distancia entre los dos manda
            # cuánto se tarda -a paso humano, comprimido por
            # factor_velocidad-. Sin coordenadas en alguno de los dos -pasa
            # con nodos mal cargados- no hay de dónde sacar la distancia, así
            # que no se espera nada: mejor un tramo sin pausa que inventarse
            # una.
            if coords and ultima_coord_viva:
                distancia_m = distancia_metros(*ultima_coord_viva, *coords)
                factor = factor_velocidad if factor_velocidad > 0 else FACTOR_VELOCIDAD_DEFECTO
                espera_s = distancia_m / PASO_HUMANO_MPS / factor
                if espera_s > 0:
                    await asyncio.sleep(espera_s)
            if coords:
                ultima_coord_viva = coords

            lat, lon = coords if coords else (None, None)
            if lat is not None and lon is not None:
                try:
                    await _peticion(
                        client,
                        "POST",
                        "/api/heartbeat",
                        json_body=cuerpo_heartbeat(lat, lon),
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
                    json_body=cuerpo_advance(indice),
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
                        json_body=cuerpo_advance(indice),
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
    factor_velocidad = perfil_red.get("factor_velocidad", FACTOR_VELOCIDAD_DEFECTO)

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
            factor_velocidad=factor_velocidad,
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


async def simular_partida_larga_con_pausa(
    *,
    app,
    stages: list[dict],
    dispositivo: str,
    cookie_name: str,
    session_ttl_s: int,
    session_secret: str,
    obtener_nivel,
    punto_de_pausa: float = 0.5,
) -> dict:
    """"¿Se guarda bien todo?" en una frase: un jugador de mentira llega
    hasta la mitad de la ruta -o hasta `punto_de_pausa`, como fracción-,
    CIERRA esa sesión -token tirado, como quien deja el móvil sin batería y
    vuelve horas después, o simplemente cierra la pestaña-, y retoma con un
    token NUEVO y una sesión NUEVA desde donde dice el SERVIDOR que se
    quedó -no desde donde el cliente cree, que es justo la diferencia con
    un simple reintento-. Perfil de red "buena" a propósito: aquí lo que se
    prueba es la costura entre dos sesiones, no la cobertura.

    Dos comprobaciones, no una: el nivel INTERMEDIO (justo tras la pausa,
    antes de que la segunda sesión toque nada) y el nivel FINAL. Si solo se
    mirara el final, un fallo que se autocorrige en la segunda sesión -por
    ejemplo, que la pausa no guardara nada y la segunda sesión repitiera
    toda la ruta desde 0- podría acabar dando el mismo número final sin que
    hubiera pasado nada bueno por en medio.
    """
    stages = stages[: max(1, min(len(stages), MAX_NODOS))]
    total = len(stages)
    corte = max(1, min(total - 1, round(total * punto_de_pausa))) if total > 1 else total
    nombre = nombre_simulado(0)
    perfil = PERFILES_RED["buena"]
    dispositivo_ua = _elegir_dispositivo(dispositivo, 0)

    primera_sesion = await _jugador_simulado(
        app=app,
        nombre=nombre,
        dispositivo_ua=dispositivo_ua,
        perfil_red=perfil,
        stages=stages[:corte],
        cookie_name=cookie_name,
        session_ttl_s=session_ttl_s,
        session_secret=session_secret,
    )

    nivel_tras_pausa = obtener_nivel(nombre)

    segunda_sesion = await _jugador_simulado(
        app=app,
        nombre=nombre,
        dispositivo_ua=dispositivo_ua,
        perfil_red=perfil,
        stages=stages[corte:],
        cookie_name=cookie_name,
        session_ttl_s=session_ttl_s,
        session_secret=session_secret,
        offset=corte,
    )

    nivel_final = obtener_nivel(nombre)

    errores = list(primera_sesion["errores"]) + list(segunda_sesion["errores"])
    if nivel_tras_pausa != corte:
        errores.append(
            f"tras la pausa el servidor tenía nivel {nivel_tras_pausa}, se esperaba {corte}"
        )
    if nivel_final != total:
        errores.append(f"nivel final {nivel_final}, se esperaban {total} nodos")

    return {
        "nombre": nombre,
        "device": dispositivo,
        "stage_count": total,
        "punto_de_pausa": corte,
        "nivel_tras_pausa": nivel_tras_pausa,
        "nivel_final": nivel_final,
        "errores": errores,
        "peticiones_primera_sesion": primera_sesion["peticiones"],
        "peticiones_segunda_sesion": segunda_sesion["peticiones"],
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
