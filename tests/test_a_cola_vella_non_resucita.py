# -*- coding: utf-8 -*-
"""Un reinicio tiene que aguantar a la cola vieja del móvil.

Visto el 2026-08-17 contra producción: se reinicia a un jugador a 0 con el móvil
abierto, y al rato el servidor está otra vez en 1 solo. El móvil seguía marcando
2/10 incluso después de recargar, y sólo se recuperó borrando `localStorage` y
las tres bases de IndexedDB.

La causa NO está en el cliente: los tres sitios que leen `reset_at`
(`PlayerApp.tsx`) llaman a `aplicarResetDeRelojes` y vacían la cola. El agujero
está aquí, en el servidor.

El único candado que había era por nivel:

    if level_before is not None and level_before < current_level: -> duplicado

Y después de reiniciar a 0, un evento viejo de la partida anterior con
`level_before: 0` encaja PERFECTAMENTE: el servidor está en 0, el evento dice
que venía del 0, así que se aplica y el jugador vuelve a avanzar. El candado
protege contra avances repetidos, no contra avances de otra partida.

El dato para distinguirlos ya viajaba y nadie lo miraba: el móvil manda
`payload.local_created_at` con la fecha en que se encoló, y el servidor guarda
`reset_at` en la mochila. Si el evento es anterior al reinicio, es de la partida
que se acaba de borrar.

En día de ruta esto significa que reiniciar a alguien puede no servir de nada, y
que el organizador no tiene forma de saberlo.
"""
import os
import tempfile
import time
from datetime import datetime, timezone

os.environ.setdefault("ADMIN_PASS", "pytest_admin_password")
os.environ.setdefault("SAGA_DATA_DIR", tempfile.mkdtemp(prefix="saga-test-cola-"))

import main  # noqa: E402

from backend.app.routers.admin import reiniciar_jugador_por_completo  # noqa: E402
from backend.app.storage.runtime_store import save_stages  # noqa: E402

XOGADOR = "ColaVella"


def _preparar_nodos():
    """Tres nodos de paso. Sin esto todo se ignora por «misión completa» y las
    pruebas pasarían por el motivo equivocado."""
    save_stages(
        main.STAGES_DB,
        [
            {
                "id": i,
                "title": f"Nodo {i}",
                "lat": 42.36 + i * 0.001,
                "lon": -8.67,
                "radius": 50,
                "type": "checkpoint",
                "config": {"game_id": "simple_checkpoint", "success_code": "OK"},
                "success": {"code": "OK"},
            }
            for i in range(3)
        ],
    )


def _evento(creado_ms: int, level_before: int = 0):
    """Un node_completed encolado por el móvil, como llega de la cola."""
    momento = datetime.fromtimestamp(creado_ms / 1000, timezone.utc)
    return {
        "type": "node_completed",
        "source": "offline_queue",
        "client_event_id": f"{XOGADOR}:node_completed:{creado_ms}:proba",
        "payload": {
            "code": "OK",
            "local_progress": True,
            "level_before": level_before,
            "level_after": level_before + 1,
            "local_created_at": momento.isoformat().replace("+00:00", "Z"),
        },
    }


def _aplicar(evento):
    perfil = main.get_player_profile(XOGADOR)
    normalizado = main.normalize_player_event(evento, XOGADOR, perfil)
    return main.apply_synced_player_event(normalizado, XOGADOR, perfil)


def test_un_evento_anterior_ao_reinicio_non_avanza():
    """Lo de la partida borrada se queda fuera."""
    _preparar_nodos()
    main.set_player_progress_level(XOGADOR, 0)

    encolado_ms = int(time.time() * 1000) - 60_000  # se encoló hace un minuto
    time.sleep(0.01)
    reiniciar_jugador_por_completo(main, XOGADOR)  # ...y AHORA se reinicia
    main.set_player_progress_level(XOGADOR, 0)

    guardado = _aplicar(_evento(encolado_ms))

    assert main.get_player_progress_level(XOGADOR, 0) == 0, (
        "un avance de la partida anterior ha resucitado al jugador: el reinicio "
        "del organizador no sirve de nada"
    )
    assert guardado.get("status") == "ignored"


def test_un_evento_posterior_ao_reinicio_si_avanza():
    """Y lo de la partida nueva sigue contando: el candado no puede pasarse de listo."""
    _preparar_nodos()
    main.set_player_progress_level(XOGADOR, 0)
    reiniciar_jugador_por_completo(main, XOGADOR)
    main.set_player_progress_level(XOGADOR, 0)

    time.sleep(0.01)
    recien_encolado_ms = int(time.time() * 1000) + 1_000

    _aplicar(_evento(recien_encolado_ms))

    assert main.get_player_progress_level(XOGADOR, 0) == 1, (
        "un avance hecho DESPUÉS del reinicio se ha perdido: eso sería peor que "
        "el fallo que se está arreglando"
    )


def test_sen_marca_de_reinicio_todo_sigue_igual():
    """A quien nunca han reiniciado no le cambia nada."""
    _preparar_nodos()
    outro = "SenReinicio"
    main.set_player_progress_level(outro, 0)

    perfil = main.get_player_profile(outro)
    evento = _evento(int(time.time() * 1000) - 60_000)
    evento["client_event_id"] = f"{outro}:node_completed:sen-reinicio"
    normalizado = main.normalize_player_event(evento, outro, perfil)
    main.apply_synced_player_event(normalizado, outro, perfil)

    assert main.get_player_progress_level(outro, 0) == 1
