"""Atomic JSON file storage helpers.

This module keeps the current JSON-file storage model safer while SAGA moves
toward a transactional storage backend.

It provides:
- tolerant JSON loading with defaults
- lock-file based write serialization
- temporary-file writes
- fsync before atomic replace
- update_json() for locked read-modify-write flows
"""

from __future__ import annotations

import json
import os
import tempfile
import time
from typing import Any, Callable


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


def _json_lock_path(file: str) -> str:
    return f"{file}.lock"


def _acquire_json_lock(file: str, timeout: float = 10.0):
    lock_path = _json_lock_path(file)
    deadline = time.time() + timeout

    while True:
        try:
            fd = os.open(lock_path, os.O_CREAT | os.O_EXCL | os.O_RDWR)
            os.write(fd, str(os.getpid()).encode("utf-8"))
            return fd, lock_path
        except FileExistsError:
            try:
                # Recover stale locks from interrupted writes.
                if time.time() - os.path.getmtime(lock_path) > 30:
                    os.unlink(lock_path)
                    continue
            except FileNotFoundError:
                continue

            if time.time() >= deadline:
                raise TimeoutError(f"Timed out waiting for JSON lock: {lock_path}")

            time.sleep(0.05)


def _release_json_lock(lock) -> None:
    if not lock:
        return

    fd, lock_path = lock

    try:
        os.close(fd)
    finally:
        try:
            os.unlink(lock_path)
        except FileNotFoundError:
            pass


def _write_json_unlocked(file: str, data: Any) -> None:
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
            json.dump(data, f, indent=2, ensure_ascii=False)
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


def save_json(file: str, data: Any) -> None:
    lock = None

    try:
        lock = _acquire_json_lock(file)
        _write_json_unlocked(file, data)
    except Exception as e:
        print(f"Error guardando {file}: {e}")
    finally:
        _release_json_lock(lock)


def update_json(file: str, default: Any, updater: Callable[[Any], Any]) -> Any:
    """Safely update a JSON file with one locked read-modify-write cycle.

    The updater receives the current decoded value and must return the next
    value to persist. This is safer than calling load_json() and save_json()
    separately for state mutations.
    """

    lock = None

    try:
        lock = _acquire_json_lock(file)
        current = _read_json_unlocked(file, default)
        next_value = updater(current)
        _write_json_unlocked(file, next_value)
        return next_value
    except Exception as e:
        print(f"Error actualizando {file}: {e}")
        return default
    finally:
        _release_json_lock(lock)
