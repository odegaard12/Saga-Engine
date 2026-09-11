# -*- coding: utf-8 -*-
"""El último eslabón: que la cola suba aunque la aplicación esté cerrada.

La cadena de «me quedo sin cobertura y luego vuelvo» estaba entera menos un
paso. Con la pantalla apagada y la página VIVA ya sube (4.9.10), pero si Android
CONGELA la pestaña —la aplicación en segundo plano un rato largo— ahí no corre
nada: ni el ciclo de 30 s ni ningún temporizador. El jugador acaba la ruta,
guarda el móvil, y su último nodo puede no llegar nunca.

Para eso existe Background Sync: el navegador despierta al service worker
cuando vuelve la red, aunque la página no esté abierta.

POR QUÉ SE PUEDE HACER AHORA Y NO ANTES. Un vaciado en segundo plano es un
segundo camino hacia `/api/events/sync`, y eso sólo es seguro si el servidor
aguanta que le llegue lo mismo dos veces o lo de una partida ya borrada. Las dos
cosas están puestas y verificadas contra producción:

    client_event_id      duplicados -> se contestan como duplicados
    stale_before_reset   anterior a un reinicio -> se ignora (4.9.8)

Sin esos dos candados esto habría sido una forma nueva de contar dos veces.

Ojo con el alcance: Background Sync es de Chromium (Chrome y Edge en Android).
En iOS no existe. Cubre a la mayoría, no a todos, y por eso el ciclo de 30 s se
queda donde está: esto se suma, no sustituye.
"""
from pathlib import Path

RAIZ = Path(__file__).resolve().parent.parent
SW = RAIZ / "frontend" / "public" / "sw.js"
OFFLINE = RAIZ / "frontend" / "src" / "player" / "offline" / "missionPack.ts"

ETIQUETA = "saga-cola-offline"


def sw() -> str:
    return SW.read_text(encoding="utf-8")


def test_o_service_worker_escoita_o_sync():
    assert "addEventListener('sync'" in sw(), (
        "el service worker no escucha el evento sync: con la aplicación cerrada "
        "la cola sigue sin subir"
    )
    assert ETIQUETA in sw(), "falta la etiqueta con la que se registra el sync"


def test_o_sw_manda_local_created_at():
    """Sin esa fecha, el candado del reinicio no puede hacer su trabajo."""
    assert "local_created_at" in sw(), (
        "el vaciado en segundo plano no manda local_created_at, así que un "
        "avance de una partida borrada podría resucitar a alguien"
    )


def test_o_sw_manda_o_client_event_id():
    """Es lo que evita contar dos veces si el ciclo normal ya lo subió."""
    assert "client_event_id" in sw(), (
        "sin client_event_id, el vaciado en segundo plano puede duplicar un "
        "avance que el ciclo de 30 s ya había subido"
    )


def test_o_sw_leva_as_cookies():
    """`/api/events/sync` exige pase de jugador; sin cookie son 403."""
    assert "credentials" in sw(), "el service worker no manda las credenciales"


def test_o_cliente_rexistra_o_sync_ao_encolar():
    texto = OFFLINE.read_text(encoding="utf-8")
    assert ETIQUETA in texto, (
        "nadie registra el sync al encolar un evento, así que el navegador "
        "nunca despertará al service worker"
    )


def test_non_se_marca_synced_sen_resposta_boa():
    """Marcar antes de tiempo perdería el avance para siempre."""
    texto = sw()
    assert "response.ok" in texto or "resposta.ok" in texto, (
        "el service worker no comprueba que el servidor haya aceptado antes de "
        "dar el evento por subido"
    )
