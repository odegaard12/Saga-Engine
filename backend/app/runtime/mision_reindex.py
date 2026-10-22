"""Reindexar el progreso del jugador cuando se edita la misión.

El nivel guardado de cada jugador es un ÍNDICE dentro de la lista de nodos,
no el id del nodo: apunta al PRÓXIMO nodo pendiente (0 = ninguno superado
todavía, len(stages) = misión terminada). Editar la misión desde el panel
-borrar un nodo anterior, insertar uno nuevo- desplaza esa lista sin que
cambie lo que el jugador ya superó de verdad, así que el índice guardado
deja de señalar al nodo correcto: un jugador que llevaba el nodo 3 superado
podía aparecer saltándose el nuevo nodo 3, o -si se borraban nodos
suficientes por delante- con la misión entera dada por terminada sin haber
jugado nada de eso. Documentado desde hace tiempo en
docs/plan-de-mejora.md §1.2.

Hasta ahora esto sólo se mitigaba a medias: el panel avisa ANTES de guardar
(`jugadoresDesprazadosPolGardado` en adminStagePersistence.ts, 4.9.31) para
que quien edita sepa que va a pasar, pero nada corregía el número guardado
DESPUÉS del guardado. Esto es esa corrección, en el servidor.

Es seguro reindexar aquí sin tocar el cliente, la cola offline ni el
contrato de red: `apply_synced_player_event` en main.py sólo rechaza un
evento `node_completed` como duplicado cuando `level_before < current_level`
-si no, siempre avanza desde el `current_level` que YA tiene el servidor-,
así que cambiar ese número aquí, en el servidor, es exactamente el caso que
ese guard ya sabe manejar.
"""


def reindex_player_levels(old_stages, new_stages, niveles):
    """Recalcula el nivel de cada jugador tras cambiar la lista de nodos.

    `niveles` es {usuario: nivel}, tal y como lo guarda `game_state`. Devuelve
    un diccionario nuevo con el mismo formato; no muta `niveles`.

    Por cada jugador se busca, yendo HACIA ATRÁS desde su último nodo
    superado, el primero que siga existiendo en `new_stages` -no tiene que
    ser ese mismo: si justo ÉSE se borró, cuenta el anterior que sobreviva-.
    Su nuevo nivel es la posición de ese nodo en la lista nueva, más uno: el
    próximo pendiente es el que va justo después. Si ninguno de los nodos
    que había superado sobrevive, vuelve al nodo 1 -no hay desde dónde
    seguir-.

    Un jugador que ya había terminado la misión entera (nivel >= nº de nodos
    de antes) no tiene "nodo actual" del que tirar -los superó todos-: sigue
    terminado, ahora con el número de nodos nuevo.
    """
    old_ids = [str(stage.get("id")) for stage in old_stages if isinstance(stage, dict)]
    posicion_nueva = {
        str(stage.get("id")): indice
        for indice, stage in enumerate(new_stages)
        if isinstance(stage, dict)
    }

    reindexados = {}
    for usuario, nivel in niveles.items():
        nivel = int(nivel or 0)

        if nivel <= 0:
            reindexados[usuario] = 0
            continue

        if nivel >= len(old_stages):
            reindexados[usuario] = len(new_stages)
            continue

        nuevo_nivel = 0
        for indice in range(nivel - 1, -1, -1):
            id_nodo = old_ids[indice]
            if id_nodo in posicion_nueva:
                nuevo_nivel = posicion_nueva[id_nodo] + 1
                break

        reindexados[usuario] = nuevo_nivel

    return reindexados


def reindexar_relojes(timers, old_stages, new_stages):
    """Recoloca los tiempos de cada jugador cuando se edita la misión.

    `stage_times_ms`, `nodos` y `saltos_ms` van por NIVEL (índice), igual que el
    nivel guardado: al borrar un nodo, el tiempo del nodo borrado se quedaba
    sumando y el del siguiente se perdía (al superar el pendiente, su tiempo se
    juntaba con el viejo de ese índice con un `max`). Medido: A 10 s, B 50 s,
    C 20 s, se borra B y se juega D en 30 s → total 90 s en vez de 60 s.

    Cada tiempo se lleva al índice NUEVO de su nodo (por el `node_id` del
    registro si lo tiene; si no, por el nodo que había en ese índice). El de un
    nodo que ya no existe se quita, y su penalización con él: los demás no lo
    van a jugar. Devuelve `timers` modificado (para `update_json`).
    """
    old_ids = [str(stage.get("id")) for stage in old_stages if isinstance(stage, dict)]
    posicion_nueva = {
        str(stage.get("id")): indice
        for indice, stage in enumerate(new_stages)
        if isinstance(stage, dict)
    }
    if not isinstance(timers, dict):
        return timers

    def _nuevo_indice(clave, registro=None):
        if not str(clave).isdigit():
            return None
        nodo = registro.get("node_id") if isinstance(registro, dict) and registro.get("node_id") else None
        if nodo is None:
            indice = int(clave)
            nodo = old_ids[indice] if indice < len(old_ids) else None
        return posicion_nueva.get(str(nodo)) if nodo is not None else None

    for entrada in timers.values():
        if not isinstance(entrada, dict):
            continue
        nodos = entrada.get("nodos") if isinstance(entrada.get("nodos"), dict) else {}
        quitar = 0

        nuevos_nodos = {}
        for clave, registro in nodos.items():
            indice = _nuevo_indice(clave, registro)
            if indice is None:
                quitar += int((registro or {}).get("penalty_ms") or 0) if isinstance(registro, dict) else 0
                continue
            nuevos_nodos[str(indice)] = {**registro, "level": indice} if isinstance(registro, dict) else registro

        tiempos = entrada.get("stage_times_ms") if isinstance(entrada.get("stage_times_ms"), dict) else {}
        nuevos_tiempos = {}
        for clave, ms in tiempos.items():
            indice = _nuevo_indice(clave, nodos.get(clave))
            if indice is not None:
                nuevos_tiempos[str(indice)] = ms

        saltos = entrada.get("saltos_ms") if isinstance(entrada.get("saltos_ms"), dict) else {}
        nuevos_saltos = {}
        for clave, ms in saltos.items():
            indice = _nuevo_indice(clave)
            if indice is None:
                quitar += int(ms or 0)
            else:
                nuevos_saltos[str(indice)] = ms

        entrada["stage_times_ms"] = nuevos_tiempos
        if "nodos" in entrada:
            entrada["nodos"] = nuevos_nodos
        if "saltos_ms" in entrada:
            entrada["saltos_ms"] = nuevos_saltos
        if quitar > 0 and "penalties_ms" in entrada:
            entrada["penalties_ms"] = max(0, int(entrada.get("penalties_ms") or 0) - quitar)
    return timers
