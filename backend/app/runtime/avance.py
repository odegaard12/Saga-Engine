"""Motor del avance: los eventos de la cola que mueven la partida (sobre todo
`node_completed`), el tiempo anotado por nodo y el premio de cada minijuego.

Sacado de `main.py` sin cambiar comportamiento (mejora 3 de la revisión de
noviembre). Igual que los `*_glue.py`, todo lo que estas funciones usan de
`main` -rutas de fichero, interruptores, funciones- se pide como `main.NOMBRE`
en el momento de la llamada: lo que un test o el arranque cambie en `main`
sigue mandando, también entre ellas (p. ej. `main.grant_stage_reward` o
`main._veredicto_por_id` sustituidos por un test). `main` re-exporta estos
nombres, y los routers los siguen pidiendo a `main`.
"""
import time
from datetime import datetime, timezone

from backend.app.runtime import desbloqueos_glue as _desbloqueos_glue
from backend.app.runtime import entradas as _entradas
from backend.app.runtime import mision as _mision
from backend.app.runtime import mochila as _mochila
from backend.app.runtime import motivos_de_rechazo as _motivos_de_rechazo


def _nodo_del_evento(event, stages, level_before, current_level):
    """El id del nodo de que trata un avance, para poder decirle al jugador cuál.

    Primero el que declara el móvil si existe en la misión; si no, el nodo al que
    decía llegar (`level_before`); si no, el que le toca al servidor.
    """
    import main
    ids = [main._as_str(stage.get("id")) for stage in stages if isinstance(stage, dict)]
    declarado = main._as_str(event.get("node_id")).strip()
    if declarado and declarado in ids:
        return declarado
    if level_before is not None and 0 <= level_before < len(ids):
        return ids[level_before]
    if 0 <= current_level < len(ids):
        return ids[current_level]
    return declarado


def _veredicto_por_id(event, ids, current_level, profile_id):
    """Qué dice el ID del nodo declarado por el móvil sobre un `node_completed`.

    Entrega 1 de «progreso por id»: `level_before` es un índice y se queda viejo si
    se edita la misión con el móvil sin cobertura (el nodo D encolado con el
    índice antiguo se cerraba como eco y D volvía a estar pendiente). El id no se
    desplaza. Devuelve:
      'puntero' - es el nodo en el que está el jugador: se acepta aunque
                  `level_before` no cuadre (el código se valida contra ESE nodo);
      'eco'     - ya está superado, o el nodo ya no existe (borrado);
      'behind'  - existe pero hay un hueco: falta un avance anterior;
      None      - sin id, o id que no se reconoce: se decide por `level_before`.
    El id es una reclamación del cliente, no una orden: el servidor sigue
    validando el código contra el nodo del puntero.
    """
    import main
    declarado = main._as_str(event.get("node_id")).strip()
    if not declarado:
        return None
    if declarado in ids:
        indice = ids.index(declarado)
        if indice == current_level:
            return "puntero"
        if indice < current_level:
            return "eco"
        filas = main.get_player_superados(main.GAME_DB, profile_id) or {}
        if declarado in filas and not int(filas[declarado].get("retirado") or 0):
            return "eco"
        return "behind"
    if main.is_retired_node(main.GAME_DB, declarado):
        return "eco"
    return None


def _comprobar_tiempo_declarado(profile_id, node, declarado_ms, instante_ms):
    """Anota cuándo se completó este nodo y MARCA (no bloquea) un tiempo imposible.

    El servidor sólo observa cuándo llega cada avance; lo que el jugador tardó
    dentro del nodo lo declara el móvil. Si lo declarado no cabe entre el avance
    anterior y éste, queda una sospecha: la clasificación no se toca. Sin hora
    fiable del avance (un evento de la cola sin `local_created_at`) no se compara.
    """
    import main
    if not instante_ms:
        return None
    # 24/11 (panel 2): el nodo del avance anterior, para la velocidad entre nodos (la misma regla en directo y en cola).
    nodo_previo_id = str((main.load_player_timers().get(profile_id) or {}).get("last_advance_node_id") or "")
    node_id = main._as_str(node.get("id")).strip() if isinstance(node, dict) else ""
    # En modo prueba la posición es simulada y se salta de nodo en nodo: ese avance no sirve de punto de partida.
    prueba = main.es_modo_prueba(profile_id)
    previo = main.record_player_advance(profile_id, instante_ms, None if prueba else (node_id or None))
    hallazgos = [main.anti_cheat_check_advance_order(profile_id, node, instante_ms, previo)]
    if previo and nodo_previo_id and nodo_previo_id != node_id and not prueba:
        nodo_previo = next((s for s in main.get_runtime_stages() if main._as_str(s.get("id")).strip() == nodo_previo_id), None)
        hallazgos.append(main.anti_cheat_check_node_to_node_speed(profile_id, nodo_previo, node, previo, instante_ms))
    declarado = _entradas.entero_seguro(declarado_ms, None, minimo=0)
    if previo and declarado:
        hallazgos.insert(0, main.anti_cheat_check_declared_time(profile_id, node, declarado, instante_ms - previo))
    # Quien llama espera UNA sospecha (o None): la más grave delante; las demás ya quedaron anotadas.
    return next((h for h in hallazgos if h), None)


def anotar_tiempo_de_nodo(
    profile_id, level, node, time_spent_ms, completado_ms, *, penalty_ms, manual, origen, sospechas=(), proximidad=None,
    evidencia=None, desfase_ms=0,
):
    """El registro del nodo superado: tiempo (declarado/observado/aplicado) y lo
    que hace falta para el vestuario (perfecto, prueba, sospechoso).

    Ver backend/app/runtime/tiempos_de_nodo.py para la regla del tiempo.
    """
    import main
    hallazgos_graves = [s for s in sospechas if isinstance(s, dict) and s.get("severity", "suspicion") == "suspicion"]
    es_minijuego = _mision.kind_del_nodo(node) == "minijuego" if isinstance(node, dict) else False
    extra = {
        "penalty_ms": int(penalty_ms or 0),
        "manual": bool(manual),
        "origen": origen,
        "es_minijuego": es_minijuego,
        # Perfecto: sin penalización, sin código a mano y sin sospecha. Lo
        # calcula el servidor; el móvil no manda ninguna «nota».
        "perfecto": es_minijuego and not manual and int(penalty_ms or 0) == 0 and not hallazgos_graves,
        "sospechoso": bool(hallazgos_graves),
        "prueba": main.es_modo_prueba(profile_id),
    }
    # Cómo se comprobó la proximidad en este nodo (modo prueba, sin GPS, cerca,
    # lejos): el panel y la exportación lo enseñan por nodo. Modo prueba cuenta
    # también como «prueba» aunque la marca de sesión ya no esté puesta.
    if isinstance(proximidad, dict) and proximidad.get("veredicto") not in (None, "no_aplica"):
        extra["proximidad"] = proximidad.get("veredicto")
        if proximidad.get("veredicto") == "modo_prueba":
            extra["prueba"] = True
    # 15/11 (H1): fuera de los minijuegos (su reloj arranca con «Comenzar»), el tiempo cuenta desde que el jugador
    # entra en el radio del nodo, según la hora de entrada que manda el móvil con el avance.
    entrada = None if es_minijuego else main.entrada_al_nodo_de_la_evidencia(evidencia, completado_ms, desfase_ms)
    return main.record_node_time(
        profile_id,
        level,
        main._as_str(node.get("id")) if isinstance(node, dict) else "",
        time_spent_ms,
        completado_ms,
        extra=extra,
        abierto_evidencia_ms=entrada,
    )


def apply_synced_player_event(normalized_event, user, profile, active=None):
    """Apply offline player events that have gameplay side effects.

    node_completed is the key local-first progression event:
    - validates the submitted code against the current official node
    - validates required items against server SQLite event history
    - consumes the required item when configured
    - advances official server progress

    `active` dice si el Registro de partida está escribiendo ahora mismo. Quien
    sincroniza una tanda lo calcula UNA vez y lo pasa (antes se releía la
    configuración por cada muestra de posición). Sin él se calcula aquí, una vez
    por evento.
    """
    import main
    event = normalized_event if isinstance(normalized_event, dict) else {}
    if active is None:
        active = main.match_log_is_active()

    if event.get("type") != "node_completed":
        # Anti-trampas del CLIENTE durante un minijuego (salir de la app /
        # abrir el selector de apps: ver useAntiTrampas.ts). Llega por esta
        # misma cola -no un endpoint aparte- para que funcione también sin
        # cobertura: es exactamente el mismo camino offline-first que ya usa
        # cualquier otro evento del jugador.
        payload = event.get("payload") if isinstance(event.get("payload"), dict) else {}
        razon = main._as_str(payload.get("anti_cheat_reason")).strip()
        profile_id_evento = main._as_str(profile.get("id") or user).strip() or "PLAYER 1"
        if razon in ("left_app_during_minigame", "opened_app_switcher_during_minigame"):
            main.anti_cheat_check_client_reported_exit(
                profile_id_evento, razon, {**payload, "node_id": event.get("node_id") or payload.get("node_id")}
            )

        # Registro de partida: todo lo demás que llega por la cola offline
        # -nodo abierto, QR, mochila, minijuego, equipo- se anota tal cual,
        # con su tipo de evento como tipo de fila. node_completed tiene su
        # propio camino más abajo porque además avanza progreso de verdad.
        #
        # Con la hora ORIGINAL del móvil (`client_created_at`), cuánto tardó
        # en llegar y si se creó sin cobertura: al revisar la partida en casa
        # lo que importa es cuándo pasó, no cuándo se subió.
        # Apertura de un nodo: es el «inicio» del tiempo que el servidor observa
        # en ese nodo (ver runtime/tiempos_de_nodo.py). Con la hora en que PASÓ
        # (la del móvil, ya corregida con `client_sent_at_ms`); sin ella, ahora.
        # `inicia_reloj: false` (19/10): abrir la hoja de un juego con «Comenzar» no arranca nada, sólo se registra;
        # la apertura que cuenta llega aparte, al arrancar el reloj del móvil. Sin el campo (móviles viejos), como antes.
        if event.get("type") == "node_opened":
            # 11/11: cualquier apertura (también la de la hoja, que no arranca reloj) deja constancia de que entró.
            main.record_node_entered(
                profile_id_evento,
                main._as_str(event.get("node_id")),
                main._iso_a_ms(payload.get("local_created_at")) or main._now_ms(),
            )
        if event.get("type") == "node_opened" and str(payload.get("inicia_reloj", "")).strip().lower() not in ("false", "0"):
            main.record_node_opened(
                profile_id_evento,
                main._as_str(event.get("node_id")),
                main._iso_a_ms(payload.get("local_created_at")) or main._now_ms(),
            )

        contexto = main.match_log_offline_context(payload)
        if event.get("type") == "qr_scanned":
            # Vestuario: un QR aceptado puede cerrar una regla (ver runtime/desbloqueos.py).
            main.desbloqueos_tras_evento(profile_id_evento, main._as_str(event.get("client_event_id")) or "qr")
        if event.get("type") == "position_track":
            # Los metros andados sin cobertura cuentan para las reglas de km,
            # con las mismas condiciones que el latido (GPS real, a paso de persona).
            _desbloqueos_glue.sumar_track(profile_id_evento, payload.get("samples"))
            # Todas las muestras del evento, en UNA transacción.
            main._registrar_track_de_posiciones(profile_id_evento, payload, contexto, profile, active=active)
            # Las posiciones sólo se guardan si hay partida que auditar (misión
            # programada y en marcha). Fuera de esa ventana el evento consta,
            # pero sin coordenadas: no se acumulan sitios donde estuvo la gente
            # sin un motivo.
            if not active:
                event["payload"] = {**payload, "samples": []}
        else:
            main.match_log_record(
                event.get("type") or "player_event",
                profile_id_evento,
                payload={
                    **payload,
                    "node_id": event.get("node_id"),
                    "via": payload.get("via") or "offline_queue",
                    **contexto,
                },
                client_created_at=main._as_str(payload.get("local_created_at")) or None,
                profile=profile,
                active=active,
            )
        return main.append_event(main.EVENT_LOG_DB, event)

    profile_id = main._as_str(profile.get("id") or user).strip() or "PLAYER 1"
    stages = main.get_runtime_stages()
    current_level = main.get_player_progress_level(profile_id, main.get_player_progress_level(user, 0))

    # level_before dice en qué nodo estaba el jugador al completar. Se lee ya
    # aquí porque también sirve para decir de QUÉ nodo era un avance rechazado.
    raw_payload = event.get("payload") if isinstance(event.get("payload"), dict) else {}
    level_before = _entradas.entero_seguro(raw_payload.get("level_before"), None)

    if current_level >= len(stages):
        event["status"] = "ignored"
        event["error"] = "mission_already_complete"
        event["node_id"] = main._nodo_del_evento(event, stages, level_before, current_level)
        main._registrar_avance_rechazado(event, profile_id, profile, current_level, active=active)
        return main.append_event(main.EVENT_LOG_DB, event)

    if current_level < 0:
        current_level = 0

    # La misión puede tener fecha de inicio (ver runtime/mission_schedule.py):
    # se puede descargar y prepararse con días de antelación, pero no
    # completar nodos hasta esa hora.
    #
    # A PROPOSITO no se guarda con append_event: si quedara escrito con este
    # client_event_id, el PRÓXIMO intento lo encontraría por
    # find_existing_player_client_event y lo cerraría como "duplicate" antes
    # de volver a pasar por aquí -el mismo camino que ya usa
    # already_advanced-, y el nodo no se completaría NUNCA aunque llegase la
    # hora. Sin guardar nada, cada reintento de la cola vuelve a mirar el
    # reloj desde cero.
    #
    # "failed", no "ignored": según syncPendingOfflineEvents en
    # missionPack.ts, "ignored" cierra el hueco local como si ya estuviera
    # resuelto y deja de reintentarse. "failed" con un motivo que no está en
    # RECHAZOS_DEFINITIVOS es justo lo que hace que el móvil lo vuelva a
    # mandar en el siguiente ciclo, solo.
    if main.mission_is_locked():
        event["status"] = "failed"
        event["error"] = "mission_not_started_yet"
        event["node_id"] = main._nodo_del_evento(event, stages, level_before, current_level)
        return event

    # Idempotencia: el jugador encola node_completed cuando /api/advance falla
    # (timeout con mala cobertura). Si la petición sí llegó al servidor, al
    # sincronizar la cola se avanzaba OTRA VEZ y se saltaba un nodo entero
    # dándolo por completado sin haber estado allí.
    # level_before dice en qué nodo estaba el jugador al completar: si el
    # servidor ya está por delante, el evento es un duplicado.
    #
    # Entrega 1 de «progreso por id»: si el móvil declara el id del nodo y es
    # reconocible, MANDA el id sobre `level_before` (ver `_veredicto_por_id`).
    # Un nodo borrado se contesta con el MISMO `already_advanced`: es lo que el
    # móvil viejo trata como definitivo y sin aviso (un texto nuevo se reintentaría
    # para siempre).
    ids_de_la_mision = [main._as_str(stage.get("id")) for stage in stages]
    veredicto = main._veredicto_por_id(event, ids_de_la_mision, current_level, profile_id)
    if veredicto == "eco" or (veredicto is None and level_before is not None and level_before < current_level):
        event["status"] = "ignored"
        event["error"] = "already_advanced"
        # 13/11: el avance original pudo cortarse tras subir el nivel: se completan su premio y su hora de fin.
        indice_repetido = level_before if isinstance(level_before, int) else None
        if veredicto == "eco" and main._as_str(event.get("node_id")) in ids_de_la_mision:
            indice_repetido = ids_de_la_mision.index(main._as_str(event.get("node_id")))
        if event.get("type") == "node_completed":
            main.completar_avance_repetido(user, profile_id, indice_repetido)
        if veredicto != "eco":
            # (con el id reconocido ya consta; el de un nodo borrado se conserva tal cual)
            event["node_id"] = main._nodo_del_evento(event, stages, level_before, current_level)
        event["payload"] = {
            **raw_payload,
            "server_level": current_level,
            "duplicate_of_level": level_before,
        }
        main._registrar_avance_rechazado(event, profile_id, profile, current_level, active=active)
        return main.append_event(main.EVENT_LOG_DB, event)

    # Un reinicio tiene que aguantar a la cola vieja del móvil.
    #
    # El candado de arriba es por NIVEL y protege contra avances repetidos: si el
    # servidor ya va por delante, el evento es un eco. Pero después de reiniciar a
    # alguien a 0, un evento de la partida ANTERIOR con `level_before: 0` encaja
    # perfectamente —el servidor está en 0, el evento dice que venía del 0— y le
    # vuelve a avanzar.
    #
    # Visto en producción el 2026-08-17: se reinicia a un jugador con el móvil
    # abierto y al rato el servidor está otra vez en 1 él solo. El móvil seguía
    # marcando 2/10 hasta borrarle localStorage y las tres bases de IndexedDB. En
    # día de ruta eso deja al organizador sin forma de arreglar nada.
    #
    # Lo que distingue una cosa de la otra ya viajaba y nadie lo miraba: el móvil
    # manda `payload.local_created_at` con la fecha en que encoló el avance, y
    # aquí está `reset_at`. Anterior al reinicio = partida borrada.
    #
    # Esa fecha es la del RELOJ DEL MÓVIL: quien sincroniza (ver
    # `sync_player_events`) la corrige con `client_sent_at_ms` antes de llegar
    # aquí si el móvil la manda, para que un reloj atrasado o adelantado no
    # descarte un avance legítimo ni deje resucitar uno viejo.
    reset_at = main.player_progress_reset_at(profile_id) or main.player_progress_reset_at(user)
    creado_ms = main._iso_a_ms(raw_payload.get("local_created_at"))
    # Revisión 19/10: sin fecha y con un reinicio puesto no hay forma de saber de
    # qué partida es (el móvil SIEMPRE la manda, ver eventToSyncPayload en
    # missionPack.ts): lo seguro es no dejar que deshaga el reinicio. Sin
    # reinicio no hay nada que proteger y cuenta como «ahora» (más abajo).
    if reset_at and (not creado_ms or creado_ms < reset_at):
        event["status"] = "ignored"
        event["error"] = "stale_before_reset"
        event["node_id"] = main._nodo_del_evento(event, stages, level_before, current_level)
        event["payload"] = {
            **raw_payload,
            "reset_at": reset_at,
            "event_created_ms": creado_ms,
        }
        main._registrar_avance_rechazado(event, profile_id, profile, current_level, active=active)
        return main.append_event(main.EVENT_LOG_DB, event)

    # Va por DELANTE del servidor: el móvil dice que completó el nodo N+k y el
    # servidor sigue en N. Aplicarlo era dar por bueno el nodo N (el código
    # 'OK' de un minijuego lo acepta cualquier nodo) sin que nadie lo jugara:
    # falta un avance anterior en la cola, que llegará en otra tanda. Igual que
    # /api/advance, se contesta "voy por detrás" y NO se guarda: guardado con su
    # client_event_id, el siguiente intento lo cerraría como duplicado y el nodo
    # no se completaría nunca. "failed" (no "ignored") para que el móvil lo
    # vuelva a mandar.
    if veredicto == "behind" or (veredicto is None and level_before is not None and level_before > current_level):
        event["node_id"] = main._nodo_del_evento(event, stages, level_before, current_level)
        event["payload"] = {
            **raw_payload,
            "server_level": current_level,
        }
        # 19/10/2026 (revisión): si el nodo en el que está el jugador ya se le rechazó PARA SIEMPRE (código que no
        # cuadra, objeto que falta, lejos del nodo), el avance que falta no va a llegar nunca: este y los siguientes se
        # reenviaban cada ciclo sin fin y el jugador se quedaba clavado en el servidor y en la clasificación. Se cierran
        # como rechazo definitivo; el móvil deja de insistir, vuelve al nivel del servidor y repite ese nodo.
        if main._hubo_rechazo_definitivo_en(profile_id or user, current_level, reset_at):
            event["status"] = "failed"
            event["error"] = "after_rejected_node"
            main._registrar_avance_rechazado(event, profile_id, profile, current_level, active=active)
            return main.append_event(main.EVENT_LOG_DB, event)
        event["status"] = "failed"
        event["error"] = "behind"
        return event

    current_node = stages[current_level]
    # The server is authoritative for progression. Never trust client supplied node_id
    # for node_completed events, even when the submitted code is valid.
    event["node_id"] = main._as_str(current_node.get("id"))
    payload = event.get("payload") if isinstance(event.get("payload"), dict) else {}
    submitted_code = main._event_payload_code(payload)

    # Un nodo completado sin conexión llega por aquí al recuperar la red. Si se
    # encoló desde la casilla de respaldo escrita a mano, sigue sin valer el
    # aviso interno de los minijuegos.
    if not main.stage_accepts_code(current_node, submitted_code, manual=main._as_bool(payload.get("manual"))):
        event["status"] = "failed"
        event["error"] = "invalid_completion_code"
        main._registrar_avance_rechazado(event, profile_id, profile, current_level, active=active)
        return main.append_event(main.EVENT_LOG_DB, event)

    requirement_status = main.evaluate_stage_item_requirement(current_node, profile_id)
    if requirement_status.get("required") and not requirement_status.get("ok"):
        event["status"] = "failed"
        event["error"] = "missing_required_item"
        event["payload"] = {
            **payload,
            "requirement": requirement_status,
            "level_before": current_level,
        }
        main._registrar_avance_rechazado(event, profile_id, profile, current_level, active=active)
        return main.append_event(main.EVENT_LOG_DB, event)

    # Proximidad (ver runtime/proximidad.py): sin cobertura sólo cuentan las
    # muestras que trae el propio evento. Por defecto sólo anota; con «exigir
    # proximidad» encendido rechaza un avance con GPS real fiable y lejos.
    proximidad = main.comprobar_proximidad(profile_id, current_node, payload.get("evidence"), en_linea=False)
    if proximidad.get("bloquea"):
        event["status"] = "failed"
        event["error"] = main._proximidad_motivo_rechazo()
        event["payload"] = {
            **payload,
            "level_before": current_level,
            "proximidad": {
                clave: proximidad.get(clave) for clave in ("distancia_minima_m", "tolerancia_m", "radio_m")
            },
        }
        main._registrar_avance_rechazado(event, profile_id, profile, current_level, active=active)
        return main.append_event(main.EVENT_LOG_DB, event)

    # 11/11: el aviso «OK» de un nodo que ni abrió ni pisó no vale (ver `aviso_sin_entrada`). Rechazo definitivo: el
    # móvil no lo reintenta, vuelve al nivel del servidor y repite el nodo.
    if main.aviso_sin_entrada(
        profile_id, current_node, submitted_code, main._as_bool(payload.get("manual")), payload.get("evidence"), proximidad
    ):
        event["status"] = "failed"
        event["error"] = _motivos_de_rechazo.SIN_ENTRADA
        event["payload"] = {**payload, "level_before": current_level}
        main._registrar_avance_rechazado(event, profile_id, profile, current_level, active=active)
        return main.append_event(main.EVENT_LOG_DB, event)

    if requirement_status.get("required") and requirement_status.get("consume"):
        main.append_inventory_item_used_event(user, profile_id, current_node, requirement_status)

    # Anti-trampas (ver backend/app/runtime/anti_cheat.py): sólo anota, nunca
    # bloquea la sincronización. Un evento que llegó por la cola offline es
    # justo el caso que más hace falta vigilar -nadie estaba mirando en
    # directo mientras pasaba- y el que más hay que perdonar -sin cobertura
    # el reloj del móvil y el GPS son los que hay-.
    sospechas_del_nodo = [
        main.anti_cheat_check_completion_time(profile_id, current_node, payload.get("time_spent_ms")),
        main.anti_cheat_check_future_timestamp(
            profile_id, main._iso_a_ms(raw_payload.get("local_created_at")) or None, node_id=current_node.get("id")
        ),
    ]

    # Igual que level_before arriba: un evento de la cola offline puede llegar
    # con este campo corrupto (móvil viejo, IndexedDB a medias...). Ver
    # `tiempos_de_nodo.tiempo_de_nodo`: lo que no es un número cuenta 0.
    time_spent_ms = payload.get("time_spent_ms")

    # Sólo FLAG: ¿cabe el tiempo declarado entre el avance anterior y éste?
    # `instante_ms` es la hora en que PASÓ; sin ella (o con una hora en el
    # futuro) no se compara nada.
    instante_ms = creado_ms if creado_ms and creado_ms <= main._now_ms() + 5 * 60 * 1000 else None
    sospechas_del_nodo.append(main._comprobar_tiempo_declarado(profile_id, current_node, time_spent_ms, instante_ms))
    # Revisión 19/10: para el TIEMPO DEL NODO, sin fecha (sólo llega aquí si no
    # hay reinicio, ver arriba) se completa AHORA; antes quedaba «sin_hora» sin
    # observado, y un móvil que no mandaba fecha se libraba de lo que el
    # servidor vio. La comparación de arriba sigue sin hacerse: la hora de
    # subida no es la de cuando pasó y movería el ancla de avances.
    creado_ms = creado_ms or main._now_ms()

    # El cronómetro y las penalizaciones, igual que en /api/advance.
    #
    # Aquí sólo se guardaba el tiempo del nodo: lo completado sin cobertura no
    # arrancaba el reloj de la travesía, perdía la penalización (código de
    # respaldo, fallos en el reto) y, si era el último nodo, no paraba nunca
    # el cronómetro del jugador. Justo lo que pasa cuando alguien acaba la ruta
    # en un tramo sin cobertura.
    # El mínimo lo pone el servidor, no el móvil: código a mano (2 min) y modo
    # alternativo de un juego de sensores (1 min). Ver `penalizacion_minima`.
    evidencia = payload.get("evidence")
    # 25/10 (auditoría): el respaldo paga aunque el móvil lo mande con `manual: false`.
    manual_evento = main._as_bool(payload.get("manual")) or _mision.es_codigo_de_respaldo(current_node, submitted_code)
    penalizacion_ms = main.penalizacion_minima(
        main._clamp_penalty_ms(payload.get("penalty_ms")),
        manual=manual_evento,
        evidencia=evidencia,
        node_id=current_node.get("id") if isinstance(current_node, dict) else None,
    )
    # 14/11: un punto de control sin GPS paga lo mismo que el código de respaldo (ver la función).
    penalizacion_ms = main.penalizacion_checkpoint_sin_gps(penalizacion_ms, current_node, proximidad)

    # La evidencia se revisa sólo para ANOTAR: pase lo que pase aquí, el
    # jugador avanza (motor antitrampas: flag, no bloqueo).
    hallazgos = main.anti_cheat_review_evidence(
        profile_id,
        current_node,
        evidencia,
        penalty_ms=penalizacion_ms if "penalty_ms" in payload else None,
        manual=manual_evento,
    )

    # El tiempo del nodo lo decide el servidor (ver runtime/tiempos_de_nodo.py):
    # max(declarado, observado entre la apertura y este avance), con la hora en
    # que pasó según el móvil -ya corregida- y nunca en el futuro.
    # 25/10: inicio, tiempo del nodo y penalización en una sola escritura de los relojes.
    with main.relojes_en_una_escritura(profile_id):
        main.mark_player_started(profile_id)
        main.anotar_tiempo_de_nodo(
            profile_id,
            current_level,
            current_node,
            time_spent_ms,
            creado_ms,
            penalty_ms=penalizacion_ms,
            manual=manual_evento,
            origen="offline",
            sospechas=[s for s in sospechas_del_nodo if s]
            + list(hallazgos or [])
            + ([proximidad["hallazgo"]] if proximidad.get("hallazgo") else []),
            proximidad=proximidad,
            evidencia=evidencia,
            # la hora de entrada va en el reloj del móvil: la misma corrección que ya se aplicó a `local_created_at`
            desfase_ms=_entradas.entero_seguro(payload.get("clock_offset_ms"), 0),
        )
        # Después del registro del nodo y una vez por nodo (auditoría 23/10): si una
        # escritura de después falla, la cola reintenta y no se cobra dos veces.
        main.add_node_penalty(profile_id, current_level, event["node_id"], penalizacion_ms)

    main.set_player_progress_level(profile_id, current_level + 1, ts_ms=creado_ms)

    if current_level + 1 >= len(stages):
        main.mark_player_finished(profile_id, min(creado_ms, main._now_ms()) if creado_ms else None)

    # El premio del minijuego, si lo tiene: igual que en /api/advance.
    premio = main.grant_stage_reward(user, profile_id, current_node)

    # Vestuario (ver runtime/desbloqueos.py): lo que este avance haya ganado.
    # Idempotente: reprocesar la cola no concede dos veces.
    nuevos_desbloqueos = main.desbloqueos_tras_evento(profile_id, main._as_str(event.get("client_event_id")) or f"sync:{current_level}")

    event["status"] = "synced"
    event["payload"] = {
        **payload,
        "requirement": requirement_status,
        "level_before": current_level,
        "level_after": current_level + 1,
        "server_applied": True,
        **({"reward_item_id": premio.get("item_id")} if premio else {}),
        **({"desbloqueos": nuevos_desbloqueos} if nuevos_desbloqueos else {}),
    }

    main.match_log_record(
        "advance",
        profile_id,
        payload=main.payload_de_avance_para_el_registro(
            current_node,
            current_level,
            time_spent_ms=time_spent_ms,
            penalty_ms=penalizacion_ms,
            manual=main._as_bool(payload.get("manual")),
            evidencia=evidencia,
            hallazgos=list(hallazgos or []) + main.sospecha_de_proximidad(proximidad),
            via=raw_payload.get("via") or "offline_queue",
            contexto=main.match_log_offline_context(raw_payload),
            proximidad=proximidad,
        ),
        client_created_at=main._as_str(payload.get("local_created_at")) or None,
        profile=profile,
        active=active,
    )

    return main.append_event(main.EVENT_LOG_DB, event)


def payload_de_avance_para_el_registro(
    node, level_before, *, time_spent_ms, penalty_ms, manual, evidencia, hallazgos, via, contexto, proximidad=None
):
    """La fila «avance» del Registro de partida, igual venga del móvil con red
    (/api/advance) o de la cola: nodo, tipo, juego, evidencia resumida y las
    sospechas que salieron de revisarla."""
    import main
    from backend.app.runtime import evidencia as _evidencia

    config = _mision._config_del_nodo(node) if isinstance(node, dict) else {}
    payload = {
        "node_id": node.get("id") if isinstance(node, dict) else None,
        "node_index": level_before,
        "kind": _mision.kind_del_nodo(node) if isinstance(node, dict) else None,
        "game_id": main._as_str(config.get("game_id")) or None,
        "level_before": level_before,
        "level_after": level_before + 1,
        "time_spent_ms": time_spent_ms,
        "penalty_ms": penalty_ms,
        "manual": manual,
        "via": via,
        **_evidencia.resumen_de_evidencia(node, evidencia),
        **(contexto or {}),
    }
    from backend.app.runtime import proximidad as _proximidad

    payload.update(_proximidad.resumen_para_el_registro(proximidad))
    if hallazgos:
        payload["sospechas"] = [hallazgo["reason"] for hallazgo in hallazgos]
    return payload


# Rechazos que no se arreglan reenviando: el mismo evento volvería a fallar igual.
RECHAZOS_DEFINITIVOS_DE_AVANCE = {
    "invalid_completion_code",
    "missing_required_item",
    "too_far_from_node",
    "invalid_completion_code:not_opened",  # motivos_de_rechazo.SIN_ENTRADA
}


def _anotar_rechazo_definitivo(jugador, nivel):
    import main
    if not jugador:
        return
    ahora = int(time.time() * 1000)

    def poner(datos):
        datos = datos if isinstance(datos, dict) else {}
        datos[str(jugador)] = {"level": int(nivel), "at": ahora}
        return datos

    main.update_json(main.RECHAZOS_DE_AVANCE_DB, {}, poner)


def _hubo_rechazo_definitivo_en(jugador, nivel, reset_at=None):
    """¿Se le rechazó para siempre a este jugador el nodo del nivel `nivel` (y después del último reinicio)?"""
    import main
    datos = main.load_json(main.RECHAZOS_DE_AVANCE_DB, {})
    marca = datos.get(str(jugador)) if isinstance(datos, dict) else None
    if not isinstance(marca, dict) or marca.get("level") != nivel:
        return False
    return not (reset_at and int(marca.get("at") or 0) < reset_at)


def _registrar_avance_rechazado(event, profile_id, profile, current_level, active=None):
    """Un node_completed que el servidor NO aplicó, en el Registro de partida.

    Sin esto una cola que llegaba con nodos rechazados -un código que ya no
    cuadraba, un eco de otro dispositivo- no dejaba rastro: al revisar la
    partida el jugador aparecía con nodos «que no constan».
    """
    import main
    payload = event.get("payload") if isinstance(event.get("payload"), dict) else {}
    if event.get("error") in main.RECHAZOS_DEFINITIVOS_DE_AVANCE:
        main._anotar_rechazo_definitivo(profile_id or event.get("user"), current_level)
    main.match_log_record(
        "advance_rejected",
        profile_id,
        payload={
            "node_id": event.get("node_id") or payload.get("node_id"),
            "server_level": current_level,
            "level_before": payload.get("level_before"),
            "error": event.get("error"),
            "status": event.get("status"),
            "via": payload.get("via") or "offline_queue",
            **main.match_log_offline_context(payload),
        },
        client_created_at=main._as_str(payload.get("local_created_at")) or None,
        profile=profile,
        active=active,
    )


def _registrar_track_de_posiciones(profile_id, payload, contexto, profile, active=None):
    """Las posiciones que el móvil fue guardando SIN cobertura (el latido no
    llegaba): cada una entra en el Registro de partida con su hora original.

    Todas las muestras del evento van en UNA transacción (`match_log_record_many`):
    antes cada muestra abría su conexión y hacía su commit, y un lote de 50
    eventos dejaba el servidor bloqueado ≈ 80 s (caza de fallos S2).
    """
    import main
    muestras = payload.get("samples") if isinstance(payload.get("samples"), list) else []
    nombre_visible = main.match_log_display_name(profile_id, profile)
    entradas = []
    for muestra in muestras[:60]:
        if not isinstance(muestra, dict):
            continue
        try:
            iso = datetime.fromtimestamp(float(muestra.get("t")) / 1000.0, tz=timezone.utc).isoformat()
        except (TypeError, ValueError, OverflowError, OSError):
            iso = None
        entradas.append(
            {
                "event_type": "position_sample",
                "user": profile_id,
                "display_name": nombre_visible,
                "payload": {
                    "lat": muestra.get("lat"),
                    "lon": muestra.get("lon"),
                    "accuracy": muestra.get("acc"),
                    "source": muestra.get("src") or "real",
                    "via": "offline_track",
                    **contexto,
                },
                "client_created_at": iso,
            }
        )
    return main.match_log_record_many(entradas, active=active)


def grant_stage_reward(user, profile_id, current_node):
    """Entrega el premio del minijuego al aceptar su avance. Una vez por jugador.

    Lo llaman /api/advance y la sincronización de la cola: los dos caminos por
    los que un nodo queda superado en el servidor. Si el premio ya está anotado
    (`grant_id` = `reward:<nodo>`, también lo manda el móvil por su cola) no se
    vuelve a anotar, y aunque llegase dos veces la mochila lo cuenta una sola.
    Devuelve el premio entregado (o el ya entregado), o None si el nodo no da nada.
    """
    import main
    premio = current_node.get("reward") if isinstance(current_node, dict) else None
    if not isinstance(premio, dict) or not main._as_str(premio.get("item_id")).strip():
        return None

    node_id = main._as_str(current_node.get("id")).strip()
    grant_id = main.reward_grant_id(node_id)
    eventos, copia = main._eventos_y_copia_de_mochila(profile_id)
    if _mochila.ya_entregado(eventos, grant_id, _mochila.marca_de_inventario(copia)):
        return {**premio, "grant_id": grant_id, "duplicate": True}

    main.append_event(
        main.EVENT_LOG_DB,
        {
            "type": "inventory_item_collected",
            "status": "synced",
            "source": "backend_reward",
            "user": profile_id,
            "team_id": profile_id,
            "node_id": node_id,
            "payload": {
                "inventory_item_id": premio.get("item_id"),
                "inventory_label": premio.get("label"),
                "inventory_action": "collected",
                "inventory_quantity": main._positive_int(premio.get("quantity"), 1),
                "grant_id": grant_id,
                "requested_by": main._as_str(user).strip(),
            },
        },
    )
    return {**premio, "grant_id": grant_id}
