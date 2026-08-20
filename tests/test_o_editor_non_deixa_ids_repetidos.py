# -*- coding: utf-8 -*-
"""Dos nodos no pueden compartir id.

El editor del panel ya asigna max+1 al crear (`adminStagePersistence.ts`), pero
el servidor no comprobaba nada: cualquier guardado con ids repetidos entraba.

Importa porque la identidad de un nodo se decide por su id, y con dos iguales se
mezclan las configuraciones al guardar: un nodo acaba con el minijuego de otro.
Ya pasó una vez y se arregló en el cliente; esto es la red por debajo, para que
no dependa de que el cliente siga portándose bien.
"""
import os
import tempfile

os.environ.setdefault("ADMIN_PASS", "pytest_admin_password")
os.environ.setdefault("SAGA_DATA_DIR", tempfile.mkdtemp(prefix="saga-test-ids-"))

from backend.app.runtime.mision import validate_stages  # noqa: E402


def nodo(id_):
    return {
        "id": id_,
        "title": f"Nodo {id_}",
        "lat": 42.36,
        "lon": -8.67,
        "radius": 50,
        "type": "checkpoint",
        "config": {"game_id": "simple_checkpoint"},
        "success": {"code": "OK"},
    }


def test_ids_repetidos_non_se_gardan():
    errores = validate_stages([nodo(0), nodo(0), nodo(1)])
    assert errores, "el servidor deja guardar dos nodos con el mismo id"
    assert any("id" in str(e.get("field", "")) for e in errores)


def test_ids_unicos_si_se_gardan():
    """La guardia no puede pasarse de lista y rechazar una misión buena."""
    assert validate_stages([nodo(0), nodo(1), nodo(2)]) == []
