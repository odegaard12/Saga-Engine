"""La tabla de equipo por DIFERENCIAS (25/10/2026, ahorro de datos).

Cada latido (cada 30 s) devolvía la tabla ENTERA aunque casi nadie hubiese cambiado: con 14 perfiles en producción y
sólo unos pocos conectados a la vez, la mayoría de lo que viajaba eran jugadores sin conexión, siempre igual.

El servidor apunta, por perfil, la huella de lo que el móvil ve (el perfil proyectado, sin `is_self`, que depende de
quién mira) y la revisión en que cambió por última vez. El móvil manda la época y la revisión de lo último que recibió
y recibe sólo los perfiles con revisión mayor. Se manda tabla COMPLETA si:

* la época no coincide (otro arranque, o la otra Pi: comparten datos, no memoria) o el móvil no manda nada;
* la revisión del móvil es mayor que la del servidor (algo raro: mejor repartir de nuevo).

`ids` (el orden y la lista de perfiles) sólo viaja en las diferencias, cuando cambió desde la revisión del móvil: así el móvil reconstruye
la MISMA tabla que la completa, también el orden, y olvida a quien el panel borró.

El estado vive en memoria y se reinicia con el proceso: la época nueva hace que todos pidan completa una vez.
"""
from __future__ import annotations

import hashlib
import json
import os
import threading

#: Cambia en cada arranque del proceso.
EPOCA = os.urandom(4).hex()

_cerrojo = threading.Lock()
_rev = 0
#: id de perfil -> (huella, revisión en que cambió por última vez).
_perfiles: dict[str, tuple[str, int]] = {}
_ids: tuple[str, ...] = ()
_ids_rev = 0


def _huella(perfil: dict) -> str:
    limpio = {k: v for k, v in perfil.items() if k != "is_self"}
    crudo = json.dumps(limpio, sort_keys=True, separators=(",", ":"), default=str, ensure_ascii=False)
    return hashlib.sha1(crudo.encode("utf-8")).hexdigest()[:12]


def _entero(valor) -> int:
    try:
        return int(valor)
    except (TypeError, ValueError, OverflowError):
        return 0


def a_diferencias(profiles: list[dict], epoca=None, rev=None) -> dict:
    """Los campos de diferencias de la tabla de equipo para quien dice llevar (`epoca`, `rev`).

    `profiles` es la tabla completa tal y como se mandaría (con `is_self`). Devuelve `{epoca, rev, completo,
    profiles, ids?}`; los perfiles van SIN `is_self` (el móvil lo recompone con su usuario).
    """
    global _rev, _ids, _ids_rev
    ids = tuple(str(p.get("user")) for p in profiles)
    with _cerrojo:
        for p, id_ in zip(profiles, ids):
            h = _huella(p)
            anterior = _perfiles.get(id_)
            if anterior is None or anterior[0] != h:
                _rev += 1
                _perfiles[id_] = (h, _rev)
        for id_ in [k for k in _perfiles if k not in ids]:
            del _perfiles[id_]
        if ids != _ids:
            _rev += 1
            _ids, _ids_rev = ids, _rev
        actual = _rev
        ids_rev = _ids_rev
        del_movil = _entero(rev)
        completo = epoca != EPOCA or del_movil <= 0 or del_movil > actual
        enviar = [
            {k: v for k, v in p.items() if k != "is_self"}
            for p, id_ in zip(profiles, ids)
            if completo or _perfiles[id_][1] > del_movil
        ]
        salida = {"epoca": EPOCA, "rev": actual, "completo": completo, "profiles": enviar}
        if not completo and ids_rev > del_movil:
            salida["ids"] = list(ids)
    return salida
