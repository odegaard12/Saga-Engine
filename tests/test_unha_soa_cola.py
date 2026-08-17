# -*- coding: utf-8 -*-
"""Una sola cola de eventos, no dos.

Había dos almacenes distintos vaciándose contra el mismo endpoint: los eventos
físicos —escaneos, códigos a mano, objetos recogidos— en `localStorage`, y los
nodos completados en IndexedDB. Dos almacenes son dos verdades sobre lo que
falta por subir, y de ahí salieron los nodos que se repetían: el orden en que
llegaban al servidor dependía de cuál contestase antes.

Se mira el código fuente porque esto es una decisión de estructura, y lo que hay
que impedir es que vuelva a aparecer un segundo sitio donde encolar.
"""
import re
from pathlib import Path

RAIZ = Path(__file__).resolve().parent.parent
OFFLINE = RAIZ / "frontend" / "src" / "player" / "offline"

LOCAL_FIRST = OFFLINE / "localFirst.ts"
MISSION_PACK = OFFLINE / "missionPack.ts"
FISICOS = OFFLINE / "physicalEvents.ts"


def sin_comentarios(fichero: Path) -> str:
    texto = fichero.read_text(encoding="utf-8")
    texto = re.sub(r"/\*.*?\*/", "", texto, flags=re.DOTALL)
    return re.sub(r"//[^\n]*", "", texto)


def test_so_hai_un_sitio_onde_encolar():
    """`queueOfflineEvent` sólo puede estar definido en un fichero."""
    definiciones = []

    for fichero in OFFLINE.glob("*.ts"):
        if re.search(r"export (async )?function queueOfflineEvent", sin_comentarios(fichero)):
            definiciones.append(fichero.name)

    assert definiciones == ["missionPack.ts"], (
        "la cola tiene que estar en un solo sitio; encontrada en: %s" % definiciones
    )


def test_os_eventos_fisicos_van_a_esa_cola():
    codigo = sin_comentarios(FISICOS)

    assert "from './missionPack'" in codigo, (
        "los escaneos y los códigos a mano tienen que ir a la misma cola que "
        "los nodos completados"
    )


def test_localstorage_xa_non_garda_eventos():
    """Lo que queda de localFirst es estado de pantalla, partida y fotos."""
    codigo = sin_comentarios(LOCAL_FIRST)

    assert "export function queueOfflineEvent" not in codigo
    assert "export function markEventAttempt" not in codigo
    assert "export function removeQueuedEvents" not in codigo
    assert "export function buildEventSyncPayload" not in codigo


def test_o_que_quedase_na_cola_vella_non_se_perde():
    """Quien esté a mitad de ruta con escaneos sin subir no puede perderlos."""
    codigo = sin_comentarios(LOCAL_FIRST)

    assert "mudarColaVieja" in codigo
    # Se muda ANTES de sincronizar, o la primera vuelta se va sin ellos.
    assert codigo.index("mudarColaVieja(user)") < codigo.index("syncPendingOfflineEvents(user)")


def test_a_cola_vaise_en_orde():
    codigo = sin_comentarios(MISSION_PACK)

    assert ".sort(" in codigo, (
        "la clave de IndexedDB empieza por tipo y no por fecha, así que sin "
        "ordenar un evento posterior de otro tipo se cuela delante"
    )


def test_unha_sincronizacion_cada_vez():
    """Tres sitios la llaman, y a veces a la vez."""
    codigo = sin_comentarios(MISSION_PACK)

    assert "sincronizando" in codigo
    assert "siguienteIntento" in codigo, "sin espera tras fallar se machaca la red del monte"
