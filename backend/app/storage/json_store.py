"""Atomic JSON file storage helpers.

This module keeps the current JSON-file storage model safer while SAGA moves
toward a transactional storage backend.

It provides:
- tolerant JSON loading with defaults
- lock-file based write serialization
- temporary-file writes
- fsync before atomic replace
"""

from __future__ import annotations

import json
import os
import tempfile
import time
from typing import Any


def load_json(file: str, default: Any) -> Any:
    try:
        if not os.path.exists(file):
            return default

        with open(file, "r", encoding="utf-8") as f:
            content = f.read().strip()
            return json.loads(content) if content else default
    except Exception as e:
        print(f"Error cargando {file}: {e}")
        return default


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


def save_json(file: str, data: Any) -> None:
    lock = None
    tmp_path = None

    try:
        parent = os.path.dirname(file) or "."
        os.makedirs(parent, exist_ok=True)

        lock = _acquire_json_lock(file)

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

    except Exception as e:
        print(f"Error guardando {file}: {e}")
    finally:
        if tmp_path and os.path.exists(tmp_path):
            try:
                os.unlink(tmp_path)
            except OSError:
                pass

        _release_json_lock(lock)
