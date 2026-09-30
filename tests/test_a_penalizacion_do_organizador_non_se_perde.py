# -*- coding: utf-8 -*-
"""Caza de fallos del 30/09/2026, S5/A10: la penalización del organizador se perdía.

`set_player_progress_level(..., penalty_ms, desde_admin=True)` la guardaba como
tiempo del nodo `level` y, dos líneas después, el bloque «borrar los tiempos de
los nodos >= level» la borraba. Saltar un nodo desde el panel («+1 nodo»,
«Finalizar») no costaba nada. Además el importe se sacaba de `time_limit_ms`, un
campo que ningún nodo ha tenido nunca: siempre valía 300 000.
"""
import os
import tempfile

os.environ.setdefault("ADMIN_PASS", "pytest_admin_password")
os.environ.setdefault("SAGA_DATA_DIR", tempfile.mkdtemp(prefix="saga-test-penaliza-"))

from fastapi.testclient import TestClient  # noqa: E402

import main  # noqa: E402
from ruta_de_proba import preparar_mision  # noqa: E402

USUARIO = "PLAYER 1"
CINCO_MINUTOS = 300_000


def _cliente(monkeypatch, tmp_path):
    preparar_mision(monkeypatch, tmp_path)
    monkeypatch.setattr(main, "admin_request_authorized", lambda request, data: True)
    return TestClient(main.app)


def _accion(cliente, accion):
    resposta = cliente.post("/api/admin/profile-action", json={"profile_id": USUARIO, "action": accion})
    assert resposta.status_code == 200, resposta.text
    return resposta.json()


def test_a_penalizacion_desde_admin_suma_ao_tempo_total(monkeypatch, tmp_path):
    preparar_mision(monkeypatch, tmp_path)
    main.record_player_stage_time("Xogador Pen", 0, 60_000)

    main.set_player_progress_level("Xogador Pen", 2, CINCO_MINUTOS, desde_admin=True)

    # 60 s do nodo 0 + 5 min: o exemplo do informe (esperado 360 000, saía 60 000).
    assert main.get_player_total_time_ms("Xogador Pen") == 60_000 + CINCO_MINUTOS
    assert main.load_player_timers()["Xogador Pen"]["penalties_ms"] == CINCO_MINUTOS


def test_a_penalizacion_non_se_borra_ao_limpar_os_tempos_futuros(monkeypatch, tmp_path):
    preparar_mision(monkeypatch, tmp_path)
    main.record_player_stage_time("Xogador Pen2", 3, 40_000)  # un nodo por diante que se vai rehacer

    main.set_player_progress_level("Xogador Pen2", 2, CINCO_MINUTOS, desde_admin=True)

    tempos = main.load_player_timers()["Xogador Pen2"]
    assert "3" not in tempos["stage_times_ms"], "os tempos dos nodos >= nivel seguen limpándose"
    assert tempos["penalties_ms"] == CINCO_MINUTOS


def test_mais_un_nodo_do_panel_cobra_cinco_minutos(monkeypatch, tmp_path):
    cliente = _cliente(monkeypatch, tmp_path)
    main.record_player_stage_time(USUARIO, 0, 30_000)

    corpo = _accion(cliente, "level_next")

    assert corpo["level"] == 1
    assert main.get_player_total_time_ms(USUARIO) == 30_000 + CINCO_MINUTOS
    # O que xa estaba feito non se toca.
    assert main.load_player_timers()[USUARIO]["stage_times_ms"]["0"] == 30_000


def test_finalizar_cobra_unha_vez_e_non_de_novo_a_quen_xa_acabou(monkeypatch, tmp_path):
    cliente = _cliente(monkeypatch, tmp_path)

    _accion(cliente, "mark_finished")
    primeira = main.get_player_total_time_ms(USUARIO)
    _accion(cliente, "mark_finished")

    assert primeira == CINCO_MINUTOS
    assert main.get_player_total_time_ms(USUARIO) == primeira, "quen xa terminou non paga outros cinco minutos"


def test_retroceder_non_cobra_nada(monkeypatch, tmp_path):
    cliente = _cliente(monkeypatch, tmp_path)
    main.set_player_progress_level(USUARIO, 3)

    _accion(cliente, "level_prev")

    assert main.load_player_timers().get(USUARIO, {}).get("penalties_ms", 0) == 0


def test_reiniciar_ao_xogador_borra_as_penalizacions(monkeypatch, tmp_path):
    cliente = _cliente(monkeypatch, tmp_path)
    _accion(cliente, "level_next")
    assert main.load_player_timers()[USUARIO]["penalties_ms"] == CINCO_MINUTOS

    _accion(cliente, "reset_profile")

    assert main.load_player_timers()[USUARIO].get("penalties_ms", 0) == 0
    assert main.get_player_total_time_ms(USUARIO) == 0
