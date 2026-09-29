# -*- coding: utf-8 -*-
"""«Trampa de palabras» (owner-approved): sexta familia TÉCNICA nueva
`word_trap` (presentación admin: "Desafío"), no un game_id reutilizando una
de las 5 familias de siempre. Pedido explícito del organizador: los
minijuegos eran fáciles y demasiado cortos, y esta vez "que dure más de 1
minuto" -por eso son varias rondas (4-8) de preguntas trampa con 4 opciones
casi idénticas, en vez de una sola pregunta-.

Esto prueba, del lado servidor:

  - normalize_minigame_config produce `questions`/`n_rounds`/`time_limit_s`
    para word_trap/trampa_palabras, con los mismos topes admin-configurables
    que cuenta_senales/rumbo_doble (nunca un número adivinado).
  - project_word_trap_for_player reparte SOLO las rondas asignadas a cada
    jugador (de un banco potencialmente mayor), de forma determinista y
    estable, y sustituye `correct_index` por un hash salado -nunca en
    claro-.
  - el suelo de anti-trampas (_suelo_trampa_palabras) depende del nodo real
    (nº de rondas x segundos/pregunta), igual que el existente de
    sequence_code/rumbo_doble -no es un número adivinado, ver v5.34.0 en
    anti_cheat.py-.
  - la configuración por defecto (rondas x segundos/pregunta) supera
    claramente el minuto pedido por el organizador.
  - catálogo/mapeo de familia de presentación incluyen trampa_palabras una
    vez, y la familia técnica word_trap está cableada de punta a punta.
"""
import os
import re
import tempfile
from pathlib import Path

os.environ.setdefault("ADMIN_PASS", "pytest_admin_password")
os.environ.setdefault("SAGA_DATA_DIR", tempfile.mkdtemp(prefix="saga-test-trampa-palabras-"))

from backend.app.runtime.minigames import (  # noqa: E402
    normalize_minigame_config,
    project_word_trap_for_player,
    pick_word_trap_bank_indices,
    hash_word_trap_answer,
    WORD_TRAP_DEFAULT_ROUNDS,
    WORD_TRAP_DEFAULT_TIME_LIMIT_S,
    WORD_TRAP_MIN_BANK_QUESTIONS,
)
from backend.app.runtime.core_engine import normalize_stage  # noqa: E402
from backend.app.runtime.anti_cheat import (  # noqa: E402
    MIN_PLAUSIBLE_STAGE_MS,
    MINIGAME_HARD_FLOOR_MS_BY_GAME,
    _umbral_fisico_ms,
)

RAIZ = Path(__file__).resolve().parent.parent
GAME_CATALOG = RAIZ / "frontend" / "src" / "admin" / "lib" / "gameCatalog.ts"
DISPLAY_FAMILIES = RAIZ / "frontend" / "src" / "admin" / "lib" / "displayFamilies.ts"
FAMILY_CONFIGS = RAIZ / "frontend" / "src" / "admin" / "lib" / "familyConfigs.ts"
GUIDED_UTILS = RAIZ / "frontend" / "src" / "admin" / "components" / "guided-editor" / "guidedEditorUtils.ts"
RESOLVER = RAIZ / "frontend" / "src" / "player" / "minigames" / "core" / "resolver.ts"
FAMILY_RUNTIME_HOST = RAIZ / "frontend" / "src" / "player" / "minigames" / "core" / "FamilyRuntimeHost.tsx"
TYPES_TS = RAIZ / "frontend" / "src" / "player" / "minigames" / "core" / "types.ts"
ADMIN_GAME_EDITOR = RAIZ / "frontend" / "src" / "admin" / "components" / "AdminGameEditor.tsx"
ADMIN_PY = RAIZ / "backend" / "app" / "routers" / "admin.py"


def leer(ruta: Path) -> str:
    return ruta.read_text(encoding="utf-8")


def _banco_preguntas(n=8):
    return [
        {
            "question": f"Pregunta {i}",
            "options": ["A", "B", "C", "D"],
            "correct_index": i % 4,
            "explanation": f"explicación {i}",
        }
        for i in range(n)
    ]


# ---------------------------------------------------------------------------
# normalize_minigame_config / normalize_stage
# ---------------------------------------------------------------------------


def test_normaliza_banco_rondas_e_tempo_por_defecto():
    config = normalize_minigame_config("word_trap", {})
    assert config["game_id"] == "trampa_palabras"
    assert config["objective"] == "word_trap"
    assert config["n_rounds"] == WORD_TRAP_DEFAULT_ROUNDS
    assert config["time_limit_s"] == WORD_TRAP_DEFAULT_TIME_LIMIT_S
    assert len(config["questions"]) == WORD_TRAP_MIN_BANK_QUESTIONS


def test_normaliza_configuracion_escrita_polo_organizador():
    config = normalize_minigame_config(
        "word_trap",
        {
            "questions": _banco_preguntas(10),
            "n_rounds": 7,
            "time_limit_s": 8,
        },
    )
    assert config["n_rounds"] == 7
    assert config["time_limit_s"] == 8
    assert len(config["questions"]) == 10
    for pregunta in config["questions"]:
        assert len(pregunta["options"]) == 4
        assert 0 <= pregunta["correct_index"] <= 3


def test_rondas_e_tempo_recortanse_aos_topes_admin():
    config = normalize_minigame_config(
        "word_trap", {"questions": _banco_preguntas(), "n_rounds": 999, "time_limit_s": 999}
    )
    assert config["n_rounds"] <= 12
    assert config["time_limit_s"] <= 30

    config_baixo = normalize_minigame_config(
        "word_trap", {"questions": _banco_preguntas(), "n_rounds": 0, "time_limit_s": 0}
    )
    assert config_baixo["n_rounds"] >= 4
    assert config_baixo["time_limit_s"] >= 4


def test_banco_curto_enchese_ata_o_minimo():
    config = normalize_minigame_config("word_trap", {"questions": [{"question": "Só unha", "options": ["A", "B", "C", "D"], "correct_index": 0}]})
    assert len(config["questions"]) >= WORD_TRAP_MIN_BANK_QUESTIONS


def test_pregunta_sen_texto_descartase():
    config = normalize_minigame_config(
        "word_trap",
        {"questions": [{"question": "", "options": ["A", "B", "C", "D"], "correct_index": 0}] * 5},
    )
    for pregunta in config["questions"]:
        assert pregunta["question"].strip() != ""


def test_alias_resolve_via_normalize_stage_tipo_e_word_trap():
    node = normalize_stage(
        {
            "id": "n1",
            "title": "Nodo de prueba",
            "lat": 42.0,
            "lon": -8.0,
            "minigame": {
                "type": "word_trap",
                "config": {"questions": _banco_preguntas(), "n_rounds": 6, "time_limit_s": 12},
            },
        }
    )
    assert node["interaction"]["type"] == "word_trap"
    assert node["interaction"]["config"]["game_id"] == "trampa_palabras"


# ---------------------------------------------------------------------------
# Reparto por jugador / seguridad
# ---------------------------------------------------------------------------


def test_pick_bank_indices_e_determinista():
    a1 = pick_word_trap_bank_indices("nodo1", "jugadorA", 10, 6)
    a2 = pick_word_trap_bank_indices("nodo1", "jugadorA", 10, 6)
    assert a1 == a2
    assert len(a1) == 6
    assert len(set(a1)) == 6  # sen repetir dentro dunha partida cando o banco chega


def test_pick_bank_indices_reparte_entre_varios_xogadores():
    indices = {
        tuple(pick_word_trap_bank_indices("nodoX", jogador, 12, 6))
        for jogador in ("a", "b", "c", "d", "e")
    }
    assert len(indices) > 1


def test_pick_bank_indices_con_banco_menor_que_as_rondas_repite_o_ciclo():
    indices = pick_word_trap_bank_indices("nodo1", "jugadorA", 4, 6)
    assert len(indices) == 6
    assert set(indices) == {0, 1, 2, 3}


def test_project_non_manda_correct_index_en_claro():
    config = {"questions": _banco_preguntas(8), "n_rounds": 6, "time_limit_s": 12}
    proyectado = project_word_trap_for_player(config, "nodo1", "jugadorA")
    assert "questions" not in proyectado
    for ronda in proyectado["rounds"]:
        assert "correct_index" not in ronda
        assert set(ronda.keys()) == {"question", "options", "salt", "answer_hash", "explanation"}
        assert len(ronda["options"]) == 4


def test_project_manda_so_as_rondas_asignadas():
    config = {"questions": _banco_preguntas(10), "n_rounds": 6, "time_limit_s": 12}
    proyectado = project_word_trap_for_player(config, "nodo1", "jugadorA")
    assert len(proyectado["rounds"]) == 6
    assert proyectado["n_rounds"] == 6
    assert proyectado["time_limit_s"] == 12


def test_hash_salado_coincide_coa_opcion_correcta():
    config = {"questions": _banco_preguntas(8), "n_rounds": 6, "time_limit_s": 12}
    proyectado = project_word_trap_for_player(config, "nodo1", "jugadorB")
    ronda = proyectado["rounds"][0]
    # A opción correcta orixinal (dentro do banco) coincide co hash salado.
    bank_index = pick_word_trap_bank_indices("nodo1", "jugadorB", 8, 6)[0]
    correcto = bank_index % 4
    esperado = hash_word_trap_answer(correcto, ronda["salt"])
    assert esperado == ronda["answer_hash"]
    incorrecto = hash_word_trap_answer((correcto + 1) % 4, ronda["salt"])
    assert incorrecto != ronda["answer_hash"]


def test_reparto_e_estable_entre_chamadas_offline():
    config = {"questions": _banco_preguntas(10), "n_rounds": 6, "time_limit_s": 12}
    p1 = project_word_trap_for_player(config, "nodo1", "jugadorC")
    p2 = project_word_trap_for_player(config, "nodo1", "jugadorC")
    assert p1["rounds"] == p2["rounds"]


# ---------------------------------------------------------------------------
# Anti-trampas: suelo dinámico, non un número adivinado
# ---------------------------------------------------------------------------


def test_suelo_trampa_palabras_rexistrado():
    assert "trampa_palabras" in MINIGAME_HARD_FLOOR_MS_BY_GAME


def test_suelo_sae_da_config_real_do_nodo():
    node = {"interaction": {"type": "word_trap", "config": {"n_rounds": 6, "time_limit_s": 12}}}
    assert _umbral_fisico_ms("trampa_palabras", node) == 72000

    node_largo = {"interaction": {"type": "word_trap", "config": {"n_rounds": 8, "time_limit_s": 30}}}
    assert _umbral_fisico_ms("trampa_palabras", node_largo) == 240000


def test_suelo_nunca_baixa_do_minimo_plausible():
    node_vacio = {"interaction": {"type": "word_trap", "config": {}}}
    assert _umbral_fisico_ms("trampa_palabras", node_vacio) >= MIN_PLAUSIBLE_STAGE_MS


def test_duracion_por_defecto_supera_o_minuto_pedido():
    # Pedido explícito do organizador: "que dure más de 1 minuto".
    total_ms = WORD_TRAP_DEFAULT_ROUNDS * WORD_TRAP_DEFAULT_TIME_LIMIT_S * 1000
    assert total_ms > 60000, (
        f"a configuración por defecto ({WORD_TRAP_DEFAULT_ROUNDS} rondas x "
        f"{WORD_TRAP_DEFAULT_TIME_LIMIT_S}s) non supera o minuto pedido"
    )


# ---------------------------------------------------------------------------
# Cableado de familia técnica nova (frontend), de punta a punta
# ---------------------------------------------------------------------------


def test_types_ts_declara_a_familia_word_trap():
    codigo = leer(TYPES_TS)
    assert "'word_trap'" in codigo


def test_resolver_recoñece_word_trap_como_familia_nativa():
    codigo = leer(RESOLVER)
    assert "value === 'word_trap'" in codigo
    assert "resolveWordTrapNative" in codigo
    assert "ResolvedWordTrapMinigame" in codigo


def test_family_runtime_host_monta_o_runtime_de_word_trap():
    codigo = leer(FAMILY_RUNTIME_HOST)
    assert "WordTrapRuntimeScreen" in codigo
    assert "resolved.family === 'word_trap'" in codigo


def test_game_catalog_rexistra_trampa_palabras_unha_soa_vez():
    codigo = leer(GAME_CATALOG)
    aparicions = len(re.findall(r"^\s*id:\s*'trampa_palabras'", codigo, flags=re.MULTILINE))
    assert aparicions == 1
    assert "family: 'word_trap'" in codigo


def test_family_configs_ten_a_familia_word_trap_sen_clobber():
    codigo = leer(FAMILY_CONFIGS)
    assert "'word_trap'" in codigo
    # A rama de normalización ten que devolver `questions`, non perdelas
    # -mesmo bug que xa tocou arranxar en rumbo_doble/cuenta_senales-.
    inicio = codigo.index("if (type === 'word_trap') {", codigo.index("_normalizeAdminConfigForFamilyRaw"))
    fin = codigo.index("\n  }", inicio)
    bloque = codigo[inicio:fin]
    assert "questions" in bloque
    assert "n_rounds" in bloque
    assert "time_limit_s" in bloque


def test_display_families_ten_o_grupo_desafio():
    codigo = leer(DISPLAY_FAMILIES)
    assert "id: 'desafio'" in codigo
    assert "trampa_palabras: 'desafio'" in codigo


def test_guided_utils_ten_editor_dedicado_para_trampa_palabras():
    codigo = leer(GUIDED_UTILS)
    assert "'trampa_palabras'" in codigo


def test_admin_game_editor_monta_o_editor_dedicado():
    codigo = leer(ADMIN_GAME_EDITOR)
    assert "TrampaPalabrasEditor" in codigo
    assert "selectedGame.id === 'trampa_palabras'" in codigo


def test_backend_admin_rexistra_a_familia_word_trap():
    codigo = leer(ADMIN_PY)
    assert '"word_trap": 0' in codigo
    assert "desafio" in codigo
