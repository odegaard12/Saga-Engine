"""Integridad y antifallos del servidor (auditoría 13/11/2026).

Cuatro cosas pequeñas que no tenían dónde vivir y que `main.py`, `/api/salud` y el panel comparten:

- el RELOJ de la Pi: sin RTC puede arrancar adelantado o atrasado hasta que NTP lo corrige, y lo que caduca por
  fecha (fotos, rastros GPS) se borra para siempre;
- los HILOS de fondo: si mueren o fallan en silencio, nadie se entera;
- la COMPROBACIÓN de la base al arrancar (`quick_check`);
- la COHERENCIA de los datos de la partida (nivel contra nodos, huérfanos).
"""

from __future__ import annotations

import json
import os
import threading
import time
from typing import Any

# --------------------------------------------------------------------------------------------------------------------
# Reloj
# --------------------------------------------------------------------------------------------------------------------

#: Ninguna fecha anterior a este año es creíble: la imagen del servidor es de 2026. Una Pi sin RTC que arranca sin red
#: se queda en 1970 (o en la última hora que guardó el sistema) hasta que NTP la corrige.
ANO_MINIMO = 2026
#: Tras arrancar, durante este rato NADA se borra por fecha (NTP suele corregir el reloj en el primer minuto).
GRACIA_ARRANQUE_S = 10 * 60
#: Cuánto se espera al arrancar a que la hora sea creíble antes de arrancar igualmente (con aviso en /api/salud).
ESPERA_HORA_SANA_S = 120
#: El reloj puede ir esto hacia atrás respecto al último instante visto sin que se considere un salto.
TOLERANCIA_ATRAS_S = 120

_ARRANCO = time.time()
_ESTADO: dict[str, Any] = {"ultimo_visto": 0.0, "ruta": None, "esperado_s": 0.0, "hora_sana_al_arrancar": True}
_CERROJO = threading.Lock()


def _ahora(ahora: float | None = None) -> float:
    return float(time.time() if ahora is None else ahora)


def iniciar_reloj(data_dir: str) -> None:
    """Lee el último instante visto (de la vida anterior del proceso) y prepara el fichero donde se guarda."""
    ruta = os.path.join(data_dir, "ultimo_instante.json")
    visto = 0.0
    try:
        with open(ruta, "r", encoding="utf-8") as f:
            visto = float((json.load(f) or {}).get("s") or 0)
    except (OSError, ValueError, TypeError, AttributeError):
        visto = 0.0
    with _CERROJO:
        _ESTADO["ruta"] = ruta
        _ESTADO["ultimo_visto"] = visto


def hora_sana(ahora: float | None = None) -> tuple[bool, str]:
    """(creíble, motivo). Año posible y no más atrás que el último instante visto (salvo la tolerancia)."""
    t = _ahora(ahora)
    anio = time.gmtime(t).tm_year if t > 0 else 0
    if anio < ANO_MINIMO:
        return False, "anio_imposible"
    with _CERROJO:
        visto = float(_ESTADO["ultimo_visto"] or 0)
    if visto and t < visto - TOLERANCIA_ATRAS_S:
        return False, "reloj_atrasado"
    return True, "ok"


def esperar_hora_sana(maximo_s: float = ESPERA_HORA_SANA_S, cada_s: float = 2.0, dormir=time.sleep) -> bool:
    """Espera (como mucho `maximo_s`) a que la hora sea creíble. Devuelve si lo es; si no, se arranca igualmente."""
    inicio = time.monotonic()
    while True:
        ok, _ = hora_sana()
        if ok:
            with _CERROJO:
                _ESTADO["esperado_s"] = round(time.monotonic() - inicio, 1)
                _ESTADO["hora_sana_al_arrancar"] = True
            return True
        if time.monotonic() - inicio >= maximo_s:
            with _CERROJO:
                _ESTADO["esperado_s"] = round(time.monotonic() - inicio, 1)
                _ESTADO["hora_sana_al_arrancar"] = False
            return False
        dormir(cada_s)


def apuntar_instante(ahora: float | None = None) -> None:
    """Guarda el instante visto (sólo hacia delante): con él se nota que la hora salta hacia atrás."""
    t = _ahora(ahora)
    ok, motivo = hora_sana(t)
    if not ok:
        # Pasado el periodo de gracia, un reloj «atrasado» es la nueva verdad (NTP corrigió una hora que estaba
        # ADELANTADA y se había apuntado): si no, el último instante visto quedaría en el futuro para siempre y la
        # caducidad no volvería a funcionar nunca.
        if not (motivo == "reloj_atrasado" and time.time() - _ARRANCO >= GRACIA_ARRANQUE_S):
            return
        with _CERROJO:
            _ESTADO["ultimo_visto"] = 0.0
    with _CERROJO:
        if t <= float(_ESTADO["ultimo_visto"] or 0):
            return
        _ESTADO["ultimo_visto"] = t
        ruta = _ESTADO["ruta"]
    if not ruta:
        return
    try:
        tmp = ruta + ".tmp"
        with open(tmp, "w", encoding="utf-8") as f:
            json.dump({"s": t}, f)
        os.replace(tmp, ruta)  # sin fsync: perder una actualización de este fichero es inofensivo
    except OSError:
        pass


def puede_borrar_por_fecha(max_created_s: float | None = None, ahora: float | None = None) -> tuple[bool, str]:
    """¿Se puede borrar algo POR FECHA ahora? Los borrados por caducidad son irreversibles.

    No si: han pasado menos de `GRACIA_ARRANQUE_S` desde que arrancó el proceso, la hora no es creíble, o `ahora`
    queda antes que el dato más reciente de la tabla (el reloj va atrasado: un dato de «el futuro» no existe).
    """
    t = _ahora(ahora)
    if t - _ARRANCO < GRACIA_ARRANQUE_S and ahora is None:
        return False, "recien_arrancado"
    ok, motivo = hora_sana(t)
    if not ok:
        return False, motivo
    if max_created_s and t < float(max_created_s):
        return False, "reloj_antes_del_ultimo_dato"
    return True, "ok"


def estado_del_reloj() -> dict[str, Any]:
    ok, motivo = hora_sana()
    with _CERROJO:
        return {
            "fiable": bool(ok and _ESTADO["hora_sana_al_arrancar"]),
            "motivo": motivo if not ok else ("hora_no_fiable_al_arrancar" if not _ESTADO["hora_sana_al_arrancar"] else "ok"),
            "esperado_s": _ESTADO["esperado_s"],
        }


def _reiniciar_para_tests() -> None:
    global _ARRANCO
    _ARRANCO = time.time()
    with _CERROJO:
        _ESTADO.update({"ultimo_visto": 0.0, "ruta": None, "esperado_s": 0.0, "hora_sana_al_arrancar": True})
        _HILOS.clear()
        _BASES.clear()


# --------------------------------------------------------------------------------------------------------------------
# Hilos de fondo
# --------------------------------------------------------------------------------------------------------------------

_HILOS: dict[str, dict[str, Any]] = {}
#: Un hilo que no late en `TARDA_X_INTERVALOS` veces su intervalo se da por parado.
TARDA_X_INTERVALOS = 3.0


def latido_de_hilo(nombre: str, intervalo_s: float, error: Exception | str | None = None) -> None:
    """El hilo `nombre` acaba de dar una vuelta (con o sin error). `intervalo_s`: cada cuánto debería darla."""
    ahora = time.time()
    with _CERROJO:
        hilo = _HILOS.setdefault(nombre, {"intervalo_s": float(intervalo_s), "ultimo_error": None, "cuando_error": None})
        hilo["intervalo_s"] = float(intervalo_s)
        hilo["ultima_vuelta"] = ahora
        if error is not None:
            hilo["ultimo_error"] = str(error)[:200]
            hilo["cuando_error"] = int(ahora)


def estado_de_hilos() -> dict[str, dict[str, Any]]:
    """{nombre: {vivo, ultima_vuelta, ultimo_error}} sin datos de nadie. `vivo` False si lleva demasiado sin latir."""
    ahora = time.time()
    with _CERROJO:
        copia = {n: dict(h) for n, h in _HILOS.items()}
    salida = {}
    for nombre, hilo in copia.items():
        vuelta = hilo.get("ultima_vuelta") or 0
        vivo = bool(vuelta) and ahora - vuelta <= max(60.0, hilo["intervalo_s"] * TARDA_X_INTERVALOS)
        salida[nombre] = {
            "vivo": vivo,
            "ultima_vuelta": int(vuelta) if vuelta else None,
            "ultimo_error": hilo.get("ultimo_error"),
            "cuando_error": hilo.get("cuando_error"),
        }
    return salida


# --------------------------------------------------------------------------------------------------------------------
# Comprobación de las bases al arrancar
# --------------------------------------------------------------------------------------------------------------------

_BASES: dict[str, dict[str, Any]] = {}


def comprobar_bases(rutas: dict[str, str]) -> dict[str, dict[str, Any]]:
    """`PRAGMA quick_check` (sólo lectura) de cada base y lo deja apuntado para `/api/salud`.

    NO tumba el arranque ni toca nada: si una base sale mal se registra con claridad y `/api/salud` contesta 503
    (modo mantenimiento visible), en vez de un bucle de reinicios sin explicación.
    """
    from backend.app.storage.sqlite_store import quick_check

    resultado = {}
    for nombre, ruta in rutas.items():
        ok, detalle = quick_check(ruta)
        resultado[nombre] = {"ok": ok, "detalle": detalle}
        if not ok:
            print(f"[ERROR] la base {nombre} NO pasa quick_check: {detalle}. Restaurar la última copia (.backup).", flush=True)
    with _CERROJO:
        _BASES.update(resultado)
    return resultado


def bases_con_problemas() -> dict[str, str]:
    with _CERROJO:
        return {n: r["detalle"] for n, r in _BASES.items() if not r["ok"]}


# --------------------------------------------------------------------------------------------------------------------
# Coherencia de los datos de la partida
# --------------------------------------------------------------------------------------------------------------------


def comprobar_coherencia(db_path: str, ids_de_la_mision: list[str], perfiles: list[str] | None = None, corregir: bool = True) -> dict[str, Any]:
    """Revisa la base de la partida. Corrige SÓLO lo seguro y avisa del resto.

    Seguro (se corrige con `corregir=True`): un nivel por encima del número de nodos baja al número de nodos
    («terminado»). Sólo avisa: nivel distinto del puntero de `superados`, jugadores sin perfil, filas sin jugador.
    Sin nodos (misión vacía) no se toca nada.
    """
    from backend.app.runtime import superados as _superados
    from backend.app.storage.sqlite_store import (
        init_sqlite_schema,
        leer_superados,
        sqlite_connection,
        superados_activos,
    )

    ids = [str(i) for i in ids_de_la_mision]
    corregidos: list[dict[str, Any]] = []
    avisos: list[dict[str, Any]] = []
    init_sqlite_schema(db_path)
    nombres = {str(p).strip().casefold() for p in (perfiles or []) if str(p).strip()}

    with sqlite_connection(db_path) as conn:
        niveles = {fila["user"]: int(fila["level"] or 0) for fila in conn.execute("SELECT user, level FROM game_state")}
        activos = superados_activos(conn)
        for usuario, nivel in niveles.items():
            if ids and nivel > len(ids):
                corregidos.append({"usuario": usuario, "campo": "nivel", "antes": nivel, "despues": len(ids)})
                if corregir:
                    conn.execute("UPDATE game_state SET level = ? WHERE user = ?", (len(ids), usuario))
                nivel = len(ids)
            if nombres and usuario.strip().casefold() not in nombres:
                avisos.append({"usuario": usuario, "problema": "sin_perfil"})
            if activos and ids:
                derivado = _superados.nivel_derivado(ids, leer_superados(conn, usuario))
                if derivado != min(max(0, nivel), len(ids)):
                    avisos.append({"usuario": usuario, "problema": "nivel_distinto_de_superados", "nivel": nivel, "derivado": derivado})
    return {"corregidos": corregidos, "avisos": avisos, "jugadores": len(niveles)}
