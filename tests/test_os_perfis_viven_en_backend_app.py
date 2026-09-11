# -*- coding: utf-8 -*-
"""Segundo paso bajando los símbolos de main.py (ver
docs/plan-de-mejora.md, «Deuda que no corre prisa» — tras el cronómetro en
4.9.41, ahora los perfiles de jugador). `parse_player_entries`,
`normalize_player_profile`, `get_player_profiles`, `profile_matches_user` y
`get_player_profile` pasan a `backend/app/runtime/player_profiles.py`.

Ahí dentro `get_player_profiles`/`get_player_profile` piden `cfg`
obligatorio -no leen `load_config()` por su cuenta, para no tener que
importar main desde el módulo nuevo-. El envoltorio en main.py sigue
resolviendo `cfg = cfg or load_config()` antes de llamar, así que
`main.get_player_profile(user)` sin `cfg` sigue funcionando igual que
siempre para los routers que lo llaman así.
"""
import ast
from pathlib import Path

RAIZ = Path(__file__).resolve().parent.parent
MAIN = RAIZ / "main.py"
PLAYER_PROFILES = RAIZ / "backend" / "app" / "runtime" / "player_profiles.py"

FUNCIONES_MOVIDAS = (
    "parse_player_entries",
    "normalize_player_profile",
    "get_player_profiles",
    "profile_matches_user",
    "get_player_profile",
)


def test_o_modulo_novo_ten_as_funcions():
    assert PLAYER_PROFILES.exists(), "falta backend/app/runtime/player_profiles.py"
    arbol = ast.parse(PLAYER_PROFILES.read_text(encoding="utf-8"))
    nomes = {n.name for n in ast.walk(arbol) if isinstance(n, ast.FunctionDef)}
    for funcion in FUNCIONES_MOVIDAS:
        assert funcion in nomes, f"{funcion} no está en el módulo nuevo"


def test_main_delega_sen_repetir_a_logica():
    texto = MAIN.read_text(encoding="utf-8")
    assert "from backend.app.runtime import player_profiles as _player_profiles" in texto

    arbol = ast.parse(texto)
    for funcion in FUNCIONES_MOVIDAS:
        definiciones = [
            n for n in ast.walk(arbol) if isinstance(n, ast.FunctionDef) and n.name == funcion
        ]
        assert len(definiciones) == 1, f"{funcion} debería declararse una sola vez en main.py"
        cuerpo_fuente = ast.get_source_segment(texto, definiciones[0])
        assert "_player_profiles." in cuerpo_fuente, f"{funcion} en main.py no delega en el módulo nuevo"
        assert cuerpo_fuente.count("\n") <= 2, (
            f"{funcion} en main.py parece llevar lógica propia, no sólo delegar"
        )


def test_get_player_profile_segue_aceptando_cfg_opcional():
    """Los routers llaman a main.get_player_profile(user) sin cfg -tiene que
    seguir resolviendo load_config() por su cuenta como antes."""
    texto = MAIN.read_text(encoding="utf-8")
    inicio = texto.index("def get_player_profile(user, cfg=None):")
    cuerpo = texto[inicio : texto.index("\n\n", inicio)]
    assert "cfg or load_config()" in cuerpo
