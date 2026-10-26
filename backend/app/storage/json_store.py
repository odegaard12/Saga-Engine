"""Atomic JSON file storage helpers.

This module keeps the current JSON-file storage model safer while SAGA moves
toward a transactional storage backend.

It provides:
- tolerant JSON loading with defaults
- lock-file based write serialization
- temporary-file writes
- fsync before atomic replace
- update_json() for locked read-modify-write flows
- no rewrite (and no fsync) when the value did not change
- orphan `.lock` recovery, and a lock timeout that is logged and raised

Caza de fallos del 30/09/2026 (S1, S7):

- `update_json` reescribía el fichero aunque el updater no cambiase nada, y lo
  llamaban en cada latido (`_reset_speed_streak`, `_set_manual_notice`): un
  fsync por móvil y cada cinco segundos para escribir lo mismo.
- Un `.lock` huérfano (corte de luz, `docker kill`) bloqueaba el bucle diez
  segundos en CADA escritura, y el `TimeoutError` se tragaba: anti_cheat,
  game_timers e inventory dejaban de guardarse sin que nadie lo supiera.
"""

from __future__ import annotations

import json
import logging
import os
import shutil
import tempfile
import threading
import time
from typing import Any, Callable

_log = logging.getLogger("saga.storage")

#: Cuánto se espera un `.lock` ajeno antes de rendirse. Una lectura-escritura
#: dura milisegundos; cinco segundos es de sobra incluso en una SD lenta.
LOCK_TIMEOUT_S = 5.0
#: Un `.lock` más viejo que esto sin dueño conocido es de una escritura
#: interrumpida.
LOCK_STALE_S = 15.0
LOCK_POLL_S = 0.02
#: Un `.lock` con NUESTRO pid que este proceso no tiene cogido es de la vida anterior
#: si además tiene esta edad: una escritura dura milisegundos, así que dos segundos
#: sin dueño es un huérfano, y es lo bastante poco para recuperarlo en el primer
#: latido tras un reinicio. Con menos podría ser de OTRO proceso con el mismo pid
#: (dos contenedores solapándose en el mismo volumen: los dos son el pid 1).
LOCK_HUERFANO_PROPIO_S = 2.0
#: Los temporales `.<fichero>.<azar>.tmp` que dejó un corte a mitad de escritura.
TMP_STALE_S = 300.0

_ESTADO = threading.Lock()
#: Ficheros `.lock` que ESTE proceso tiene cogidos ahora mismo.
_COGIDOS: set[str] = set()
#: Un cerrojo en memoria por fichero: los hilos del proceso se ponen en cola
#: aquí, sin dar vueltas durmiendo sobre el fichero.
_CERROJOS: dict[str, threading.Lock] = {}

_FALLOS: dict[str, Any] = {"total": 0, "lock_timeouts": 0, "ultimo": None, "ultima_escritura_fallida": None}


class ErrorDeAlmacen(OSError):
    """No se pudo guardar (disco lleno, EIO, fichero ilegible): sube como 503.

    Auditoría 23/10: `save_json`/`update_json` registraban el error y devolvían
    el defecto, así que /api/advance contestaba «ok» sin haber guardado nada y
    el móvil no reintentaba. Ahora sube; main.py lo convierte en un 503 con
    `Retry-After`, igual que el `TimeoutError` del candado. Es un `OSError`
    para que quien ya se protegía de la E/S siga protegido igual.
    """


def storage_health() -> dict[str, Any]:
    """Cuántas escrituras han fallado desde que arrancó el proceso."""
    with _ESTADO:
        return dict(_FALLOS)


def _registrar_fallo(tipo: str, file: str, error: Exception | str) -> None:
    with _ESTADO:
        _FALLOS["total"] += 1
        if tipo == "lock_timeout":
            _FALLOS["lock_timeouts"] += 1
        _FALLOS["ultimo"] = {
            "tipo": tipo,
            "fichero": os.path.basename(str(file)),
            "error": str(error)[:200],
            "cuando": int(time.time()),
        }
        # Aparte del candado ocupado (pasa con carga y se cura solo): un dato que
        # no se pudo escribir. Lo mira /api/salud para avisar con un 503.
        if tipo != "lock_timeout":
            _FALLOS["ultima_escritura_fallida"] = _FALLOS["ultimo"]
    _log.error("almacen %s en %s: %s", tipo, file, error)


def _read_json_unlocked(file: str, default: Any) -> Any:
    try:
        if not os.path.exists(file):
            return default

        with open(file, "r", encoding="utf-8") as f:
            content = f.read().strip()
            return json.loads(content) if content else default
    except Exception as e:
        # Lectura SIN escritura: el defecto no pisa nada en disco, y lanzar aquí
        # tumbaría el arranque y cada GET que lee la configuración o los relojes.
        # Queda en el registro; quien vaya a ESCRIBIR sobre este fichero pasa por
        # `_leer_texto_y_valor`, que sí se niega (auditoría 23/10).
        _log.error("almacen: no se pudo leer %s (se usa el valor por defecto): %s", file, e)
        return default


def load_json(file: str, default: Any) -> Any:
    return _read_json_unlocked(file, default)


#: Copias `.corrupt-` ya hechas (ruta, tamaño, mtime): un fichero roto se copia
#: una vez, no en cada latido que intenta escribir sobre él.
_COPIAS_CORRUPTAS: set[tuple[str, int, int]] = set()


def _apartar_copia_corrupta(file: str) -> str | None:
    """Copia el fichero ilegible a `<nombre>.corrupt-<fecha>` para recuperarlo a mano."""
    try:
        st = os.stat(file)
        marca = (os.path.abspath(file), st.st_size, st.st_mtime_ns)
        with _ESTADO:
            if marca in _COPIAS_CORRUPTAS:
                return None
            _COPIAS_CORRUPTAS.add(marca)
        destino = f"{file}.corrupt-{time.strftime('%Y%m%d-%H%M%S')}"
        shutil.copy2(file, destino)
        return destino
    except OSError as e:
        _log.error("almacen: no se pudo apartar la copia de %s: %s", file, e)
        return None


def _leer_texto_y_valor(file: str, default: Any) -> tuple[str | None, Any]:
    """(texto del fichero tal cual está, valor decodificado o `default`).

    El texto es `None` si no había fichero: entonces hay que escribir sí o sí.

    Auditoría 23/10: antes CUALQUIER error de lectura (JSON roto, E/S,
    UnicodeDecodeError) daba también `default`, y `update_json` aplicaba el
    updater sobre ese `{}` y lo escribía: con un `game_timers.json` ilegible, la
    siguiente penalización de un jugador dejaba el fichero sólo con su entrada.
    Ahora «no existe» vale el defecto, pero «existe y no se puede leer» aparta
    una copia `.corrupt-<fecha>`, se registra y lanza `ErrorDeAlmacen` SIN
    escribir nada.
    """
    if not os.path.exists(file):
        return None, default
    try:
        with open(file, "r", encoding="utf-8") as f:
            texto = f.read()
        contenido = texto.strip()
        return texto, (json.loads(contenido) if contenido else default)
    except (OSError, ValueError) as e:  # ValueError cubre JSONDecodeError y UnicodeDecodeError
        copia = _apartar_copia_corrupta(file)
        nota = f" (copia en {os.path.basename(copia)})" if copia else ""
        _registrar_fallo("read_error", file, f"{e}{nota}")
        raise ErrorDeAlmacen(f"No se puede leer {file}; no se escribe encima: {e}") from e


#: Ficheros calientes que se guardan compactos (25/10, auditoría: `game_timers.json` se reescribe en cada avance y
#: con sangría ocupaba un 36 % más). El resto sigue legible a mano.
COMPACTOS = {"game_timers.json"}


def _volcar(data: Any, file: str = "") -> str:
    if os.path.basename(file) in COMPACTOS:
        return json.dumps(data, ensure_ascii=False, separators=(",", ":"))
    return json.dumps(data, indent=2, ensure_ascii=False)


def _json_lock_path(file: str) -> str:
    return f"{file}.lock"


def _cerrojo_en_memoria(clave: str) -> threading.Lock:
    with _ESTADO:
        cerrojo = _CERROJOS.get(clave)
        if cerrojo is None:
            cerrojo = _CERROJOS[clave] = threading.Lock()
        return cerrojo


def _pid_del_lock(lock_path: str) -> int | None:
    try:
        with open(lock_path, "r", encoding="utf-8") as f:
            return int(f.read().strip() or "0") or None
    except (OSError, ValueError):
        return None


def _es_huerfano(lock_path: str) -> bool:
    """¿Este `.lock` no lo tiene nadie?

    Quien llama YA tiene el cerrojo en memoria de este fichero, así que ningún
    otro hilo del proceso lo está usando: si el `.lock` existe lo tiene otro
    proceso... o nadie. Es huérfano si

    - lo escribió nuestro propio pid: en Docker el pid se repite tras cada
      reinicio (el proceso vuelve a ser el 1), así que un `.lock` con NUESTRO pid
      que este proceso no tiene cogido, y que lleva más de `LOCK_HUERFANO_PROPIO_S`
      segundos, es de la vida anterior; o
    - lleva más de `LOCK_STALE_S` segundos.
    """
    try:
        edad = time.time() - os.path.getmtime(lock_path)
    except OSError:
        return False  # ya no está: que el bucle reintente

    if (
        edad > LOCK_HUERFANO_PROPIO_S
        and _pid_del_lock(lock_path) == os.getpid()
        and os.path.abspath(lock_path) not in _COGIDOS
    ):
        return True
    return edad > LOCK_STALE_S


def _acquire_json_lock(file: str, timeout: float = LOCK_TIMEOUT_S):
    lock_path = _json_lock_path(file)
    clave = os.path.abspath(lock_path)
    cerrojo = _cerrojo_en_memoria(clave)

    os.makedirs(os.path.dirname(clave) or ".", exist_ok=True)

    if not cerrojo.acquire(timeout=timeout):
        raise TimeoutError(f"Timed out waiting for JSON lock: {lock_path}")

    limite = time.monotonic() + timeout
    try:
        while True:
            try:
                fd = os.open(lock_path, os.O_CREAT | os.O_EXCL | os.O_RDWR)
            except FileExistsError:
                if _es_huerfano(lock_path):
                    try:
                        os.unlink(lock_path)
                    except FileNotFoundError:
                        pass
                    continue

                if time.monotonic() >= limite:
                    raise TimeoutError(f"Timed out waiting for JSON lock: {lock_path}")

                time.sleep(LOCK_POLL_S)
                continue

            try:
                os.write(fd, str(os.getpid()).encode("utf-8"))
            except OSError:
                os.close(fd)
                try:
                    os.unlink(lock_path)
                except OSError:
                    pass
                raise
            with _ESTADO:
                _COGIDOS.add(clave)
            return fd, lock_path, clave, cerrojo
    except BaseException:
        cerrojo.release()
        raise


def _release_json_lock(lock) -> None:
    if not lock:
        return

    fd, lock_path, clave, cerrojo = lock

    try:
        try:
            os.close(fd)
        finally:
            try:
                os.unlink(lock_path)
            except FileNotFoundError:
                pass
    finally:
        with _ESTADO:
            _COGIDOS.discard(clave)
        cerrojo.release()


def _write_text_unlocked(file: str, texto: str) -> None:
    parent = os.path.dirname(file) or "."
    os.makedirs(parent, exist_ok=True)

    tmp_path = None
    try:
        base = os.path.basename(file) or "data.json"
        fd, tmp_path = tempfile.mkstemp(
            prefix=f".{base}.",
            suffix=".tmp",
            dir=parent,
        )

        with os.fdopen(fd, "w", encoding="utf-8") as f:
            f.write(texto)
            f.flush()
            os.fsync(f.fileno())

        # En Windows, `os.replace` da «Acceso denegado» si otro hilo tiene el
        # fichero abierto para leer justo en ese instante (en Linux no pasa).
        # Antes ese error se tragaba; desde que sube (23/10, «un error de
        # escritura no responde ok»), se notaba como fallo intermitente. Un
        # reintento corto basta: la lectura dura milisegundos.
        for intento in range(10):
            try:
                os.replace(tmp_path, file)
                break
            except PermissionError:
                if intento == 9:
                    raise
                time.sleep(0.02 * (intento + 1))
        tmp_path = None

        try:
            dir_fd = os.open(parent, os.O_RDONLY)
            try:
                os.fsync(dir_fd)
            finally:
                os.close(dir_fd)
        except OSError:
            pass

    finally:
        if tmp_path and os.path.exists(tmp_path):
            try:
                os.unlink(tmp_path)
            except OSError:
                pass


def _write_json_unlocked(file: str, data: Any) -> None:
    _write_text_unlocked(file, _volcar(data, file))


def _coger_lock_o_avisar(file: str):
    """El `.lock` del fichero, o `TimeoutError` (registrado y a la vista).

    Antes el `TimeoutError` se tragaba dentro de `save_json`/`update_json`:
    el dato simplemente no se guardaba y el servidor decía que sí. Ahora queda
    en el registro y sube hasta la ruta, que lo convierte en un 503.
    """
    try:
        return _acquire_json_lock(file)
    except TimeoutError as e:
        _registrar_fallo("lock_timeout", file, e)
        raise
    except OSError as e:
        # Disco lleno o de sólo lectura al crear el `.lock`: tampoco se puede
        # guardar, y se dice (antes devolvía None y la escritura se saltaba).
        _registrar_fallo("lock_error", file, e)
        raise ErrorDeAlmacen(f"No se puede guardar {file}: {e}") from e


def save_json(file: str, data: Any) -> None:
    lock = _coger_lock_o_avisar(file)

    try:
        texto = _volcar(data, file)
        if os.path.exists(file):
            try:
                with open(file, "r", encoding="utf-8") as f:
                    if f.read() == texto:
                        return  # mismo contenido: ni escritura ni fsync
            except OSError:
                pass
        _write_text_unlocked(file, texto)
    except Exception as e:
        # Sube (auditoría 23/10): tragárselo era contestar «ok» sin haber guardado.
        _registrar_fallo("write_error", file, e)
        if isinstance(e, OSError) and not isinstance(e, ErrorDeAlmacen):
            raise ErrorDeAlmacen(f"No se puede guardar {file}: {e}") from e
        raise
    finally:
        _release_json_lock(lock)


def update_json(file: str, default: Any, updater: Callable[[Any], Any]) -> Any:
    """Safely update a JSON file with one locked read-modify-write cycle.

    The updater receives the current decoded value and must return the next
    value to persist. This is safer than calling load_json() and save_json()
    separately for state mutations.

    Si el resultado es idéntico a lo que ya había en el fichero NO se escribe
    (ni fsync): el updater puede haber mutado `current` en sitio, así que la
    comparación es sobre el TEXTO ya serializado, no sobre los objetos.
    """

    lock = _coger_lock_o_avisar(file)

    try:
        # Si el fichero existe y no se puede leer, esto lanza sin escribir.
        texto_antes, current = _leer_texto_y_valor(file, default)
        next_value = updater(current)
        texto_despues = _volcar(next_value, file)
        if texto_antes is not None and texto_antes == texto_despues:
            return next_value
        _write_text_unlocked(file, texto_despues)
        return next_value
    except ErrorDeAlmacen:
        raise  # ya registrado al leer
    except Exception as e:
        # Sube (auditoría 23/10): devolver el defecto era decir que se guardó.
        _registrar_fallo("update_error", file, e)
        if isinstance(e, OSError):
            raise ErrorDeAlmacen(f"No se puede guardar {file}: {e}") from e
        raise
    finally:
        _release_json_lock(lock)


def clean_stale_locks(directory: str, edad_minima_s: float = 3.0) -> int:
    """Borra los `.lock` y los temporales viejos que dejó un corte.

    Sólo para el ARRANQUE del servidor: a esa hora nadie de este proceso puede
    tener un `.lock` cogido. Un `.lock` de menos de `edad_minima_s` segundos se
    respeta -una escritura dura milisegundos: si es tan reciente puede ser de otro
    proceso que comparte el directorio-. Devuelve cuántos ficheros quitó.
    """
    quitados = 0
    try:
        entradas = list(os.scandir(directory))
    except OSError:
        return 0

    ahora = time.time()
    for entrada in entradas:
        try:
            if not entrada.is_file(follow_symlinks=False):
                continue
            nombre = entrada.name
            if nombre.endswith(".lock"):
                if ahora - entrada.stat().st_mtime < edad_minima_s:
                    continue
                os.unlink(entrada.path)
                quitados += 1
            elif nombre.startswith(".") and nombre.endswith(".tmp"):
                if ahora - entrada.stat().st_mtime > TMP_STALE_S:
                    os.unlink(entrada.path)
                    quitados += 1
        except OSError:
            continue

    if quitados:
        _log.warning("arranque: %d ficheros .lock/.tmp huérfanos quitados de %s", quitados, directory)
    return quitados
