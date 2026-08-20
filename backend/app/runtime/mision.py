"""Los nodos de la misión: leerlos, validarlos y prepararlos para el jugador.

Cuarta tajada de sacar cosas de `main.py`. Este grupo es el corazón del juego y
lo usan los routers en seis sitios distintos, así que quitarlo de en medio del
resto es de lo que más despeja.

Todo lo de aquí es de sólo lectura sobre los nodos: nada toca la partida de un
jugador. Dónde están guardados lo decide quien llama, pasando la ruta.
"""
import hashlib
import json

from backend.app.runtime.core_engine import (
    normalize_stage,
    preserve_physical_stage_fields,
    validate_stage,
    _clean_code,
)
from backend.app.runtime.minigames import build_stage_minigame_runtime


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
        serializado = json.dumps(runtime_stages, sort_keys=True, default=str, ensure_ascii=False)
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


def _minigame_con_url_de_foto(node):
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

    salida["config"] = {
        **config,
        # /media/ y con extension, no /api/: Cloudflare trata /api/ como
        # dinamico y no lo cachea aunque se le pida cache de un anio.
        "image_url": f"/media/nodo/{node['id']}/{huella}.{_extension_de(dato)}",
    }
    return salida


def project_stage_for_player(raw_stage, include_runtime=False):
    """Un nodo, tal y como lo recibe el móvil.

    ⚠️ `include_runtime` decide si va el contenido jugable —el minijuego, su
    configuración, el código que acepta— o sólo el título y las coordenadas.
    Sin él, un nodo no se puede jugar sin cobertura: no tiene ni juego que
    cargar ni código que aceptar. Cualquier sitio que guarde esto como paquete
    offline tiene que pedirlo con `include_runtime=True`.
    """
    node = raw_stage if isinstance(raw_stage, dict) and raw_stage.get("version") == 2 else normalize_stage(raw_stage)

    out = {
        "id": node["id"],
        "title": node["presentation"]["title"],
        "lat": node["location"]["lat"],
        "lon": node["location"]["lon"],
        "radius": node["location"]["radius_m"],
    }

    if include_runtime:
        out.update({
            "content": node["presentation"]["content"],
            "type": node["interaction"]["type"],
            "config": _config_sen_duplicados(node),
            "minigame": _minigame_con_url_de_foto(node),
            "entry": node["entry"],
            "success": node["success"],
            "requirements": node.get("requirements", {"items": []}),
            "messages": node["messages"],
        })

    return preserve_physical_stage_fields(node, out)


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
