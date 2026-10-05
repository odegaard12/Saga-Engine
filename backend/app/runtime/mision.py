"""Los nodos de la misión: leerlos, validarlos y prepararlos para el jugador.

Cuarta tajada de sacar cosas de `main.py`. Este grupo es el corazón del juego y
lo usan los routers en seis sitios distintos, así que quitarlo de en medio del
resto es de lo que más despeja.

Todo lo de aquí es de sólo lectura sobre los nodos: nada toca la partida de un
jugador. Dónde están guardados lo decide quien llama, pasando la ruta.
"""
import hashlib
import json
import math

from backend.app.runtime.core_engine import (
    normalize_stage,
    preserve_physical_stage_fields,
    validate_stage,
    _clean_code,
)
from backend.app.runtime.minigames import (
    build_stage_minigame_runtime,
    project_cuenta_senales_for_player,
    project_place_mosaic_for_player,
    project_word_trap_for_player,
    project_seeds_for_player,
)


#: Súbelo cuando cambie la FORMA de lo que `project_stage_for_player` manda al
#: móvil aunque los nodos no cambien. Ver `stages_revision`.
# 3 (5.49): el mosaico manda la respuesta de la pregunta final con hash.
# 4 (5.49): los códigos de respaldo van con hash en success.conditions.
PROYECCION_VERSION = 4


def validate_stages(raw_stages):
    if not isinstance(raw_stages, list):
        return [{"index": None, "field": "stages", "detail": "stages payload must be a list"}]

    errores = []
    for indice, stage in enumerate(raw_stages):
        if not isinstance(stage, dict):
            errores.append({"index": indice, "field": "node", "detail": "each node must be an object"})
            continue
        errores.extend(validate_stage(stage, idx=indice))

    # El moldeado del tramo tiene que caer dentro del planeta.
    #
    # `route_via` son los puntos con los que se dobla el tramo hacia este nodo.
    # El cliente ya descarta lo que no sea un par de numeros finitos, asi que la
    # basura evidente no rompe nada: el moldeado simplemente no se aplica, en
    # silencio. Pero una coordenada FUERA DE RANGO si pasa ese filtro -999 es un
    # numero finito- y se dibuja: la linea verde que el jugador tiene que seguir
    # sale disparada fuera del mapa.
    #
    # No se comprueba que esten cerca de la ruta a proposito: mover un tramo
    # lejos puede ser legitimo mientras se disenia una mision nueva.
    for indice, stage in enumerate(raw_stages):
        if not isinstance(stage, dict):
            continue
        via = stage.get("route_via")
        if via is None:
            continue
        if not isinstance(via, list):
            errores.append({"index": indice, "field": "route_via", "detail": "route_via tiene que ser una lista de pares [lat, lon]"})
            continue
        for n_punto, punto in enumerate(via):
            if not isinstance(punto, (list, tuple)) or len(punto) < 2:
                errores.append({"index": indice, "field": "route_via", "detail": f"el punto {n_punto} no es un par [lat, lon]"})
                continue
            try:
                lat, lon = float(punto[0]), float(punto[1])
            except (TypeError, ValueError):
                errores.append({"index": indice, "field": "route_via", "detail": f"el punto {n_punto} no son numeros"})
                continue
            if not (-90 <= lat <= 90) or not (-180 <= lon <= 180):
                errores.append({"index": indice, "field": "route_via", "detail": f"el punto {n_punto} cae fuera del planeta: {lat}, {lon}"})

    # Dos nodos con el mismo id mezclan sus configuraciones al guardar: uno
    # acaba con el minijuego del otro. El editor del panel ya asigna max+1 al
    # crear, pero esto es la red por debajo, para que no dependa de que el
    # cliente siga portandose bien.
    vistos = {}
    for indice, stage in enumerate(raw_stages):
        if not isinstance(stage, dict):
            continue
        id_ = stage.get("id")
        if id_ is None:
            continue
        if id_ in vistos:
            errores.append({
                "index": indice,
                "field": "id",
                "detail": f"id repetido: el nodo {indice} usa el mismo id ({id_}) que el {vistos[id_]}",
            })
        else:
            vistos[id_] = indice

    return errores


def stages_revision(runtime_stages):
    """Huella del contenido de la misión: cambia sólo si cambian los nodos.

    El móvil necesita los nodos ENTEROS para jugar sin cobertura: el minijuego,
    su configuración, la foto del mosaico y el código que acepta. Eso son 200 KB,
    y el jugador pedía la partida cada 30 segundos, al volver a la aplicación y
    al recuperar la red. En el monte, con una barra de cobertura, eso es la
    misma foto bajándose una y otra vez durante tres horas.

    Con esta huella el móvil pide lo pesado UNA vez y después sólo pregunta por
    su estado —nivel, tiempo, mochila—, que son 28 KB.
    """
    try:
        # La versión de la PROYECCIÓN entra en la huella: cuando cambia lo que
        # el servidor le manda al móvil de cada nodo (celdas de llegada de
        # «mapa mudo», rondas extra y explicación cifrada de «trampa de
        # palabras») sin que cambie ningún nodo, los móviles con el paquete
        # guardado deben bajarse el nuevo. Con la huella sólo de los nodos se
        # quedaban con el contenido viejo hasta que alguien tocase la misión.
        serializado = json.dumps(
            {"proyeccion": PROYECCION_VERSION, "nodos": runtime_stages},
            sort_keys=True,
            default=str,
            ensure_ascii=False,
        )
    except (TypeError, ValueError):
        # Antes que dar una huella falsa —que dejaría al jugador con nodos
        # viejos para siempre—, se declara "no sé": el móvil bajará todo.
        return ""

    return hashlib.sha1(serializado.encode("utf-8")).hexdigest()[:16]


# Lo bastante gordo para que viajar dos veces se note. Por debajo de esto no
# compensa la complicacion de mirarlo.
_DUPLICADO_GORDO = 2048


def _config_sen_duplicados(node):
    """La config del editor, sin lo gordo que ya viaja en la del minijuego.

    Medido contra produccion el 2026-08-20: el paquete del jugador son 203 KB, y
    160 de esos KB son UNA foto repetida —el mosaico del nodo final, en
    `config` y en `minigame.config`, byte a byte la misma—. Por eso el paquete
    comprime tan mal, un 32 %: dentro va base64 de un WebP, que ya esta
    comprimido y no se deja.

    Quitarla de aqui no cambia nada para el jugador: `configDelNodo.ts` mezcla
    las dos y la del minijuego PISA a la del editor, asi que la foto le llega
    igual. Su propio comentario dice que quitar uno de los dos "es trabajo del
    servidor"; esto es esa parte, hecha en pequenio.

    Se quita SOLO lo gordo y SOLO cuando es identico. `game_id` y todo lo que
    decide la identidad del nodo se lee de aqui en varios sitios y no se toca.
    """
    config = node["interaction"]["config"]
    if not isinstance(config, dict):
        return config

    delJuego = build_stage_minigame_runtime(node) or {}
    delJuego = delJuego.get("config") if isinstance(delJuego, dict) else None
    if not isinstance(delJuego, dict):
        return config

    return {
        clave: valor
        for clave, valor in config.items()
        if not (
            isinstance(valor, str)
            and len(valor) > _DUPLICADO_GORDO
            and delJuego.get(clave) == valor
        )
    }


def _extension_de(dato_uri):
    """La extension que le toca a una foto, sacada de su tipo."""
    tipo = dato_uri[5:].split(";")[0].strip().lower()
    return {"image/webp": "webp", "image/jpeg": "jpg", "image/png": "png"}.get(tipo, "bin")


def _minigame_con_url_de_foto(node, fotos_por_url=False):
    """El minijuego, con la foto tambien anunciada por su propia URL.

    Va JUNTO al `image_data_url`, no en su lugar. Un movil con la aplicacion
    vieja cacheada seguiria pidiendo la foto de dentro del JSON, y quitarsela
    de golpe le dejaria el mosaico en blanco sin cobertura, que es el fallo mas
    caro que ha tenido esto. Primero se anuncia; retirar la copia de dentro es
    otro paso, y sólo cuando el cliente sepa pedirla por la URL.

    Un campo que el cliente no conoce no le hace nada: lo ignora.
    """
    import main

    salida = build_stage_minigame_runtime(node)
    if not isinstance(salida, dict):
        return salida

    config = salida.get("config")
    if not isinstance(config, dict):
        return salida

    dato = config.get("image_data_url")
    if not isinstance(dato, str) or not dato.startswith("data:"):
        return salida

    huella = main.huella_de_imagen(dato)
    if not huella:
        return salida

    nueva = {
        **config,
        # /media/ y con extension, no /api/: Cloudflare trata /api/ como
        # dinamico y no lo cachea aunque se le pida cache de un anio.
        "image_url": f"/media/nodo/{node['id']}/{huella}.{_extension_de(dato)}",
    }

    # La copia de dentro SOLO se quita si el cliente ha dicho que sabe pedirla
    # por la URL. Un movil con la aplicacion vieja cacheada sigue esperandola
    # aqui, y quitarsela de golpe le dejaria el mosaico en blanco sin cobertura:
    # el fallo mas caro que ha tenido esto. Que lo pida el cliente y no lo
    # decida el servidor es lo que hace este cambio seguro de desplegar.
    if fotos_por_url:
        nueva.pop("image_data_url", None)

    salida["config"] = nueva
    return salida


def _config_del_nodo(node):
    """Config efectiva de `node`: interaction.config, o si no hay, node.config.

    Misma resolución que usa `kind_del_nodo` para leer `game_id` -factorizada
    para que `project_stage_for_player` mire exactamente lo mismo al decidir
    si hay que ocultar el punto real de un nodo "mapa mudo".
    """
    interaccion = node.get("interaction") if isinstance(node.get("interaction"), dict) else {}
    config = interaccion.get("config") if isinstance(interaccion.get("config"), dict) else {}
    if not config and isinstance(node.get("config"), dict):
        config = node["config"]
    return config or {}


def fuzzy_search_circle(node_id, real_lat, real_lon, search_radius_m):
    """Círculo de búsqueda difuso para "mapa mudo": el centro NO es el punto real.

    El desplazamiento es "aleatorio pero determinista": se saca de un hash
    estable de `node_id` -no de `random.random()`-, así que el mismo nodo
    siempre difumina igual (no cambia entre peticiones ni al reiniciar el
    servidor), pero un jugador no puede predecirlo sin conocer el hash.

    El punto real SIEMPRE queda dentro del círculo devuelto, con margen: el
    desplazamiento se limita al 35-70% del radio de búsqueda, y ese radio
    tiene un suelo de 150 m aunque el admin configure algo menor o inválido.
    """
    radio = search_radius_m
    try:
        radio = float(radio)
    except (TypeError, ValueError):
        radio = 0.0
    if not (radio > 0):
        radio = 250.0
    radio = max(radio, 150.0)

    digest = hashlib.sha256(str(node_id or "").encode("utf-8", errors="replace")).digest()
    # Dos enteros de 4 bytes del hash -> dos fracciones estables en [0, 1).
    frac_angulo = int.from_bytes(digest[0:4], "big") / 2**32
    frac_distancia = int.from_bytes(digest[4:8], "big") / 2**32

    angulo_rad = frac_angulo * 2 * math.pi
    # 35%-70% del radio: ni pegado al centro ni fuera del círculo.
    offset_m = radio * (0.35 + 0.35 * frac_distancia)

    norte_m = offset_m * math.cos(angulo_rad)
    este_m = offset_m * math.sin(angulo_rad)

    lat_centro = real_lat + (norte_m / 111320.0)
    lon_centro = real_lon + (este_m / (111320.0 * max(0.2, math.cos(math.radians(real_lat)))))

    return {"lat": lat_centro, "lon": lon_centro, "radius_m": radio}


#: "Mapa mudo": el móvil NO conoce el punto real, sólo el círculo difuso. Para
#: saber SIN COBERTURA si ha llegado se le manda, en vez del punto, el conjunto
#: de celdas de una cuadrícula que cubren el radio real del nodo, cada una
#: como un hash salado. El móvil pasa su posición a celda, la hashea y mira si
#: está en el conjunto.
#:
#: Trade-off (elegido a propósito frente a "el móvil acepta la cercanía al
#: círculo difuso", que era lo que había y completaba el nodo a 250 m del
#: sitio): con la cuadrícula fija y el centro difuso público, alguien que
#: sepa programar puede probar las ~3 000 celdas del círculo y dar con las
#: buenas. Es el mismo nivel de defensa que `answer_hash`: no se lee el punto
#: a ojo ni en el paquete ni en el mapa, pero no aguanta a un atacante con
#: DevTools -el modo prueba, que existe siempre, es un salto mucho más
#: barato-. La barrera real es que el servidor revisa las muestras de GPS que
#: el móvil manda como evidencia (ver runtime/evidencia.py) y lo anota.
MAPA_MUDO_CELDA_M = 8.0
#: Suelo del radio real: con radios de 5 m el GPS de monte no llegaría nunca.
MAPA_MUDO_RADIO_MINIMO_M = 15.0
_METROS_POR_GRADO = 111320.0


def mapa_mudo_celda(centro_lat, centro_lon, lat, lon, celda_m=MAPA_MUDO_CELDA_M):
    """(i, j) de la celda que contiene (lat, lon) en el plano local del centro.

    El JS del móvil (player/utils/mapaMudo.ts) hace exactamente esta cuenta.
    """
    dy = (float(lat) - float(centro_lat)) * _METROS_POR_GRADO
    dx = (float(lon) - float(centro_lon)) * _METROS_POR_GRADO * max(0.2, math.cos(math.radians(float(centro_lat))))
    return int(math.floor(dx / celda_m)), int(math.floor(dy / celda_m))


def mapa_mudo_sal(node_id):
    return hashlib.sha256(f"{node_id}:mapa-mudo".encode("utf-8", errors="replace")).hexdigest()[:16]


def mapa_mudo_hash_celda(sal, i, j):
    return hashlib.sha256(f"{sal}:{int(i)}:{int(j)}".encode("utf-8")).hexdigest()[:16]


def mapa_mudo_verificador(node, centro_lat, centro_lon):
    """Lo que viaja al móvil para comprobar la llegada sin conocer el punto.

    `centro_*` es el centro DIFUSO que ya recibe el jugador: sirve de origen
    de la cuadrícula. Devuelve `{celda_m, sal, hashes}`.
    """
    ubicacion = node["location"]
    radio = max(float(ubicacion.get("radius_m") or 0), MAPA_MUDO_RADIO_MINIMO_M)
    celda = MAPA_MUDO_CELDA_M

    ry = (float(ubicacion["lat"]) - float(centro_lat)) * _METROS_POR_GRADO
    rx = (float(ubicacion["lon"]) - float(centro_lon)) * _METROS_POR_GRADO * max(0.2, math.cos(math.radians(float(centro_lat))))

    sal = mapa_mudo_sal(node["id"])
    hashes = set()
    for i in range(int(math.floor((rx - radio) / celda)), int(math.floor((rx + radio) / celda)) + 1):
        for j in range(int(math.floor((ry - radio) / celda)), int(math.floor((ry + radio) / celda)) + 1):
            # Distancia del punto real al cuadrado de la celda.
            cx = min(max(rx, i * celda), (i + 1) * celda)
            cy = min(max(ry, j * celda), (j + 1) * celda)
            if math.hypot(rx - cx, ry - cy) <= radio:
                hashes.add(mapa_mudo_hash_celda(sal, i, j))

    return {"celda_m": celda, "sal": sal, "hashes": sorted(hashes)}


def hot_cold_band_es(distance_m, search_radius_m):
    """Pista de calor en 3 palabras: frío / templado / caliente. Nunca un número.

    Las bandas son relativas al radio de búsqueda del propio nodo -no a una
    distancia fija en metros-, así un círculo grande y uno pequeño se sienten
    igual de "jugables" para el jugador.
    """
    radio = search_radius_m
    try:
        radio = float(radio)
    except (TypeError, ValueError):
        radio = 0.0
    if not (radio > 0):
        radio = 250.0

    try:
        distancia = float(distance_m)
    except (TypeError, ValueError):
        return "frio"

    proporcion = distancia / radio
    if proporcion > 0.66:
        return "frio"
    if proporcion > 0.33:
        return "templado"
    return "caliente"


def kind_del_nodo(node):
    """
    checkpoint / mapa_mudo / qr / coleccionable / minijuego.

    Es lo que decide la FORMA del nodo en el mapa 3D (base redonda,
    cuadrada, hexagonal o triangular) y su icono. Va siempre en la
    proyección pública: no dice nada del contenido —ni qué minijuego es, ni
    su configuración, ni el código—, sólo de qué clase de sitio es.

    El coleccionable va antes que el QR a propósito: lo que le importa al
    jugador es que ahí hay algo que recoger, aunque se recoja escaneando.
    Sin esta rama los diez nodos de la ruta real salían como "minijuego" y
    todos tenían la misma forma en el mapa.
    """
    interaccion = node.get("interaction") if isinstance(node.get("interaction"), dict) else {}
    tipo = str(interaccion.get("type") or node.get("type") or "").lower()
    config = _config_del_nodo(node)
    # El motor normaliza los tipos: "checkpoint" pasa a signal_hunt con
    # game_id simple_checkpoint, y "qr_collectible" a circuit_matrix con
    # game_id qr_collectible. Mirar sólo el tipo daba "minijuego" para todo
    # (medido en la ruta real: 10 de 10) y los nodos salían todos iguales.
    juego = str(config.get("game_id") or "").lower()
    en_el_mapa = bool(config.get("is_map_collectible")) or bool(node.get("is_map_collectible"))
    fisico = str(node.get("physical_node_kind") or node.get("physical_item_kind") or "").lower()
    # "mapa_mudo" es su propio kind, NO "checkpoint": el jugador tiene que
    # llegar por GPS igual que un checkpoint -por eso queda fuera de
    # "minijuego" y el antitrampas no le exige tiempo mínimo de partida
    # (ver anti_cheat.py, sólo mide "minijuego")-, pero el mapa necesita
    # distinguirlo para ocultar el marcador y dibujar el círculo difuso en
    # su lugar. `project_stage_for_player` lo revierte a "checkpoint" en
    # cuanto el jugador lo completa.
    if juego == "mapa_mudo":
        return "mapa_mudo"
    if tipo == "checkpoint" or juego == "simple_checkpoint":
        return "checkpoint"
    # Un QR que deja objeto EN EL MAPA es un coleccionable; el que sólo se
    # escanea es un QR. Es la distinción que hace el editor con esa casilla.
    if en_el_mapa:
        return "coleccionable"
    if "qr" in juego or "qr" in tipo:
        return "qr"
    if "collectible" in fisico or "coleccionable" in fisico:
        return "coleccionable"
    return "minijuego"


#: Claves de la config de un nodo que llevan el código de respaldo en claro.
CLAVES_CON_CODIGO = (
    "answer",
    "rune",
    "code",
    "success_code",
    "fallback_code",
    "physical_fallback_code",
    "accepted_codes",
)


def hash_codigo_de_nodo(codigo, sal) -> str:
    """sha256(sal + ':' + código limpio). La MISMA función que el móvil
    (`sha256Hex` de utils/sha256.ts) para comprobar el código sin red.

    No es una defensa fuerte -un código corto se fuerza-, pero el código ya no
    se lee a ojo en el paquete de la misión ni en las herramientas del navegador.
    """
    texto = f"{sal or ''}:{_clean_code(codigo)}"
    return hashlib.sha256(texto.encode("utf-8")).hexdigest()


def sal_de_codigo(node_id) -> str:
    return f"{'' if node_id is None else node_id}:codigo"


def exito_para_el_jugador(node):
    """`success` del nodo sin los códigos en claro: `hash` + `salt` en su lugar.

    La condición interna de los minijuegos (`minigame_ok`) sigue tal cual: es la
    misma palabra para todos los nodos y el servidor no la acepta tecleada.
    """
    exito = node.get("success") if isinstance(node.get("success"), dict) else {}
    sal = sal_de_codigo(node.get("id"))
    condiciones = []
    for condicion in exito.get("conditions") or []:
        if not isinstance(condicion, dict):
            continue
        if condicion.get("kind") == "minigame_ok":
            condiciones.append(dict(condicion))
            continue
        valor = _clean_code(condicion.get("value"))
        if not valor:
            continue
        condiciones.append({"kind": condicion.get("kind"), "hash": hash_codigo_de_nodo(valor, sal), "salt": sal})
    return {**exito, "conditions": condiciones}


def _sin_codigos_en_claro(config):
    if not isinstance(config, dict):
        return config
    return {clave: valor for clave, valor in config.items() if clave not in CLAVES_CON_CODIGO}


def project_stage_for_player(raw_stage, include_runtime=False, fotos_por_url=False, completed=False, player_id=None):
    """Un nodo, tal y como lo recibe el móvil.

    ⚠️ `include_runtime` decide si va el contenido jugable —el minijuego, su
    configuración, el código que acepta— o sólo el título y las coordenadas.
    Sin él, un nodo no se puede jugar sin cobertura: no tiene ni juego que
    cargar ni código que aceptar. Cualquier sitio que guarde esto como paquete
    offline tiene que pedirlo con `include_runtime=True`.

    `completed` -si este jugador YA superó este nodo- decide si un nodo
    "mapa mudo" muestra su punto real o el círculo difuso. La comprobación de
    proximidad que de verdad completa el nodo (ver `game.py`/`anti_cheat.py`)
    lee siempre `node["location"]` -las coordenadas guardadas en el servidor-,
    nunca lo que este proyecta hacia el jugador, así que difuminar aquí no
    afecta a si el nodo se puede completar: sólo a qué ve el jugador ANTES de
    completarlo.

    `player_id` -quién pide el nodo- decide, SOLO para "cuenta_senales", qué
    UNA de las 2-5 preguntas que escribió el organizador le toca a este
    jugador (hash(player_id + node_id), estable entre recargas/offline) y
    sustituye la respuesta en claro por su hash salado: ver
    `project_cuenta_senales_for_player` en minigames.py. Sin `player_id` -p.ej.
    una llamada vieja o de test- se elige la pregunta 0 y NO se filtra la
    lista completa; por eso todo sitio que sirva el nodo a un jugador real
    tiene que pasar `player_id`.
    """
    node = raw_stage if isinstance(raw_stage, dict) and raw_stage.get("version") == 2 else normalize_stage(raw_stage)

    kind_real = kind_del_nodo(node)
    oculto = kind_real == "mapa_mudo" and not completed

    lat = node["location"]["lat"]
    lon = node["location"]["lon"]
    radius = node["location"]["radius_m"]

    if oculto:
        config_mm = _config_del_nodo(node)
        circulo = fuzzy_search_circle(node["id"], lat, lon, config_mm.get("search_radius_m"))
        lat, lon, radius = circulo["lat"], circulo["lon"], circulo["radius_m"]

    out = {
        "id": node["id"],
        "title": node["presentation"]["title"],
        "lat": lat,
        "lon": lon,
        "radius": radius,
        # Qué clase de nodo es, para dibujarlo: no revela contenido jugable.
        "kind": kind_del_nodo(node),
    }
    if kind_real == "mapa_mudo" and completed:
        # Ya jugado: se ve como un checkpoint normal, sin nada que ocultar.
        out["kind"] = "checkpoint"

    if include_runtime:
        config_efectiva = _config_sen_duplicados(node)
        minigame_efectivo = _minigame_con_url_de_foto(node, fotos_por_url)

        # "Cuenta las señales": la config del editor y la del minijuego
        # traen las 2-5 preguntas CON su respuesta en claro (lo que escribió
        # el organizador). Nunca deben llegar así al móvil -ver
        # project_cuenta_senales_for_player en minigames.py-: se sustituyen
        # aquí, justo antes de salir hacia el jugador, por SOLO la pregunta
        # asignada a `player_id` y su respuesta ya hasheada.
        if str(_config_del_nodo(node).get("game_id") or "").lower() == "cuenta_senales":
            if isinstance(config_efectiva, dict):
                proyectada = project_cuenta_senales_for_player(config_efectiva, node["id"], player_id)
                config_efectiva = {**config_efectiva, **proyectada}
                config_efectiva.pop("questions", None)
            if isinstance(minigame_efectivo, dict) and isinstance(minigame_efectivo.get("config"), dict):
                proyectada_mg = project_cuenta_senales_for_player(minigame_efectivo["config"], node["id"], player_id)
                nuevo_mg_config = {**minigame_efectivo["config"], **proyectada_mg}
                nuevo_mg_config.pop("questions", None)
                minigame_efectivo = {**minigame_efectivo, "config": nuevo_mg_config}

        # "Trampa de palabras": el banco ENTERO de preguntas trampa (con su
        # índice correcto en claro) vive en la config del editor/minijuego,
        # igual que `questions` de cuenta_senales arriba. Se sustituye aquí,
        # justo antes de salir hacia el jugador, por SOLO las `n_rounds`
        # rondas que le tocan a `player_id`, cada una con su respuesta ya
        # hasheada (ver project_word_trap_for_player en minigames.py).
        if str(_config_del_nodo(node).get("game_id") or "").lower() == "trampa_palabras":
            if isinstance(config_efectiva, dict):
                proyectada_wt = project_word_trap_for_player(config_efectiva, node["id"], player_id)
                config_efectiva = {**config_efectiva, **proyectada_wt}
                config_efectiva.pop("questions", None)
            if isinstance(minigame_efectivo, dict) and isinstance(minigame_efectivo.get("config"), dict):
                proyectada_wt_mg = project_word_trap_for_player(
                    minigame_efectivo["config"], node["id"], player_id
                )
                nuevo_mg_config_wt = {**minigame_efectivo["config"], **proyectada_wt_mg}
                nuevo_mg_config_wt.pop("questions", None)
                minigame_efectivo = {**minigame_efectivo, "config": nuevo_mg_config_wt}

        # Mosaico: la respuesta de la pregunta final sale con hash, nunca en
        # claro (ver project_place_mosaic_for_player).
        if str(_config_del_nodo(node).get("game_id") or "").lower() == "place_mosaic":
            if isinstance(config_efectiva, dict):
                config_efectiva = {
                    **config_efectiva,
                    **project_place_mosaic_for_player(config_efectiva, node["id"]),
                }
                config_efectiva.pop("final_correct_index", None)
            if isinstance(minigame_efectivo, dict) and isinstance(minigame_efectivo.get("config"), dict):
                nuevo_mg_config_mo = {
                    **minigame_efectivo["config"],
                    **project_place_mosaic_for_player(minigame_efectivo["config"], node["id"]),
                }
                nuevo_mg_config_mo.pop("final_correct_index", None)
                minigame_efectivo = {**minigame_efectivo, "config": nuevo_mg_config_mo}

        # Simón y laberinto fijo: la semilla de serie era la misma para todo el
        # mundo (uno apuntaba el patrón y lo pasaba). Se cambia aquí, al salir
        # hacia el jugador, por una de ese nodo y ese jugador, salvo que el
        # organizador haya fijado una (ver project_seeds_for_player).
        if str(_config_del_nodo(node).get("game_id") or "").lower() in ("sequence_code", "tilt_maze"):
            if isinstance(config_efectiva, dict):
                config_efectiva = {
                    **config_efectiva,
                    **project_seeds_for_player({**_config_del_nodo(node), **config_efectiva}, node["id"], player_id),
                }
            if isinstance(minigame_efectivo, dict) and isinstance(minigame_efectivo.get("config"), dict):
                minigame_efectivo = {
                    **minigame_efectivo,
                    "config": {
                        **minigame_efectivo["config"],
                        **project_seeds_for_player(minigame_efectivo["config"], node["id"], player_id),
                    },
                }

        # "Mapa mudo" aún sin completar: el móvil no tiene el punto real, así
        # que se le da con qué comprobar la llegada (ver mapa_mudo_verificador).
        if oculto:
            verificador = mapa_mudo_verificador(node, lat, lon)
            if isinstance(config_efectiva, dict):
                config_efectiva = {**config_efectiva, "arrival": verificador}
            if isinstance(minigame_efectivo, dict) and isinstance(minigame_efectivo.get("config"), dict):
                minigame_efectivo = {
                    **minigame_efectivo,
                    "config": {**minigame_efectivo["config"], "arrival": verificador},
                }

        # Los códigos de finalización (respaldo/emergencia, runa) no salen en
        # claro: en `success.conditions` va su hash salado y de la config se
        # quitan las copias. El móvil compara el hash de lo que se teclea (ver
        # `stageAcceptsLocalCode` en offline/missionPack.ts).
        config_efectiva = _sin_codigos_en_claro(config_efectiva)
        if isinstance(minigame_efectivo, dict) and isinstance(minigame_efectivo.get("config"), dict):
            minigame_efectivo = {**minigame_efectivo, "config": _sin_codigos_en_claro(minigame_efectivo["config"])}

        out.update({
            "content": node["presentation"]["content"],
            "type": node["interaction"]["type"],
            "config": config_efectiva,
            "minigame": minigame_efectivo,
            "entry": node["entry"],
            "success": exito_para_el_jugador(node),
            "requirements": node.get("requirements", {"items": []}),
            "messages": node["messages"],
        })
        # El objeto de regalo del minijuego: el móvil lo mete en la mochila al
        # superarlo (también sin cobertura) y enseña su mensaje.
        if isinstance(node.get("reward"), dict):
            out["reward"] = dict(node["reward"])

    proyectado = preserve_physical_stage_fields(node, out)

    if oculto:
        # `route_via`/`route_track` son el trazado que dobla la línea guía
        # HACIA el nodo -es decir, hacia el punto real-. `preserve_physical_stage_fields`
        # los copia siempre desde el nodo crudo; en un nodo "mapa mudo" activo
        # eso apuntaría al sitio exacto que se está ocultando, así que se
        # quitan de la proyección (el trazado hacia el SIGUIENTE nodo, si lo
        # hay, no se ve afectado: cada nodo lleva su propio `route_via`).
        proyectado.pop("route_via", None)
        proyectado.pop("route_track", None)

    return proyectado


def stage_accepts_code(raw_stage, code, manual=False):
    """¿Este código supera el nodo?

    `manual` marca que viene de una casilla escrita a mano —el código de
    respaldo—, no de un minijuego ganado. Importa porque el motor añade a todos
    los nodos una condición interna con la que los minijuegos avisan de que se
    han superado. Esa palabra la acepta CUALQUIER nodo: escrita en la casilla de
    respaldo saltaba el que fuera, sin los dos minutos de penalización y sin
    jugar. Desde una casilla de texto ya no vale.
    """
    node = raw_stage if isinstance(raw_stage, dict) and raw_stage.get("version") == 2 else normalize_stage(raw_stage)
    enviado = _clean_code(code)

    if not enviado:
        return False

    for condicion in node["success"]["conditions"]:
        if manual and condicion.get("kind") == "minigame_ok":
            continue
        esperado = _clean_code(condicion.get("value"))
        if esperado and enviado == esperado:
            return True

    # El código impreso en la pegatina ES el código del nodo. Sin esto, escanear
    # el QR correcto guardaba el objeto pero no completaba el nodo, y teclear
    # "SAGA_01" como respaldo tampoco valía.
    for esperado in stage_qr_payloads(raw_stage):
        if esperado and enviado == esperado:
            return True

    return False


def stage_qr_payloads(raw_stage):
    """Códigos impresos en las pegatinas QR de un nodo.

    Se miran tres sitios porque el editor los ha ido guardando en sitios
    distintos según la versión, y los nodos viejos siguen ahí.
    """
    if not isinstance(raw_stage, dict):
        return []

    valores = [raw_stage.get("qr_payload")]

    config = raw_stage.get("config")
    if isinstance(config, dict):
        valores.append(config.get("qr_payload"))

    fisico = raw_stage.get("physical_qr")
    if isinstance(fisico, dict):
        valores.append(fisico.get("payload"))

    return [_clean_code(valor) for valor in valores if valor]
