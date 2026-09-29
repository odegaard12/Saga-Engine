# -*- coding: utf-8 -*-
"""«Cuenta las señales» (owner-approved): game_id dentro de signal_hunt.

Juego de observación en el propio lugar: el jugador cuenta algo real que ve
desde el nodo (bancos, ventanas...) y teclea el número. El organizador
escribe 2-5 preguntas al recorrer la ruta; cada jugador recibe SOLO una,
siempre la misma, para que no se puedan pasar la respuesta entre ellos
(hash(player_id + node_id), igual que rumbo_doble reparte objetivos por
hash). Esto prueba, del lado servidor:

  - normalize_minigame_config guarda las 2-5 preguntas EN CLARO -es lo que
    edita el organizador en admin, nunca lo que recibe el jugador-.
  - project_cuenta_senales_for_player reparte una pregunta por jugador de
    forma determinista y estable, y SUSTITUYE la respuesta en claro por un
    hash salado: la respuesta nunca viaja en texto plano hacia el jugador.
  - la tolerancia (±) se traduce en varios hashes aceptables, no en una
    resta sobre el hash -un hash sólo compara igualdad exacta-.
  - catálogo / mapeo de familia de presentación / editor guiado incluyen
    cuenta_senales una vez, con su editor propio (no el bucle genérico).
  - normalizeAdminConfigForFamily (frontend) no tira `questions` -el mismo
    bug que tuvo rumbo_doble con `targets`-.
  - anti-trampas: SIN entrada propia en MINIGAME_HARD_FLOOR_MS_BY_GAME -se
    apoya en el suelo genérico de 2s, tal y como pide el enunciado-.
"""
import os
import re
import tempfile
from pathlib import Path

os.environ.setdefault("ADMIN_PASS", "pytest_admin_password")
os.environ.setdefault("SAGA_DATA_DIR", tempfile.mkdtemp(prefix="saga-test-cuenta-senales-"))

from backend.app.runtime.minigames import (  # noqa: E402
    normalize_minigame_config,
    hash_cuenta_senales_answer,
    pick_cuenta_senales_question_index,
    project_cuenta_senales_for_player,
    CUENTA_SENALES_MAX_ATTEMPTS,
    CUENTA_SENALES_PENALTY_MS,
)
from backend.app.runtime.core_engine import normalize_stage  # noqa: E402
from backend.app.runtime.mision import project_stage_for_player  # noqa: E402
from backend.app.runtime.anti_cheat import MINIGAME_HARD_FLOOR_MS_BY_GAME  # noqa: E402

RAIZ = Path(__file__).resolve().parent.parent
GAME_CATALOG = RAIZ / "frontend" / "src" / "admin" / "lib" / "gameCatalog.ts"
DISPLAY_FAMILIES = RAIZ / "frontend" / "src" / "admin" / "lib" / "displayFamilies.ts"
FAMILY_CONFIGS = RAIZ / "frontend" / "src" / "admin" / "lib" / "familyConfigs.ts"
GUIDED_UTILS = RAIZ / "frontend" / "src" / "admin" / "components" / "guided-editor" / "guidedEditorUtils.ts"
I18N_INDEX = RAIZ / "frontend" / "src" / "i18n" / "index.ts"


def leer(ruta: Path) -> str:
    return ruta.read_text(encoding="utf-8")


def _config_de_proba(preguntas=None):
    return normalize_minigame_config(
        "signal_hunt",
        {
            "game_id": "cuenta_senales",
            "questions": preguntas
            or [
                {"question": "¿Cuántos bancos hay?", "answer": 3, "tolerance": 0},
                {"question": "¿Cuántas ventanas hay?", "answer": 5, "tolerance": 1},
            ],
        },
    )


# ---------------------------------------------------------------------------
# normalize_minigame_config: preguntas en claro (vista del organizador)
# ---------------------------------------------------------------------------


def test_cuenta_senales_normaliza_preguntas_en_claro():
    config = _config_de_proba()
    assert config["game_id"] == "cuenta_senales"
    assert len(config["questions"]) == 2
    assert config["questions"][0]["answer"] == 3
    assert config["questions"][1]["tolerance"] == 1


def test_cuenta_senales_recorta_a_cinco_preguntas_como_moito():
    preguntas = [{"question": f"P{i}", "answer": i, "tolerance": 0} for i in range(8)]
    config = _config_de_proba(preguntas)
    assert len(config["questions"]) == 5


def test_cuenta_senales_con_menos_de_dous_preguntas_enche_ata_dous():
    config = _config_de_proba([{"question": "Única", "answer": 4, "tolerance": 0}])
    assert len(config["questions"]) >= 2

    config_vacio = normalize_minigame_config("signal_hunt", {"game_id": "cuenta_senales", "questions": []})
    assert len(config_vacio["questions"]) >= 2


def test_cuenta_senales_pregunta_sen_texto_descartase():
    config = _config_de_proba(
        [
            {"question": "", "answer": 9, "tolerance": 0},
            {"question": "¿Cuántos bancos hay?", "answer": 3, "tolerance": 0},
        ]
    )
    # A pregunta baleira descártase e recheouse ata o mínimo de 2.
    assert all(q["question"] for q in config["questions"])
    assert len(config["questions"]) >= 2


def test_bearing_hunt_ou_outros_game_id_de_signal_hunt_non_levan_questions():
    """mapa_mudo/team_relay/checkpoint normal non deben acabar con `questions`
    -é un campo só de cuenta_senales, igual que `targets` só é de rumbo_doble."""
    config = normalize_minigame_config("signal_hunt", {"game_id": "simple_checkpoint"})
    assert "questions" not in config


# ---------------------------------------------------------------------------
# Reparto por xogador e hash salado: a resposta nunca en claro
# ---------------------------------------------------------------------------


def test_pick_question_index_e_determinista():
    idx1 = pick_cuenta_senales_question_index("nodo1", "jugadorA", 3)
    idx2 = pick_cuenta_senales_question_index("nodo1", "jugadorA", 3)
    assert idx1 == idx2
    assert 0 <= idx1 < 3


def test_pick_question_index_reparte_entre_varios_xogadores():
    """Con varios jugadores debería haber al menos 2 índices distintos
    -si no, cualquiera podría pasar la respuesta al resto sin que se note."""
    jugadores = [f"jugador{i}" for i in range(12)]
    indices = {pick_cuenta_senales_question_index("nodoX", jugador, 3) for jugador in jugadores}
    assert len(indices) >= 2


def test_project_cuenta_senales_non_manda_resposta_en_claro():
    config = _config_de_proba()
    proyectado = project_cuenta_senales_for_player(config, "nodo1", "jugadorA")
    assert "questions" not in proyectado
    assert "answer" not in proyectado
    assert "answer_hashes" in proyectado
    assert isinstance(proyectado["answer_hashes"], list)
    assert len(proyectado["answer_hashes"]) >= 1
    assert proyectado["question"] in {"¿Cuántos bancos hay?", "¿Cuántas ventanas hay?"}


def test_project_cuenta_senales_solo_manda_a_pregunta_asignada():
    config = _config_de_proba()
    proyectado = project_cuenta_senales_for_player(config, "nodo1", "jugadorA")
    # Solo va UNA pregunta (string), nunca la lista completa de 2-5.
    assert isinstance(proyectado["question"], str)
    assert "questions" not in proyectado


def test_hash_salado_coincide_coa_resposta_correcta():
    config = _config_de_proba([{"question": "¿Cuántos?", "answer": 7, "tolerance": 0}])
    proyectado = project_cuenta_senales_for_player(config, "nodo1", "jugadorB")
    esperado = hash_cuenta_senales_answer(7, proyectado["salt"])
    assert esperado in proyectado["answer_hashes"]

    incorrecto = hash_cuenta_senales_answer(8, proyectado["salt"])
    assert incorrecto not in proyectado["answer_hashes"]


def test_tolerancia_xera_varios_hashes_aceptables():
    """Un hash só compara igualdade exacta -a tolerancia (±) traise hasheando
    CADA valor aceptable, non restando sobre o hash."""
    config = _config_de_proba([{"question": "¿Cuántos?", "answer": 10, "tolerance": 2}])
    proyectado = project_cuenta_senales_for_player(config, "nodo1", "jugadorC")
    aceptables = {hash_cuenta_senales_answer(v, proyectado["salt"]) for v in range(8, 13)}
    assert aceptables == set(proyectado["answer_hashes"])
    assert len(proyectado["answer_hashes"]) == 5


def test_salt_depende_do_nodo_e_do_indice_non_do_xogador():
    config = _config_de_proba()
    proyectado_a = project_cuenta_senales_for_player(config, "nodo1", "jugadorA")
    proyectado_z = project_cuenta_senales_for_player(config, "nodo1", "jugadorZ")
    # Si les tocó la misma pregunta, el salt (y por tanto los hashes) tiene
    # que ser idéntico -el salt depende del nodo+índice, no del jugador-.
    if proyectado_a["question"] == proyectado_z["question"]:
        assert proyectado_a["salt"] == proyectado_z["salt"]
        assert proyectado_a["answer_hashes"] == proyectado_z["answer_hashes"]


# ---------------------------------------------------------------------------
# project_stage_for_player: el nodo completo hacia el jugador
# ---------------------------------------------------------------------------


def _nodo_cuenta_senales():
    return {
        "id": "n1",
        "title": "Nodo de prueba",
        "lat": 42.0,
        "lon": -8.0,
        "require_proximity": True,
        "minigame": {
            "type": "signal_hunt",
            "config": {
                "game_id": "cuenta_senales",
                "questions": [
                    {"question": "¿Cuántos bancos hay?", "answer": 3, "tolerance": 0},
                    {"question": "¿Cuántas ventanas hay?", "answer": 5, "tolerance": 1},
                ],
            },
        },
    }


def test_proxeccion_do_stage_completo_non_leva_preguntas_en_claro():
    proyectado = project_stage_for_player(
        _nodo_cuenta_senales(), include_runtime=True, player_id="jugadorA"
    )
    assert "questions" not in proyectado["config"]
    assert "questions" not in proyectado["minigame"]["config"]
    assert "answer_hashes" in proyectado["minigame"]["config"]


def test_dous_xogadores_poden_recibir_preguntas_distintas():
    nodo = _nodo_cuenta_senales()
    proyectado_a = project_stage_for_player(nodo, include_runtime=True, player_id="prueba1")
    proyectado_b = project_stage_for_player(nodo, include_runtime=True, player_id="prueba2")
    # Non esixe que sexan distintas SEMPRE (só hai 2 preguntas e o hash pode
    # coincidir), pero ámbolos dous teñen que recibir unha pregunta válida
    # da lista do organizador.
    preguntas_orixe = {"¿Cuántos bancos hay?", "¿Cuántas ventanas hay?"}
    assert proyectado_a["minigame"]["config"]["question"] in preguntas_orixe
    assert proyectado_b["minigame"]["config"]["question"] in preguntas_orixe


def test_alias_resolve_via_normalize_stage_tipo_segue_sendo_signal_hunt():
    node = normalize_stage(_nodo_cuenta_senales())
    assert node["interaction"]["type"] == "signal_hunt"
    assert node["interaction"]["config"]["game_id"] == "cuenta_senales"
    assert len(node["interaction"]["config"]["questions"]) == 2


# ---------------------------------------------------------------------------
# Anti-trampas: SIN suelo propio, apóyase no xenérico (ver enunciado)
# ---------------------------------------------------------------------------


def test_cuenta_senales_non_ten_suelo_propio_adiviñado():
    assert "cuenta_senales" not in MINIGAME_HARD_FLOOR_MS_BY_GAME


def test_constantes_de_penalizacion_e_intentos():
    assert CUENTA_SENALES_MAX_ATTEMPTS == 3
    assert CUENTA_SENALES_PENALTY_MS == 30000


# ---------------------------------------------------------------------------
# Frontend: catálogo / familia de presentación / editor dedicado
# ---------------------------------------------------------------------------


def test_normalize_admin_config_for_family_conserva_questions():
    """Mesmo bug que tivo rumbo_doble con `targets`: a rama xenérica de
    signal_hunt en familyConfigs.ts devolvía SEMPRE 4 chaves fixas e tiraba
    calquera outra cousa. `questions` ten que sobrevivir."""
    codigo = leer(FAMILY_CONFIGS)
    assert "questions" in codigo
    assert "cuenta_senales" in codigo


def test_i18n_ten_cadeas_es_e_gl_para_cuenta_senales():
    codigo = leer(I18N_INDEX)
    assert codigo.count("cuentaSenales:") >= 3  # en + es + gl


# Las pruebas por subcadena de «el juego aparece en la lista X» (catálogo,
# familia de presentación, editor propio) se sustituyeron por la prueba
# parametrizada tests/test_registro_de_minijuegos.py (shared/game_registry.json).
