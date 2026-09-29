# -*- coding: utf-8 -*-
"""Trampa de palabras: a explicación non viaxa en claro e cada fallo suma unha ronda.

Dúas debilidades pechadas:

  - A explicación de cada ronda ía en claro no paquete ANTES de contestar
    («a correcta é a B porque…»): lía en DevTools. Agora vai cifrada coa opción
    correcta como clave e só se abre despois de contestar. Mesmo nivel de defensa
    que o hash da resposta (catro claves posibles), non máis.
  - Quen le rápido acababa en menos dun minuto aínda que fallase, porque o fallo
    só custaba 30 s de penalización, non tempo de xogo. Agora cada fallo (ou
    pregunta sen contestar a tempo) suma unha ronda do banco, con tope.
"""
import json
import os
import tempfile

os.environ.setdefault("ADMIN_PASS", "pytest_admin_password")
os.environ.setdefault("SAGA_DATA_DIR", tempfile.mkdtemp(prefix="saga-test-trampa-cifrada-"))

from backend.app.runtime.core_engine import normalize_stage  # noqa: E402
from backend.app.runtime.minigames import (  # noqa: E402
    WORD_TRAP_MAX_EXTRA_ROUNDS,
    decrypt_word_trap_explanation,
    encrypt_word_trap_explanation,
    hash_word_trap_answer,
    project_word_trap_for_player,
    word_trap_server_rounds,
)
from backend.app.runtime.mision import project_stage_for_player  # noqa: E402
from ruta_de_proba import banco_de_trampa, ruta_de_seis_nodos  # noqa: E402


def _config(n_rounds=6, banco=10):
    return {"questions": banco_de_trampa(banco), "n_rounds": n_rounds, "time_limit_s": 12}


def test_a_explicacion_non_esta_en_claro_no_que_recibe_o_xogador():
    proxectado = project_word_trap_for_player(_config(), "nodo-x", "xogador")

    serializado = json.dumps(proxectado, ensure_ascii=False)
    assert "porque sí" not in serializado, "a explicación viaxa en claro no paquete"
    assert "La buena es la" not in serializado

    for ronda in proxectado["rounds"] + proxectado["extra_rounds"]:
        assert "explanation" not in ronda
        assert ronda["explanation_enc"], "cada ronda leva a súa explicación, cifrada"


def test_o_paquete_completo_do_nodo_tampouco_leva_a_explicacion_en_claro():
    """Ao pasar por project_stage_for_player (o que baixa o móbil), non só o helper."""
    nodo = project_stage_for_player(ruta_de_seis_nodos()[3], include_runtime=True, player_id="xogador")
    serializado = json.dumps(nodo, ensure_ascii=False)
    assert "porque sí" not in serializado
    assert "correct_index" not in serializado


def test_a_explicacion_so_se_abre_coa_opcion_correcta():
    salt = "nodo-x:3:0"
    cifrada = encrypt_word_trap_explanation("Es la C porque llueve", salt, 2)

    assert "llueve" not in cifrada
    assert decrypt_word_trap_explanation(cifrada, salt, 2) == "Es la C porque llueve"
    for equivocada in (0, 1, 3):
        assert decrypt_word_trap_explanation(cifrada, salt, equivocada) is None
    # Nin con outra ronda (outro salt) e a mesma opción.
    assert decrypt_word_trap_explanation(cifrada, "nodo-x:3:1", 2) is None


def test_a_explicacion_con_acentos_e_emojis_vai_e_volta():
    texto = "¿Qué ñoño? Niño, pingüino y camión ✅"
    assert decrypt_word_trap_explanation(encrypt_word_trap_explanation(texto, "s", 1), "s", 1) == texto


def test_unha_explicacion_baleira_non_xera_cifrado():
    assert encrypt_word_trap_explanation("", "s", 0) == ""


def test_o_hash_da_resposta_non_cambia():
    """O móbil vello comproba a resposta co mesmo hash de sempre."""
    proxectado = project_word_trap_for_player(_config(), "nodo-x", "xogador")
    servidor = word_trap_server_rounds(_config(), "nodo-x", "xogador")
    for publica, propia in zip(proxectado["rounds"], servidor):
        assert publica["answer_hash"] == hash_word_trap_answer(propia["correct_index"], propia["salt"])


def test_van_rondas_extra_para_cada_fallo_e_co_tope():
    proxectado = project_word_trap_for_player(_config(n_rounds=6, banco=10), "nodo-x", "xogador")

    assert len(proxectado["rounds"]) == 6
    assert len(proxectado["extra_rounds"]) == WORD_TRAP_MAX_EXTRA_ROUNDS

    # Ningunha ronda extra repite a pregunta dunha ronda base (banco de sobra).
    base = {ronda["question"] for ronda in proxectado["rounds"]}
    assert not base & {ronda["question"] for ronda in proxectado["extra_rounds"]}


def test_as_rondas_base_son_as_mesmas_de_antes_de_engadir_extras():
    """Móbil e servidor coinciden: as primeiras n_rounds non se moveron."""
    sen_extras = project_word_trap_for_player(_config(n_rounds=6), "nodo-x", "xogador")["rounds"]
    servidor = word_trap_server_rounds(_config(n_rounds=6), "nodo-x", "xogador")
    assert [r["question"] for r in sen_extras] == [r["question"] for r in servidor[:6]]


def test_co_banco_curto_as_extras_repiten_o_ciclo_sen_inventar_preguntas():
    proxectado = project_word_trap_for_player(_config(n_rounds=6, banco=4), "nodo-x", "xogador")
    todas = {ronda["question"] for ronda in proxectado["rounds"] + proxectado["extra_rounds"]}
    assert todas <= {f"Pregunta trampa {i}" for i in range(4)}


def test_o_nodo_normalizado_conserva_o_banco_para_que_o_servidor_revise():
    nodo = normalize_stage(ruta_de_seis_nodos()[3])
    assert len(nodo["interaction"]["config"]["questions"]) == 10
