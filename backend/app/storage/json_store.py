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

_FALLOS: dict[str, Any] = {"total": 0, "lock_timeouts": 0, "ultimo": None}


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
    _log.error("almacen %s en %s: %s", tipo, file, error)


def _read_json_unlocked(file: str, default: Any) -> Any:
    try:
        if not os.path.exists(file):
            return default

        with open(file, "r", encoding="utf-8") as f:
            content = f.read().strip()
            return json.loads(content) if content else default
    except Exception as e:
        print(f"Error cargando {file}: {e}")
        return default


def load_json(file: str, default: Any) -> Any:
    return _read_json_unlocked(file, default)


def _leer_texto_y_valor(file: str, default: Any) -> tuple[str | None, Any]:
    """(texto del fichero tal cual está, valor decodificado o `default`).

    El texto es `None` si no había fichero o no se pudo leer: entonces hay que
    escribir sí o sí.
    """
    try:
        if not os.path.exists(file):
            return None, default

        with open(file, "r", encoding="utf-8") as f:
            texto = f.read()
        contenido = texto.strip()
        return texto, (json.loads(contenido) if contenido else default)
    except Exception as e:
        print(f"Error cargando {file}: {e}")
        return None, default


def _volcar(data: Any) -> str:
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

        os.replace(tmp_path, file)
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
    _write_text_unlocked(file, _volcar(data))


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
    except Exception as e:
        _registrar_fallo("lock_error", file, e)
        print(f"Error guardando {file}: {e}")
        return None


def save_json(file: str, data: Any) -> None:
    lock = _coger_lock_o_avisar(file)
    if lock is None:
        return

    try:
        texto = _volcar(data)
        if os.path.exists(file):
            try:
                with open(file, "r", encoding="utf-8") as f:
                    if f.read() == texto:
                        return  # mismo contenido: ni escritura ni fsync
            except OSError:
                pass
        _write_text_unlocked(file, texto)
    except Exception as e:
        _registrar_fallo("write_error", file, e)
        print(f"Error guardando {file}: {e}")
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
    if lock is None:
        return default

    try:
        texto_antes, current = _leer_texto_y_valor(file, default)
        next_value = updater(current)
        texto_despues = _volcar(next_value)
        if texto_antes is not None and texto_antes == texto_despues:
            return next_value
        _write_text_unlocked(file, texto_despues)
        return next_value
    except Exception as e:
        _registrar_fallo("update_error", file, e)
        print(f"Error actualizando {file}: {e}")
        return default
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
