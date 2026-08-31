# -*- coding: utf-8 -*-
"""Cuarto paso bajando los símbolos de main.py (ver docs/plan-de-mejora.md,
«Deuda que no corre prisa» — tras el cronómetro en 4.9.41 y los perfiles en
4.9.42, ahora el latido y la posición en vivo). `resolve_known_player_profile`,
`aligerar_avatar`, `buscar_avatar_de`, `clear_live_position` y el resto del
bloque pasan a `backend/app/runtime/live_positions.py`.

`HEARTBEAT_LAST_SEEN_BY_KEY` tiene que seguir siendo el MISMO diccionario en
main.py y en el módulo nuevo -no una copia-: `game.py` lo muta directamente
como `main.HEARTBEAT_LAST_SEEN_BY_KEY[clave] = ahora`, y si main.py se
quedara con un diccionario aparte esa escritura dejaría de verse desde
`prune_heartbeat_rate_state`.
"""
import ast
import os
import tempfile
from pathlib import Path

# Antes de importar main: al importarse carga la configuracion y exige
# ADMIN_PASS, y sin esto iria a la base de datos real del despliegue.
os.environ.setdefault("ADMIN_PASS", "pytest_admin_password")
os.environ.setdefault("SAGA_DATA_DIR", tempfile.mkdtemp(prefix="saga-test-latido-"))

RAIZ = Path(__file__).resolve().parent.parent
MAIN = RAIZ / "main.py"
LIVE_POSITIONS = RAIZ / "backend" / "app" / "runtime" / "live_positions.py"

FUNCIONES_MOVIDAS = (
    "prune_heartbeat_rate_state",
    "normalize_heartbeat_gps_status",
    "normalize_heartbeat_source",
    "resolve_known_player_profile",
    "load_live_positions",
    "save_live_positions",
    "get_live_position",
    "upsert_live_position_for_user",
    "_hash_corto",
    "aligerar_avatar",
    "buscar_avatar_de",
    "clear_live_position",
)


def test_o_modulo_novo_ten_as_funcions():
    assert LIVE_POSITIONS.exists(), "falta backend/app/runtime/live_positions.py"
    arbol = ast.parse(LIVE_POSITIONS.read_text(encoding="utf-8"))
    nomes = {n.name for n in ast.walk(arbol) if isinstance(n, ast.FunctionDef)}
    for funcion in FUNCIONES_MOVIDAS:
        assert funcion in nomes, f"{funcion} no está en el módulo nuevo"


def test_main_delega_sen_repetir_a_logica():
    texto = MAIN.read_text(encoding="utf-8")
    assert "from backend.app.runtime import live_positions as _live_positions" in texto

    arbol = ast.parse(texto)
    for funcion in FUNCIONES_MOVIDAS:
        definiciones = [
            n for n in ast.walk(arbol) if isinstance(n, ast.FunctionDef) and n.name == funcion
        ]
        assert len(definiciones) == 1, f"{funcion} debería declararse una sola vez en main.py"
        cuerpo_fuente = ast.get_source_segment(texto, definiciones[0])
        assert "_live_positions." in cuerpo_fuente, f"{funcion} en main.py no delega en el módulo nuevo"
        assert cuerpo_fuente.count("\n") <= 2, (
            f"{funcion} en main.py parece llevar lógica propia, no sólo delegar"
        )


def test_o_diccionario_do_latido_e_o_mesmo_obxecto():
    """game.py escribe en main.HEARTBEAT_LAST_SEEN_BY_KEY directamente: tiene
    que ser el MISMO dict que usa prune_heartbeat_rate_state por dentro, no
    una copia congelada en el momento del import."""
    import main
    from backend.app.runtime import live_positions

    assert main.HEARTBEAT_LAST_SEEN_BY_KEY is live_positions.HEARTBEAT_LAST_SEEN_BY_KEY

    main.HEARTBEAT_LAST_SEEN_BY_KEY["clave-de-prueba"] = 1.0
    try:
        assert live_positions.HEARTBEAT_LAST_SEEN_BY_KEY["clave-de-prueba"] == 1.0
        live_positions.prune_heartbeat_rate_state(1.0 + live_positions.HEARTBEAT_RATE_WINDOW_SECONDS + 1)
        assert "clave-de-prueba" not in main.HEARTBEAT_LAST_SEEN_BY_KEY
    finally:
        main.HEARTBEAT_LAST_SEEN_BY_KEY.pop("clave-de-prueba", None)
