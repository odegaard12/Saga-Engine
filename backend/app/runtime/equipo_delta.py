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

24/11 (clasificación ligera): con `campos` (el móvil manda `equipo_campos`) un perfil que cambió ya no viaja entero,
sólo `user` y los campos que cambiaron desde la revisión del móvil (y `quitar`, los que desaparecieron). Quien se mueve
manda posición, rumbo y `last_seen`, no su nombre, su muñeco y sus tiempos en cada latido: ~90 B en vez de ~650.
"""
from __future__ import annotations

import hashlib
import json
import math
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
#: id de perfil -> {campo: (json exacto, revisión en que cambió, valor)}: lo que tiene el móvil de cada campo.
_campos: dict[str, dict[str, tuple[str, int, object]]] = {}
#: id de perfil -> {campo: revisión en que desapareció}.
_quitados: dict[str, dict[str, int]] = {}


#: 26/10 (consumo con poca cobertura): lo que el móvil NO necesita ver cambiar en cada latido. Un jugador conectado
#: pero quieto cambiaba su entrada en cada latido (last_seen sube 30 s, el GPS parado baila unos metros), así que nunca
#: se libraba de viajar. Ahora la huella ignora el ruido; la entrada sigue yendo entera en cuanto algo de verdad cambia.
#:
#: `last_seen` en cubos de 2 min MIENTRAS el jugador está en vivo: el móvil sólo lo usa para pasar a «sin conexión» a los
#: 10 min y la presencia (en vivo / sin señal) ya cambia la huella por sí sola cuando cruza sus umbrales. 15/11: cuando
#: ya NO está en vivo va exacto (y con `pos_at`): ahí es lo que se enseña en «visto hace N», y como ese jugador no manda
#: latidos, su entrada no cambia y no cuesta nada (antes «visto hace 2 min» podía ser en realidad 4).
CUBO_LAST_SEEN_S = 120
#: Una posición que se movió menos de esto desde la última que se mandó no se vuelve a mandar (ruido del GPS parado).
BANDA_MUERTA_M = 6.0
#: El rumbo en pasos de 10°: un móvil quieto lo da bailando.
PASO_RUMBO = 10

#: id de perfil -> (lat, lon) de la última posición MANDADA (la que tiene el móvil).
_posiciones: dict[str, tuple[float, float]] = {}


def _metros(a: tuple[float, float], b: tuple[float, float]) -> float:
    dlat = (a[0] - b[0]) * 111_320.0
    dlon = (a[1] - b[1]) * 111_320.0 * math.cos(math.radians((a[0] + b[0]) / 2.0))
    return math.hypot(dlat, dlon)


def _posicion(perfil: dict):
    lat, lon = perfil.get("lat"), perfil.get("lon")
    if isinstance(lat, (int, float)) and isinstance(lon, (int, float)) and not isinstance(lat, bool):
        return (float(lat), float(lon))
    return None


def _huella(perfil: dict, enviada: tuple[float, float] | None = None) -> str:
    """Huella de lo que ve el móvil, sin el ruido (ver arriba). `enviada` = lo último que se le mandó de su posición."""
    limpio = {k: v for k, v in perfil.items() if k != "is_self"}
    visto = limpio.get("last_seen")
    if isinstance(visto, (int, float)) and not isinstance(visto, bool) and limpio.get("presence") == "live":
        limpio["last_seen"] = int(visto) // CUBO_LAST_SEEN_S
    rumbo = limpio.get("heading")
    if isinstance(rumbo, (int, float)) and not isinstance(rumbo, bool):
        limpio["heading"] = int(round(rumbo / PASO_RUMBO))
    ahora = _posicion(perfil)
    if ahora is not None and enviada is not None and _metros(ahora, enviada) < BANDA_MUERTA_M:
        limpio["lat"], limpio["lon"] = enviada
    crudo = json.dumps(limpio, sort_keys=True, separators=(",", ":"), default=str, ensure_ascii=False)
    return hashlib.sha1(crudo.encode("utf-8")).hexdigest()[:12]


def _json(valor) -> str:
    return json.dumps(valor, sort_keys=True, separators=(",", ":"), default=str, ensure_ascii=False)


def _anotar_campos(id_: str, perfil: dict, rev: int) -> None:
    """Campo a campo, lo que cambió (exacto) en este cambio del perfil: es lo que recibirá quien vaya por detrás."""
    campos = _campos.setdefault(id_, {})
    quitados = _quitados.setdefault(id_, {})
    for k, v in perfil.items():
        if k == "is_self":
            continue
        crudo = _json(v)
        if k not in campos or campos[k][0] != crudo:
            campos[k] = (crudo, rev, v)
        quitados.pop(k, None)
    for k in [k for k in campos if k not in perfil]:
        del campos[k]
        quitados[k] = rev


def _parcial(id_: str, desde: int) -> dict:
    """La entrada de `id_` con sólo lo que cambió después de `desde` (siempre con `user`)."""
    campos = _campos.get(id_, {})
    salida = {k: v for k, (_c, r, v) in campos.items() if r > desde}
    salida["user"] = campos["user"][2] if "user" in campos else id_
    fuera = sorted(k for k, r in _quitados.get(id_, {}).items() if r > desde)
    if fuera:
        salida["quitar"] = fuera
    return salida


def _entero(valor) -> int:
    try:
        return int(valor)
    except (TypeError, ValueError, OverflowError):
        return 0


def a_diferencias(profiles: list[dict], epoca=None, rev=None, campos=False) -> dict:
    """Los campos de diferencias de la tabla de equipo para quien dice llevar (`epoca`, `rev`).

    `profiles` es la tabla completa tal y como se mandaría (con `is_self`). Devuelve `{epoca, rev, completo,
    profiles, ids?}`; los perfiles van SIN `is_self` (el móvil lo recompone con su usuario). Con `campos`, además
    `campos: true` y cada perfil cambiado sólo con lo que cambió (ver arriba).
    """
    global _rev, _ids, _ids_rev
    ids = tuple(str(p.get("user")) for p in profiles)
    with _cerrojo:
        for p, id_ in zip(profiles, ids):
            h = _huella(p, _posiciones.get(id_))
            anterior = _perfiles.get(id_)
            if anterior is None or anterior[0] != h:
                _rev += 1
                # El móvil recibirá la entrada entera, con su posición de ahora: ésa es la que tiene desde aquí.
                pos = _posicion(p)
                if pos is None:
                    _posiciones.pop(id_, None)
                else:
                    _posiciones[id_] = pos
                # 24/11: la huella se guarda con ESA posición. Con la de antes (la banda muerta la había sustituido),
                # el latido siguiente ya no coincidía y un jugador parado volvía a viajar en cada latido, para siempre.
                _perfiles[id_] = (_huella(p, pos), _rev)
                if anterior is None:  # nuevo (o el estado se reinició): todos sus campos son nuevos
                    _campos.pop(id_, None)
                    _quitados.pop(id_, None)
                _anotar_campos(id_, p, _rev)
        for id_ in [k for k in _perfiles if k not in ids]:
            del _perfiles[id_]
            _posiciones.pop(id_, None)
            _campos.pop(id_, None)
            _quitados.pop(id_, None)
        if ids != _ids:
            _rev += 1
            _ids, _ids_rev = ids, _rev
        actual = _rev
        ids_rev = _ids_rev
        del_movil = _entero(rev)
        completo = epoca != EPOCA or del_movil <= 0 or del_movil > actual
        enviar = [
            _parcial(id_, del_movil) if campos and not completo else {k: v for k, v in p.items() if k != "is_self"}
            for p, id_ in zip(profiles, ids)
            if completo or _perfiles[id_][1] > del_movil
        ]
        salida = {"epoca": EPOCA, "rev": actual, "completo": completo, "profiles": enviar}
        if campos:
            salida["campos"] = True
        if not completo and ids_rev > del_movil:
            salida["ids"] = list(ids)
    return salida
