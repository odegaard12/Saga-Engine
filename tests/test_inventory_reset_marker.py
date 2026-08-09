# -*- coding: utf-8 -*-
"""El reset de la mochila tiene que sobrevivir a lo que suba el móvil.

Reproduce lo que pasó en la prueba de campo: se resetea a un jugador desde
administración y 18 segundos después su móvil —que todavía no se ha enterado—
sube la mochila de la partida anterior. Antes eso borraba la marca del reset y
devolvía las piezas, incluido el Sello ya forjado, dejando al jugador en el
nodo 1 con el final resuelto y sin forma de limpiarlo.
"""
import os
import tempfile
import time

# Antes de importar main: al importarse carga la configuración del despliegue.
os.environ.setdefault("ADMIN_PASS", "pytest_admin_password")
os.environ.setdefault("SAGA_DATA_DIR", tempfile.mkdtemp(prefix="saga-test-mochila-"))

import pytest  # noqa: E402

import main  # noqa: E402


@pytest.fixture
def mochila_limpia():
    original = main.load_inventory_state()
    yield
    main.save_json(main.INVENTORY_DB, original)


def _mochila_vieja(cuando_ms):
    marca = time.strftime('%Y-%m-%dT%H:%M:%S', time.gmtime(cuando_ms / 1000)) + 'Z'
    return {
        "user": "JUGADOR_TEST",
        "updated_at": marca,
        "items": [{"item_id": "sello", "label": "Sello", "quantity": 1}],
    }


def test_la_subida_vieja_del_movil_no_resucita_la_mochila(mochila_limpia):
    reset_ms = int(time.time() * 1000)
    main.save_player_inventory(
        "JUGADOR_TEST",
        {"user": "JUGADOR_TEST", "updated_at": "", "items": [], "reset_at": reset_ms},
    )

    # El móvil sube lo que tenía guardado de antes del reset.
    main.save_player_inventory("JUGADOR_TEST", _mochila_vieja(reset_ms - 60_000))

    guardado = main.load_inventory_state()["JUGADOR_TEST"]
    assert guardado["items"] == []
    assert guardado["reset_at"] == reset_ms


def test_la_marca_del_reset_sobrevive_a_una_subida_nueva(mochila_limpia):
    reset_ms = int(time.time() * 1000)
    main.save_player_inventory(
        "JUGADOR_TEST",
        {"user": "JUGADOR_TEST", "updated_at": "", "items": [], "reset_at": reset_ms},
    )

    # Ahora sí: el jugador recoge algo DESPUÉS del reset.
    main.save_player_inventory("JUGADOR_TEST", _mochila_vieja(reset_ms + 60_000))

    guardado = main.load_inventory_state()["JUGADOR_TEST"]
    assert len(guardado["items"]) == 1
    # La marca sigue ahí para que la lea cualquier otro dispositivo del jugador.
    assert guardado["reset_at"] == reset_ms


def test_un_segundo_reset_sustituye_la_marca(mochila_limpia):
    primero = int(time.time() * 1000)
    main.save_player_inventory(
        "JUGADOR_TEST",
        {"user": "JUGADOR_TEST", "updated_at": "", "items": [], "reset_at": primero},
    )
    # El jugador vuelve a jugar y sube cosas.
    main.save_player_inventory("JUGADOR_TEST", _mochila_vieja(primero + 60_000))

    # Segundo reset, más tarde.
    segundo = primero + 120_000
    main.save_player_inventory(
        "JUGADOR_TEST",
        {"user": "JUGADOR_TEST", "updated_at": "", "items": [], "reset_at": segundo},
    )

    guardado = main.load_inventory_state()["JUGADOR_TEST"]
    assert guardado["items"] == []
    # Si se quedase con la marca vieja, los móviles que ya pasaron el primer
    # reset no se enterarían de este.
    assert guardado["reset_at"] == segundo


def test_sin_reset_previo_se_guarda_tal_cual(mochila_limpia):
    main.save_player_inventory("JUGADOR_TEST", _mochila_vieja(int(time.time() * 1000)))

    guardado = main.load_inventory_state()["JUGADOR_TEST"]
    assert len(guardado["items"]) == 1
    assert "reset_at" not in guardado
