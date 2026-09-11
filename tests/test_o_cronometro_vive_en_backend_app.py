# -*- coding: utf-8 -*-
"""main.py exponía 77 símbolos a los routers y se venía bajando de uno en
uno para romper el import circular (ver docs/plan-de-mejora.md, «Deuda que
no corre prisa»). El cronómetro y el progreso del jugador (`load_player_timers`,
`set_player_progress_level`, y el resto del bloque) se mueven a
`backend/app/runtime/player_timers.py`.

main.py se queda con envoltorios finos que pasan las rutas de fichero
(`TIMERS_DB`, `GAME_DB`) y llaman al módulo nuevo: la firma hacia fuera no
cambia -los sitios que hacen `import main` y llaman a
`main.load_player_timers()` sin argumentos siguen funcionando igual-, así
que esto no repite el fallo de las rutas duplicadas: no hay dos copias de
la lógica, sólo una copia y un envoltorio que llama a la única copia.
"""
import ast
from pathlib import Path

RAIZ = Path(__file__).resolve().parent.parent
MAIN = RAIZ / "main.py"
PLAYER_TIMERS = RAIZ / "backend" / "app" / "runtime" / "player_timers.py"

FUNCIONES_MOVIDAS = (
    "load_player_progress",
    "load_player_timers",
    "save_player_timers",
    "record_player_stage_time",
    "mark_player_started",
    "mark_player_finished",
    "add_player_penalty",
    "clear_all_player_timers",
    "clear_player_stage_time",
    "get_player_progress_level",
    "set_player_progress_level",
    "get_player_total_time_ms",
    "get_player_is_playing",
    "get_player_stage_time_ms",
)


def test_o_modulo_novo_existe_e_ten_as_funcions():
    assert PLAYER_TIMERS.exists(), "falta backend/app/runtime/player_timers.py"
    arbol = ast.parse(PLAYER_TIMERS.read_text(encoding="utf-8"))
    nomes = {n.name for n in ast.walk(arbol) if isinstance(n, ast.FunctionDef)}
    for funcion in FUNCIONES_MOVIDAS:
        assert funcion in nomes, f"{funcion} no está en el módulo nuevo"


def test_main_non_leva_dous_copias_da_mesma_logica():
    """El envoltorio en main.py tiene que llamar al módulo nuevo, no repetir
    su cuerpo -eso volvería a ser el fallo de las rutas duplicadas."""
    texto = MAIN.read_text(encoding="utf-8")
    assert "from backend.app.runtime import player_timers as _player_timers" in texto

    for funcion in FUNCIONES_MOVIDAS:
        arbol = ast.parse(texto)
        definiciones = [
            n
            for n in ast.walk(arbol)
            if isinstance(n, ast.FunctionDef) and n.name == funcion
        ]
        assert len(definiciones) == 1, f"{funcion} debería declararse una sola vez en main.py"
        cuerpo_fuente = ast.get_source_segment(texto, definiciones[0])
        assert "_player_timers." in cuerpo_fuente, (
            f"{funcion} en main.py no delega en el módulo nuevo"
        )
        assert cuerpo_fuente.count("\n") <= 3, (
            f"{funcion} en main.py parece llevar lógica propia, no sólo delegar"
        )
