# -*- coding: utf-8 -*-
"""Sexto paso bajando los símbolos de main.py (ver docs/plan-de-mejora.md,
«Deuda que no corre prisa»). El resumen que ve el panel -un nodo o un
jugador, aplanados para la tabla de `react-overview`- pasa a
`backend/app/runtime/admin_overview.py` como `admin_stage_summary` y
`admin_profile_summary`; `main.py` se queda con los nombres viejos
(`_admin_react_stage_summary`, `_admin_react_profile_summary`) como
envoltorios de una línea, porque `backend/app/routers/admin.py` los llama
así.
"""
import ast
from pathlib import Path

RAIZ = Path(__file__).resolve().parent.parent
MAIN = RAIZ / "main.py"
ADMIN_OVERVIEW = RAIZ / "backend" / "app" / "runtime" / "admin_overview.py"


def test_o_modulo_novo_ten_as_funcions():
    assert ADMIN_OVERVIEW.exists(), "falta backend/app/runtime/admin_overview.py"
    arbol = ast.parse(ADMIN_OVERVIEW.read_text(encoding="utf-8"))
    nomes = {n.name for n in ast.walk(arbol) if isinstance(n, ast.FunctionDef)}
    assert "admin_stage_summary" in nomes
    assert "admin_profile_summary" in nomes


def test_main_delega_sen_repetir_a_logica():
    texto = MAIN.read_text(encoding="utf-8")
    assert "from backend.app.runtime import admin_overview as _admin_overview" in texto

    arbol = ast.parse(texto)
    correspondencia = {
        "_admin_react_stage_summary": "admin_stage_summary",
        "_admin_react_profile_summary": "admin_profile_summary",
    }
    for nome_en_main, nome_no_modulo in correspondencia.items():
        definiciones = [
            n for n in ast.walk(arbol) if isinstance(n, ast.FunctionDef) and n.name == nome_en_main
        ]
        assert len(definiciones) == 1, f"{nome_en_main} debería declararse una sola vez en main.py"
        cuerpo_fuente = ast.get_source_segment(texto, definiciones[0])
        assert f"_admin_overview.{nome_no_modulo}" in cuerpo_fuente
        assert cuerpo_fuente.count("\n") <= 1, (
            f"{nome_en_main} en main.py parece llevar lógica propia, no sólo delegar"
        )


def test_o_resumo_dun_nodo_conserva_a_forma_de_antes():
    from backend.app.runtime.admin_overview import admin_stage_summary

    nodo = {
        "id": "n1",
        "version": 2,
        "presentation": {"title": "Faro", "content": "Busca el faro"},
        "location": {"lat": 42.1, "lon": -8.8, "radius_m": 30},
        "entry": {"mode": "gps", "require_proximity": True},
        "interaction": {"type": "checkpoint", "config": {}},
        "messages": {"hint": "Mira al mar"},
    }
    resumo = admin_stage_summary(nodo, 0)
    assert resumo["id"] == "n1"
    assert resumo["title"] == "Faro"
    assert resumo["type"] == "checkpoint"
    assert resumo["lat"] == 42.1
    assert resumo["messages"]["hint"] == "Mira al mar"


def test_o_resumo_dun_xogador_conserva_a_forma_de_antes():
    from backend.app.runtime.admin_overview import admin_profile_summary

    perfil = {"id": "ALFA", "display_name": "ALFA", "mode": "solo", "status": "active"}
    gamestate = {"ALFA": {"level": 3, "finished": False}}
    positions = {"ALFA": {"lat": 42.0, "lon": -8.7, "presence": "here", "gps_status": "ok"}}

    resumo = admin_profile_summary(perfil, gamestate, positions)
    assert resumo["id"] == "ALFA"
    assert resumo["level"] == 3
    assert resumo["finished"] is False
    assert resumo["lat"] == 42.0
    assert resumo["gps_status"] == "ok"
