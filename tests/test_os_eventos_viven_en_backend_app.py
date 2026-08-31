# -*- coding: utf-8 -*-
"""Quinto paso bajando los símbolos de main.py (ver docs/plan-de-mejora.md,
«Deuda que no corre prisa» — cronómetro en 4.9.41, perfiles en 4.9.42, latido
en 4.9.44, ahora la parte PURA de los eventos). `sanitize_event_text`,
`sanitize_event_payload`, `normalize_player_event` y `event_payload_code`
pasan a `backend/app/runtime/player_events.py`.

`apply_synced_player_event` y `find_existing_player_client_event` se quedan
en main.py a propósito: esas dos mutan el progreso de verdad y son la parte
más sensible de la sincronización offline -no la misma norma que ya se
siguió al no partir `set_player_progress_level` en player_timers.py-.
"""
import ast
from pathlib import Path

RAIZ = Path(__file__).resolve().parent.parent
MAIN = RAIZ / "main.py"
PLAYER_EVENTS = RAIZ / "backend" / "app" / "runtime" / "player_events.py"

FUNCIONES_MOVIDAS = (
    "sanitize_event_text",
    "sanitize_event_payload",
    "normalize_player_event",
    "event_payload_code",
)


def test_o_modulo_novo_ten_as_funcions():
    assert PLAYER_EVENTS.exists(), "falta backend/app/runtime/player_events.py"
    arbol = ast.parse(PLAYER_EVENTS.read_text(encoding="utf-8"))
    nomes = {n.name for n in ast.walk(arbol) if isinstance(n, ast.FunctionDef)}
    for funcion in FUNCIONES_MOVIDAS:
        assert funcion in nomes, f"{funcion} no está en el módulo nuevo"


def test_main_delega_sen_repetir_a_logica():
    texto = MAIN.read_text(encoding="utf-8")
    assert "from backend.app.runtime import player_events as _player_events" in texto

    arbol = ast.parse(texto)
    correspondencia = {
        "sanitize_event_text": "sanitize_event_text",
        "sanitize_event_payload": "sanitize_event_payload",
        "normalize_player_event": "normalize_player_event",
        "_event_payload_code": "event_payload_code",
    }
    for nome_en_main, nome_no_modulo in correspondencia.items():
        definiciones = [
            n for n in ast.walk(arbol) if isinstance(n, ast.FunctionDef) and n.name == nome_en_main
        ]
        assert len(definiciones) == 1, f"{nome_en_main} debería declararse una sola vez en main.py"
        cuerpo_fuente = ast.get_source_segment(texto, definiciones[0])
        assert f"_player_events.{nome_no_modulo}" in cuerpo_fuente, (
            f"{nome_en_main} en main.py no delega en el módulo nuevo"
        )
        assert cuerpo_fuente.count("\n") <= 2, (
            f"{nome_en_main} en main.py parece llevar lógica propia, no sólo delegar"
        )


def test_apply_synced_player_event_segue_en_main():
    """Lo que muta el progreso de verdad no se mueve: es la parte más
    sensible de la sincronización offline."""
    texto = MAIN.read_text(encoding="utf-8")
    assert "def apply_synced_player_event(" in texto
    assert "def find_existing_player_client_event(" in texto
