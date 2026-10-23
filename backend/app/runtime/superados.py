"""Nodos superados por jugador, por ID de nodo (entrega 1 de «progreso por id»).

Hoy el avance de cada jugador es un NIVEL: el índice del próximo nodo pendiente.
Un índice se desplaza al editar la misión y, con la cola sin cobertura, un
`node_completed` encolado contra el índice viejo se daba por eco y el nodo
volvía a quedar pendiente. La tabla `superados(user, node_id, ...)` guarda lo
que cada jugador superó de verdad, por id.

Esta entrega es ADITIVA: el nivel (`game_state.level`) sigue siendo la fuente
de verdad y nada lo lee de aquí; la tabla se escribe en paralelo y sirve para
decidir, en el servidor, de qué nodo habla un evento de la cola.

Todo lo de este módulo es PURO (sin SQLite ni ficheros): recibe las listas y
devuelve qué cambiar. Los ids se tratan SIEMPRE como `str`: en la misión pueden
ser números (101) o textos, y un id numérico no debe confundirse con un índice.

`superados` es {node_id: fila}, donde fila es un dict con al menos `retirado`
(0/1); las filas retiradas son nodos que ya no están en la misión (o que se
borraron y su id se reutilizó): no cuentan nunca como superadas.
"""


def _vigentes(superados):
    """Ids con fila viva (no retirada)."""
    return {
        str(clave)
        for clave, fila in (superados or {}).items()
        if not int((fila or {}).get("retirado") or 0)
    }


def nivel_derivado(ids, superados):
    """Índice del primer id vigente no superado (len(ids) si están todos)."""
    hechos_ = _vigentes(superados)
    for indice, id_nodo in enumerate(ids):
        if str(id_nodo) not in hechos_:
            return indice
    return len(ids)


def hechos(ids, superados):
    """Los ids de la misión actual que el jugador tiene superados, en orden."""
    hechos_ = _vigentes(superados)
    return [str(i) for i in ids if str(i) in hechos_]


def aplicar_nivel_numerico(ids, superados, nivel, desde_admin, ts=0, origen=None):
    """Qué cambiar en `superados` para que el jugador quede en `nivel`.

    Devuelve (altas, bajas): `altas` = {id: (ts, origen)} y `bajas` = [ids].
    - Subir a N marca `ids[puntero:N]` (origen 'avance'; 'panel' si lo pide el
      organizador). Un nivel mayor que el total cuenta como misión terminada.
    - Desde el panel el nivel es ABSOLUTO (todo lo que va desde N queda
      pendiente): se quitan los superados de `ids[N:]`, también al subir si
      había alguno suelto más allá.
    - Nivel 0 es empezar de cero: se vacía todo, retirados incluidos.
    - Sin panel nunca se quita nada: hacia atrás no se va.
    """
    ids = [str(i) for i in ids]
    nivel = max(0, min(int(nivel or 0), len(ids)))
    origen = origen or ("panel" if desde_admin else "avance")

    vivos = _vigentes(superados)
    if nivel == 0:
        return {}, [str(clave) for clave in (superados or {})]

    puntero = nivel_derivado(ids, superados)
    altas = {i: (ts, origen) for i in ids[puntero:nivel] if i not in vivos}
    bajas = []
    if desde_admin:
        bajas = [i for i in ids[nivel:] if i in vivos]
    return altas, bajas


def reindexar_al_guardar(ids_viejos, ids_nuevos, superados, terminado, nivel_nuevo, ts=0):
    """Qué cambiar en `superados` de un jugador cuando se guarda la misión.

    Devuelve (altas, bajas, retirar, diverge):
    - `retirar`: ids que estaban en la lista vieja y no en la nueva (se archivan
      con retirado=1, no se borran).
    - Política «regalar» (la misma que ya da el nivel: nada nuevo queda por
      detrás de lo que el jugador superó): si estaba TERMINADO, los ids nuevos
      pasan a superados (origen 'insercion'); si no, cada id nuevo con algún
      superado detrás en la lista nueva.
    - El nivel que calcula `reindex_player_levels` MANDA. Si el puntero derivado
      no coincide (p. ej. una reordenación: el nivel antiguo va por posición) se
      marca `diverge` y se fuerza `superados` a ese nivel (origen 'reindex').
    """
    ids_viejos = [str(i) for i in ids_viejos]
    ids_nuevos = [str(i) for i in ids_nuevos]
    viejos, nuevos = set(ids_viejos), set(ids_nuevos)
    retirar = [i for i in ids_viejos if i not in nuevos and i in (superados or {})]

    actual = {
        k: dict(v or {}, retirado=1 if (k in retirar or int((v or {}).get("retirado") or 0)) else 0)
        for k, v in (superados or {}).items()
    }
    altas = {}
    vivos = _vigentes(actual)
    for indice, id_nodo in enumerate(ids_nuevos):
        if id_nodo in viejos or id_nodo in vivos:
            continue
        if terminado or any(i in vivos for i in ids_nuevos[indice + 1 :]):
            altas[id_nodo] = (ts, "insercion")
    actual.update({k: {"retirado": 0} for k in altas})

    objetivo = min(max(0, int(nivel_nuevo or 0)), len(ids_nuevos))
    diverge = nivel_derivado(ids_nuevos, actual) != objetivo
    bajas = []
    if diverge:
        mas_altas, bajas = aplicar_nivel_numerico(ids_nuevos, actual, objetivo, True, ts=ts, origen="reindex")
        altas.update(mas_altas)
        bajas = [b for b in bajas if b not in altas]
    return altas, bajas, retirar, diverge
